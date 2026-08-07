# Auth Security (Rate Limiting + First-Pass Auth Tests) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rate limit `/api/auth/login` and `/api/auth/register`, fix the `trust proxy` gap that would otherwise make those limits share one bucket across all users behind Vercel's edge proxy, and add a first pass of tests covering `auth.controller.ts` and the cross-user authorization boundary on goals.

**Architecture:** New `express-rate-limit`-based middleware applied per-route (not globally); `app.set('trust proxy', 1)` in `server.ts`; three new test files following this repo's existing "real test DB, no mocked Prisma" convention, calling controllers/middleware directly rather than via `supertest`. Full rationale in `docs/superpowers/specs/2026-08-07-auth-security-design.md`.

**Tech Stack:** `express-rate-limit` (new dependency), Vitest (existing), real Postgres test DB (existing `financeflow_test`, see `docs/SETUP.md`).

---

### Task 1: Branch and dependency

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json`

- [ ] **Step 1: Create the feature branch**

Run: `git checkout -b feature/auth-security` (from `main`, which already has both auth-security spec commits).

- [ ] **Step 2: Install the dependency**

Run: `cd backend && npm install express-rate-limit`
Expected: `package.json` gains `"express-rate-limit": "^8.x.x"` under `dependencies`; `package-lock.json` updates accordingly.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "Add express-rate-limit dependency"
```

---

### Task 2: Rate limiter middleware + its unit test

**Files:**
- Create: `backend/src/middleware/rateLimit.middleware.ts`
- Test: `backend/src/middleware/__tests__/rateLimit.middleware.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/middleware/__tests__/rateLimit.middleware.test.ts`:

```typescript
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
```

Note: the mock `req` needs `headers: {}` and `app: { get: () => false }` — `express-rate-limit`'s internal trust-proxy validation reads both, and omitting them throws `TypeError: Cannot read properties of undefined` (verified empirically while writing this plan).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/middleware/__tests__/rateLimit.middleware.test.ts`
Expected: FAIL — `Cannot find module '../rateLimit.middleware'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/middleware/rateLimit.middleware.ts`:

```typescript
import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many login attempts from this IP, please try again later.',
    });
  },
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many accounts created from this IP, please try again later.',
    });
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/middleware/__tests__/rateLimit.middleware.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  2 passed (2)` (verified).

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/rateLimit.middleware.ts backend/src/middleware/__tests__/rateLimit.middleware.test.ts
git commit -m "Add login/register rate limiter middleware"
```

---

### Task 3: Wire limiters into routes, fix trust proxy

**Files:**
- Modify: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Apply the limiters per-route**

In `backend/src/routes/auth.routes.ts`, change:

```typescript
import { Router } from 'express';
import { register, login, getCurrentUser } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
```

to:

```typescript
import { Router } from 'express';
import { register, login, getCurrentUser } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Public routes
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
```

(The rest of the file — the `/me` route and export — is unchanged.)

- [ ] **Step 2: Set `trust proxy` in `server.ts`**

In `backend/src/server.ts`, change:

```typescript
const app = express();


// Middleware

app.use(helmet());
```

to:

```typescript
const app = express();

// Trust the first proxy hop (Vercel's edge network sits in front of the
// deployed function). Without this, req.ip resolves to the proxy's address
// for every client, which would make the auth rate limiters below share one
// bucket across all users instead of limiting per client.
app.set('trust proxy', 1);

// Middleware

app.use(helmet());
```

- [ ] **Step 3: Verify the build still passes**

Run: `cd backend && npm run build`
Expected: no output, exit code 0 (verified).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/auth.routes.ts backend/src/server.ts
git commit -m "Wire rate limiters into auth routes; set trust proxy"
```

---

### Task 4: `auth.controller.ts` tests

**Files:**
- Test: `backend/src/controllers/__tests__/auth.controller.test.ts`

- [ ] **Step 1: Create the directory and test file**

Run: `mkdir -p backend/src/controllers/__tests__`

