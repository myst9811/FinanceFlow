# Frontend Auth & Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built `AuthContext` into the app, add client-side routing with protected routes, build Login/Register pages, and replace the Header's hardcoded user/notifications with real data from the auth and insights APIs.

**Architecture:** `react-router-dom` in library mode (`<BrowserRouter>` + JSX `<Routes>`). Two thin route-guard components (`ProtectedRoute` combines the auth check with rendering `Layout`; `PublicOnlyRoute` keeps logged-in users off `/login`/`/register`). New `insight.service.ts` mirrors the existing `auth.service.ts` pattern. No new form library, no new test framework — matches the codebase's existing plain-React style and current lack of frontend tests.

**Tech Stack:** React 19, react-router-dom ^7.18, Tailwind (existing `.card`/`.btn-primary`/`.btn-secondary` utility classes and `primary` color scale from `tailwind.config.js`), axios (existing `apiClient`).

**Spec:** `docs/superpowers/specs/2026-07-23-frontend-auth-routing-design.md`

**Note on testing:** per the spec, the frontend has no test infrastructure today (only the backend uses vitest), and adding one for this sub-project alone would be disproportionate. Every task ends with a `tsc`/build check instead of a test run; full manual verification is Task 10.

---

## File Structure

- Modify: `frontend/package.json` — add `react-router-dom`
- Modify: `frontend/src/types/api.types.ts` — add `InsightType`, `Priority`, `Insight`
- Create: `frontend/src/components/auth/ProtectedRoute.tsx`
- Create: `frontend/src/components/auth/PublicOnlyRoute.tsx`
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/pages/Register.tsx`
- Create: `frontend/src/pages/Accounts.tsx`
- Create: `frontend/src/pages/Transactions.tsx`
- Create: `frontend/src/pages/Goals.tsx`
- Modify: `frontend/src/main.tsx` — mount `AuthProvider` + `BrowserRouter`
- Modify: `frontend/src/App.tsx` — route table
- Modify: `frontend/src/components/common/Sidebar.tsx` — trimmed nav, `NavLink`
- Create: `frontend/src/services/insight.service.ts`
- Modify: `frontend/src/components/common/Header.tsx` — real user, logout, real notifications

---

### Task 1: Add react-router-dom + Insight types

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/types/api.types.ts`

- [ ] **Step 1: Install react-router-dom**

```bash
cd frontend && npm install react-router-dom@^7.18
```

- [ ] **Step 2: Add Insight types**

In `frontend/src/types/api.types.ts`, add at the end of the file:

```typescript
// Insight Types
export enum InsightType {
  SPENDING_ALERT = 'SPENDING_ALERT',
  SAVINGS_OPPORTUNITY = 'SAVINGS_OPPORTUNITY',
  BUDGET_RECOMMENDATION = 'BUDGET_RECOMMENDATION',
  GOAL_PROGRESS = 'GOAL_PROGRESS',
  UNUSUAL_ACTIVITY = 'UNUSUAL_ACTIVITY',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export interface Insight {
  id: string;
  userId: string;
  type: InsightType;
  title: string;
  description: string;
  priority: Priority;
  isRead: boolean;
  createdAt: string;
}
```

- [ ] **Step 3: Verify the frontend still builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/types/api.types.ts
git commit -m "feat: add react-router-dom and Insight types"
```

---

### Task 2: Auth route guards

**Files:**
- Create: `frontend/src/components/auth/ProtectedRoute.tsx`
- Create: `frontend/src/components/auth/PublicOnlyRoute.tsx`

- [ ] **Step 1: Create ProtectedRoute**

```typescript
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Layout from '../common/Layout';

const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

export default ProtectedRoute;
```

- [ ] **Step 2: Create PublicOnlyRoute**

```typescript
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const PublicOnlyRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default PublicOnlyRoute;
```

- [ ] **Step 3: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors (these components aren't wired into any routes yet, but must still type-check standalone)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/auth/ProtectedRoute.tsx frontend/src/components/auth/PublicOnlyRoute.tsx
git commit -m "feat: add ProtectedRoute and PublicOnlyRoute guards"
```

