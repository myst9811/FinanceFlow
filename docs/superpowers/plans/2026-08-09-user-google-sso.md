# Google Sign-In for Regular Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Sign-In as an additional login/registration method for regular ChronosFin users, alongside existing email/password, with account linking keyed on Google's stable `sub` identifier (never email), replay-protected via a single-use nonce, and with deactivated users' existing sessions actually revoked.

**Architecture:** Three new backend endpoints (`GET /api/auth/nonce`, `POST /api/auth/google`, `POST /api/auth/google/link`) reuse the existing `verifyGoogleIdToken`/`GOOGLE_CLIENT_ID` infrastructure built for admin SSO. `authenticateToken` gains an `isActive` DB check. Frontend gets a shared `GoogleSignInButton`, wired into `Login`/`Register`/a new `Settings` page.

**Tech Stack:** Express 5, Prisma/PostgreSQL, `google-auth-library` (already a dependency), React 19, `react-router-dom` v7. No new dependencies.

**Reference:** `docs/superpowers/specs/2026-08-09-user-google-sso-design.md` (approved design, revision 2).

---

### Task 1: Schema migration — optional password, unique googleSubject

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Update the User model**

In `backend/prisma/schema.prisma`, change:

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  firstName String
  lastName  String
  isActive  Boolean  @default(true)
```

to:

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  password      String?
  googleSubject String?  @unique
  firstName     String
  lastName      String
  isActive      Boolean  @default(true)
```

- [ ] **Step 2: Generate and apply the migration locally**

Run: `cd backend && npx prisma migrate dev --name add_google_auth_fields`
Expected: creates `backend/prisma/migrations/<timestamp>_add_google_auth_fields/migration.sql` containing `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;` and `ALTER TABLE "users" ADD COLUMN "googleSubject" TEXT; CREATE UNIQUE INDEX ...`, applies it to the local dev DB, and regenerates the Prisma client.

- [ ] **Step 3: Apply the same migration to the test database**

Run: `cd backend && DATABASE_URL="postgresql://chronosfin:chronosfin@localhost:5433/chronosfin_test?schema=public" npx prisma migrate deploy`
Expected: the new migration applies cleanly (no error). Without this, every test added in later tasks will fail with "column does not exist."

- [ ] **Step 4: Verify the backend still builds**

Run: `cd backend && npm run build`
Expected: clean (no TypeScript errors from the now-optional `password` field — nothing references it as non-nullable yet outside `login`, which Task 3 fixes).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "Add optional password and unique googleSubject to User"
```

---

### Task 2: Nonce store and endpoint

**Files:**
- Create: `backend/src/lib/googleNonceStore.ts`
- Create: `backend/src/lib/__tests__/googleNonceStore.test.ts`
- Modify: `backend/src/controllers/auth.controller.ts`
- Modify: `backend/src/routes/auth.routes.ts`

- [ ] **Step 1: Write the failing test**

`backend/src/lib/__tests__/googleNonceStore.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { issueNonce, consumeNonce } from '../googleNonceStore';

