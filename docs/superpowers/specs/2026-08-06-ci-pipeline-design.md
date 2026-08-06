# CI Pipeline — Design Spec

## Context

This is the first item in the production-readiness push tracked in `docs/PRODUCTION_READINESS.md` (item #4, "No CI at all"). Right now `npm run build:backend`, `build:frontend`, `lint:frontend`, and `test:backend` — the exact commands `docs/SETUP.md` lists as "verifying your setup" — are only ever run manually, so nothing stops a broken build or a failing test from landing on `main`.

Scope: add a GitHub Actions workflow that runs those four checks on every push/PR against `main`, then protect `main` so PRs can't merge unless they pass. Deploy automation, dependency/vulnerability scanning (Dependabot, `npm audit`), and filling in the actual test-coverage gaps are explicitly out of scope — those are separate items later in the roadmap.

## Structure

One workflow file, `.github/workflows/ci.yml`, triggered on:
- `push` to `main`
- `pull_request` targeting `main`

Two parallel jobs, `backend` and `frontend`, rather than one combined job. Reasoning: the two apps are independent (separate `package.json`/`package-lock.json`, no shared build step — see root `package.json`'s `npm --prefix` scripts), so a frontend lint failure and a backend test failure should surface as two distinct, independently-attributable checks rather than one opaque red X. It also means the frontend job (fast: install, lint, build) doesn't wait behind the slower backend job (DB service container + migrations + tests).

A matrix-over-apps strategy was considered and rejected: backend and frontend need meaningfully different steps (Postgres service container + Prisma migrate vs. plain lint/build), so a matrix would need per-entry conditionals that add complexity without saving meaningful duplication at this scale (two jobs, ~10 steps total).

## `frontend` job

1. `actions/checkout@v4`
2. `actions/setup-node@v4` — Node 20 (matches the "Node.js 20+" requirement stated in `docs/SETUP.md`), npm cache keyed to `frontend/package-lock.json`
3. `npm ci` (in `frontend/`)
4. `npm run lint`
5. `npm run build`

No environment variables are needed. `frontend/src/config/api.config.ts` falls back to `http://localhost:3001/api` when `VITE_API_URL` is unset, so the build succeeds without it.

## `backend` job

1. `actions/checkout@v4`
2. `actions/setup-node@v4` — Node 20, npm cache keyed to `backend/package-lock.json`
3. A `postgres:16-alpine` **service container** (mirrors the image in `docker-compose.yml`), with `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` all set to `financeflow`, port 5432 exposed, and a health check (`pg_isready`) gating the later steps until it's ready.
4. `npm ci` (in `backend/`) — this also runs `postinstall: prisma generate` automatically, per `backend/package.json`.
5. `npx prisma migrate deploy` against the service container, applying `backend/prisma/migrations/*`.
6. `npm run build` (`tsc`).
7. `npm test` (`vitest run`).

Required env vars (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`) are set as job-level `env:` entries pointing at the service container (`postgresql://financeflow:financeflow@localhost:5432/financeflow?schema=public` for both `DATABASE_URL` and `DIRECT_URL` — no pooler in CI, same as local dev per the existing `.env.example` comment). No `.env.test` file is written in CI: `backend/src/test/setup.ts` calls `dotenv.config({ path: '.env.test' })`, and dotenv never overrides variables already present in `process.env`, so setting them directly in the workflow env is sufficient and avoids maintaining a CI-only secrets file.

`fileParallelism: false` is already set in `backend/vitest.config.ts` (tests share one DB), so no CI-side changes are needed there.

## Branch protection

Once the workflow has run successfully at least once on `main` (so the check names exist for GitHub to reference), add a branch protection rule on `main` requiring both the `backend` and `frontend` status checks to pass before merging. This will be applied via `gh api repos/myst9811/FinanceFlow/branches/main/protection` (confirmed via `gh api .../protection` that no rule currently exists — 404).

## Error handling / failure modes

- If the Postgres service container isn't ready in time, the health-check gate blocks `prisma migrate deploy` from running against a not-yet-accepting-connections DB rather than failing with a confusing connection error.
- If `prisma migrate deploy` fails (e.g. a broken migration), the job stops before `build`/`test` run, so the failure is attributed to the migration step specifically.
- Both jobs use `npm ci` (not `npm install`), so a `package-lock.json` drift from `package.json` fails the job loudly instead of silently installing different versions than what's committed.

## Testing

This change has no application code to unit test — the artifact is the workflow YAML itself and the branch protection API call. Verification is: push the workflow, confirm both jobs go green on a real PR (including the backend job actually exercising the Postgres service container and running the existing three service test files), then verify branch protection is active by confirming the rule via `gh api repos/myst9811/FinanceFlow/branches/main/protection`.