Create `backend/src/controllers/__tests__/auth.controller.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run the test**

Run: `cd backend && npx vitest run src/controllers/__tests__/auth.controller.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  8 passed (8)` (verified — no separate "fails first" step here since the controller code being tested already exists; this file is pure test-writing, not TDD-driven new implementation).

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/__tests__/auth.controller.test.ts
git commit -m "Add auth.controller tests: register, login, getCurrentUser"
```

---

### Task 5: Cross-user authorization test on goals

**Files:**
- Test: `backend/src/controllers/__tests__/goal.controller.test.ts`

- [ ] **Step 1: Create the test file**

Create `backend/src/controllers/__tests__/goal.controller.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { getGoalById, updateGoal, deleteGoal } from '../goal.controller';
import type { AuthenticatedRequest } from '../../types/goal.types';

function createMockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

let userAId: string;
let userBId: string;
let goalOwnedByUserAId: string;

beforeEach(async () => {
  const userA = await prisma.user.create({
    data: {
      email: `test-a-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      firstName: 'User',
      lastName: 'A',
    },
  });
  userAId = userA.id;

  const userB = await prisma.user.create({
    data: {
      email: `test-b-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      firstName: 'User',
      lastName: 'B',
    },
  });
  userBId = userB.id;

  const goal = await prisma.goal.create({
    data: {
      userId: userAId,
      title: 'User A Goal',
      targetAmount: 1000,
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      category: 'OTHER',
    },
  });
  goalOwnedByUserAId = goal.id;
});

afterEach(async () => {
  await prisma.goal.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
});

function reqAsUserB(overrides: Record<string, unknown> = {}): AuthenticatedRequest {
  return {
    params: { id: goalOwnedByUserAId },
    user: { userId: userBId, email: 'user-b@example.com' },
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

describe('goal.controller cross-user authorization', () => {
  it("getGoalById returns 404 for another user's goal", async () => {
    const res = createMockRes();
    await expect(getGoalById(reqAsUserB(), res)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Goal not found',
    });
  });

  it("updateGoal returns 404 for another user's goal", async () => {
    const req = reqAsUserB({ body: { title: 'Hijacked' } });
    const res = createMockRes();
    await expect(updateGoal(req, res)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Goal not found',
    });
  });

  it("deleteGoal returns 404 for another user's goal", async () => {
    const res = createMockRes();
    await expect(deleteGoal(reqAsUserB(), res)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Goal not found',
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/controllers/__tests__/goal.controller.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  3 passed (3)` (verified).

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/__tests__/goal.controller.test.ts
git commit -m "Add cross-user authorization test for goal.controller"
```

---

### Task 6: Full verification, push, PR

**Files:** none

- [ ] **Step 1: Run the full suite and build**

Run: `cd backend && npm test && npm run build`
Expected: `Test Files  6 passed (6)`, `Tests  52 passed (52)` (39 pre-existing + 2 + 8 + 3 new), build exits 0 (verified).

- [ ] **Step 2: Push and open a PR**

```bash
git push -u origin feature/auth-security
gh pr create \
  --title "Auth security: rate limiting + first-pass auth tests" \
  --body "$(cat <<'EOF'
## Summary
- Rate limits POST /api/auth/login (5/15min) and POST /api/auth/register (10/hour) via express-rate-limit
- Sets app.set('trust proxy', 1) in server.ts - without it, req.ip resolves to Vercel's edge proxy for every client, so the limiters above would share one bucket across all users instead of limiting per-client
- Adds auth.controller tests (register/login/getCurrentUser) and a cross-user authorization test on goal.controller (user B gets 404, not 403, when accessing user A's goal)
- Design: docs/superpowers/specs/2026-08-07-auth-security-design.md

## Test plan
- [x] npm test - 52/52 passing (verified locally)
- [x] npm run build - clean
- Note: CI (PR #8) is still paused per the account's $0 Actions budget cap, so this PR has no automated check - verification above was run locally
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 3: Leave the PR for review**

Unlike the CI task, do not auto-merge — hand back to the user to decide whether to merge now or review first, since there's no CI check to lean on as a safety net this time.

---
