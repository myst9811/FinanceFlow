# Frontend Goals Page — Design Spec

## Context

This is sub-project 4c, the third of four parts of "Frontend: real data pages" (sub-project 4 in the top-level roadmap):

- 4a. Accounts (done, merged) — full CRUD page + fixed `AccountSummary` type
- 4b. Transactions (done, PR #6 open) — full CRUD page + fixed `Transaction`/`TransactionStats` types
- **4c. Goals (this spec)** — full CRUD page + contribute action + fix `GoalSummary`/`CreateGoalRequest`/`UpdateGoalRequest` types
- 4d. Dashboard — replace `mockData.ts` with real data, wire Quick Actions, remove the now-dead legacy types (depends on 4a-4c)

Unlike 4b, this sub-project is independent of 4a/4b — the `Goal` model has no foreign key to `Account` or `Transaction`, so it doesn't need to branch from either of those PRs. Today `frontend/src/pages/Goals.tsx` is a "Coming soon" placeholder. The backend's goal resource is fully built: full CRUD, a dedicated contribute endpoint, and a summary endpoint, all enriching responses with computed `progress`/`remainingAmount`/`daysRemaining` fields via `calculateGoalMetrics` in `backend/src/controllers/goal.controller.ts`.

## Pre-existing type bugs

Same pattern as 4a/4b: these types in `frontend/src/types/api.types.ts` were drafted speculatively and don't match the real backend. `Goal` itself is already correct (it already has `progress`/`remainingAmount`/`daysRemaining` as optional fields matching the backend's enrichment) — the other three need fixing.

**`CreateGoalRequest`** is missing `currentAmount` (optional — "I've already saved $500 toward this"):

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

**`UpdateGoalRequest`** wrongly includes `category` (the backend's `updateGoal` controller doesn't destructure or accept it from the request body — category is immutable once a goal is created) and is missing `currentAmount`/`isActive` (which the backend does accept):

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

**`GoalSummary`** doesn't match `getGoalsSummary`'s actual return shape at all (missing `completedGoals`/`totalRemainingAmount`, and `byCategory` is a keyed object, not an array of differently-named fields):

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

## Backend contract this page relies on

All routes under `/api/goals`, authenticated:

- `GET /api/goals` → `{ goals: Goal[], count }`, each goal enriched with `progress`/`remainingAmount`/`daysRemaining`.
- `GET /api/goals/summary` → `{ summary: GoalSummary }` (as corrected above).
- `POST /api/goals` with `CreateGoalRequest` → `{ goal: Goal }`. Validation (mirrored client-side): `title` ≥ 2 chars, `targetAmount` > 0, `category` one of the 7 `GoalCategory` values, `targetDate` a valid date **that is today or later** (rejected if in the past).
- `PATCH /api/goals/:id` with `UpdateGoalRequest` (`title`, `description`, `targetAmount`, `currentAmount`, `targetDate`, `isActive` — **no** `category`) → `{ goal: Goal }`. Notably, unlike create, the backend's update validation does **not** require `targetDate` to be in the future — confirmed by reading `validateGoalUpdate` in `backend/src/utils/validation.ts`, which only checks date format, not date-vs-today. The edit form still applies a `min` of today on its date input anyway, as a client-side UX choice (not a backend requirement) to avoid producing odd-looking past-dated goals through the UI, even though the backend would technically accept one.
- `POST /api/goals/:id/contribute` with `{ amount: number }` (must be > 0) → adds to `currentAmount` (additive, not an overwrite) → `{ goal: Goal, message: string }`.
- `DELETE /api/goals/:id` → deactivates (sets `isActive: false`, same soft-delete pattern as Accounts), returns `{ message: string }`.

## Contributions get their own action, not the edit form

The backend offers two distinct ways to change `currentAmount`: a direct overwrite via `PATCH` (`currentAmount` field) and an additive `POST /:id/contribute`. For a goal-tracking UI, "contribute $50 toward this goal" is the natural mental model — so `GoalCard` gets a small inline "Add Funds" control (a toggle button that reveals a single amount input + submit, using the contribute endpoint), separate from the main Edit form. This mirrors why `AccountForm`'s balance field carries an explicit "manual adjustment" caption in 4a: exposing a raw `currentAmount` override field invites confusion with the (also-supported) additive path. Edit only touches `title`/`description`/`targetAmount`/`targetDate`. Category is not shown as editable (immutable, matching Transactions' immutable-`type` precedent in 4b). `currentAmount`/`isActive` are not exposed as raw fields in the edit form — same "no reactivation UI for deactivated items" call already made for Accounts and (implicitly) Transactions.

