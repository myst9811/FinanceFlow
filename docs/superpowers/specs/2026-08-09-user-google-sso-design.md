# Google Sign-In for Regular Users — Design Spec

## Context

Revision 2. The first version of this spec auto-linked Google sign-ins to existing accounts purely by matching email address. On security review that was rejected as an account-takeover path: verified directly against Google's own backend-auth documentation, `email_verified: true` is not proof of stable long-term ownership for non-Workspace addresses — Google's own guidance is to key identity on `sub` (the token subject), not email, because a mailbox/domain can be reassigned to a new owner after the original account was created. The review also flagged a missing replay-protection nonce (confirmed real: `nonce` is a documented field in both Google's JS reference and the installed `google-auth-library`'s token type, and my design neither generated nor checked one) and that deactivated users' *already-issued* tokens keep working, since `authenticateToken` never checks `isActive` (confirmed by reading the middleware — true today, independent of this feature, since it shipped with the admin `isActive` work and the consumer JWT middleware was never updated for it).

Two further findings from that review — moving the session token out of `localStorage` into httpOnly cookies app-wide, and adopting Google Cross-Account Protection (RISC) — are real but out of scope here by decision: both are app-wide architectural changes that apply identically to today's password login, not specific to adding Google sign-in, and are tracked as separate future work rather than blocking this feature.

Still true from revision 1: additive (password login stays), no new required env vars beyond what admin SSO already configured, and `verifyGoogleIdToken`/`GOOGLE_CLIENT_ID` are reused as-is.

## Schema changes

```prisma
model User {
  // ...existing fields...
  password      String?
  googleSubject String?  @unique
}
```

Two additive migrations (or one, combined) — `password` optional as in revision 1, plus `googleSubject`, a nullable column with a unique index. Postgres unique indexes allow multiple `NULL`s (`NULL` isn't equal to `NULL`), so this doesn't constrain the many users who never link Google.

`googleSubject` is the `sub` claim from Google's ID token — a stable, non-reassignable per-Google-account identifier (confirmed via Google's backend-auth docs: "This ID is unique to each Google Account, making it suitable for use as a primary key during account lookup. Email is not a good choice because it can be changed by the user."). This is the join key for every Google-authenticated lookup in this design; email is never used to authenticate an existing account, only to detect collisions when creating a new one.

## Backend: nonce endpoint

New `GET /api/auth/nonce`, public, no rate limit needed beyond the existing global middleware (it does no DB work and returns a random value, not sensitive):

```typescript
// lib/googleNonceStore.ts
import { randomUUID } from 'crypto';

const NONCE_TTL_MS = 5 * 60 * 1000;
const pending = new Map<string, number>(); // nonce -> expiresAt

export function issueNonce(): string {
  const nonce = randomUUID();
  pending.set(nonce, Date.now() + NONCE_TTL_MS);
  return nonce;
}

export function consumeNonce(nonce: string | undefined): boolean {
  if (!nonce) return false;
  const expiresAt = pending.get(nonce);
  pending.delete(nonce); // single-use regardless of outcome
  return expiresAt !== undefined && expiresAt > Date.now();
}
```

In-memory, matching this codebase's existing precedent for ephemeral per-process security state (the rate limiter's in-memory store, explicitly accepted with a "revisit once deployed with multiple instances" note in `docs/superpowers/specs/2026-08-07-auth-security-design.md`) — same tradeoff, same deferred concern, not re-litigated here. `consumeNonce` deletes on lookup regardless of validity, so a nonce can never be checked twice even if the first check fails (no re-use via a failed-then-retried attempt).

`GET /api/auth/nonce` handler: `res.status(200).json({ nonce: issueNonce() })`.

`auth.routes.ts` gains all three new routes:

```typescript
router.get('/nonce', getGoogleNonce);
router.post('/google', googleAuthLimiter, googleLogin);
router.post('/google/link', authenticateToken, googleAuthLimiter, linkGoogleAccount);
```

