import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { getGoalById, updateGoal, deleteGoal } from '../goal.controller';
import type { AuthenticatedRequest } from '../../types/goal.types';

function createMockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

let userAId: string;
let userBId: string;
let goalOwnedByUserAId: string;

beforeEach(async () => {
  const userA = await prisma.user.create({
    data: {
      email: `test-a-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      firstName: 'User',
      lastName: 'A',
    },
  });
  userAId = userA.id;

  const userB = await prisma.user.create({
    data: {
      email: `test-b-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      firstName: 'User',
      lastName: 'B',
    },
  });
  userBId = userB.id;

  const goal = await prisma.goal.create({
    data: {
      userId: userAId,
      title: 'User A Goal',
      targetAmount: 1000,
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      category: 'OTHER',
    },
  });
  goalOwnedByUserAId = goal.id;
});

afterEach(async () => {
  await prisma.goal.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
});

function reqAsUserB(overrides: Record<string, unknown> = {}): AuthenticatedRequest {
  return {
    params: { id: goalOwnedByUserAId },
    user: { userId: userBId, email: 'user-b@example.com' },
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

describe('goal.controller cross-user authorization', () => {
  it("getGoalById returns 404 for another user's goal", async () => {
    const res = createMockRes();
    await expect(getGoalById(reqAsUserB(), res)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Goal not found',
    });
  });

  it("updateGoal returns 404 for another user's goal", async () => {
    const req = reqAsUserB({ body: { title: 'Hijacked' } });
    const res = createMockRes();
    await expect(updateGoal(req, res)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Goal not found',
    });
  });

  it("deleteGoal returns 404 for another user's goal", async () => {
    const res = createMockRes();
    await expect(deleteGoal(reqAsUserB(), res)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Goal not found',
    });
  });
});
