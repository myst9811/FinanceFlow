# Frontend Accounts Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `Accounts.tsx` "Coming soon" placeholder with a full CRUD page (create/list/edit/deactivate accounts), fixing the pre-existing `AccountSummary` type mismatch along the way.

**Architecture:** New `account.service.ts` (mirrors `auth.service.ts`/`insight.service.ts`'s pattern), a shared `AccountForm` used for both create and edit, a small `AccountCard` presentational component, and `StatCard` promoted from `components/dashboard/` to `components/common/` since it's now used by two pages.

**Tech Stack:** React 19, existing Tailwind utility classes (`.card`/`.btn-primary`/`.btn-secondary`), axios (`apiClient`), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-23-frontend-accounts-page-design.md`

**Note on testing:** per the spec and sub-project 3's precedent, no new automated frontend tests — verification is manual (Task 7).

---

## File Structure

- Modify: `frontend/src/types/api.types.ts` — fix `AccountSummary`
- Move: `frontend/src/components/dashboard/StatCard.tsx` → `frontend/src/components/common/StatCard.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx` — updated `StatCard` import path
- Create: `frontend/src/services/account.service.ts`
- Create: `frontend/src/components/accounts/AccountForm.tsx`
- Create: `frontend/src/components/accounts/AccountCard.tsx`
- Modify: `frontend/src/pages/Accounts.tsx` — full page, replacing the placeholder

---

### Task 1: Fix the `AccountSummary` type

**Files:**
- Modify: `frontend/src/types/api.types.ts`

- [ ] **Step 1: Replace the incorrect interface**

Replace:

```typescript
export interface AccountSummary {
  totalBalance: number;
  totalChecking: number;
  totalSavings: number;
  totalCredit: number;
  totalInvestment: number;
  accountsByType: {
    type: AccountType;
    count: number;
    totalBalance: number;
  }[];
}
```

with:

```typescript
export interface AccountSummary {
  totalAccounts: number;
  totalBalance: number;
  byType: Record<AccountType, number>;
}
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/api.types.ts
git commit -m "fix: correct AccountSummary type to match the backend response shape"
```

---

### Task 2: Promote StatCard to a shared component

**Files:**
- Move: `frontend/src/components/dashboard/StatCard.tsx` → `frontend/src/components/common/StatCard.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Move the file**

```bash
git mv frontend/src/components/dashboard/StatCard.tsx frontend/src/components/common/StatCard.tsx
```

- [ ] **Step 2: Update Dashboard.tsx's import**

In `frontend/src/pages/Dashboard.tsx`, replace:

```typescript
import StatCard from '../components/dashboard/StatCard';
```

with:

```typescript
import StatCard from '../components/common/StatCard';
```

- [ ] **Step 3: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/StatCard.tsx frontend/src/components/common/StatCard.tsx frontend/src/pages/Dashboard.tsx
git commit -m "refactor: promote StatCard to a shared component"
```

---

### Task 3: Account service

**Files:**
- Create: `frontend/src/services/account.service.ts`

- [ ] **Step 1: Create the service**

```typescript
import apiClient from '../lib/apiClient';
import { Account, AccountSummary, CreateAccountRequest, UpdateAccountRequest } from '../types/api.types';

class AccountService {
  async getAccounts(activeOnly = true): Promise<Account[]> {
    const response = await apiClient.get<{ accounts: Account[] }>('/accounts', {
      params: { active: activeOnly },
    });
    return response.data.accounts;
  }

  async getAccountSummary(): Promise<AccountSummary> {
    const response = await apiClient.get<{ summary: AccountSummary }>('/accounts/summary');
    return response.data.summary;
  }

  async createAccount(data: CreateAccountRequest): Promise<Account> {
    const response = await apiClient.post<{ account: Account }>('/accounts', data);
    return response.data.account;
  }

  async updateAccount(id: string, data: UpdateAccountRequest): Promise<Account> {
    const response = await apiClient.patch<{ account: Account }>(`/accounts/${id}`, data);
    return response.data.account;
  }

  async deleteAccount(id: string): Promise<void> {
    await apiClient.delete(`/accounts/${id}`);
  }
}

export default new AccountService();
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/account.service.ts
git commit -m "feat: add frontend account service"
```

---

### Task 4: AccountForm component

**Files:**
- Create: `frontend/src/components/accounts/AccountForm.tsx`

- [ ] **Step 1: Create the form**

```typescript
import { useState, FormEvent } from 'react';
import { AxiosError } from 'axios';
import { Account, AccountType, CreateAccountRequest, UpdateAccountRequest } from '../../types/api.types';

interface AccountFormProps {
  initialValues?: Account;
  onSubmit: (data: CreateAccountRequest | UpdateAccountRequest) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

const AccountForm = ({ initialValues, onSubmit, onCancel, submitting }: AccountFormProps) => {
  const isEditing = !!initialValues;
  const [name, setName] = useState(initialValues?.name ?? '');
  const [type, setType] = useState<AccountType>(initialValues?.type ?? AccountType.CHECKING);
  const [balance, setBalance] = useState(String(initialValues?.balance ?? 0));
  const [currency, setCurrency] = useState(initialValues?.currency ?? 'USD');
  const [bankName, setBankName] = useState(initialValues?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(initialValues?.accountNumber ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = isEditing
      ? {
          name,
          balance: Number(balance),
          bankName: bankName || undefined,
          accountNumber: accountNumber || undefined,
        }
      : {
          name,
          type,
          balance: Number(balance),
          currency,
          bankName: bankName || undefined,
          accountNumber: accountNumber || undefined,
        };

    try {
      await onSubmit(payload);
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Something went wrong';
      setError(message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">
        {isEditing ? 'Edit Account' : 'Add Account'}
      </h2>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700">
            Type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            <option value={AccountType.CHECKING}>Checking</option>
            <option value={AccountType.SAVINGS}>Savings</option>
            <option value={AccountType.CREDIT}>Credit</option>
            <option value={AccountType.INVESTMENT}>Investment</option>
          </select>
        </div>
      )}

      <div>
        <label htmlFor="balance" className="block text-sm font-medium text-gray-700">
          Balance
        </label>
        <input
          id="balance"
          type="number"
          step="0.01"
          min="0"
          required
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          {isEditing
            ? 'Manually adjusting this overrides the balance directly, separate from transaction history.'
            : 'Starting balance for this account.'}
        </p>
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="currency" className="block text-sm font-medium text-gray-700">
            Currency
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="bankName" className="block text-sm font-medium text-gray-700">
          Bank name (optional)
        </label>
        <input
          id="bankName"
          type="text"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="accountNumber" className="block text-sm font-medium text-gray-700">
          Account number (optional)
        </label>
        <input
          id="accountNumber"
          type="text"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Account'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
};

export default AccountForm;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/accounts/AccountForm.tsx
git commit -m "feat: add AccountForm component"
```

---

### Task 5: AccountCard component

**Files:**
- Create: `frontend/src/components/accounts/AccountCard.tsx`

- [ ] **Step 1: Create the card**

```typescript
import { Account } from '../../types/api.types';
import { formatCurrency } from '../../utils/formatters';

interface AccountCardProps {
  account: Account;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}

const TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Checking',
  SAVINGS: 'Savings',
  CREDIT: 'Credit',
  INVESTMENT: 'Investment',
};

const AccountCard = ({ account, onEdit, onDelete }: AccountCardProps) => {
  return (
    <div className="card flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900">{account.name}</p>
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600">
            {TYPE_LABELS[account.type] ?? account.type}
          </span>
        </div>
        {account.bankName && (
          <p className="mt-1 text-sm text-gray-500">{account.bankName}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <p className="text-lg font-semibold text-gray-900">
          {formatCurrency(account.balance, account.currency)}
        </p>
        <div className="flex gap-2">
          <button onClick={() => onEdit(account)} className="btn-secondary">
            Edit
          </button>
          <button
            onClick={() => onDelete(account)}
            className="rounded-lg px-4 py-2 font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountCard;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/accounts/AccountCard.tsx
git commit -m "feat: add AccountCard component"
```

---

### Task 6: Accounts page

**Files:**
- Modify: `frontend/src/pages/Accounts.tsx`

- [ ] **Step 1: Replace the placeholder with the full page**

```typescript
import { useEffect, useState } from 'react';
import StatCard from '../components/common/StatCard';
import AccountForm from '../components/accounts/AccountForm';
import AccountCard from '../components/accounts/AccountCard';
import accountService from '../services/account.service';
import { Account, AccountSummary, CreateAccountRequest, UpdateAccountRequest } from '../types/api.types';
import { formatCurrency } from '../utils/formatters';

const Accounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    const [accountsData, summaryData] = await Promise.all([
      accountService.getAccounts(),
      accountService.getAccountSummary(),
    ]);
    setAccounts(accountsData);
    setSummary(summaryData);
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const handleCreate = () => {
    setEditingAccount(null);
    setFormMode('create');
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormMode('edit');
  };

  const handleDelete = async (account: Account) => {
    if (!window.confirm(`Deactivate "${account.name}"? This can't be undone from the UI.`)) {
      return;
    }
    await accountService.deleteAccount(account.id);
    await loadData();
  };

  const handleSubmit = async (data: CreateAccountRequest | UpdateAccountRequest) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && editingAccount) {
        await accountService.updateAccount(editingAccount.id, data as UpdateAccountRequest);
      } else {
        await accountService.createAccount(data as CreateAccountRequest);
      }
      await loadData();
      setFormMode(null);
      setEditingAccount(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading accounts...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
        {!formMode && (
          <button onClick={handleCreate} className="btn-primary">
            Add Account
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <StatCard title="Total Balance" value={formatCurrency(summary?.totalBalance ?? 0)} />
        <StatCard title="Total Accounts" value={String(summary?.totalAccounts ?? 0)} />
      </div>

      {formMode && (
        <AccountForm
          initialValues={formMode === 'edit' ? editingAccount ?? undefined : undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormMode(null);
            setEditingAccount(null);
          }}
          submitting={submitting}
        />
      )}

      <div className="space-y-4">
        {accounts.length === 0 && (
          <p className="text-gray-500">No accounts yet. Add one to get started.</p>
        )}
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
};

export default Accounts;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Accounts.tsx
git commit -m "feat: build the Accounts page with full CRUD"
```

---

### Task 7: End-to-end manual verification

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

- [ ] **Step 2: Log in and open /accounts**

Register or log in with an existing user, navigate to Accounts via the sidebar. Expected: "Total Balance: $0.00", "Total Accounts: 0", "No accounts yet. Add one to get started."

- [ ] **Step 3: Create an account of each type**

Click "Add Account", create one Checking, one Savings, one Credit, one Investment account with different starting balances. Expected: each appears in the list immediately after creation, stat cards update to reflect the new totals.

- [ ] **Step 4: Edit an account**

Click "Edit" on one account, change its name and balance, save. Expected: the card updates, "Total Balance" stat card reflects the new sum.

- [ ] **Step 5: Delete an account**

Click "Delete" on one account, confirm the browser dialog. Expected: it disappears from the list, "Total Accounts" and "Total Balance" stat cards update.

- [ ] **Step 6: Confirm the delete is a soft deactivate, not a hard delete**

```bash
curl -s http://localhost:3001/api/accounts?active=false -H "Authorization: Bearer <token from browser localStorage financeflow_auth_token>"
```

Expected: the deleted account is still present in the response with `"isActive": false` (adjust the port if your backend is running on a different one locally).

- [ ] **Step 7: Trigger a validation error**

Try creating an account with a 1-character name. Expected: the backend's validation error message ("Account name must be at least 2 characters") is displayed in the form, not a silent failure or unhandled exception.

- [ ] **Step 8: Final build check**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 9: Stop the dev servers**

Ctrl-C both `npm run dev:frontend` and `npm run dev:backend` processes once all checks above pass.

---

## Self-Review Notes

- **Spec coverage:** `AccountSummary` fix (Task 1), `StatCard` promotion (Task 2), service (Task 3), form (Task 4), card (Task 5), full page (Task 6), manual verification matching the spec's checklist exactly, including the soft-delete confirmation (Task 7). Out-of-scope items (reactivation UI, `byType` breakdown rendering, Transactions/Goals/Dashboard) correctly have no corresponding tasks.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `Account`, `AccountSummary`, `CreateAccountRequest`, `UpdateAccountRequest`, `AccountType` (Task 1, pre-existing except the `AccountSummary` fix) are used identically across `account.service.ts` (Task 3), `AccountForm.tsx` (Task 4), `AccountCard.tsx` (Task 5), and `Accounts.tsx` (Task 6) — no field names invented that don't exist on these types.
