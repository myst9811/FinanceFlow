import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { googleLogin } from '../auth.controller';
import { issueNonce } from '../../lib/googleNonceStore';
import * as googleAuthLib from '../../lib/googleAuth';

function createMockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

const testUserIds: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  if (testUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    testUserIds.length = 0;
  }
});

function uniqueSub(): string {
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function uniqueEmail(): string {
  return `google-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe('googleLogin', () => {
  it('creates a new user for an unknown sub and unknown email', async () => {
    const sub = uniqueSub();
    const email = uniqueEmail();
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub,
      email,
      email_verified: true,
      given_name: 'New',
      family_name: 'User',
      nonce: issueNonce(),
    } as any);

    const req = { body: { credential: 'fake-token' } } as unknown as Request;
    const res = createMockRes();

    await googleLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.user.email).toBe(email);
    expect(typeof body.token).toBe('string');

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).not.toBeNull();
    expect(stored?.googleSubject).toBe(sub);
    testUserIds.push(stored!.id);
  });

  it('resolves to the same user on a second sign-in even if the token email changed', async () => {
    const sub = uniqueSub();
    const originalEmail = uniqueEmail();

    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub, email: originalEmail, email_verified: true, given_name: 'A', family_name: 'B', nonce: issueNonce(),
    } as any);
    const firstReq = { body: { credential: 'fake-token' } } as unknown as Request;
    const firstRes = createMockRes();
    await googleLogin(firstReq, firstRes);
    const firstUserId = (firstRes.json as any).mock.calls[0][0].user.id;
    testUserIds.push(firstUserId);

    const changedEmail = uniqueEmail();
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub, email: changedEmail, email_verified: true, given_name: 'A', family_name: 'B', nonce: issueNonce(),
    } as any);
    const secondReq = { body: { credential: 'fake-token-2' } } as unknown as Request;
    const secondRes = createMockRes();
    await googleLogin(secondReq, secondRes);

    const secondBody = (secondRes.json as any).mock.calls[0][0];
    expect(secondBody.user.id).toBe(firstUserId);
    expect(secondBody.user.email).toBe(originalEmail); // stored email untouched
  });

  it('rejects with 409 when the email already belongs to a different (unlinked) account', async () => {
    const existingEmail = uniqueEmail();
    const existing = await prisma.user.create({
      data: { email: existingEmail, password: 'irrelevant-hash', firstName: 'Existing', lastName: 'User' },
    });
    testUserIds.push(existing.id);

    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub: uniqueSub(), email: existingEmail, email_verified: true, nonce: issueNonce(),
    } as any);

    const req = { body: { credential: 'fake-token' } } as unknown as Request;
    const res = createMockRes();

    await expect(googleLogin(req, res)).rejects.toMatchObject({ statusCode: 409 });

    const unchanged = await prisma.user.findUnique({ where: { id: existing.id } });
    expect(unchanged?.googleSubject).toBeNull();
  });

  it('rejects a reused nonce', async () => {
    const nonce = issueNonce();
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub: uniqueSub(), email: uniqueEmail(), email_verified: true, nonce,
    } as any);
    const firstReq = { body: { credential: 'fake-token' } } as unknown as Request;
    const firstRes = createMockRes();
    const firstBody = await googleLogin(firstReq, firstRes).then(() => (firstRes.json as any).mock.calls[0][0]);
    testUserIds.push(firstBody.user.id);

    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub: uniqueSub(), email: uniqueEmail(), email_verified: true, nonce, // same nonce again
    } as any);
    const secondReq = { body: { credential: 'fake-token-2' } } as unknown as Request;
    const secondRes = createMockRes();

    await expect(googleLogin(secondReq, secondRes)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects an unverified email without creating a user', async () => {
    const email = uniqueEmail();
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub: uniqueSub(), email, email_verified: false, nonce: issueNonce(),
    } as any);

    const req = { body: { credential: 'fake-token' } } as unknown as Request;
    const res = createMockRes();

    await expect(googleLogin(req, res)).rejects.toMatchObject({ statusCode: 403 });
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('rejects when the Google token fails verification', async () => {
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockRejectedValueOnce(new Error('invalid token'));
    const req = { body: { credential: 'garbage' } } as unknown as Request;
    const res = createMockRes();

    await expect(googleLogin(req, res)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects with 400 when req.body is undefined', async () => {
    const req = {} as unknown as Request;
    const res = createMockRes();

    await expect(googleLogin(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});
