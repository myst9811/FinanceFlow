# Frontend Goals Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `Goals.tsx` "Coming soon" placeholder with a full CRUD page (create/list/edit/delete goals, plus a dedicated contribute action), fixing three small pre-existing backend bugs and the `CreateGoalRequest`/`UpdateGoalRequest`/`GoalSummary` type mismatches that the design review surfaced.

**Architecture:** Three small backend fixes in already-merged `goal.controller.ts`/`validation.ts` (missing `currentAmount` validation, a lost-update race in the contribute endpoint, an unclamped aggregate). New `goal.service.ts` (mirrors `account.service.ts`/`transaction.service.ts`). `GoalForm` for create/edit; a separate inline "Add Funds" control inside `GoalCard` for contributions, since the backend's additive contribute endpoint is a different operation from the direct-overwrite update endpoint.

**Tech Stack:** React 19, Express/Prisma (backend fixes), existing Tailwind utility classes, axios (`apiClient`), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-24-frontend-goals-page-design.md`

**Note on testing:** the three backend fixes are small, targeted changes to functions that live directly in `goal.controller.ts` (not a separate service file, unlike transactions) — this backend has no controller-level test harness (existing backend tests only cover extracted service-layer functions in `transaction.service.ts`/`insight.service.ts`). Adding one now, for three small fixes, would mean standing up a new testing pattern (supertest against Express routes) disproportionate to the change. Verification is manual/curl-based instead (Task 7), consistent with the frontend side's existing precedent from 4a/4b.

---

## File Structure

- Modify: `backend/src/utils/validation.ts` — add `currentAmount` param/check to `validateGoalInput`
- Modify: `backend/src/controllers/goal.controller.ts` — pass `currentAmount` to validation, atomic `increment` in `addContribution`, clamp `totalRemainingAmount`
- Modify: `frontend/src/types/api.types.ts` — fix `CreateGoalRequest`, `UpdateGoalRequest`, `GoalSummary`
- Create: `frontend/src/services/goal.service.ts`
- Create: `frontend/src/components/goals/GoalForm.tsx`
- Create: `frontend/src/components/goals/GoalCard.tsx`
- Modify: `frontend/src/pages/Goals.tsx` — full page, replacing the placeholder

---

### Task 1: Backend fixes

**Files:**
- Modify: `backend/src/utils/validation.ts`
- Modify: `backend/src/controllers/goal.controller.ts`

- [ ] **Step 1: Add `currentAmount` validation to `validateGoalInput`**

In `backend/src/utils/validation.ts`, replace:

```typescript
export const validateGoalInput = (
  title: string,
  targetAmount: number,
  targetDate: string,
  category: string
): { valid: boolean; error?: string } => {
  if (!title || !targetDate || !category) {
    return { valid: false, error: 'Title, target amount, target date, and category are required' };
  }

  if (title.trim().length < 2) {
    return { valid: false, error: 'Title must be at least 2 characters' };
  }

  if (isNaN(targetAmount) || targetAmount <= 0) {
    return { valid: false, error: 'Target amount must be a positive number' };
  }

  if (!validGoalCategories.includes(category)) {
    return { valid: false, error: `Category must be one of: ${validGoalCategories.join(', ')}` };
  }
```

with:

```typescript
export const validateGoalInput = (
  title: string,
  targetAmount: number,
  targetDate: string,
  category: string,
  currentAmount?: number
): { valid: boolean; error?: string } => {
  if (!title || !targetDate || !category) {
    return { valid: false, error: 'Title, target amount, target date, and category are required' };
  }

  if (title.trim().length < 2) {
    return { valid: false, error: 'Title must be at least 2 characters' };
  }

  if (isNaN(targetAmount) || targetAmount <= 0) {
    return { valid: false, error: 'Target amount must be a positive number' };
  }

  if (currentAmount !== undefined && (isNaN(currentAmount) || currentAmount < 0)) {
    return { valid: false, error: 'Current amount must be a non-negative number' };
  }

  if (!validGoalCategories.includes(category)) {
    return { valid: false, error: `Category must be one of: ${validGoalCategories.join(', ')}` };
  }
```

- [ ] **Step 2: Pass `currentAmount` at the call site in `createGoal`**

In `backend/src/controllers/goal.controller.ts`, replace:

```typescript
  const validation = validateGoalInput(title, targetAmount, targetDate, category);
```

with:

```typescript
  const validation = validateGoalInput(title, targetAmount, targetDate, category, currentAmount);
```

- [ ] **Step 3: Fix the lost-update race in `addContribution`**

In `backend/src/controllers/goal.controller.ts`, replace:

```typescript
  // Add to current amount
  const goal = await prisma.goal.update({
    where: { id },
    data: {
      currentAmount: existingGoal.currentAmount + amount,
    },
  });
```

with:

```typescript
  // Add to current amount atomically (avoids a lost update if two
  // contributions to the same goal happen concurrently)
  const goal = await prisma.goal.update({
    where: { id },
    data: {
      currentAmount: { increment: amount },
    },
  });
```

- [ ] **Step 4: Clamp `totalRemainingAmount` in `getGoalsSummary`**

In `backend/src/controllers/goal.controller.ts`, replace:

```typescript
  const totalRemainingAmount = totalTargetAmount - totalCurrentAmount;
```

with:

```typescript
  const totalRemainingAmount = Math.max(0, totalTargetAmount - totalCurrentAmount);
```

- [ ] **Step 5: Run the full backend test suite**

Run: `npm run test:backend`
Expected: all 38 existing tests still pass (none of them cover goals, so this just confirms nothing else broke)

- [ ] **Step 6: Verify the backend builds**

Run: `npm run build:backend`
Expected: completes with no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/validation.ts backend/src/controllers/goal.controller.ts
git commit -m "fix: validate currentAmount on goal creation, make contributions atomic, clamp remaining-amount aggregate"
```

---

### Task 2: Fix Goal-related frontend types

**Files:**
- Modify: `frontend/src/types/api.types.ts`

- [ ] **Step 1: Fix `CreateGoalRequest` (add `currentAmount`)**

Replace:

```typescript
export interface CreateGoalRequest {
  title: string;
  description?: string;
  targetAmount: number;
  targetDate: string;
  category: GoalCategory;
}
```

with:

```typescript
export interface CreateGoalRequest {
  title: string;
  description?: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate: string;
  category: GoalCategory;
}
```

- [ ] **Step 2: Fix `UpdateGoalRequest` (drop `category`, add `currentAmount`/`isActive`)**

Replace:

```typescript
export interface UpdateGoalRequest {
  title?: string;
  description?: string;
  targetAmount?: number;
  targetDate?: string;
  category?: GoalCategory;
}
```

with:

```typescript
export interface UpdateGoalRequest {
  title?: string;
  description?: string;
  targetAmount?: number;
  currentAmount?: number;
  targetDate?: string;
  isActive?: boolean;
}
```

- [ ] **Step 3: Fix `GoalSummary`**

Replace:

```typescript
export interface GoalSummary {
  totalGoals: number;
  activeGoals: number;
  totalTargetAmount: number;
  totalCurrentAmount: number;
  overallProgress: number;
  byCategory: {
    category: GoalCategory;
    count: number;
    totalTarget: number;
    totalCurrent: number;
    progress: number;
  }[];
  urgentGoals: Goal[];
}
```

with:

```typescript
export interface GoalSummary {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  totalTargetAmount: number;
  totalCurrentAmount: number;
  totalRemainingAmount: number;
  overallProgress: number;
  byCategory: Record<string, { count: number; targetAmount: number; currentAmount: number }>;
  urgentGoals: Goal[];
}
```

- [ ] **Step 4: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/api.types.ts
git commit -m "fix: correct CreateGoalRequest/UpdateGoalRequest/GoalSummary types"
```

---

### Task 3: Goal service

**Files:**
- Create: `frontend/src/services/goal.service.ts`

- [ ] **Step 1: Create the service**

```typescript
import apiClient from '../lib/apiClient';
import { CreateGoalRequest, Goal, GoalSummary, UpdateGoalRequest } from '../types/api.types';

class GoalService {
  async getGoals(activeOnly = true): Promise<Goal[]> {
    const response = await apiClient.get<{ goals: Goal[] }>('/goals', {
      params: { active: activeOnly },
    });
    return response.data.goals;
  }

  async getGoalSummary(): Promise<GoalSummary> {
    const response = await apiClient.get<{ summary: GoalSummary }>('/goals/summary');
    return response.data.summary;
  }

  async createGoal(data: CreateGoalRequest): Promise<Goal> {
    const response = await apiClient.post<{ goal: Goal }>('/goals', data);
    return response.data.goal;
  }

  async updateGoal(id: string, data: UpdateGoalRequest): Promise<Goal> {
    const response = await apiClient.patch<{ goal: Goal }>(`/goals/${id}`, data);
    return response.data.goal;
  }

  async contributeToGoal(id: string, amount: number): Promise<Goal> {
    const response = await apiClient.post<{ goal: Goal }>(`/goals/${id}/contribute`, { amount });
    return response.data.goal;
  }

  async deleteGoal(id: string): Promise<void> {
    await apiClient.delete(`/goals/${id}`);
  }
}

export default new GoalService();
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/goal.service.ts
git commit -m "feat: add frontend goal service"
```

---

### Task 4: GoalForm component

**Files:**
- Create: `frontend/src/components/goals/GoalForm.tsx`

- [ ] **Step 1: Create the form**

```typescript
import { useState, FormEvent } from 'react';
import { AxiosError } from 'axios';
import { CreateGoalRequest, Goal, GoalCategory, UpdateGoalRequest } from '../../types/api.types';

interface GoalFormProps {
  initialValues?: Goal;
  onSubmit: (data: CreateGoalRequest | UpdateGoalRequest) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  EMERGENCY_FUND: 'Emergency Fund',
  HOUSE_DOWN_PAYMENT: 'House Down Payment',
  VACATION: 'Vacation',
  CAR: 'Car',
  DEBT_PAYOFF: 'Debt Payoff',
  RETIREMENT: 'Retirement',
  OTHER: 'Other',
};

function todayForInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const GoalForm = ({ initialValues, onSubmit, onCancel, submitting }: GoalFormProps) => {
  const isEditing = !!initialValues;

  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [targetAmount, setTargetAmount] = useState(String(initialValues?.targetAmount ?? ''));
  const [currentAmount, setCurrentAmount] = useState('0');
  const [targetDate, setTargetDate] = useState(
    initialValues?.targetDate ? initialValues.targetDate.slice(0, 10) : todayForInput()
  );
  const [category, setCategory] = useState<GoalCategory>(initialValues?.category ?? GoalCategory.EMERGENCY_FUND);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = isEditing
      ? {
          title,
          description: description || undefined,
          targetAmount: Number(targetAmount),
          targetDate,
        }
      : {
          title,
          description: description || undefined,
          targetAmount: Number(targetAmount),
          currentAmount: Number(currentAmount),
          targetDate,
          category,
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
      <h2 className="text-lg font-semibold text-gray-900">{isEditing ? 'Edit Goal' : 'Add Goal'}</h2>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">
          Title
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Description (optional)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="targetAmount" className="block text-sm font-medium text-gray-700">
          Target Amount
        </label>
        <input
          id="targetAmount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={targetAmount}
          onChange={(e) => setTargetAmount(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="currentAmount" className="block text-sm font-medium text-gray-700">
            Current Amount (optional)
          </label>
          <input
            id="currentAmount"
            type="number"
            step="0.01"
            min="0"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">How much you've already saved toward this goal.</p>
        </div>
      )}

      <div>
        <label htmlFor="targetDate" className="block text-sm font-medium text-gray-700">
          Target Date
        </label>
        <input
          id="targetDate"
          type="date"
          required
          min={isEditing ? undefined : todayForInput()}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as GoalCategory)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            {Object.values(GoalCategory).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Goal'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
};

export default GoalForm;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/goals/GoalForm.tsx
git commit -m "feat: add GoalForm component"
```

---

### Task 5: GoalCard component (with inline Add Funds)

**Files:**
- Create: `frontend/src/components/goals/GoalCard.tsx`

- [ ] **Step 1: Create the card**

```typescript
import { useState, FormEvent } from 'react';
import { AxiosError } from 'axios';
import { Goal } from '../../types/api.types';
import { formatCurrency } from '../../utils/formatters';

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onContribute: (goal: Goal, amount: number) => Promise<void>;
}

const CATEGORY_LABELS: Record<string, string> = {
  EMERGENCY_FUND: 'Emergency Fund',
  HOUSE_DOWN_PAYMENT: 'House Down Payment',
  VACATION: 'Vacation',
  CAR: 'Car',
  DEBT_PAYOFF: 'Debt Payoff',
  RETIREMENT: 'Retirement',
  OTHER: 'Other',
};

const GoalCard = ({ goal, onEdit, onDelete, onContribute }: GoalCardProps) => {
  const [showContribute, setShowContribute] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = Math.min(100, goal.progress ?? 0);
  const isCompleted = (goal.progress ?? 0) >= 100;

  const handleContribute = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onContribute(goal, Number(amount));
      setAmount('');
      setShowContribute(false);
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Something went wrong';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900">{goal.title}</p>
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600">
              {CATEGORY_LABELS[goal.category] ?? goal.category}
            </span>
          </div>
          {goal.description && <p className="mt-1 text-sm text-gray-500">{goal.description}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEdit(goal)} className="btn-secondary">
            Edit
          </button>
          <button
            onClick={() => onDelete(goal)}
            className="rounded-lg px-4 py-2 font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div>
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className={`h-2 rounded-full ${isCompleted ? 'bg-success' : 'bg-primary-600'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-sm text-gray-600">
          <span>
            {formatCurrency(goal.currentAmount)} of {formatCurrency(goal.targetAmount)} ({Math.round(progress)}%)
          </span>
          <span className={isCompleted ? 'font-medium text-success' : ''}>
            {isCompleted ? 'Goal completed!' : `${goal.daysRemaining ?? 0} days left`}
          </span>
        </div>
      </div>

      {showContribute ? (
        <form onSubmit={handleContribute} className="flex items-start gap-2">
          <div className="flex-1">
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              autoFocus
              disabled={submitting}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
            />
            {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
          </div>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Adding...' : 'Add'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setShowContribute(false);
              setError(null);
              setAmount('');
            }}
            className="btn-secondary"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button onClick={() => setShowContribute(true)} className="btn-secondary">
          Add Funds
        </button>
      )}
    </div>
  );
};

export default GoalCard;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/goals/GoalCard.tsx
git commit -m "feat: add GoalCard component with inline Add Funds"
```

---

### Task 6: Goals page

**Files:**
- Modify: `frontend/src/pages/Goals.tsx`

- [ ] **Step 1: Replace the placeholder with the full page**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import StatCard from '../components/common/StatCard';
import GoalForm from '../components/goals/GoalForm';
import GoalCard from '../components/goals/GoalCard';
import goalService from '../services/goal.service';
import { CreateGoalRequest, Goal, GoalSummary, UpdateGoalRequest } from '../types/api.types';
import { formatCurrency, formatPercentage } from '../utils/formatters';

const Goals = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [summary, setSummary] = useState<GoalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(0);

  const loadAll = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      const [goalsData, summaryData] = await Promise.all([
        goalService.getGoals(),
        goalService.getGoalSummary(),
      ]);
      if (requestIdRef.current !== requestId) return;
      setGoals(goalsData);
      setSummary(summaryData);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setError('Failed to load goals. Please try again.');
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const handleCreate = () => {
    setEditingGoal(null);
    setFormMode('create');
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormMode('edit');
  };

  const handleDelete = async (goal: Goal) => {
    if (!window.confirm(`Delete "${goal.title}"? This can't be undone.`)) {
      return;
    }
    await goalService.deleteGoal(goal.id);
    await loadAll();
  };

  const handleContribute = async (goal: Goal, amount: number) => {
    await goalService.contributeToGoal(goal.id, amount);
    await loadAll();
  };

  const handleSubmit = async (data: CreateGoalRequest | UpdateGoalRequest) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && editingGoal) {
        await goalService.updateGoal(editingGoal.id, data as UpdateGoalRequest);
      } else {
        await goalService.createGoal(data as CreateGoalRequest);
      }
      await loadAll();
      setFormMode(null);
      setEditingGoal(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading goals...</p>;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Goals</h1>
        {!formMode && (
          <button onClick={handleCreate} className="btn-primary">
            Add Goal
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard title="Total Goals" value={String(summary?.totalGoals ?? 0)} />
        <StatCard title="Total Saved" value={formatCurrency(summary?.totalCurrentAmount ?? 0)} />
        <StatCard title="Overall Progress" value={formatPercentage(summary?.overallProgress ?? 0, false)} />
      </div>

      {formMode && (
        <GoalForm
          key={formMode === 'edit' ? editingGoal?.id : 'create'}
          initialValues={formMode === 'edit' ? editingGoal ?? undefined : undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormMode(null);
            setEditingGoal(null);
          }}
          submitting={submitting}
        />
      )}

      <div className="space-y-4">
        {goals.length === 0 && <p className="text-gray-500">No goals yet. Add one to get started.</p>}
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} onEdit={handleEdit} onDelete={handleDelete} onContribute={handleContribute} />
        ))}
      </div>
    </div>
  );
};

