# Insights Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rule-based insights feature to the FinanceFlow backend — five deterministic rules (spending alerts, savings opportunities, budget recommendations, goal progress, unusual activity) that generate `Insight` rows on demand, exposed via a new `/api/insights` REST resource.

**Architecture:** Follows the existing service-layer pattern (`transaction.service.ts` / `transaction.controller.ts`): a new `insight.service.ts` holds all Prisma access and rule logic, a thin `insight.controller.ts` handles auth + HTTP shaping, and `insight.routes.ts` wires it into `server.ts`. No cron/background job — generation runs on-demand inside the read endpoints, with dedup against existing unread insights to avoid duplicate rows.

**Tech Stack:** Express 5, TypeScript, Prisma (Postgres), Vitest (tests run against the real `financeflow_test` database, no mocks).

**Spec:** `docs/superpowers/specs/2026-07-22-insights-feature-design.md`

---

## File Structure

- Create: `backend/src/types/insight.types.ts` — `AuthenticatedRequest` (matches the per-resource types convention already used by `goal.types.ts` / `account.types.ts` / `transaction.types.ts`)
- Create: `backend/src/services/insight.service.ts` — rule engine + CRUD (`getInsightsForUser`, `getInsightsSummaryForUser`, `markInsightReadForUser`, `deleteInsightForUser`, `generateInsightsForUser`)
- Create: `backend/src/services/__tests__/insight.service.test.ts` — tests for every rule, dedup behavior, and CRUD operations
- Create: `backend/src/controllers/insight.controller.ts` — thin HTTP layer
- Create: `backend/src/routes/insight.routes.ts` — route wiring
- Modify: `backend/src/server.ts` — uncomment/mount the insights router

---

### Task 1: Insight types

**Files:**
- Create: `backend/src/types/insight.types.ts`

- [ ] **Step 1: Create the types file**

```typescript
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/types/insight.types.ts
git commit -m "feat: add insight types module"
```

---

### Task 2: Insight service — basic CRUD

Basic list/summary/read/delete operations against directly-seeded `Insight` rows. Rule-based generation is added in later tasks.

**Files:**
- Create: `backend/src/services/insight.service.ts`
- Create: `backend/src/services/__tests__/insight.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import {
  getInsightsForUser,
  getInsightsSummaryForUser,
  markInsightReadForUser,
  deleteInsightForUser,
} from '../insight.service';

let userId: string;
let accountId: string;

beforeEach(async () => {
  const user = await prisma.user.create({
    data: {
      email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      firstName: 'Test',
      lastName: 'User',
    },
  });
  userId = user.id;

  const account = await prisma.account.create({
    data: { userId, name: 'Checking', type: 'CHECKING', balance: 1000 },
  });
  accountId = account.id;
});

afterEach(async () => {
  await prisma.insight.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe('getInsightsForUser', () => {
  it("returns only the authenticated user's insights, newest first", async () => {
    await prisma.insight.create({
      data: { userId, type: 'SPENDING_ALERT', title: 'Old', description: 'old', priority: 'LOW' },
    });
    await prisma.insight.create({
      data: { userId, type: 'SPENDING_ALERT', title: 'New', description: 'new', priority: 'LOW' },
    });

    const insights = await getInsightsForUser(userId, {});

    expect(insights.map((i) => i.title)).toEqual(['New', 'Old']);
  });

  it('filters by isRead', async () => {
    await prisma.insight.create({
      data: { userId, type: 'SPENDING_ALERT', title: 'Unread', description: 'x', priority: 'LOW', isRead: false },
    });
    await prisma.insight.create({
      data: { userId, type: 'SPENDING_ALERT', title: 'Read', description: 'x', priority: 'LOW', isRead: true },
    });

    const insights = await getInsightsForUser(userId, { isRead: true });

    expect(insights.map((i) => i.title)).toEqual(['Read']);
  });
});

describe('getInsightsSummaryForUser', () => {
  it('counts total, unread, and breakdowns by priority and type', async () => {
    await prisma.insight.create({
      data: { userId, type: 'SPENDING_ALERT', title: 'A', description: 'x', priority: 'HIGH', isRead: false },
    });
    await prisma.insight.create({
      data: { userId, type: 'GOAL_PROGRESS', title: 'B', description: 'x', priority: 'LOW', isRead: true },
    });

    const summary = await getInsightsSummaryForUser(userId);

    expect(summary).toEqual({
      total: 2,
      unread: 1,
      byPriority: { HIGH: 1, LOW: 1 },
      byType: { SPENDING_ALERT: 1, GOAL_PROGRESS: 1 },
    });
  });
});

describe('markInsightReadForUser', () => {
  it('marks the insight as read', async () => {
    const insight = await prisma.insight.create({
      data: { userId, type: 'SPENDING_ALERT', title: 'A', description: 'x', priority: 'LOW', isRead: false },
    });

    const updated = await markInsightReadForUser(userId, insight.id);

    expect(updated.isRead).toBe(true);
  });

  it('rejects marking an insight that does not belong to the user', async () => {
    const insight = await prisma.insight.create({
      data: { userId, type: 'SPENDING_ALERT', title: 'A', description: 'x', priority: 'LOW' },
    });

    await expect(
      markInsightReadForUser('00000000-0000-0000-0000-000000000000', insight.id)
    ).rejects.toMatchObject(new ApiError(404, 'Insight not found'));
  });
});

describe('deleteInsightForUser', () => {
  it('deletes the insight', async () => {
    const insight = await prisma.insight.create({
      data: { userId, type: 'SPENDING_ALERT', title: 'A', description: 'x', priority: 'LOW' },
    });

    await deleteInsightForUser(userId, insight.id);

    const found = await prisma.insight.findUnique({ where: { id: insight.id } });
    expect(found).toBeNull();
  });

  it('rejects deleting an insight that does not belong to the user', async () => {
    const insight = await prisma.insight.create({
      data: { userId, type: 'SPENDING_ALERT', title: 'A', description: 'x', priority: 'LOW' },
    });

    await expect(
      deleteInsightForUser('00000000-0000-0000-0000-000000000000', insight.id)
    ).rejects.toMatchObject(new ApiError(404, 'Insight not found'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: FAIL with "Cannot find module '../insight.service'"

- [ ] **Step 3: Write the implementation**

```typescript
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { InsightType, Priority } from '../generated/prisma';