describe('googleNonceStore', () => {
  it('consumes a freshly issued nonce exactly once', () => {
    const nonce = issueNonce();
    expect(consumeNonce(nonce)).toBe(true);
    expect(consumeNonce(nonce)).toBe(false);
  });

  it('rejects an unknown nonce', () => {
    expect(consumeNonce('not-a-real-nonce')).toBe(false);
  });

  it('rejects undefined', () => {
    expect(consumeNonce(undefined)).toBe(false);
  });

  it('issues distinct values on each call', () => {
    const a = issueNonce();
    const b = issueNonce();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/lib/__tests__/googleNonceStore.test.ts`
Expected: FAIL — `Cannot find module '../googleNonceStore'`.

- [ ] **Step 3: Implement the store**

`backend/src/lib/googleNonceStore.ts`:

```typescript
import { randomUUID } from 'crypto';

const NONCE_TTL_MS = 5 * 60 * 1000;
const pending = new Map<string, number>(); // nonce -> expiresAt

export function issueNonce(): string {
  const nonce = randomUUID();
  pending.set(nonce, Date.now() + NONCE_TTL_MS);
  return nonce;
}

export function consumeNonce(nonce: string | undefined): boolean {
  if (!nonce) return false;
  const expiresAt = pending.get(nonce);
  pending.delete(nonce); // single-use regardless of outcome
  return expiresAt !== undefined && expiresAt > Date.now();
}
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `cd backend && npx vitest run src/lib/__tests__/googleNonceStore.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Add the endpoint**

In `backend/src/controllers/auth.controller.ts`, add near the top (after existing imports):

```typescript
import { issueNonce } from '../lib/googleNonceStore';
```

Add a new exported function (after `getCurrentUser`):

```typescript
export const getGoogleNonce = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ nonce: issueNonce() });
};
```

In `backend/src/routes/auth.routes.ts`, add the import and route:

```typescript
import { register, login, getCurrentUser, getGoogleNonce } from '../controllers/auth.controller';
```

```typescript
router.get('/nonce', getGoogleNonce);
```
(placed with the other public routes, above the `/me` protected route)

- [ ] **Step 6: Verify build**

Run: `cd backend && npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/googleNonceStore.ts backend/src/lib/__tests__/googleNonceStore.test.ts backend/src/controllers/auth.controller.ts backend/src/routes/auth.routes.ts
git commit -m "Add single-use nonce store and GET /api/auth/nonce"
```

---

### Task 3: `authenticateToken` checks `isActive`

**Files:**
- Modify: `backend/src/middleware/auth.middleware.ts`
- Create: `backend/src/middleware/__tests__/auth.middleware.test.ts`

- [ ] **Step 1: Write the failing test**

`backend/src/middleware/__tests__/auth.middleware.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/middleware/__tests__/auth.middleware.test.ts`
Expected: FAIL on the "deactivated" case (currently `next()` still gets called — the middleware doesn't check `isActive` yet).

- [ ] **Step 3: Update the middleware**

Replace `backend/src/middleware/auth.middleware.ts` entirely with:

```typescript
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest, JwtPayload } from '../types/auth.types';

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { isActive: true },
    });
    if (!user || !user.isActive) {
      res.status(403).json({ error: 'Account deactivated' });
      return;
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    res.status(500).json({ error: 'Authentication error' });
  }
};
```

- [ ] **Step 4: Run the tests again to verify they pass**

Run: `cd backend && npx vitest run src/middleware/__tests__/auth.middleware.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all pass — this middleware is used by every protected route (`accounts`, `transactions`, `goals`, `insights`), so this step confirms the change doesn't break any of them for the normal active-user case.

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/auth.middleware.ts backend/src/middleware/__tests__/auth.middleware.test.ts
git commit -m "authenticateToken: reject requests from deactivated users"
```

---

### Task 4: `login` rejects password auth for Google-only accounts

**Files:**
- Modify: `backend/src/controllers/auth.controller.ts`
- Modify: `backend/src/controllers/__tests__/auth.controller.test.ts`

- [ ] **Step 1: Write the failing test**

In `backend/src/controllers/__tests__/auth.controller.test.ts`, inside the existing `describe('login', ...)` block, add:

```typescript
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/controllers/__tests__/auth.controller.test.ts -t "Google-only"`
Expected: FAIL — `bcrypt.compare` throws (`Illegal arguments: string, object` or similar) since `user.password` is `null`, resulting in an unhandled rejection rather than the expected `ApiError` with `statusCode: 401`.

- [ ] **Step 3: Fix `login`**

In `backend/src/controllers/auth.controller.ts`, change:

```typescript
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }
```

to:

```typescript
  if (!user || !user.password) {
    throw new ApiError(401, 'Invalid email or password');
  }
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `cd backend && npx vitest run src/controllers/__tests__/auth.controller.test.ts -t "Google-only"`
Expected: PASS.

- [ ] **Step 5: Run the full auth controller test file**

