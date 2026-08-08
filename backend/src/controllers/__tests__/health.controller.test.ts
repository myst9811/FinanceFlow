import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { healthCheck } from '../health.controller';

function createMockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('healthCheck', () => {
  it('returns 200 OK when the database is reachable', async () => {
    const req = {} as unknown as Request;
    const res = createMockRes();

    await healthCheck(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.status).toBe('OK');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 503 when the database is unreachable', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));

    const req = {} as unknown as Request;
    const res = createMockRes();

    await healthCheck(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.status).toBe('ERROR');
    expect(body.error).toBe('Database unreachable');
  });

  it('returns 503 if the database query hangs past the timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(prisma, '$queryRaw').mockImplementationOnce(() => new Promise(() => {}));

    const req = {} as unknown as Request;
    const res = createMockRes();

    const resultPromise = healthCheck(req, res);
    await vi.advanceTimersByTimeAsync(3000);
    await resultPromise;

    expect(res.status).toHaveBeenCalledWith(503);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.error).toBe('Database unreachable');

    vi.useRealTimers();
  });
});
