# Frontend Transactions Page — Design Spec

## Context

This is sub-project 4b, the second of four parts of "Frontend: real data pages" (sub-project 4 in the top-level roadmap):

- 4a. Accounts (done, merged) — full CRUD page + fixed `AccountSummary` type
- **4b. Transactions (this spec)** — full CRUD page + fix `Transaction`/`TransactionStats` types
- 4c. Goals — full CRUD page + contribute action + fix `GoalSummary` type (independent of 4a/4b)
- 4d. Dashboard — replace `mockData.ts` with real data, wire Quick Actions, remove the now-dead legacy types (depends on 4a-4c)

This depends on 4a: transactions need an account to attach to, and the account selector in the create form uses `account.service.ts` built in 4a.

Today `frontend/src/pages/Transactions.tsx` is a "Coming soon" placeholder. The backend's transaction resource is fully built, including the atomic balance-mutation logic and TRANSFER support from the earlier `transaction.service.ts` refactor.

## Pre-existing type bugs

Same pattern as 4a's `AccountSummary`: these types in `frontend/src/types/api.types.ts` were drafted speculatively and don't match the real backend.

**`Transaction`** is missing fields the backend always includes. The backend's `TRANSACTION_INCLUDE` (`backend/src/services/transaction.service.ts`) enriches every transaction response with the related account(s)' name/type — without this, the frontend would have no way to show which account a transaction belongs to without a separate lookup. Fix:

```typescript
export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  toAccountId?: string | null;
  amount: number;
  description: string;
  category: TransactionCategory;
  type: TransactionType;
  date: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  account: { name: string; type: AccountType };
  toAccount?: { name: string; type: AccountType } | null;
}
```

**`CreateTransactionRequest`** is missing `toAccountId`, required server-side when `type: 'TRANSFER'`:

```typescript
export interface CreateTransactionRequest {
  accountId: string;
  toAccountId?: string;
  amount: number;
  description: string;
  category: TransactionCategory;
  type: TransactionType;
  date: string;
  tags?: string[];
}
```

**`TransactionStats`** doesn't match `getTransactionStatsForUser`'s actual return shape (`transactionCount` should be `totalTransactions`, and `byCategory` is a flat record, not an array of objects):

```typescript
export interface TransactionStats {
  totalTransactions: number;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  byCategory: Record<string, number>;
  recentTransactions: Transaction[];
}
```

(`TransactionStats` isn't consumed by this page — Transactions is list/CRUD only, stats are Dashboard's job in 4d — but it's fixed here since it's part of the same transaction-types cleanup and trivial to do alongside the others.)

## Backend contract this page relies on

All routes under `/api/transactions`, authenticated:

- `GET /api/transactions?accountId=&type=` → `{ transactions: Transaction[], count }`. Supports more filters server-side (`category`, `startDate`/`endDate`, `minAmount`/`maxAmount`, `search`) — deferred, see Out of scope.
- `POST /api/transactions` with `CreateTransactionRequest` → `{ transaction: Transaction }`. Validation (mirrored client-side): `description` ≥ 2 chars, `amount` > 0, `type` one of `INCOME/EXPENSE/TRANSFER`, `category` one of the 12 `TransactionCategory` values, valid `date`; `toAccountId` required and different from `accountId` when `type === 'TRANSFER'`, rejected as invalid when provided for non-TRANSFER types.
- `PATCH /api/transactions/:id` with `UpdateTransactionRequest` (`amount`, `description`, `category`, `date`, `tags` — **no** `accountId`/`toAccountId`/`type`, these are immutable once created) → `{ transaction: Transaction }`. Amount changes correctly re-mutate the affected account balance(s) via the existing delta-based reversal logic — nothing new needed here, already correct.
- `DELETE /api/transactions/:id` → reverses the balance effect and hard-deletes (unlike accounts, there's no soft-delete for transactions), returns `{ message: string }`.

## New service

`frontend/src/services/transaction.service.ts`, same pattern as `account.service.ts`/`insight.service.ts`:

```typescript
async getTransactions(filters?: { accountId?: string; type?: TransactionType }): Promise<Transaction[]>
async createTransaction(data: CreateTransactionRequest): Promise<Transaction>
async updateTransaction(id: string, data: UpdateTransactionRequest): Promise<Transaction>
async deleteTransaction(id: string): Promise<void>
```

(`getTransactionStats` is not added here — no consumer until Dashboard in 4d, added there instead of speculatively now.)

## Component structure

- **`components/transactions/TransactionForm.tsx`**: receives the account list as a prop (`accounts: Account[]`) rather than fetching it itself — `pages/Transactions.tsx` is the single owner of that fetch (see below), since it already needs the same list for its filter row. This avoids a duplicate request and guarantees the filter dropdown and the form's dropdown never show different/stale option sets. Fields depend on mode:
  - Create mode: Account (`<select>`, from the `accounts` prop), Type (`<select>`: Income/Expense/Transfer), To Account (`<select>`, shown only when Type is Transfer, options = active accounts excluding the selected Account, required in that case), Amount, Category (`<select>`, options filtered by selected Type — Income → `INCOME_SALARY`/`INCOME_BUSINESS`/`OTHER`; Expense → the 8 expense categories + `OTHER`; Transfer → category fixed to `TRANSFER`, no dropdown shown), Date (defaults to today, formatted `YYYY-MM-DD` for the native date input), Description.
  - Edit mode: only Amount, Category, Date, Description — Account/Type/To Account are not editable, matching the backend's `UpdateTransactionRequest`. Category behavior mirrors create mode's type-based filtering, keyed off the transaction's existing (immutable) `type`: for a Transfer, category stays fixed to `TRANSFER` with no dropdown shown (same as create); for Income/Expense, the dropdown only offers that type's valid categories, so an edit can never move a transaction into a category that doesn't belong to its type. Date is prefilled from `transaction.date.slice(0, 10)` — the backend serializes `date` as a full ISO timestamp, but a native `<input type="date">` requires exactly `YYYY-MM-DD`; feeding it the raw ISO string renders as blank. A plain slice (not a `Date`-object round-trip through the browser's local timezone) is deliberate: transaction dates are stored as UTC midnight for the given calendar day, and converting through local time could shift the displayed date by one day for users behind UTC.
  - Tags are not exposed in the UI in this version. On create, the payload omits `tags` entirely (the backend defaults to `[]`). On edit, `tags` is likewise omitted from the payload — never submitted as `[]` — so an edit never silently erases tags that exist on the transaction (e.g. added directly via the API, or by a future UI). A real tag-input widget is more UI than this page needs yet.
  - Same error-surfacing pattern as `AccountForm`/`Login`/`Register` (`err.response.data.error`).
