# Insights Feature — Design Spec

## Context

This is sub-project 1 of a larger roadmap to fill the gaps in FinanceFlow and reach a deployable state on Vercel:

1. **Insights (this spec)** — minimal rule-based insight generation
2. Backend: Vercel serverless adaptation (Express → serverless function, Prisma connection pooling, serverless Postgres)
3. Frontend: auth & routing (react-router, Login/Register, protected routes, wire `AuthProvider`)
4. Frontend: real data pages (Accounts, Transactions, Goals, Dashboard wired to the live API, replacing `mockData.ts`)
5. Docs & CI (`API.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, README fixes, GitHub Actions)
6. Deploy (provision Neon Postgres, set env vars, deploy to Vercel, smoke test)

The `Insight` model already exists in `backend/prisma/schema.prisma` (fields: `type`, `title`, `description`, `priority`, `isRead`), but has no routes, controller, or service. `server.ts` has a commented-out `// app.use('/api/insights', insightRoutes);` TODO.

Scope for this feature is explicitly **rule-based, not ML** — the README's "ML-powered insights" claim will be corrected as part of sub-project 5 (Docs & CI).

## Architecture

Follows the current (post-refactor) backend pattern established by `transaction.service.ts` / `transaction.controller.ts`:

- **`backend/src/services/insight.service.ts`** — all business logic and Prisma access. Exports plain async functions; no class wrapper.
- **`backend/src/controllers/insight.controller.ts`** — thin: auth check (`if (!req.user) throw new ApiError(401, ...)`), call the service, shape the HTTP response. No direct Prisma calls.
- **`backend/src/routes/insight.routes.ts`** — mounts `authenticateToken` middleware, wires routes to controller functions. Matches the shape of `goal.routes.ts` / `transaction.routes.ts`.
- **`backend/src/types/insight.types.ts`** — `AuthenticatedRequest` re-export + any request/response interfaces, matching `goal.types.ts` conventions.
- **`server.ts`** — uncomment and point the insights mount at the new router; remove the TODO comment.

Controllers stay `async` functions that `throw` directly (Express 5 forwards rejected promises to `errorHandler` natively — no wrapper needed, confirmed from the existing transaction/goal/account controllers).

## Generation model

No cron or background job — this keeps the feature compatible with the planned Vercel serverless deployment (sub-project 2), where there's no persistent process to run scheduled jobs.

Instead, generation is **on-demand and idempotent-by-dedup**:

- Calling `GET /api/insights` first runs `generateInsightsForUser(userId)`, which evaluates all 5 rules below against the user's current data and persists any newly-detected conditions as new `Insight` rows.
- Before inserting, each rule checks for an existing **unread** insight with the same `userId` + `type` + `title`. If one exists, skip — this prevents the same condition from spawning duplicate rows every time the endpoint is hit.
- Once the user marks an insight read (`PATCH /:id/read`) or deletes it (`DELETE /:id`), that rule is free to fire again on the next `GET` if the condition still holds.
- After generation, the endpoint queries and returns the full (filtered) insight list — same request, no separate "generate" call needed.

This means insight generation runs on every dashboard load. Given the aggregation queries are scoped to a single user's transactions/goals (not the whole table), this is acceptable at this app's scale — same tradeoff already accepted by `getTransactionStatsForUser` and `getGoalsSummary`, which recompute on every call.

## The five rules

All operate on a `userId` and read directly via `prisma`. Each returns zero or one candidate insight (title, description, priority) to be dedup-checked and conditionally inserted.

1. **`SPENDING_ALERT`** — For each `TransactionCategory` (excluding `TRANSFER`, `INCOME_SALARY`, `INCOME_BUSINESS`), sum this calendar month's `EXPENSE` transactions vs. last calendar month's. Fires when last month's total is `> 0` and this month's total is `>= 1.2 ×` last month's. Priority: `MEDIUM` if increase is 20–50%, `HIGH` if `> 50%`.
   - Title: `"Spending up in {category}"`
   - Description: `"You've spent ${thisMonth} this month vs ${lastMonth} last month in {category}, a {pct}% increase."`

2. **`SAVINGS_OPPORTUNITY`** — Sum this month's `EXPENSE` transactions in `SHOPPING`, `ENTERTAINMENT`, `TRAVEL`. Sum this month's `INCOME` transactions (all categories, `type === 'INCOME'`). Fires when income `> 0` and discretionary sum `>= 0.3 × income`. Priority: `LOW`.
   - Title: `"Discretionary spending opportunity"`
   - Description: `"You've spent ${discretionary} ({pct}% of income) on shopping, entertainment, and travel this month."`

3. **`BUDGET_RECOMMENDATION`** — Sum this month's total `EXPENSE` vs. total `INCOME`. Fires when income `> 0` and expenses `>= 0.9 × income` (savings rate under 10%). Priority: `MEDIUM`.
   - Title: `"Consider a budget using the 50/30/20 rule"`
   - Description: `"You've spent {pct}% of your income this month. A common guideline is 50% needs, 30% wants, 20% savings."`

4. **`GOAL_PROGRESS`** — For each active (`isActive: true`) goal not yet complete (`currentAmount < targetAmount`):
   - Compute expected progress: `(elapsed / totalDuration) * 100` where `elapsed = now - createdAt`, `totalDuration = targetDate - createdAt`. Clamp to `[0, 100]`.
   - Compute actual progress: `(currentAmount / targetAmount) * 100`.
   - Fires "behind pace" when `expected - actual > 20` (percentage points). Priority: `MEDIUM`.
     - Title: `"Goal '{title}' is behind pace"`
     - Description: `"You're at {actual}% of your goal but {expected}% of the timeline has passed."`
   - Separately, fires "completed" once `currentAmount >= targetAmount`, using the same standard dedup check (same `userId`+`type`+title, which is unique per goal since the title embeds the goal's name). Priority: `HIGH`.
     - Title: `"Goal '{title}' completed!"`
     - Description: `"You've reached your target of ${targetAmount} for '{title}'."`

5. **`UNUSUAL_ACTIVITY`** — For each `EXPENSE` transaction dated within the last 7 days: compute the user's historical average `EXPENSE` amount in that same category (all transactions in that category, excluding the candidate transaction itself). Requires `>= 5` prior transactions in that category to have a meaningful baseline (skip otherwise). Fires when the transaction's amount `> 2 ×` that average. Priority: `HIGH`.
   - Title: `"Unusual transaction: {description}"`
   - Description: `"This ${amount} transaction is more than double your typical ${avg} spend in {category}."`

## API

All routes under `/api/insights`, protected by `authenticateToken` (matches other resource routers).

- **`GET /api/insights`** — runs generation, then returns the list. Query filters: `isRead` (`'true'|'false'`), `type` (`InsightType`), `priority` (`Priority`). Response: `{ insights: Insight[], count: number }`, ordered by `createdAt desc`.
- **`GET /api/insights/summary`** — runs generation, then returns aggregate counts. Response: `{ summary: { total, unread, byPriority: Record<Priority, number>, byType: Record<InsightType, number> } }`.
- **`PATCH /api/insights/:id/read`** — marks one insight read (ownership-checked via `findFirst({ where: { id, userId } })`, 404 if not found/not owned). Response: `{ insight }`.
- **`DELETE /api/insights/:id`** — deletes one insight (same ownership check). Response: `{ message: 'Insight deleted successfully' }`.

Route ordering follows the existing convention (`/summary` before `/:id`) to avoid Express matching `summary` as an `:id` param.

## Error handling

Same as every other resource: `ApiError(401, ...)` for missing auth, `ApiError(404, ...)` for not-found/not-owned, thrown directly from `async` controller functions, caught by the existing global `errorHandler`. No new error-handling infrastructure needed.

## Testing

Following the `transaction.service.test.ts` precedent — tests run against the real test DB (`financeflow_test`), not mocks:

- **`insight.service.test.ts`**: for each of the 5 rules, seed transactions/goals with specific dates and amounts that cross (and separately, don't cross) the rule's threshold, then assert `generateInsightsForUser` creates (or doesn't create) the expected `Insight` row with the right `type`/`priority`.
- Dedup test: run generation twice with the same underlying data and assert only one `Insight` row exists after both calls.
- Dedup-reset test: mark an insight read, re-run generation with the same still-true condition, assert a new row is created.
- Controller-level tests are not planned separately — the existing pattern only unit-tests the service layer directly; routing/auth wiring is exercised indirectly through the other resource routes already in place.

## Out of scope

- ML/statistical modeling of any kind (explicitly deferred, per README correction in sub-project 5)
- Background/scheduled generation (e.g. Vercel Cron) — on-demand generation is sufficient for now and avoids adding infra ahead of the serverless migration
- A `Budget` model — `BUDGET_RECOMMENDATION` uses a fixed 50/30/20 heuristic against existing `Transaction` data rather than a stored budget
- Frontend UI for insights — covered by sub-project 4 (real data pages), not this spec
