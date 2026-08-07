# Observability Minimum Bar — Design Spec

## Context

This is the fourth item in the production-readiness push tracked in `docs/PRODUCTION_READINESS.md`, item #2 ("Observability"), per the agreed attack order: "Observability minimum bar (#2: DB-aware `/health`, structured error logging, pick an error tracker)."

Prior roadmap items: CI (paused, PR #8 open/unmerged by choice — Actions budget capped at $0), auth security (merged, PR #9), DB indexes + pagination (merged, PR #10). A separate "OSS polish" pass (README accuracy, `docs/API.md`/`ARCHITECTURE.md`/`DEPLOYMENT.md`, `CONTRIBUTING.md`) also landed directly on `main` on 2026-08-08, unrelated to this roadmap.

Explicitly out of scope, per the agreed attack-order description: metrics/dashboards (request latency, error rate, DB query time) — a bigger, separate lift better suited to actual deploy time, not part of "minimum bar."

Every code sample below was written and verified against this repo before being written into this spec (built cleanly with `tsc`, full test suite green, and the `/health` + logging behavior manually smoke-tested against the real dev server) — not reconstructed from memory afterward.

## DB-aware `/health`

Extracted into `backend/src/controllers/health.controller.ts` (previously an inline handler in `server.ts`, which is never imported by the test suite — it calls `app.listen()` at module load, so testing the handler required pulling it out into its own importable, testable function, matching this repo's existing controller-per-file convention):

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

`server.ts`'s `app.get('/health', (req, res) => {...})` becomes `app.get('/health', healthCheck)`.

Tested in `backend/src/controllers/__tests__/health.controller.test.ts`: the happy path runs against the real test database (matching this repo's convention), and the failure path uses `vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(...)` — the one place in this pass where mocking Prisma is the right call, since reliably forcing a real Postgres connection to fail on demand mid-test-run isn't practical. Both were run and passed before being written here.

## Structured logging: Pino replaces morgan

New dependencies: `pino`, `pino-http` (`morgan` and `@types/morgan` removed — fully replaced, not kept alongside). New file `backend/src/lib/logger.ts`, a shared singleton following the same pattern as `lib/prisma.ts`:

```typescript
import pino from 'pino';

export const logger = pino();
```

In `server.ts`, `app.use(morgan('combined'))` is replaced with:

```typescript
app.use(pinoHttp({ logger }));

app.use((req, res, next) => {
  res.setHeader('X-Request-Id', String(req.id));
  next();
});
```

`pino-http` augments Express's `Request` (via a `declare module "http"` block extending `IncomingMessage`, which `Request` extends) with `req.id` and `req.log` — confirmed by reading `pino-http`'s shipped `.d.ts` and by a clean `tsc` build using both. `req.id` defaults to a small per-process incrementing counter (confirmed via a live smoke test — the first request in a fresh process got `id: 1`), not a UUID; this is sufficient for correlating a request's access log with any error log it produced within that process's lifetime (the actual goal here), even though it isn't globally unique across restarts or multiple warm serverless instances. Upgrading to `genReqId: () => crypto.randomUUID()` for global uniqueness was considered and deliberately deferred — it's not needed for "minimum bar," and the same "revisit once actually deployed with multiple instances" reasoning already applied to the rate limiter's in-memory store (`docs/superpowers/specs/2026-08-07-auth-security-design.md`) applies here too.

The two existing `console.*` call sites are replaced:
- `server.ts`'s startup message: `console.log(...)` → `logger.info('Server running on port ' + config.port)`.
- `middleware/error.middleware.ts`'s generic-500 branch: `console.error(err)` → `req.log.error({ err }, 'Unhandled error')` — using `req.log` specifically (not the bare `logger`) so the error log line carries that request's `id`, correlating it with the access log line `pino-http` already produces for the same request. `req.log` is guaranteed to be set by the time `errorHandler` runs, since `pinoHttp` is registered early in the middleware chain (right after `cors`, well before routes and error handlers).

Verified with a live smoke test against the dev server: `GET /health` returned the `X-Request-Id: 1` header, and the server's stdout showed two clean JSON lines — a startup `{"msg":"Server running on port 3001", ...}` and a request-completion log `{"req":{"id":1,"method":"GET","url":"/health",...},"res":{"statusCode":200,...},"responseTime":37,"msg":"request completed"}`.

## Error tracking: Sentry, opt-in via `SENTRY_DSN`

New dependency: `@sentry/node`. `config/env.ts`'s `AppConfig` gains an **optional** field (unlike `jwtSecret`/`databaseUrl`, which use the existing `required()` helper and throw at startup if missing):

```typescript
export interface AppConfig {
  // ...existing fields...
  sentryDsn?: string;
}
```

```typescript
// in loadConfig()'s return statement:
sentryDsn: process.env.SENTRY_DSN,
```

In `server.ts`, before `const app = express()`:

```typescript
if (config.sentryDsn) {
  Sentry.init({ dsn: config.sentryDsn });
}
```

Manual capture only — no auto-instrumentation, tracing, or profiling, matching "minimum bar." `middleware/error.middleware.ts`'s generic-500 branch gains one line, `Sentry.captureException(err)`, alongside the new `req.log.error(...)` call. `ApiError`s (expected `4xx` responses: validation failures, `404`s, duplicate email, rate-limit rejections, etc.) are **not** sent to Sentry — that branch returns before reaching the new logging/capture lines, matching how it was already excluded from the old `console.error` call. Only genuinely unexpected errors are incidents worth tracking.

With no `SENTRY_DSN` set (true today — nothing is deployed yet), `Sentry.init` is never called, and `Sentry.captureException` is a confirmed-safe no-op when called on an uninitialized SDK (verified directly: calling it before `init` neither throws nor errors). The app's behavior is therefore identical to not having Sentry integrated at all, until a `SENTRY_DSN` is actually set at deploy time.

`backend/.env.example` gains a commented-out, clearly-optional line:

```
# Optional. Sentry DSN for error tracking - if unset, Sentry is never
# initialized and the app behaves exactly as without it.
# SENTRY_DSN=
```

Not added to `.env.test.example` — Sentry is never exercised by the test suite (no test triggers the generic-500 branch of `errorHandler` today), so there's nothing for it to do there.

## Error handling / failure modes

- If `prisma.$queryRaw` in `healthCheck` throws for any reason (DB down, network partition, credentials rotated), the handler catches it and returns `503` rather than letting the request 500 or hang — a monitoring/uptime check hitting `/health` gets an accurate, fast signal either way.
- `Sentry.captureException` failing or being slow is not a concern for this integration: it's fire-and-forget (not awaited), so a slow or unreachable Sentry ingest endpoint can't add latency to the error response the client receives.
- Removing `morgan` entirely (rather than running it alongside `pino-http`) means there's no fallback text-format request log if `pino-http` were ever misconfigured — acceptable, since the alternative (maintaining two parallel logging systems indefinitely) is worse, and `pino-http`'s configuration here is minimal (a shared logger instance, no custom serializers or log-level logic) with low surface area for misconfiguration.

## Testing (verification)

Already run and passing before this spec was written: `cd backend && npm test` (64/64 — 62 pre-existing/from prior roadmap items + 2 new `healthCheck` tests) and `npm run build` (clean). No CI gate yet (PR #8 still paused) — same manual-verification approach as the prior two roadmap items.