- **`components/transactions/TransactionRow.tsx`**: one row — date, description, category, a type-colored amount (green for Income, default for Expense, blue/neutral for Transfer, prefixed with `+`/`-` matching the existing `RecentTransactions.tsx` convention), the account name (and "→ toAccount name" when it's a Transfer), Edit/Delete buttons.
- **`pages/Transactions.tsx`**: the sole owner of the accounts fetch — loads accounts once on mount and passes them both to the filter row and to `TransactionForm`. Also fetches transactions on mount. Filter row: Account and Type dropdowns (both default to "All"), refetching the list on change. "Add Transaction" toggles the form (create mode). Edit pre-fills the edit-mode form. Delete triggers a `window.confirm`, then calls delete and refetches.

### Loading and error states

`pages/Transactions.tsx` tracks loading and error state explicitly for both the initial accounts+transactions fetch and the filter-driven refetch:

- While the initial fetch is in flight: a loading indicator (same `<p className="text-gray-500">Loading...</p>` pattern as `Accounts.tsx`), no stale content shown underneath it.
- If the initial fetch fails (network error, 401 after token expiry, etc.): an inline error message plus a "Retry" button that re-runs the same fetch, rather than the page silently rendering an empty list that looks indistinguishable from "you have no transactions yet." This is a real gap in the current `Accounts.tsx` (its `loadData` has no failure handling at all) — not fixed here as part of this sub-project, but not repeated in this new page either.

## Out of scope

- Category, date-range, amount-range, and free-text search filters (all exist server-side, deferred client-side to keep this page's first version focused — the account+type filter pair covers the most common case)
- Tags UI (always empty; never overwritten on edit, see above)
- Pagination (the backend returns every matching transaction with no limit/offset — a pre-existing backend limitation, not something this page works around)
- Stat cards / aggregate display (Dashboard's job, sub-project 4d)
- Goals and Dashboard pages (sub-projects 4c, 4d)
- **Known limitation, not fixed here**: the backend's `accountId` filter (`getTransactionsForUser` in `transaction.service.ts`) matches only `accountId` (the source account), never `toAccountId`. Filtering the Transactions page by an account that has only ever received transfers (never been the source of any transaction) will show an empty list for that account, even though money did move into it. Fixing this would mean changing the backend's filter to match `accountId` OR `toAccountId`, which is out of scope for a frontend sub-project — noted here so it isn't mistaken for a frontend bug later.

## Testing / verification

No new automated frontend tests, consistent with 4a/sub-project 3's precedent. Manual verification (mirroring 4a's approach — API-level checks via curl exercising the exact payloads the frontend sends, plus a visual pass):

1. Fresh user, `/transactions`: empty list, no accounts yet → creating a transaction should be blocked or clearly indicate an account is needed first (the Account dropdown will simply be empty).
2. Create at least **two** accounts (via `/accounts`, from 4a — a Transfer needs a distinct source and destination), then create an INCOME, an EXPENSE, and a TRANSFER transaction. Confirm each appears in the list with the right formatting, and that the TRANSFER correctly moved balance between the two accounts (verify via the Accounts page or a direct API call).
3. Edit a transaction's amount → confirm the affected account balance(s) update correctly (reversal + reapply).
4. Edit a Transfer transaction → confirm the category field stays fixed to `TRANSFER` (not editable), and edit an Income/Expense transaction → confirm the category dropdown only offers that type's valid categories.
5. Delete a transaction → confirm it disappears and the balance reverses.
6. Filter by account and by type → list narrows correctly. Separately confirm the known account-filter limitation above: an account that only ever received a transfer won't show it when filtered.
7. Confirm the UI structurally prevents an invalid Transfer (missing or same-account destination) — the To Account `<select>` is required and excludes the source account, so there's no way to submit either case through the form. Separately, verify the backend's own validation error message directly via `curl` (bypassing the UI) for both cases, confirming the error text the form's error-display code would show if it were ever reached.
8. Trigger a failed initial fetch (e.g. stop the backend before loading `/transactions`) → confirm the page shows an error state with a working Retry button, not a silent empty list.
9. `npm run build:frontend` completes with no TypeScript errors.