---

### Task 3: Login page

**Files:**
- Create: `frontend/src/pages/Login.tsx`

- [ ] **Step 1: Create the Login page**

```typescript
import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login({ email, password });
      navigate('/');
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Login failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="card w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Sign in to FinanceFlow</h1>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-primary-600 hover:text-primary-700">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Login.tsx
git commit -m "feat: add Login page"
```

---

### Task 4: Register page

**Files:**
- Create: `frontend/src/pages/Register.tsx`

- [ ] **Step 1: Create the Register page**

```typescript
import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await register({ email, password, firstName, lastName });
      navigate('/');
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Registration failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="card w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Create your FinanceFlow account</h1>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              At least 8 characters, with an uppercase letter, a lowercase letter, and a number.
            </p>
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Register.tsx
git commit -m "feat: add Register page"
```

---

### Task 5: Placeholder pages

**Files:**
- Create: `frontend/src/pages/Accounts.tsx`
- Create: `frontend/src/pages/Transactions.tsx`
- Create: `frontend/src/pages/Goals.tsx`

- [ ] **Step 1: Create the three placeholder pages**

```typescript
// frontend/src/pages/Accounts.tsx
const Accounts = () => (
  <div className="card">
    <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
    <p className="mt-2 text-gray-600">Coming soon.</p>
  </div>
);

export default Accounts;
```

```typescript
// frontend/src/pages/Transactions.tsx
const Transactions = () => (
  <div className="card">
    <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
    <p className="mt-2 text-gray-600">Coming soon.</p>
  </div>
);

export default Transactions;
```

```typescript
// frontend/src/pages/Goals.tsx
const Goals = () => (
  <div className="card">
    <h1 className="text-2xl font-bold text-gray-900">Goals</h1>
    <p className="mt-2 text-gray-600">Coming soon.</p>
  </div>
);

export default Goals;
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Accounts.tsx frontend/src/pages/Transactions.tsx frontend/src/pages/Goals.tsx
git commit -m "feat: add placeholder Accounts/Transactions/Goals pages"
```

---

### Task 6: Wire routing into main.tsx and App.tsx

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Mount AuthProvider and BrowserRouter in main.tsx**

Replace the full contents of `frontend/src/main.tsx`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 2: Replace App.tsx with the route table**

Replace the full contents of `frontend/src/App.tsx`:

```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PublicOnlyRoute from './components/auth/PublicOnlyRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Goals from './pages/Goals';

function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/goals" element={<Goals />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
```

- [ ] **Step 3: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.tsx frontend/src/App.tsx
git commit -m "feat: wire AuthProvider and route table into the app"
```

---

### Task 7: Sidebar — trimmed nav + client-side navigation

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Replace the navigation array and swap `<a>` for `<NavLink>`**

In `frontend/src/components/common/Sidebar.tsx`, replace:

```typescript
import React, { useState } from 'react';
import {
  HomeIcon,
  CreditCardIcon,
  ChartBarIcon,
  FlagIcon,
  CogIcon,
  Bars3Icon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import type { NavigationItem } from '../../types';

const navigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Transactions', href: '/transactions', icon: CreditCardIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Goals', href: '/goals', icon: FlagIcon },
  { name: 'Settings', href: '/settings', icon: CogIcon },
];
```

with:

```typescript
import React, { useState } from 'react';
import {
  HomeIcon,
  BanknotesIcon,
  CreditCardIcon,
  FlagIcon,
  Bars3Icon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { NavLink } from 'react-router-dom';
import type { NavigationItem } from '../../types';

const navigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Accounts', href: '/accounts', icon: BanknotesIcon },
  { name: 'Transactions', href: '/transactions', icon: CreditCardIcon },
  { name: 'Goals', href: '/goals', icon: FlagIcon },
];
```

Then replace the nav rendering block:

```typescript
        <nav className="mt-6">
          {navigation.map((item) => (
            <a
              key={item.name}
              href={item.href}
              className="flex items-center px-6 py-3 text-gray-700 hover:bg-gray-50 hover:text-primary-600 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.name}
            </a>
          ))}
        </nav>
