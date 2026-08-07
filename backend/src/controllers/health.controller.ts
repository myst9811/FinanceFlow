import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: 'Database unreachable',
    });
  }
};
