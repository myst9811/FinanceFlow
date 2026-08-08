# Admin Panel with Google SSO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/admin` area, fully separate from the consumer app's auth stack, authenticated via Google SSO and restricted to a single allowlisted email, with a first-pass dashboard (system stats, paginated user list, deactivate/reactivate).

**Architecture:** Backend: a new `/api/admin` router carrying its own httpOnly-cookie JWT session (`ADMIN_JWT_SECRET`, distinct from the consumer `JWT_SECRET`), a Google ID token verified server-side via `google-auth-library`, and an explicit `Origin`-header CSRF check on every admin route (not just mutations). Frontend: a parallel `AdminAuthContext`/`useAdminAuth`/`adminApiClient` stack that never touches the consumer `AuthContext`/`apiClient`/`localStorage` token, Google Identity Services loaded only on `/admin/login`. Full rationale for every security tradeoff: `docs/superpowers/specs/2026-08-08-admin-google-sso-design.md`.

**Tech Stack:** `google-auth-library`, `cookie-parser` (new backend deps), Vitest (existing, real Postgres test DB), React 19 + react-router-dom v7 + axios (existing frontend stack), Google Identity Services (`accounts.google.com/gsi/client`, loaded at runtime, not an npm dependency).

---

### Task 1: Dependencies and `User.isActive` migration

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json`
- Create: `backend/prisma/migrations/20260808125552_add_user_isactive/migration.sql`
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Create the feature branch**

Run: `git checkout -b feature/admin-google-sso` (from `main`, which already has both admin-SSO spec commits: `083a830`, `6b83cf2`).

- [ ] **Step 2: Install the new backend dependencies**

Run: `cd backend && npm install google-auth-library cookie-parser && npm install -D @types/cookie-parser`

Expected: `package.json` gains `"google-auth-library": "^11.0.0"` and `"cookie-parser": "^1.4.7"` under `dependencies`, `"@types/cookie-parser": "^1.4.10"` under `devDependencies`.

- [ ] **Step 3: Add `isActive` to the `User` model**

In `backend/prisma/schema.prisma`, add one field to `model User` (placed between `lastName` and `createdAt`, matching the existing field order convention):

```prisma
model User {
  // ...existing fields (id, email, password, firstName, lastName)...
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  // ...rest unchanged...
}
```

- [ ] **Step 4: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_user_isactive`

Expected: creates `backend/prisma/migrations/20260808125552_add_user_isactive/migration.sql` containing exactly:

```sql
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
```

Applies automatically to the dev database. Also apply to the test database:

Run: `DATABASE_URL="$(grep DATABASE_URL .env.test | cut -d= -f2-)" npx prisma migrate deploy`

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "Add google-auth-library, cookie-parser, and User.isActive"
```

---

### Task 2: Deactivation check in the existing login controller

**Files:**
- Modify: `backend/src/controllers/auth.controller.ts`

- [ ] **Step 1: Add the check**

In `login`, immediately after the existing password-verification block (`bcrypt.compare` check that throws `401 Invalid email or password`), add:

```typescript
if (!user.isActive) {
  throw new ApiError(403, 'Account deactivated');
}
```

This must come strictly after password verification, never before — by this point the password has already been proven correct, so returning a specific "deactivated" message (rather than the generic invalid-credentials message) leaks nothing to an attacker who never gets past the password check.

- [ ] **Step 2: Commit**

```bash
git add backend/src/controllers/auth.controller.ts
git commit -m "Reject login for deactivated users"
```

---

### Task 3: Backend config — three new required env vars

**Files:**
- Modify: `backend/src/config/env.ts`, `backend/.env.example`, `backend/.env.test.example`
- Modify (gitignored, local only): `backend/.env`, `backend/.env.test`

- [ ] **Step 1: Extend `AppConfig` and `loadConfig`**

In `backend/src/config/env.ts`, add to the `AppConfig` interface:

```typescript
export interface AppConfig {
  // ...existing fields...
  googleClientId: string;
  adminJwtSecret: string;
  adminEmail: string;
}
```

And to `loadConfig()`'s return object:

```typescript
return {
  // ...existing fields...
  googleClientId: required('GOOGLE_CLIENT_ID'),
  adminJwtSecret: required('ADMIN_JWT_SECRET'),
  adminEmail: required('ADMIN_EMAIL'),
};
```

All three are required (no fallback) — the app cannot start without them once this lands, so local `.env`/`.env.test` must be updated in the same step (Step 3 below) or every backend command will fail immediately with `Missing required environment variable: ...`.

- [ ] **Step 2: Update the example env files**

Append to `backend/.env.example`:

```
# Admin panel (/admin) - Google SSO. Client ID comes from a Google Cloud
# Console OAuth 2.0 Client ID (Web application type, no client secret
# needed for this flow - see docs/superpowers/specs/2026-08-08-admin-google-sso-design.md).
GOOGLE_CLIENT_ID=replace-with-your-google-oauth-client-id
# Separate secret from JWT_SECRET - a leak of one shouldn't compromise the other.
ADMIN_JWT_SECRET=replace-with-a-different-long-random-secret
# The only email allowed to authenticate into /admin.
ADMIN_EMAIL=replace-with-the-admin-email
```

Append to `backend/.env.test.example`:

```
# verifyGoogleIdToken is mocked in tests, so this value is never actually
# checked against Google - only needs to be present so config/env.ts doesn't
# throw on startup.
GOOGLE_CLIENT_ID=test-google-client-id
ADMIN_JWT_SECRET=test-admin-secret-do-not-use-in-production
ADMIN_EMAIL=admin-test@example.com
```

- [ ] **Step 3: Sync local env files (not committed)**

Copy the same three vars into local `backend/.env` and `backend/.env.test` (both gitignored). For `backend/.env`, set `ADMIN_EMAIL` to the Google account you want to allowlist for admin access, and use a real random `ADMIN_JWT_SECRET` (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); `GOOGLE_CLIENT_ID` can stay a placeholder until Task 15 (the real Google Cloud Console credential isn't needed for any backend test — they mock `verifyGoogleIdToken` — only for a real end-to-end browser sign-in). For `backend/.env.test`, copy the `.env.test.example` values verbatim.

- [ ] **Step 4: Verify the app still boots**

Run: `cd backend && npm run build && node -e "require('./dist/config/env.js')"`
Expected: no `Missing required environment variable` error.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/env.ts backend/.env.example backend/.env.test.example
git commit -m "Add GOOGLE_CLIENT_ID, ADMIN_JWT_SECRET, ADMIN_EMAIL config"
```

