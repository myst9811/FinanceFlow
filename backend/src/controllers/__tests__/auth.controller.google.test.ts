import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { Prisma } from '../../generated/prisma';
import { googleLogin, linkGoogleAccount } from '../auth.controller';
import { issueNonce } from '../../lib/googleNonceStore';
import * as googleAuthLib from '../../lib/googleAuth';
import type { AuthenticatedRequest } from '../../types/auth.types';

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

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

  it('consumes the nonce even when the email is unverified, so it cannot be retried', async () => {
    const nonce = issueNonce();
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub: uniqueSub(), email: uniqueEmail(), email_verified: false, nonce,
    } as any);
    const firstReq = { body: { credential: 'fake-token' } } as unknown as Request;
    await expect(googleLogin(firstReq, createMockRes())).rejects.toMatchObject({ statusCode: 403 });

    // Retry with the same (now-stale) nonce, this time with a verified email - must
    // still fail, because the nonce was already burned by the unverified attempt.
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub: uniqueSub(), email: uniqueEmail(), email_verified: true, nonce,
    } as any);
    const secondReq = { body: { credential: 'fake-token-2' } } as unknown as Request;
    await expect(googleLogin(secondReq, createMockRes())).rejects.toMatchObject({ statusCode: 403 });
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

  it('resolves to the winning row instead of a 500 when a concurrent create races on the same sub', async () => {
    const sub = uniqueSub();
    const winner = await prisma.user.create({
      data: { email: uniqueEmail(), password: null, googleSubject: sub, firstName: 'Winner', lastName: 'Race' },
    });
    testUserIds.push(winner.id);

    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub, email: uniqueEmail(), email_verified: true, nonce: issueNonce(),
    } as any);
    vi.spyOn(prisma.user, 'create').mockRejectedValueOnce(p2002(['googleSubject']));

    const req = { body: { credential: 'fake-token' } } as unknown as Request;
    const res = createMockRes();

    await googleLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as any).mock.calls[0][0];
    expect(body.user.id).toBe(winner.id);
  });

  it('returns 409, not a 500, when a concurrent create races on the same email', async () => {
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub: uniqueSub(), email: uniqueEmail(), email_verified: true, nonce: issueNonce(),
    } as any);
    vi.spyOn(prisma.user, 'create').mockRejectedValueOnce(p2002(['email']));

    const req = { body: { credential: 'fake-token' } } as unknown as Request;
    const res = createMockRes();

    await expect(googleLogin(req, res)).rejects.toMatchObject({ statusCode: 409 });
  });
});

async function createPasswordUser() {
  const email = uniqueEmail();
  const user = await prisma.user.create({
    data: { email, password: await bcrypt.hash('Password1', 10), firstName: 'Link', lastName: 'Test' },
  });
  testUserIds.push(user.id);
  return user;
}

describe('linkGoogleAccount', () => {
  it('links a Google sub to the authenticated user', async () => {
    const user = await createPasswordUser();
    const sub = uniqueSub();
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub, email: uniqueEmail(), email_verified: true, nonce: issueNonce(),
    } as any);

    const req = {
      body: { credential: 'fake-token' },
      user: { userId: user.id, email: user.email },
    } as unknown as AuthenticatedRequest;
    const res = createMockRes();

    await linkGoogleAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.googleSubject).toBe(sub);
  });

  it('rejects when the sub is already linked to a different user', async () => {
    const sub = uniqueSub();
    const otherUser = await prisma.user.create({
      data: { email: uniqueEmail(), password: null, googleSubject: sub, firstName: 'Other', lastName: 'User' },
    });
    testUserIds.push(otherUser.id);

    const user = await createPasswordUser();
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub, email: uniqueEmail(), email_verified: true, nonce: issueNonce(),
    } as any);

    const req = {
      body: { credential: 'fake-token' },
      user: { userId: user.id, email: user.email },
    } as unknown as AuthenticatedRequest;
    const res = createMockRes();

    await expect(linkGoogleAccount(req, res)).rejects.toMatchObject({ statusCode: 409 });

    const unchanged = await prisma.user.findUnique({ where: { id: user.id } });
    expect(unchanged?.googleSubject).toBeNull();
  });

  it('rejects a reused nonce', async () => {
    const user = await createPasswordUser();
    const nonce = issueNonce();
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub: uniqueSub(), email: uniqueEmail(), email_verified: true, nonce,
    } as any);
    const req1 = { body: { credential: 't1' }, user: { userId: user.id, email: user.email } } as unknown as AuthenticatedRequest;
    await linkGoogleAccount(req1, createMockRes());

    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub: uniqueSub(), email: uniqueEmail(), email_verified: true, nonce,
    } as any);
    const req2 = { body: { credential: 't2' }, user: { userId: user.id, email: user.email } } as unknown as AuthenticatedRequest;

    await expect(linkGoogleAccount(req2, createMockRes())).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 409, not a 500, when a concurrent link races on the same sub', async () => {
    const user = await createPasswordUser();
    vi.spyOn(googleAuthLib, 'verifyGoogleIdToken').mockResolvedValueOnce({
      sub: uniqueSub(), email: uniqueEmail(), email_verified: true, nonce: issueNonce(),
    } as any);
    vi.spyOn(prisma.user, 'update').mockRejectedValueOnce(p2002(['googleSubject']));

    const req = {
      body: { credential: 'fake-token' },
      user: { userId: user.id, email: user.email },
    } as unknown as AuthenticatedRequest;

    await expect(linkGoogleAccount(req, createMockRes())).rejects.toMatchObject({ statusCode: 409 });
  });
});
