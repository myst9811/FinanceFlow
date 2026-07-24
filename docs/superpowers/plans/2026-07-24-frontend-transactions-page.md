# Frontend Transactions Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `Transactions.tsx` "Coming soon" placeholder with a full CRUD page (create/list/edit/delete transactions, including TRANSFER support), fixing the pre-existing `Transaction`/`CreateTransactionRequest`/`TransactionStats` type mismatches along the way.

**Architecture:** New `transaction.service.ts` (mirrors `account.service.ts`), a `TransactionForm` that receives the account list as a prop from the page (no duplicate fetch), a `TransactionRow` presentational component, and explicit loading/error/retry state on the page itself.

**Tech Stack:** React 19, existing Tailwind utility classes, axios (`apiClient`), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-24-frontend-transactions-page-design.md`

**Note on testing:** per the spec and sub-projects 3/4a's precedent, no new automated frontend tests — verification is manual (Task 6), using curl to exercise exact payloads plus a visual pass.

---

## File Structure

- Modify: `frontend/src/types/api.types.ts` — fix `Transaction`, `CreateTransactionRequest`, `TransactionStats`
- Create: `frontend/src/services/transaction.service.ts`
- Create: `frontend/src/components/transactions/TransactionForm.tsx`
- Create: `frontend/src/components/transactions/TransactionRow.tsx`
- Modify: `frontend/src/pages/Transactions.tsx` — full page, replacing the placeholder

---

### Task 1: Fix Transaction-related types

**Files:**
- Modify: `frontend/src/types/api.types.ts`

- [ ] **Step 1: Fix `CreateTransactionRequest` (add `toAccountId`)**

Replace:

```typescript
export interface CreateTransactionRequest {
  accountId: string;
  amount: number;
  description: string;
  category: TransactionCategory;
  type: TransactionType;
  date: string;
  tags?: string[];
}
```

with:

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

- [ ] **Step 2: Fix `Transaction` (add `toAccountId`, `account`, `toAccount`)**

Replace:

```typescript
export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  amount: number;
  description: string;
  category: TransactionCategory;
  type: TransactionType;
  date: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

with:

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

- [ ] **Step 3: Fix `TransactionStats`**

Replace:

```typescript
export interface TransactionStats {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  transactionCount: number;
  byCategory: {
    category: TransactionCategory;
    total: number;
    count: number;
  }[];
  recentTransactions: Transaction[];
}
```

with:

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

- [ ] **Step 4: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/api.types.ts
git commit -m "fix: correct Transaction/CreateTransactionRequest/TransactionStats types"
```

---

### Task 2: Transaction service

**Files:**
- Create: `frontend/src/services/transaction.service.ts`

- [ ] **Step 1: Create the service**

```typescript
import apiClient from '../lib/apiClient';
import { CreateTransactionRequest, Transaction, TransactionType, UpdateTransactionRequest } from '../types/api.types';

interface TransactionListFilters {
  accountId?: string;
  type?: TransactionType;
}

