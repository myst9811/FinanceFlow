import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { config } from '../../config/env';
import { register, login, getCurrentUser } from '../auth.controller';
import type { AuthenticatedRequest } from '../../types/auth.types';

function createMockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

const testEmails: string[] = [];

function uniqueEmail(prefix = 'test'): string {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  testEmails.push(email);
  return email;
}

afterEach(async () => {
  if (testEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    testEmails.length = 0;
  }
});

describe('register', () => {
  it('creates a user and returns 201 with a user and token', async () => {
    const email = uniqueEmail();
    const req = {
      body: { email, password: 'Password1', firstName: 'Test', lastName: 'User' },
    } as unknown as Request;
    const res = createMockRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.user.email).toBe(email);
    expect(typeof body.token).toBe('string');

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).not.toBeNull();
  });

  it('rejects a duplicate email with 409', async () => {
    const email = uniqueEmail();
    await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash('Password1', 10),
        firstName: 'Existing',
        lastName: 'User',
      },
    });

    const req = {
      body: { email, password: 'Password1', firstName: 'Test', lastName: 'User' },
    } as unknown as Request;
    const res = createMockRes();

    await expect(register(req, res)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects invalid input with 400', async () => {
    const req = {
      body: { email: uniqueEmail(), password: 'short', firstName: 'Test', lastName: 'User' },
    } as unknown as Request;
    const res = createMockRes();

    await expect(register(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('login', () => {
  it('succeeds with correct credentials and returns a valid token', async () => {
    const email = uniqueEmail();
    const password = 'Password1';
    const user = await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        firstName: 'Test',
        lastName: 'User',
      },
    });

    const req = { body: { email, password } } as unknown as Request;
    const res = createMockRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as any).mock.calls[0][0];
    const decoded = jwt.verify(body.token, config.jwtSecret) as { userId: string; email: string };
    expect(decoded.userId).toBe(user.id);
    expect(decoded.email).toBe(email);
  });

  it('rejects a wrong password with 401', async () => {
    const email = uniqueEmail();
    await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash('Password1', 10),
        firstName: 'Test',
        lastName: 'User',
      },
    });

    const req = { body: { email, password: 'WrongPass1' } } as unknown as Request;
    const res = createMockRes();

    await expect(login(req, res)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
    });
  });

  it('rejects an unknown email with the same 401 message', async () => {
    const req = {
      body: { email: uniqueEmail(), password: 'Password1' },
    } as unknown as Request;
    const res = createMockRes();

    await expect(login(req, res)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
    });
  });

  it('rejects password login for a Google-only account (no password set)', async () => {
    const email = uniqueEmail();
    await prisma.user.create({
      data: {
        email,
        password: null,
        googleSubject: `google-sub-${Date.now()}`,
        firstName: 'Google',
        lastName: 'User',
      },
    });

    const req = { body: { email, password: 'AnyPassword1' } } as unknown as Request;
    const res = createMockRes();

    await expect(login(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('getCurrentUser', () => {
  it('returns the authenticated user', async () => {
    const email = uniqueEmail();
    const user = await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash('Password1', 10),
        firstName: 'Test',
        lastName: 'User',
      },
    });

    const req = {
      user: { userId: user.id, email: user.email },
    } as unknown as AuthenticatedRequest;
    const res = createMockRes();

    await getCurrentUser(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.user.id).toBe(user.id);
  });

  it('rejects when unauthenticated with 401', async () => {
    const req = {} as unknown as AuthenticatedRequest;
    const res = createMockRes();

    await expect(getCurrentUser(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('reports googleLinked based on whether googleSubject is set', async () => {
    const email = uniqueEmail();
    const user = await prisma.user.create({
      data: {
        email,
        password: null,
        googleSubject: `sub-${Date.now()}`,
        firstName: 'Test',
        lastName: 'User',
      },
    });

    const req = { user: { userId: user.id, email: user.email } } as unknown as AuthenticatedRequest;
    const res = createMockRes();

    await getCurrentUser(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.user.googleLinked).toBe(true);
  });
});