```

with:

```typescript
        <nav className="mt-6">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                `flex items-center px-6 py-3 transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-primary-600'
                }`
              }
              onClick={() => setIsOpen(false)}
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.name}
            </NavLink>
          ))}
        </nav>
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: trim sidebar nav to real pages and use client-side navigation"
```

---

### Task 8: Frontend insight service

**Files:**
- Create: `frontend/src/services/insight.service.ts`

- [ ] **Step 1: Create the service**

```typescript
import apiClient from '../lib/apiClient';
import { Insight } from '../types/api.types';

class InsightService {
  async getInsights(): Promise<Insight[]> {
    const response = await apiClient.get<{ insights: Insight[] }>('/insights');
    return response.data.insights;
  }

  async markInsightRead(id: string): Promise<Insight> {
    const response = await apiClient.patch<{ insight: Insight }>(`/insights/${id}/read`);
    return response.data.insight;
  }
}

export default new InsightService();
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/insight.service.ts
git commit -m "feat: add frontend insight service"
```

---

### Task 9: Header — real user, logout, real notifications

**Files:**
- Modify: `frontend/src/components/common/Header.tsx`

- [ ] **Step 1: Replace the full contents of Header.tsx**

```typescript
import {
  MagnifyingGlassIcon,
  BellIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import insightService from '../../services/insight.service';
import { Insight } from '../../types/api.types';

const Header = () => {
  const { user, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    insightService.getInsights().then(setInsights).catch(() => setInsights([]));
  }, []);

  const unreadCount = insights.filter((i) => !i.isRead).length;

  const handleNotificationClick = async (insight: Insight) => {
    if (insight.isRead) return;

    setInsights((prev) =>
      prev.map((i) => (i.id === insight.id ? { ...i, isRead: true } : i))
    );

    try {
      await insightService.markInsightRead(insight.id);
    } catch {
      setInsights((prev) =>
        prev.map((i) => (i.id === insight.id ? { ...i, isRead: false } : i))
      );
    }
  };

  const formatRelativeTime = (createdAt: string) => {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.round(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.round(diffHours / 24)}d ago`;
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo & Brand */}
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <div className="h-10 w-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">F</span>
              </div>
              <span className="ml-3 text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                FinanceFlow
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-md mx-8 hidden md:block">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search transactions, categories..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition"
              />
            </div>
          </div>

          {/* Right Side Icons */}
          <div className="flex items-center space-x-4">

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Notifications"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition relative"
              >
                <BellIcon className="h-6 w-6" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {insights.length === 0 && (
                      <p className="px-4 py-3 text-sm text-gray-500">No notifications yet.</p>
                    )}
                    {insights.map((insight) => (
                      <button
                        key={insight.id}
                        type="button"
                        onClick={() => handleNotificationClick(insight)}
                        className={`block w-full px-4 py-3 text-left hover:bg-gray-50 cursor-pointer transition ${
                          !insight.isRead ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <p className="text-sm text-gray-900">{insight.title}</p>
                        <p className="text-xs text-gray-500 mt-1">{formatRelativeTime(insight.createdAt)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <div className="h-10 w-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-medium text-sm">
                    {user?.firstName?.[0]}
                    {user?.lastName?.[0]}
                  </span>
                </div>
                <ChevronDownIcon className="h-4 w-4 text-gray-500 hidden md:block" />
              </button>

              {/* Profile Dropdown */}
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-3 transition">
                      <UserCircleIcon className="h-5 w-5 text-gray-400" />
                      <span>Your Profile</span>
                    </button>
                    <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-3 transition">
                      <Cog6ToothIcon className="h-5 w-5 text-gray-400" />
                      <span>Settings</span>
                    </button>
                  </div>
                  <div className="border-t border-gray-200 py-1">
                    <button
                      onClick={logout}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-3 transition"
                    >
                      <ArrowRightOnRectangleIcon className="h-5 w-5 text-red-500" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Search Bar */}
      <div className="px-4 pb-3 md:hidden">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
        </div>
      </div>
    </header>
  );
};

export default Header;
```

Note: `Your Profile` and `Settings` buttons in the dropdown remain inert (no `onClick`) — they were already non-functional before this change, and building those flows out is not in this sub-project's scope.

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/Header.tsx
git commit -m "feat: wire Header to real user and insights data"
```

---

### Task 10: End-to-end manual verification

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

- [ ] **Step 2: Verify the logged-out redirect**

Open the frontend URL in a browser (default `http://localhost:5173`). Expected: redirected to `/login` (no auth token in `localStorage` yet).

- [ ] **Step 3: Register a new user**

Fill out the Register form and submit. Expected: redirected to `/` (dashboard), sidebar and header now visible.

- [ ] **Step 4: Verify the Header shows real data**

Expected: the profile area shows the name/email just registered, not "John Doe".

- [ ] **Step 5: Verify sidebar navigation**

Click Dashboard, Accounts, Transactions, Goals in turn. Expected: no full-page reload (check the browser Network tab or just note there's no white flash/reload), the clicked link is visually highlighted as active, and Accounts/Transactions/Goals show their "Coming soon" placeholder.

- [ ] **Step 6: Verify the notifications bell**

Click the bell icon. Expected: dropdown opens showing "No notifications yet." for a fresh user (no transactions/goals exist yet to trigger any insight rule). Optionally, create a transaction via `curl` against `/api/transactions` that triggers a rule (e.g. two `EXPENSE` transactions in the same category, one last month, one this month, with a 20%+ increase — see `docs/superpowers/specs/2026-07-22-insights-feature-design.md` for the exact rule thresholds), reload, and confirm the real insight appears with an unread badge.

- [ ] **Step 7: Verify marking a notification read**

Click an unread notification (only possible if Step 6's optional part was done). Expected: it visually changes to read state and the unread badge count decrements; refreshing the page confirms it stays read (persisted via the `PATCH` call).

- [ ] **Step 8: Verify sign out**

Click the profile dropdown, click "Sign Out". Expected: redirected to `/login`. Manually navigate to `/` or `/accounts` directly. Expected: redirected back to `/login` (no longer authenticated).

- [ ] **Step 9: Verify the public-only guard**

Log back in, then manually navigate to `/login` or `/register` while authenticated. Expected: redirected to `/`.

- [ ] **Step 10: Final build check**

Run: `npm run build:frontend`
Expected: completes with no TypeScript errors

- [ ] **Step 11: Stop the dev servers**

Ctrl-C both `npm run dev:frontend` and `npm run dev:backend` processes once all checks above pass.

---

## Self-Review Notes

- **Spec coverage:** routing table + guards (Tasks 2, 6), Login/Register (Tasks 3, 4), placeholder pages (Task 5), Sidebar trim + NavLink (Task 7), Header real user/logout/notifications (Tasks 8, 9), manual verification matching the spec's checklist exactly (Task 10). Out-of-scope items (real Accounts/Transactions/Goals content, mockData.ts removal, a frontend test framework, apiClient's 401 redirect mechanism, Analytics/Settings) correctly have no corresponding tasks.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code. The one intentionally-inert bit (Header's "Your Profile"/"Settings" buttons) is explicitly called out as pre-existing and out of scope, not a placeholder left by this plan.
- **Type consistency:** `Insight`/`InsightType`/`Priority` (Task 1) match exactly what `insight.service.ts` (Task 8) and `Header.tsx` (Task 9) import and use. `useAuth()`'s `user`/`login`/`register`/`logout`/`isAuthenticated`/`loading` fields (all pre-existing in `AuthContext.tsx`) are used with matching names throughout Tasks 2-4 and 9 — no new fields invented on that context.
