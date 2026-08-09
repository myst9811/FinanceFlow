# Admin User Detail View — Design Spec

## Context

The admin Users page (`/admin/users`) currently shows a flat list — name, email, joined date, aggregate counts (accounts/transactions/goals), active status, and a deactivate/reactivate toggle. This adds a per-user detail view (`/admin/users/:id`) for a closer look at one account at a time, requested as "greater scope of visibility."

The original admin design (`docs/superpowers/specs/2026-08-08-admin-google-sso-design.md`) explicitly excluded viewing a user's actual financial data — "aggregate info only, no drill-down into any user's actual financial data — a deliberate privacy boundary, not an oversight." This feature keeps that boundary: richer *metadata* (account types, goal categories, timestamps, auth method), never dollar amounts, balances, or individual transaction line items. The boundary is enforced structurally — the backend query never selects `balance`, `amount`, `targetAmount`, `currentAmount`, or queries the `Transaction` model for anything beyond the existing aggregate count — not by fetching and then hiding fields.

## Backend: `GET /api/admin/users/:id`

New controller function in `backend/src/controllers/admin/users.controller.ts`, alongside the existing `getUsers`/`updateUserStatus`:

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

`googleSubject` follows the exact pattern already established in the regular-user `getCurrentUser` (`backend/src/controllers/auth.controller.ts`): selected internally, never returned raw, collapsed to a `googleLinked` boolean. `password` gets the identical treatment for `hasPassword` — the hash itself is selected only to compute a boolean and is destructured out before the response is built, never serialized. This directly answers "which auth methods does this account have" (a user can have both) without exposing anything sensitive.

Route, in `backend/src/routes/admin.routes.ts`:

```typescript
router.get('/users/:id', requireAdmin, getUserDetail);
```

Placed alongside the existing `/users` and `/users/:id/status` routes — same `requireAdmin` middleware, same `requireTrustedOrigin` (applied globally via `router.use` at the top of the file, already covers this new route with no change needed).

## Frontend

**Types** (`frontend/src/types/admin.types.ts`) — new interface, reusing the `AccountType`/`GoalCategory` enums already defined in `frontend/src/types/api.types.ts` for the regular app:

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

**Service** (`frontend/src/services/admin.service.ts`) gains:

```typescript
async getUserDetail(id: string): Promise<AdminUserDetail> {
  const response = await adminApiClient.get<{ user: AdminUserDetail }>(`/admin/users/${id}`);
  return response.data.user;
}
```

**New page** `frontend/src/pages/admin/AdminUserDetail.tsx`, route `/admin/users/:id` added to `App.tsx` inside the existing `<Route element={<AdminRoute />}>` group (alongside `index`/`users`). Reads `id` via `useParams()`, fetches on mount, and renders:

- **Header card**: name, email, status badge (Active/Deactivated, same colors as the list), auth method badge(s) — "Password" when `hasPassword`, "Google" when `googleLinked` (both can show at once) — joined (`createdAt`) and last updated (`updatedAt`) dates, and the Deactivate/Reactivate button (reusing the same `adminService.updateUserStatus` call already used on the list page).
- **Accounts table**: name, type, bank name (em-dash if null), active status, created date. No balance column.
- **Goals table**: title, category, target date, active status. No amount/progress column.
- **Activity summary**: the three `_count` numbers, same as the list page shows today.

**List page** (`AdminUsers.tsx`): the name/email cell becomes a `<Link to={`/admin/users/${user.id}`}>` instead of plain text — the only change needed there.

## Error handling

- Unknown `id` → `404 User not found`, same `ApiError` pattern as `updateUserStatus`'s existing check.
- Frontend: fetch failure (404 or network) → an error message in place of the detail content, with a link back to `/admin/users` (matching the list page's existing inline-error style, not a redirect).

## Testing

Backend (`backend/src/controllers/admin/__tests__/users.controller.test.ts`, extending the existing file):
- Returns full detail (accounts, goals, counts, `googleLinked`) for a known user id.
- Returns `404` for an unknown id.
- Confirms the response contains no `balance`, `amount`, `targetAmount`, `currentAmount`, or `password`/`googleSubject` keys anywhere in the payload — a direct assertion that the privacy boundary holds, not just that the happy path works.

Frontend: manual check only (no automated suite, per project convention) — load `/admin/users`, click into a user, confirm accounts/goals render without dollar figures, confirm deactivate/reactivate still works from the detail page, confirm the 404 case for a garbage id in the URL.
