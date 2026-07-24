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

- **`components/transactions/TransactionForm.tsx`**: fields depend on mode.
  - Create mode: Account (`<select>`, populated from `accountService.getAccounts()`), Type (`<select>`: Income/Expense/Transfer), To Account (`<select>`, shown only when Type is Transfer, options = active accounts excluding the selected Account, required in that case), Amount, Category (`<select>`, options filtered by selected Type — Income → `INCOME_SALARY`/`INCOME_BUSINESS`/`OTHER`; Expense → the 8 expense categories + `OTHER`; Transfer → category fixed to `TRANSFER`, no dropdown shown), Date, Description.
  - Edit mode: only Amount, Category, Date, Description — Account/Type/To Account are not editable, matching the backend's `UpdateTransactionRequest`.
  - Tags are not exposed in the UI in this version — always submitted as an empty array. A real tag-input widget is more UI than this page needs yet.
  - Same error-surfacing pattern as `AccountForm`/`Login`/`Register` (`err.response.data.error`).
- **`components/transactions/TransactionRow.tsx`**: one row — date, description, category, a type-colored amount (green for Income, default for Expense, blue/neutral for Transfer, prefixed with `+`/`-` matching the existing `RecentTransactions.tsx` convention), the account name (and "→ toAccount name" when it's a Transfer), Edit/Delete buttons.
- **`pages/Transactions.tsx`**: fetches accounts (for the filter dropdown and the create form) and transactions on mount. Filter row: Account and Type dropdowns (both default to "All"), refetching the list on change. "Add Transaction" toggles the form (create mode). Edit pre-fills the edit-mode form. Delete triggers a `window.confirm`, then calls delete and refetches.

## Out of scope

- Category, date-range, amount-range, and free-text search filters (all exist server-side, deferred client-side to keep this page's first version focused — the account+type filter pair covers the most common case)
- Tags UI (always empty)
- Pagination (the backend returns every matching transaction with no limit/offset — a pre-existing backend limitation, not something this page works around)
- Stat cards / aggregate display (Dashboard's job, sub-project 4d)
- Goals and Dashboard pages (sub-projects 4c, 4d)

## Testing / verification

No new automated frontend tests, consistent with 4a/sub-project 3's precedent. Manual verification (mirroring 4a's approach — API-level checks via curl exercising the exact payloads the frontend sends, plus a visual pass):

1. Fresh user, `/transactions`: empty list, no accounts yet → creating a transaction should be blocked or clearly indicate an account is needed first (the Account dropdown will simply be empty).
2. Create at least one account (via `/accounts`, from 4a), then create an INCOME, an EXPENSE, and a TRANSFER transaction. Confirm each appears in the list with the right formatting, and that the TRANSFER correctly moved balance between the two accounts (verify via the Accounts page or a direct API call).
3. Edit a transaction's amount → confirm the affected account balance(s) update correctly (reversal + reapply).
4. Delete a transaction → confirm it disappears and the balance reverses.
5. Filter by account and by type → list narrows correctly.
6. Attempt a TRANSFER without selecting a To Account, or with To Account equal to Account → the backend's validation error is surfaced in the form.
7. `npm run build:frontend` completes with no TypeScript errors.
