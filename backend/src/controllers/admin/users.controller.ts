import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination';
import { AdminRequest } from '../../types/admin.types';

const USER_LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  createdAt: true,
  isActive: true,
  _count: {
    select: { accounts: true, transactions: true, goals: true },
  },
} as const;

export const getUsers = async (req: AdminRequest, res: Response): Promise<void> => {
  const pagination = parsePagination(req.query);

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      select: USER_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.user.count(),
  ]);

  res.status(200).json({
    users,
    count: users.length,
    ...buildPaginationMeta(totalCount, pagination.page, pagination.limit),
  });
};

export const updateUserStatus = async (req: AdminRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive must be a boolean value');
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(404, 'User not found');
  }

  const user = await prisma.user.update({
    where: { id },
    data: { isActive },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      isActive: true,
    },
  });

  res.status(200).json({ user });
};
