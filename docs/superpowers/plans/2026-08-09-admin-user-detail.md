# Admin User Detail View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user detail page (`/admin/users/:id`) to the admin panel, showing richer account/goal metadata and auth method — never balances, transaction amounts, or goal target/current amounts.

**Architecture:** One new backend endpoint (`GET /api/admin/users/:id`) using the same `googleSubject`→`googleLinked` collapse pattern already established for `password`→`hasPassword`. One new frontend page reachable from a link on the existing Users list.

**Tech Stack:** Express 5, Prisma, React 19, `react-router-dom` v7. No new dependencies.

**Reference:** `docs/superpowers/specs/2026-08-09-admin-user-detail-design.md` (approved design).

---

### Task 1: Backend — `GET /api/admin/users/:id`

**Files:**
- Modify: `backend/src/controllers/admin/users.controller.ts`
- Modify: `backend/src/routes/admin.routes.ts`
- Modify: `backend/src/controllers/admin/__tests__/users.controller.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/controllers/admin/__tests__/users.controller.test.ts` — first update the import line:

```typescript
import { getUsers, updateUserStatus, getUserDetail } from '../users.controller';
```

Then add a new `describe` block at the end of the file (after the closing `});` of `describe('updateUserStatus', ...)`):

```typescript
describe('getUserDetail', () => {
  it('returns accounts, goals, counts, and auth method flags for a known user', async () => {
    const user = await createTestUser();
    await prisma.account.create({
      data: { userId: user.id, name: 'Checking', type: 'CHECKING', balance: 500, bankName: 'Test Bank' },
    });
    await prisma.goal.create({
      data: {
        userId: user.id,
        title: 'Emergency Fund',
        targetAmount: 1000,
        targetDate: new Date('2027-01-01'),
        category: 'EMERGENCY_FUND',
      },
    });

    const req = { params: { id: user.id } } as unknown as AdminRequest;
    const res = createMockRes();

    await getUserDetail(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as any).mock.calls[0][0];

    expect(body.user.id).toBe(user.id);
    expect(body.user.hasPassword).toBe(true);
    expect(body.user.googleLinked).toBe(false);
    expect(body.user._count).toEqual({ accounts: 1, transactions: 0, goals: 1 });
    expect(body.user.accounts).toHaveLength(1);
    expect(body.user.accounts[0].name).toBe('Checking');
    expect(body.user.accounts[0].bankName).toBe('Test Bank');
    expect(body.user.goals).toHaveLength(1);
    expect(body.user.goals[0].title).toBe('Emergency Fund');
  });

  it('returns 404 for an unknown user id', async () => {
    const req = { params: { id: 'not-a-real-id' } } as unknown as AdminRequest;
    const res = createMockRes();

    await expect(getUserDetail(req, res)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('never includes balances, amounts, or raw password/googleSubject in the response', async () => {
    const user = await createTestUser();
    await prisma.account.create({
      data: { userId: user.id, name: 'Savings', type: 'SAVINGS', balance: 12345 },
    });
    await prisma.goal.create({
      data: {
        userId: user.id,
        title: 'Vacation',
        targetAmount: 5000,
        currentAmount: 1200,
        targetDate: new Date('2027-06-01'),
        category: 'VACATION',
      },
    });

    const req = { params: { id: user.id } } as unknown as AdminRequest;
    const res = createMockRes();

    await getUserDetail(req, res);

    const raw = JSON.stringify((res.json as any).mock.calls[0][0]);
    expect(raw).not.toMatch(/"balance"/);
    expect(raw).not.toMatch(/"amount"/i);
    expect(raw).not.toMatch(/"targetAmount"/);
    expect(raw).not.toMatch(/"currentAmount"/);
    expect(raw).not.toMatch(/"password"/);
    expect(raw).not.toMatch(/"googleSubject"/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run src/controllers/admin/__tests__/users.controller.test.ts -t "getUserDetail"`
Expected: FAIL — `getUserDetail is not a function` (not exported yet).

- [ ] **Step 3: Implement the controller**

Add to `backend/src/controllers/admin/users.controller.ts`, after the existing `updateUserStatus` function:

