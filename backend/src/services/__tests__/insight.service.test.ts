import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import {
  getInsightsForUser,
  getInsightsSummaryForUser,
  markInsightReadForUser,
  deleteInsightForUser,
  generateInsightsForUser,
} from '../insight.service';

let userId: string;
let accountId: string;

function thisMonthDate(day = 10): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day);
}

function lastMonthDate(day = 10): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, day);
}

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