Run: `cd backend && npx vitest run src/controllers/__tests__/auth.controller.test.ts`
Expected: all pass (confirms the existing password-login tests for real password accounts are unaffected).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/auth.controller.ts backend/src/controllers/__tests__/auth.controller.test.ts
git commit -m "login: reject password auth for accounts with no password set"
```

---

### Task 5: `POST /api/auth/google` — sign in / register via Google

**Files:**
- Modify: `backend/src/controllers/auth.controller.ts`
- Modify: `backend/src/routes/auth.routes.ts`
- Create: `backend/src/controllers/__tests__/auth.controller.google.test.ts`

- [ ] **Step 1: Write the failing tests**

`backend/src/controllers/__tests__/auth.controller.google.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/controllers/__tests__/auth.controller.google.test.ts`
Expected: FAIL — `googleLogin is not a function` (not exported yet).

- [ ] **Step 3: Implement `googleLogin`**

In `backend/src/controllers/auth.controller.ts`, add to the imports:

```typescript
import { verifyGoogleIdToken } from '../lib/googleAuth';
import { issueNonce, consumeNonce } from '../lib/googleNonceStore';
```

(Note: `issueNonce` was already added to imports in Task 2 for `getGoogleNonce` — just add `consumeNonce` alongside it there instead of a second import line.)

Add the new exported function:

```typescript
export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  const credential = req.body?.credential;
  if (!credential) {
    throw new ApiError(400, 'Missing credential');
  }

  let payload;
  try {
    payload = await verifyGoogleIdToken(credential);
  } catch {
    throw new ApiError(403, 'Not authorized');
  }

  if (!payload || payload.email_verified !== true || !payload.email || !payload.sub) {
    throw new ApiError(403, 'Not authorized');
  }
  if (!consumeNonce(payload.nonce)) {
    throw new ApiError(403, 'Invalid or expired sign-in attempt');
  }

  let user = await prisma.user.findUnique({ where: { googleSubject: payload.sub } });

  if (!user) {
    const email = payload.email.toLowerCase();
    const emailCollision = await prisma.user.findUnique({ where: { email } });
    if (emailCollision) {
      throw new ApiError(409, 'An account with this email already exists. Log in and link Google from Settings.');
    }

    user = await prisma.user.create({
      data: {
        email,
        password: null,
        googleSubject: payload.sub,
        firstName: payload.given_name?.trim() || 'ChronosFin',
        lastName: payload.family_name?.trim() || 'User',
      },
    });
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account deactivated');
  }

  const jwtPayload: JwtPayload = { userId: user.id, email: user.email };
  const token = jwt.sign(jwtPayload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);

  res.status(200).json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    token,
  });
};
```

- [ ] **Step 4: Wire the route**

In `backend/src/routes/auth.routes.ts`:

```typescript
import { register, login, getCurrentUser, getGoogleNonce, googleLogin } from '../controllers/auth.controller';
import { loginLimiter, registerLimiter, googleAuthLimiter } from '../middleware/rateLimit.middleware';
```

```typescript
router.post('/google', googleAuthLimiter, googleLogin);
```
(with the other public routes)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/controllers/__tests__/auth.controller.google.test.ts`
Expected: PASS (7/7).

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/auth.controller.ts backend/src/routes/auth.routes.ts backend/src/controllers/__tests__/auth.controller.google.test.ts
git commit -m "Add POST /api/auth/google: sign in or register via Google, keyed on sub"
```

---

### Task 6: `POST /api/auth/google/link` — link Google to an authenticated account

**Files:**
- Modify: `backend/src/controllers/auth.controller.ts`
- Modify: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/controllers/__tests__/auth.controller.google.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/controllers/__tests__/auth.controller.google.test.ts`:

```typescript
import bcrypt from 'bcryptjs';
import { linkGoogleAccount } from '../auth.controller';
import type { AuthenticatedRequest } from '../../types/auth.types';

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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/controllers/__tests__/auth.controller.google.test.ts -t "linkGoogleAccount"`
Expected: FAIL — `linkGoogleAccount is not a function`.

- [ ] **Step 3: Implement `linkGoogleAccount`**

No new import needed — `AuthenticatedRequest` is already imported in this file (used by `getCurrentUser`):

```typescript
import {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  JwtPayload,
  AuthenticatedRequest,
} from '../types/auth.types';
```

Add the new exported function:

```typescript
export const linkGoogleAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const credential = req.body?.credential;
  if (!credential || !req.user) {
    throw new ApiError(400, 'Missing credential');
  }

  let payload;
  try {
    payload = await verifyGoogleIdToken(credential);
  } catch {
    throw new ApiError(403, 'Not authorized');
  }

  if (!payload || payload.email_verified !== true || !payload.sub) {
    throw new ApiError(403, 'Not authorized');
  }
  if (!consumeNonce(payload.nonce)) {
    throw new ApiError(403, 'Invalid or expired sign-in attempt');
  }

  const existingLink = await prisma.user.findUnique({ where: { googleSubject: payload.sub } });
  if (existingLink && existingLink.id !== req.user.userId) {
    throw new ApiError(409, 'This Google account is already linked to a different ChronosFin account');
  }

  await prisma.user.update({
    where: { id: req.user.userId },
    data: { googleSubject: payload.sub },
  });

  res.status(200).json({ linked: true });
};
```

