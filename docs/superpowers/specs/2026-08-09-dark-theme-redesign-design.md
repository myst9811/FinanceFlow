# Dark Theme Redesign — Design

## Goal

Reskin the authenticated main app (Sidebar, Header, Dashboard, Accounts, Transactions, Goals, Settings, Login, Register) to a dark-by-default theme with a slick, futuristic, medium-spaced grid background, while keeping a light mode available via a toggle. No layout, spacing, or structural changes — this is a color/surface reskin plus a background treatment and a theme switcher.

**Out of scope:** the public Landing page (already has its own CSS-variable theme system and light/dark handling in `Landing.css` — left untouched) and the admin panel (`AdminLayout`, `AdminLogin`, `AdminDashboard`, `AdminUsers`, `AdminUserDetail` — a separately-styled layout, left untouched).

## Color system

Semantic color tokens as CSS custom properties, defined once in `frontend/src/index.css`:

```css
:root {
  --surface: 13 17 23;        /* page/card background, dark default */
  --surface-2: 22 27 34;      /* raised surface, e.g. hover states */
  --ink: 230 237 243;         /* primary text */
  --ink-muted: 139 148 158;   /* secondary text */
  --line: 48 54 61;           /* borders/dividers */
  --accent: 45 189 139;       /* emerald brand accent, #2DBD8B */
  --accent-glow: 45 189 139;  /* same hue, used at low alpha for glow */
}

.light {
  --surface: 255 255 255;
  --surface-2: 249 250 251;   /* gray-50 */
  --ink: 17 24 39;            /* gray-900 */
  --ink-muted: 107 114 128;   /* gray-500 */
  --line: 229 231 235;        /* gray-200 */
  --accent: 37 99 235;        /* existing primary-600 blue, unchanged in light mode */
  --accent-glow: 37 99 235;
}
```

Dark is the default (`:root`, no class needed). A `.light` class applied to `<html>` overrides to light values. `tailwind.config.js` maps these to Tailwind utilities using the `rgb(var(--x) / <alpha-value>)` pattern so opacity modifiers keep working:

```js
colors: {
  surface: 'rgb(var(--surface) / <alpha-value>)',
  'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
  ink: 'rgb(var(--ink) / <alpha-value>)',
  'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
  line: 'rgb(var(--line) / <alpha-value>)',
  accent: 'rgb(var(--accent) / <alpha-value>)',
}
```

Every component writes `bg-surface text-ink border-line` once — no `dark:` variant duplication anywhere. Toggling is a single class swap on `<html>`. Existing `primary-*`, `success`, `warning`, `danger` Tailwind colors stay defined as-is (still used for semantic states like positive/negative transaction amounts); only call sites that currently hardcode `bg-white`, `bg-gray-50`, `bg-gray-100`, `text-gray-900`, `text-gray-700`, `text-gray-500`, `border-gray-200`, `border-gray-300`, and `bg-primary-*`/`hover:bg-primary-*` on buttons get remapped to the new semantic tokens (buttons move to `bg-accent`/`hover:bg-accent` equivalents so primary actions pick up the emerald brand color in dark mode and the existing blue in light mode).

`index.css` component classes (`.card`, `.btn-primary`, `.btn-secondary`) are rewritten against the new tokens:

```css
@layer base {
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
    @apply bg-surface-2 hover:bg-line text-ink px-4 py-2 rounded-lg font-medium transition-colors;
  }
}
```

## Grid background

A `.app-grid-bg` class defined in `index.css`, applied once to the authenticated-app shell (the element wrapping `Sidebar` + `Header` + routed page content):

```css
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
```

40px grid spacing (medium), 1px hairlines, low-opacity emerald glow anchored top-center. Static, no animation, no `prefers-reduced-motion` concerns. `pointer-events: none` and negative `z-index` keep it purely decorative and non-interactive.

## Theme toggle

New files, mirroring the existing `AuthContext` split (context object separated for Fast Refresh compatibility):

- `frontend/src/contexts/theme-context.ts` — the context object + `Theme = 'dark' | 'light'` type.
- `frontend/src/contexts/ThemeContext.tsx` — `ThemeProvider`: on mount, reads `localStorage` key `chronosfin_theme` (added to `frontend/src/config/api.config.ts`, alongside the existing token-storage key); defaults to `'dark'` if unset. Applies/removes the `.light` class on `document.documentElement` as a side effect whenever theme state changes. Exposes `theme` and `toggleTheme`.
- `frontend/src/hooks/useTheme.ts` — thin hook reading the context, same pattern as `useAuth`.

`App.tsx` wraps the entire `<Routes>` tree in `<ThemeProvider>`, at the same level as `<AuthProvider>` — Login/Register are in scope for this redesign too, so the theme (and its toggle) must be active before authentication, not just inside the protected app shell.

`Header.tsx` gets a sun/moon icon button (`SunIcon`/`MoonIcon` from `@heroicons/react/24/outline`, consistent with existing icon usage) placed left of the notification bell, calling `toggleTheme()`.

## Rollout

Files to convert from hardcoded light classes to semantic tokens (structure/JSX unchanged, only className color values change):

- `frontend/src/index.css` (base styles, `.card`, `.btn-primary`, `.btn-secondary`)
- `frontend/tailwind.config.js` (color token mapping, `darkMode: 'class'`)
- `frontend/src/components/common/Sidebar.tsx`
- `frontend/src/components/common/Header.tsx` (plus the new toggle button)
- `frontend/src/pages/Dashboard.tsx`, `Accounts.tsx`, `Transactions.tsx`, `Goals.tsx`, `Settings.tsx`, `Login.tsx`, `Register.tsx`
- `frontend/src/components/accounts/*`, `components/goals/*`, `components/transactions/*`, `components/dashboard/*` (including `StatCard`)
- New: `frontend/src/contexts/theme-context.ts`, `frontend/src/contexts/ThemeContext.tsx`, `frontend/src/hooks/useTheme.ts`
- `frontend/src/App.tsx` (wrap with `ThemeProvider`, add `.app-grid-bg` container to the authenticated shell)

## Testing / verification

No frontend test suite exists in this repo (per `CLAUDE.md`). Verification is `npm run build:frontend` and `npm run lint:frontend` passing. Visual correctness (contrast, the grid background reading as "slick," toggle behavior) cannot be verified by Claude directly — no browser tool is available this session — so the plan will end with an explicit ask for the user to review in-browser before merging.
