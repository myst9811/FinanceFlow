# Local Setup

## Prerequisites
- Node.js 20+
- Docker (for the local Postgres database)

## 1. Install dependencies

```bash
npm run install:all
```

This runs `npm ci` in both `backend/` and `frontend/`.

## 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit `backend/.env` and set `JWT_SECRET` to a real secret, e.g. `openssl rand -base64 32`.
The default `DATABASE_URL` matches the Postgres container started in step 3.

## 3. Start the database

```bash
npm run db:up
```

Starts a Postgres 16 container (see `docker-compose.yml`) on `localhost:5432` with a persistent volume.
Stop it with `npm run db:down`.

## 4. Set up the database schema

```bash
npm run prisma:migrate
```

This creates the tables defined in `backend/prisma/schema.prisma` and regenerates the Prisma client.
If you only need to regenerate the client (schema unchanged), use `npm run prisma:generate`.

## 5. Run the apps

In separate terminals:

```bash
npm run dev:backend   # http://localhost:3001
npm run dev:frontend  # http://localhost:5173
```

## Verifying your setup

```bash
npm run build:backend
npm run build:frontend
npm run lint:frontend
```

All three should complete without errors.