- [ ] **Step 4: Wire the route**

In `backend/src/routes/auth.routes.ts`:

```typescript
import { register, login, getCurrentUser, getGoogleNonce, googleLogin, linkGoogleAccount } from '../controllers/auth.controller';
```

```typescript
router.post('/google/link', authenticateToken, googleAuthLimiter, linkGoogleAccount);
```
(with the protected routes, alongside `/me`)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/controllers/__tests__/auth.controller.google.test.ts`
Expected: PASS (10/10 total in this file).

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/auth.controller.ts backend/src/routes/auth.routes.ts backend/src/controllers/__tests__/auth.controller.google.test.ts
git commit -m "Add POST /api/auth/google/link: attach Google sub to an authenticated account"
```

---

### Task 7: `getCurrentUser` exposes `googleLinked`

**Files:**
- Modify: `backend/src/controllers/auth.controller.ts`
- Modify: `backend/src/controllers/__tests__/auth.controller.test.ts`

- [ ] **Step 1: Write the failing test**

In `backend/src/controllers/__tests__/auth.controller.test.ts`, inside the existing `describe('getCurrentUser', ...)` block (if none exists, add one alongside `describe('login', ...)`), add:

```typescript
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
```

(add `getCurrentUser` to the existing import from `../auth.controller` at the top of the file if not already imported)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run src/controllers/__tests__/auth.controller.test.ts -t "googleLinked"`
Expected: FAIL — `body.user.googleLinked` is `undefined`.

- [ ] **Step 3: Update `getCurrentUser`**

In `backend/src/controllers/auth.controller.ts`, change:

```typescript
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json({ user });
```

to:

```typescript
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      googleSubject: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const { googleSubject, ...rest } = user;
  res.status(200).json({ user: { ...rest, googleLinked: Boolean(googleSubject) } });
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `cd backend && npx vitest run src/controllers/__tests__/auth.controller.test.ts`
Expected: all pass.

- [ ] **Step 5: Run the full backend test suite and build**

Run: `cd backend && npm test && npm run build`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/auth.controller.ts backend/src/controllers/__tests__/auth.controller.test.ts
git commit -m "getCurrentUser: expose googleLinked instead of raw googleSubject"
```

---

### Task 8: Frontend — shared Google Identity utilities

**Files:**
- Modify: `frontend/src/types/google-identity.d.ts`
- Create: `frontend/src/lib/googleIdentity.ts`
- Modify: `frontend/src/pages/admin/AdminLogin.tsx`

- [ ] **Step 1: Add `nonce` to the GSI config type**

In `frontend/src/types/google-identity.d.ts`, change:

```typescript
interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}
```

to:

```typescript
interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  nonce?: string;
}
```

- [ ] **Step 2: Extract the shared script loader**

Create `frontend/src/lib/googleIdentity.ts`:

```typescript
const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.body.appendChild(script);
  });
}
```

- [ ] **Step 3: Update `AdminLogin.tsx` to use the shared loader**

In `frontend/src/pages/admin/AdminLogin.tsx`, replace:

```typescript
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { ADMIN_CONFIG } from '../../config/admin.config';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.body.appendChild(script);
  });
}
```

with:

```typescript
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { ADMIN_CONFIG } from '../../config/admin.config';
import { loadGoogleIdentityScript } from '../../lib/googleIdentity';
```

Nothing else in `AdminLogin.tsx` changes — the rest of the file already calls `loadGoogleIdentityScript()` by that name.

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/google-identity.d.ts frontend/src/lib/googleIdentity.ts frontend/src/pages/admin/AdminLogin.tsx
git commit -m "Extract shared Google Identity script loader; add nonce to GSI config type"
```

---

### Task 9: Frontend — auth service, context, and API types

**Files:**
- Modify: `frontend/src/types/api.types.ts`
- Modify: `frontend/src/services/auth.service.ts`
- Modify: `frontend/src/contexts/auth-context.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Add `googleLinked` to the `User` type**

In `frontend/src/types/api.types.ts`, change:

```typescript
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}
```

to:

```typescript
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  googleLinked?: boolean;
}
```

(optional, since `AuthResponse.user` from `login`/`register`/`googleLogin` doesn't include it — only `getCurrentUser` does)

- [ ] **Step 2: Add service methods**

In `frontend/src/services/auth.service.ts`, add inside the `AuthService` class (after `register`, before `getCurrentUser`):

```typescript
  async getGoogleNonce(): Promise<string> {
    const response = await apiClient.get<{ nonce: string }>('/auth/nonce');
    return response.data.nonce;
  }

  async loginWithGoogle(credential: string): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/google', { credential });
    if (response.data.token) {
      localStorage.setItem(AUTH_TOKEN_KEY, response.data.token);
    }
    return response.data;
  }

  async linkGoogleAccount(credential: string): Promise<void> {
    await apiClient.post('/auth/google/link', { credential });
  }
