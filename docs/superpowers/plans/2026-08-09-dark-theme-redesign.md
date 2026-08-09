# Dark Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the main ChronosFin app (Sidebar, Header, Dashboard, Accounts, Transactions, Goals, Settings, Login, Register) to a dark-by-default theme with a light toggle and a slick, medium-spaced futuristic grid background, per `docs/superpowers/specs/2026-08-09-dark-theme-redesign-design.md`.

**Architecture:** Semantic color tokens (`surface`, `surface-2`, `ink`, `ink-muted`, `line`, `accent`) are defined as CSS custom properties in `index.css`, dark by default with a `.light` class override, and mapped into Tailwind via `tailwind.config.js`. Every touched component swaps hardcoded gray/white/primary Tailwind classes for these tokens — no `dark:` variant duplication. A `ThemeContext` (mirroring the existing `AuthContext` split) toggles the `.light` class and persists the choice to `localStorage`. A decorative `.app-grid-bg` div (fixed, behind content) renders the grid + glow.

**Tech Stack:** React 19, Tailwind CSS, TypeScript, Vite. No frontend test suite exists — verification is `npm run build:frontend` (tsc + vite build) and `npm run lint:frontend` (eslint), plus a manual visual pass by the user at the end.

**Out of scope:** Landing page (`pages/Landing.tsx`/`Landing.css` — already has its own theme system) and the admin panel (`components/admin/*`, `pages/admin/*` — already dark-themed independently). Do not touch these files.

---

## Task 1: Branch + color system foundation

**Files:**
- Create branch: `feature/dark-theme-redesign`
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Create the feature branch**

```bash
cd /Users/shannensaikia/Projects/ChronosFin
git checkout main
git pull
git checkout -b feature/dark-theme-redesign
```

- [ ] **Step 2: Replace `frontend/tailwind.config.js` with this exact content**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
      }
    },
  },
  plugins: [],
  safelist: [
    'text-success',
    'text-danger',
    'text-warning',
    'bg-success',
    'bg-danger',
    'bg-warning',
  ]
}
```

`primary-*` stays defined (unused after this plan, but removing it is out of scope — no other code depends on it once Task 4 onward lands, and leaving it is harmless). The six new tokens use the `rgb(var(--x) / <alpha-value>)` pattern so opacity modifiers like `bg-accent/10` work.

- [ ] **Step 3: Replace `frontend/src/index.css` with this exact content**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --surface: 13 17 23;
    --surface-2: 22 27 34;
    --ink: 230 237 243;
    --ink-muted: 139 148 158;
    --line: 48 54 61;
    --accent: 45 189 139;
    --accent-glow: 45 189 139;
  }

  .light {
    --surface: 255 255 255;
    --surface-2: 249 250 251;
    --ink: 17 24 39;
    --ink-muted: 107 114 128;
    --line: 229 231 235;
    --accent: 37 99 235;
    --accent-glow: 37 99 235;
  }

  body {
    @apply bg-surface text-ink;
  }
}

@layer components {
  .card {
    @apply bg-surface-2 rounded-lg shadow-sm border border-line p-6;
  }

  .btn-primary {
    @apply bg-accent hover:opacity-90 text-white px-4 py-2 rounded-lg font-medium transition-colors;
  }

  .btn-secondary {
    @apply bg-surface-2 hover:bg-line text-ink border border-line px-4 py-2 rounded-lg font-medium transition-colors;
  }

  .app-grid-bg {
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background-color: rgb(var(--surface));
    background-image:
      linear-gradient(to right, rgb(var(--line) / 0.4) 1px, transparent 1px),
      linear-gradient(to bottom, rgb(var(--line) / 0.4) 1px, transparent 1px),
      radial-gradient(ellipse 80% 50% at 50% -10%, rgb(var(--accent-glow) / 0.15), transparent);
    background-size: 40px 40px, 40px 40px, 100% 100%;
  }

  .light .app-grid-bg {
    background-image:
      linear-gradient(to right, rgb(var(--line) / 0.6) 1px, transparent 1px),
      linear-gradient(to bottom, rgb(var(--line) / 0.6) 1px, transparent 1px),
      radial-gradient(ellipse 80% 50% at 50% -10%, rgb(var(--accent-glow) / 0.08), transparent);
  }
}
```

