# Dashboard Real-Data Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `frontend/src/pages/Dashboard.tsx`'s hardcoded `mockTransactions` with real data from the existing `account.service.ts` / `transaction.service.ts`, per `docs/superpowers/specs/2026-08-10-dashboard-real-data-design.md` and [issue #15](https://github.com/myst9811/ChronosFin/issues/15) item 1.

**Architecture:** Pure frontend change — no backend/migration work. `GET /accounts/summary` and `GET /transactions/stats` already exist and return exactly what's needed; the only backend-facing gap is that `transactionService` never exposed a method for the `/transactions/stats` endpoint. `Dashboard.tsx` fetches all three (`getAccountSummary`, `getTransactionStats`, `getTransactions`) in parallel on mount, with the same `loading`/`error`/Retry pattern already used on `pages/Goals.tsx` and `pages/Transactions.tsx`. `RecentTransactions.tsx` is retyped from the mock `Transaction` shape to the real one.

**Tech Stack:** React 19, TypeScript, axios (via `apiClient`). No frontend test suite exists in this repo — verification is `npm run build:frontend` (tsc + vite build) and `npm run lint:frontend` (eslint), plus a manual browser check at the end.

---

## Task 1: Add `getTransactionStats` to the transaction service

**Files:**
- Modify: `frontend/src/services/transaction.service.ts`

- [ ] **Step 1: Replace the file with this exact content**

```ts
import apiClient from '../lib/apiClient';
import { CreateTransactionRequest, Transaction, TransactionStats, TransactionType, UpdateTransactionRequest } from '../types/api.types';

interface TransactionListFilters {
  accountId?: string;
  type?: TransactionType;
}

interface TransactionStatsFilters {
  startDate?: string;
  endDate?: string;
  accountId?: string;
}

class TransactionService {
  async getTransactions(filters: TransactionListFilters = {}): Promise<Transaction[]> {
    const response = await apiClient.get<{ transactions: Transaction[] }>('/transactions', {
      params: filters,
    });
    return response.data.transactions;
  }

  async getTransactionStats(filters: TransactionStatsFilters = {}): Promise<TransactionStats> {
    const response = await apiClient.get<{ stats: TransactionStats }>('/transactions/stats', {
      params: filters,
    });
    return response.data.stats;
  }

  async createTransaction(data: CreateTransactionRequest): Promise<Transaction> {
    const response = await apiClient.post<{ transaction: Transaction }>('/transactions', data);
    return response.data.transaction;
  }

  async updateTransaction(id: string, data: UpdateTransactionRequest): Promise<Transaction> {
    const response = await apiClient.patch<{ transaction: Transaction }>(`/transactions/${id}`, data);
    return response.data.transaction;
  }

  async deleteTransaction(id: string): Promise<void> {
    await apiClient.delete(`/transactions/${id}`);
  }
}

export default new TransactionService();
```

`TransactionStats` is already defined in `frontend/src/types/api.types.ts:157-164` (`totalTransactions`, `totalIncome`, `totalExpenses`, `netIncome`, `byCategory`, `recentTransactions`) — no type changes needed, just importing it here.

- [ ] **Step 2: Verify the frontend still builds**

Run: `cd /Users/shannensaikia/Projects/ChronosFin && npm run build:frontend`
Expected: build succeeds (nothing calls `getTransactionStats` yet, so this only checks the new method itself type-checks against the real `/transactions/stats` response shape).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/transaction.service.ts
git commit -m "Add getTransactionStats to transaction service"
```

---

## Task 2: Retype RecentTransactions to consume real transaction data

**Files:**
- Modify: `frontend/src/components/dashboard/RecentTransactions.tsx`

- [ ] **Step 1: Replace the file with this exact content**

```tsx
import { Link } from 'react-router-dom';
import { Transaction, TransactionType } from '../../types/api.types';
import { formatCurrency, formatDateShort } from '../../utils/formatters';

