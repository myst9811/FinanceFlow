# Frontend Auth & Routing — Design Spec

## Context

This is sub-project 3 of the FinanceFlow deployment roadmap (sub-projects 1 and 2 — insights, Vercel serverless adaptation — are merged into `main`):

1. Insights (done)
2. Vercel serverless adaptation (done)
3. **Frontend: auth & routing (this spec)**
4. Frontend: real data pages (Accounts/Transactions/Goals wired to the live API, replacing `mockData.ts`)
5. Docs & CI
6. Deploy

Today the frontend has no routing at all — `App.tsx` unconditionally renders `<Layout><Dashboard /></Layout>`, `Dashboard` reads from `data/mockData.ts`, and the fully-built `AuthContext`/`AuthProvider`/`useAuth`/`auth.service.ts` are never mounted anywhere. `Header.tsx` shows a hardcoded "John Doe" and a hardcoded mock notifications list; `Sidebar.tsx` links to `/`, `/transactions`, `/analytics`, `/goals`, `/settings` via plain `<a href>` tags (full page reloads, no active-route styling, and no corresponding pages exist for most of them).

## Scope decisions (confirmed with user)

- **Nav items**: trim to Dashboard, Accounts, Transactions, Goals — matching real backend resources. Drop Analytics and Settings (never planned, no backend or page work scoped for either).
- **Notifications bell**: wire to the real Insights API (`GET /api/insights`, `PATCH /api/insights/:id/read`) as part of this sub-project, since it naturally falls out of touching `Header.tsx` for the real user info anyway.
- **Page content for Accounts/Transactions/Goals**: lightweight placeholder pages only. Real data-fetching and UI for these is sub-project 4's job — this sub-project is routing/auth infrastructure, not data pages.
- **No new frontend test framework**: the frontend has zero test infrastructure today (only the backend uses vitest). Adding one now, for this sub-project alone, would be a disproportionate scope jump. Verification is manual (see below).

## Routing

Add `react-router-dom` (`^7.18`, React 19-compatible per its `react: >=18` peer range). Route table:

| Path | Access | Chrome |
|---|---|---|
| `/login` | public-only | none |
| `/register` | public-only | none |
| `/` | protected | `Layout` → `Dashboard` |
| `/accounts` | protected | `Layout` → `Accounts` (placeholder) |
| `/transactions` | protected | `Layout` → `Transactions` (placeholder) |
| `/goals` | protected | `Layout` → `Goals` (placeholder) |
| `*` (unmatched) | — | redirect to `/` |

`main.tsx` wraps the tree in `<AuthProvider>` (mounted for the first time — it already exists fully built, just unused) and `<BrowserRouter>`. `App.tsx` becomes the route definition table instead of unconditionally rendering `Dashboard`.

## Route guards

Two small, single-purpose components (`frontend/src/components/auth/`):

- **`ProtectedRoute`**: reads `useAuth()`. While `loading` is true (initial `/auth/me` check in flight), renders a simple loading state. If not authenticated, `<Navigate to="/login" replace />`. Otherwise renders its children (or `<Outlet />` if used as a layout route — implementation detail decided during planning).
- **`PublicOnlyRoute`**: if `useAuth().isAuthenticated`, `<Navigate to="/" replace />` — prevents a logged-in user from seeing Login/Register. Otherwise renders children.

Both are thin wrappers with one job each — matches the codebase's existing preference for small, focused files (e.g. `useAuth.ts` split out from `AuthContext.tsx`).

## New pages

