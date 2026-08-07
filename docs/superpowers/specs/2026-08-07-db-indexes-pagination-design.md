# DB Indexes + Pagination — Design Spec

## Context

This is the third item in the production-readiness push tracked in `docs/PRODUCTION_READINESS.md`, item #5 ("Data / Schema"): no indexes beyond primary keys and `users.email`, and no pagination on any list endpoint. Per the agreed attack order: "DB indexes + pagination — cheap schema migration, prevents a slow-query cliff post-launch."

The prior two roadmap items (CI, auth security) are implemented; auth security is merged to `main` via PR #9, CI is paused (PR #8 open, unmerged, blocked on the account's $0 Actions budget cap — see `docs/superpowers/specs/2026-08-06-ci-pipeline-design.md`). This work proceeds with the same manual verification approach as auth security: `npm test`/`npm run build` run locally, no CI gate yet.

Explicitly out of scope: pagination on `getAccounts` (per-user account counts are inherently small — a handful of bank accounts, not thousands — so it wasn't flagged in the original gap analysis and doesn't need it), any frontend changes (no pagination UI, no changes to how the frontend calls these endpoints — confirmed as a deliberate scope boundary, not an oversight), and soft-delete semantics for `Transaction`/`Insight` (a separate, unresolved design question the original gap analysis flagged but which isn't part of this step).

## Indexes

New Prisma migration adding:

```prisma
model Account {
  // ...unchanged fields...
  @@index([userId])
  @@map("accounts")
}

model Transaction {
  // ...unchanged fields...
  @@index([userId, date])
  @@map("transactions")
}

model Goal {
  // ...unchanged fields...
  @@index([userId])
  @@map("goals")
}

model Insight {
  // ...unchanged fields...
  @@index([userId])
  @@map("insights")
}
```

`Transaction` gets a **composite** index on `[userId, date]` rather than a plain `[userId]` index: every transaction list query (`getTransactionsForUser` in `backend/src/services/transaction.service.ts`) filters by `userId` and always sorts by `date desc` (`orderBy: { date: 'desc' }`), so the composite index serves both the filter and the sort in one structure instead of needing a second index for the ordering. `Account`, `Goal`, and `Insight` get plain `[userId]` indexes — their list queries filter by `userId` but sort by different, less uniformly-hot columns (`createdAt`, `targetDate`, `createdAt` respectively), and none of them are high-volume enough to justify a composite index today.

`accountId`/`toAccountId` on `Transaction` deliberately get no index of their own. The only place `accountId` is filtered directly is the optional `accountId` filter in `getTransactionsForUser` — but that filter always runs alongside the `userId` filter, which is already highly selective (scoped to one user's data), so it rides on the `[userId, date]` index's leading column and filters the (already small) per-user result set in memory. Adding a dedicated index for a secondary filter on an already-narrow set isn't worth the write-amplification cost it'd add to every transaction insert/update.

This migration is generated with `prisma migrate dev` locally (creates the SQL file under `backend/prisma/migrations/`) and is a pure additive schema change — no data migration, no application code depends on the index existing (indexes are a query-planner concern, transparent to Prisma's generated client).

## Pagination

New file `backend/src/utils/pagination.ts`, following the same colocated-utility convention as `utils/validation.ts` and `utils/ApiError.ts` (hand-written, no external pagination library — this is simple enough not to need one):

```typescript
export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function parsePagination(query: { page?: unknown; limit?: unknown }): PaginationParams {
  const page = Math.max(1, parsePositiveInt(query.page) ?? 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parsePositiveInt(query.limit) ?? DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

export function buildPaginationMeta(totalCount: number, page: number, limit: number): PaginationMeta {
  return { page, limit, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) };
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
```

`DEFAULT_LIMIT = 50` is chosen so that existing frontend calls — which don't send `page`/`limit` today — keep working unchanged in practice (comfortably covers this project's current demo-scale data) while still capping the actual risk the gap analysis flagged: a truly unbounded response as data grows. `MAX_LIMIT = 100` stops a client from requesting an arbitrarily large page and defeating the point.

Applied to the three endpoints flagged in `docs/PRODUCTION_READINESS.md`:

- **`getTransactions`** (`backend/src/controllers/transaction.controller.ts`) → `getTransactionsForUser` (`backend/src/services/transaction.service.ts`). The service function's signature changes from returning `Transaction[]` to `{ transactions: Transaction[], totalCount: number }`, computed via `Promise.all([prisma.transaction.findMany({ ...where, skip, take: limit }), prisma.transaction.count({ where })])` — reusing the same `where` clause for both. No existing test exercises `getTransactionsForUser` (confirmed by grep), so this is a signature change with no test fallout, only new coverage added.
- **`getGoals`** (`backend/src/controllers/goal.controller.ts`) — pagination applied directly in the controller (this resource has no separate service layer for listing, unlike transactions).
- **`getInsights`** (`backend/src/controllers/insight.controller.ts` → `getInsightsForUser` in `backend/src/services/insight.service.ts`) — same pattern as goals/transactions.

Each response keeps its existing `{ resourceArray, count }` shape — `count` continues to mean "items in this response" (i.e. `array.length`), unchanged — and gains four new fields: `page`, `limit`, `totalCount`, `totalPages`. Example, `getGoals`:

```json
{
  "goals": [ /* up to `limit` items */ ],
  "count": 12,
  "page": 1,
  "limit": 50,
  "totalCount": 12,
  "totalPages": 1
}
```

Frontend impact: none in this pass (confirmed as a deliberate scope boundary above) — existing calls with no `page`/`limit` params get page 1 with the default limit, and the new response fields are additive, so nothing existing breaks by their presence.

## Tests

Two additions, both cheap and targeted rather than repeating the same pagination test three times across every resource (goals/insights/transactions all share the identical `pagination.ts` helper, so the real risk surface is that helper plus one real end-to-end example):

- **`backend/src/utils/__tests__/pagination.test.ts`** — pure unit tests on `parsePagination`/`buildPaginationMeta`: defaults when no query params given (`page: 1, limit: 50`), clamping (`limit` above `MAX_LIMIT` clamps to 100, `page`/`limit` of `0` or negative clamp to `1`), non-numeric input falls back to defaults, and `buildPaginationMeta`'s `totalPages` math (including the `totalCount: 0` edge case, which should still report `totalPages: 1` rather than `0`, matching how an empty result set is still "one empty page" rather than a nonsensical zero-page response).
- **`backend/src/services/__tests__/transaction.service.test.ts`** (extended, not a new file — follows the existing convention of one test file per service) — a new `describe('getTransactionsForUser pagination')` block: create 3 transactions for a test user, request `limit: 2`, assert `totalCount: 3` and 2 returned transactions; request `page: 2, limit: 2`, assert the remaining 1 transaction is returned.

## Error handling / failure modes

- Malformed `page`/`limit` query params (non-numeric, negative, zero) don't throw — `parsePagination` silently falls back to defaults/clamps, consistent with this codebase's existing light-touch approach to query param parsing (e.g. `active`/`category` filters elsewhere are read without validation errors for bad values).
- The index migration is purely additive and has no failure mode beyond a normal `prisma migrate deploy` — it doesn't touch existing data or existing columns.

## Testing (verification)

Run `cd backend && npm test && npm run build` (all existing tests plus the new/extended ones). No CI gate for this yet (see Context) — manual verification, same as the prior two roadmap items.
