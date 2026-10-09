# Motion

Motion in Pardal Digital confirms that something happened. It never performs. Users run dozens of searches per session, so the
interface has to feel instant. Every animation must pass one test: would the UI feel _worse_ without it? If not, remove it.

## Tokens

| Token                | Class                             | Value | Use                                          |
| -------------------- | --------------------------------- | ----- | -------------------------------------------- |
| `--duration-instant` | `duration-instant`                | 80ms  | Press feedback, icon color swaps             |
| `--duration-fast`    | `duration-fast`                   | 120ms | Hover, focus, buttons, inputs, row highlight |
| `--duration-base`    | `duration-base`                   | 180ms | Popover, dropdown, tooltip, accordion        |
| `--duration-slow`    | `duration-slow`                   | 280ms | Sheet, dialog, mobile sidebar                |
| default              | `transition`, `transition-colors` | 160ms | Used when no duration class is given         |

| Easing     | Class             | Curve                         | Use                                                    |
| ---------- | ----------------- | ----------------------------- | ------------------------------------------------------ |
| Standard   | `ease-standard`   | `cubic-bezier(.2, 0, 0, 1)`   | Default for everything that changes state              |
| Emphasized | `ease-emphasized` | `cubic-bezier(.16, 1, .3, 1)` | Things entering: popovers, sheets                      |
| Exit       | `ease-exit`       | `cubic-bezier(.4, 0, 1, 1)`   | Things leaving. Make exits ~25% shorter than entrances |

## Rules

1. **Animate only `color`, `background-color`, `border-color`, `box-shadow`, `opacity`, `transform`/`scale`.** Never width, height, top or left (the sidebar collapse is the one exception, to be moved to `transform`).
2. **List the properties explicitly** (`transition-colors`, `transition-[background-color,border-color,scale]`). Avoid `transition-all`.
3. **Press feedback is `scale-[0.98]`**, active only, and never on disabled elements (`enabled:active:`).
4. **No entrance animation for data.** Search results, table rows and cards appear at once. Staggered fade-ins make fast data look slow.
5. **Overlays move 4–8px at most**, fade and translate together, and use the `tw-animate-css` classes already in the shadcn primitives.
6. **No bounce, no overshoot, no infinite loops**, except `animate-spin` on a real in-flight request and `animate-pulse` on skeletons.
7. **Interruptible.** Hover-out must reverse from the current state. That works automatically with CSS transitions. Keyframes on hover do not.

## Exception: marketing landing

The public landing (`artifacts/licitainsight/src/features/landing/`) is a brand surface, not a work surface, so it may perform. Only there:

- **Scroll-driven 3D pardal** (`pardal-flight-3d.tsx`): extruded from `public/brand/pardal-silhueta.svg`, flies in the side gutters and
  crosses in the gap between sections. It renders on demand (scroll, resize, theme), never in an idle loop, and only from 1360px wide,
  where the gutters fit it without covering text.
- **Pre-rendered clips that play once** (`pardal-clip.tsx`): HyperFrames compositions in `artifacts/licitainsight/motion/`, rendered by
  `pnpm --filter @workspace/licitainsight run motion:render` into `public/motion/` (WebM with alpha for Chrome/Firefox, HEVC with alpha
  for Safari, PNG of the last frame). They start when scrolled into view and stop on the last frame.

Still forbidden on the landing: animating live data (index facts, tender preview), new infinite loops (the radar globe is the only
one), and any motion under reduced motion. With reduced motion the bird is drawn once next to the hero and the clips show only their
last frame.

## Reduced motion

`index.css` has a global `@media (prefers-reduced-motion: reduce)` rule that shortens every animation and transition to 0.01ms
(one iteration) and turns off smooth scrolling. State changes still happen, just without movement. Spinners stop rotating, but
`aria-busy` and the visible spinner still show that the request is in flight.

Do not re-enable motion for reduced-motion users with `motion-safe:` escapes, except for essential progress feedback.
To check it, turn on Reduce Motion in macOS (System Settings → Accessibility → Display) or emulate it in Chrome DevTools (Rendering → prefers-reduced-motion).

## Reference values

| Interaction             | Property                  | Duration               | Easing     |
| ----------------------- | ------------------------- | ---------------------- | ---------- |
| Button hover            | background, border, color | fast                   | standard   |
| Button press            | scale .98                 | fast                   | standard   |
| Input focus             | border-color, box-shadow  | fast                   | standard   |
| Nav item hover          | background, color         | fast                   | standard   |
| Dropdown / popover open | opacity + translateY(4px) | base                   | emphasized |
| Dropdown close          | opacity                   | ~130ms                 | exit       |
| Dialog / sheet          | opacity + translate       | slow                   | emphasized |
| Mobile sidebar          | translateX                | 200ms (current) → slow | emphasized |
| Theme toggle            | none (instant switch)     | —                      | —          |
