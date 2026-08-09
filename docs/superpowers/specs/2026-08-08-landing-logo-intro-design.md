# Landing Page Logo Intro Animation — Design Spec

## Context

Revision 2. The original version of this spec proposed a full-screen, session-once splash overlay (Framer Motion, ~1.3s, blocking) built around the ChronosFin logo's dial imagery. On review it was rejected on both product and technical grounds: a mandatory splash delays the landing page's actual job (stating the value proposition) for branding, which contradicts the page's own plainspoken positioning; and the technical spec had a backwards clip-path reveal, an unworkable reuse of the flat logo's `760×220` viewBox, geometry that didn't support the claimed per-tick stagger, unfounded spring-timing guarantees, an unsafe completion-callback-only lifecycle, and no accessibility treatment for the overlay (`aria-hidden`, `inert`, scroll lock). Full detail in the PR/conversation history, not reproduced here.

This revision replaces the blocking overlay with a small, non-blocking entrance animation on the logo mark that already sits in the page header (`frontend/src/pages/Landing.tsx`, currently a static `<img src="/chronosfin-logo.svg">`). The page is interactive immediately; only the icon animates in place. No new dependency — plain CSS keyframes on an inlined SVG, replacing the Framer Motion approach entirely.

## Source geometry (verified against `frontend/public/chronosfin-logo.svg`)

The dial icon is a self-contained group, independent of the wordmark:

```xml
<g transform="translate(18 18)">
  <circle cx="92" cy="92" r="84" fill="url(#dial)"/>
  <circle cx="92" cy="92" r="71" stroke="#6173A8" stroke-opacity=".45" stroke-width="2" stroke-dasharray="2 9"/>
  <path d="M92 92V48M92 92L124 112" stroke="#DDE7FF" stroke-width="7" stroke-linecap="round"/>
  <circle cx="92" cy="92" r="7" fill="#65E6B4"/>
  <path d="M43 142L70 116L91 127L139 73" stroke="url(#spark)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M121 73H139V91" stroke="#A8F5D5" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M92 8V18M176 92H166M92 176V166M8 92H18" stroke="#A8F5D5" stroke-width="5" stroke-linecap="round" opacity=".9"/>
</g>
```

Pre-translate, this content's bounding box is `x:[8,176] y:[8,176]` (the outer `r=84` circle at center `(92,92)`, and the tick marks sit exactly on that circle's bounding edges). Dropping the outer `translate(18 18)` and defining a standalone `viewBox="0 0 184 184"` reproduces the same group with 8px padding on every side and the dial centered at `(92,92)` — the exact center of the new viewBox. No coordinates need to be recomputed; every path/circle `d`/`cx`/`cy` above is reused verbatim. This is a **separate inline component from the wordmark** — the wordmark (`Chronos` / `Fin` text, at `translate(224 0)` in the original file) is left completely alone, unanimated, same markup and colors as today.

The header currently renders the full flat SVG at `height: 34px` (`Landing.css` `.wordmark img`). The new inline component reproduces that: dial at the same final display size, wordmark immediately to its right, unchanged. At this scale the animation is necessarily subtle — a brief "assemble" flourish on the mark itself, not a showpiece. That's intentional, not a limitation to work around: it matches the "non-blocking, doesn't dominate" direction this revision commits to.

**Dark mode note (pre-existing, out of scope):** `Landing.css` switches `--bg` to `#0d1117` under `prefers-color-scheme: dark` / `[data-theme="dark"]`, and the wordmark's navy `#14234B` "Chronos" text has no dark-mode variant today — an existing low-contrast condition in production, unrelated to this change. The inlined dial reuses the exact same hardcoded colors (`#263A70`→`#14234B` gradient, `#A8F5D5` ticks, spark-green accent) as the current static image, so this change doesn't newly introduce or fix that condition either way. Not addressed here.

## Component

New file `frontend/src/components/landing/AnimatedLogoMark.tsx`, replacing the `<img>` inside `Landing.tsx`'s `.wordmark` link:

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
      <svg viewBox="0 0 184 184" width="34" height="34" aria-hidden="true">
        {/* dial paths/circles, unchanged coordinates, see geometry above */}
      </svg>
      {/* existing wordmark markup, unchanged */}
    </span>
  );
};