```typescript
export const getUserDetail = async (req: AdminRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      updatedAt: true,
      isActive: true,
      googleSubject: true,
      password: true,
      accounts: {
        select: { id: true, name: true, type: true, bankName: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      goals: {
        select: { id: true, title: true, category: true, targetDate: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { accounts: true, transactions: true, goals: true } },
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const { googleSubject, password, ...rest } = user;
  res.status(200).json({
    user: { ...rest, googleLinked: Boolean(googleSubject), hasPassword: Boolean(password) },
  });
};
```

- [ ] **Step 4: Wire the route**

In `backend/src/routes/admin.routes.ts`, change the import:

```typescript
import { getUsers, updateUserStatus, getUserDetail } from '../controllers/admin/users.controller';
```

Add the route, after the existing `router.get('/users', requireAdmin, getUsers);` line:

```typescript
router.get('/users/:id', requireAdmin, getUserDetail);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/controllers/admin/__tests__/users.controller.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones).

- [ ] **Step 6: Run the full backend suite and build**

Run: `cd backend && npm run build && npm test`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/admin/users.controller.ts backend/src/routes/admin.routes.ts backend/src/controllers/admin/__tests__/users.controller.test.ts
git commit -m "Add GET /api/admin/users/:id with account/goal metadata, no financial data"
```

---

### Task 2: Frontend — types and service method

**Files:**
- Modify: `frontend/src/types/admin.types.ts`
- Modify: `frontend/src/services/admin.service.ts`

- [ ] **Step 1: Add the `AdminUserDetail` type**

In `frontend/src/types/admin.types.ts`, add the import at the top of the file:

```typescript
import { AccountType, GoalCategory } from './api.types';
```

Add the new interface, after `AdminUsersResponse`:

```typescript
export interface AdminUserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  googleLinked: boolean;
  hasPassword: boolean;
  accounts: Array<{
    id: string;
    name: string;
    type: AccountType;
    bankName: string | null;
    isActive: boolean;
    createdAt: string;
  }>;
  goals: Array<{
    id: string;
    title: string;
    category: GoalCategory;
    targetDate: string;
    isActive: boolean;
    createdAt: string;
  }>;
  _count: {
    accounts: number;
    transactions: number;
    goals: number;
  };
}
```

- [ ] **Step 2: Add the service method**

In `frontend/src/services/admin.service.ts`, update the import:

```typescript
import { AdminStats, AdminUser, AdminUsersResponse, AdminUserDetail } from '../types/admin.types';
```

Add inside the `AdminService` class, after `getUsers`:

```typescript
  async getUserDetail(id: string): Promise<AdminUserDetail> {
    const response = await adminApiClient.get<{ user: AdminUserDetail }>(`/admin/users/${id}`);
    return response.data.user;
  }
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/admin.types.ts frontend/src/services/admin.service.ts
git commit -m "Add AdminUserDetail type and adminService.getUserDetail"
```

---

### Task 3: Frontend — `AdminUserDetail` page