- **`Login.tsx`**: controlled-input form (email, password) using plain `useState`, no new form library — matches `Dashboard.tsx`'s existing plain-React style. Calls `useAuth().login()`; on rejection, reads the axios error's `err.response.data.error` (the backend's `{ error: string }` shape from `ApiError`) and displays it. Link to `/register`.
- **`Register.tsx`**: same pattern (email, password, firstName, lastName) calling `useAuth().register()`. Link to `/login`.
- **`Accounts.tsx`, `Transactions.tsx`, `Goals.tsx`**: minimal placeholder pages (heading + "Coming soon" body), enough for the nav links and routes to resolve to something. Sub-project 4 replaces their contents entirely.

Neither Login nor Register uses `Layout` (no sidebar/header before a user is authenticated).

## Sidebar changes

`navigation` array in `Sidebar.tsx` trimmed to:

```text
Dashboard    /            HomeIcon
Accounts     /accounts    BanknotesIcon
Transactions /transactions CreditCardIcon
Goals        /goals       FlagIcon
```

(dropping Analytics/Settings). `<a href={item.href}>` replaced with React Router's `<NavLink to={item.href}>`, which avoids full-page reloads and exposes an `isActive` state for styling the current route (visual treatment is an implementation detail for the plan, not a design decision — reuse the existing hover/active Tailwind classes already in the file, just driven by `NavLink`'s active state instead of nothing).

## Header changes

- Replace the hardcoded "John Doe" / "john@example.com" block with `useAuth().user` — render `${user.firstName} ${user.lastName}` and `user.email`. `Header` is only ever rendered inside `Layout`, which is only ever reached via `ProtectedRoute`, so `user` is guaranteed non-null there.
- Wire the existing (currently inert) "Sign Out" button in the profile dropdown to call `useAuth().logout()`.
- Replace the hardcoded `notifications` array with real data: a new `frontend/src/services/insight.service.ts` (mirroring `auth.service.ts`'s class-instance-export pattern, using the shared `apiClient`) exposing `getInsights()` (`GET /api/insights`) and `markInsightRead(id)` (`PATCH /api/insights/:id/read`). `Header` fetches the list once on mount via `useEffect`, computes the unread badge count client-side by filtering `isRead === false` (no separate summary call — YAGNI, this is just a bell icon), and renders each insight's `title`/`createdAt`/`isRead` in place of the mock `text`/`time`/`unread` fields. Clicking a notification calls `markInsightRead(id)` and updates local state optimistically (flip that item's `isRead` to `true` immediately, matching the existing dropdown's visual treatment for read vs. unread).

## New frontend types

`frontend/src/types/api.types.ts` gets an `Insight` interface matching the backend's shape:

```typescript
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

## Out of scope

- Real data/content for Accounts, Transactions, Goals pages (sub-project 4)
- Removing `mockData.ts` or `Dashboard.tsx`'s use of it (sub-project 4)
- A frontend test framework (not requested, disproportionate to this sub-project)
- Changing `apiClient.ts`'s existing `window.location.href = '/login'` redirect-on-401 behavior to use React Router's imperative navigation instead of a hard reload — works today, and improving it isn't required for this sub-project's routing to function correctly
- Analytics and Settings pages/nav items (dropped per user decision, not planned anywhere in the roadmap)

## Testing / verification

No new automated tests, per the scope decision above. Manual verification: start both the backend (`npm run dev:backend`) and frontend (`npm run dev:frontend`) dev servers, then in the browser:

1. Visit `/` while logged out → redirected to `/login`.
2. Register a new user → redirected to `/` (dashboard), sidebar/header now visible.
3. Header shows the real registered name/email, not "John Doe".
4. Click each sidebar link (Dashboard/Accounts/Transactions/Goals) → client-side navigation (no full page reload), active link highlighted.
5. Notifications bell shows real data from `GET /api/insights` (likely empty for a fresh user — verify by seeding transactions/goals that trigger a rule, per the insights feature's rules, then reloading).
6. Click a notification → it's marked read (`PATCH` fires, badge count decrements).
7. Sign out via the header dropdown → redirected to `/login`, protected routes now redirect back to `/login` if visited directly.
8. Visit `/login` or `/register` while already authenticated → redirected to `/`.
9. `npm run build:frontend` completes with no TypeScript errors.