## Backend: `POST /api/auth/google` (login/register)

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

  if (!payload || payload.email_verified !== true || !payload.email || !payload.sub) {
    throw new ApiError(403, 'Not authorized');
  }
  if (!consumeNonce(payload.nonce)) {
    throw new ApiError(403, 'Invalid or expired sign-in attempt');
  }

  let user = await prisma.user.findUnique({ where: { googleSubject: payload.sub } });

  if (!user) {
    const email = payload.email.toLowerCase();
    const emailCollision = await prisma.user.findUnique({ where: { email } });
    if (emailCollision) {
      throw new ApiError(409, 'An account with this email already exists. Log in and link Google from Settings.');
    }

    user = await prisma.user.create({
      data: {
        email,
        password: null,
        googleSubject: payload.sub,
        firstName: payload.given_name?.trim() || 'ChronosFin',
        lastName: payload.family_name?.trim() || 'User',
      },
    });
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account deactivated');
  }

  const jwtPayload: JwtPayload = { userId: user.id, email: user.email };
  const token = jwt.sign(jwtPayload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);

  res.status(200).json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    token,
  });
};
```

Returns `200` uniformly (revision 1 used `201` for the "created" case) — this endpoint no longer has a clean created-vs-existing distinction worth signaling via status code (a `sub` match, an email-collision creation-block, and a fresh signup are three different outcomes, not two), so it's treated as a plain "you are now authenticated" response like password `login`, not `register`.

Key differences from revision 1: lookup is by `googleSubject`, never by email, for an *existing* Google-linked account — so if a Google account's email changes after linking, the next sign-in still resolves to the same ChronosFin user (matched by `sub`), and the stored `email` on that `User` row is deliberately **not** overwritten from the token (it stays whatever it was — avoids a surprising side effect on the field password login also depends on, and avoids a new collision if the changed email happens to match a different existing user). An email collision against an unlinked account is a hard `409`, no session issued, no account mutation — the user must authenticate normally and link explicitly (next section). `payload.nonce` is required and single-use via `consumeNonce`.

## Backend: `POST /api/auth/google/link` (authenticated)

```typescript
router.post('/google/link', authenticateToken, googleAuthLimiter, linkGoogleAccount);
```

```typescript
export const linkGoogleAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const credential = req.body?.credential;
  if (!credential || !req.user) {
    throw new ApiError(400, 'Missing credential');
  }

  let payload;
  try {
    payload = await verifyGoogleIdToken(credential);
  } catch {
    throw new ApiError(403, 'Not authorized');
  }

  if (!payload || payload.email_verified !== true || !payload.sub) {
    throw new ApiError(403, 'Not authorized');
  }
  if (!consumeNonce(payload.nonce)) {
    throw new ApiError(403, 'Invalid or expired sign-in attempt');
  }

  const existingLink = await prisma.user.findUnique({ where: { googleSubject: payload.sub } });
  if (existingLink && existingLink.id !== req.user.userId) {
    throw new ApiError(409, 'This Google account is already linked to a different ChronosFin account');
  }

  await prisma.user.update({
    where: { id: req.user.userId },
    data: { googleSubject: payload.sub },
  });

  res.status(200).json({ linked: true });
};
```

Requires an active session (`authenticateToken`) — this is the only path that attaches a `googleSubject` to an account that didn't create it via Google in the first place, which is exactly the boundary the account-takeover fix depends on: nothing about *authenticating* can ever attach a new identity to an existing account, only an already-authenticated user acting on their own account can.

## Frontend: minimal Settings page

There is currently no functioning Settings page — `components/common/Header.tsx`'s "Settings" dropdown item is an inert `<button>` with no handler. This adds:

- `pages/Settings.tsx`: a route at `/settings` (added to the `ProtectedRoute` group in `App.tsx` next to `/dashboard` etc.), showing the user's name/email and either "Link your Google account" (renders `GoogleSignInButton`, calling the new `authService.linkGoogleAccount(credential)`) or "Google account linked" if `user.googleLinked` is already true.
- `Header.tsx`'s Settings button gets an `onClick` navigating to `/settings` (the only change to that file — the button existing but doing nothing today is fixed as a side effect, not expanded further).
- `GET /api/auth/me` gains `googleLinked: Boolean(user.googleSubject)` in its response (the raw `googleSubject` value itself is never sent to the frontend) — `getCurrentUser`'s `select` gains `googleSubject: true`, mapped to `googleLinked` in the response, matching `AuthResponse`'s existing user shape plus one field. `types/api.types.ts`'s `User` interface gains `googleLinked: boolean`.

## Frontend: sign-in flow

- `services/auth.service.ts` gains `getGoogleNonce()` (`GET /auth/nonce`), `loginWithGoogle(credential)` (`POST /auth/google`, stores token exactly like `login`/`register`), and `linkGoogleAccount(credential)` (`POST /auth/google/link`, authenticated via the existing bearer interceptor, no token storage since it doesn't return one).
- `lib/googleIdentity.ts` (new, shared): the GSI script-loading logic currently inlined in `AdminLogin.tsx` extracted verbatim — behavior-neutral refactor, `AdminLogin.tsx` changes only its import.
- `components/auth/GoogleSignInButton.tsx` (new): on mount, calls `getGoogleNonce()` **before** `google.accounts.id.initialize`, passing the returned value as `nonce`; on credential response, calls `onCredential(response.credential)`. Used by `Login.tsx`, `Register.tsx` (calling `loginWithGoogle`), and `Settings.tsx` (calling `linkGoogleAccount`) — same component, different callback per caller.
- `contexts/AuthContext.tsx` gains `loginWithGoogle`, same shape as `login`/`register`.

## Backend: `authenticateToken` now checks `isActive`

```typescript
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { isActive: true },
    });
    if (!user || !user.isActive) {
      res.status(403).json({ error: 'Account deactivated' });
      return;
    }

    req.user = { userId: decoded.userId, email: decoded.email };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    res.status(500).json({ error: 'Authentication error' });
  }
};
```

This is a real tradeoff, not a free fix: every authenticated request now does one extra indexed lookup (`id` is the primary key) instead of being a pure in-memory JWT check. Accepted deliberately — the alternative (deactivation not actually deactivating anyone already logged in) is worse for a financial app, and a single indexed point lookup per request is cheap. Applies to *all* users, password or Google-authenticated — this middleware doesn't know or care which method was used to log in, so the fix isn't Google-SSO-specific even though it was raised during this review.

## Deferred (not in this spec)

- **`localStorage` JWT storage.** Moving the consumer session token to httpOnly cookies would require CSRF protection and a same-origin (or `SameSite=None` + credentialed CORS) redesign of the whole `apiClient`/`AuthContext` flow — an app-wide change unrelated to *which* login method was used to obtain the token. Tracked as a future initiative, not blocking Google SSO.
- **Cross-Account Protection (Google RISC).** A separate webhook-receiver integration for Google's account-compromise/session-revocation signals. Real hardening for a financial app using Google as an IdP, but a distinct piece of infrastructure, not part of adding a login method.

## Error handling / edge cases

- **Nonce replay**: second use of the same nonce (whether by an attacker replaying a captured token, or a double-submitted form) → `consumeNonce` returns `false` on the second call (already deleted from the map on the first), so both `/google` and `/google/link` reject it with `403`.
- **Nonce expiry**: `NONCE_TTL_MS` (5 minutes) comfortably covers the real GSI flow (page load → click → Google popup → callback), while bounding how long a leaked, unused nonce stays exploitable.
- **Email collision, no subject match**: `409`, no account mutation, no session — exactly the case the account-takeover fix exists for.
- **Malformed/expired/invalid Google token**: unchanged from revision 1 — caught, `403 Not authorized`.
- **Race on `googleSubject` uniqueness** (two near-simultaneous first-time sign-ins somehow producing the same `sub`, or a link race): the `@unique` constraint at the database level is the actual backstop regardless of the application-level `findUnique` check above it — a losing concurrent `create`/`update` throws a Prisma unique-constraint error, surfaced as a generic `500` via the existing `errorHandler`. Same acknowledged gap class as `register`'s existing check-then-create race (noted in revision 1), not newly introduced.
- **Deactivated account, either auth method**: rejected at login (`403`) and now also at every subsequent request via `authenticateToken` (closes the gap this review found).

## Testing (backend; frontend has no automated test suite per project convention)

- New Google sign-in (unknown `sub`, unknown email) → creates a user with `googleSubject` set, `password: null`, `200` with a valid token.
- Same `sub`, second sign-in with a **different** email on the token (simulating the Google account's email having changed) → resolves to the *same* `User` row (same `id`), stored `email` unchanged, no duplicate created.
- Different `sub`, same email as an existing password account → `409`, no session, no mutation to the existing row.
- Nonce reused (call `/google` twice with the same nonce, second with a fresh valid Google-token mock) → second call `403`.
- Missing/mismatched `payload.nonce` → `403`.
- `email_verified: false` → `403`, no user created, nonce still consumed (prevents leaking a fresh nonce back for retry with a still-unverified email).
- `POST /google/link` without an existing session → `401` (via `authenticateToken`, unauthenticated).
- `POST /google/link` for a `sub` already linked to a different user → `409`, no mutation.
- `POST /google/link` success → subsequent `POST /google` sign-in with that same `sub` resolves to the linked account.
- Deactivation revokes an active session: log in (password or Google) → deactivate that user via the admin panel → retry a protected endpoint (e.g. `GET /api/auth/me`) with the *original* token → `403`, not `200`.
- Existing regular `login`: a Google-only user (`password: null`) attempting password login → `401 Invalid email or password`, not a `500` (unchanged from revision 1).
