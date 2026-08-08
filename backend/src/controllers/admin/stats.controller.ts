import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { AdminRequest } from '../../types/admin.types';

export const getStats = async (req: AdminRequest, res: Response): Promise<void> => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalUsers, totalAccounts, totalTransactions, totalGoals, recentSignups] = await Promise.all([
    prisma.user.count(),
    prisma.account.count(),
    prisma.transaction.count(),
    prisma.goal.count(),
    prisma.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
  ]);

  const signupsByDay: Record<string, number> = {};
  for (const { createdAt } of recentSignups) {
    const day = createdAt.toISOString().slice(0, 10);
    signupsByDay[day] = (signupsByDay[day] || 0) + 1;
  }

  res.status(200).json({
    stats: {
      totalUsers,
      totalAccounts,
      totalTransactions,
      totalGoals,
      signupsByDay,
    },
  });
};
