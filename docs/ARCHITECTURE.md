# Architecture Overview

FinanceFlow is two independent apps in one repo — an Express/Prisma/PostgreSQL API and a React/Vite frontend — with no shared build tooling between them (see the root `package.json`'s `npm --prefix` convenience scripts).

## Backend (`backend/src`)

Layered Express API: `routes/*.routes.ts` → `authenticateToken` middleware → `controllers/*.controller.ts` → Prisma directly, with a thin `services/*.service.ts` layer only where logic needs atomic multi-step database operations or independent unit testing (e.g. `transaction.service.ts`'s balance-adjusting create/update/delete, or `goal.service.ts`'s concurrency-safe contribution increment).

- **Auth**: JWT bearer tokens (`middleware/auth.middleware.ts` attaches `req.user`). Every resource route applies `authenticateToken`. Controllers scope every Prisma query to `userId: req.user.userId` — ownership is enforced per-query, not just per-route, and a request for another user's resource returns `404` rather than `403` (deliberately not revealing that the resource exists).
- **Errors**: controllers/services `throw new ApiError(statusCode, message)`; a single `errorHandler` middleware maps that to `{ error: message }` with the given status, and anything else to a generic `500`.
- **Validation**: hand-written functions in `utils/validation.ts` (no schema library) — one `validateXInput`/`validateXUpdate` pair per resource.
- **Rate limiting**: `express-rate-limit` on the two credential endpoints (`POST /api/auth/login`, `POST /api/auth/register`) only; see `docs/API.md`.
- **Pagination**: a shared `utils/pagination.ts` helper (`page`/`limit` query params, default limit 50, max 100) used by the three list endpoints most likely to grow unbounded (`getTransactions`, `getGoals`, `getInsights`). `getAccounts` is deliberately left unpaginated — per-user account counts are inherently small.
- **Data model**: `prisma/schema.prisma` — a `User` owns `Account`, `Transaction`, `Goal`, `Insight`. A `Transaction` references two accounts (`accountId`/`toAccountId`) to represent transfers. Deletes are soft (`isActive` flag) for `Account` and `Goal`; `Transaction` and `Insight` are hard-deleted. Foreign key columns are indexed (`userId` on every model, plus `date`/`accountId`/`toAccountId` on `Transaction`).
- **Insights**: rule-based, not ML — `services/insight.service.ts` runs five heuristic checks (spending-category increases, discretionary-spend-vs-income ratio, budget-vs-income ratio, goal pacing, unusual single-transaction amounts) against recent transaction history whenever insights are read, and persists any newly-detected ones.

## Frontend (`frontend/src`)

React 19 + Vite + Tailwind CSS, with `react-router-dom` v7.

- **Routing** (`App.tsx`): two route groups gated by `<ProtectedRoute>`/`<PublicOnlyRoute>` based on auth state.
- **Auth state**: `contexts/AuthContext.tsx` + `hooks/useAuth.ts`, backed by `services/auth.service.ts` for token persistence and the current-user fetch.
- **API layer**: a single shared axios instance (`lib/apiClient.ts`) attaches the bearer token to every request and redirects to `/login` on any `401`. Each backend resource has a matching `services/*.service.ts` wrapping it — components call these, never axios directly.
- **Structure**: `pages/*.tsx` are route-level containers that fetch data and hold state; `components/<resource>/` holds presentational pieces reused within a resource's page (forms, cards, rows); `components/common/` holds cross-page chrome (header, sidebar, layout).

## Deployment target

Designed for zero-config deployment to Vercel as two separate projects (`backend/` and `frontend/` as separate Root Directories) with a serverless Postgres (Neon) database — see [DEPLOYMENT.md](DEPLOYMENT.md). As of this writing the code/config is deploy-ready but nothing has actually been provisioned yet; see `docs/PRODUCTION_READINESS.md` for current status.

## Where design decisions are recorded

Every non-trivial feature in this repo was built through a spec → plan → implementation cycle, and both documents are kept: `docs/superpowers/specs/` has the design rationale (what was considered and rejected, and why), `docs/superpowers/plans/` has the resulting step-by-step implementation plan. Check there before re-deriving a decision that's likely already been made and documented.