export default Goals;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Goals.tsx
git commit -m "feat: build the Goals page with full CRUD and contributions"
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

- [ ] **Step 2: Fresh user, empty state**

Log in as a brand-new user, open `/goals`. Expected: "Total Goals: 0", "Total Saved: $0.00", "Overall Progress: 0%", "No goals yet. Add one to get started."

- [ ] **Step 3: Create a goal with a starting amount**

Create a goal with a future target date and a nonzero Current Amount (e.g. targetAmount 1000, currentAmount 200). Expected: appears with a ~20% progress bar, stat cards update.

- [ ] **Step 4: Reject a past target date on create**

Attempt to create a goal with a past target date via curl (bypassing the UI's `min` constraint, which wouldn't let you pick one):

```bash
TOKEN="<paste from browser localStorage financeflow_auth_token>"
curl -s -X POST http://localhost:3001/api/goals -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Past goal","targetAmount":100,"targetDate":"2020-01-01","category":"OTHER"}'
```

Expected: `{"error":"Target date must be in the future"}` (adjust the port if your backend runs on a different one locally).

- [ ] **Step 5: Reject a negative `currentAmount` on create**

```bash
curl -s -X POST http://localhost:3001/api/goals -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Negative start","targetAmount":100,"currentAmount":-50,"targetDate":"2027-01-01","category":"OTHER"}'
```

