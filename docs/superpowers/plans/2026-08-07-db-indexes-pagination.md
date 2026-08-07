# DB Indexes + Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add missing indexes on foreign-key columns (`Account.userId`, `Transaction.userId+date`/`accountId`/`toAccountId`, `Goal.userId`, `Insight.userId`) and add page/limit pagination to `getTransactions`, `getGoals`, and `getInsights`.

**Architecture:** One additive Prisma migration for the indexes; a new shared `backend/src/utils/pagination.ts` helper used by all three list endpoints, each gaining `page`/`limit`/`totalCount`/`totalPages` in their response alongside the existing array+count shape. Full rationale in `docs/superpowers/specs/2026-08-07-db-indexes-pagination-design.md`.

**Tech Stack:** Prisma migrations (existing), Vitest (existing), real Postgres dev + test DBs.

---

### Task 1: Branch, schema indexes, migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_fk_indexes/migration.sql`

- [ ] **Step 1: Create the feature branch**

Run: `git checkout -b feature/db-indexes-pagination` (from `main`, which has the spec commit).

- [ ] **Step 2: Add indexes to the schema**

In `backend/prisma/schema.prisma`, add one `@@index` line to each of the four models, immediately before their existing `@@map(...)` line:

`Account`:
```prisma
  @@index([userId])
  @@map("accounts")
```

`Transaction`:
```prisma
  @@index([userId, date])
  @@index([accountId])
  @@index([toAccountId])
  @@map("transactions")
```

`Goal`:
```prisma
  @@index([userId])
  @@map("goals")
```

`Insight`:
```prisma
  @@index([userId])
  @@map("insights")
```

- [ ] **Step 3: Ensure the local dev database and `.env` are set up**

If `backend/.env` doesn't exist yet: `cp backend/.env.example backend/.env` (the placeholder `JWT_SECRET` in the template is fine for local dev).

If the dev Postgres container isn't running: `npm run db:up` from the repo root.

- [ ] **Step 4: Generate and apply the migration**

Run: `cd backend && npx prisma migrate dev --name add_fk_indexes`
Expected: `Applying migration \`<timestamp>_add_fk_indexes\`` followed by `Your database is now in sync with your schema.` (verified). This both creates the migration SQL file and applies it to the dev DB, then regenerates the Prisma client.

Verify the generated SQL matches intent — run: `cat prisma/migrations/*_add_fk_indexes/migration.sql`
Expected (verified):
```sql
-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "goals_userId_idx" ON "goals"("userId");

-- CreateIndex
CREATE INDEX "insights_userId_idx" ON "insights"("userId");

-- CreateIndex
CREATE INDEX "transactions_userId_date_idx" ON "transactions"("userId", "date");

-- CreateIndex
CREATE INDEX "transactions_accountId_idx" ON "transactions"("accountId");

-- CreateIndex
CREATE INDEX "transactions_toAccountId_idx" ON "transactions"("toAccountId");
```

- [ ] **Step 5: Apply the same migration to the test database**

Run: `DATABASE_URL="postgresql://financeflow:financeflow@localhost:5433/financeflow_test?schema=public" DIRECT_URL="postgresql://financeflow:financeflow@localhost:5433/financeflow_test?schema=public" npx prisma migrate deploy`
Expected: `All migrations have been successfully applied.` (verified — the test DB needs this applied manually since it's separate from dev, per `docs/SETUP.md`'s existing testing workflow).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "Add indexes on userId/accountId/toAccountId foreign key columns"
```

---

### Task 2: Pagination utility + its unit tests

**Files:**
- Create: `backend/src/utils/pagination.ts`
- Test: `backend/src/utils/__tests__/pagination.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/utils/__tests__/pagination.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildPaginationMeta, parsePagination } from '../pagination';

