# Google Sign-In for Regular Users — Design Spec

## Context

Adds Google Sign-In as an additional login/registration method for regular ChronosFin users (`/login`, `/register`), alongside the existing email/password system — not a replacement. This is deliberately **not** a repeat of the admin Google SSO work (`docs/superpowers/specs/2026-08-08-admin-google-sso-design.md`): that system is intentionally isolated (own JWT secret, own httpOnly cookie, own frontend context) because admin compromise is high-blast-radius and worth a stricter bar. Regular users already have an open-registration, JWT-in-localStorage system; this feature extends that same system with a second way to authenticate into it, not a parallel security tier.

Decisions from discussion: additive (password login stays); an existing password account signing in with Google on the same email auto-links (Google's `email_verified` claim makes this safe — it can't be spoofed by an unverified email); a brand-new Google sign-in creates an account immediately using the token's own name claims, no separate "complete your profile" step.

## What's reused vs. new

**Reused as-is, no duplication:**
- `lib/googleAuth.ts`'s `verifyGoogleIdToken` — already fully generic (verifies against `config.googleClientId`, returns the payload), not admin-specific despite being built during that work.
- `GOOGLE_CLIENT_ID` env var — same Google Cloud OAuth client for both surfaces. The client ID isn't a secret; verification only checks the token's audience matches it and that `email_verified` is true. No new env var needed, backend or frontend (`VITE_GOOGLE_CLIENT_ID` already exists in `admin.config.ts`).
- `middleware/rateLimit.middleware.ts`'s `googleAuthLimiter` (10 requests / 15 min) — already built for exactly this shape of endpoint (a Google-verified auth callback, different threat model than raw password brute-force, which is what `loginLimiter`'s tighter 5/15min is tuned for) and already used by `POST /api/admin/auth/google`. Reused verbatim for the new route, not duplicated.

**New:**
- One backend endpoint, one schema change, a few frontend additions described below.

## Schema change: `User.password` becomes optional

```prisma
model User {
  // ...existing fields...
  password  String?
}
```

New additive migration (`ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`) — safe, no data loss, matches the `isActive` migration's precedent (`20260808125552_add_user_isactive`) for how this project has been handling schema changes against production (see that migration's deploy notes for the `DIRECT_URL` env var needed to run it).

