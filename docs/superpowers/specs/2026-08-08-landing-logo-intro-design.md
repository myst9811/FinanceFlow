# Landing Page Logo Intro Animation — Design Spec

## Context

The landing page (`frontend/src/pages/Landing.tsx`) currently renders the ChronosFin logo as a static `<img src="/chronosfin-logo.svg">` in the header, with no entrance treatment. This adds a one-time, full-screen intro animation built around the logo's own clock-dial/rising-chart imagery, played once per browser session on first arrival at `/`, then wiped away to reveal the page underneath.

Style direction (chosen over "bold/energetic" and "minimal/elegant" alternatives): precision/mechanical — the dial hand sweeps into place, the chart line draws itself stroke-by-stroke, tick marks snap in. This reads as engineered/deliberate rather than flashy, consistent with the page's existing "no dashboards trying to be clever," rule-not-a-guess brand voice, while still being visually striking.

Explicitly out of scope: animating the in-header logo itself post-reveal, animating the rest of the hero section (heading/ledger mockup/buttons), and a skip button — this is a self-contained splash that plays once and gets out of the way.

## Dependency

Add `framer-motion` to `frontend/package.json`. Chosen over a pure-CSS/inline-SVG approach specifically to get Framer Motion's declarative sequencing (`variants`, staggered children, spring transitions) for a multi-step timeline, rather than hand-rolling keyframe delays in CSS.

Framer Motion APIs this design relies on, all part of its stable public API:
- `motion.svg` / `motion.path` / `motion.circle` / `motion.div` — animatable primitives that accept `initial`/`animate`/`variants`/`transition` props.
- `pathLength` — an animatable prop on `motion.path`/`motion.circle` (0 → 1) that drives `stroke-dasharray`/`stroke-dashoffset` internally, used for the ring and chart-line draw-in.
- `useReducedMotion()` — a hook returning `true` when the OS-level `prefers-reduced-motion: reduce` is set.
- Direct animation between two `clipPath` string values (e.g. `circle(0% at 50% 50%)` → `circle(150% at 50% 50%)`) — Framer Motion interpolates structurally-similar CSS value strings, which covers this case since only the percentage differs.

## Component: `LandingIntro`

New file `frontend/src/components/landing/LandingIntro.tsx`, mounted as the first child inside `Landing.tsx`'s top-level `<div className="landing-page">`. It renders nothing (`null`) once the intro has already played this session, so the file is a no-op after first mount without needing a separate feature-flag check anywhere else in the page.

```tsx
import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const SEEN_KEY = 'chronosfin:landingIntroSeen';

const LandingIntro = () => {
  const [playing, setPlaying] = useState(() => sessionStorage.getItem(SEEN_KEY) !== '1');
  const reducedMotion = useReducedMotion();

  const handleComplete = () => {
    sessionStorage.setItem(SEEN_KEY, '1');
    setPlaying(false);
  };

  return (
    <AnimatePresence>
      {playing && (
        <motion.div
          className="landing-intro"
          onAnimationComplete={handleComplete}
          /* reduced-motion path: skip straight to a short fade, same onAnimationComplete */
        >
          {/* dial + chart SVG, wordmark — see sequence below */}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LandingIntro;
```

Key structural decisions:
- **Lazy `useState` initializer** reads `sessionStorage` synchronously during the first render (before paint), so there is no frame where the page flashes visible before the overlay mounts on top of it.
- **The real page (`Landing.tsx`'s header/hero/etc.) mounts immediately regardless**, underneath the overlay — the overlay is `position: fixed; inset: 0; z-index: 50` with an opaque background, not a router-level gate. This keeps the component fully isolated: no coordination needed with the rest of the page, and if `LandingIntro` were deleted entirely, the page behaves exactly as it does today.
- **`reducedMotion`** short-circuits the sequence to a single ~200ms opacity fade (same overlay, same `handleComplete` callback, no motion/transform/draw-in), rather than skipping the overlay entirely — this keeps the "hide page until ready" and session-flag logic identical on both paths, minimizing branching.

## Animation sequence (~1.3s total)

The dial, ring, hand, ticks, and chart line are the same path geometry as `public/chronosfin-logo.svg`, inlined directly as JSX (`<motion.circle>`, `<motion.path>`) instead of referencing the flat image — this is what makes individual pieces independently animatable. The flat `<img>` in the header is untouched.

| Time (ms) | Element | Motion |
|---|---|---|
| 0–150 | Backdrop | Opacity 0→1, solid `#14234B` (the dial's own gradient base color) |
| 0–150 | 4 tick marks | Staggered scale-spring, 0→1, ~30ms stagger between each |
| 100–400 | Outer dashed ring | `pathLength` 0→1 |
| 250–550 | Clock hand | `rotate` from a starting offset to resting position, spring with slight overshoot (`type: 'spring', bounce: 0.25`) |
| ~550 | Center dot | Scale-spring pop, timed to the hand landing |
| 550–900 | Rising chart line (accent green) | `pathLength` 0→1 |
| 850–1050 | "ChronosFin" wordmark + tagline | Opacity 0→1 with a small upward `y` translate |
| 1050–1300 | Reveal | `clipPath` animates `circle(0% at <dial-center>)` → `circle(150% at <dial-center>)`, exposing the real page underneath; overlay unmounts via `AnimatePresence`'s exit on `handleComplete` |

All motion values are defined once as a `variants` object on the root `motion.div`, with children referencing named variant keys — standard Framer Motion orchestration, not manually chained `setTimeout`s.

## Responsiveness

The inlined SVG uses the same `viewBox` as the source logo and scales via CSS (`width: min(60vw, 280px)` or similar, centered) so it renders proportionally from small phone widths up. The wordmark/tagline text scales down or is omitted below a small breakpoint (~360px) if it doesn't fit legibly at that size — final sizing is a visual judgment call made during implementation, not pinned to exact pixel values here.

## Error handling / edge cases

- **`sessionStorage` unavailable** (private browsing edge cases in some older browsers, or disabled storage): wrap the `getItem`/`setItem` calls in a try/catch; if either throws, treat it as "not seen" for `getItem` (intro plays) and silently ignore the write failure for `setItem` (intro will simply replay on the next load in that session — a harmless degradation, not a broken page).
- **Framer Motion fails to animate for any reason**: `onAnimationComplete` is Framer Motion's own completion callback, guaranteed to fire when the defined animation finishes; there's no separate manually-tracked timer to drift out of sync with it. Worst case if a transition is malformed is a console warning from Framer Motion in dev, not a stuck overlay, since `AnimatePresence` exit is still driven by the `playing` state flip.
- **No JS / animation library fails to load at build time**: this is a client-rendered SPA already (no SSR) — if the bundle fails to load at all, nothing on the page renders, which is an existing, unrelated failure mode, not something this feature introduces.

## Testing (manual — frontend has no automated test suite per project convention)

- First load of `/` in a fresh session (private window): full sequence plays, ends with the normal landing page visible and interactive.
- Reload / re-navigate to `/` within the same session: intro is skipped, page appears immediately.
- OS-level "reduce motion" enabled: short fade only, no draw-in/rotation.
- Resize to a small mobile viewport during/after the intro: no horizontal scroll, wordmark stays legible or is appropriately hidden.
- `cd frontend && npm run build && npm run lint` clean.
- No console errors/warnings during the sequence.
