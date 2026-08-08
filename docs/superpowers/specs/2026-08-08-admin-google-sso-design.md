# Admin Panel with Google SSO — Design Spec

## Context

New feature, not on the original production-readiness roadmap: an `/admin` area authenticated via Google SSO, restricted to a single allowlisted email (the app owner's), with a first-pass admin dashboard (system stats, user list, deactivate/reactivate). Explicitly requested "as secure as possible" — several choices below trade implementation simplicity for a smaller attack surface, deliberately diverging from the existing consumer-facing auth pattern where that tradeoff is worth it for an admin session specifically.

Scope, per discussion: system stats overview, user list (aggregate info only, no drill-down into any user's actual financial data — a deliberate privacy boundary, not an oversight), and deactivate/reactivate. Individual-user financial data viewing was explicitly considered and excluded.

Every technical claim below (library APIs, header behavior, error shapes) was verified against the actual package/docs during design, not written from memory — see the "Verified" notes inline.

## Why Google SSO instead of a password, and why no shared code with the existing auth

No password to guess, phish, or leak — Google handles the actual authentication; this app only ever sees a Google-issued, cryptographically verifiable claim about who signed in. The admin auth is **fully separate** from the existing `User`/JWT/`localStorage` system end to end: separate backend middleware, separate JWT secret, separate frontend context and routes, separate HTTP client. Two reasons: (1) admin compromise is much higher blast radius than one user's session, so it's worth holding to a stricter bar than the consumer app; (2) keeping the boundary structurally separate (not "a `User` row with an `isAdmin` flag reusing the same login") means there's no shared code path where a bug in one system can leak into the other.

## Google Cloud Console setup (external, needs you)

Create an OAuth 2.0 Client ID: Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth client ID → Application type **Web application**. Add Authorized JavaScript origins for `https://chronosfin-web.vercel.app`, `https://chronosfin.shannensaikia.in`, and `http://localhost:5173` (dev). No redirect URI needed and **no client secret is generated/used** — this flow only verifies a Google-issued ID token server-side using the public Client ID as the expected audience, never exchanges a code for tokens server-side. I'll ask you for the resulting Client ID when we get to implementation; it is not secret and is safe to embed in frontend code (that's how Google's own flow works — the ID is meant to be public, only the verification step matters).

## Schema change: `User.isActive`

`User` currently has no active/inactive flag (`Account` and `Goal` do, `User` doesn't). Add:

```prisma
model User {
  // ...existing fields...
  isActive Boolean @default(true)
}
```

New migration, additive only. `auth.controller.ts`'s `login` gains one check after password verification: if `!user.isActive`, `throw new ApiError(403, 'Account deactivated')`. This is safe to be specific about (not a generic "invalid credentials" message) because by this point in the flow the password has already been verified — telling the legitimate account holder their account is deactivated leaks nothing to an attacker who never gets past the password check.

## Backend: verifying the Google ID token

New dependency: `google-auth-library`. **Verified directly** (not from memory): `new OAuth2Client(clientId)`, then `await client.verifyIdToken({ idToken, audience: clientId })` returns a `LoginTicket`; `.getPayload()` returns `{ email, email_verified, iss, aud, exp, ... }`. Confirmed it throws a plain `Error` on a malformed/invalid token (tested with a garbage string: `Error: Wrong number of segments in token: ...`) — a single try/catch around the call is sufficient, no special error-type handling needed.

New file `backend/src/lib/googleAuth.ts`:

```typescript
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';

export const googleClient = new OAuth2Client(config.googleClientId);

export async function verifyGoogleIdToken(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });
  return ticket.getPayload();
}
```

`config/env.ts` gains a required `googleClientId` (`required('GOOGLE_CLIENT_ID')`) — required, not optional, since the admin feature can't function without it and there's no legitimate "unset" state the way `SENTRY_DSN` has.

## Backend: admin session — httpOnly cookie, separate secret, CSRF mitigation

`config/env.ts` gains `adminJwtSecret` (`required('ADMIN_JWT_SECRET')`) and `adminEmail` (`required('ADMIN_EMAIL')`) — both required, both distinct from the existing `jwtSecret`.

New `backend/src/controllers/admin/auth.controller.ts`:

- `googleLogin(req, res)`: reads `req.body.credential` (the raw Google ID token — `credential` matches the field name Google's own frontend callback uses, verified against current Google Identity Services docs, so the frontend/backend field name matches Google's own convention rather than an arbitrary one). Calls `verifyGoogleIdToken`. If it throws, or the payload is missing, or `payload.email_verified !== true`, or `payload.email?.toLowerCase() !== config.adminEmail.toLowerCase()` → `throw new ApiError(403, 'Not authorized')` (deliberately the same generic message for "invalid token" and "valid token, wrong email" — doesn't reveal which case occurred). On success: sign a short-lived (1 hour) JWT with `adminJwtSecret` containing `{ email: payload.email }`, set it as a cookie:

```typescript
res.cookie('admin_session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'none', // cross-site: frontend and backend are different domains
  maxAge: 60 * 60 * 1000,
});
```

  `sameSite: 'none'` is required because `chronosfin-web.vercel.app` (or the custom domain) and `chronosfin-api.vercel.app` are different origins — `Strict`/`Lax` cookies are never sent on cross-site requests at all, which would silently break the entire mechanism. This is the deliberate tradeoff mentioned in the design discussion: `SameSite=None` forfeits the CSRF protection `Strict` gives for free, so CSRF protection is added explicitly instead (next section) rather than relied on implicitly.

  **Cross-site cookie reliability across browsers is a genuine open question I couldn't fully resolve from documentation** (WebKit's own docs frame ITP around third-party *embedded* contexts, which wouldn't apply here; MDN's literal definition of "third-party cookie" is any domain mismatch, which would). Decision: ship as designed and verify empirically in the browser(s) actually used for admin access, rather than preemptively restructuring the deploy topology (e.g. same-origin via Vercel Rewrites) for a risk that isn't confirmed to apply to this setup. If real-browser testing during implementation shows the cookie isn't reliably sent/accepted, the fallback is exactly that same-origin restructuring — noted here so it's not a surprise if needed, not adopted preemptively.

  The actual `jwt.sign()` call, shown explicitly here (not left implicit) precisely because leaving it implicit is itself a real footgun — a `jwt.sign()` call *without* `expiresIn` produces a token that's cryptographically valid forever, with expiration enforced only by the browser honoring the cookie's `maxAge` (which anything with the raw token string, bypassing the cookie mechanism entirely, would ignore):

  ```typescript
  const token = jwt.sign({ email: payload.email }, config.adminJwtSecret, { expiresIn: '1h' });
  res.cookie('admin_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 60 * 60 * 1000,
  });
  ```

  This also requires one small change to the *existing* CORS setup in `server.ts`: `cors({ origin: (origin, callback) => {...} })` needs `credentials: true` added to that options object. Without it, the browser won't accept or send cross-origin cookies at all, regardless of `SameSite`/`Secure` — this isn't specific to the admin feature, it's a general browser requirement for any credentialed cross-origin request. The existing origin-matching logic (reflecting back the specific requesting origin rather than `*`) already satisfies the other prerequisite for credentialed CORS, so this is a one-line addition, not a redesign.
- `logout(req, res)`: `res.clearCookie('admin_session', ...)` with matching options.
- `me(req, res)`: returns `{ email: req.admin.email }` — requires `requireAdmin` middleware (below) to have already populated `req.admin`.

**Explicit CSRF mitigation** — new `backend/src/middleware/csrf.middleware.ts`, applied to **every** admin route, not just the state-changing ones:

```typescript
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!origin || !config.corsOrigins.includes(origin)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
```

Rejects any admin request whose `Origin` header isn't exactly one of the configured trusted frontend origins — a forged cross-site request (the classic CSRF scenario: a malicious page making the browser submit the admin's cookie automatically) won't carry a trusted `Origin`, since browsers set `Origin` based on the page making the request, not something a forging site can spoof.

**Why every route, not just mutations, and why this doesn't require touching the existing CORS wildcard:** `server.ts`'s main CORS middleware allows any `*.vercel.app` origin (a deliberate, pre-existing choice for the *consumer* app's own preview deployments, which don't use cookies, so a permissive origin check there doesn't expose credentialed actions the way it would here). Originally this middleware was only applied to the two mutating routes (`logout`, `updateUserStatus`), reasoning that `GET`s are read-only. That reasoning has a gap: since the main CORS middleware's wildcard would let an attacker-controlled `*.vercel.app` page's JS *read* a credentialed response (not just cause a side effect), an unprotected `GET /api/admin/stats`/`users` would leak that data to such a page, even though it can't cause any state change. Applying `requireTrustedOrigin` to the whole `/api/admin` router (including `GET`s and `/auth/google`) closes this precisely, without weakening the existing consumer-app CORS policy that serves a different, legitimate purpose.

## Backend: `requireAdmin` middleware

New `backend/src/middleware/adminAuth.middleware.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface AdminRequest extends Request {
  admin?: { email: string };
}

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.admin_session;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.adminJwtSecret) as { email: string };
    if (payload.email.toLowerCase() !== config.adminEmail.toLowerCase()) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    req.admin = { email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
}
```

The explicit re-check against `config.adminEmail` (not just "is this a validly-signed token") matters for one specific scenario: if `ADMIN_EMAIL` is ever rotated — most plausibly *because* the previous admin email/Google account was compromised — any already-issued token for the old email stays cryptographically valid until its own expiry regardless of the rotation. Re-checking on every request means rotating the env var revokes existing sessions immediately, not just new ones.

Requires the `cookie-parser` middleware (new dependency — `req.cookies` isn't populated by Express by default) added once in `server.ts`, before routes.

## Backend: admin routes

New `backend/src/routes/admin.routes.ts`, mounted at `/api/admin`. `requireTrustedOrigin` applies to the whole router (see the CSRF section above for why it now covers reads too, not just mutations):

```typescript
router.use(requireTrustedOrigin);

router.post('/auth/google', googleAuthLimiter, googleLogin);
router.post('/auth/logout', requireAdmin, logout);
router.get('/auth/me', requireAdmin, me);

router.get('/stats', requireAdmin, getStats);
router.get('/users', requireAdmin, getUsers);
router.patch('/users/:id/status', requireAdmin, updateUserStatus);
```

`googleAuthLimiter` (new, in `middleware/rateLimit.middleware.ts` alongside the existing login/register limiters): 10/15min/IP — this endpoint can't be brute-forced the way a password can (an attacker would need a valid Google-signed token for the exact admin email, i.e. would need to already control that Google account), but it still triggers a real cryptographic verification per call and shouldn't be floodable.

New `backend/src/controllers/admin/stats.controller.ts` — `getStats`: `Promise.all([prisma.user.count(), prisma.account.count(), prisma.transaction.count(), prisma.goal.count()])` plus signups-per-day for the last 30 days via `prisma.user.groupBy` (or a raw aggregation) on `createdAt`.

New `backend/src/controllers/admin/users.controller.ts`:
- `getUsers`: paginated (reusing the existing `utils/pagination.ts` helper — same `page`/`limit` convention as the rest of the API) list of `{ id, email, firstName, lastName, createdAt, isActive, _count: { accounts, transactions, goals } }` via Prisma's `include: { _count: { select: {...} } } }`. Never selects `password`.
- `updateUserStatus`: body `{ isActive: boolean }`, updates the target user, returns the updated (non-password) fields.

## Frontend: Google Identity Services integration

**Verified against current Google docs** (not written from memory): script tag `<script src="https://accounts.google.com/gsi/client" async></script>`, initialized via `google.accounts.id.initialize({ client_id, callback })`, rendered via `google.accounts.id.renderButton(element, options)`. The callback receives a response object whose ID token is in `response.credential` — this is why the backend reads `req.body.credential` (matching Google's own field name, not an arbitrary choice).

New `frontend/src/pages/admin/AdminLogin.tsx`: loads the GSI script (via a small `useEffect` + dynamic `<script>` injection, or a `<script>` tag in `index.html` gated to only matter on this route — injected dynamically is cleaner since it avoids loading Google's script for every regular user on every page), calls `initialize` with `import.meta.env.VITE_GOOGLE_CLIENT_ID` and a callback that POSTs `{ credential: response.credential }` to `/api/admin/auth/google` **via the same `adminApiClient` described below** (not a one-off raw `fetch` call — one HTTP client for every admin request, so `withCredentials` and error handling stay consistent), then renders the button via `renderButton`. No `google.accounts.id.prompt()` (the auto-triggering One Tap UI) — this is a single-admin tool, an explicit button click is more predictable than an auto-prompt.

## Frontend: admin auth state, routing, HTTP client

New `frontend/src/lib/adminApiClient.ts` — a **separate** axios instance from the existing `lib/apiClient.ts`, with `withCredentials: true` (sends the httpOnly cookie) and **no** Authorization-header interceptor (the existing one attaches the regular user's `localStorage` JWT — admin requests must never carry that, and regular requests must never carry the admin cookie's implicit credentials either, which `withCredentials` on a *separate* instance naturally ensures the regular `apiClient` doesn't do).

New `frontend/src/contexts/AdminAuthContext.tsx` + `frontend/src/hooks/useAdminAuth.ts` — parallel structure to the existing `AuthContext`/`useAuth`, but entirely separate state, calling `GET /api/admin/auth/me` on mount to check for an existing valid cookie session (can't check "is there a token" client-side the way the regular app does via `localStorage`, since the cookie is httpOnly and invisible to JS by design — the only way to know if you're logged in is to ask the backend).

New `frontend/src/components/admin/AdminRoute.tsx` — same shape as the existing `ProtectedRoute`, but checks `useAdminAuth()` instead of `useAuth()`, redirects to `/admin/login` if not authenticated.

New routes in `App.tsx`, outside the existing `PublicOnlyRoute`/`ProtectedRoute` tree entirely:

```typescript
<Route path="/admin/login" element={<AdminLogin />} />
<Route element={<AdminRoute />}>
  <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
  <Route path="/admin/dashboard" element={<AdminDashboard />} />
  <Route path="/admin/users" element={<AdminUsers />} />
</Route>
```

New `frontend/src/pages/admin/AdminDashboard.tsx` (stat cards: user/account/transaction/goal counts, a simple signups-over-time display) and `frontend/src/pages/admin/AdminUsers.tsx` (paginated table, email/name/join date/resource counts, an active/inactive toggle calling `PATCH /api/admin/users/:id/status`).

## Environment variables

| Var | Where | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | backend | Required. Verification audience. |
| `VITE_GOOGLE_CLIENT_ID` | frontend | Same value, public (Client IDs aren't secret). |
| `ADMIN_JWT_SECRET` | backend | Required. Distinct from `JWT_SECRET` — a leak of one doesn't compromise the other. |
| `ADMIN_EMAIL` | backend | Required. `shannen.saikia@gmail.com` — kept as an env var rather than hardcoded so it's not published in the open-source repo and is rotatable without a code change. |

## Explicitly out of scope

- Multiple admins / a real admin-user table — one hardcoded allowlisted email, matching what was asked for.
- Viewing any individual user's actual financial data — deliberately excluded per the scope discussion, not a gap.
- The general lack of a Content-Security-Policy on the frontend (it currently has none at all, unlike the backend's helmet-set CSP) — a real, separate hardening item, tracked as a new addition to `docs/PRODUCTION_READINESS.md` rather than folded into this task's scope. (A `Cross-Origin-Opener-Policy` fix was considered during design and dropped once verified unnecessary — COOP only applies to navigable documents/windows, and the backend's helmet-set COOP header, the only COOP in this app today, applies solely to API JSON responses, not to the frontend page hosting the sign-in button, which has no COOP header at all.)
- A cryptographic nonce on the Google ID token exchange, to protect against a token being replayed if intercepted in transit. Considered and deferred: the whole exchange is already over TLS (the same baseline every other credential in this app relies on, including the regular password login, which has no equivalent nonce either), and adding one means generating, threading through Google's `initialize()` config, and server-side-verifying a per-attempt value for a marginal improvement over what TLS already covers. Worth revisiting only if a concrete threat model emerges that TLS doesn't already address.

## Testing

- `backend/src/controllers/admin/__tests__/auth.controller.test.ts`: mocks `verifyGoogleIdToken` (`vi.spyOn` on the module, matching the established pattern of mocking only the one external-boundary call that can't reasonably run against the real thing) to return controlled payloads — valid admin email → cookie set with correct options (`httpOnly`, `secure`, `sameSite: 'none'`) *and* the signed token itself decodes with an `exp` claim consistent with the 1-hour lifetime (guards against a future edit accidentally dropping `expiresIn`, not just checking the cookie's own `maxAge`); valid token but non-admin email → `403`; `email_verified: false` → `403`; thrown error (invalid token) → `403`, same message as the wrong-email case.
- `backend/src/middleware/__tests__/adminAuth.middleware.test.ts`: valid signed cookie → `req.admin` populated, `next()` called; missing cookie → `401`; cookie signed with a different secret → `401`; validly-signed cookie whose email no longer matches `config.adminEmail` (simulating post-rotation) → `401`.
- `backend/src/middleware/__tests__/csrf.middleware.test.ts`: trusted `Origin` → `next()`; missing/untrusted `Origin` → `403`.
- `backend/src/controllers/admin/__tests__/users.controller.test.ts`: real test DB (matching this repo's convention) — pagination behavior (same shape as the existing `pagination.test.ts` coverage), `updateUserStatus` actually flips `isActive`, and a deactivated user's subsequent login attempt gets `403`.

## Verification plan

Same standard as the rest of this repo's recent work: `npm test`/`npm run build` for both apps, plus an actual headless-browser run of the real Google sign-in flow (as real as it can be made — Google's own OAuth consent screen can't be fully automated without a real Google account interactively consenting, so the browser-driven check covers everything up to that point: the button renders, the script loads without CSP/console errors, and the page correctly redirects post-auth) before calling this done.