interface RecentTransactionsProps {
  transactions: Transaction[];
  limit?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  FOOD_DINING: 'Food & Dining',
  TRANSPORTATION: 'Transportation',
  SHOPPING: 'Shopping',
  ENTERTAINMENT: 'Entertainment',
  BILLS_UTILITIES: 'Bills & Utilities',
  HEALTHCARE: 'Healthcare',
  EDUCATION: 'Education',
  TRAVEL: 'Travel',
  INCOME_SALARY: 'Salary',
  INCOME_BUSINESS: 'Business Income',
  TRANSFER: 'Transfer',
  OTHER: 'Other',
};

const RecentTransactions = ({ transactions, limit = 5 }: RecentTransactionsProps) => {
  const recentTransactions = transactions.slice(0, limit);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
        <Link to="/transactions" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
          View all
        </Link>
      </div>
      <div className="space-y-3">
        {recentTransactions.length === 0 && (
          <p className="text-sm text-gray-500">No transactions yet.</p>
        )}
        {recentTransactions.map((transaction) => (
          <div key={transaction.id} className="flex items-center justify-between py-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {transaction.description}
              </p>
              <p className="text-xs text-gray-500">
                {CATEGORY_LABELS[transaction.category] ?? transaction.category} • {formatDateShort(transaction.date)}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium ${
                transaction.type === TransactionType.INCOME ? 'text-success' : 'text-gray-900'
              }`}>
                {transaction.type === TransactionType.INCOME ? '+' : '-'}{formatCurrency(transaction.amount)}
              </p>
              <p className="text-xs text-gray-500">{transaction.account.name}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentTransactions;
```

Three deliberate changes from the mock version, per the design spec:
1. `transaction.account` (a plain string in the mock shape) becomes `transaction.account.name` (the real API always includes the related account as `{ name, type }`).
2. `transaction.type === 'income'` (mock's lowercase string) becomes `transaction.type === TransactionType.INCOME` (the real enum).
3. `transaction.category` is now a raw enum value (e.g. `FOOD_DINING`) that needs the `CATEGORY_LABELS` map to display as human text — the mock data stored pre-formatted category strings, so this mapping didn't previously exist here. This is the same map already duplicated in `TransactionRow.tsx` and `TransactionForm.tsx` — kept as its own inline copy here too, matching that existing (if imperfect) codebase convention rather than introducing a new shared constants module.

Also: the "View all" link changes from `<a href="/transactions">` to `<Link to="/transactions">` (react-router client-side navigation instead of a full page reload), and an empty-state message is added for when there are no transactions yet — `Dashboard.tsx` (Task 3) no longer guarantees non-empty mock data, so a real new user with zero transactions needs to see something other than a blank list.

- [ ] **Step 2: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "'income'\|'expense'\|from '../../types'" src/components/dashboard/RecentTransactions.tsx`
Expected: no output (confirms the old mock-typed import and lowercase string comparisons are gone).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/RecentTransactions.tsx
git commit -m "Retype RecentTransactions to consume real Transaction data"
```

---

## Task 3: Wire Dashboard to real data

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace the file with this exact content**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  WalletIcon
} from '@heroicons/react/24/outline';
import StatCard from '../components/common/StatCard';
import RecentTransactions from '../components/dashboard/RecentTransactions';
import accountService from '../services/account.service';
import transactionService from '../services/transaction.service';
import { AccountSummary, Transaction, TransactionStats } from '../types/api.types';
import { formatCurrency } from '../utils/formatters';

function firstDayOfMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function today(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [summaryData, statsData, transactionsData] = await Promise.all([
        accountService.getAccountSummary(),
        transactionService.getTransactionStats({ startDate: firstDayOfMonth(), endDate: today() }),
        transactionService.getTransactions(),
      ]);
      setSummary(summaryData);
      setStats(statsData);
      setRecentTransactions(transactionsData);
    } catch {
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  if (loading) {
    return <p className="text-gray-500">Loading dashboard...</p>;
  }

  if (error) {
    return (
      <div className="card space-y-3">
        <p className="text-red-700">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            loadAll();
          }}
          className="btn-secondary"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalIncome = stats?.totalIncome ?? 0;
  const totalExpenses = stats?.totalExpenses ?? 0;
  const netIncome = stats?.netIncome ?? 0;
  const savingsRate = totalIncome > 0 ? ((netIncome / totalIncome) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back! Here's your financial overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Balance"
          value={formatCurrency(summary?.totalBalance ?? 0)}
          icon={WalletIcon}
        />
        <StatCard
          title="Monthly Income"
          value={formatCurrency(totalIncome)}
          icon={ArrowTrendingUpIcon}
        />
        <StatCard
          title="Monthly Expenses"
          value={formatCurrency(totalExpenses)}
          icon={ArrowTrendingDownIcon}
        />
        <StatCard
          title="Net Savings"
          value={formatCurrency(netIncome)}
          change={`${savingsRate}% of income`}
          changeType={netIncome >= 0 ? 'positive' : 'negative'}
          icon={BanknotesIcon}
        />
      </div>

      {/* Charts Row - Placeholder for future charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending by Category</h3>
          <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
            <p className="text-gray-500">Chart coming soon...</p>
          </div>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Income vs Expenses</h3>
          <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
            <p className="text-gray-500">Chart coming soon...</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <RecentTransactions transactions={recentTransactions} limit={8} />

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="btn-primary">
            Add Transaction
          </button>
          <button className="btn-secondary">
            Create Budget
          </button>
          <button className="btn-secondary">
            Set Goal
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
```

Per the design spec:
- **Total Balance** now comes from `accountService.getAccountSummary().totalBalance` and has no `change` subtext (the old one was a copy-pasted "savings rate" that had nothing to do with an all-time balance).
- **Monthly Income** / **Monthly Expenses** now come from `transactionService.getTransactionStats(...)` scoped to the 1st of the current calendar month through today, with no `change` subtext (the old "+12.5% from last month" / "-8.2% from last month" were literal hardcoded strings — a real trend needs historical comparison data that doesn't exist yet, tracked separately as issue #15 item 2).
- **Net Savings** comes from the same stats call's `netIncome`, and keeps a real `change` subtext (`{savingsRate}% of income`, a same-period ratio, not a trend) whose color now reflects the actual sign of `netIncome` instead of being hardcoded to `'positive'`.
- The Charts row and Quick Actions buttons are untouched — both explicitly out of scope (issue #15 items 3 and 4).

- [ ] **Step 2: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "mockTransactions\|mockData" src/pages/Dashboard.tsx`
Expected: no output (confirms the mock data import and usage are fully gone).

- [ ] **Step 3: Full build and lint**

Run: `cd /Users/shannensaikia/Projects/ChronosFin && npm run build:frontend && npm run lint:frontend`
Expected: both succeed with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "Wire Dashboard to real account/transaction data"
```

---

## Task 4: Manual verification and branch finish

**Files:** none (verification only)

- [ ] **Step 1: Confirm `mockData.ts` and `types/index.ts` are untouched**

Run: `cd /Users/shannensaikia/Projects/ChronosFin && git diff --stat main -- frontend/src/data/mockData.ts frontend/src/types/index.ts`
Expected: no output (empty diff) — these are intentionally left in place per the design spec (`mockData.ts` is earmarked for reuse by the Landing page in a future change; `types/index.ts` still holds `NavigationItem`, which `Sidebar.tsx` genuinely uses).

- [ ] **Step 2: Manual browser check (cannot be automated — no browser tool available)**

Run `npm run dev:backend` and `npm run dev:frontend` (or reuse already-running dev servers), log in, and ask the user to confirm:
- The Dashboard's four stat cards show numbers that actually match what's on that user's real Accounts and Transactions pages (Total Balance should equal the Accounts page's Total Balance; Monthly Income/Expenses/Net Savings should reflect this calendar month's real transactions).
- Recent Transactions shows the user's actual most recent transactions (or "No transactions yet." if they have none), each with a correctly human-readable category label and the real account name.
- Clicking "View all" navigates to `/transactions` without a full page reload.
- Temporarily stopping the backend and reloading the Dashboard shows the error card with a working Retry button.

Do not report this task complete until the user confirms the visual review.

- [ ] **Step 3: Finish the branch**

**REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch to verify the build/lint one more time, present the merge/PR/keep/discard options, and execute the user's choice.
