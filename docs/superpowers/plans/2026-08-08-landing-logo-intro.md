# Landing Page Logo Intro Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `<img>` logo in the landing page header with an inlined, self-animating version that plays a short, non-blocking "assemble" animation once per browser session, then settles into looking identical to today's static logo.

**Architecture:** A new `AnimatedLogoMark` component inlines the logo's dial geometry and wordmark as two small `<svg>` elements (split from the source `760×220` file via `viewBox` windowing, no coordinate math on the actual paths — see Task 1), wrapped in a `<span>` that conditionally carries a `logo-mark--animate` class based on a `sessionStorage` flag. All motion is plain CSS `@keyframes` on individual `path`/`circle`/`g` elements — no JavaScript animation library, no completion callbacks, nothing gated on the animation finishing.

**Tech Stack:** React (existing), plain CSS in `frontend/src/pages/Landing.css` (existing file, no new stylesheet). No new npm dependency.

**Reference:** `docs/superpowers/specs/2026-08-08-landing-logo-intro-design.md` (approved design, revision 2).

**Note on one deviation from the spec's animation table:** the spec's row for the "outer dashed ring" describes a `stroke-dashoffset` draw-in. That ring's SVG source (`stroke-dasharray="2 9"`) is already a dotted pattern, not a solid line — the standard dashoffset "draw a line from nothing" trick only works for solid strokes; applied to an already-dotted stroke, a CSS override would either silently overwrite the dot pattern (if it also sets `stroke-dasharray`) or, if it leaves `stroke-dasharray` alone, `stroke-dashoffset` only rotates which point of the repeating dot pattern the ring starts at — it can't hide/reveal it. Task 2 below animates the ring with a small `rotate()` instead (matching the hand's mechanism), which is achievable, doesn't corrupt the dot pattern, and still reads as "the ring settles into place" early in the sequence. Everything else in the spec's table is implemented as written.

---

### Task 1: `AnimatedLogoMark` component, static (no animation yet)

Builds and wires up the component with its final visual layout only. After this task, the page should look pixel-for-pixel like it does today — this isolates "is the geometry/markup correct" from "does the animation work," so a mistake in one doesn't mask a mistake in the other.

**Files:**
- Create: `frontend/src/components/landing/AnimatedLogoMark.tsx`
- Modify: `frontend/src/pages/Landing.tsx:1-9`
- Modify: `frontend/src/pages/Landing.css:137-146`

- [ ] **Step 1: Create the component**

`frontend/src/components/landing/AnimatedLogoMark.tsx`:

```tsx
import { useState } from 'react';

const SEEN_KEY = 'chronosfin:logoIntroSeen';

function hasPlayedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false; // storage unavailable (e.g. private-mode edge cases) → play, harmlessly
  }
}

const AnimatedLogoMark = () => {
  const [animate] = useState(() => {
    const seen = hasPlayedThisSession();
    if (!seen) {
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* replaying once more next load in this session is harmless */
      }
    }
    return !seen;
  });

  return (
    <span className={`logo-mark${animate ? ' logo-mark--animate' : ''}`}>
      <svg viewBox="18 18 184 184" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="dial" x1="28" y1="24" x2="178" y2="190" gradientUnits="userSpaceOnUse">
            <stop stopColor="#263A70" />
            <stop offset="1" stopColor="#14234B" />
          </linearGradient>
          <linearGradient id="spark" x1="73" y1="156" x2="143" y2="63" gradientUnits="userSpaceOnUse">
            <stop stopColor="#65E6B4" />
            <stop offset="1" stopColor="#A8F5D5" />
          </linearGradient>
        </defs>
        <g className="lm-wrap" transform="translate(18 18)">
          <circle cx="92" cy="92" r="84" fill="url(#dial)" />
          <circle className="lm-ring" cx="92" cy="92" r="71" stroke="#6173A8" strokeOpacity=".45" strokeWidth="2" strokeDasharray="2 9" />
          <path className="lm-hand" d="M92 92V48M92 92L124 112" stroke="#DDE7FF" strokeWidth="7" strokeLinecap="round" />
          <circle className="lm-dot" cx="92" cy="92" r="7" fill="#65E6B4" />
          <path className="lm-chart" d="M43 142L70 116L91 127L139 73" stroke="url(#spark)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <path className="lm-arrow" d="M121 73H139V91" stroke="#A8F5D5" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <path className="lm-tick-1" d="M92 8V18" stroke="#A8F5D5" strokeWidth="5" strokeLinecap="round" opacity=".9" />
          <path className="lm-tick-2" d="M176 92H166" stroke="#A8F5D5" strokeWidth="5" strokeLinecap="round" opacity=".9" />
          <path className="lm-tick-3" d="M92 176V166" stroke="#A8F5D5" strokeWidth="5" strokeLinecap="round" opacity=".9" />
          <path className="lm-tick-4" d="M8 92H18" stroke="#A8F5D5" strokeWidth="5" strokeLinecap="round" opacity=".9" />
        </g>
      </svg>
      <svg viewBox="224 0 536 220" role="img" aria-hidden="true">
        <g transform="translate(224 0)">
          <text x="0" y="126" fill="#14234B" fontFamily="Inter, Arial, sans-serif" fontSize="76" fontWeight="700" letterSpacing="-3">Chronos</text>
          <text x="284" y="126" fill="#2DBD8B" fontFamily="Inter, Arial, sans-serif" fontSize="76" fontWeight="700" letterSpacing="-3">Fin</text>
          <path d="M4 150H402" stroke="#D7E1F4" strokeWidth="3" />
          <text x="4" y="181" fill="#6173A8" fontFamily="Inter, Arial, sans-serif" fontSize="16" fontWeight="600" letterSpacing="4">TIME WELL SPENT</text>
        </g>
      </svg>
    </span>
  );
};

export default AnimatedLogoMark;
```

The two `viewBox` values are windows into the *original, untranslated* coordinate system of `frontend/public/chronosfin-logo.svg` (`760×220`), not new geometry:
- Dial: source content sits inside `<g transform="translate(18 18)">` with a pre-translate bounding box of `x:[8,176] y:[8,176]` (the `r=84` circle at `cx=92 cy=92`, confirmed against the source file — the tick marks touch exactly at the circle's bounding edges). After the `translate(18 18)` (kept unchanged, copied verbatim above), that content sits at absolute `x:[26,194] y:[26,194]`. `viewBox="18 18 184 184"` windows exactly `[18,202]` on each axis — an 8px margin on all four sides around the dial, centered. No child coordinate was recalculated to get this; only the outer `viewBox` attribute changes.
- Wordmark: source content sits inside `<g transform="translate(224 0)">`, also kept unchanged. `viewBox="224 0 536 220"` (`760-224=536` wide, full `220` height) windows exactly the region the wordmark already occupies in the original file — again, no child coordinate recalculated.

- [ ] **Step 2: Wire the component into `Landing.tsx`**

In `frontend/src/pages/Landing.tsx`, add the import at the top (after the existing `import './Landing.css';`):

```tsx
import { Link } from 'react-router-dom';
import AnimatedLogoMark from '../components/landing/AnimatedLogoMark';
import './Landing.css';
```

Replace line 9 (`<img src="/chronosfin-logo.svg" alt="ChronosFin" />`) with:

```tsx
<AnimatedLogoMark />
```

- [ ] **Step 3: Replace the old logo CSS rule**

In `frontend/src/pages/Landing.css`, replace lines 142-146:

```css
.landing-page .wordmark img {
  height: 34px;
  width: auto;
  display: block;
}
```

with:

```css
.landing-page .logo-mark {
  display: flex;
  align-items: center;
  gap: 5px;
}
.landing-page .logo-mark svg {
  height: 34px;
  width: auto;
  display: block;
}
```

(Lines 137-141, the `.landing-page .wordmark` rule itself, are unchanged — it still wraps the new `<span className="logo-mark">` the same way it wrapped the old `<img>`.)

- [ ] **Step 4: Verify**

Run:
```bash
cd frontend && npm run build && npm run lint
```
Expected: both clean, no TypeScript or ESLint errors.

Then:
```bash
npm run dev
```
Open `http://localhost:5173/` in a browser. Confirm:
- The header logo looks the same as it did before this change — dial icon on the left, "ChronosFin" wordmark + "TIME WELL SPENT" tagline on the right, same overall size (~34px tall) and spacing as the previous static image.
- No console errors.
- Open devtools → Application → Session Storage → `http://localhost:5173`: confirm a `chronosfin:logoIntroSeen` key exists with value `1`. Reload the page: the key persists (it was already set), and the logo still renders correctly.

Nothing should visibly animate yet — the `logo-mark--animate` class exists on first load, but no CSS keyframes reference it until Task 2.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/AnimatedLogoMark.tsx frontend/src/pages/Landing.tsx frontend/src/pages/Landing.css
git commit -m "Inline landing page logo as AnimatedLogoMark component

No behavior change yet - static layout only, matches the previous
flat <img> pixel-for-pixel. Animation CSS lands in the next commit."
```

---

### Task 2: Animation CSS + reduced motion

**Files:**
- Modify: `frontend/src/pages/Landing.css` (append new section after the block added in Task 1)

- [ ] **Step 1: Append the animation styles**

Add this new section to the end of `frontend/src/pages/Landing.css`:

```css
/* ---------- logo mark intro animation ---------- */

.landing-page .logo-mark .lm-chart,
.landing-page .logo-mark .lm-arrow {
  stroke-dasharray: 1000;
  stroke-dashoffset: 0;
}

.landing-page .logo-mark svg * {
  transform-box: view-box;
}

@keyframes lm-wrap-in {
  from { opacity: 0; transform: scale(.92); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes lm-tick-in {
  from { transform: scale(0); }
  to { transform: scale(1); }
}
@keyframes lm-ring-in {
  from { opacity: 0; transform: rotate(-25deg); }
  to { opacity: 1; transform: rotate(0deg); }
}
@keyframes lm-draw {
  from { stroke-dashoffset: 1000; }
  to { stroke-dashoffset: 0; }
}
@keyframes lm-hand-in {
  from { transform: rotate(-46deg); }
  to { transform: rotate(0deg); }
}
@keyframes lm-dot-in {
  0% { transform: scale(0); }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.landing-page .logo-mark--animate .lm-wrap {
  animation: lm-wrap-in 120ms cubic-bezier(.16,1,.3,1) both;
}
.landing-page .logo-mark--animate .lm-tick-1 {
  animation: lm-tick-in 160ms ease-out both;
  animation-delay: 0ms;
  transform-origin: 92px 13px;
}
.landing-page .logo-mark--animate .lm-tick-2 {
  animation: lm-tick-in 160ms ease-out both;
  animation-delay: 40ms;
  transform-origin: 171px 92px;
}
.landing-page .logo-mark--animate .lm-tick-3 {
  animation: lm-tick-in 160ms ease-out both;
  animation-delay: 80ms;
  transform-origin: 92px 171px;
}
.landing-page .logo-mark--animate .lm-tick-4 {
  animation: lm-tick-in 160ms ease-out both;
  animation-delay: 120ms;
  transform-origin: 13px 92px;
}
.landing-page .logo-mark--animate .lm-ring {
  animation: lm-ring-in 300ms cubic-bezier(.65,0,.35,1) both;
  animation-delay: 80ms;
  transform-origin: 92px 92px;
}
.landing-page .logo-mark--animate .lm-hand {
  animation: lm-hand-in 300ms cubic-bezier(.34,1.56,.64,1) both;
  animation-delay: 200ms;
  transform-origin: 92px 92px;
}
.landing-page .logo-mark--animate .lm-dot {
  animation: lm-dot-in 140ms ease-out both;
  animation-delay: 480ms;
  transform-origin: 92px 92px;
}
.landing-page .logo-mark--animate .lm-chart {
  animation: lm-draw 240ms cubic-bezier(.65,0,.35,1) both;
  animation-delay: 380ms;
}
.landing-page .logo-mark--animate .lm-arrow {
  animation: lm-draw 80ms linear both;
  animation-delay: 620ms;
}

@media (prefers-reduced-motion: reduce) {
  .landing-page .logo-mark--animate * {
    animation: none !important;
  }
}
```

Notes on why this is safe by construction:
- `.lm-chart`/`.lm-arrow` get `stroke-dasharray: 1000` unconditionally (not just under `--animate`). `1000` comfortably exceeds both paths' real lengths (chart line ≈133 units, arrowhead ≈36 units, computed from their `d` coordinates), which is the standard SVG "draw-in" technique — a dash longer than the path, offset by the same amount, renders as fully hidden at `dashoffset: 1000` and fully solid at `dashoffset: 0`, with no visible seam either way. Because it's unconditional, the *default* (non-animating) render also has `dashoffset: 0` from the base rule above, i.e. a normal solid stroke — identical to today's static image — with zero dependency on the `--animate` class.
- The ring intentionally does **not** get a `stroke-dasharray` override (see the plan's opening note) — its existing `stroke-dasharray="2 9"` inline attribute is left alone, and it animates via `rotate()` instead of `dashoffset`.
- Every animated rule uses `both` fill mode, so elements sit at their `from` state before their delay elapses and hold their `to` state after finishing — no flash of unstyled/wrong position at any point in the sequence.
- `transform-box: view-box` is set explicitly (not left to the browser default) so `transform-origin` values are unambiguously interpreted in the same coordinate system as each element's own `d`/`cx`/`cy` attributes.

- [ ] **Step 2: Verify the animation plays once per session**

With the dev server still running, open devtools → Application → Session Storage, delete the `chronosfin:logoIntroSeen` key, then reload `http://localhost:5173/`. Confirm:
- Ticks pop in with a visible stagger.
- The dashed ring rotates into place.
- The hand sweeps to its resting position with a slight overshoot/snap.
- The center dot pops in as the hand lands.
- The chart line draws itself, followed immediately by the arrowhead.
- The whole sequence finishes in well under a second and the end state matches Task 1's static appearance exactly.

Reload again (without clearing session storage): the logo should appear immediately in its final state, no animation.

If any element visibly rotates or scales around the wrong point, adjust that element's `transform-origin` value in the CSS above and re-check — the values given are computed from the source path coordinates but a final visual check against the actual rendered SVG is the authoritative check.

- [ ] **Step 3: Verify reduced motion**

In Chrome/Edge devtools: Cmd+Shift+P (or Ctrl+Shift+P) → run "Show Rendering" → in the Rendering tab, set "Emulate CSS media feature `prefers-reduced-motion`" to `reduce`. Clear the `chronosfin:logoIntroSeen` session storage key and reload. Confirm the logo appears immediately in its fully-settled state with no motion at all — no ticks popping, no rotation, no draw-in. Turn the emulation back off afterward.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Landing.css
git commit -m "Animate AnimatedLogoMark's dial on first visit per session

CSS-only keyframes; respects prefers-reduced-motion by disabling all
animation via a plain media query, no JS branch."
```

---

### Task 3: Final verification pass

**Files:** none (verification only; fix forward in the relevant file from Task 1/2 if something is found)

- [ ] **Step 1: Build and lint**

```bash
cd frontend && npm run build && npm run lint
```
Expected: both clean.

- [ ] **Step 2: Mobile width check**

With the dev server running, use browser devtools' device toolbar to set the viewport to ~360px wide. Confirm the header (logo + nav links) doesn't overflow horizontally or wrap in a broken way. This is pre-existing header layout, not something this change should affect, but confirm no regression.

- [ ] **Step 3: Dark mode check (regression-only, not a fix)**

In devtools → Rendering tab → "Emulate CSS media feature prefers-color-scheme" → set to `dark`. Reload the page. Confirm the logo looks the same as it does today under dark mode — i.e., confirm this change hasn't made anything *worse*. (The existing low-contrast "Chronos" navy text against the dark background is a known, pre-existing condition — see the design spec's "Dark mode note" — and is explicitly out of scope here.) Turn the emulation back off afterward.

- [ ] **Step 4: `sessionStorage`-unavailable fallback check**

Open a new private/incognito window (Safari's "Private Browsing" is the strictest — it throws on `sessionStorage` access on some versions/settings; Chrome/Firefox incognito generally allow it, so Safari Private Browsing is the more useful check if available) and load `http://localhost:5173/`. Confirm:
- The logo still renders (either animated or static — either is acceptable per the spec's fallback behavior).
- No thrown error / red console error about `sessionStorage`.

This exercises the `try/catch` in `hasPlayedThisSession()`/the `setItem` call in `AnimatedLogoMark.tsx` (Task 1, Step 1).

- [ ] **Step 5: Fix forward if anything failed**

If Steps 1-3 surfaced an issue, fix it in the relevant file from Task 1 or 2, re-run the affected verification step, then commit:

```bash
git add frontend/src/components/landing/AnimatedLogoMark.tsx frontend/src/pages/Landing.css
git commit -m "Fix up landing logo animation after verification pass"
```

If nothing needed fixing, no commit for this task — it was verification-only.