---

### Task 4: Admin request type and Google ID token verification

**Files:**
- Create: `backend/src/types/admin.types.ts`
- Create: `backend/src/lib/googleAuth.ts`

- [ ] **Step 1: Create the admin request type**

Create `backend/src/types/admin.types.ts`:

```typescript
import { Request } from 'express';

export interface AdminRequest extends Request {
  admin?: {
    email: string;
  };
}
```

- [ ] **Step 2: Create the Google token verification helper**

Create `backend/src/lib/googleAuth.ts`:

```typescript
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';

export const googleClient = new OAuth2Client(config.googleClientId);

export async function verifyGoogleIdToken(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });
  return ticket.getPayload();
}
```

`verifyIdToken` throws a plain `Error` on a malformed/invalid token — callers need only a single try/catch, no special error-type handling.

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/admin.types.ts backend/src/lib/googleAuth.ts
git commit -m "Add admin request type and Google ID token verification"
```

---

### Task 5: CSRF middleware + test

**Files:**
- Create: `backend/src/middleware/csrf.middleware.ts`
- Test: `backend/src/middleware/__tests__/csrf.middleware.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/middleware/__tests__/csrf.middleware.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/middleware/__tests__/csrf.middleware.test.ts`
Expected: FAIL — `requireTrustedOrigin` doesn't exist yet.

- [ ] **Step 3: Implement the middleware**

Create `backend/src/middleware/csrf.middleware.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!origin || !config.corsOrigins.includes(origin)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/middleware/__tests__/csrf.middleware.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  3 passed (3)`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/csrf.middleware.ts backend/src/middleware/__tests__/csrf.middleware.test.ts
git commit -m "Add CSRF Origin-check middleware for admin routes"
```

---

### Task 6: Google auth rate limiter

**Files:**
- Modify: `backend/src/middleware/rateLimit.middleware.ts`

- [ ] **Step 1: Add `googleAuthLimiter`**

In `backend/src/middleware/rateLimit.middleware.ts`, add alongside the existing `loginLimiter`/`registerLimiter`:

```typescript
export const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many login attempts from this IP, please try again later.',
    });
  },
});
```

10/15min/IP: this endpoint can't be brute-forced the way a password can (an attacker needs a valid Google-signed token for the exact admin email), but each call still performs a real cryptographic verification and shouldn't be floodable.

- [ ] **Step 2: Commit**

```bash
git add backend/src/middleware/rateLimit.middleware.ts
git commit -m "Add rate limiter for admin Google auth endpoint"
```

---

### Task 7: `requireAdmin` middleware + test

**Files:**
- Create: `backend/src/middleware/adminAuth.middleware.ts`
- Test: `backend/src/middleware/__tests__/adminAuth.middleware.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/middleware/__tests__/adminAuth.middleware.test.ts`:

```typescript
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
```

The last case simulates rotating `ADMIN_EMAIL` after a compromise: a validly-signed old token must not keep working.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/middleware/__tests__/adminAuth.middleware.test.ts`
Expected: FAIL — `requireAdmin` doesn't exist yet.

- [ ] **Step 3: Implement the middleware**

Create `backend/src/middleware/adminAuth.middleware.ts`:

```typescript
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { AdminRequest } from '../types/admin.types';

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.admin_session;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.adminJwtSecret) as { email: string };
    if (payload.email.toLowerCase() !== config.adminEmail.toLowerCase()) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    req.admin = { email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
}
```

The explicit re-check against `config.adminEmail` (not just "is this validly signed") is what makes rotating `ADMIN_EMAIL` immediately revoke any already-issued token for the old email, rather than waiting for its own expiry.

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/middleware/__tests__/adminAuth.middleware.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  4 passed (4)`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/adminAuth.middleware.ts backend/src/middleware/__tests__/adminAuth.middleware.test.ts
git commit -m "Add requireAdmin session-verification middleware"
```

---

### Task 8: Admin auth controller (Google login, logout, me) + tests

**Files:**
- Create: `backend/src/controllers/admin/auth.controller.ts`
- Test: `backend/src/controllers/admin/__tests__/auth.controller.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/controllers/admin/__tests__/auth.controller.test.ts`:

```typescript
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
```

Mocking strategy note: `vi.spyOn(googleAuthLib, 'verifyGoogleIdToken')` works correctly here even though `auth.controller.ts` imports `verifyGoogleIdToken` as a direct named import, because the test imports the whole module as a namespace (`import * as googleAuthLib from '../../../lib/googleAuth'`) and spies on that namespace object — verified empirically while writing this feature.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/controllers/admin/__tests__/auth.controller.test.ts`
Expected: FAIL — `googleLogin`/`logout`/`me` don't exist yet.

