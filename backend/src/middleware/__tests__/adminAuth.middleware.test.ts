import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { requireAdmin } from '../adminAuth.middleware';
import type { AdminRequest } from '../../types/admin.types';

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireAdmin', () => {
  it('populates req.admin and calls next for a valid cookie', () => {
    const token = jwt.sign({ email: config.adminEmail }, config.adminJwtSecret, { expiresIn: '1h' });
    const req = { cookies: { admin_session: token } } as unknown as AdminRequest;
    const res = createMockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(req.admin).toEqual({ email: config.adminEmail });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects when there is no cookie', () => {
    const req = { cookies: {} } as unknown as AdminRequest;
    const res = createMockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a token signed with a different secret', () => {
    const token = jwt.sign({ email: config.adminEmail }, 'a-completely-different-secret', { expiresIn: '1h' });
    const req = { cookies: { admin_session: token } } as unknown as AdminRequest;
    const res = createMockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a validly-signed token whose email no longer matches config.adminEmail', () => {
    const token = jwt.sign({ email: 'old-admin@example.com' }, config.adminJwtSecret, { expiresIn: '1h' });
    const req = { cookies: { admin_session: token } } as unknown as AdminRequest;
    const res = createMockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
