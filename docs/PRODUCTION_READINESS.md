# Production Readiness Gaps

Snapshot of what's missing between the current codebase and a safe production launch, based on auditing the backend (`backend/src`), frontend (`frontend/src`), Prisma schema, and deploy plan (`docs/superpowers/specs/2026-07-23-vercel-serverless-adaptation-design.md`). Per that spec's roadmap, sub-projects 1–4 (insights, Vercel code prep, auth/routing, real data pages) are done; sub-project 5 (Docs & CI) and 6 (Deploy) are not started — this doc is the gap list for those two plus anything else found along the way.

Ordered roughly by blast radius if skipped, not by effort.

## 1. Security

- **No rate limiting anywhere**, especially `/api/auth/login` and `/api/auth/register` — currently brute-forceable. No `express-rate-limit` or equivalent in `backend/package.json`.
- **JWTs are stateless with no revocation path.** `JWT_EXPIRES_IN=7d` by default; there's no logout-side invalidation, token blacklist, or refresh-token rotation — a leaked token is valid for up to a week with no way to kill it server-side.
- **`helmet()` is called with no config** (`backend/src/server.ts:18`) — using its defaults only; no explicit CSP, HSTS tuning, etc. Fine as a baseline, but worth a deliberate pass once the frontend origin is fixed.
- No request body size limits configured on `express.json()` (`server.ts:43`) — default is 100kb, which is probably fine, but it's implicit rather than a decision.
- No centralized auth-error logging — failed logins, invalid tokens, and 403s go through `console.error` (or nowhere) with no way to detect credential-stuffing patterns in production.

## 2. Observability

- **Logging is `morgan('combined')` to stdout only** — no structured logging (no request IDs, no JSON format), no log aggregation target configured. Fine for `vercel logs` in a pinch, hard to query at any real volume.
- **No error tracking / APM** (e.g. Sentry) — uncaught exceptions in `errorHandler` (`middleware/error.middleware.ts:19`) only `console.error`, which on Vercel Fluid Compute means they're only visible by tailing function logs after the fact, with no alerting.
- **`/health` is a liveness check only** (`server.ts:51`) — it returns 200 without checking the database connection, so it can report healthy while Prisma can't reach Postgres.
- No metrics/dashboards for request latency, error rate, or DB query time.

## 3. Testing

- **Backend test coverage is narrow**: only `goal.service.test.ts`, `insight.service.test.ts`, and `transaction.service.test.ts` exist — all service-layer, all one concurrency test each. There are **no tests for**:
  - `auth.controller.ts` (register/login/getCurrentUser) — the highest-risk surface (password hashing, token issuance, duplicate-email handling).
  - `account.controller.ts` — no coverage at all.
  - Any controller's authorization boundary (i.e. a test proving user A can't read/update/delete user B's goal/account/transaction via `:id`).
  - `middleware/auth.middleware.ts` and `middleware/error.middleware.ts` directly.
  - `utils/validation.ts` — all the hand-written validators are untested despite being the only input-validation layer.
- **Frontend has zero tests** — no test runner is even installed (`frontend/package.json` has no Vitest/Jest/RTL). No coverage of `AuthContext`, route guards, or forms.
- No end-to-end tests covering a full login → create account → add transaction → view dashboard flow.

## 4. CI/CD

- **No CI at all** — no `.github/workflows/`, no other CI config anywhere in the repo. `npm run build:backend`, `build:frontend`, `lint:frontend`, and `test:backend` (the exact commands `docs/SETUP.md` lists as "verifying your setup") are currently only ever run manually.
- No pre-merge gate, so nothing stops a broken build or failing test from landing on `main`.
- No automated dependency update / vulnerability scanning (Dependabot, `npm audit` in CI, etc.).

## 5. Data / Schema

