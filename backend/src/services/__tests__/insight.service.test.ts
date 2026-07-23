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
