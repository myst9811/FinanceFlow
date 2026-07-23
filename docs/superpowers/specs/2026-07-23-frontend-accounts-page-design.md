# Frontend Accounts Page — Design Spec

## Context

This is sub-project 4a, the first of four parts of "Frontend: real data pages" (sub-project 4 in the top-level FinanceFlow deployment roadmap; sub-projects 1-3 — insights, Vercel adaptation, auth & routing — are merged into `main`):

- **4a. Accounts (this spec)** — full CRUD page + fix `AccountSummary` type
- 4b. Transactions — full CRUD page + fix `TransactionStats` type (depends on 4a existing, since transactions need an account to attach to)
- 4c. Goals — full CRUD page + contribute action + fix `GoalSummary` type (independent of 4a/4b)
- 4d. Dashboard — replace `mockData.ts` with real data, wire Quick Actions, remove the now-dead legacy types (depends on 4a-4c's data existing)

Today `frontend/src/pages/Accounts.tsx` is a "Coming soon" placeholder (added in sub-project 3 purely so the route/nav link resolved to something). The backend's account resource is fully built: full CRUD + a summary endpoint (`backend/src/controllers/account.controller.ts`, routes in `backend/src/routes/account.routes.ts`).

## A pre-existing type bug

`frontend/src/types/api.types.ts`'s `AccountSummary` interface doesn't match what the backend actually returns. It was evidently drafted speculatively before the backend existed and never corrected. The real shape, from `getAccountSummary` in `account.controller.ts`:

```typescript
{
  summary: {
    totalAccounts: number;
    totalBalance: number;
    byType: {
      CHECKING: number;
      SAVINGS: number;
      CREDIT: number;
      INVESTMENT: number;
    };
  };
}
```

Fix: replace the existing (wrong) `AccountSummary` interface with:

```typescript
export interface AccountSummary {
  totalAccounts: number;
  totalBalance: number;
  byType: Record<AccountType, number>;
}
```

`Record<AccountType, number>` is precise here since the backend always returns exactly the 4 `AccountType` enum members as keys.

## Backend contract this page relies on

All routes under `/api/accounts`, already authenticated via `authenticateToken`:

- `GET /api/accounts?active=true` → `{ accounts: Account[], count }`. Without the `active` query param, the backend returns accounts regardless of `isActive` — "deleting" an account is really a soft deactivate (`isActive: false`, preserving transaction history), so the page must pass `active=true` to keep deactivated accounts out of the default view.
- `GET /api/accounts/summary` → `{ summary: AccountSummary }` (as corrected above).
- `POST /api/accounts` with `CreateAccountRequest` (`name`, `type`, optional `balance`/`currency`/`bankName`/`accountNumber`) → `{ account: Account }`. Validation (already enforced server-side, mirrored client-side for immediate feedback): `name` ≥ 2 chars, `type` one of `CHECKING/SAVINGS/CREDIT/INVESTMENT`, `balance` ≥ 0 if provided, `currency` one of `USD/EUR/GBP/JPY/CAD/AUD` if provided.
- `PATCH /api/accounts/:id` with `UpdateAccountRequest` (`name`, `balance`, `isActive`, `bankName`, `accountNumber`, all optional) → `{ account: Account }`. Notably `balance` is directly editable here — the backend doesn't restrict edits to transaction-driven changes only.
- `DELETE /api/accounts/:id` → deactivates (sets `isActive: false`), returns `{ message: string }`.

## New service

`frontend/src/services/account.service.ts`, mirroring the existing `auth.service.ts`/`insight.service.ts` class-instance-export pattern:

```typescript
async getAccounts(activeOnly = true): Promise<Account[]>       // GET /accounts?active=true by default
async getAccountSummary(): Promise<AccountSummary>              // GET /accounts/summary
async createAccount(data: CreateAccountRequest): Promise<Account>
async updateAccount(id: string, data: UpdateAccountRequest): Promise<Account>
async deleteAccount(id: string): Promise<void>
```

## Component structure

- **Move `StatCard`**: `components/dashboard/StatCard.tsx` → `components/common/StatCard.tsx`. It's a generic title/value/change/icon presentational component with no Dashboard-specific logic — it was just never needed anywhere else until now. `Dashboard.tsx`'s import path updated to match; no behavioral change.
- **`components/accounts/AccountForm.tsx`**: one controlled form used for both create and edit (an `initialValues` prop distinguishes the modes — presence of an `id` means edit). Fields: name (text), type (`<select>`: Checking/Savings/Credit/Investment), balance (number — labeled "Balance" with a caption noting it's a manual adjustment, since day-to-day balance changes normally come from transactions, not direct edits), currency (`<select>` constrained to the backend's allowed list, default USD), bank name (text, optional), account number (text, optional). Props: `initialValues?`, `onSubmit: (data) => Promise<void>`, `onCancel: () => void`, `submitting: boolean`. Surfaces backend validation errors the same way `Login`/`Register` do (`err.response.data.error`).
- **`components/accounts/AccountCard.tsx`**: displays one account — name, a type badge, bank name (if present), formatted balance (reusing `formatCurrency` from `utils/formatters.ts`) — with Edit and Delete buttons.
- **`pages/Accounts.tsx`**: fetches accounts (active only) and the summary in parallel on mount. Renders two `StatCard`s (Total Balance, Total Accounts — the `byType` breakdown is fetched but not surfaced in the UI yet, to keep this page's first version focused; easy to add later without an API change). An "Add Account" button toggles the form into create mode (no `initialValues`); clicking Edit on a card sets the form into edit mode pre-filled with that account. Delete triggers a native `window.confirm`, then calls the deactivate endpoint and refetches both accounts and the summary. After a successful create/edit submit, refetch both and close the form (simplest-correct approach — no optimistic-update bookkeeping to get subtly wrong for a page this size).

## Out of scope

- Any UI to view or reactivate deactivated accounts (they simply disappear from the list) — the backend supports reactivating via `PATCH .../isActive: true`, but there's no entry point to reach a deactivated account's ID from this page's UI once it's hidden
- The `byType` balance breakdown from the summary endpoint — fetched, typed correctly, but not rendered in this first version
- Any change to how transactions affect account balances (unrelated backend logic, already correct from the transaction-service refactor)
- Transactions/Goals pages and Dashboard rewiring (sub-projects 4b, 4c, 4d)

## Testing / verification

No new automated frontend tests, consistent with sub-project 3's precedent (frontend still has zero test infrastructure). Manual verification: start both dev servers, log in, and on `/accounts`:

1. Page loads with "Total Balance: $0.00" / "Total Accounts: 0" for a fresh user, empty list.
2. Create an account (each `AccountType`, at least once) → appears in the list, stat cards update.
3. Edit an account's name/balance/bank name → list and stat cards reflect the change.
4. Delete an account → disappears from the list, stat cards update; confirm via a direct API call that `isActive` is `false` rather than the row being hard-deleted.
5. Attempt to create an account with an invalid input (e.g. 1-character name) → backend's validation error message is displayed in the form.
6. `npm run build:frontend` completes with no TypeScript errors.
