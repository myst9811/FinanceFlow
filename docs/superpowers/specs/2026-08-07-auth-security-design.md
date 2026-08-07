# Auth Security (Rate Limiting + First-Pass Auth Tests) — Design Spec

## Context

This is the second item in the production-readiness push tracked in `docs/PRODUCTION_READINESS.md`, combining part of item #1 ("No rate limiting anywhere, especially `/api/auth/login` and `/api/auth/register` — currently brute-forceable") with a first slice of item #3 ("no tests for `auth.controller.ts`... the highest-risk surface"), per the agreed attack order: "Auth security (#1: rate limiting on `/api/auth/*`, plus a first pass at auth/authorization tests from #3)".

The first roadmap item, CI (`docs/superpowers/specs/2026-08-06-ci-pipeline-design.md`), is implemented but paused mid-rollout: the workflow is authored and pushed on `feature/ci-pipeline` (PR #8), but GitHub Actions jobs never get a hosted runner — traced to the account's Actions budget being capped at $0 with "Stop usage" enabled at `github.com/settings/billing/budgets`. The user does not want to spend money on Actions right now, so PR #8 stays open and unmerged, and this work proceeds without CI gating it (verification is manual: run the existing `npm test`/`npm run build` commands locally, same as every prior change in this repo before CI existed).

Explicitly out of scope for this item (deferred to later roadmap items or not planned at all): JWT revocation/refresh tokens, rate limiting on any route other than login/register, a shared/Redis-backed rate-limit store, and authorization tests for accounts/transactions/insights beyond the one goals example established here.

## Rate limiting

New dependency: `express-rate-limit` (added to `backend/package.json`). This fits the same "off-the-shelf middleware for cross-cutting concerns" pattern the backend already uses for `helmet`/`cors`/`morgan`, rather than hand-rolling counting logic in the style of `utils/validation.ts` — sliding/fixed-window rate limiting is exactly the kind of thing not worth reinventing when a small, well-tested dependency already does it correctly. A Redis-backed shared store was considered and rejected for now: the app isn't deployed anywhere yet (Neon/Vercel provisioning is a later roadmap item), so provisioning shared infrastructure ahead of that would be solving a problem that doesn't exist yet.

New file `backend/src/middleware/rateLimit.middleware.ts` exports two limiters, both using `express-rate-limit`'s default in-memory store:

- `loginLimiter` — `windowMs: 15 * 60 * 1000` (15 min), `max: 5`, keyed by IP (the library's default).
- `registerLimiter` — `windowMs: 60 * 60 * 1000` (1 hour), `max: 10`, keyed by IP.

Both are configured with a custom `handler` that responds `429` with `{ error: "Too many <login attempts|accounts created> from this IP, please try again later." }` — matching the `{ error: string }` shape every other endpoint in the app produces via `errorHandler` (`middleware/error.middleware.ts`), rather than `express-rate-limit`'s default plain-text body. `standardHeaders: true, legacyHeaders: false` so clients get `RateLimit-*` headers without the deprecated `X-RateLimit-*` ones.

Applied per-route (not via `router.use`, since only two of the auth routes need it) in `backend/src/routes/auth.routes.ts`:

```
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
```

`GET /api/auth/me` is left unlimited — it already requires a valid JWT via `authenticateToken`, so it isn't brute-forceable the same way a credentials endpoint is.

**Known limitation, documented rather than solved here:** the in-memory store's counters are per-process. That's correct for local dev, CI, and even a single warm Vercel Fluid Compute instance, but once this app actually has multiple warm instances in production, each gets its own counter, so the effective limit is looser than configured. This is the same category of issue as CI's now-paused rollout — infrastructure that only matters once the app is actually deployed — and should be revisited (e.g., with Upstash Redis, a Vercel Marketplace integration) as part of the "Deploy" roadmap item, not now.

## Tests

Two new files, both following this repo's existing convention of testing against a **real** Postgres test database with `beforeEach`/`afterEach` fixture lifecycle (see `backend/src/services/__tests__/goal.service.test.ts`) rather than mocking Prisma — the only new pattern introduced is a small hand-built mock `Response` object, since these are the first tests in the repo to exercise controller functions (which call `res.status()/res.json()`) rather than plain service functions. Both live under a new `backend/src/controllers/__tests__/` directory, mirroring the existing `services/__tests__/` layout.

Both files call controller functions **directly** (e.g. `await register(req, res)`) rather than going through HTTP via `supertest` — matching how every existing test in this repo works, and with the useful side effect that the rate limiters (wired up in `routes/auth.routes.ts`, never invoked when calling a controller function directly) don't interfere with test runs. `supertest` was considered and rejected: introducing an HTTP-integration-test paradigm is a bigger shift than this "first pass" item calls for, and would require reasoning about the just-added rate limiter inside the tests themselves.

### `backend/src/controllers/__tests__/auth.controller.test.ts`

Covers `register`, `login`, `getCurrentUser` from `backend/src/controllers/auth.controller.ts`:

- `register`: succeeds with valid input (asserts `res.status(201)`, response body has `user` + `token`, and the user actually exists in the DB afterward); rejects a duplicate email with `ApiError(409)`; rejects invalid input (e.g. a too-short password) with `ApiError(400)`.
- `login`: succeeds with correct credentials (asserts `res.status(200)` and a `token` in the response); rejects a wrong password with `ApiError(401, 'Invalid email or password')`; rejects an unknown email with the **same** `ApiError(401, 'Invalid email or password')` — locking in that the app doesn't leak which of the two failed.
- `getCurrentUser`: succeeds when `req.user` is set and the user exists; rejects with `ApiError(401)` when `req.user` is unset.

### `backend/src/controllers/__tests__/goal.controller.test.ts`

Covers only the cross-user authorization boundary in `backend/src/controllers/goal.controller.ts` (not full goal CRUD, which is out of scope here): creates two users and a goal owned by user A, then asserts that user B calling `getGoalById`, `updateGoal`, and `deleteGoal` with user A's goal ID each reject with `ApiError(404, 'Goal not found')` — not `403` — because the controller's `prisma.goal.findFirst({ where: { id, userId: req.user.userId } })` pattern deliberately returns nothing for another user's resource rather than revealing that it exists. This test exists to lock in that ownership-scoping pattern as a regression guard; extending the same style of test to accounts/transactions/insights is left for the later "backfill remaining tests" roadmap item, not done here.

## Error handling / failure modes

- Rate-limit rejections return `429` through the same `{ error: string }` shape as every other error response, so frontend error handling (`frontend/src/lib/apiClient.ts`'s response interceptor) doesn't need any change to display them sensibly.
- The rate limiters sit in front of the existing `validateRegisterInput`/`validateLoginInput` calls in the route chain (limiter middleware runs before the controller), so a client that's already being rate-limited never reaches validation or the database at all.
- No change to `errorHandler` itself — `express-rate-limit`'s custom `handler` writes the response directly rather than throwing, so it doesn't go through the `ApiError`/`errorHandler` path, which is why its response shape has to be configured to match that path's output by hand.

## Testing (verification)

Run `cd backend && npm test` (all existing tests plus the two new files) and `npm run build`. No CI gate for this yet (see Context) — this is manual verification, same as the rest of this repo's history before CI existed.