- [ ] **Step 3: Implement the controller**

Create `backend/src/controllers/admin/auth.controller.ts`:

```typescript
import { Request, Response, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { verifyGoogleIdToken } from '../../lib/googleAuth';
import { AdminRequest } from '../../types/admin.types';

const COOKIE_NAME = 'admin_session';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
};

export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  const { credential } = req.body;

  if (!credential) {
    throw new ApiError(400, 'Missing credential');
  }

  let payload;
  try {
    payload = await verifyGoogleIdToken(credential);
  } catch {
    throw new ApiError(403, 'Not authorized');
  }

  if (
    !payload ||
    payload.email_verified !== true ||
    payload.email?.toLowerCase() !== config.adminEmail.toLowerCase()
  ) {
    throw new ApiError(403, 'Not authorized');
  }

  const token = jwt.sign({ email: payload.email }, config.adminJwtSecret, { expiresIn: '1h' });

  res.cookie(COOKIE_NAME, token, {
    ...baseCookieOptions,
    maxAge: 60 * 60 * 1000,
  });

  res.status(200).json({ email: payload.email });
};

export const logout = async (req: AdminRequest, res: Response): Promise<void> => {
  res.clearCookie(COOKIE_NAME, baseCookieOptions);
  res.status(200).json({ message: 'Logged out' });
};

export const me = async (req: AdminRequest, res: Response): Promise<void> => {
  if (!req.admin) {
    throw new ApiError(401, 'Not authenticated');
  }
  res.status(200).json({ email: req.admin.email });
};
```

`googleLogin` uses the same generic `403 Not authorized` for both "invalid token" and "valid token, wrong email" so the response never reveals which case occurred.

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/controllers/admin/__tests__/auth.controller.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  8 passed (8)`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/admin/auth.controller.ts backend/src/controllers/admin/__tests__/auth.controller.test.ts
git commit -m "Add admin Google SSO login/logout/me controller"
```

---

### Task 9: Admin stats controller

**Files:**
- Create: `backend/src/controllers/admin/stats.controller.ts`

- [ ] **Step 1: Implement `getStats`**

Create `backend/src/controllers/admin/stats.controller.ts`:

```typescript
import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { AdminRequest } from '../../types/admin.types';

export const getStats = async (req: AdminRequest, res: Response): Promise<void> => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalUsers, totalAccounts, totalTransactions, totalGoals, recentSignups] = await Promise.all([
    prisma.user.count(),
    prisma.account.count(),
    prisma.transaction.count(),
    prisma.goal.count(),
    prisma.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
  ]);

  const signupsByDay: Record<string, number> = {};
  for (const { createdAt } of recentSignups) {
    const day = createdAt.toISOString().slice(0, 10);
    signupsByDay[day] = (signupsByDay[day] || 0) + 1;
  }

  res.status(200).json({
    stats: { totalUsers, totalAccounts, totalTransactions, totalGoals, signupsByDay },
  });
};
```

Bucketing signups by day happens in JS rather than a raw SQL date-truncation query or `prisma.user.groupBy`, matching this codebase's existing preference for plain application-level aggregation over raw SQL.

- [ ] **Step 2: Commit**

```bash
git add backend/src/controllers/admin/stats.controller.ts
git commit -m "Add admin stats controller"
```

---

### Task 10: Admin users controller + real-DB test

**Files:**
- Create: `backend/src/controllers/admin/users.controller.ts`
- Test: `backend/src/controllers/admin/__tests__/users.controller.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/controllers/admin/__tests__/users.controller.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../lib/prisma';
import { login } from '../../auth.controller';
import { getUsers, updateUserStatus } from '../users.controller';
import type { AdminRequest } from '../../../types/admin.types';

function createMockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

const testUserIds: string[] = [];

async function createTestUser(overrides: { email?: string; isActive?: boolean } = {}) {
  const email = overrides.email ?? `admin-users-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

describe('getUsers', () => {
  it('returns newly created users with correct fields and no password', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    const req = { query: {} } as unknown as AdminRequest;
    const res = createMockRes();

    await getUsers(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as any).mock.calls[0][0];

    const foundA = body.users.find((u: any) => u.id === userA.id);
    const foundB = body.users.find((u: any) => u.id === userB.id);
    expect(foundA).toBeDefined();
    expect(foundB).toBeDefined();
    expect(foundA.email).toBe(userA.email);
    expect(foundA.isActive).toBe(true);
    expect(foundA._count).toEqual({ accounts: 0, transactions: 0, goals: 0 });
    expect(foundA.password).toBeUndefined();
    expect(body.totalCount).toBeGreaterThanOrEqual(2);
  });

  it('respects page and limit query params', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const userC = await createTestUser();

    const page1Req = { query: { page: '1', limit: '2' } } as unknown as AdminRequest;
    const page1Res = createMockRes();
    await getUsers(page1Req, page1Res);
    const page1Body = (page1Res.json as any).mock.calls[0][0];

    expect(page1Body.users).toHaveLength(2);
    expect(page1Body.page).toBe(1);
    expect(page1Body.limit).toBe(2);
    expect(page1Body.users[0].id).toBe(userC.id);
    expect(page1Body.users[1].id).toBe(userB.id);

    const page2Req = { query: { page: '2', limit: '2' } } as unknown as AdminRequest;
    const page2Res = createMockRes();
    await getUsers(page2Req, page2Res);
    const page2Body = (page2Res.json as any).mock.calls[0][0];

    const page2Ids = page2Body.users.map((u: any) => u.id);
    expect(page2Ids).not.toContain(userC.id);
    expect(page2Ids).not.toContain(userB.id);
    expect(page2Body.totalCount).toBe(page1Body.totalCount);
    expect(page2Body.totalPages).toBe(Math.ceil(page1Body.totalCount / 2));

    const allReq = { query: { limit: String(page1Body.totalCount) } } as unknown as AdminRequest;
    const allRes = createMockRes();
    await getUsers(allReq, allRes);
    const allIds = (allRes.json as any).mock.calls[0][0].users.map((u: any) => u.id);
    expect(allIds).toContain(userA.id);
  });
});