```

- [ ] **Step 3: Add `loginWithGoogle` to the context type**

In `frontend/src/contexts/auth-context.ts`, change:

```typescript
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}
```

to:

```typescript
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}
```

- [ ] **Step 4: Implement it in the provider**

In `frontend/src/contexts/AuthContext.tsx`, add after the existing `register` function:

```typescript
  const loginWithGoogle = async (credential: string) => {
    const response = await authService.loginWithGoogle(credential);
    setUser(response.user);
  };
```

Add `loginWithGoogle` to the `value` object:

```typescript
  const value = {
    user,
    loading,
    login,
    register,
    loginWithGoogle,
    logout,
    isAuthenticated: !!user,
  };
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/api.types.ts frontend/src/services/auth.service.ts frontend/src/contexts/auth-context.ts frontend/src/contexts/AuthContext.tsx
git commit -m "Add loginWithGoogle/linkGoogleAccount to auth service and context"
```

---

### Task 10: Frontend — shared `GoogleSignInButton`

**Files:**
- Create: `frontend/src/components/auth/GoogleSignInButton.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentityScript } from '../../lib/googleIdentity';
import authService from '../../services/auth.service';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

type GoogleSignInButtonProps = {
  onCredential: (credential: string) => Promise<void>;
};

const GoogleSignInButton = ({ onCredential }: GoogleSignInButtonProps) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptError, setScriptError] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }

    let cancelled = false;

    loadGoogleIdentityScript()
      .then(async () => {
        if (cancelled || !buttonRef.current || !window.google) {
          return;
        }

        const nonce = await authService.getGoogleNonce();
        if (cancelled || !buttonRef.current || !window.google) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce,
          callback: (response) => {
            onCredential(response.credential);
          },
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          width: 320,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setScriptError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  if (scriptError) {
    return (
      <p className="text-center text-sm text-red-600">
        Could not load Google Sign-In. Check your connection and reload.
      </p>
    );
  }

  return <div className="flex justify-center" ref={buttonRef} />;
};

export default GoogleSignInButton;
```

Note: the nonce is fetched fresh (a new `GET /auth/nonce` call) each time this component mounts/re-initializes, immediately before `initialize()` — matching the design's requirement that the nonce passed to Google is the one the backend will check against.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/auth/GoogleSignInButton.tsx
git commit -m "Add shared GoogleSignInButton component"
```

---

### Task 11: Frontend — wire Google Sign-In into Login and Register

**Files:**
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/pages/Register.tsx`

- [ ] **Step 1: Update `Login.tsx`**

Add the import:

```typescript
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
```

Add inside the component, alongside `login`:

```typescript
  const { login, loginWithGoogle } = useAuth();
```

Add a handler (near `handleSubmit`):

```typescript
  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    try {
      await loginWithGoogle(credential);
      navigate('/');
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Sign-in failed';
      setError(message);
    }
  };
```

Render the button below the form's closing `</form>` tag, before the "Don't have an account?" paragraph:

```tsx
        <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
          <div className="h-px flex-1 bg-gray-200" />
          OR
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <GoogleSignInButton onCredential={handleGoogleCredential} />
```

- [ ] **Step 2: Update `Register.tsx`**

Add the import:

```typescript
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
```

Add inside the component, alongside `register`:

```typescript
  const { register, loginWithGoogle } = useAuth();
```

Add a handler (near `handleSubmit`):

```typescript
  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    try {
      await loginWithGoogle(credential);
      navigate('/');
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Sign-in failed';
      setError(message);
    }
  };
```

Render the button below the form's closing `</form>` tag, before the "Already have an account?" paragraph:

```tsx
        <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
          <div className="h-px flex-1 bg-gray-200" />
          OR
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <GoogleSignInButton onCredential={handleGoogleCredential} />
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 4: Manual check**

