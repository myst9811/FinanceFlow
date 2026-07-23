# Backend Vercel Serverless Adaptation — Design Spec

## Context

This is sub-project 2 of the FinanceFlow deployment roadmap (sub-project 1, rule-based insights, shipped in PR #2):

1. Insights (done)
2. **Vercel serverless adaptation (this spec)** — backend code/config prep only, no live provisioning
3. Frontend: auth & routing
4. Frontend: real data pages
5. Docs & CI
6. Deploy — provision Neon, create the two Vercel projects, set env vars, deploy, smoke test

Scope boundary: this sub-project prepares the backend's code and config so it *can* be deployed zero-config to Vercel with a serverless Postgres. It does **not** create any Vercel project, install the Neon Marketplace integration, or run a live deploy — that's explicitly sub-project 6.

## Research findings

Fetched current Vercel docs (`/docs/frameworks/backend/express`, last updated 2026-07-06) rather than relying on possibly-stale knowledge. Key facts that shape this design:

- Vercel deploys Express apps **zero-config** as a single Vercel Function running on Fluid Compute, as long as the entry file imports `express` and lives at one of a fixed set of locations, including `src/server.{js,ts,...}` — which is exactly `backend/src/server.ts`, unchanged.
- The entry file may either export the app as a default export, **or** use the existing `app.listen()` pattern — our current code already matches this with zero changes needed to `server.ts`'s bootstrap logic.
- Fluid Compute reuses whole warm instances across concurrent requests (not one-shot per-request serverless), so a plain module-level `PrismaClient` singleton behaves correctly without needing the Next.js-style `globalThis` hot-reload guard.
- No `vercel.json` is required for zero-config Express; the only project-level setting needed is Root Directory = `backend/`, which is configured when the Vercel project is created (sub-project 6), not a repo file.

## Deploy topology

Two separate Vercel projects:
- One rooted at `backend/` — deploys the Express app as a single Vercel Function.
- One rooted at `frontend/` — deploys the Vite build as a static site.

Each gets its own URL and environment variables. The frontend's `VITE_API_URL` will point at the backend project's URL; the backend's `CORS_ORIGIN` will allow the frontend project's URL. Both of those env var *values* are set at deploy time (sub-project 6) — this sub-project only prepares the code to accept them correctly.

## Database: Prisma schema changes

Neon (and serverless Postgres generally) exposes two connection strings:
- **Pooled** (via PgBouncer in transaction mode) — for the app at runtime, since many warm Fluid Compute instances would otherwise each hold their own direct connection and exhaust Postgres's connection limit.
- **Direct** (unpooled) — required for `prisma migrate deploy`, since migrations use session-level features PgBouncer's transaction mode doesn't support.

Add a `directUrl` field to the Prisma datasource block:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

`DATABASE_URL` remains the connection string the app uses at runtime (pooled, in production). `DIRECT_URL` is only consulted by `prisma migrate` commands. Locally, both env vars point at the same docker-compose Postgres — there's no pooling distinction in local dev, so this is a no-op change for the existing local workflow.

`backend/.env.example` and `backend/.env.test.example` get a `DIRECT_URL` line added, mirroring `DATABASE_URL`'s value (same local Postgres instance for both, since local dev has no pooler).

## Prisma client generation on deploy

`backend/src/generated/prisma` is gitignored and only ever produced by explicitly running `npm run prisma:generate`. Vercel's build pipeline runs `npm install` but has no reason to know to run Prisma's generator afterward. Add to `backend/package.json`:

```json
"scripts": {
  "postinstall": "prisma generate"
}
```

This is the standard pattern for deploying Prisma-based apps to Vercel — `postinstall` runs automatically after `npm install`/`npm ci`, regenerating the client before the function bundle is built. No other install/build configuration changes are needed given zero-config Express detection.

## Prisma client singleton — no change

`backend/src/lib/prisma.ts` (`export const prisma = new PrismaClient()`) stays exactly as-is. The common `globalThis.prisma ??= new PrismaClient()` pattern exists specifically to survive Next.js dev-server hot-module-reloading, which re-executes module scope on every file save. That doesn't apply here: this is a plain Express app, and under Fluid Compute a warm instance keeps its module scope (and therefore the single `PrismaClient` instance) alive across requests exactly like a traditional long-running Node process would. Adding the guard would be defensive code for a problem that doesn't exist in this deployment model — skipped per YAGNI.

## CORS for preview deployments

Every Vercel preview deployment (one per PR/branch) gets an unpredictable `*.vercel.app` subdomain, which can't be enumerated in advance in a static `CORS_ORIGIN` env var. Replace the static origin array with an origin-callback in `server.ts`:

```typescript
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.corsOrigins.includes(origin) || /\.vercel\.app$/.test(new URL(origin).hostname)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
```

- `!origin` covers non-browser requests (e.g. curl, server-to-server) which don't send an `Origin` header.
- `config.corsOrigins` (from `CORS_ORIGIN`, unchanged) covers the production custom domain and local dev (`http://localhost:5173`).
- The regex covers any Vercel preview URL for the frontend project, since those all resolve under `*.vercel.app`.

No changes to `config/env.ts` — `config.corsOrigins` keeps its existing shape (array of exact-match origins from the comma-separated `CORS_ORIGIN` var).

## Testing / verification

No new automated tests — this sub-project changes deployment configuration and a CORS policy, not business logic covered by the existing service-layer test suite. Verification is manual/build-level:

1. `npm run prisma:generate` succeeds with the new `directUrl` field (schema is valid).
2. `npm run prisma:migrate` (local dev DB) and the documented test-DB migration step both still apply cleanly with `DIRECT_URL` set equal to `DATABASE_URL` locally.
3. Full `npm run test:backend` still passes (38/38, unaffected by this change).
4. `npm run build:backend` still compiles cleanly.
5. Manual check: start the dev server, confirm a request with no `Origin` header (plain curl) still succeeds, and that CORS doesn't regress for `http://localhost:5173`.

## Out of scope

- Creating any Vercel project, linking this repo, or installing the Neon Marketplace integration (sub-project 6)
- Actually setting `DATABASE_URL`/`DIRECT_URL`/`CORS_ORIGIN`/`VITE_API_URL` to real production values (sub-project 6)
- Any frontend changes (sub-projects 3–4)
- `DEPLOYMENT.md` documentation of the full deploy process (sub-project 5)