describe('parsePagination', () => {
  it('defaults to page 1, limit 50 when no query params given', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  it('parses string query values', () => {
    expect(parsePagination({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10, skip: 10 });
  });

  it('clamps limit above MAX_LIMIT down to 100', () => {
    expect(parsePagination({ limit: '500' })).toMatchObject({ limit: 100 });
  });

  it('clamps page/limit of 0 or negative up to 1/default', () => {
    expect(parsePagination({ page: '0', limit: '-5' })).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  it('falls back to defaults for non-numeric input', () => {
    expect(parsePagination({ page: 'abc', limit: 'xyz' })).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  it('computes skip from page and limit', () => {
    expect(parsePagination({ page: '3', limit: '20' })).toEqual({ page: 3, limit: 20, skip: 40 });
  });
});

describe('buildPaginationMeta', () => {
  it('computes totalPages from totalCount and limit', () => {
    expect(buildPaginationMeta(101, 1, 50)).toEqual({
      page: 1,
      limit: 50,
      totalCount: 101,
      totalPages: 3,
    });
  });

  it('reports totalPages: 1 for an empty result set, not 0', () => {
    expect(buildPaginationMeta(0, 1, 50)).toEqual({
      page: 1,
      limit: 50,
      totalCount: 0,
      totalPages: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/utils/__tests__/pagination.test.ts`
Expected: FAIL — `Cannot find module '../pagination'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/utils/pagination.ts`:

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
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/pagination.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  8 passed (8)` (verified).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/pagination.ts backend/src/utils/__tests__/pagination.test.ts
git commit -m "Add pagination utility"
```

---

### Task 3: Paginate transactions

**Files:**
- Modify: `backend/src/services/transaction.service.ts`
- Modify: `backend/src/controllers/transaction.controller.ts`
- Modify: `backend/src/services/__tests__/transaction.service.test.ts`

- [ ] **Step 1: Update `getTransactionsForUser` to accept pagination and return `totalCount`**

In `backend/src/services/transaction.service.ts`, add the import:

```typescript
import type { PaginationParams } from '../utils/pagination';
```

Change the function signature and body from:

```typescript
export async function getTransactionsForUser(userId: string, filters: TransactionFilters) {
  const where: any = { userId };
  // ...filter building unchanged...

  return prisma.transaction.findMany({
    where,
    include: TRANSACTION_INCLUDE,
    orderBy: { date: 'desc' },
  });
}
```

to:

```typescript
export async function getTransactionsForUser(
  userId: string,
  filters: TransactionFilters,
  pagination: PaginationParams
) {
  const where: any = { userId };
  // ...filter building unchanged...

  const [transactions, totalCount] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: TRANSACTION_INCLUDE,
      orderBy: { date: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions, totalCount };
}
```

(Only the function signature, the final `return prisma.transaction.findMany(...)` block, and the new import change — the filter-building code in between is untouched.)

- [ ] **Step 2: Update `getTransactions` controller to pass pagination and return the new fields**

In `backend/src/controllers/transaction.controller.ts`, add the import:

```typescript
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
```

Change:

```typescript
  const transactions = await getTransactionsForUser(req.user.userId, {
    accountId,
    type,
    category,
    startDate,
    endDate,
    minAmount: minAmount !== undefined ? parseFloat(minAmount) : undefined,
    maxAmount: maxAmount !== undefined ? parseFloat(maxAmount) : undefined,
    search,
  });

  res.status(200).json({ transactions, count: transactions.length });
};
```

to:

```typescript
  const pagination = parsePagination(req.query);

  const { transactions, totalCount } = await getTransactionsForUser(
    req.user.userId,
    {
      accountId,
      type,
      category,
      startDate,
      endDate,
      minAmount: minAmount !== undefined ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount !== undefined ? parseFloat(maxAmount) : undefined,
      search,
    },
    pagination
  );

  res.status(200).json({
    transactions,
    count: transactions.length,
    ...buildPaginationMeta(totalCount, pagination.page, pagination.limit),
  });
};
```

- [ ] **Step 3: Add pagination tests to `transaction.service.test.ts`**

Add `getTransactionsForUser` to the existing import from `'../transaction.service'`, then append at the end of the file:

```typescript
describe('getTransactionsForUser pagination', () => {
  beforeEach(async () => {
    for (const amount of [10, 20, 30]) {
      await createTransactionForUser(userId, {
        ...baseInput,
        accountId: accountAId,
        amount,
        type: 'EXPENSE',
      });
    }
  });

  it('returns totalCount and a limited page of results', async () => {
    const { transactions, totalCount } = await getTransactionsForUser(userId, {}, { page: 1, limit: 2, skip: 0 });

    expect(totalCount).toBe(3);
    expect(transactions).toHaveLength(2);
  });

  it('returns the remaining items on the second page', async () => {
    const { transactions, totalCount } = await getTransactionsForUser(userId, {}, { page: 2, limit: 2, skip: 2 });

    expect(totalCount).toBe(3);
    expect(transactions).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run the tests and build**

Run: `npx vitest run src/services/__tests__/transaction.service.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  16 passed (16)` (verified — 14 pre-existing + 2 new).

Run: `npm run build`
Expected: exits 0, no output (verified).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/transaction.service.ts backend/src/controllers/transaction.controller.ts backend/src/services/__tests__/transaction.service.test.ts
git commit -m "Paginate getTransactions"
```

---

### Task 4: Paginate goals

**Files:**
- Modify: `backend/src/controllers/goal.controller.ts`

- [ ] **Step 1: Update `getGoals`**

Add the import alongside the existing ones:

```typescript
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
```

Change:

```typescript
  const goals = await prisma.goal.findMany({
    where,
    orderBy: {
      targetDate: 'asc',
    },
  });

  // Add progress metrics to each goal
  const goalsWithMetrics = goals.map(calculateGoalMetrics);

  res.status(200).json({ goals: goalsWithMetrics, count: goals.length });
};
```

to:

```typescript
  const pagination = parsePagination(req.query);

  const [goals, totalCount] = await Promise.all([
    prisma.goal.findMany({
      where,
      orderBy: {
        targetDate: 'asc',
      },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.goal.count({ where }),
  ]);

  // Add progress metrics to each goal
  const goalsWithMetrics = goals.map(calculateGoalMetrics);

  res.status(200).json({
    goals: goalsWithMetrics,
    count: goalsWithMetrics.length,
    ...buildPaginationMeta(totalCount, pagination.page, pagination.limit),
  });
};
```

(This is the `getGoals` function only — `getGoalsSummary`, which also lists goals but for aggregate totals rather than a paged view, is untouched, matching the design's scope of the three flagged list endpoints only.)

- [ ] **Step 2: Run the build**

Run: `cd backend && npm run build`
Expected: exits 0, no output (verified).

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/goal.controller.ts
git commit -m "Paginate getGoals"
```

---

### Task 5: Paginate insights

**Files:**
- Modify: `backend/src/services/insight.service.ts`
- Modify: `backend/src/controllers/insight.controller.ts`
- Modify: `backend/src/services/__tests__/insight.service.test.ts`

- [ ] **Step 1: Update `getInsightsForUser`**

In `backend/src/services/insight.service.ts`, add the import:

```typescript
import type { PaginationParams } from '../utils/pagination';
```

Change:

```typescript
export async function getInsightsForUser(userId: string, filters: InsightFilters) {
  await generateInsightsForUser(userId);

  const where: any = { userId };
  // ...filter building unchanged...

  return prisma.insight.findMany({ where, orderBy: { createdAt: 'desc' } });
}
```

to:

```typescript
export async function getInsightsForUser(userId: string, filters: InsightFilters, pagination: PaginationParams) {
  await generateInsightsForUser(userId);

  const where: any = { userId };
  // ...filter building unchanged...

  const [insights, totalCount] = await Promise.all([
    prisma.insight.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.insight.count({ where }),
  ]);

  return { insights, totalCount };
}
```

- [ ] **Step 2: Update the `getInsights` controller**

In `backend/src/controllers/insight.controller.ts`, add the import:

```typescript
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
```

Change:

```typescript
  const { isRead, type, priority } = req.query as any;

  const insights = await getInsightsForUser(req.user.userId, {
    isRead: isRead !== undefined ? isRead === 'true' : undefined,
    type,
    priority,
  });

  res.status(200).json({ insights, count: insights.length });
};
```

to:

```typescript
  const { isRead, type, priority } = req.query as any;
  const pagination = parsePagination(req.query);

  const { insights, totalCount } = await getInsightsForUser(
    req.user.userId,
    {
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      type,
      priority,
    },
    pagination
  );

  res.status(200).json({
    insights,
    count: insights.length,
    ...buildPaginationMeta(totalCount, pagination.page, pagination.limit),
  });
};
```

- [ ] **Step 3: Fix the three existing direct callers of `getInsightsForUser` in the test file**

`getInsightsForUser` is called directly (not just through the controller) in three places in `backend/src/services/__tests__/insight.service.test.ts` — these predate this change and will break at test *runtime* (not caught by `npm run build`, since test files are excluded from `tsc` per `backend/tsconfig.json`'s `exclude`, and Vitest doesn't type-check by default) unless updated. Each needs a third `pagination` argument added and the destructuring changed from an array to `{ insights }`:

Line ~67:
```typescript
    const { insights } = await getInsightsForUser(userId, {}, { page: 1, limit: 50, skip: 0 });
```

Line ~80:
```typescript
    const { insights } = await getInsightsForUser(userId, { isRead: true }, { page: 1, limit: 50, skip: 0 });
```

Line ~447:
```typescript
    const { insights } = await getInsightsForUser(userId, {}, { page: 1, limit: 50, skip: 0 });
```

- [ ] **Step 4: Run the full suite and build**

Run: `npm test`
Expected: `Test Files  7 passed (7)`, `Tests  62 passed (62)` (verified).

Run: `npm run build`
Expected: exits 0, no output (verified).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/insight.service.ts backend/src/controllers/insight.controller.ts backend/src/services/__tests__/insight.service.test.ts
git commit -m "Paginate getInsights"
```

---

### Task 6: Push, PR

**Files:** none

- [ ] **Step 1: Final full verification**

Run: `cd backend && npm test && npm run build`
Expected: `Test Files  7 passed (7)`, `Tests  62 passed (62)`, clean build (verified — this is the same state as Task 5 Step 4, re-run once more as a final gate before pushing).

- [ ] **Step 2: Push and open a PR**

```bash
git push -u origin feature/db-indexes-pagination
gh pr create \
  --title "Add DB indexes on FK columns; paginate transactions/goals/insights" \
  --body "$(cat <<'EOF'
## Summary
- New migration: indexes on Account.userId, Goal.userId, Insight.userId, and Transaction.userId+date/accountId/toAccountId
- New backend/src/utils/pagination.ts helper (page/limit, default 50, max 100)
- getTransactions, getGoals, getInsights now paginated - response gains page/limit/totalCount/totalPages alongside the existing array+count shape
- getAccounts intentionally left unpaginated (per-user account counts are inherently small)
- No frontend changes - existing calls without page/limit params get page 1 of up to 50 items, same as before at this project's current data scale
- Design: docs/superpowers/specs/2026-08-07-db-indexes-pagination-design.md

## Test plan
- [x] npm test - 62/62 passing (verified locally)
- [x] npm run build - clean
- Note: CI (PR #8) is still paused per the account's $0 Actions budget cap, so this PR has no automated check - verification above was run locally
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 3: Leave the PR for review**

Same as the auth-security PR — hand back to the user to decide whether to merge now or review first.

---
