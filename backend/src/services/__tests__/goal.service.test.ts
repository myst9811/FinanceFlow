import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { incrementGoalAmount } from '../goal.service';

let userId: string;
let goalId: string;

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

  const goal = await prisma.goal.create({
    data: {
      userId,
      title: 'Test Goal',
      targetAmount: 1000,
      currentAmount: 0,
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      category: 'OTHER',
    },
  });
  goalId = goal.id;
});

afterEach(async () => {
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe('incrementGoalAmount', () => {
  it('applies both increments when called concurrently, without losing either', async () => {
    await Promise.all([
      incrementGoalAmount(goalId, 10),
      incrementGoalAmount(goalId, 15),
    ]);

    const goal = await prisma.goal.findUniqueOrThrow({ where: { id: goalId } });
    expect(goal.currentAmount).toBe(25);
  });
});
