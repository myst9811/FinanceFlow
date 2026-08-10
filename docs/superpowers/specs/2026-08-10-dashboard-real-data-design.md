# Dashboard Real-Data Wiring — Design

## Goal

Fix [issue #15](https://github.com/myst9811/ChronosFin/issues/15): `frontend/src/pages/Dashboard.tsx` currently renders everything from hardcoded `mockTransactions` (`frontend/src/data/mockData.ts`), so every user sees identical fake numbers regardless of their real accounts/transactions. This spec covers only the first item from that issue's suggested scope — replacing the stat cards and Recent Transactions list with real data via the existing `account.service.ts` / `transaction.service.ts`.

**Out of scope** (tracked separately in issue #15, items 2–5): a real month-over-month trend-percentage backend endpoint, the two "Chart coming soon" placeholders, the three dead Quick Actions buttons, and consolidating the Landing page's own separate decorative mock ledger with `mockData.ts`. None of these are touched by this change.

## What already exists (no backend changes needed)

Both endpoints this design needs are already built and used elsewhere in the app:

- `GET /accounts/summary` → `{ summary: AccountSummary }` (`totalAccounts`, `totalBalance`, `byType`) — already consumed identically on `pages/Accounts.tsx`. `Account.balance` is kept authoritative by the backend, which applies each transaction's balance effect atomically at creation time (`backend/src/services/transaction.service.ts`), so this is a trustworthy source for "Total Balance."
- `GET /transactions/stats?startDate&endDate&accountId` → `{ stats: TransactionStats }` (`totalTransactions`, `totalIncome`, `totalExpenses`, `netIncome`, `byCategory`, `recentTransactions`). The `TransactionStats` type is already defined in `frontend/src/types/api.types.ts:157-164` — it's just never been exposed on `transactionService`.
- `GET /transactions` (no filters) → already sorted newest-first by the backend (`orderBy: { date: 'desc' }`), default limit 50. Reused for "Recent Transactions" exactly as the mock version did — fetch, then slice to the display limit client-side.

This means the entire fix is frontend-only.

## Data mapping

| Stat card | Old (mock) | New (real) |
|---|---|---|
| Total Balance | sum of `mockTransactions` amounts | `accountService.getAccountSummary().totalBalance` |
| Monthly Income | sum of all-time mock income (mislabeled "monthly") | `transactionService.getTransactionStats({ startDate: <1st of this month>, endDate: <today> }).totalIncome` |
| Monthly Expenses | sum of all-time mock expenses | same call's `.totalExpenses` |
| Net Savings | `totalIncome - totalExpenses` (mock) | same call's `.netIncome` |

Two of the four stat cards (Total Balance, Net Savings) currently render a `change` subtext computed as `(netBalance / totalIncome) * 100` — worded as "savings rate" under Total Balance and "% of income" under Net Savings, both showing the identical percentage. This is wrong on two counts: Total Balance is an all-time balance, not something a same-period ratio describes, and duplicating the exact same subtext under two different cards is confusing. The other two (Monthly Income, Monthly Expenses) render literal hardcoded strings ("+12.5% from last month", "-8.2% from last month") that never change.

Fix: Monthly Income and Monthly Expenses lose their `change` subtext entirely (a real trend needs historical comparison data — that's issue #15's separate, not-yet-built trend endpoint). Total Balance also loses its subtext (it never described total balance correctly in the first place). Net Savings keeps a real subtext: `{(netIncome / totalIncome) * 100}% of income` — a legitimate same-period ratio, not a trend, so it's honest to show now. Its color (`changeType`) is derived from the actual sign of `netIncome` (`'positive'` if ≥ 0, `'negative'` otherwise) instead of being hardcoded to `'positive'`.

## Component changes

**`frontend/src/services/transaction.service.ts`** — add:
```ts
async getTransactionStats(filters: { startDate?: string; endDate?: string; accountId?: string } = {}): Promise<TransactionStats> {
  const response = await apiClient.get<{ stats: TransactionStats }>('/transactions/stats', { params: filters });
  return response.data.stats;
}
```

**`frontend/src/pages/Dashboard.tsx`** — rewritten to fetch on mount (`useEffect` + `Promise.all`, mirroring the existing `loadAll` pattern in `pages/Goals.tsx`/`pages/Transactions.tsx`):
1. `accountService.getAccountSummary()`
2. `transactionService.getTransactionStats({ startDate, endDate })` scoped to the 1st of the current calendar month through today (two small local date helpers, matching the existing `todayForInput()`/`toDateInputValue()` colocated-helper convention already used in `GoalForm.tsx`/`TransactionForm.tsx` rather than a new shared utility)
3. `transactionService.getTransactions()`, sliced to the first 8 for `RecentTransactions`

Adds `loading`/`error` state and a blocking error card with a Retry button — the same pattern already used on Accounts/Transactions/Goals — since Dashboard currently has no loading or error handling at all (the mock data was synchronous, so none was ever needed).

**`frontend/src/components/dashboard/RecentTransactions.tsx`** — retyped from the mock `Transaction` shape (`frontend/src/types/index.ts`, `account: string`, `type: 'income' | 'expense'`) to the real one (`frontend/src/types/api.types.ts`, `account: { name, type }`, `type: TransactionType`), matching how `TransactionRow.tsx` already consumes it. Its own `CATEGORY_LABELS` map is duplicated inline rather than extracted to a shared module — `TransactionRow.tsx` and `TransactionForm.tsx` already each keep their own identical copy of this map, so a new shared constants file would be inconsistent with the codebase's existing (if imperfect) convention here, and this fix isn't the place to unilaterally change that. Its "View all" link changes from a plain `<a href="/transactions">` (a full page reload in this single-page app) to `<Link to="/transactions">`, a one-line, zero-risk correction in a file already being fully rewritten.

## Explicitly unchanged

- The two "Chart coming soon..." placeholder boxes (issue #15 item 3 — needs a charting library decision, separate spec).
- The three Quick Actions buttons, still with no `onClick` (issue #15 item 4).
- `frontend/src/data/mockData.ts` and the mock-shaped types in `frontend/src/types/index.ts` (`Transaction`, `Account`, `Budget`, `Category`, `User`) are left in place, now unused by Dashboard but intentionally not deleted — issue #15 item 5 earmarks `mockData.ts` for reuse by the Landing page's decorative hero mockup in a future change. `types/index.ts` also still holds `NavigationItem`, which `Sidebar.tsx` genuinely uses, so the file itself isn't removable regardless.

## Testing

No frontend test suite exists in this repo (per `CLAUDE.md`). Verification is `npm run build:frontend` and `npm run lint:frontend` passing, plus a manual browser check (log in, confirm the Dashboard's four stat cards and Recent Transactions list match what's actually in the logged-in user's Accounts/Transactions pages, confirm the loading state and a simulated error/Retry work) — Claude cannot verify UI behavior directly, no browser tool is available this session.