describe('updateUserStatus', () => {
  it('flips isActive to false and back to true', async () => {
    const user = await createTestUser();

    const deactivateReq = {
      params: { id: user.id },
      body: { isActive: false },
    } as unknown as AdminRequest;
    const deactivateRes = createMockRes();

    await updateUserStatus(deactivateReq, deactivateRes);

    expect(deactivateRes.status).toHaveBeenCalledWith(200);
    const deactivatedBody = (deactivateRes.json as any).mock.calls[0][0];
    expect(deactivatedBody.user.isActive).toBe(false);

    const dbUserAfterDeactivate = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUserAfterDeactivate?.isActive).toBe(false);

    const reactivateReq = {
      params: { id: user.id },
      body: { isActive: true },
    } as unknown as AdminRequest;
    const reactivateRes = createMockRes();

    await updateUserStatus(reactivateReq, reactivateRes);

    const dbUserAfterReactivate = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUserAfterReactivate?.isActive).toBe(true);
    expect((reactivateRes.json as any).mock.calls[0][0].user.isActive).toBe(true);
  });

  it('rejects a non-boolean isActive with 400', async () => {
    const user = await createTestUser();

    const req = {
      params: { id: user.id },
      body: { isActive: 'nope' },
    } as unknown as AdminRequest;
    const res = createMockRes();

    await expect(updateUserStatus(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns 404 for a nonexistent user id', async () => {
    const req = {
      params: { id: 'not-a-real-id' },
      body: { isActive: false },
    } as unknown as AdminRequest;
    const res = createMockRes();

    await expect(updateUserStatus(req, res)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('causes a subsequent login attempt by the deactivated user to fail with 403', async () => {
    const email = `admin-users-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const user = await createTestUser({ email, isActive: true });

    await updateUserStatus(
      { params: { id: user.id }, body: { isActive: false } } as unknown as AdminRequest,
      createMockRes()
    );

    const loginReq = { body: { email, password: 'Password1' } } as unknown as Request;
    const loginRes = createMockRes();

    await expect(login(loginReq, loginRes)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Account deactivated',
    });
  });
});
```

Note on the pagination test: `getUsers` has no `where` scoping (it lists every user in the table), so exact `totalCount` assertions would be unreliable against a shared dev/test database that may already have rows. The test instead uses relative checks (`toBeGreaterThanOrEqual`, cross-page consistency, "our IDs are/aren't on this page") — safe because `vitest.config.ts` sets `fileParallelism: false`, so no other test file runs concurrently and mutates the `User` table mid-test.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/controllers/admin/__tests__/users.controller.test.ts`
Expected: FAIL — `getUsers`/`updateUserStatus` don't exist yet.

- [ ] **Step 3: Implement the controller**

Create `backend/src/controllers/admin/users.controller.ts`:

```typescript
import { Response } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination';
import { AdminRequest } from '../../types/admin.types';

const USER_LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  createdAt: true,
  isActive: true,
  _count: {
    select: { accounts: true, transactions: true, goals: true },
  },
} as const;

export const getUsers = async (req: AdminRequest, res: Response): Promise<void> => {
  const pagination = parsePagination(req.query);

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      select: USER_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.user.count(),
  ]);

  res.status(200).json({
    users,
    count: users.length,
    ...buildPaginationMeta(totalCount, pagination.page, pagination.limit),
  });
};

export const updateUserStatus = async (req: AdminRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive must be a boolean value');
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(404, 'User not found');
  }

  const user = await prisma.user.update({
    where: { id },
    data: { isActive },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      isActive: true,
    },
  });

  res.status(200).json({ user });
};
```

Uses the existing `utils/pagination.ts` helper — same `page`/`limit`/`totalCount`/`totalPages` shape as the rest of the API. Neither the list nor the update select ever includes `password`.

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/controllers/admin/__tests__/users.controller.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  6 passed (6)`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/admin/users.controller.ts backend/src/controllers/admin/__tests__/users.controller.test.ts
git commit -m "Add admin users controller (list, deactivate/reactivate)"
```

---

### Task 11: Admin router and `server.ts` wiring

**Files:**
- Create: `backend/src/routes/admin.routes.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Create the router**

Create `backend/src/routes/admin.routes.ts`:

```typescript
import { Router } from 'express';
import { googleLogin, logout, me } from '../controllers/admin/auth.controller';
import { getStats } from '../controllers/admin/stats.controller';
import { getUsers, updateUserStatus } from '../controllers/admin/users.controller';
import { requireAdmin } from '../middleware/adminAuth.middleware';
import { requireTrustedOrigin } from '../middleware/csrf.middleware';
import { googleAuthLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Every admin route requires a trusted Origin, including reads - the
// existing CORS middleware in server.ts allows any *.vercel.app origin
// (for the consumer app's own preview deployments), which would otherwise
// let an attacker-controlled Vercel-hosted page read credentialed admin
// data via a forged cross-site request.
router.use(requireTrustedOrigin);

router.post('/auth/google', googleAuthLimiter, googleLogin);
router.post('/auth/logout', requireAdmin, logout);
router.get('/auth/me', requireAdmin, me);

router.get('/stats', requireAdmin, getStats);
router.get('/users', requireAdmin, getUsers);
router.patch('/users/:id/status', requireAdmin, updateUserStatus);

export default router;
```

`requireTrustedOrigin` applies to the *entire* router via `router.use()`, not just the mutating routes — GETs are read-only but not risk-free: the consumer app's CORS wildcard for `*.vercel.app` would otherwise let an attacker-controlled preview-deployment page read credentialed admin JSON via a forged request, even though it can't cause a state change.

- [ ] **Step 2: Wire cookie-parser, CORS credentials, and the router into `server.ts`**

In `backend/src/server.ts`:

1. Add imports:
```typescript
import cookieParser from 'cookie-parser';
import adminRoutes from './routes/admin.routes';
```

2. Add `credentials: true` to the existing `cors({...})` options object (the one with the custom `origin` callback), with a comment explaining why:
```typescript
app.use(cors({
  origin: (origin, callback) => {
    // ...existing logic, unchanged...
  },
  // Required for the admin panel's httpOnly session cookie - without this,
  // browsers won't send or accept cookies on cross-origin requests at all,
  // regardless of the cookie's own SameSite/Secure settings. The regular
  // consumer API doesn't use cookies (Bearer tokens instead), so this has
  // no effect on it.
  credentials: true,
}));
```

3. Add `app.use(cookieParser())` before the route mounts (after `express.urlencoded`):
```typescript
app.use(cookieParser());
```

4. Mount the router after the existing route mounts:
```typescript
app.use('/api/admin', adminRoutes);
```

- [ ] **Step 3: Manual smoke check**

Run: `cd backend && npm run build && npm start &` then `curl -i http://localhost:3001/api/admin/auth/me -H "Origin: http://localhost:5173"`
Expected: `401 {"error":"Not authenticated"}` (trusted origin passes the CSRF check, then `requireAdmin` correctly rejects the missing cookie). Stop the server afterward.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin.routes.ts backend/src/server.ts
git commit -m "Mount admin routes with cookie parsing and CORS credentials"
```

---

### Task 12: Backend full verification

**Files:** none

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: `Test Files  12 passed (12)`, `Tests  86 passed (86)` (verified — 71 pre-existing + 3 CSRF + 4 adminAuth + 8 admin auth controller + 6 admin users controller — actual pre-existing count may differ slightly by the time this runs; confirm the new total is the pre-existing count plus 21).

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: exits 0, no TypeScript errors.

---

### Task 13: Frontend admin types, API client, service layer

**Files:**
- Create: `frontend/src/types/admin.types.ts`
- Create: `frontend/src/lib/adminApiClient.ts`
- Create: `frontend/src/services/admin.service.ts`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Create the admin types**

Create `frontend/src/types/admin.types.ts`:

```typescript
export interface AdminUser {
  email: string;
}

export interface AdminStats {
  totalUsers: number;
  totalAccounts: number;
  totalTransactions: number;
  totalGoals: number;
  signupsByDay: Record<string, number>;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  isActive: boolean;
  _count: {
    accounts: number;
    transactions: number;
    goals: number;
  };
}

export interface AdminUsersResponse {
  users: AdminUserListItem[];
  count: number;
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}
```

- [ ] **Step 2: Create a separate admin API client**

Create `frontend/src/lib/adminApiClient.ts`:

```typescript
import axios, { AxiosInstance } from 'axios';
import { API_CONFIG } from '../config/api.config';

// Deliberately separate from `apiClient.ts`: the admin panel authenticates
// via an httpOnly session cookie, not a bearer token in localStorage, so it
// must not share the regular client's Authorization-header injection or its
// 401 handling (which clears the consumer auth token and redirects to
// `/login`). Every request carries credentials so the browser sends/accepts
// the `admin_session` cookie across the frontend/backend origins.
const adminApiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default adminApiClient;
```

- [ ] **Step 3: Create the admin service**

Create `frontend/src/services/admin.service.ts`:

```typescript
import adminApiClient from '../lib/adminApiClient';
import { AdminStats, AdminUser, AdminUsersResponse } from '../types/admin.types';

class AdminService {
  async loginWithGoogle(credential: string): Promise<AdminUser> {
    const response = await adminApiClient.post<AdminUser>('/admin/auth/google', { credential });
    return response.data;
  }

  async logout(): Promise<void> {
    await adminApiClient.post('/admin/auth/logout');
  }

  async getCurrentAdmin(): Promise<AdminUser> {
    const response = await adminApiClient.get<AdminUser>('/admin/auth/me');
    return response.data;
  }

  async getStats(): Promise<AdminStats> {
    const response = await adminApiClient.get<{ stats: AdminStats }>('/admin/stats');
    return response.data.stats;
  }

  async getUsers(page = 1, limit = 20): Promise<AdminUsersResponse> {
    const response = await adminApiClient.get<AdminUsersResponse>('/admin/users', {
      params: { page, limit },
    });
    return response.data;
  }

  async updateUserStatus(id: string, isActive: boolean): Promise<void> {
    await adminApiClient.patch(`/admin/users/${id}/status`, { isActive });
  }
}

export default new AdminService();
```

- [ ] **Step 4: Add the frontend env var**

Append to `frontend/.env.example`:

```
# Google OAuth 2.0 Web client ID used by the admin panel's Google Sign-In
# button (Google Cloud Console > APIs & Services > Credentials). Must match
# the backend's GOOGLE_CLIENT_ID.
VITE_GOOGLE_CLIENT_ID=
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/admin.types.ts frontend/src/lib/adminApiClient.ts frontend/src/services/admin.service.ts frontend/.env.example
git commit -m "Add admin API client, service, and types"
```

---

### Task 14: Admin auth context and hook

**Files:**
- Create: `frontend/src/contexts/admin-auth-context.ts`
- Create: `frontend/src/contexts/AdminAuthContext.tsx`
- Create: `frontend/src/hooks/useAdminAuth.ts`

- [ ] **Step 1: Create the context definition**

Create `frontend/src/contexts/admin-auth-context.ts`:

```typescript
import { createContext } from 'react';
import { AdminUser } from '../types/admin.types';

export interface AdminAuthContextType {
  admin: AdminUser | null;
  loading: boolean;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

export const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);
```

- [ ] **Step 2: Create the provider**

Create `frontend/src/contexts/AdminAuthContext.tsx`:

```typescript
import React, { useState, useEffect, ReactNode } from 'react';
import adminService from '../services/admin.service';
import { AdminUser } from '../types/admin.types';
import { AdminAuthContext } from './admin-auth-context';

export const AdminAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAdminAuth = async () => {
      try {
        const currentAdmin = await adminService.getCurrentAdmin();
        setAdmin(currentAdmin);
      } catch {
        setAdmin(null);
      } finally {
        setLoading(false);
      }
    };

    initAdminAuth();
  }, []);

  const loginWithGoogle = async (credential: string) => {
    const loggedInAdmin = await adminService.loginWithGoogle(credential);
    setAdmin(loggedInAdmin);
  };

  const logout = async () => {
    await adminService.logout();
    setAdmin(null);
  };

  const value = {
    admin,
    loading,
    loginWithGoogle,
    logout,
    isAuthenticated: !!admin,
  };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};
