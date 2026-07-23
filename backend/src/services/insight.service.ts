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