Expected: `{"error":"Current amount must be a non-negative number"}` — confirms Task 1's new validation.

- [ ] **Step 6: Edit a goal**

Edit the goal from Step 3's title/targetAmount/targetDate. Expected: no Category field shown in the edit form, card updates correctly.

- [ ] **Step 7: Edit a goal's target date into the past**

Confirm this succeeds (the backend's update path doesn't enforce future-dates, only create does) — this is expected/correct behavior per the spec, not a bug.

- [ ] **Step 8: Contribute to a goal**

Use "Add Funds" to contribute an amount. Expected: `currentAmount` increases additively, progress bar and stat cards update. Try submitting with the field empty or zero — expected: blocked client-side (`min="0.01"`, `required`).

- [ ] **Step 9: Confirm the contribution race fix**

Fire two concurrent contributions to the same goal and confirm both are reflected (not just one):

```bash
GOAL_ID="<a goal id from GET /api/goals>"
curl -s -X POST http://localhost:3001/api/goals/$GOAL_ID/contribute -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"amount":10}' &
curl -s -X POST http://localhost:3001/api/goals/$GOAL_ID/contribute -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"amount":15}' &
wait
curl -s http://localhost:3001/api/goals/$GOAL_ID -H "Authorization: Bearer $TOKEN"
```