```

Unlike the consumer `AuthProvider` (which skips its `/auth/me` call when there's no `localStorage` token to check), this provider *always* calls `GET /admin/auth/me` on mount — the session cookie is httpOnly and invisible to JS by design, so asking the backend is the only way to know whether a valid session exists.

- [ ] **Step 3: Create the hook**

Create `frontend/src/hooks/useAdminAuth.ts`:

```typescript
import { useContext } from 'react';
import { AdminAuthContext, AdminAuthContextType } from '../contexts/admin-auth-context';

export const useAdminAuth = (): AdminAuthContextType => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/contexts/admin-auth-context.ts frontend/src/contexts/AdminAuthContext.tsx frontend/src/hooks/useAdminAuth.ts
git commit -m "Add AdminAuthContext and useAdminAuth"
```

---

### Task 15: Admin route guard and layout

**Files:**
- Create: `frontend/src/components/admin/AdminLayout.tsx`
- Create: `frontend/src/components/admin/AdminRoute.tsx`

- [ ] **Step 1: Create the layout**

Create `frontend/src/components/admin/AdminLayout.tsx`:

```typescript
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
  }`;

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { admin, logout } = useAdminAuth();

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              ChronosFin Admin
            </span>
            <div className="flex gap-1">
              <NavLink to="/admin" end className={navLinkClasses}>
                Dashboard
              </NavLink>
              <NavLink to="/admin/users" className={navLinkClasses}>
                Users
              </NavLink>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{admin?.email}</span>
            <button
              onClick={() => logout()}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
};

export default AdminLayout;
```

