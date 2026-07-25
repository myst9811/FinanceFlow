import { prisma } from '../lib/prisma';

// Atomically increments a goal's currentAmount. Using Prisma's increment
// operator (rather than reading the current value and writing back the
// sum) avoids a lost update when two contributions to the same goal
// happen concurrently.
export async function incrementGoalAmount(id: string, amount: number) {
  return prisma.goal.update({
    where: { id },
    data: { currentAmount: { increment: amount } },
  });
}
