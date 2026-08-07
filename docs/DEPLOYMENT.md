# Deployment Guide

**Status: not yet deployed.** The backend's code and config are prepared for zero-config deployment to Vercel (see `docs/superpowers/specs/2026-07-23-vercel-serverless-adaptation-design.md` for the full rationale), but no Vercel project, database, or DNS has actually been provisioned. This guide describes the deploy process as designed; treat it as a plan to execute, not a description of a live system. Track current status in `docs/PRODUCTION_READINESS.md`.

## Topology

Two separate Vercel projects from this one repo:
- **Backend** — Root Directory `backend/`. Deploys `backend/src/server.ts` zero-config as a single Vercel Function (Express is auto-detected; no `vercel.json` needed).
- **Frontend** — Root Directory `frontend/`. Deploys the Vite build as a static site.

Each gets its own URL and its own environment variables.

## Database

A serverless Postgres provider (Neon is the intended one, via Vercel's Marketplace integration) is required rather than the local `docker-compose.yml` Postgres. Neon exposes two connection strings:

- **Pooled** (via PgBouncer) → `DATABASE_URL`, used by the app at runtime. Required because many warm Vercel Fluid Compute instances would otherwise each hold their own direct Postgres connection and exhaust the connection limit.
- **Direct/unpooled** → `DIRECT_URL`, used only by `prisma migrate deploy`, since migrations need session-level features PgBouncer's transaction-pooling mode doesn't support.

Locally these are identical (same docker-compose instance) — this distinction only matters against real Neon.

## Environment variables

Backend project:

| Var | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `DIRECT_URL` | Neon direct connection string |
| `JWT_SECRET` | a real random secret (`openssl rand -base64 32`) — not the local dev placeholder |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `CORS_ORIGIN` | the frontend project's production URL (comma-separated if more than one) |
| `PORT` | not needed — Vercel manages the port for Functions |
| `SENTRY_DSN` | optional; see `docs/PRODUCTION_READINESS.md` for observability status |

`server.ts`'s CORS config also allows any `*.vercel.app` origin automatically, so preview deployments (one per PR/branch, unpredictable subdomains) work without needing `CORS_ORIGIN` updated per-PR.

Frontend project:

| Var | Value |
|---|---|
| `VITE_API_URL` | the backend project's URL, e.g. `https://financeflow-api.vercel.app/api` |

## Steps (once a Vercel account/team and Neon database exist)

1. Provision a Neon database (directly or via the Vercel Marketplace integration) and note both connection strings.
2. Create the backend Vercel project, Root Directory `backend/`, set its env vars from the table above.
3. Run `prisma migrate deploy` against `DIRECT_URL` (from a local shell with the production `DIRECT_URL` set, or a one-off CI step) to apply the schema before the first deploy serves traffic.
4. Create the frontend Vercel project, Root Directory `frontend/`, set `VITE_API_URL` to the backend project's URL.
5. Deploy both. Smoke test: `GET /health` on the backend URL, then a full register → login → create account → create transaction flow through the frontend URL.

## Rollback

Not yet documented — no live deployment exists to have a rollback procedure for. Vercel's standard model (instant rollback to any previous deployment via the dashboard or `vercel rollback`) applies once a deployment history exists.