Deliberately styled distinctly (dark theme) from the consumer app's light `Layout`/`Sidebar`/`Header` — an unmistakable visual signal that this is the admin surface, not shared component code (the consumer `Layout` reads from the consumer `AuthContext`, which wouldn't be in scope here anyway).

- [ ] **Step 2: Create the route guard**

Create `frontend/src/components/admin/AdminRoute.tsx`:

```typescript
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import AdminLayout from './AdminLayout';

const AdminRoute = () => {
  const { isAuthenticated, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
};

export default AdminRoute;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/AdminLayout.tsx frontend/src/components/admin/AdminRoute.tsx
git commit -m "Add AdminLayout and AdminRoute guard"
```

---

### Task 16: Google Identity Services type declarations and admin config

**Files:**
- Create: `frontend/src/types/google-identity.d.ts`
- Create: `frontend/src/config/admin.config.ts`

- [ ] **Step 1: Declare the `window.google` shape**

Create `frontend/src/types/google-identity.d.ts`:

```typescript
interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleButtonConfiguration {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  width?: number;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: GoogleIdConfiguration) => void;
        renderButton: (parent: HTMLElement, options: GoogleButtonConfiguration) => void;
      };
    };
  };
}
```

- [ ] **Step 2: Add the admin config module**

Create `frontend/src/config/admin.config.ts`:

```typescript
export const ADMIN_CONFIG = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/google-identity.d.ts frontend/src/config/admin.config.ts
git commit -m "Add Google Identity Services types and admin config"
```

---

### Task 17: Admin login page (Google Identity Services integration)

**Files:**
- Create: `frontend/src/pages/admin/AdminLogin.tsx`

- [ ] **Step 1: Implement the page**

Create `frontend/src/pages/admin/AdminLogin.tsx`:

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

