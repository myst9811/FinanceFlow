# API Documentation

Base URL: `http://localhost:3001/api` in local dev (`VITE_API_URL` in `frontend/.env`; see [SETUP.md](SETUP.md)).

All request/response bodies are JSON. Every endpoint except `POST /auth/register` and `POST /auth/login` requires an `Authorization: Bearer <token>` header, obtained from either of those two calls. Every list/detail endpoint is scoped to the authenticated user — there's no way to read or modify another user's data through the API.

Errors are always `{ "error": "<message>" }` with a matching HTTP status code (`400` validation, `401` unauthenticated, `403`/`404` not found or not yours, `409` conflict, `429` rate limited, `500` unexpected).

## Auth (`/api/auth`)

| Method | Path | Auth | Rate limit | Notes |
|---|---|---|---|---|
| POST | `/register` | — | 10/hour/IP | Body: `{ email, password, firstName, lastName }`. Password must be 8+ chars with upper, lower, and a digit. Returns `{ user, token }`. |
| POST | `/login` | — | 5/15min/IP | Body: `{ email, password }`. Returns `{ user, token }`. |
| GET | `/me` | required | — | Returns `{ user }` for the token holder. |

## Accounts (`/api/accounts`)

All routes require auth.

| Method | Path | Notes |
|---|---|---|
| POST | `/` | Body: `{ name, type, balance?, currency?, bankName?, accountNumber? }`. `type` is one of `CHECKING`, `SAVINGS`, `CREDIT`, `INVESTMENT`. |
| GET | `/` | Query: `active` (`true`/`false`). Returns `{ accounts, count }` — not paginated (per-user account counts are inherently small). |
| GET | `/summary` | Returns `{ summary }`: total balance and per-type breakdown across active accounts. |
| GET | `/:id` | Returns `{ account }`. |
| PATCH | `/:id` | Body: any of `{ name, balance, isActive, bankName, accountNumber }`. |
| DELETE | `/:id` | Soft delete (`isActive: false`) — preserves transaction history. |

## Transactions (`/api/transactions`)

All routes require auth.

| Method | Path | Notes |
|---|---|---|
| POST | `/` | Body: `{ accountId, toAccountId?, amount, description, category, type, date, tags? }`. `type` is `INCOME`, `EXPENSE`, or `TRANSFER` (`toAccountId` required and must differ from `accountId` for `TRANSFER`). Creating a transaction atomically updates the affected account balance(s). |
| GET | `/` | Query filters: `accountId`, `type`, `category`, `startDate`, `endDate`, `minAmount`, `maxAmount`, `search` (description substring, case-insensitive). Pagination: `page` (default 1), `limit` (default 50, max 100). Returns `{ transactions, count, page, limit, totalCount, totalPages }`. |
| GET | `/stats` | Query: `accountId?`, `startDate?`, `endDate?`. Returns `{ stats }`: income/expense/net totals, spend by category, 5 most recent transactions. |
| GET | `/:id` | Returns `{ transaction }`. |
| PATCH | `/:id` | Body: any of `{ amount, description, category, date, tags }`. Amount changes atomically re-adjust the affected balance(s) by the delta. |
| DELETE | `/:id` | Hard delete; atomically reverses the balance effect it had applied. |

## Goals (`/api/goals`)

All routes require auth.

| Method | Path | Notes |
|---|---|---|
| POST | `/` | Body: `{ title, description?, targetAmount, currentAmount?, targetDate, category }`. `targetDate` must be in the future. `category` is one of `EMERGENCY_FUND`, `HOUSE_DOWN_PAYMENT`, `VACATION`, `CAR`, `DEBT_PAYOFF`, `RETIREMENT`, `OTHER`. |
| GET | `/` | Query: `active`, `category`. Pagination: `page`, `limit` (same defaults as transactions). Returns `{ goals, count, page, limit, totalCount, totalPages }` — each goal includes computed `progress`, `remainingAmount`, `daysRemaining`. |
| GET | `/summary` | Returns `{ summary }`: totals, completed-goal count, breakdown by category, goals due within 30 days. |
| GET | `/:id` | Returns `{ goal }`. |
| PATCH | `/:id` | Body: any of `{ title, description, targetAmount, currentAmount, targetDate, isActive }`. |
| POST | `/:id/contribute` | Body: `{ amount }` (positive). Atomically increments `currentAmount` — safe under concurrent contributions. |
| DELETE | `/:id` | Soft delete (`isActive: false`). |

## Insights (`/api/insights`)

All routes require auth. Insights are generated automatically (rule-based, not ML) whenever they're read — `GET /` and `GET /summary` both first check for new spending alerts, savings opportunities, budget recommendations, goal-pace warnings, and unusual-activity flags based on recent transactions, then return the current set.

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Query filters: `isRead` (`true`/`false`), `type`, `priority`. Pagination: `page`, `limit` (same defaults as transactions). Returns `{ insights, count, page, limit, totalCount, totalPages }`. |
| GET | `/summary` | Returns `{ summary }`: total/unread counts, breakdown by priority and type. |
| PATCH | `/:id/read` | Marks an insight as read. Returns `{ insight }`. |
| DELETE | `/:id` | Deletes an insight. |

## Health

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | — | `200 { status: "OK", timestamp }`. Currently a liveness check only (confirms the server process is up) — it does not yet verify the database is reachable; see `docs/PRODUCTION_READINESS.md`. |