Run: `npm run dev:frontend`, visit `http://localhost:5173/login` and `/register`. Since `VITE_GOOGLE_CLIENT_ID` may not be set locally, confirm the page still renders correctly either way: if unset, no button/divider appears (silent, per `GoogleSignInButton` returning `null`); if set, the "OR" divider and a Google button render below the form. No console errors either way.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Login.tsx frontend/src/pages/Register.tsx
git commit -m "Add Google Sign-In option to Login and Register pages"
```

---

### Task 12: Frontend — Settings page (link Google account)

**Files:**
- Create: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/common/Header.tsx`

- [ ] **Step 1: Create the Settings page**

```tsx
import { useState } from 'react';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import authService from '../services/auth.service';

const Settings = () => {
  const { user } = useAuth();
  const [linked, setLinked] = useState(user?.googleLinked ?? false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    try {
      await authService.linkGoogleAccount(credential);
      setLinked(true);
      setSuccess(true);
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Failed to link Google account';
      setError(message);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

      <div className="card space-y-4 p-6">
        <div>
          <p className="text-sm font-medium text-gray-700">Name</p>
          <p className="text-sm text-gray-500">{user?.firstName} {user?.lastName}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">Email</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">Google account</p>

          {error && (
            <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-700">Google account linked.</div>
          )}

          {linked ? (
            <p className="text-sm text-gray-500">Your Google account is linked. You can sign in with either method.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-gray-500">Link your Google account to also sign in with it.</p>
              <GoogleSignInButton onCredential={handleGoogleCredential} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
```

- [ ] **Step 2: Add the route**

In `frontend/src/App.tsx`, add the import:

```typescript
import Settings from './pages/Settings';
```

Add the route inside the existing `<Route element={<ProtectedRoute />}>` group:

```tsx
        <Route path="/settings" element={<Settings />} />
```

- [ ] **Step 3: Wire the Header's Settings button**

In `frontend/src/components/common/Header.tsx`, add the import:

```typescript
import { useNavigate } from 'react-router-dom';
```

Add inside the component:

```typescript
  const navigate = useNavigate();
```

Find the inert Settings button (inside the profile dropdown):

```tsx
                    <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-3 transition">
                      <Cog6ToothIcon className="h-5 w-5 text-gray-400" />
                      <span>Settings</span>
                    </button>
```

Add an `onClick`:

```tsx
                    <button
                      onClick={() => navigate('/settings')}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-3 transition"
                    >
                      <Cog6ToothIcon className="h-5 w-5 text-gray-400" />
                      <span>Settings</span>
                    </button>
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 5: Manual check**

Run: `npm run dev:frontend`, log in as a regular user, click the profile menu → Settings. Confirm it navigates to `/settings` and shows name/email plus the Google-link section. No console errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Settings.tsx frontend/src/App.tsx frontend/src/components/common/Header.tsx
git commit -m "Add Settings page with Google account linking; wire up Header's Settings button"
```

---

### Task 13: Final verification pass

**Files:** none (verification only; fix forward in the relevant file if something is found)

- [ ] **Step 1: Full backend verification**

Run: `cd backend && npm run build && npm test`
Expected: build clean, all tests pass (existing suite + every test added in Tasks 2-7).

- [ ] **Step 2: Full frontend verification**

Run: `cd frontend && npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 3: Manual smoke test — password login still works**

Run: `npm run dev:backend` and `npm run dev:frontend` (separate terminals). Register a new user with email/password at `/register`, confirm it still works and lands on `/dashboard`. Log out, log back in with the same password at `/login`. Confirms Tasks 3-4's middleware/login changes didn't break the existing password path.

- [ ] **Step 4: Manual smoke test — Google sign-in end to end** (requires `VITE_GOOGLE_CLIENT_ID` and backend `GOOGLE_CLIENT_ID` set locally, per `backend/.env.example`/`frontend/.env.example` — skip this step with a note if not configured in this environment)

Visit `/register`, click the Google button, complete a real Google sign-in. Confirm it creates an account and lands on `/dashboard`. Log out. Visit `/login`, click Google again with the same account — confirm it logs into the same account (not a duplicate).

- [ ] **Step 5: Fix forward if anything failed**

If any step above surfaced an issue, fix it in the relevant file from the task it belongs to, re-run that task's verification, then commit:

```bash
git add -A
git commit -m "Fix up Google SSO after final verification pass"
```

If nothing needed fixing, no commit for this task — it was verification-only.