const AdminLogin = () => {
  const { loginWithGoogle } = useAdminAuth();
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState(false);

  useEffect(() => {
    if (!ADMIN_CONFIG.googleClientId) {
      return;
    }

    let cancelled = false;

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: ADMIN_CONFIG.googleClientId,
          callback: async (response) => {
            setError(null);
            try {
              await loginWithGoogle(response.credential);
              navigate('/admin');
            } catch (err) {
              const status = (err as AxiosError).response?.status;
              setError(status === 403 ? 'This Google account is not authorized for admin access.' : 'Sign-in failed. Please try again.');
            }
          },
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          width: 280,
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
  }, [loginWithGoogle, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">ChronosFin Admin</p>
        <h1 className="mb-6 text-xl font-bold text-white">Sign in</h1>

        {error && (
          <div className="mb-4 rounded-md bg-red-950 p-3 text-sm text-red-400">{error}</div>
        )}

        {!ADMIN_CONFIG.googleClientId ? (
          <div className="rounded-md bg-yellow-950 p-3 text-sm text-yellow-400">
            Admin sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID to enable it.
          </div>
        ) : scriptError ? (
          <div className="rounded-md bg-red-950 p-3 text-sm text-red-400">
            Could not load Google Sign-In. Check your connection and reload.
          </div>
        ) : (
          <div className="flex justify-center" ref={buttonRef} />
        )}
      </div>
    </div>
  );
};

export default AdminLogin;
```

The GSI script is loaded dynamically only on this route (not globally in `index.html`), so regular consumer-app visitors never load Google's script. No `google.accounts.id.prompt()` (the auto-triggering One Tap UI) — this is a single-admin tool, an explicit button click is more predictable than an auto-prompt.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminLogin.tsx
git commit -m "Add admin login page with Google Identity Services"
```

---

### Task 18: Admin dashboard and users pages

**Files:**
- Create: `frontend/src/pages/admin/AdminDashboard.tsx`
- Create: `frontend/src/pages/admin/AdminUsers.tsx`

- [ ] **Step 1: Implement the dashboard**

Create `frontend/src/pages/admin/AdminDashboard.tsx`:

```typescript
import { useEffect, useState } from 'react';
import adminService from '../../services/admin.service';
import { AdminStats } from '../../types/admin.types';

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
    <p className="text-sm text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-bold text-white">{value.toLocaleString()}</p>
  </div>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService
      .getStats()
      .then(setStats)
      .catch(() => setError('Failed to load stats.'));
  }, []);

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (!stats) {
    return <p className="text-gray-500">Loading...</p>;
  }

  const signupDays = Object.keys(stats.signupsByDay).sort();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">System-wide stats across all users.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total users" value={stats.totalUsers} />
        <StatCard label="Total accounts" value={stats.totalAccounts} />
        <StatCard label="Total transactions" value={stats.totalTransactions} />
        <StatCard label="Total goals" value={stats.totalGoals} />
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-400">Signups, last 30 days</h2>
        {signupDays.length === 0 ? (
          <p className="text-sm text-gray-500">No signups in this window.</p>
        ) : (
          <ul className="space-y-1">
            {signupDays.map((day) => (
              <li key={day} className="flex justify-between text-sm">
                <span className="text-gray-400">{day}</span>
                <span className="font-medium text-white">{stats.signupsByDay[day]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
```

- [ ] **Step 2: Implement the users page**

Create `frontend/src/pages/admin/AdminUsers.tsx`:

```typescript
import { useEffect, useState } from 'react';
import adminService from '../../services/admin.service';
import { AdminUserListItem } from '../../types/admin.types';

const PAGE_SIZE = 20;

const AdminUsers = () => {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadUsers = async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminService.getUsers(targetPage, PAGE_SIZE);
      setUsers(response.users);
      setTotalPages(response.totalPages);
      setPage(response.page);
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(1);
  }, []);

  const handleToggleActive = async (user: AdminUserListItem) => {
    setPendingId(user.id);
    try {
      await adminService.updateUserStatus(user.id, !user.isActive);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)));
    } catch {
      setError(`Failed to update ${user.email}.`);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="mt-1 text-sm text-gray-500">Deactivating a user immediately blocks their login.</p>
      </div>

      {error && <div className="rounded-md bg-red-950 p-3 text-sm text-red-400">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="min-w-full divide-y divide-gray-800">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Joined</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Accounts</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-950">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-white">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">{user.email}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                    {user._count.accounts} acct · {user._count.transactions} txn · {user._count.goals} goal
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.isActive ? 'bg-green-950 text-green-400' : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                    <button
                      onClick={() => handleToggleActive(user)}
                      disabled={pendingId === user.id}
                      className="font-medium text-primary-500 hover:text-primary-600 disabled:opacity-50"
                    >
                      {user.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <button
            onClick={() => loadUsers(page - 1)}
            disabled={page <= 1 || loading}
            className="rounded-md px-3 py-1.5 hover:bg-gray-800 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => loadUsers(page + 1)}
            disabled={page >= totalPages || loading}
            className="rounded-md px-3 py-1.5 hover:bg-gray-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/AdminDashboard.tsx frontend/src/pages/admin/AdminUsers.tsx
git commit -m "Add admin dashboard and users pages"
```

---

### Task 19: Wire admin routes into `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add the imports**

```typescript
import AdminRoute from './components/admin/AdminRoute';
import { AdminAuthProvider } from './contexts/AdminAuthContext';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
```

Also change the existing `react-router-dom` import to include `Outlet`:

```typescript
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
```

- [ ] **Step 2: Add the admin route subtree**

Inside `<Routes>`, after the existing `ProtectedRoute` block and before the catch-all `*` route:

```typescript
<Route
  path="/admin/*"
  element={
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  }
>
  <Route path="login" element={<AdminLogin />} />
  <Route element={<AdminRoute />}>
    <Route index element={<AdminDashboard />} />
    <Route path="users" element={<AdminUsers />} />
  </Route>
</Route>
```

`AdminAuthProvider` wraps only this subtree (not the whole app) — admin auth state has no reason to exist outside `/admin/*`, and scoping it here keeps it structurally separate from the consumer `AuthProvider` at the app root. `/admin` itself (the index route) renders `AdminDashboard` directly rather than redirecting to a separate `/admin/dashboard` path — simpler than the two-path structure sketched in the design spec, with no behavioral difference.

- [ ] **Step 3: Typecheck and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "Wire admin routes into App.tsx"
```

---

### Task 20: Frontend verification (lint, build, browser-driven check)

**Files:** none

- [ ] **Step 1: Lint**

Run: `cd frontend && npm run lint`
Expected: exits 0, no errors.

- [ ] **Step 2: Start the backend and frontend dev servers**

Run backend: `cd backend && npm run dev` (background)
Run frontend: `cd frontend && npm run dev` (background)

- [ ] **Step 3: Browser-driven check with Playwright (no real Google account needed for this part)**

Write a throwaway script (e.g. to a scratch directory) using `playwright`'s `chromium.launch()`:

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

// Unauthenticated /admin and /admin/users must redirect to /admin/login.
await page.goto('http://localhost:5173/admin');
console.log(page.url()); // expect .../admin/login

await page.goto('http://localhost:5173/admin/users');
console.log(page.url()); // expect .../admin/login

// /admin/login renders and (with no VITE_GOOGLE_CLIENT_ID set) shows the
// "not configured" state rather than a broken button.
await page.goto('http://localhost:5173/admin/login');
console.log(await page.textContent('body')); // expect "ChronosFin Admin", "Sign in"

await browser.close();
```

Expected: both protected routes redirect to `/admin/login`; the login page renders "ChronosFin Admin" / "Sign in"; with no `VITE_GOOGLE_CLIENT_ID` set, it shows "Admin sign-in is not configured" rather than a broken Google button. Optionally re-run with `VITE_GOOGLE_CLIENT_ID` set to any placeholder value (restart the frontend dev server with that env var) to confirm the Google Identity Services script itself loads without a page-level JS error — Google's own SDK will log `[GSI_LOGGER]: The given client ID is not found` for a fake ID, which is the expected failure mode for an invalid (not missing) client ID, not a bug in this code.

- [ ] **Step 4: Stop the dev servers** started in Step 2.

---

### Task 21: Full verification, push, PR

**Files:** none

- [ ] **Step 1: Re-run both test suites from a clean checkout state**

Run: `cd backend && npm test && npm run build`
Run: `cd frontend && npx tsc --noEmit && npm run build && npm run lint`

Expected: backend `Test Files  12 passed (12)`, `Tests  86 passed (86)`; both builds and the frontend lint exit 0.

- [ ] **Step 2: Get a real Google OAuth Client ID before merging (blocking for real end-to-end use, not for this PR's own tests)**

Ask the repo owner for a Google Cloud Console OAuth 2.0 Client ID: **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**, Authorized JavaScript origins `https://chronosfin-web.vercel.app`, `https://chronosfin.shannensaikia.in`, `http://localhost:5173`. No redirect URI, no client secret. Once obtained: set `GOOGLE_CLIENT_ID`/`ADMIN_JWT_SECRET`/`ADMIN_EMAIL` in the backend Vercel project's env vars, `VITE_GOOGLE_CLIENT_ID` in the frontend Vercel project's env vars, and the same `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` value in local `.env` files. This step doesn't block landing the code itself (every automated test mocks `verifyGoogleIdToken`), only a real interactive sign-in.

- [ ] **Step 3: Push and open a PR**

```bash
git push -u origin feature/admin-google-sso
gh pr create \
  --title "Admin panel with Google SSO" \
  --body "$(cat <<'EOF'
## Summary
- New /admin area: Google SSO login restricted to a single allowlisted email, httpOnly-cookie session with its own JWT secret, explicit Origin-header CSRF check on every admin route (not just mutations)
- Fully separate auth stack from the consumer app end to end: separate backend middleware/controller/routes, separate frontend context/hook/API client - no shared code path with the existing User/JWT/localStorage system
- Dashboard: system-wide stats (user/account/transaction/goal counts, 30-day signups). Users page: paginated list with deactivate/reactivate (deactivation immediately blocks that user's login with a 403)
- Design: docs/superpowers/specs/2026-08-08-admin-google-sso-design.md
- Plan: docs/superpowers/plans/2026-08-08-admin-google-sso.md

## Test plan
- [x] Backend: npm test - 86/86 passing (verified locally)
- [x] Backend: npm run build - clean
- [x] Frontend: tsc --noEmit, npm run build, npm run lint - all clean
- [x] Playwright-driven check: unauthenticated /admin and /admin/users redirect to /admin/login; login page renders correctly; Google Identity Services script loads without a page-level error
- [ ] Real interactive Google sign-in - needs a real GOOGLE_CLIENT_ID (not yet provisioned); everything up to that point is verified
- Note: CI (PR #8) is still paused per the account's $0 Actions budget cap, so this PR has no automated check - verification above was run locally
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 4: Leave the PR for review**

Do not auto-merge — hand back to the user to decide whether to merge now (and provision the real Google Client ID afterward) or review first.

---