interface InsightFilters {
  isRead?: boolean;
  type?: InsightType;
  priority?: Priority;
}

export async function getInsightsForUser(userId: string, filters: InsightFilters) {
  const where: any = { userId };

  if (filters.isRead !== undefined) {
    where.isRead = filters.isRead;
  }
  if (filters.type) {
    where.type = filters.type;
  }
  if (filters.priority) {
    where.priority = filters.priority;
  }

  return prisma.insight.findMany({ where, orderBy: { createdAt: 'desc' } });
}

export async function getInsightsSummaryForUser(userId: string) {
  const insights = await prisma.insight.findMany({ where: { userId } });

  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const insight of insights) {
    byPriority[insight.priority] = (byPriority[insight.priority] || 0) + 1;
    byType[insight.type] = (byType[insight.type] || 0) + 1;
  }

  return {
    total: insights.length,
    unread: insights.filter((i) => !i.isRead).length,
    byPriority,
    byType,
  };
}

export async function markInsightReadForUser(userId: string, id: string) {
  const existing = await prisma.insight.findFirst({ where: { id, userId } });

  if (!existing) {
    throw new ApiError(404, 'Insight not found');
  }

  return prisma.insight.update({ where: { id }, data: { isRead: true } });
}

export async function deleteInsightForUser(userId: string, id: string) {
  const existing = await prisma.insight.findFirst({ where: { id, userId } });

  if (!existing) {
    throw new ApiError(404, 'Insight not found');
  }

  await prisma.insight.delete({ where: { id } });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/insight.service.ts backend/src/services/__tests__/insight.service.test.ts
git commit -m "feat: add insight CRUD service operations"
```

---

### Task 3: SPENDING_ALERT rule

**Files:**
- Modify: `backend/src/services/insight.service.ts`
- Modify: `backend/src/services/__tests__/insight.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the top of the test file, below the imports, and add these `describe` blocks after the existing ones:

```typescript
// add to imports:
import { generateInsightsForUser } from '../insight.service';

// add near the top, after the userId/accountId declarations:
function thisMonthDate(day = 10): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day);
}

function lastMonthDate(day = 10): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, day);
}
```

```typescript
describe('generateInsightsForUser - SPENDING_ALERT', () => {
  it('creates a MEDIUM priority alert when spending is up 20-50%', async () => {
    await prisma.transaction.create({
      data: {
        userId, accountId, amount: 100, description: 'groceries', category: 'FOOD_DINING',
        type: 'EXPENSE', date: lastMonthDate(),
      },
    });
    await prisma.transaction.create({
      data: {
        userId, accountId, amount: 130, description: 'groceries', category: 'FOOD_DINING',
        type: 'EXPENSE', date: thisMonthDate(),
      },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'SPENDING_ALERT' } });
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ title: 'Spending up in FOOD_DINING', priority: 'MEDIUM' });
  });

  it('creates a HIGH priority alert when spending is up more than 50%', async () => {
    await prisma.transaction.create({
      data: {
        userId, accountId, amount: 100, description: 'groceries', category: 'FOOD_DINING',
        type: 'EXPENSE', date: lastMonthDate(),
      },
    });
    await prisma.transaction.create({
      data: {
        userId, accountId, amount: 200, description: 'groceries', category: 'FOOD_DINING',
        type: 'EXPENSE', date: thisMonthDate(),
      },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'SPENDING_ALERT' } });
    expect(insights[0].priority).toBe('HIGH');
  });

  it('does not create an alert when the increase is below 20%', async () => {
    await prisma.transaction.create({
      data: {
        userId, accountId, amount: 100, description: 'groceries', category: 'FOOD_DINING',
        type: 'EXPENSE', date: lastMonthDate(),
      },
    });
    await prisma.transaction.create({
      data: {
        userId, accountId, amount: 110, description: 'groceries', category: 'FOOD_DINING',
        type: 'EXPENSE', date: thisMonthDate(),
      },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'SPENDING_ALERT' } });
    expect(insights).toHaveLength(0);
  });

  it('does not create an alert without a prior-month baseline', async () => {
    await prisma.transaction.create({
      data: {
        userId, accountId, amount: 500, description: 'groceries', category: 'FOOD_DINING',
        type: 'EXPENSE', date: thisMonthDate(),
      },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'SPENDING_ALERT' } });
    expect(insights).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: FAIL with "generateInsightsForUser is not a function" (or "Cannot find export")

- [ ] **Step 3: Write the implementation**

Add to `backend/src/services/insight.service.ts` (below the existing imports, add `TransactionCategory` to the prisma import; below the existing functions add the new code):

```typescript
// update the top import line to:
import { InsightType, Priority, TransactionCategory } from '../generated/prisma';

// add below the existing functions:
interface InsightCandidate {
  type: InsightType;
  title: string;
  description: string;
  priority: Priority;
}

function startOfMonth(date: Date, monthsAgo = 0): Date {
  return new Date(date.getFullYear(), date.getMonth() - monthsAgo, 1);
}

async function checkSpendingAlerts(userId: string): Promise<InsightCandidate[]> {
  const now = new Date();
  const thisMonthStart = startOfMonth(now, 0);
  const lastMonthStart = startOfMonth(now, 1);

  const transactions = await prisma.transaction.findMany({
    where: { userId, type: 'EXPENSE', date: { gte: lastMonthStart } },
  });

  const thisMonthByCategory: Record<string, number> = {};
  const lastMonthByCategory: Record<string, number> = {};

  for (const t of transactions) {
    if (t.date >= thisMonthStart) {
      thisMonthByCategory[t.category] = (thisMonthByCategory[t.category] || 0) + t.amount;
    } else {
      lastMonthByCategory[t.category] = (lastMonthByCategory[t.category] || 0) + t.amount;
    }
  }

  const candidates: InsightCandidate[] = [];

  for (const category of Object.keys(lastMonthByCategory)) {
    const lastMonthTotal = lastMonthByCategory[category];
    const thisMonthTotal = thisMonthByCategory[category] || 0;

    if (lastMonthTotal > 0 && thisMonthTotal >= lastMonthTotal * 1.2) {
      const pct = Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100);
      candidates.push({
        type: 'SPENDING_ALERT',
        title: `Spending up in ${category}`,
        description: `You've spent $${thisMonthTotal.toFixed(2)} this month vs $${lastMonthTotal.toFixed(2)} last month in ${category}, a ${pct}% increase.`,
        priority: pct > 50 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  return candidates;
}

export async function generateInsightsForUser(userId: string): Promise<void> {
  const candidates = await checkSpendingAlerts(userId);

  for (const candidate of candidates) {
    await prisma.insight.create({ data: { userId, ...candidate } });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/insight.service.ts backend/src/services/__tests__/insight.service.test.ts
git commit -m "feat: add SPENDING_ALERT insight rule"
```

---

### Task 4: SAVINGS_OPPORTUNITY rule

**Files:**
- Modify: `backend/src/services/insight.service.ts`
- Modify: `backend/src/services/__tests__/insight.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('generateInsightsForUser - SAVINGS_OPPORTUNITY', () => {
  it('creates an insight when discretionary spending is at least 30% of income', async () => {
    await prisma.transaction.create({
      data: { userId, accountId, amount: 2000, description: 'salary', category: 'INCOME_SALARY', type: 'INCOME', date: thisMonthDate() },
    });
    await prisma.transaction.create({
      data: { userId, accountId, amount: 700, description: 'shopping spree', category: 'SHOPPING', type: 'EXPENSE', date: thisMonthDate() },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'SAVINGS_OPPORTUNITY' } });
    expect(insights).toHaveLength(1);
    expect(insights[0].priority).toBe('LOW');
  });

  it('does not create an insight when discretionary spending is below 30% of income', async () => {
    await prisma.transaction.create({
      data: { userId, accountId, amount: 2000, description: 'salary', category: 'INCOME_SALARY', type: 'INCOME', date: thisMonthDate() },
    });
    await prisma.transaction.create({
      data: { userId, accountId, amount: 400, description: 'shopping', category: 'SHOPPING', type: 'EXPENSE', date: thisMonthDate() },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'SAVINGS_OPPORTUNITY' } });
    expect(insights).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: FAIL (0 SAVINGS_OPPORTUNITY insights created since the rule doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Add to `backend/src/services/insight.service.ts`, above `generateInsightsForUser`:

```typescript
const DISCRETIONARY_CATEGORIES: TransactionCategory[] = ['SHOPPING', 'ENTERTAINMENT', 'TRAVEL'];

async function checkSavingsOpportunity(userId: string): Promise<InsightCandidate[]> {
  const thisMonthStart = startOfMonth(new Date(), 0);

  const [expenses, incomes] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, type: 'EXPENSE', category: { in: DISCRETIONARY_CATEGORIES }, date: { gte: thisMonthStart } },
    }),
    prisma.transaction.findMany({
      where: { userId, type: 'INCOME', date: { gte: thisMonthStart } },
    }),
  ]);

  const discretionaryTotal = expenses.reduce((sum, t) => sum + t.amount, 0);
  const incomeTotal = incomes.reduce((sum, t) => sum + t.amount, 0);

  if (incomeTotal > 0 && discretionaryTotal >= incomeTotal * 0.3) {
    const pct = Math.round((discretionaryTotal / incomeTotal) * 100);
    return [{
      type: 'SAVINGS_OPPORTUNITY',
      title: 'Discretionary spending opportunity',
      description: `You've spent $${discretionaryTotal.toFixed(2)} (${pct}% of income) on shopping, entertainment, and travel this month.`,
      priority: 'LOW',
    }];
  }

  return [];
}
```

Replace `generateInsightsForUser`:

```typescript
export async function generateInsightsForUser(userId: string): Promise<void> {
  const results = await Promise.all([
    checkSpendingAlerts(userId),
    checkSavingsOpportunity(userId),
  ]);
  const candidates = results.flat();

  for (const candidate of candidates) {
    await prisma.insight.create({ data: { userId, ...candidate } });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/insight.service.ts backend/src/services/__tests__/insight.service.test.ts
git commit -m "feat: add SAVINGS_OPPORTUNITY insight rule"
```

---

### Task 5: BUDGET_RECOMMENDATION rule

**Files:**
- Modify: `backend/src/services/insight.service.ts`
- Modify: `backend/src/services/__tests__/insight.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('generateInsightsForUser - BUDGET_RECOMMENDATION', () => {
  it('creates an insight when expenses reach at least 90% of income', async () => {
    await prisma.transaction.create({
      data: { userId, accountId, amount: 1000, description: 'salary', category: 'INCOME_SALARY', type: 'INCOME', date: thisMonthDate() },
    });
    await prisma.transaction.create({
      data: { userId, accountId, amount: 950, description: 'bills', category: 'BILLS_UTILITIES', type: 'EXPENSE', date: thisMonthDate() },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'BUDGET_RECOMMENDATION' } });
    expect(insights).toHaveLength(1);
    expect(insights[0].priority).toBe('MEDIUM');
  });

  it('does not create an insight when expenses are below 90% of income', async () => {
    await prisma.transaction.create({
      data: { userId, accountId, amount: 1000, description: 'salary', category: 'INCOME_SALARY', type: 'INCOME', date: thisMonthDate() },
    });
    await prisma.transaction.create({
      data: { userId, accountId, amount: 800, description: 'bills', category: 'BILLS_UTILITIES', type: 'EXPENSE', date: thisMonthDate() },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'BUDGET_RECOMMENDATION' } });
    expect(insights).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: FAIL (0 BUDGET_RECOMMENDATION insights created since the rule doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Add to `backend/src/services/insight.service.ts`, above `generateInsightsForUser`:

```typescript
async function checkBudgetRecommendation(userId: string): Promise<InsightCandidate[]> {
  const thisMonthStart = startOfMonth(new Date(), 0);

  const [expenses, incomes] = await Promise.all([
    prisma.transaction.findMany({ where: { userId, type: 'EXPENSE', date: { gte: thisMonthStart } } }),
    prisma.transaction.findMany({ where: { userId, type: 'INCOME', date: { gte: thisMonthStart } } }),
  ]);

  const expenseTotal = expenses.reduce((sum, t) => sum + t.amount, 0);
  const incomeTotal = incomes.reduce((sum, t) => sum + t.amount, 0);

  if (incomeTotal > 0 && expenseTotal >= incomeTotal * 0.9) {
    const pct = Math.round((expenseTotal / incomeTotal) * 100);
    return [{
      type: 'BUDGET_RECOMMENDATION',
      title: 'Consider a budget using the 50/30/20 rule',
      description: `You've spent ${pct}% of your income this month. A common guideline is 50% needs, 30% wants, 20% savings.`,
      priority: 'MEDIUM',
    }];
  }

  return [];
}
```

Replace `generateInsightsForUser`:

```typescript
export async function generateInsightsForUser(userId: string): Promise<void> {
  const results = await Promise.all([
    checkSpendingAlerts(userId),
    checkSavingsOpportunity(userId),
    checkBudgetRecommendation(userId),
  ]);
  const candidates = results.flat();

  for (const candidate of candidates) {
    await prisma.insight.create({ data: { userId, ...candidate } });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/insight.service.ts backend/src/services/__tests__/insight.service.test.ts
git commit -m "feat: add BUDGET_RECOMMENDATION insight rule"
```

---

### Task 6: GOAL_PROGRESS rule

**Files:**
- Modify: `backend/src/services/insight.service.ts`
- Modify: `backend/src/services/__tests__/insight.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add near the top of the test file, alongside `thisMonthDate`/`lastMonthDate`:

```typescript
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}
```

```typescript
describe('generateInsightsForUser - GOAL_PROGRESS', () => {
  it('creates a HIGH priority insight when a goal is completed', async () => {
    await prisma.goal.create({
      data: {
        userId, title: 'Emergency Fund', targetAmount: 1000, currentAmount: 1000,
        targetDate: daysFromNow(30), category: 'EMERGENCY_FUND', createdAt: daysAgo(10),
      },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'GOAL_PROGRESS' } });
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ title: "Goal 'Emergency Fund' completed!", priority: 'HIGH' });
  });

  it('creates a MEDIUM priority insight when a goal is more than 20 points behind pace', async () => {
    await prisma.goal.create({
      data: {
        userId, title: 'Vacation', targetAmount: 1000, currentAmount: 100,
        targetDate: daysFromNow(100), category: 'VACATION', createdAt: daysAgo(100),
      },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'GOAL_PROGRESS' } });
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ title: "Goal 'Vacation' is behind pace", priority: 'MEDIUM' });
  });

  it('does not create an insight when a goal is on pace', async () => {
    await prisma.goal.create({
      data: {
        userId, title: 'Vacation', targetAmount: 1000, currentAmount: 450,
        targetDate: daysFromNow(100), category: 'VACATION', createdAt: daysAgo(100),
      },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'GOAL_PROGRESS' } });
    expect(insights).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: FAIL (0 GOAL_PROGRESS insights created since the rule doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Add to `backend/src/services/insight.service.ts`, above `generateInsightsForUser`:

```typescript
async function checkGoalProgress(userId: string): Promise<InsightCandidate[]> {
  const goals = await prisma.goal.findMany({ where: { userId, isActive: true } });
  const now = new Date();
  const candidates: InsightCandidate[] = [];

  for (const goal of goals) {
    if (goal.currentAmount >= goal.targetAmount) {
      candidates.push({
        type: 'GOAL_PROGRESS',
        title: `Goal '${goal.title}' completed!`,
        description: `You've reached your target of $${goal.targetAmount.toFixed(2)} for '${goal.title}'.`,
        priority: 'HIGH',
      });
      continue;
    }

    const totalDuration = goal.targetDate.getTime() - goal.createdAt.getTime();
    if (totalDuration <= 0) {
      continue;
    }

    const elapsed = now.getTime() - goal.createdAt.getTime();
    const expectedPct = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
    const actualPct = (goal.currentAmount / goal.targetAmount) * 100;

    if (expectedPct - actualPct > 20) {
      candidates.push({
        type: 'GOAL_PROGRESS',
        title: `Goal '${goal.title}' is behind pace`,
        description: `You're at ${Math.round(actualPct)}% of your goal but ${Math.round(expectedPct)}% of the timeline has passed.`,
        priority: 'MEDIUM',
      });
    }
  }

  return candidates;
}
```

Replace `generateInsightsForUser`:

```typescript
export async function generateInsightsForUser(userId: string): Promise<void> {
  const results = await Promise.all([
    checkSpendingAlerts(userId),
    checkSavingsOpportunity(userId),
    checkBudgetRecommendation(userId),
    checkGoalProgress(userId),
  ]);
  const candidates = results.flat();

  for (const candidate of candidates) {
    await prisma.insight.create({ data: { userId, ...candidate } });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: PASS (19 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/insight.service.ts backend/src/services/__tests__/insight.service.test.ts
git commit -m "feat: add GOAL_PROGRESS insight rule"
```

---

### Task 7: UNUSUAL_ACTIVITY rule

**Files:**
- Modify: `backend/src/services/insight.service.ts`
- Modify: `backend/src/services/__tests__/insight.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('generateInsightsForUser - UNUSUAL_ACTIVITY', () => {
  it('creates a HIGH priority insight for a transaction more than double the category average', async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.transaction.create({
        data: {
          userId, accountId, amount: 50, description: `dinner ${i}`, category: 'FOOD_DINING',
          type: 'EXPENSE', date: daysAgo(30 + i),
        },
      });
    }
    await prisma.transaction.create({
      data: {
        userId, accountId, amount: 150, description: 'expensive dinner', category: 'FOOD_DINING',
        type: 'EXPENSE', date: daysAgo(1),
      },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'UNUSUAL_ACTIVITY' } });
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ title: 'Unusual transaction: expensive dinner', priority: 'HIGH' });
  });

  it('does not create an insight without at least 5 prior transactions in the category', async () => {
    for (let i = 0; i < 3; i++) {
      await prisma.transaction.create({
        data: {
          userId, accountId, amount: 50, description: `dinner ${i}`, category: 'FOOD_DINING',
          type: 'EXPENSE', date: daysAgo(30 + i),
        },
      });
    }
    await prisma.transaction.create({
      data: {
        userId, accountId, amount: 150, description: 'expensive dinner', category: 'FOOD_DINING',
        type: 'EXPENSE', date: daysAgo(1),
      },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'UNUSUAL_ACTIVITY' } });
    expect(insights).toHaveLength(0);
  });

  it('does not create an insight when the amount is not more than double the average', async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.transaction.create({
        data: {
          userId, accountId, amount: 50, description: `dinner ${i}`, category: 'FOOD_DINING',
          type: 'EXPENSE', date: daysAgo(30 + i),
        },
      });
    }
    await prisma.transaction.create({
      data: {
        userId, accountId, amount: 90, description: 'nice dinner', category: 'FOOD_DINING',
        type: 'EXPENSE', date: daysAgo(1),
      },
    });

    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'UNUSUAL_ACTIVITY' } });
    expect(insights).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: FAIL (0 UNUSUAL_ACTIVITY insights created since the rule doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Add to `backend/src/services/insight.service.ts`, above `generateInsightsForUser`:

```typescript
async function checkUnusualActivity(userId: string): Promise<InsightCandidate[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentExpenses = await prisma.transaction.findMany({
    where: { userId, type: 'EXPENSE', date: { gte: sevenDaysAgo } },
  });

  const candidates: InsightCandidate[] = [];

  for (const tx of recentExpenses) {
    const priorInCategory = await prisma.transaction.findMany({
      where: { userId, type: 'EXPENSE', category: tx.category, id: { not: tx.id } },
    });

    if (priorInCategory.length < 5) {
      continue;
    }

    const avg = priorInCategory.reduce((sum, t) => sum + t.amount, 0) / priorInCategory.length;

    if (tx.amount > avg * 2) {
      candidates.push({
        type: 'UNUSUAL_ACTIVITY',
        title: `Unusual transaction: ${tx.description}`,
        description: `This $${tx.amount.toFixed(2)} transaction is more than double your typical $${avg.toFixed(2)} spend in ${tx.category}.`,
        priority: 'HIGH',
      });
    }
  }

  return candidates;
}
```

Replace `generateInsightsForUser`:

```typescript
export async function generateInsightsForUser(userId: string): Promise<void> {
  const results = await Promise.all([
    checkSpendingAlerts(userId),
    checkSavingsOpportunity(userId),
    checkBudgetRecommendation(userId),
    checkGoalProgress(userId),
    checkUnusualActivity(userId),
  ]);
  const candidates = results.flat();

  for (const candidate of candidates) {
    await prisma.insight.create({ data: { userId, ...candidate } });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: PASS (22 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/insight.service.ts backend/src/services/__tests__/insight.service.test.ts
git commit -m "feat: add UNUSUAL_ACTIVITY insight rule"
```

---

### Task 8: Dedup logic + generation-on-read

Prevents the same still-true condition from creating duplicate rows on every call, and wires generation into the read endpoints per the spec (`GET /api/insights` and the summary endpoint both trigger generation).

**Files:**
- Modify: `backend/src/services/insight.service.ts`
- Modify: `backend/src/services/__tests__/insight.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('generateInsightsForUser - dedup', () => {
  it('does not create a duplicate insight for the same still-true condition', async () => {
    await prisma.transaction.create({
      data: { userId, accountId, amount: 100, description: 'groceries', category: 'FOOD_DINING', type: 'EXPENSE', date: lastMonthDate() },
    });
    await prisma.transaction.create({
      data: { userId, accountId, amount: 200, description: 'groceries', category: 'FOOD_DINING', type: 'EXPENSE', date: thisMonthDate() },
    });

    await generateInsightsForUser(userId);
    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'SPENDING_ALERT' } });
    expect(insights).toHaveLength(1);
  });

  it('creates a new insight once the previous one has been marked read', async () => {
    await prisma.transaction.create({
      data: { userId, accountId, amount: 100, description: 'groceries', category: 'FOOD_DINING', type: 'EXPENSE', date: lastMonthDate() },
    });
    await prisma.transaction.create({
      data: { userId, accountId, amount: 200, description: 'groceries', category: 'FOOD_DINING', type: 'EXPENSE', date: thisMonthDate() },
    });

    await generateInsightsForUser(userId);
    await prisma.insight.updateMany({ where: { userId, type: 'SPENDING_ALERT' }, data: { isRead: true } });
    await generateInsightsForUser(userId);

    const insights = await prisma.insight.findMany({ where: { userId, type: 'SPENDING_ALERT' } });
    expect(insights).toHaveLength(2);
  });
});

describe('getInsightsForUser - generation on read', () => {
  it('generates and returns newly detected insights', async () => {
    await prisma.transaction.create({
      data: { userId, accountId, amount: 100, description: 'groceries', category: 'FOOD_DINING', type: 'EXPENSE', date: lastMonthDate() },
    });
    await prisma.transaction.create({
      data: { userId, accountId, amount: 200, description: 'groceries', category: 'FOOD_DINING', type: 'EXPENSE', date: thisMonthDate() },
    });

    const insights = await getInsightsForUser(userId, {});

    expect(insights.some((i) => i.type === 'SPENDING_ALERT')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: FAIL — the dedup test finds 2 rows instead of 1; the generation-on-read test finds no `SPENDING_ALERT` insight

- [ ] **Step 3: Write the implementation**

Replace `generateInsightsForUser` in `backend/src/services/insight.service.ts`:

```typescript
export async function generateInsightsForUser(userId: string): Promise<void> {
  const results = await Promise.all([
    checkSpendingAlerts(userId),
    checkSavingsOpportunity(userId),
    checkBudgetRecommendation(userId),
    checkGoalProgress(userId),
    checkUnusualActivity(userId),
  ]);
  const candidates = results.flat();

  for (const candidate of candidates) {
    const existingUnread = await prisma.insight.findFirst({
      where: { userId, type: candidate.type, title: candidate.title, isRead: false },
    });

    if (!existingUnread) {
      await prisma.insight.create({ data: { userId, ...candidate } });
    }
  }
}
```

Replace `getInsightsForUser` and `getInsightsSummaryForUser` to call generation first:

```typescript
export async function getInsightsForUser(userId: string, filters: InsightFilters) {
  await generateInsightsForUser(userId);

  const where: any = { userId };

  if (filters.isRead !== undefined) {
    where.isRead = filters.isRead;
  }
  if (filters.type) {
    where.type = filters.type;
  }
  if (filters.priority) {
    where.priority = filters.priority;
  }

  return prisma.insight.findMany({ where, orderBy: { createdAt: 'desc' } });
}

export async function getInsightsSummaryForUser(userId: string) {
  await generateInsightsForUser(userId);

  const insights = await prisma.insight.findMany({ where: { userId } });

  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const insight of insights) {
    byPriority[insight.priority] = (byPriority[insight.priority] || 0) + 1;
    byType[insight.type] = (byType[insight.type] || 0) + 1;
  }

  return {
    total: insights.length,
    unread: insights.filter((i) => !i.isRead).length,
    byPriority,
    byType,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/__tests__/insight.service.test.ts`
Expected: PASS (25 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/insight.service.ts backend/src/services/__tests__/insight.service.test.ts
git commit -m "feat: dedup insight generation and trigger it from read endpoints"
```

---

### Task 9: Insight controller

**Files:**
- Create: `backend/src/controllers/insight.controller.ts`

No dedicated controller tests — matches the existing convention where only the service layer is unit-tested directly (see `transaction.service.test.ts`); routing/auth wiring is exercised through manual verification in Task 11.

- [ ] **Step 1: Create the controller**

```typescript
import { Response } from 'express';
import { AuthenticatedRequest } from '../types/insight.types';
import { ApiError } from '../utils/ApiError';
import {
  getInsightsForUser,
  getInsightsSummaryForUser,
  markInsightReadForUser,
  deleteInsightForUser,
} from '../services/insight.service';

// Get all insights for the authenticated user, filtered by read status/type/priority
export const getInsights = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { isRead, type, priority } = req.query as any;

  const insights = await getInsightsForUser(req.user.userId, {
    isRead: isRead !== undefined ? isRead === 'true' : undefined,
    type,
    priority,
  });

  res.status(200).json({ insights, count: insights.length });
};

// Get insight summary counts for the authenticated user
export const getInsightsSummary = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const summary = await getInsightsSummaryForUser(req.user.userId);

  res.status(200).json({ summary });
};

// Mark an insight as read
export const markInsightRead = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { id } = req.params;
  const insight = await markInsightReadForUser(req.user.userId, id);

  res.status(200).json({ insight });
};

// Delete an insight
export const deleteInsight = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { id } = req.params;
  await deleteInsightForUser(req.user.userId, id);

  res.status(200).json({ message: 'Insight deleted successfully' });
};
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/controllers/insight.controller.ts
git commit -m "feat: add insight controller"
```

---

### Task 10: Insight routes + mount in server

**Files:**
- Create: `backend/src/routes/insight.routes.ts`
- Modify: `backend/src/server.ts:8` (import) and `backend/src/server.ts` (mount, replacing the TODO)

- [ ] **Step 1: Create the routes file**

```typescript
import { Router } from 'express';
import {
  getInsights,
  getInsightsSummary,
  markInsightRead,
  deleteInsight,
} from '../controllers/insight.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All insight routes require authentication
router.use(authenticateToken);

router.get('/', getInsights);
router.get('/summary', getInsightsSummary);
router.patch('/:id/read', markInsightRead);
router.delete('/:id', deleteInsight);

export default router;
```

- [ ] **Step 2: Wire it into the server**

In `backend/src/server.ts`, add the import alongside the other route imports:

```typescript
import goalRoutes from './routes/goal.routes';
import insightRoutes from './routes/insight.routes';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';
```

Replace:

```typescript
// TODO: Implement remaining routes
// app.use('/api/insights', insightRoutes);
```

with:

```typescript
app.use('/api/insights', insightRoutes);
```

- [ ] **Step 3: Verify the backend builds**

Run: `npm run build:backend`
Expected: completes with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/insight.routes.ts backend/src/server.ts
git commit -m "feat: mount insights router at /api/insights"
```

---

### Task 11: End-to-end verification

**Files:** none (verification only — fix and commit separately if anything fails)

- [ ] **Step 1: Run the full backend test suite**

Run: `npm run test:backend`
Expected: all tests pass, including the 25 insight tests and the existing transaction tests

- [ ] **Step 2: Run the backend build**

Run: `npm run build:backend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Start the dev database and backend**

```bash
npm run db:up
npm run dev:backend
```

Expected: `🚀 Server running on port 3001` with no startup errors

- [ ] **Step 4: Manually smoke-test the new endpoint**

In a separate terminal:

```bash
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"insight-smoke@example.com","password":"Password123","firstName":"Smoke","lastName":"Test"}' \
  | tee /tmp/register.json

TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/register.json')).token)")

curl -s http://localhost:3001/api/insights -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3001/api/insights/summary -H "Authorization: Bearer $TOKEN"
```

Expected: both calls return `200` with `{"insights":[],"count":0}` and `{"summary":{"total":0,"unread":0,"byPriority":{},"byType":{}}}` — a fresh user has no transactions/goals yet, so no rules fire.

- [ ] **Step 5: Stop the dev server**

Ctrl-C the `npm run dev:backend` process once the smoke test confirms the routes respond correctly.

---

## Self-Review Notes

- **Spec coverage:** Architecture (Task 1-2, 9-10), generation model + dedup (Task 8), all 5 rules (Tasks 3-7), API surface (Task 10), error handling (Tasks 2, 9 — `ApiError` reused as-is), testing (every rule task), out-of-scope items (no tasks added for ML/cron/Budget model/frontend — correctly omitted).
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `InsightCandidate` (Task 3) is used identically through Tasks 4-8; `generateInsightsForUser`, `getInsightsForUser`, `getInsightsSummaryForUser`, `markInsightReadForUser`, `deleteInsightForUser` names match exactly between the service (Tasks 2-8) and the controller's imports (Task 9).