Expected: the goal's `currentAmount` reflects both contributions (+25 total from this step), not just one of them.

- [ ] **Step 10: Complete a goal**

Contribute enough to reach or exceed the target amount. Expected: the card shows "Goal completed!" and the progress bar is full/green.

- [ ] **Step 11: Delete a goal**

Delete a goal, confirming the browser dialog. Expected: disappears from the list, stat cards update. Confirm via curl it's soft-deactivated, not hard-deleted:

```bash
curl -s "http://localhost:3001/api/goals?active=false" -H "Authorization: Bearer $TOKEN"
```

Expected: the deleted goal is present with `"isActive": false`.

- [ ] **Step 12: Loading and error states**

Stop the backend, reload `/goals`. Expected: an error message with a working Retry button. Restart the backend, click Retry, confirm recovery.

- [ ] **Step 13: Final checks**

Run: `npm run build:frontend` and `npm run test:backend`
Expected: both complete cleanly (build with no TS errors, 38/38 backend tests passing)

- [ ] **Step 14: Stop the dev servers**

Ctrl-C both `npm run dev:frontend` and `npm run dev:backend` processes once all checks above pass.

---

## Self-Review Notes

- **Spec coverage:** all four "Backend fixes required" items (Task 1), the three type fixes (Task 2), the service (Task 3), form with create/edit field differences and no-future-date-constraint-in-edit-mode (Task 4), card with the fully-specified stateful Add Funds control (Task 5), full page with loading/error/retry and the request-id race guard carried forward from 4b (Task 6), manual verification matching the spec's expanded checklist exactly, including both new backend-fix checks (Task 7). Out-of-scope items (reactivation UI, `byCategory`/`urgentGoals` rendering, Dashboard) correctly have no corresponding tasks.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `Goal`, `CreateGoalRequest`, `UpdateGoalRequest`, `GoalSummary`, `GoalCategory` (Task 2) are used identically across `goal.service.ts` (Task 3), `GoalForm.tsx` (Task 4), `GoalCard.tsx` (Task 5), and `Goals.tsx` (Task 6). `onContribute`'s signature (`(goal: Goal, amount: number) => Promise<void>`) matches exactly between `GoalCard`'s prop type (Task 5) and `Goals.tsx`'s `handleContribute` (Task 6). `CATEGORY_LABELS` is duplicated between `GoalForm.tsx` and `GoalCard.tsx` — same deliberate choice as `TransactionForm.tsx`/`TransactionRow.tsx`'s duplicated `CATEGORY_LABELS` in 4b, for the same reason (small, self-contained, used in exactly two places, not worth a shared module).