This changes the generated Prisma `User.password` type from `string` to `string | null`, which affects the **existing** `login` controller: `bcrypt.compare(password, user.password)` would throw if `user.password` is `null` (a Google-only account attempting password login). `login` gains a guard for this — checked alongside the existing "user not found" case, returning the same generic `401 Invalid email or password` rather than a 500, and without revealing that the account is Google-only (that distinction isn't information a password-guessing attacker should get for free).

## Backend: `POST /api/auth/google`

New route in `auth.routes.ts`, alongside the existing public `register`/`login`:

```typescript
router.post('/google', googleAuthLimiter, googleLogin);
```

New `googleLogin` function in `auth.controller.ts`, modeled on `admin/auth.controller.ts`'s `googleLogin` but issuing the **regular** JWT/response shape (not a cookie):

```typescript
export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  const credential = req.body?.credential;

  if (!credential) {
    throw new ApiError(400, 'Missing credential');
  }

  let payload;
  try {
    payload = await verifyGoogleIdToken(credential);
  } catch {
    throw new ApiError(403, 'Not authorized');
  }

  if (!payload || payload.email_verified !== true || !payload.email) {
    throw new ApiError(403, 'Not authorized');
  }

  const email = payload.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    if (!user.isActive) {
      throw new ApiError(403, 'Account deactivated');
    }
  } else {
    user = await prisma.user.create({
      data: {
        email,
        password: null,
        firstName: payload.given_name?.trim() || 'ChronosFin',
        lastName: payload.family_name?.trim() || 'User',
      },
    });
  }

  const jwtPayload: JwtPayload = { userId: user.id, email: user.email };
  const token = jwt.sign(jwtPayload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);

  const response: AuthResponse = {
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    token,
  };

  res.status(201).json(response);
};
```

Notes:
- `req.body?.credential` (not a bare destructure) — the same defensive fix applied to the admin controller after review caught a bodyless-request crash there; applied proactively here from the start.
- The `email_verified !== true` / missing-email check mirrors admin's own validation exactly (same library, same payload shape, same risk).
- Existing-user path re-checks `isActive`, matching password `login`'s behavior — a deactivated user can't get back in via either door.
- New-user path falls back to `'ChronosFin'`/`'User'` if Google's `given_name`/`family_name` claims are absent (both are optional per the token payload type) — `firstName`/`lastName` are `NOT NULL` columns today and this isn't the place to relax that; a generic fallback is fine since it's just a display name, editable later if the app ever grows a profile page.
- `res.status(201)` regardless of login-vs-signup: matches `register`'s status code for the "created" case, and there's no meaningful reason for the frontend to distinguish which happened — same as the recommended UX (one button, no visible branching).

## Frontend

**`services/auth.service.ts`** gains:

```typescript
async loginWithGoogle(credential: string): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/google', { credential });
  if (response.data.token) {
    localStorage.setItem(AUTH_TOKEN_KEY, response.data.token);
  }
  return response.data;
}
```

Identical pattern to `login`/`register` — same token storage, same `apiClient` (bearer-token interceptor, not the admin's separate cookie-based `adminApiClient`).

**`contexts/AuthContext.tsx`** gains a `loginWithGoogle` method alongside `login`/`register`, same shape (`await authService.loginWithGoogle(credential); setUser(response.user);`), added to the exposed context value and to `AuthContextType`.

**`lib/googleIdentity.ts`** (new, shared): the GSI script-loading logic currently inlined in `AdminLogin.tsx` (`loadGoogleIdentityScript`) gets extracted here verbatim — a behavior-neutral refactor, `AdminLogin.tsx` changes only its import, not its logic. Purely mechanical: nothing about loading `https://accounts.google.com/gsi/client` is admin-specific.

**`components/auth/GoogleSignInButton.tsx`** (new): renders the GSI button into a ref'd container, calling `onCredential(response.credential)` on success — same `window.google.accounts.id.initialize`/`renderButton` pattern as `AdminLogin.tsx`, using `import.meta.env.VITE_GOOGLE_CLIENT_ID` directly (same env var, no new config needed).

**`pages/Login.tsx`** and **`pages/Register.tsx`** both render `<GoogleSignInButton onCredential={handleGoogleCredential} />` below the existing form, where `handleGoogleCredential` calls `loginWithGoogle(credential)` then `navigate('/')` — same try/catch-and-show-error pattern each page already uses for its form submit, reusing the same `error` state.

## Error handling / edge cases

- **Malformed/expired/invalid Google token**: `verifyGoogleIdToken` throws, caught and converted to `403 Not authorized` — same as admin's handling, already confirmed (during that work) that `verifyIdToken` throws a plain `Error` on a garbage token, no special-case error types to handle.
- **Unverified email**: rejected with `403`, same message, before ever touching the database.
- **Race between two near-simultaneous Google sign-ins for a brand-new email** (e.g. a double-click): `prisma.user.create` would throw a unique-constraint violation on the second call since `email` is `@unique`. Not explicitly caught here — it surfaces as a generic 500 via the existing `errorHandler`, which is the same behavior `register`'s `existingUser` check already has a race-condition gap for today (checked-then-created, not atomic) — not a new problem introduced by this feature, and out of scope to fix incidentally here.
- **Deactivated account via Google**: explicit `403 Account deactivated`, matching password login exactly.

## Testing (backend; frontend has no automated test suite per project convention)

New `backend/src/controllers/__tests__/auth.controller.google.test.ts` (or appended to the existing `auth.controller.test.ts`), following this codebase's established pattern of mocking `verifyGoogleIdToken` via `vi.spyOn` (same technique as `admin/__tests__/auth.controller.test.ts`) and hitting the real test database for the Prisma calls:

- New email → creates a user with `password: null`, returns `201` with a valid token.
- Existing password-account email, `email_verified: true` → logs in without touching/checking the password, returns the existing user's id (proves auto-link, not a duplicate account).
- Existing but deactivated user → `403 Account deactivated`.
- `email_verified: false` → `403 Not authorized`, no user created.
- `verifyGoogleIdToken` rejecting (invalid token) → `403 Not authorized`.
- Missing `credential` / missing `req.body` → `400 Missing credential` (the two cases the admin controller's own test suite already covers for the same code shape).
- Existing regular `login` test suite gains one case: a Google-only user (`password: null`) attempting password login gets `401 Invalid email or password`, not a 500.