**Files:**
- Create: `frontend/src/pages/admin/AdminUserDetail.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import adminService from '../../services/admin.service';
import { AdminUserDetail as AdminUserDetailType } from '../../types/admin.types';

const badgeClasses = 'rounded-full px-2 py-0.5 text-xs font-medium';

const AdminUserDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminUserDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await adminService.getUserDetail(id);
      setUser(detail);
    } catch {
      setError('Failed to load this user.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleToggleActive = async () => {
    if (!user) return;
    const targetIsActive = !user.isActive;
    setPending(true);
    try {
      await adminService.updateUserStatus(user.id, targetIsActive);
      setUser({ ...user, isActive: targetIsActive });
    } catch {
      setError('Failed to update status.');
    } finally {
      setPending(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  if (error || !user) {
    return (
      <div className="space-y-3">
        <p className="text-red-400">{error ?? 'User not found.'}</p>
        <Link to="/admin/users" className="text-sm text-primary-500 hover:text-primary-600">
          Back to Users
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate('/admin/users')}
          className="mb-3 text-sm text-gray-500 hover:text-gray-300"
        >
          ← Back to Users
        </button>
        <h1 className="text-2xl font-bold text-white">
          {user.firstName} {user.lastName}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{user.email}</p>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`${badgeClasses} ${
              user.isActive ? 'bg-green-950 text-green-400' : 'bg-gray-800 text-gray-500'
            }`}
          >
            {user.isActive ? 'Active' : 'Deactivated'}
          </span>
          {user.hasPassword && (
            <span className={`${badgeClasses} bg-blue-950 text-blue-400`}>Password</span>
          )}
          {user.googleLinked && (
            <span className={`${badgeClasses} bg-yellow-950 text-yellow-400`}>Google</span>
          )}
          <button
            onClick={handleToggleActive}
            disabled={pending}
            className="ml-auto text-sm font-medium text-primary-500 hover:text-primary-600 disabled:opacity-50"
          >
            {user.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Joined</dt>
            <dd className="text-gray-300">{new Date(user.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Last updated</dt>
            <dd className="text-gray-300">{new Date(user.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-sm text-gray-500">Accounts</p>
          <p className="mt-1 text-2xl font-bold text-white">{user._count.accounts}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-sm text-gray-500">Transactions</p>
          <p className="mt-1 text-2xl font-bold text-white">{user._count.transactions}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-sm text-gray-500">Goals</p>
          <p className="mt-1 text-2xl font-bold text-white">{user._count.goals}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-400">Accounts</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Bank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {user.accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    No accounts.
                  </td>
                </tr>
              ) : (
                user.accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-white">{account.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">{account.type}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">{account.bankName ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                      {account.isActive ? 'Active' : 'Inactive'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                      {new Date(account.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-400">Goals</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Target date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {user.goals.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                    No goals.
                  </td>
                </tr>
              ) : (
                user.goals.map((goal) => (
                  <tr key={goal.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-white">{goal.title}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">{goal.category}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                      {new Date(goal.targetDate).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                      {goal.isActive ? 'Active' : 'Inactive'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminUserDetail;
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/AdminUserDetail.tsx
git commit -m "Add AdminUserDetail page"
```

---

### Task 4: Frontend — wire the route and link from the list

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/admin/AdminUsers.tsx`

- [ ] **Step 1: Add the route**

In `frontend/src/App.tsx`, add the import:

```typescript
import AdminUserDetail from './pages/admin/AdminUserDetail';
```

Add the route inside the existing `<Route element={<AdminRoute />}>` group, after `users`:

```tsx
          <Route path="users/:id" element={<AdminUserDetail />} />
```

- [ ] **Step 2: Link the list rows to the detail page**

In `frontend/src/pages/admin/AdminUsers.tsx`, add the import:

```typescript
import { Link } from 'react-router-dom';
```

Replace the name cell:

```tsx
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-white">
                    {user.firstName} {user.lastName}
                  </td>
```

with:

```tsx
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-white">
                    <Link to={`/admin/users/${user.id}`} className="hover:text-primary-500">
                      {user.firstName} {user.lastName}
                    </Link>
                  </td>
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/admin/AdminUsers.tsx
git commit -m "Link Users list rows to the new per-user detail page"
```

---

### Task 5: Final verification pass

**Files:** none (verification only; fix forward in the relevant file if something is found)

- [ ] **Step 1: Full backend verification**

Run: `cd backend && npm run build && npm test`
Expected: build clean, all tests pass (existing suite + the 3 new `getUserDetail` tests).

- [ ] **Step 2: Full frontend verification**

Run: `cd frontend && npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 3: Live smoke test against a real running backend**

With `npm run dev:backend` running, hit the new endpoint directly for a real admin session (or, without a session, confirm it's rejected):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/admin/users/any-id
```

Expected: `401` (no admin session cookie) — confirms `requireAdmin` is actually applied to the new route, not just present in the source.

- [ ] **Step 4: Manual check**

With `npm run dev:frontend` running and an active admin session, visit `/admin/users`, click a user's name, confirm the detail page loads with accounts/goals tables (no dollar figures anywhere), confirm Deactivate/Reactivate works from the detail page and is reflected when navigating back to the list, and confirm visiting `/admin/users/not-a-real-id` shows the "User not found" state with a working link back to the list.

- [ ] **Step 5: Fix forward if anything failed**

If any step above surfaced an issue, fix it in the relevant file from the task it belongs to, re-run that task's verification, then commit:

```bash
git add -A
git commit -m "Fix up admin user detail view after verification pass"
```

If nothing needed fixing, no commit for this task — it was verification-only.
