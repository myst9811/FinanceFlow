# Observability Minimum Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/health` actually check the database, replace `morgan` with structured JSON logging (`pino`/`pino-http`) including request IDs, and add opt-in Sentry error tracking gated on an optional `SENTRY_DSN`.

**Architecture:** A new `health.controller.ts` (extracted from an inline `server.ts` handler so it's testable), a shared `lib/logger.ts` pino singleton wired into `server.ts` via `pino-http`, and `@sentry/node` initialized conditionally in `server.ts` with capture wired into the existing `errorHandler`. Full rationale in `docs/superpowers/specs/2026-08-08-observability-design.md`.

**Tech Stack:** `pino`, `pino-http`, `@sentry/node` (new dependencies); `morgan`/`@types/morgan` removed.

---

### Task 1: Branch and dependencies

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json`

- [ ] **Step 1: Create the feature branch**

Run: `git checkout -b feature/observability` (from `main`, which has the spec commit).

- [ ] **Step 2: Install new dependencies, remove morgan**

```bash
cd backend
npm install pino pino-http @sentry/node
npm uninstall morgan @types/morgan
```

Expected: `package.json`'s `dependencies` gains `pino`, `pino-http`, `@sentry/node` and loses `morgan`; `devDependencies` loses `@types/morgan`.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "Add pino/pino-http/@sentry/node; remove morgan"
```

---

### Task 2: DB-aware `/health`

**Files:**
- Create: `backend/src/controllers/health.controller.ts`
- Test: `backend/src/controllers/__tests__/health.controller.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/controllers/__tests__/health.controller.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/controllers/__tests__/health.controller.test.ts`
Expected: FAIL — `Cannot find module '../health.controller'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/controllers/health.controller.ts`:

```typescript
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: 'Database unreachable',
    });
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/controllers/__tests__/health.controller.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  2 passed (2)` (verified).

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/health.controller.ts backend/src/controllers/__tests__/health.controller.test.ts
git commit -m "Add DB-aware health check"
```

---

### Task 3: Structured logging with Pino

**Files:**
- Create: `backend/src/lib/logger.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/middleware/error.middleware.ts`

- [ ] **Step 1: Add the shared logger**

Create `backend/src/lib/logger.ts`:

```typescript
import pino from 'pino';

export const logger = pino();
```

- [ ] **Step 2: Wire it into `server.ts`**

Replace the `morgan` import and `app.use(morgan('combined'))` line, and wire in the health controller from Task 2. Full resulting file:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config/env';
import { logger } from './lib/logger';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import transactionRoutes from './routes/transaction.routes';
import goalRoutes from './routes/goal.routes';
import insightRoutes from './routes/insight.routes';
import { healthCheck } from './controllers/health.controller';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';

const app = express();

// Trust the first proxy hop (Vercel's edge network sits in front of the
// deployed function). Without this, req.ip resolves to the proxy's address
// for every client, which would make the auth rate limiters below share one
// bucket across all users instead of limiting per client.
app.set('trust proxy', 1);

// Middleware

app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    try {
      if (/\.vercel\.app$/.test(new URL(origin).hostname)) {
        callback(null, true);
        return;
      }
    } catch (err) {
      callback(err as Error);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
}));

app.use(pinoHttp({ logger }));

app.use((req, res, next) => {
  res.setHeader('X-Request-Id', String(req.id));
  next();
});

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

// Health check

app.get('/health', healthCheck);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/goals', goalRoutes);

app.use('/api/insights', insightRoutes);

// 404 + error handling middleware

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});
```

(This step folds in the Sentry `Sentry.init(...)` block from Task 4 later — do Task 3 and Task 4's `server.ts` edits as one file write if working through the tasks in order, or come back and add the Sentry block from Task 4 Step 2 once you get there. The version above intentionally omits Sentry so this task can be verified independently first.)

- [ ] **Step 3: Update `error.middleware.ts`'s logging call**

In `backend/src/middleware/error.middleware.ts`, replace `console.error(err);` with `req.log.error({ err }, 'Unhandled error');` (the `Sentry.captureException(err)` line alongside it comes from Task 4 — do this replacement now, add the Sentry line in Task 4).

- [ ] **Step 4: Build and manually verify**

Run: `cd backend && npm run build`
Expected: exits 0, no output (verified — `req.log`/`req.id` type-check cleanly because `pino-http`'s `.d.ts` augments `http.IncomingMessage`, which Express's `Request` extends).

Manual smoke test (optional but recommended — this is what was actually run to validate the design):
```bash
npm run dev &
sleep 3
curl -s -i http://localhost:3001/health
kill %1
```
Expected: `200` response with an `X-Request-Id` header present, and the server's stdout shows JSON log lines (a startup message and a request-completion line with `req`/`res`/`responseTime` fields) rather than morgan's plain-text format.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/logger.ts backend/src/server.ts backend/src/middleware/error.middleware.ts
git commit -m "Replace morgan with structured pino logging"
```

---

### Task 4: Opt-in Sentry error tracking

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/middleware/error.middleware.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add the optional `sentryDsn` config field**

In `backend/src/config/env.ts`, add to the `AppConfig` interface:

```typescript
export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  sentryDsn?: string;
}
```

And add to `loadConfig()`'s return statement (after `corsOrigins`):

```typescript
    sentryDsn: process.env.SENTRY_DSN,
```

Note this is deliberately **not** wrapped in `required(...)` — unlike `jwtSecret`/`databaseUrl`, this must stay optional.

- [ ] **Step 2: Initialize Sentry conditionally in `server.ts`**

Add the import and the conditional init, right after the existing imports and before `const app = express();`:

```typescript
import * as Sentry from '@sentry/node';
```

```typescript
if (config.sentryDsn) {
  Sentry.init({ dsn: config.sentryDsn });
}
```

(If Task 3 Step 2 was done as a full-file replacement without this block, add these two pieces now — the import goes alongside the other imports, the `if` block goes between the imports and `const app = express();`.)

- [ ] **Step 3: Capture unexpected errors in `error.middleware.ts`**

Add the import:

```typescript
import * as Sentry from '@sentry/node';
```

And add `Sentry.captureException(err);` right after the `req.log.error(...)` line from Task 3 Step 3, so the generic-500 branch reads:

```typescript
  req.log.error({ err }, 'Unhandled error');
  Sentry.captureException(err);
  res.status(500).json({ error: 'Something went wrong!' });
```

- [ ] **Step 4: Document the optional env var**

In `backend/.env.example`, after the `CORS_ORIGIN` line, add:

```
# Optional. Sentry DSN for error tracking - if unset, Sentry is never
# initialized and the app behaves exactly as without it.
# SENTRY_DSN=
```

- [ ] **Step 5: Verify Sentry is a safe no-op when unset**

This was already confirmed directly (not just assumed) while writing the spec:
```bash
node -e "
const Sentry = require('./node_modules/@sentry/node');
Sentry.captureException(new Error('test, no init'));
console.log('OK: did not throw');
"
```
Expected: `OK: did not throw` (verified) — `captureException` is safe to call even though `Sentry.init` is never reached when `SENTRY_DSN` is unset, which is the case today.

- [ ] **Step 6: Build and run the full suite**

Run: `npm run build`
Expected: exits 0, no output (verified).

Run: `npm test`
Expected: `Test Files  8 passed (8)`, `Tests  64 passed (64)` (verified — 62 pre-existing + 2 new `healthCheck` tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/config/env.ts backend/src/server.ts backend/src/middleware/error.middleware.ts backend/.env.example
git commit -m "Add opt-in Sentry error tracking via SENTRY_DSN"
```

---

### Task 5: Push, PR

**Files:** none

- [ ] **Step 1: Final full verification**

Run: `cd backend && npm test && npm run build`
Expected: `Test Files  8 passed (8)`, `Tests  64 passed (64)`, clean build (verified — same state as Task 4 Step 6, re-run once more as a final gate).

- [ ] **Step 2: Push and open a PR**

```bash
git push -u origin feature/observability
gh pr create \
  --title "Observability minimum bar: DB-aware health check, structured logging, opt-in Sentry" \
  --body "$(cat <<'EOF'
## Summary
- /health now checks the database (503 if unreachable) instead of being a pure liveness check - extracted into health.controller.ts so it's testable
- morgan replaced with pino/pino-http: JSON request logs, per-request IDs (exposed via X-Request-Id response header), errorHandler's unexpected-error branch now logs via req.log for correlation
- Sentry (@sentry/node) added but fully opt-in via SENTRY_DSN - unset today, so this is a no-op until actually configured at deploy time; only genuinely unexpected errors are captured, not expected 4xx ApiErrors
- Design: docs/superpowers/specs/2026-08-08-observability-design.md

## Test plan
- [x] npm test - 64/64 passing (verified locally)
- [x] npm run build - clean
- [x] Manual smoke test: dev server + curl /health showed X-Request-Id header and structured JSON logs
- Note: CI (PR #8) is still paused per the account's $0 Actions budget cap, so this PR has no automated check - verification above was run locally
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 3: Leave the PR for review**

Same as the prior three roadmap PRs — hand back to the user to decide whether to merge now or review first.

---