- **No indexes beyond the implicit primary keys and `users.email`** (confirmed in `backend/prisma/migrations/20250805160717_init/migration.sql` — only one `CREATE INDEX`). Every foreign key (`accounts.userId`, `transactions.userId`, `transactions.accountId`, `goals.userId`, `insights.userId`, etc.) is unindexed, so every "list my X" query full-scans the table. Fine at demo scale, will not be fine with real users.
- **No pagination** on any list endpoint (`getGoals`, `getInsights`, and the transaction list in `transaction.controller.ts` all return the full result set). A user with years of transaction history will eventually get an unbounded response.
- No soft-delete equivalent for `Account`/`Transaction`/`Insight` (only `Goal` and `Account.isActive` have it) — deleting an account with transaction history isn't handled explicitly; worth confirming the intended behavior (block delete vs. cascade vs. orphan).
- Migrations are applied manually (`npm run prisma:migrate` / `prisma migrate deploy`) with no automated migration step in a deploy pipeline yet.
- **`getTransactionStatsForUser`** (`backend/src/services/transaction.service.ts`) loads a user's *entire* transaction history into Node memory via `prisma.transaction.findMany({ where })` to compute income/expense/category totals, even after list pagination is added elsewhere — for a user with a long transaction history this defeats the point of pagination on the dashboard's stats call specifically. Fix is a refactor to Prisma's `groupBy`/`aggregate` so totals are computed in Postgres, not application memory. Found during the DB-indexes-and-pagination pass (2026-08-07) but deliberately not fixed there — it's an aggregation-query refactor, not an indexing or pagination gap.
- **`checkUnusualActivity`** inside `generateInsightsForUser` (`backend/src/services/insight.service.ts`) has an N+1 query pattern: for every expense transaction in the last 7 days, it runs a separate `prisma.transaction.findMany` to fetch that category's prior transactions for a historical average. A user with 30 recent expenses triggers 30 extra queries on every insights-page load (`generateInsightsForUser` runs unconditionally on every `getInsightsForUser`/`getInsightsSummaryForUser` call, so this isn't even cached between requests). Fix is computing per-category historical averages with a single `groupBy` query instead of a loop. Same discovery context as above — real, but out of scope for the indexing/pagination task.

## 6. Deployment / Infra (sub-project 6, per the Vercel spec)

- ~~Nothing has actually been provisioned.~~ **Done 2026-08-08** — Neon database, both Vercel projects (`financeflow-api`, `financeflow-web`), env vars, git-connected auto-deploy on push to `main`, and a full smoke test (register/login/CORS/account/transaction) all live. Details, including real gotchas hit during setup that the original design spec didn't anticipate (framework preset auto-detection, Root Directory not being CLI-settable, `*.vercel.app` name collisions), in `docs/DEPLOYMENT.md`.
- ~~Root Directory has to be set by hand per-project; nothing enforces this stays correct.~~ Set for both projects (`backend`/`frontend` respectively) via the Vercel REST API (not exposed by the CLI or found in the dashboard's obvious location — see `docs/DEPLOYMENT.md`).
- Secrets management is still entirely manual (`vercel env add` by hand) — no documented process for *rotating* `JWT_SECRET` or DB credentials once live, only for initial setup.
- Still no documented rollback procedure beyond "Vercel's standard dashboard/CLI rollback applies" — hasn't been exercised for real.
- `SENTRY_DSN` remains unset — the opt-in Sentry integration from the observability pass is still inactive in production. No Sentry project has been created.

## 7. Frontend

- `apiClient.ts`'s 401 handler does a hard `window.location.href = '/login'` redirect (`frontend/src/lib/apiClient.ts:33`) with no distinction between "token expired" and "never logged in" — acceptable, but there's no user-facing message explaining why they were logged out.
- No error boundary — an unhandled render error in any page takes down the whole app to a blank screen.
- No loading/error UI conventions verified across all pages (checked Goals as the reference implementation per `CLAUDE.md`; not verified for Accounts/Transactions/Dashboard).
- `VITE_API_URL` is baked in at build time (Vite env var) — need to confirm the Vercel frontend project's env var is set correctly per environment (preview vs. production) before relying on it.

## 8. Documentation

- ~~`README.md` links to `docs/API.md`, `docs/ARCHITECTURE.md`, and `docs/DEPLOYMENT.md` — none of these files exist.~~ **Fixed 2026-08-08** — all three now exist, plus `CONTRIBUTING.md` for the guidelines the README already promised. `DEPLOYMENT.md` documents the deploy plan honestly as not-yet-executed (see item #6 above) rather than describing a live system.
- ~~Tech stack section in `README.md` is still templated.~~ **Fixed 2026-08-08** — also corrected two overstated feature claims while in there ("ML-powered insights" → rule-based; "multi-bank integration" → manual account tracking, no live bank sync).

## Suggested order of attack

1. ~~**CI first** (#4)~~ — done, but paused/unmerged by choice (PR #8) pending the account's $0 Actions budget cap.
2. ~~**Auth security** (#1, #3)~~ — done, merged (PR #9).
3. ~~**DB indexes + pagination** (#5)~~ — done, merged (PR #10).
4. ~~**Observability minimum bar** (#2)~~ — done, merged (PR #11).
5. ~~**Provision and deploy** (#6)~~ — **done 2026-08-08**, live at the URLs in `docs/DEPLOYMENT.md`.
6. **Fill remaining test gaps and docs** (#3, #8) — the only item not started: stats-aggregation/N+1 findings from item #5, authorization tests for accounts/transactions/insights beyond the existing goals example, and a Sentry project if error tracking should actually go active.

Happy to turn the remaining item into a proper spec/plan (via the `superpowers` writing-plans workflow already used for the rest of this repo's features) and start implementing — just say the word.