export default AnimatedLogoMark;
```

Deliberately has **no completion tracking, no timeout, no exit animation, no `AnimatePresence`-equivalent**. Nothing on the page is gated on the animation finishing — it's decorative chrome layered on an element that's already fully rendered and interactive (the `Link` wrapping it is clickable from frame one). If the CSS animation is somehow malformed, the worst case is the icon sitting at its `from` or `to` keyframe state, both of which are ordinary-looking static renders of the same logo — never a blocking or broken state. This is what makes skipping a fail-safe timeout defensible here, unlike the rejected overlay version: there is no "stuck" state possible because there is nothing being withheld.

`sessionStorage.setItem` fires immediately on first mount rather than on animation-complete, since there's no lifecycle event to hang it off of and no correctness reason to wait — worst case of a mismatch (e.g. component unmounts mid-animation for some unrelated reason) is the animation replaying once more next load, not a broken state.

## Animation (CSS keyframes, deterministic timing — no spring physics)

All durations/delays below are explicit CSS values, not estimates; nothing depends on physics-based settle time. Total runtime ≈700ms.

| Delay → End (ms) | Element | Keyframe |
|---|---|---|
| 0 → 120 | Whole mark (wrapper) | `opacity 0→1`, `scale .92→1`, `ease: cubic-bezier(.16,1,.3,1)` |
| 0/40/80/120 → +160 each | 4 tick marks (split into 4 separate `<path>` elements — the source's single multi-subpath `<path d="M92 8V18M176 92H166M92 176V166M8 92H18">` is broken into four: `M92 8V18`, `M176 92H166`, `M92 176V166`, `M8 92H18`, each keeping the original `stroke`/`stroke-width`/`opacity`) | `scale 0→1` per tick, staggered 40ms apart, `ease-out` |
| 80 → 380 | Outer dashed ring | `stroke-dashoffset` full→0 (dasharray = ring circumference), `ease: cubic-bezier(.65,0,.35,1)` |
| 200 → 500 | Hand (single `<path>`, both segments — already one rigid element in the source, kept that way) | `transform: rotate(-46deg) → rotate(0deg)`, explicit `transform-origin: 92px 92px` (the dial's actual center, not the path's bounding-box default), `ease: cubic-bezier(.34,1.56,.64,1)` — a standard deterministic "back-out" curve that produces the overshoot/snap feel without spring physics, so the 300ms window is guaranteed, not probabilistic |
| 480 → 620 | Center dot | `scale 0→1.2→1`, timed to land just after the hand |
| 380 → 620 | Chart line (`<path d="M43 142L70 116L91 127L139 73">`) | `stroke-dashoffset` full→0 |
| 620 → 700 | Arrowhead (separate `<path d="M121 73H139V91">`, animated in its own step rather than lumped with the chart line) | `stroke-dashoffset` full→0, starts as the chart line finishes |

## Reduced motion

A single `@media (prefers-reduced-motion: reduce)` block sets `.logo-mark--animate * { animation: none !important; }`. This is the entire mechanism — no JS branch, no `matchMedia` check, no behavioral difference in the React component. The browser enforces it at the stylesheet level, so it's correct even if the component's own logic has a bug, and nothing about page availability is affected either way (the page was never gated on this animation to begin with, on any code path).

## Accessibility

The dial `<svg>` is `aria-hidden="true"` (decorative, same as it is implicitly today as a plain `<img>` with the parent link's `aria-label="ChronosFin home"` carrying the accessible name). Beyond that, none of the concerns that applied to the rejected overlay design apply here: nothing is visually hidden behind anything, no focus trap, no scroll lock, no `inert` needed — the underlying page was never covered in the first place. This is a direct consequence of dropping the full-screen-gate approach, not a separate fix.

## Testing (manual — frontend has no automated test suite per project convention)

- Fresh session, first load of `/`: dial assembles once, page fully usable throughout (scroll, click nav links, etc. during the ~700ms).
- Reload within the same session: logo renders in its final state immediately, no animation classes applied.
- OS-level "reduce motion" enabled: logo renders in its final state immediately (no keyframe motion), independent of the session flag.
- `sessionStorage` disabled/unavailable (private-mode edge case): animation still plays (falls back to "not seen"), no thrown error.
- `cd frontend && npm run build && npm run lint` clean.
- No console errors/warnings.