Dark is the default (`:root`, no class needed). `.btn-secondary` gets an explicit `border border-line` (a small addition beyond the spec's draft CSS) so it stays visible against `.card`'s identical `bg-surface-2` background.

- [ ] **Step 4: Verify the frontend still builds**

Run: `cd /Users/shannensaikia/Projects/ChronosFin && npm run build:frontend`
Expected: build succeeds (existing components still reference the old `bg-white`/`text-gray-900` etc. classes, which still exist in Tailwind's default palette, so nothing breaks yet — the new tokens are additive).

- [ ] **Step 5: Commit**

```bash
git add frontend/tailwind.config.js frontend/src/index.css
git commit -m "Add dark-first color token system and grid background"
```

---

## Task 2: Theme context, hook, and provider wiring

**Files:**
- Modify: `frontend/src/config/api.config.ts`
- Create: `frontend/src/contexts/theme-context.ts`
- Create: `frontend/src/contexts/ThemeContext.tsx`
- Create: `frontend/src/hooks/useTheme.ts`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Add the theme storage key to `frontend/src/config/api.config.ts`**

Replace the file with this exact content:

```ts
export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 10000,
};

export const AUTH_TOKEN_KEY = 'chronosfin_auth_token';
export const THEME_STORAGE_KEY = 'chronosfin_theme';
```

- [ ] **Step 2: Create `frontend/src/contexts/theme-context.ts`**

```ts
import { createContext } from 'react';

export type Theme = 'dark' | 'light';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
```

This mirrors `frontend/src/contexts/auth-context.ts`'s split-out-context-object pattern for Fast Refresh compatibility.

- [ ] **Step 3: Create `frontend/src/contexts/ThemeContext.tsx`**

```tsx
import React, { useEffect, useState, ReactNode } from 'react';
import { THEME_STORAGE_KEY } from '../config/api.config';
import { ThemeContext, Theme } from './theme-context';

const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
```

Dark is the default whenever `localStorage` has no stored preference (first visit, or `'dark'` was previously stored).

- [ ] **Step 4: Create `frontend/src/hooks/useTheme.ts`**

```ts
import { useContext } from 'react';
import { ThemeContext, ThemeContextType } from '../contexts/theme-context';

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
```

This mirrors `frontend/src/hooks/useAuth.ts` exactly.

- [ ] **Step 5: Wire `ThemeProvider` into `frontend/src/main.tsx`**

Replace the file with this exact content:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

`ThemeProvider` wraps `AuthProvider` so the theme (and its toggle, once added to `Header` in Task 4) is active on `/login` and `/register`, which render before authentication.

- [ ] **Step 6: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin && npm run build:frontend`
Expected: build succeeds. No component uses `useTheme` yet, so this is purely a type/wiring check.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/config/api.config.ts frontend/src/contexts/theme-context.ts frontend/src/contexts/ThemeContext.tsx frontend/src/hooks/useTheme.ts frontend/src/main.tsx
git commit -m "Add ThemeContext/useTheme and wire ThemeProvider into main.tsx"
```

---

## Task 3: App shell loading states

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/auth/ProtectedRoute.tsx`
- Modify: `frontend/src/components/auth/PublicOnlyRoute.tsx`

- [ ] **Step 1: In `frontend/src/App.tsx`, replace the `HomeRoute` loading block**

Find:
```tsx
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }
```

Replace with:
```tsx
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-ink-muted">Loading...</p>
      </div>
    );
  }
```

- [ ] **Step 2: In `frontend/src/components/auth/ProtectedRoute.tsx`, replace the loading block**

Find:
```tsx
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }
```

Replace with:
```tsx
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-ink-muted">Loading...</p>
      </div>
    );
  }
```

- [ ] **Step 3: In `frontend/src/components/auth/PublicOnlyRoute.tsx`, apply the same replacement**

Find:
```tsx
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }
```

Replace with:
```tsx
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-ink-muted">Loading...</p>
      </div>
    );
  }
```

- [ ] **Step 4: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -rn "text-gray-500" src/App.tsx src/components/auth/ProtectedRoute.tsx src/components/auth/PublicOnlyRoute.tsx`
Expected: no output (all three replaced).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/auth/ProtectedRoute.tsx frontend/src/components/auth/PublicOnlyRoute.tsx
git commit -m "Reskin app shell loading states for dark theme"
```

---

## Task 4: Sidebar reskin

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Replace the file with this exact content**

```tsx
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
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Accounts', href: '/accounts', icon: BanknotesIcon },
  { name: 'Transactions', href: '/transactions', icon: CreditCardIcon },
  { name: 'Goals', href: '/goals', icon: FlagIcon },
];

const Sidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-md bg-surface-2 shadow-md text-ink"
        >
          {isOpen ? (
            <XMarkIcon className="h-6 w-6" />
          ) : (
            <Bars3Icon className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`
        bg-surface-2 shadow-sm border-r border-line transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:inset-0
        fixed inset-y-0 left-0 z-40 w-64
      `}>
        <div className="p-6 flex items-center gap-2">
          <img src="/clock-growth-logo.svg" alt="" className="h-9 w-auto" />
          <span className="text-lg font-bold text-ink">ChronosFin</span>
        </div>
        <nav className="mt-6">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/dashboard'}
              className={({ isActive }) =>
                `flex items-center px-6 py-3 transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-ink-muted hover:bg-surface hover:text-accent'
                }`
              }
              onClick={() => setIsOpen(false)}
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default Sidebar;
```

- [ ] **Step 2: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "gray-\|bg-white\|primary-" src/components/common/Sidebar.tsx`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "Reskin Sidebar for dark theme"
```

---

## Task 5: Header reskin + theme toggle button

**Files:**
- Modify: `frontend/src/components/common/Header.tsx`

- [ ] **Step 1: Replace the file with this exact content**

```tsx
import {
  MagnifyingGlassIcon,
  BellIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  SunIcon,
  MoonIcon
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import insightService from '../../services/insight.service';
import { Insight } from '../../types/api.types';

const Header = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
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
    <header className="bg-surface-2 border-b border-line sticky top-0 z-40 shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo & Brand */}
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center gap-2 lg:hidden pl-14">
              <img src="/clock-growth-logo.svg" alt="" className="h-8 w-auto" />
              <span className="text-base font-bold text-ink">ChronosFin</span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-md mx-8 hidden md:block">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-ink-muted" />
              </div>
              <input
                type="text"
                placeholder="Search transactions, categories..."
                className="block w-full pl-10 pr-3 py-2 border border-line rounded-lg leading-5 bg-surface placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent sm:text-sm transition"
              />
            </div>
          </div>

          {/* Right Side Icons */}
          <div className="flex items-center space-x-4">

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 text-ink-muted hover:text-ink hover:bg-surface rounded-lg transition"
            >
              {theme === 'dark' ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Notifications"
                className="p-2 text-ink-muted hover:text-ink hover:bg-surface rounded-lg transition relative"
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
                <div className="absolute right-0 mt-2 w-80 bg-surface-2 rounded-lg shadow-xl border border-line py-2 z-50">
                  <div className="px-4 py-2 border-b border-line">
                    <h3 className="text-sm font-semibold text-ink">Notifications</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {insights.length === 0 && (
                      <p className="px-4 py-3 text-sm text-ink-muted">No notifications yet.</p>
                    )}
                    {insights.map((insight) => (
                      <button
                        key={insight.id}
                        type="button"
                        onClick={() => handleNotificationClick(insight)}
                        className={`block w-full px-4 py-3 text-left hover:bg-surface cursor-pointer transition ${
                          !insight.isRead ? 'bg-accent/10' : ''
                        }`}
                      >
                        <p className="text-sm text-ink">{insight.title}</p>
                        <p className="text-xs text-ink-muted mt-1">{formatRelativeTime(insight.createdAt)}</p>
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
                className="flex items-center space-x-3 p-2 hover:bg-surface rounded-lg transition"
              >
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium text-ink">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-ink-muted">{user?.email}</p>
                </div>
                <div className="h-10 w-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-medium text-sm">
                    {user?.firstName?.[0]}
                    {user?.lastName?.[0]}
                  </span>
                </div>
                <ChevronDownIcon className="h-4 w-4 text-ink-muted hidden md:block" />
              </button>

              {/* Profile Dropdown */}
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-surface-2 rounded-lg shadow-xl border border-line py-2 z-50">
                  <div className="px-4 py-3 border-b border-line">
                    <p className="text-sm font-medium text-ink">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-ink-muted">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <button className="w-full px-4 py-2 text-left text-sm text-ink hover:bg-surface flex items-center space-x-3 transition">
                      <UserCircleIcon className="h-5 w-5 text-ink-muted" />
                      <span>Your Profile</span>
                    </button>
                    <button
                      onClick={() => navigate('/settings')}
                      className="w-full px-4 py-2 text-left text-sm text-ink hover:bg-surface flex items-center space-x-3 transition"
                    >
                      <Cog6ToothIcon className="h-5 w-5 text-ink-muted" />
                      <span>Settings</span>
                    </button>
                  </div>
                  <div className="border-t border-line py-1">
                    <button
                      onClick={logout}
                      className="w-full px-4 py-2 text-left text-sm text-danger hover:bg-danger/10 flex items-center space-x-3 transition"
                    >
                      <ArrowRightOnRectangleIcon className="h-5 w-5 text-danger" />
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
            <MagnifyingGlassIcon className="h-5 w-5 text-ink-muted" />
          </div>
          <input
            type="text"
            placeholder="Search..."
            className="block w-full pl-10 pr-3 py-2 border border-line rounded-lg leading-5 bg-surface placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
          />
        </div>
      </div>
    </header>
  );
};

export default Header;
```

- [ ] **Step 2: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "gray-\|bg-white\|indigo-50\|indigo-500\|primary-" src/components/common/Header.tsx`
Expected: no output. (The `from-indigo-500 to-purple-500` avatar gradient is intentionally decorative and unrelated to the light/dark palette — if this grep flags it, that's expected and fine; everything else should be clean.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/Header.tsx
git commit -m "Reskin Header for dark theme, add theme toggle button"
```

---

## Task 6: Layout — wire in the grid background

**Files:**
- Modify: `frontend/src/components/common/Layout.tsx`

- [ ] **Step 1: Replace the file with this exact content**

```tsx
import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="relative flex h-screen">
      <div className="app-grid-bg" />
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
```

`.app-grid-bg` is a decorative sibling `<div>`, not the flex container itself — it's `position: fixed` with `z-index: -1` (defined in Task 1), so it renders as a full-viewport backdrop behind `Sidebar`/`Header`/page content without participating in the flex layout.

- [ ] **Step 2: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin && npm run build:frontend`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/Layout.tsx
git commit -m "Wire grid background into the authenticated app shell"
```

---

## Task 7: Login and Register pages

**Files:**
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/pages/Register.tsx`

- [ ] **Step 1: Replace `frontend/src/pages/Login.tsx` with this exact content**

```tsx
import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';

const Login = () => {
  const { login, loginWithGoogle } = useAuth();
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

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    try {
      await loginWithGoogle(credential);
      navigate('/');
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Sign-in failed';
      setError(message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center">
      <div className="app-grid-bg" />
      <div className="card w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold text-ink">Sign in to ChronosFin</h1>

        {error && (
          <div className="mb-4 rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-ink-muted">
          <div className="h-px flex-1 bg-line" />
          OR
          <div className="h-px flex-1 bg-line" />
        </div>

        <GoogleSignInButton onCredential={handleGoogleCredential} />

        <p className="mt-4 text-center text-sm text-ink-muted">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-accent hover:opacity-80">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
```

- [ ] **Step 2: Replace `frontend/src/pages/Register.tsx` with this exact content**

```tsx
import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';

const Register = () => {
  const { register, loginWithGoogle } = useAuth();
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

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    try {
      await loginWithGoogle(credential);
      navigate('/');
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Sign-in failed';
      setError(message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center">
      <div className="app-grid-bg" />
      <div className="card w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold text-ink">Create your ChronosFin account</h1>

        {error && (
          <div className="mb-4 rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-ink">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-ink">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
            />
            <p className="mt-1 text-xs text-ink-muted">
              At least 8 characters, with an uppercase letter, a lowercase letter, and a number.
            </p>
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-ink-muted">
          <div className="h-px flex-1 bg-line" />
          OR
          <div className="h-px flex-1 bg-line" />
        </div>

        <GoogleSignInButton onCredential={handleGoogleCredential} />

        <p className="mt-4 text-center text-sm text-ink-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:opacity-80">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
```

- [ ] **Step 3: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "gray-\|bg-white\|primary-\|red-\|indigo-" src/pages/Login.tsx src/pages/Register.tsx`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Login.tsx frontend/src/pages/Register.tsx
git commit -m "Reskin Login and Register pages for dark theme"
```

---

## Task 8: Settings page

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Replace the file with this exact content**

```tsx
import { useState } from 'react';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import authService from '../services/auth.service';

const Settings = () => {
  const { user, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const linked = user?.googleLinked ?? false;

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    try {
      await authService.linkGoogleAccount(credential);
      await refreshUser(); // picks up googleLinked: true from /auth/me
      setSuccess(true);
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Failed to link Google account';
      setError(message);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Settings</h1>

      <div className="card space-y-4 p-6">
        <div>
          <p className="text-sm font-medium text-ink">Name</p>
          <p className="text-sm text-ink-muted">{user?.firstName} {user?.lastName}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-ink">Email</p>
          <p className="text-sm text-ink-muted">{user?.email}</p>
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-2 text-sm font-medium text-ink">Google account</p>

          {error && (
            <div className="mb-3 rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>
          )}
          {success && (
            <div className="mb-3 rounded-md bg-success/10 p-3 text-sm text-success">Google account linked.</div>
          )}

          {linked ? (
            <p className="text-sm text-ink-muted">Your Google account is linked. You can sign in with either method.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-muted">Link your Google account to also sign in with it.</p>
              <GoogleSignInButton onCredential={handleGoogleCredential} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
```

- [ ] **Step 2: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "gray-\|bg-white\|red-\|green-" src/pages/Settings.tsx`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "Reskin Settings page for dark theme"
```

---

## Task 9: GoogleSignInButton error text

**Files:**
- Modify: `frontend/src/components/auth/GoogleSignInButton.tsx`

- [ ] **Step 1: Replace the error message classes**

Find:
```tsx
  if (scriptError) {
    return (
      <p className="text-center text-sm text-red-600">
        Could not load Google Sign-In. Check your connection and reload.
      </p>
    );
  }
```

Replace with:
```tsx
  if (scriptError) {
    return (
      <p className="text-center text-sm text-danger">
        Could not load Google Sign-In. Check your connection and reload.
      </p>
    );
  }
```

No other changes to this file — the Google-rendered button widget itself (`theme: 'outline'`) is controlled by Google's own script and renders as a white pill regardless of page theme, which matches Google's brand guidelines and is left as-is.

- [ ] **Step 2: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "red-600" src/components/auth/GoogleSignInButton.tsx`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/auth/GoogleSignInButton.tsx
git commit -m "Reskin GoogleSignInButton error text for dark theme"
```

---

## Task 10: Dashboard page, StatCard, RecentTransactions

**Files:**
- Modify: `frontend/src/components/common/StatCard.tsx`
- Modify: `frontend/src/components/dashboard/RecentTransactions.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace `frontend/src/components/common/StatCard.tsx` with this exact content**

```tsx
import React from 'react';

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative';
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const StatsCard: React.FC<StatsCardProps> = ({ 
  title, 
  value, 
  change, 
  changeType, 
  icon: Icon 
}) => {
  const changeColor = changeType === 'positive' ? 'text-success' : 'text-danger';
  
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink-muted">{title}</p>
          <p className="text-2xl font-bold text-ink">{value}</p>
          {change && (
            <p className={`text-sm ${changeColor}`}>
              {changeType === 'positive' ? '+' : ''}{change}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-3 bg-accent/10 rounded-full">
            <Icon className="h-6 w-6 text-accent" />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsCard;
```

- [ ] **Step 2: Replace `frontend/src/components/dashboard/RecentTransactions.tsx` with this exact content**

```tsx
import React from 'react';
import { Transaction } from '../../types';
import { formatCurrency, formatDateShort } from '../../utils/formatters';

interface RecentTransactionsProps {
  transactions: Transaction[];
  limit?: number;
}

const RecentTransactions: React.FC<RecentTransactionsProps> = ({ 
  transactions, 
  limit = 5 
}) => {
  const recentTransactions = transactions.slice(0, limit);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-ink">Recent Transactions</h3>
        <a href="/transactions" className="text-accent hover:opacity-80 text-sm font-medium">
          View all
        </a>
      </div>
      <div className="space-y-3">
        {recentTransactions.map((transaction) => (
          <div key={transaction.id} className="flex items-center justify-between py-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">
                {transaction.description}
              </p>
              <p className="text-xs text-ink-muted">
                {transaction.category} • {formatDateShort(transaction.date)}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium ${
                transaction.type === 'income' ? 'text-success' : 'text-ink'
              }`}>
                {transaction.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
              </p>
              <p className="text-xs text-ink-muted">{transaction.account}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentTransactions;
```

- [ ] **Step 3: Replace `frontend/src/pages/Dashboard.tsx` with this exact content**

```tsx
import React from 'react';
import {
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  WalletIcon
} from '@heroicons/react/24/outline';
import StatCard from '../components/common/StatCard';
import RecentTransactions from '../components/dashboard/RecentTransactions';
import { mockTransactions } from '../data/mockData';
import { formatCurrency } from '../utils/formatters';

const Dashboard: React.FC = () => {
  // Calculate dashboard statistics
  const totalIncome = mockTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = Math.abs(
    mockTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  const netBalance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((netBalance / totalIncome) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <p className="text-ink-muted mt-1">Welcome back! Here's your financial overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Balance"
          value={formatCurrency(netBalance)}
          change={`${savingsRate}% savings rate`}
          changeType="positive"
          icon={WalletIcon}
        />
        <StatCard
          title="Monthly Income"
          value={formatCurrency(totalIncome)}
          change="+12.5% from last month"
          changeType="positive"
          icon={ArrowTrendingUpIcon}
        />
        <StatCard
          title="Monthly Expenses"
          value={formatCurrency(totalExpenses)}
          change="-8.2% from last month"
          changeType="positive"
          icon={ArrowTrendingDownIcon}
        />
        <StatCard
          title="Net Savings"
          value={formatCurrency(netBalance)}
          change={`${savingsRate}% of income`}
          changeType="positive"
          icon={BanknotesIcon}
        />
      </div>

      {/* Charts Row - Placeholder for future charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-ink mb-4">Spending by Category</h3>
          <div className="flex items-center justify-center h-64 bg-surface rounded-lg">
            <p className="text-ink-muted">Chart coming soon...</p>
          </div>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold text-ink mb-4">Income vs Expenses</h3>
          <div className="flex items-center justify-center h-64 bg-surface rounded-lg">
            <p className="text-ink-muted">Chart coming soon...</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <RecentTransactions transactions={mockTransactions} limit={8} />

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-ink mb-4">Quick Actions</h3>
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

- [ ] **Step 4: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "gray-\|bg-white\|primary-" src/components/common/StatCard.tsx src/components/dashboard/RecentTransactions.tsx src/pages/Dashboard.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/StatCard.tsx frontend/src/components/dashboard/RecentTransactions.tsx frontend/src/pages/Dashboard.tsx
git commit -m "Reskin Dashboard page for dark theme"
```

---

## Task 11: Accounts page, AccountCard, AccountForm

**Files:**
- Modify: `frontend/src/pages/Accounts.tsx`
- Modify: `frontend/src/components/accounts/AccountCard.tsx`
- Modify: `frontend/src/components/accounts/AccountForm.tsx`

- [ ] **Step 1: Replace `frontend/src/pages/Accounts.tsx` with this exact content**

```tsx
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
    return <p className="text-ink-muted">Loading accounts...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Accounts</h1>
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
          <p className="text-ink-muted">No accounts yet. Add one to get started.</p>
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

- [ ] **Step 2: Replace `frontend/src/components/accounts/AccountCard.tsx` with this exact content**

```tsx
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
          <p className="font-medium text-ink">{account.name}</p>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            {TYPE_LABELS[account.type] ?? account.type}
          </span>
        </div>
        {account.bankName && (
          <p className="mt-1 text-sm text-ink-muted">{account.bankName}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <p className="text-lg font-semibold text-ink">
          {formatCurrency(account.balance, account.currency)}
        </p>
        <div className="flex gap-2">
          <button onClick={() => onEdit(account)} className="btn-secondary">
            Edit
          </button>
          <button
            onClick={() => onDelete(account)}
            className="rounded-lg px-4 py-2 font-medium text-danger transition-colors hover:bg-danger/10"
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

- [ ] **Step 3: Replace `frontend/src/components/accounts/AccountForm.tsx` with this exact content**

This preserves the already-shipped INR-default-currency behavior (`CURRENCIES` includes `'INR'`, default state is `'INR'`) alongside the new dark-theme classes.

```tsx
import { useState, FormEvent } from 'react';
import { AxiosError } from 'axios';
import { Account, AccountType, CreateAccountRequest, UpdateAccountRequest } from '../../types/api.types';

interface AccountFormProps {
  initialValues?: Account;
  onSubmit: (data: CreateAccountRequest | UpdateAccountRequest) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR'];

const AccountForm = ({ initialValues, onSubmit, onCancel, submitting }: AccountFormProps) => {
  const isEditing = !!initialValues;
  const [name, setName] = useState(initialValues?.name ?? '');
  const [type, setType] = useState<AccountType>(initialValues?.type ?? AccountType.CHECKING);
  const [balance, setBalance] = useState(String(initialValues?.balance ?? 0));
  const [currency, setCurrency] = useState(initialValues?.currency ?? 'INR');
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
      <h2 className="text-lg font-semibold text-ink">
        {isEditing ? 'Edit Account' : 'Add Account'}
      </h2>

      {error && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-ink">
            Type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
          >
            <option value={AccountType.CHECKING}>Checking</option>
            <option value={AccountType.SAVINGS}>Savings</option>
            <option value={AccountType.CREDIT}>Credit</option>
            <option value={AccountType.INVESTMENT}>Investment</option>
          </select>
        </div>
      )}

      <div>
        <label htmlFor="balance" className="block text-sm font-medium text-ink">
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
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
        <p className="mt-1 text-xs text-ink-muted">
          {isEditing
            ? 'Manually adjusting this overrides the balance directly, separate from transaction history.'
            : 'Starting balance for this account.'}
        </p>
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="currency" className="block text-sm font-medium text-ink">
            Currency
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
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
        <label htmlFor="bankName" className="block text-sm font-medium text-ink">
          Bank name (optional)
        </label>
        <input
          id="bankName"
          type="text"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="accountNumber" className="block text-sm font-medium text-ink">
          Account number (optional)
        </label>
        <input
          id="accountNumber"
          type="text"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
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

- [ ] **Step 4: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "gray-\|bg-white\|primary-\|red-600" src/pages/Accounts.tsx src/components/accounts/AccountCard.tsx src/components/accounts/AccountForm.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Accounts.tsx frontend/src/components/accounts/AccountCard.tsx frontend/src/components/accounts/AccountForm.tsx
git commit -m "Reskin Accounts page for dark theme"
```

---

## Task 12: Transactions page, TransactionRow, TransactionForm

**Files:**
- Modify: `frontend/src/pages/Transactions.tsx`
- Modify: `frontend/src/components/transactions/TransactionRow.tsx`
- Modify: `frontend/src/components/transactions/TransactionForm.tsx`

- [ ] **Step 1: Replace `frontend/src/pages/Transactions.tsx` with this exact content**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const requestIdRef = useRef(0);

  const loadAll = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      const [accountsData, transactionsData] = await Promise.all([
        accountService.getAccounts(),
        transactionService.getTransactions({
          accountId: accountFilter || undefined,
          type: (typeFilter || undefined) as TransactionType | undefined,
        }),
      ]);
      if (requestIdRef.current !== requestId) return;
      setAccounts(accountsData);
      setTransactions(transactionsData);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setError('Failed to load transactions. Please try again.');
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [accountFilter, typeFilter]);

  useEffect(() => {
    setLoading(true);
    loadAll();
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
    return <p className="text-ink-muted">Loading transactions...</p>;
  }

  if (error) {
    return (
      <div className="card space-y-3">
        <p className="text-danger">{error}</p>
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
        <h1 className="text-2xl font-bold text-ink">Transactions</h1>
        {!formMode && (
          <div className="flex items-center gap-3">
            {accounts.length === 0 && (
              <span className="text-sm text-ink-muted">Create an account first</span>
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
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
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
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
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
          key={formMode === 'edit' ? editingTransaction?.id : 'create'}
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
        {transactions.length === 0 && <p className="text-ink-muted">No transactions yet.</p>}
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

- [ ] **Step 2: Replace `frontend/src/components/transactions/TransactionRow.tsx` with this exact content**

```tsx
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
  [TransactionType.EXPENSE]: 'text-ink',
  [TransactionType.TRANSFER]: 'text-accent',
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
        <p className="font-medium text-ink">{transaction.description}</p>
        <p className="mt-1 text-sm text-ink-muted">
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
            className="rounded-lg px-4 py-2 font-medium text-danger transition-colors hover:bg-danger/10"
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

- [ ] **Step 3: Replace `frontend/src/components/transactions/TransactionForm.tsx` with this exact content**

```tsx
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
  if (isoDate) {
    return isoDate.slice(0, 10);
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      <h2 className="text-lg font-semibold text-ink">
        {isEditing ? 'Edit Transaction' : 'Add Transaction'}
      </h2>

      {error && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>
      )}

      {!isEditing && (
        <div>
          <label htmlFor="accountId" className="block text-sm font-medium text-ink">
            Account
          </label>
          <select
            id="accountId"
            required
            value={accountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
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
          <label htmlFor="type" className="block text-sm font-medium text-ink">
            Type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as TransactionType)}
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
          >
            <option value={TransactionType.INCOME}>Income</option>
            <option value={TransactionType.EXPENSE}>Expense</option>
            <option value={TransactionType.TRANSFER}>Transfer</option>
          </select>
        </div>
      )}

      {!isEditing && type === TransactionType.TRANSFER && (
        <div>
          <label htmlFor="toAccountId" className="block text-sm font-medium text-ink">
            To Account
          </label>
          <select
            id="toAccountId"
            required
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
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
        <label htmlFor="amount" className="block text-sm font-medium text-ink">
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
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
        <p className="mt-1 text-xs text-ink-muted">
          Always a positive number — the Type above determines whether it's added to or subtracted from the account balance.
        </p>
      </div>

      {type === TransactionType.TRANSFER ? (
        <p className="text-sm text-ink-muted">Category: Transfer</p>
      ) : (
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-ink">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TransactionCategory)}
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
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
        <label htmlFor="date" className="block text-sm font-medium text-ink">
          Date
        </label>
        <input
          id="date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-ink">
          Description
        </label>
        <input
          id="description"
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
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

- [ ] **Step 4: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "gray-\|bg-white\|primary-" src/pages/Transactions.tsx src/components/transactions/TransactionRow.tsx src/components/transactions/TransactionForm.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Transactions.tsx frontend/src/components/transactions/TransactionRow.tsx frontend/src/components/transactions/TransactionForm.tsx
git commit -m "Reskin Transactions page for dark theme"
```

---

## Task 13: Goals page, GoalCard, GoalForm

**Files:**
- Modify: `frontend/src/pages/Goals.tsx`
- Modify: `frontend/src/components/goals/GoalCard.tsx`
- Modify: `frontend/src/components/goals/GoalForm.tsx`

- [ ] **Step 1: Replace `frontend/src/pages/Goals.tsx` with this exact content**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Used for the initial load and the Retry button: failure here means
  // there's nothing to show yet, so a full blocking error screen is the
  // right response.
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

  // Used after a mutation (create/edit/delete/contribute) already
  // succeeded. A refresh failure here must NOT look like the mutation
  // itself failed -- the write already went through, so this only ever
  // shows a small non-blocking notice, never the full-page error state.
  const refreshQuietly = useCallback(async () => {
    try {
      const [goalsData, summaryData] = await Promise.all([
        goalService.getGoals(),
        goalService.getGoalSummary(),
      ]);
      setGoals(goalsData);
      setSummary(summaryData);
    } catch {
      setActionError('Saved, but the list could not refresh. Reload the page to see the latest data.');
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
    setActionError(null);
    setDeletingId(goal.id);
    try {
      await goalService.deleteGoal(goal.id);
      await refreshQuietly();
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Failed to delete goal';
      setActionError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleContribute = async (goal: Goal, amount: number) => {
    // Let a failure here throw back up to GoalCard, which displays it
    // inline -- the mutation itself genuinely failed in that case.
    await goalService.contributeToGoal(goal.id, amount);
    // A refresh failure here is handled separately (see refreshQuietly)
    // and never surfaces as a contribution failure.
    await refreshQuietly();
  };

  const handleSubmit = async (data: CreateGoalRequest | UpdateGoalRequest) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && editingGoal) {
        await goalService.updateGoal(editingGoal.id, data as UpdateGoalRequest);
      } else {
        await goalService.createGoal(data as CreateGoalRequest);
      }
      // Close the form as soon as the save itself succeeds, before the
      // refresh -- a slow or failed refresh afterward shouldn't leave
      // the form open or make a successful save look unfinished.
      setFormMode(null);
      setEditingGoal(null);
      await refreshQuietly();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-ink-muted">Loading goals...</p>;
  }

  if (error) {
    return (
      <div className="card space-y-3">
        <p className="text-danger">{error}</p>
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
        <h1 className="text-2xl font-bold text-ink">Goals</h1>
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

      {actionError && (
        <div className="flex items-center justify-between rounded-md bg-danger/10 p-3 text-sm text-danger">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-medium underline">
            Dismiss
          </button>
        </div>
      )}

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
        {goals.length === 0 && <p className="text-ink-muted">No goals yet. Add one to get started.</p>}
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onContribute={handleContribute}
            deleting={deletingId === goal.id}
          />
        ))}
      </div>
    </div>
  );
};

export default Goals;
```

- [ ] **Step 2: Replace `frontend/src/components/goals/GoalCard.tsx` with this exact content**

```tsx
import { useState, FormEvent } from 'react';
import { AxiosError } from 'axios';
import { Goal } from '../../types/api.types';
import { formatCurrency } from '../../utils/formatters';

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onContribute: (goal: Goal, amount: number) => Promise<void>;
  deleting: boolean;
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

const GoalCard = ({ goal, onEdit, onDelete, onContribute, deleting }: GoalCardProps) => {
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
            <p className="font-medium text-ink">{goal.title}</p>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              {CATEGORY_LABELS[goal.category] ?? goal.category}
            </span>
          </div>
          {goal.description && <p className="mt-1 text-sm text-ink-muted">{goal.description}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEdit(goal)} className="btn-secondary">
            Edit
          </button>
          <button
            onClick={() => onDelete(goal)}
            disabled={deleting}
            className="rounded-lg px-4 py-2 font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div>
        <div className="h-2 w-full rounded-full bg-surface">
          <div
            className={`h-2 rounded-full ${isCompleted ? 'bg-success' : 'bg-accent'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-sm text-ink-muted">
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
              className="block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
            />
            {error && <p className="mt-1 text-sm text-danger">{error}</p>}
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

- [ ] **Step 3: Replace `frontend/src/components/goals/GoalForm.tsx` with this exact content**

```tsx
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

    // Edit and create diverge here on purpose: in edit mode, description
    // must always be sent as-is (including '' ) so clearing it actually
    // clears the stored value -- the backend only updates description
    // when the key is present at all, and treats '' as "set it to null".
    // Sending `undefined` for an empty description would omit the key
    // entirely and silently leave the old description in place. Create
    // mode has no existing value to preserve, so omitting an empty one
    // there is harmless and matches AccountForm's precedent for optional
    // text fields.
    const payload = isEditing
      ? {
          title,
          description,
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
      <h2 className="text-lg font-semibold text-ink">{isEditing ? 'Edit Goal' : 'Add Goal'}</h2>

      {error && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-ink">
          Title
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-ink">
          Description (optional)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="targetAmount" className="block text-sm font-medium text-ink">
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
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="currentAmount" className="block text-sm font-medium text-ink">
            Current Amount (optional)
          </label>
          <input
            id="currentAmount"
            type="number"
            step="0.01"
            min="0"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
          />
          <p className="mt-1 text-xs text-ink-muted">How much you've already saved toward this goal.</p>
        </div>
      )}

      <div>
        <label htmlFor="targetDate" className="block text-sm font-medium text-ink">
          Target Date
        </label>
        <input
          id="targetDate"
          type="date"
          required
          min={isEditing ? undefined : todayForInput()}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-ink">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as GoalCategory)}
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
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

- [ ] **Step 4: Verify**

Run: `cd /Users/shannensaikia/Projects/ChronosFin/frontend && grep -n "gray-\|bg-white\|primary-\|red-" src/pages/Goals.tsx src/components/goals/GoalCard.tsx src/components/goals/GoalForm.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Goals.tsx frontend/src/components/goals/GoalCard.tsx frontend/src/components/goals/GoalForm.tsx
git commit -m "Reskin Goals page for dark theme"
```

---

## Task 14: Final verification and branch finish

**Files:** none (verification only)

- [ ] **Step 1: Repo-wide sweep for leftover light-theme classes in touched directories**

Run:
```bash
cd /Users/shannensaikia/Projects/ChronosFin/frontend/src
grep -rn "text-gray-\|bg-gray-\|border-gray-\|bg-white\b\|bg-primary-\|text-primary-\|hover:bg-primary-\|focus:ring-indigo\|bg-indigo-50\|text-red-600\|bg-red-50\|text-red-700\|bg-green-50\|text-green-700" \
  pages/Dashboard.tsx pages/Accounts.tsx pages/Transactions.tsx pages/Goals.tsx pages/Settings.tsx pages/Login.tsx pages/Register.tsx pages/App.tsx \
  components/common/Sidebar.tsx components/common/Header.tsx components/common/Layout.tsx components/common/StatCard.tsx \
  components/accounts components/goals components/transactions components/dashboard \
  components/auth/GoogleSignInButton.tsx components/auth/ProtectedRoute.tsx components/auth/PublicOnlyRoute.tsx \
  App.tsx
```

Expected: no output. (`pages/App.tsx` in the command above is intentionally redundant with the trailing `App.tsx` — harmless if one path doesn't resolve; the important thing is `App.tsx`, at the `src/` root, is included and clean.) If anything matches, fix that file before continuing — it means a class was missed in an earlier task.

- [ ] **Step 2: Full build and lint**

Run: `cd /Users/shannensaikia/Projects/ChronosFin && npm run build:frontend && npm run lint:frontend`
Expected: both succeed with no errors.

- [ ] **Step 3: Confirm admin panel and Landing page are untouched**

Run: `cd /Users/shannensaikia/Projects/ChronosFin && git diff --stat main -- frontend/src/pages/admin frontend/src/components/admin frontend/src/pages/Landing.tsx frontend/src/pages/Landing.css`
Expected: no output (empty diff) — these were explicitly out of scope per the design spec.

- [ ] **Step 4: Manual visual review (cannot be automated — no browser tool available)**

Run: `npm run dev:frontend` and ask the user to check, in a browser, at minimum:
- Dashboard, Accounts, Transactions, Goals, Settings, Login, Register all render in dark mode by default with the grid background visible behind cards.
- The theme toggle in the Header switches to light mode and back, and the choice survives a page reload (persisted via `localStorage`).
- Forms (Account/Transaction/Goal create and edit) are legible and usable in both themes.
- The admin panel (`/admin`) and the public Landing page (`/`) still look exactly as they did before this branch — unaffected by this change.

Do not report this task complete until the user confirms the visual review.

- [ ] **Step 5: Finish the branch**

**REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch to verify the build/lint one more time, present the merge/PR/keep/discard options, and execute the user's choice.

