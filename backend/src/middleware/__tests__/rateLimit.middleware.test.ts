import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { loginLimiter, registerLimiter } from '../rateLimit.middleware';

function createMockReq(ip: string): Request {
  return {
    ip,
    method: 'POST',
    url: '/api/auth/login',
    headers: {},
    app: { get: () => false },
  } as unknown as Request;
}

function createMockRes(): Response {
  const res: any = {};
  res.headers = {};
  res.setHeader = vi.fn((key: string, value: unknown) => {
    res.headers[key] = value;
  });
  res.getHeader = vi.fn((key: string) => res.headers[key]);
  res.removeHeader = vi.fn((key: string) => {
    delete res.headers[key];
  });
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('loginLimiter', () => {
  it('allows 5 requests then blocks the 6th with a 429 and custom message', async () => {
    const req = createMockReq('10.0.0.1');
    const next: NextFunction = vi.fn();

    for (let i = 0; i < 5; i++) {
      await loginLimiter(req, createMockRes(), next);
    }
    expect(next).toHaveBeenCalledTimes(5);

    const blockedRes = createMockRes();
    await loginLimiter(req, blockedRes, next);

    expect(next).toHaveBeenCalledTimes(5);
    expect(blockedRes.status).toHaveBeenCalledWith(429);
    expect(blockedRes.json).toHaveBeenCalledWith({
      error: expect.stringContaining('Too many login attempts'),
    });
  });
});

describe('registerLimiter', () => {
  it('allows 10 requests then blocks the 11th with a 429 and custom message', async () => {
    const req = createMockReq('10.0.0.2');
    const next: NextFunction = vi.fn();

    for (let i = 0; i < 10; i++) {
      await registerLimiter(req, createMockRes(), next);
    }
    expect(next).toHaveBeenCalledTimes(10);

    const blockedRes = createMockRes();
    await registerLimiter(req, blockedRes, next);

    expect(next).toHaveBeenCalledTimes(10);
    expect(blockedRes.status).toHaveBeenCalledWith(429);
    expect(blockedRes.json).toHaveBeenCalledWith({
      error: expect.stringContaining('Too many accounts created'),
    });
  });
});
