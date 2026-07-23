import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { InsightType, Priority, TransactionCategory } from '../generated/prisma';

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
