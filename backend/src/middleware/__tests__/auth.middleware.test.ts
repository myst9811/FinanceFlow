import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { authenticateToken } from '../auth.middleware';
import type { AuthenticatedRequest } from '../../types/auth.types';

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const testUserIds: string[] = [];

async function createTestUser(overrides: { isActive?: boolean } = {}) {
  const email = `auth-mw-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      password: await bcrypt.hash('Password1', 10),
      firstName: 'Test',
      lastName: 'User',
      ...(overrides.isActive !== undefined ? { isActive: overrides.isActive } : {}),
    },
  });
  testUserIds.push(user.id);
  return user;
}

afterEach(async () => {
  if (testUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    testUserIds.length = 0;
  }
});

describe('authenticateToken', () => {
  it('populates req.user and calls next for a valid token belonging to an active user', async () => {
    const user = await createTestUser();
    const token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as AuthenticatedRequest;
    const res = createMockRes();
    const next = vi.fn();

    await authenticateToken(req, res, next);

    expect(req.user).toEqual({ userId: user.id, email: user.email });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the user has since been deactivated', async () => {
    const user = await createTestUser();
    const token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, { expiresIn: '1h' });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as AuthenticatedRequest;
    const res = createMockRes();
    const next = vi.fn();

    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects when no token is provided', async () => {
    const req = { headers: {} } as unknown as AuthenticatedRequest;
    const res = createMockRes();
    const next = vi.fn();

    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a token for a user id that no longer exists', async () => {
    const token = jwt.sign({ userId: 'not-a-real-id', email: 'ghost@example.com' }, config.jwtSecret, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as AuthenticatedRequest;
    const res = createMockRes();
    const next = vi.fn();

    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