## Component structure

- **`components/goals/GoalForm.tsx`**: fields depend on mode.
  - Create mode: Title, Description (optional textarea), Target Amount, Current Amount (optional, defaults to 0), Target Date (`<input type="date">` with `min` set to today — matching the backend's create-only future-date requirement), Category (`<select>`: Emergency Fund / House Down Payment / Vacation / Car / Debt Payoff / Retirement / Other).
  - Edit mode: Title, Description, Target Amount, Target Date only — no Category field shown (immutable), no Current Amount field (handled by the separate contribute action on the card). The Target Date input in edit mode has **no** `min` constraint: the backend doesn't enforce a future-date rule on update (only on create), so restricting it client-side here would block a legitimate backend-supported edit for no reason.
  - Same error-surfacing pattern as `AccountForm`/`TransactionForm` (`err.response.data.error`).
  - Same remount-safety lesson learned from 4b's review: the page must pass a `key` derived from the goal being edited (or `'create'`) so switching between editing different goals reinitializes the form instead of reusing stale state.
- **`components/goals/GoalCard.tsx`**: title, category badge, description (if present), a progress bar (`currentAmount`/`targetAmount`, clamped to 100% visually even though `progress` from the backend is already clamped), "$current of $target (N%)", days-remaining text (or "Goal completed!" when `progress >= 100`, styled distinctly e.g. green), an inline toggle for "Add Funds" (amount input + submit, calling the contribute endpoint), and Edit/Delete buttons.
- **`pages/Goals.tsx`**: fetches goals and the summary in parallel on mount, with the same explicit loading/error/retry state and race-safe request-id guard introduced in 4b's Transactions page (applying that lesson forward rather than repeating the bug). Three stat cards (Total Goals, Total Saved, Overall Progress) from the corrected summary — `byCategory` and `urgentGoals` are fetched but not rendered in this first version, same "fetched but not surfaced yet" call as Accounts' `byType` breakdown. "Add Goal" toggles the form (create mode). Edit pre-fills the edit-mode form. Delete triggers a `window.confirm`, then calls the deactivate endpoint and refetches both goals and the summary. A contribution success also refetches both (the summary's totals need to reflect it too).

## Out of scope

- Any UI to view or reactivate deactivated goals (same call as Accounts in 4a)
- `byCategory` and `urgentGoals` rendering from the summary (fetched, typed correctly, not displayed yet)
- Goal completion celebration/notification beyond the card's own "Goal completed!" text state
- Dashboard page (sub-project 4d)

## Testing / verification

No new automated frontend tests, consistent with 4a/4b's precedent. Manual verification (mirroring 4a/4b's approach — curl-based checks against the exact payloads the frontend sends, plus a visual pass):

1. Fresh user, `/goals`: "Total Goals: 0", "Total Saved: $0.00", "Overall Progress: 0%", empty list.
2. Create a goal with a future target date and a nonzero starting `currentAmount`. Confirm it appears with the correct progress bar/percentage, and the stat cards update.
3. Attempt to create a goal with a past target date → the backend's validation error ("Target date must be in the future") is surfaced in the form.
4. Edit a goal's title/targetAmount/targetDate → confirm the change reflects in the card, and that there is no Category field shown in the edit form.
5. Use "Add Funds" to contribute to a goal → confirm `currentAmount` increases additively (not overwritten), the progress bar updates, and the goals summary's `totalCurrentAmount`/`overallProgress` update too.
6. Contribute enough to reach or exceed the target amount → confirm the card shows a "completed" state.
7. Delete a goal → confirm it disappears from the list and the summary's totals update; confirm via a direct API call that it's `isActive: false` rather than hard-deleted.
8. Edit a goal's target date to a **past** date → confirm this succeeds (the backend's update validation doesn't enforce future-dates, only creation does) even though the create form's date input wouldn't have allowed selecting one directly.
9. `npm run build:frontend` completes with no TypeScript errors.
