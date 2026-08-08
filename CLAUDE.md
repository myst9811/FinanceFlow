# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

ChronosFin is a personal finance management app: an Express/Prisma/PostgreSQL API backend and a React/Vite frontend, run as two independent apps in one repo (no shared workspace tooling).

## Commands

All convenience scripts run from the repo root via `npm --prefix`; equivalent commands work inside `backend/` or `frontend/` directly.

```bash
npm run install:all       # npm ci in both backend/ and frontend/
npm run db:up             # start local Postgres 16 (docker-compose), port 5433->5432
npm run db:down
npm run prisma:migrate    # prisma migrate dev (also regenerates client)
npm run prisma:generate   # regenerate Prisma client only

npm run dev:backend       # http://localhost:3001 (nodemon + ts-node)
npm run dev:frontend      # http://localhost:5173 (vite)

npm run build:backend     # tsc
npm run build:frontend    # tsc -b && vite build
npm run lint:frontend     # eslint .
npm run test:backend      # vitest run (backend only; frontend has no test suite)
```

Run a single backend test file: `cd backend && npx vitest run src/services/__tests__/goal.service.test.ts`.

### Backend test database

Backend tests hit a real Postgres database (`chronosfin_test`), not mocks — see `backend/src/services/__tests__/goal.service.test.ts` for the pattern (create fixtures in `beforeEach`, clean up in `afterEach`). One-time setup:

```bash
cp backend/.env.test.example backend/.env.test
docker exec chronosfin-db-1 createdb -U chronosfin chronosfin_test
cd backend && DATABASE_URL="postgresql://chronosfin:chronosfin@localhost:5433/chronosfin_test?schema=public" npx prisma migrate deploy
```

`backend/src/test/setup.ts` loads `.env.test` before `config/env.ts` reads `process.env`, which is what redirects tests at the test DB instead of dev. `vitest.config.ts` sets `fileParallelism: false` — tests share one DB and are not safe to parallelize across files.

Full local verification: `npm run build:backend && npm run build:frontend && npm run lint:frontend && npm run test:backend`.

## Architecture

### Backend (`backend/src`) — layered Express API

Request flow: `routes/*.routes.ts` → `authenticateToken` middleware → `controllers/*.controller.ts` → Prisma (`lib/prisma.ts`) directly, with a thin `services/*.service.ts` layer only for logic that needs to be unit-tested in isolation or requires atomic DB operations (e.g. `services/goal.service.ts`'s `incrementGoalAmount`, which uses Prisma's `increment` operator to avoid lost updates on concurrent contributions). Most CRUD logic lives directly in controllers rather than a service layer — don't assume a service exists for every resource.

- **Auth**: JWT bearer tokens, verified in `middleware/auth.middleware.ts`, which attaches `req.user = { userId, email }` (see `AuthenticatedRequest` in `types/auth.types.ts`). Every route file except `auth.routes.ts` applies `router.use(authenticateToken)` at the top. Resource ownership is enforced per-query — controllers always scope Prisma `where` clauses to `userId: req.user.userId`, never trusting `:id` alone.
- **Errors**: throw `ApiError(statusCode, message)` (`utils/ApiError.ts`) from controllers/services; Express's default async-error handling in Express 5 forwards it to `errorHandler` in `middleware/error.middleware.ts`, which maps `ApiError` to `{ error: message }` with the given status and everything else to a generic 500. Controllers don't wrap logic in try/catch for expected error cases — they just `throw new ApiError(...)`.
- **Validation**: hand-written validator functions in `utils/validation.ts` (no schema library like zod/joi), one `validateXInput`/`validateXUpdate` pair per resource, returning `{ valid, error? }`. Controllers call these before touching the DB.
- **Data model** (`prisma/schema.prisma`): `User` owns `Account`, `Transaction`, `Goal`, `Insight`. `Transaction` references two accounts (`account`/`accountId` and optional `toAccount`/`toAccountId` for transfers). Enums (`AccountType`, `TransactionType`, `TransactionCategory`, `GoalCategory`, `InsightType`, `Priority`) are the source of truth for valid values also duplicated as string arrays in `utils/validation.ts` — keep both in sync when changing the schema. Deletes are soft (`isActive = false`), not row deletes (see `deleteGoal` in `goal.controller.ts`).
- **Generated Prisma client** lives at `backend/src/generated/prisma` (custom `output` path in the schema, not the default `node_modules/.prisma`) — regenerate with `npm run prisma:generate` after schema changes, don't hand-edit.
- **Deployment target is Vercel**, zero-config as a single Fluid Compute Function (entry point `src/server.ts`, which must keep working via `app.listen()` — see `docs/superpowers/specs/2026-07-23-vercel-serverless-adaptation-design.md`). This is why the Prisma datasource has both `url` (pooled, runtime) and `directUrl` (unpooled, migrations only), and why CORS in `server.ts` allows any `*.vercel.app` origin in addition to the configured `CORS_ORIGIN` list.

### Frontend (`frontend/src`) — React 19 + Vite + Tailwind

- **Routing** (`App.tsx`): `react-router-dom` v7 with two route groups gated by `<ProtectedRoute>` / `<PublicOnlyRoute>` (`components/auth/`), which read auth state and redirect accordingly.
- **Auth state**: `contexts/AuthContext.tsx` + `contexts/auth-context.ts` (context object split out separately for Fast Refresh compatibility) expose `user`/`loading`/`login`/`register`/`logout` via the `useAuth` hook (`hooks/useAuth.ts`). Token persistence and current-user fetching are delegated to `services/auth.service.ts`.
- **API layer**: `lib/apiClient.ts` is a single shared axios instance — request interceptor attaches the bearer token from `localStorage` (key from `config/api.config.ts`), response interceptor clears the token and hard-redirects to `/login` on any 401. Each resource has a matching `services/*.service.ts` (account, transaction, goal, insight) that wraps `apiClient` calls; components call these services, never axios directly.
- **Pages vs components**: `pages/*.tsx` are route-level containers that fetch data and hold state; `components/<resource>/` holds presentational pieces (e.g. `GoalCard`, `GoalForm`, `AccountCard`) reused within a resource's page. `components/common/` holds cross-page chrome (Header, Sidebar, Layout, StatCard).
- Feature pages follow a consistent CRUD + summary pattern (list + form + card + inline actions like "Add Funds" on Goals) — look at the Goals feature (`pages/Goals.tsx`, `components/goals/*`, `services/goal.service.ts`) as the reference implementation when adding a similar page.

## Planning docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` contain design specs and implementation plans for past and in-flight features (auth routing, accounts/transactions/goals pages, Vercel adaptation), written using the `superpowers` skill workflow. Check these before designing a new feature — related prior decisions and rationale are often already recorded there rather than in code comments.