class TransactionService {
  async getTransactions(filters: TransactionListFilters = {}): Promise<Transaction[]> {
    const response = await apiClient.get<{ transactions: Transaction[] }>('/transactions', {
      params: filters,
    });
    return response.data.transactions;
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

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/transaction.service.ts
git commit -m "feat: add frontend transaction service"
```

---

### Task 3: TransactionForm component

**Files:**
- Create: `frontend/src/components/transactions/TransactionForm.tsx`

- [ ] **Step 1: Create the form**

```typescript
import { useState, FormEvent } from 'react';
import { AxiosError } from 'axios';
import {
  Account,
  CreateTransactionRequest,
  Transaction,
  TransactionCategory,
  TransactionType,
  UpdateTransactionRequest,
} from '../../types/api.types';

interface TransactionFormProps {
  accounts: Account[];
  initialValues?: Transaction;
  onSubmit: (data: CreateTransactionRequest | UpdateTransactionRequest) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

const CATEGORY_OPTIONS: Record<TransactionType, TransactionCategory[]> = {
  [TransactionType.INCOME]: [
    TransactionCategory.INCOME_SALARY,
    TransactionCategory.INCOME_BUSINESS,
    TransactionCategory.OTHER,
  ],
  [TransactionType.EXPENSE]: [
    TransactionCategory.FOOD_DINING,
    TransactionCategory.TRANSPORTATION,
    TransactionCategory.SHOPPING,
    TransactionCategory.ENTERTAINMENT,
    TransactionCategory.BILLS_UTILITIES,
    TransactionCategory.HEALTHCARE,
    TransactionCategory.EDUCATION,
    TransactionCategory.TRAVEL,
    TransactionCategory.OTHER,
  ],
  [TransactionType.TRANSFER]: [TransactionCategory.TRANSFER],
};

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

function toDateInputValue(isoDate?: string): string {
  return isoDate ? isoDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

const TransactionForm = ({ accounts, initialValues, onSubmit, onCancel, submitting }: TransactionFormProps) => {
  const isEditing = !!initialValues;

  const [accountId, setAccountId] = useState(initialValues?.accountId ?? accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState('');
  const [type, setType] = useState<TransactionType>(initialValues?.type ?? TransactionType.INCOME);
  const [amount, setAmount] = useState(String(initialValues?.amount ?? ''));
  const [category, setCategory] = useState<TransactionCategory>(
    initialValues?.category ?? CATEGORY_OPTIONS[TransactionType.INCOME][0]
  );
  const [date, setDate] = useState(toDateInputValue(initialValues?.date));
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setCategory(CATEGORY_OPTIONS[newType][0]);
  };

  const handleAccountChange = (newAccountId: string) => {
    setAccountId(newAccountId);
    if (toAccountId === newAccountId) {
      setToAccountId('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = isEditing
      ? {
          amount: Number(amount),
          description,
          category,
          date,
        }
      : {
          accountId,
          ...(type === TransactionType.TRANSFER ? { toAccountId } : {}),
          amount: Number(amount),
          description,
          category,
          type,
          date,
        };

    try {
      await onSubmit(payload);
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Something went wrong';
      setError(message);
    }
  };

  const toAccountOptions = accounts.filter((a) => a.id !== accountId);

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">
        {isEditing ? 'Edit Transaction' : 'Add Transaction'}
      </h2>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!isEditing && (
        <div>
          <label htmlFor="accountId" className="block text-sm font-medium text-gray-700">
            Account
          </label>
          <select
            id="accountId"
            required
            value={accountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isEditing && (
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700">
            Type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as TransactionType)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            <option value={TransactionType.INCOME}>Income</option>
            <option value={TransactionType.EXPENSE}>Expense</option>
            <option value={TransactionType.TRANSFER}>Transfer</option>
          </select>
        </div>
      )}

      {!isEditing && type === TransactionType.TRANSFER && (
        <div>
          <label htmlFor="toAccountId" className="block text-sm font-medium text-gray-700">
            To Account
          </label>
          <select
            id="toAccountId"
            required
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            <option value="">Select an account</option>
            {toAccountOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
          Amount
        </label>
        <input
          id="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      {type === TransactionType.TRANSFER ? (
        <p className="text-sm text-gray-500">Category: Transfer</p>
      ) : (
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TransactionCategory)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            {CATEGORY_OPTIONS[type].map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="date" className="block text-sm font-medium text-gray-700">
          Date
        </label>
        <input
          id="date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <input
          id="description"
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Transaction'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
};

export default TransactionForm;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/transactions/TransactionForm.tsx
git commit -m "feat: add TransactionForm component"
```

---

### Task 4: TransactionRow component

**Files:**
- Create: `frontend/src/components/transactions/TransactionRow.tsx`

- [ ] **Step 1: Create the row**

```typescript
import { Transaction, TransactionType } from '../../types/api.types';
import { formatCurrency, formatDateShort } from '../../utils/formatters';

interface TransactionRowProps {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
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

const AMOUNT_STYLES: Record<TransactionType, string> = {
  [TransactionType.INCOME]: 'text-success',
  [TransactionType.EXPENSE]: 'text-gray-900',
  [TransactionType.TRANSFER]: 'text-primary-600',
};

const AMOUNT_PREFIX: Record<TransactionType, string> = {
  [TransactionType.INCOME]: '+',
  [TransactionType.EXPENSE]: '-',
  [TransactionType.TRANSFER]: '',
};

const TransactionRow = ({ transaction, onEdit, onDelete }: TransactionRowProps) => {
  return (
    <div className="card flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-900">{transaction.description}</p>
        <p className="mt-1 text-sm text-gray-500">
          {CATEGORY_LABELS[transaction.category] ?? transaction.category} · {formatDateShort(transaction.date)} ·{' '}
          {transaction.account.name}
          {transaction.toAccount && ` → ${transaction.toAccount.name}`}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <p className={`text-lg font-semibold ${AMOUNT_STYLES[transaction.type]}`}>
          {AMOUNT_PREFIX[transaction.type]}
          {formatCurrency(transaction.amount)}
        </p>
        <div className="flex gap-2">
          <button onClick={() => onEdit(transaction)} className="btn-secondary">
            Edit
          </button>
          <button
            onClick={() => onDelete(transaction)}
            className="rounded-lg px-4 py-2 font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionRow;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/transactions/TransactionRow.tsx
git commit -m "feat: add TransactionRow component"
```

---

### Task 5: Transactions page

**Files:**
- Modify: `frontend/src/pages/Transactions.tsx`

- [ ] **Step 1: Replace the placeholder with the full page**

```typescript
import { useCallback, useEffect, useState } from 'react';
import TransactionForm from '../components/transactions/TransactionForm';
import TransactionRow from '../components/transactions/TransactionRow';
import transactionService from '../services/transaction.service';
import accountService from '../services/account.service';
import {
  Account,
  CreateTransactionRequest,
  Transaction,
  TransactionType,
  UpdateTransactionRequest,
} from '../types/api.types';

const Transactions = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [accountsData, transactionsData] = await Promise.all([
        accountService.getAccounts(),
        transactionService.getTransactions({
          accountId: accountFilter || undefined,
          type: (typeFilter || undefined) as TransactionType | undefined,
        }),
      ]);
      setAccounts(accountsData);
      setTransactions(transactionsData);
    } catch {
      setError('Failed to load transactions. Please try again.');
    }
  }, [accountFilter, typeFilter]);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const handleCreate = () => {
    setEditingTransaction(null);
    setFormMode('create');
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormMode('edit');
  };

  const handleDelete = async (transaction: Transaction) => {
    if (!window.confirm(`Delete "${transaction.description}"? This can't be undone.`)) {
      return;
    }
    await transactionService.deleteTransaction(transaction.id);
    await loadAll();
  };

  const handleSubmit = async (data: CreateTransactionRequest | UpdateTransactionRequest) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && editingTransaction) {
        await transactionService.updateTransaction(editingTransaction.id, data as UpdateTransactionRequest);
      } else {
        await transactionService.createTransaction(data as CreateTransactionRequest);
      }
      await loadAll();
      setFormMode(null);
      setEditingTransaction(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading transactions...</p>;
  }

  if (error) {
    return (
      <div className="card space-y-3">
        <p className="text-red-700">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            loadAll().finally(() => setLoading(false));
          }}
          className="btn-secondary"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        {!formMode && (
          <div className="flex items-center gap-3">
            {accounts.length === 0 && (
              <span className="text-sm text-gray-500">Create an account first</span>
            )}
            <button
              onClick={handleCreate}
              disabled={accounts.length === 0}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Transaction
            </button>
          </div>
        )}
      </div>

      {!formMode && (
        <div className="flex gap-4">
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value={TransactionType.INCOME}>Income</option>
            <option value={TransactionType.EXPENSE}>Expense</option>
            <option value={TransactionType.TRANSFER}>Transfer</option>
          </select>
        </div>
      )}

      {formMode && (
        <TransactionForm
          accounts={accounts}
          initialValues={formMode === 'edit' ? editingTransaction ?? undefined : undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormMode(null);
            setEditingTransaction(null);
          }}
          submitting={submitting}
        />
      )}

      <div className="space-y-4">
        {transactions.length === 0 && <p className="text-gray-500">No transactions yet.</p>}
        {transactions.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
};

export default Transactions;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Transactions.tsx
git commit -m "feat: build the Transactions page with full CRUD"
```

---

### Task 6: End-to-end manual verification

**Files:** none (verification only — fix and commit separately if anything fails)

- [ ] **Step 1: Start both dev servers**

```bash
npm run db:up
npm run dev:backend
```

In a separate terminal:

```bash
npm run dev:frontend
```

- [ ] **Step 2: Fresh user, no accounts**

Log in as a brand-new user, open `/transactions`. Expected: "No transactions yet.", "Create an account first" next to a disabled "Add Transaction" button.

- [ ] **Step 3: Create two accounts, then create INCOME/EXPENSE/TRANSFER transactions**

Go to `/accounts`, create two accounts (e.g. "Checking" and "Savings"). Back on `/transactions`, "Add Transaction" is now enabled. Create:
- An INCOME transaction on Checking
- An EXPENSE transaction on Checking
- A TRANSFER from Checking to Savings

Expected: all three appear in the list with correct formatting (amount color/prefix, category label, account name, "→ Savings" on the transfer row). Check `/accounts` — Checking's balance reflects income minus expense minus the transfer amount, Savings' balance increased by the transfer amount.

- [ ] **Step 4: Edit transactions**

Edit the EXPENSE transaction's amount. Expected: Checking's balance updates by the delta (verify via `/accounts`). Edit the TRANSFER transaction's amount. Expected: both Checking and Savings' balances update by the delta. For both edits, confirm the category dropdown only shows that transaction's type-appropriate categories (Transfer shows "Category: Transfer" as static text, not editable).

- [ ] **Step 5: Delete a transaction**

Delete the INCOME transaction. Expected: it disappears from the list, Checking's balance decreases by that amount (the balance effect is reversed).

- [ ] **Step 6: Filters**

Filter by Checking → only Checking-sourced transactions show (the transfer TO Savings won't appear when filtering by Savings, since the backend's `accountId` filter doesn't match `toAccountId` — this is the documented known limitation, not a bug to fix here). Filter by Type = Transfer → only the transfer shows.

- [ ] **Step 7: Verify the UI prevents invalid transfers, and check the backend's own validation separately**

In the UI: confirm there's no way to submit a Transfer without selecting a To Account (the field is required) or with the same account as both source and destination (the To Account dropdown excludes whichever account is selected as the source).

Separately, verify the backend error text directly (bypassing the UI):

```bash
TOKEN="<paste from browser localStorage financeflow_auth_token>"
ACCOUNT_ID="<paste one of your account IDs from the Network tab or /api/accounts>"

# Missing toAccountId for a TRANSFER
curl -s -X POST http://localhost:3001/api/transactions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"accountId\":\"$ACCOUNT_ID\",\"amount\":10,\"description\":\"test\",\"category\":\"TRANSFER\",\"type\":\"TRANSFER\",\"date\":\"2026-07-24\"}"

# Same account as source and destination
curl -s -X POST http://localhost:3001/api/transactions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"accountId\":\"$ACCOUNT_ID\",\"toAccountId\":\"$ACCOUNT_ID\",\"amount\":10,\"description\":\"test\",\"category\":\"TRANSFER\",\"type\":\"TRANSFER\",\"date\":\"2026-07-24\"}"
```

Expected: `{"error":"toAccountId is required for TRANSFER transactions"}` and `{"error":"toAccountId must be different from accountId"}` respectively (adjust the port if your backend runs on a different one locally).

- [ ] **Step 8: Loading and error states**

Stop the backend (Ctrl-C the `npm run dev:backend` process), then reload `/transactions`. Expected: an error message and a "Retry" button, not a silent empty list. Restart the backend and click Retry. Expected: the page recovers and loads normally.

- [ ] **Step 9: Final build check**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 10: Stop the dev servers**

Ctrl-C both `npm run dev:frontend` and `npm run dev:backend` processes once all checks above pass.

---

## Self-Review Notes

- **Spec coverage:** type fixes (Task 1), service (Task 2), form with mode-aware fields/category-filtering/date-conversion/tags-omission (Task 3), row display (Task 4), full page with loading/error/retry and filters (Task 5), manual verification matching the spec's corrected checklist exactly, including the two-account transfer setup, the UI-prevents-it + curl-based validation check, and the loading/error/retry check (Task 6). Out-of-scope items (category/date-range/amount-range/search filters, tags UI, pagination, stats, the known account-filter limitation) correctly have no corresponding tasks.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `Transaction` (with `toAccountId`/`account`/`toAccount`), `CreateTransactionRequest` (with `toAccountId`), `UpdateTransactionRequest`, `TransactionType`, `TransactionCategory` (Task 1) are used identically across `transaction.service.ts` (Task 2), `TransactionForm.tsx` (Task 3), `TransactionRow.tsx` (Task 4), and `Transactions.tsx` (Task 5). `CATEGORY_LABELS` is duplicated verbatim between `TransactionForm.tsx` and `TransactionRow.tsx` rather than shared — both are small, self-contained presentational lookups local to their own component, consistent with `AccountCard.tsx`'s `TYPE_LABELS` pattern from sub-project 4a; not worth a shared module for a 12-entry constant used in exactly two places.
