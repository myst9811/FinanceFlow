import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../../config/env';
import * as googleAuthLib from '../../../lib/googleAuth';
import { googleLogin, logout, me } from '../auth.controller';
import type { AdminRequest } from '../../../types/admin.types';

function createMockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('googleLogin', () => {
  it('sets a session cookie with correct options for the admin email', async () => {
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      email: config.adminEmail,
      email_verified: true,
    } as any);

    const req = { body: { credential: 'fake-google-id-token' } } as unknown as Request;
    const res = createMockRes();

    await googleLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalledWith(
      'admin_session',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 60 * 60 * 1000,
      })
    );

    const [, token] = (res.cookie as any).mock.calls[0];
    const decoded = jwt.verify(token, config.adminJwtSecret) as { email: string; exp: number; iat: number };
    expect(decoded.email).toBe(config.adminEmail);
    expect(decoded.exp - decoded.iat).toBe(60 * 60);
  });

  it('rejects a valid token for a non-admin email', async () => {
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      email: 'not-the-admin@example.com',
      email_verified: true,
    } as any);

    const req = { body: { credential: 'fake-google-id-token' } } as unknown as Request;
    const res = createMockRes();

    await expect(googleLogin(req, res)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects an unverified email even if it matches the admin email', async () => {
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      email: config.adminEmail,
      email_verified: false,
    } as any);

    const req = { body: { credential: 'fake-google-id-token' } } as unknown as Request;
    const res = createMockRes();

    await expect(googleLogin(req, res)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects when the Google token fails verification', async () => {
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockRejectedValueOnce(new Error('invalid token'));

    const req = { body: { credential: 'garbage' } } as unknown as Request;
    const res = createMockRes();

    await expect(googleLogin(req, res)).rejects.toMatchObject({ statusCode: 403, message: 'Not authorized' });
  });

  it('rejects when no credential is provided', async () => {
    const req = { body: {} } as unknown as Request;
    const res = createMockRes();

    await expect(googleLogin(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('logout', () => {
  it('clears the session cookie with matching options', async () => {
    const req = {} as unknown as AdminRequest;
    const res = createMockRes();

    await logout(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith(
      'admin_session',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'none' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('me', () => {
  it("returns the authenticated admin's email", async () => {
    const req = { admin: { email: config.adminEmail } } as unknown as AdminRequest;
    const res = createMockRes();

    await me(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ email: config.adminEmail });
  });

  it('rejects when req.admin is not set', async () => {
    const req = {} as unknown as AdminRequest;
    const res = createMockRes();

    await expect(me(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });
});
