import { describe, expect, it, vi } from 'vitest';
import { config } from '../../config/env';
import { requireTrustedOrigin } from '../csrf.middleware';
import type { Request } from 'express';

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireTrustedOrigin', () => {
  it('calls next for a trusted origin', () => {
    const req = { headers: { origin: config.corsOrigins[0] } } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    requireTrustedOrigin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a missing Origin header', () => {
    const req = { headers: {} } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    requireTrustedOrigin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects an untrusted origin', () => {
    const req = { headers: { origin: 'https://evil-attacker.vercel.app' } } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    requireTrustedOrigin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
