# Backend Vercel Serverless Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the FinanceFlow backend's code and config so it can later be deployed zero-config to Vercel against a serverless (pooled) Postgres — no live provisioning or deployment in this plan, that's sub-project 6.

**Architecture:** Four small, independent changes: a Prisma `directUrl` field for migration-vs-runtime connection strings, a `postinstall` hook so Vercel's build regenerates the gitignored Prisma client, a CORS origin-callback that allows Vercel preview-deployment subdomains, and documentation of the new env var. No changes to `server.ts`'s entry pattern are needed — it already matches Vercel's zero-config Express requirements as-is.

**Tech Stack:** Express 5, Prisma 6.12 (Postgres), unchanged.

**Spec:** `docs/superpowers/specs/2026-07-23-vercel-serverless-adaptation-design.md`

**Note on testing:** per the spec, this sub-project changes deployment configuration and a CORS policy, not business logic — there is no existing HTTP-integration test layer in this codebase (all tests exercise the service layer directly against the test database; see `backend/src/services/__tests__/`). Adding one now (e.g. supertest) purely to cover a CORS tweak would be a new testing pattern introduced for a single check, out of proportion to the change. Verification here is manual/build-level instead, matching the spec's own verification section.

---

## File Structure

- Modify: `backend/prisma/schema.prisma` — add `directUrl` to the datasource block
- Modify: `backend/.env.example` — document `DIRECT_URL`
- Modify: `backend/.env.test.example` — document `DIRECT_URL`
- Modify: `backend/package.json` — add `postinstall` script
- Modify: `backend/src/server.ts` — CORS origin callback

---

### Task 1: Prisma `directUrl` + env documentation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/.env.example`
- Modify: `backend/.env.test.example`

- [ ] **Step 1: Add `directUrl` to the datasource block**

In `backend/prisma/schema.prisma`, replace:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

with:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

- [ ] **Step 2: Document `DIRECT_URL` in the example env files**

In `backend/.env.example`, replace:

```
# Postgres connection string used by Prisma. Matches docker-compose.yml at the repo root.
DATABASE_URL="postgresql://financeflow:financeflow@localhost:5432/financeflow?schema=public"
```

with:

```
# Postgres connection string used by Prisma. Matches docker-compose.yml at the repo root.
# In production this is the pooled (PgBouncer) connection string; DIRECT_URL is the
# unpooled one Prisma migrate needs. Locally there's no pooler, so both are identical.
DATABASE_URL="postgresql://financeflow:financeflow@localhost:5433/financeflow?schema=public"
DIRECT_URL="postgresql://financeflow:financeflow@localhost:5433/financeflow?schema=public"
```

In `backend/.env.test.example`, replace:

```
DATABASE_URL="postgresql://financeflow:financeflow@localhost:5432/financeflow_test?schema=public"
```

with:

```
DATABASE_URL="postgresql://financeflow:financeflow@localhost:5433/financeflow_test?schema=public"
DIRECT_URL="postgresql://financeflow:financeflow@localhost:5433/financeflow_test?schema=public"
```

- [ ] **Step 3: Set `DIRECT_URL` in your local (gitignored) env files**

These aren't tracked by git, so update them directly to unblock the verification in Task 4. In `backend/.env` and `backend/.env.test`, add a `DIRECT_URL` line with the same value as that file's existing `DATABASE_URL` (adjust the port/host to match whatever your local Postgres is actually running on).

- [ ] **Step 4: Regenerate the Prisma client and verify the schema is valid**

Run: `cd backend && npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors about `directUrl`/`DIRECT_URL`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/.env.example backend/.env.test.example
git commit -m "feat: add Prisma directUrl for pooled-vs-direct Postgres connections"
```

---

### Task 2: `postinstall` script for Vercel builds

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add the postinstall script**

In `backend/package.json`, replace:

```json
  "scripts": {
    "dev": "nodemon --exec ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "test": "vitest run"
  },
```

with:

```json
  "scripts": {
    "dev": "nodemon --exec ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "postinstall": "prisma generate",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "test": "vitest run"
  },
```

- [ ] **Step 2: Verify a clean install still regenerates the client correctly**

Run: `cd backend && npm ci`
Expected: install completes, and its output includes the `postinstall` hook running `prisma generate` (`✔ Generated Prisma Client ...`)

- [ ] **Step 3: Commit**

```bash
git add backend/package.json
git commit -m "feat: regenerate Prisma client automatically after install"
```

---

### Task 3: CORS support for Vercel preview deployments

**Files:**
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Replace the static CORS origin array with an origin callback**

In `backend/src/server.ts`, replace:

```typescript
app.use(cors({ origin: config.corsOrigins }));
```

with:

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

- [ ] **Step 2: Verify the backend builds**

Run: `npm run build:backend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat: allow Vercel preview-deployment origins through CORS"
```

---

### Task 4: End-to-end verification

**Files:** none (verification only — fix and commit separately if anything fails)

- [ ] **Step 1: Run the full backend test suite**

Run: `npm run test:backend`
Expected: all existing tests still pass, unaffected by this sub-project's changes

- [ ] **Step 2: Run the backend build**

Run: `npm run build:backend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Verify the local dev database migration still applies with the new schema field**

```bash
npm run db:up
npm run prisma:migrate
```

Expected: completes with no new migration needed (schema's Prisma-level `directUrl` change doesn't affect the SQL schema, only the client/config) and no errors about a missing `DIRECT_URL`

- [ ] **Step 4: Start the dev server and verify CORS behavior manually**

```bash
npm run dev:backend
```

In a separate terminal (adjust the port if `PORT` in `backend/.env` differs from 3001):

```bash
# No Origin header (e.g. curl, server-to-server) — should succeed as before
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health

# Configured origin (local frontend dev) — should get an Access-Control-Allow-Origin header back
curl -s -D - -o /dev/null -H "Origin: http://localhost:5173" http://localhost:3001/health | grep -i access-control-allow-origin

# A Vercel preview-style origin — should also get the header back (the *.vercel.app regex)
curl -s -D - -o /dev/null -H "Origin: https://financeflow-git-feature-x-someuser.vercel.app" http://localhost:3001/health | grep -i access-control-allow-origin

# An arbitrary untrusted origin — should NOT get an Access-Control-Allow-Origin header
curl -s -D - -o /dev/null -H "Origin: https://evil.example.com" http://localhost:3001/health | grep -i access-control-allow-origin
```

Expected: the first three commands each print `200` / a matching `Access-Control-Allow-Origin` header; the last command prints nothing (no such header present — the CORS callback rejected it).

- [ ] **Step 5: Stop the dev server**

Ctrl-C (or kill) the `npm run dev:backend` process once the checks above pass.

---

## Self-Review Notes

- **Spec coverage:** `directUrl` schema field + env docs (Task 1), `postinstall` regeneration (Task 2), CORS preview-domain support (Task 3), manual verification matching the spec's own checklist exactly (Task 4). Out-of-scope items from the spec (Vercel project creation, Neon provisioning, real env var values, frontend changes, `DEPLOYMENT.md`) correctly have no corresponding tasks.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code or commands.
- **Type consistency:** the CORS callback signature (`origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void`) matches `@types/cors`'s `CustomOrigin` type already present as a transitive dependency type — no new dependency needed since `cors` is already installed.
