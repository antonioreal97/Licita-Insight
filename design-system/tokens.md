# Tokens

Source of truth: `artifacts/licitainsight/src/index.css`.

Theme colors are HSL triplets on `:root` and `.dark`; `@theme inline` exposes them as Tailwind colors. Use role classes such as `bg-primary`, `text-foreground` and `border-border`. In CSS, use `hsl(var(--primary) / .2)` when alpha is needed. Hex swatches below are visual references, not values to copy into feature code.

## Reference palette

The card photo supplied for the 2026 identity refresh has textured paper and uneven lighting, so these are representative swatches rather than single exact pixels:

| Card color | Approximate swatch | UI role |
| --- | --- | --- |
| Petroleum blue | `#183d4c` | Sidebar and dark panels |
| Teal | `#358192` | Brand hue; links use a darker accessible tone |
| Action cyan | `#39F3F3` | Primary action buttons, per the supplied color |
| Sage | `#b7d2bc` | Accent, selected surfaces and chips |
| Warm paper | `#f4f5ef` | Light canvas |

## Surfaces and text

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | `70 23% 95%` | `198 57% 15%` | Page canvas |
| `--surface` / `--card` | `48 100% 99%` | `195 48% 20%` | Cards and tables |
| `--surface-sunken` | `120 18% 92%` | `195 52% 16%` | Inset areas |
| `--surface-raised` / `--popover` | `48 100% 99%` | `192 43% 24%` | Menus and dialogs |
| `--muted` / `--secondary` | `120 23% 91%` | `192 43% 24%` | Quiet fills |
| `--foreground` | `195 49% 18%` | `137 23% 94%` | Body and headings |
| `--muted-foreground` | `184 15% 37%` | `178 22% 76%` | Secondary text |
| `--foreground-subtle` | `180 11% 48%` | `180 19% 64%` | Icons and disabled decoration only |

Body text measures 11.2:1 on the light canvas and 12.5:1 on the dark canvas. Secondary text measures at least 4.8:1 on the muted fill in both themes.

The landing headline uses `--hero-lead` for its first line and `--hero-highlight` for “antes do prazo”. The first line reads as a medium grey (`183 9% 48%` light, `181 18% 69%` dark); the second uses a clearer blue (`196 100% 30%` light) and the action cyan (`180 88.52% 58.82%` dark). Contrast on the canvas is at least 3.59:1 for the large lead text and 5.07:1 for the highlight.

## Borders and focus

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--border-subtle` | `120 18% 92%` | `195 43% 25%` | Internal dividers |
| `--border` | `152 18% 86%` | `188 33% 30%` | Card and section edges |
| `--border-strong` | `174 16% 64%` | `183 25% 43%` | Hover and emphasis |
| `--input` | `165 16% 71%` | `183 25% 43%` | Input borders |
| `--ring` | `189 57% 31%` | `181 41% 69%` | Keyboard focus |

## Brand and intent

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--primary` | `189 57% 31%` | `181 41% 69%` | Links and selected controls |
| `--action` | `180 88.52% 58.82%` (`#39F3F3`) | same | Primary action button fill |
| `--action-foreground` | `193 60% 18%` | same | Dark text on cyan buttons |
| `--action-hover` | `180 71% 51%` | `180 100% 71%` | Button hover |
| `--action-active` | `181 79% 44%` | `180 71% 51%` | Button pressed |
| `--primary-foreground` | `48 100% 99%` | `194 56% 16%` | Text on primary |
| `--primary-hover` | `192 60% 25%` | `178 46% 77%` | Hover |
| `--primary-active` | `191 65% 20%` | `181 36% 60%` | Pressed |
| `--primary-subtle` | `164 27% 89%` | `188 39% 26%` | Selected rows and callouts |
| `--primary-subtle-foreground` | `189 63% 25%` | `178 46% 77%` | Text on subtle primary |
| `--inverse` | `194 49% 21%` | `137 23% 94%` | High emphasis neutral button |
| `--accent` | `131 23% 77%` | `131 23% 77%` | Counters and new dots |
| `--accent-foreground` | `189 47% 18%` | `189 47% 18%` | Text on accent |

The deep teal primary pair measures 5.75:1 in light mode and 7.49:1 in dark mode. Action buttons use dark petroleum text on `#39F3F3` at 8.48:1 contrast. The sage accent pair measures 7.23:1. Destructive, warning and deadline tokens retain their semantic red and amber colors so those states remain distinct from the brand palette.

## Tender status

The API sends `TenderStatus` (`open | under_review | closed | suspended | cancelled`). PT-BR labels come from `lib/tender-labels.ts`. Use `bg-status-* text-status-*-foreground` pairs: never convey a status with color alone. Open now uses sage; closed and cancelled use quiet blue green neutrals. Under review and suspended keep their warning and error hues. Every status text pair measures at least 4.5:1 in both themes.

## Sidebar and charts

The sidebar uses petroleum blue (`197 52% 20%` light, `198 57% 12%` dark). `--sidebar-primary` is a pale turquoise (`178 40% 76%` light, `181 41% 69%` dark) so active navigation remains readable against the dark panel. Use `text-sidebar-*` roles for sidebar content.

`--chart-1` to `--chart-5` draw from teal, sage, petroleum blue and their tonal variants. Use labels and patterns where color alone would be ambiguous.

## Typography

Families: `font-sans` = DM Sans (400/500/600/700), `font-mono` = Space Mono (400/700). Space Mono is for data and labels only, never for paragraphs.

### Roles (`type-*` utilities, preferred)

| Class             | Size / line                 | Weight  | Tracking | Use                                                        |
| ----------------- | --------------------------- | ------- | -------- | ---------------------------------------------------------- |
| `type-display`    | 36 / 42                     | 600     | −0.04em  | Tender title on detail page (desktop)                      |
| `type-display-sm` | 27 / 34                     | 600     | −0.04em  | Page titles, detail title (mobile)                         |
| `type-title`      | 20 / 28                     | 600     | −0.025em | Dialog titles, dashboard numbers                           |
| `type-section`    | 15 / 22                     | 600     | −0.02em  | Section headers inside a page (= legacy `.section-title`)  |
| `type-body`       | 14 / 22                     | 400     | 0        | Paragraphs, descriptions                                   |
| `type-ui`         | 13 / 20                     | inherit | 0        | Dense UI: table cells, filters, buttons, inputs            |
| `type-meta`       | 11 / 16                     | inherit | 0        | Timestamps, organization lines, helper and error text      |
| `type-label`      | 10 / 14 mono, uppercase     | inherit | 0.04em   | Field and column labels (= legacy `.label`, without color) |
| `type-eyebrow`    | 10 / 14 mono, uppercase     | inherit | 0.14em   | Kickers above titles, sidebar group names                  |
| `type-data`       | inherit, mono, tabular-nums | inherit | −0.01em  | Money, IDs, dates, percentages                             |

Roles set size, line height and (where noted) weight and tracking. They do not set color: pair a role with a text token.
They are named `type-*` so `cn()`/tailwind-merge does not confuse them with text colors.

### Raw sizes

`text-3xs` (10px/14), `text-2xs` (11px/16), plus Tailwind defaults `text-xs` (12), `text-sm` (14), `text-base` (16)…
Tracking: `tracking-display` (−0.04em), `tracking-heading` (−0.02em), `tracking-label` (0.04em), `tracking-eyebrow` (0.14em).

### Legacy role classes (still supported)

`.label`, `.value`, `.section-title`, `.field` (label + input column) keep their class names and now read from the tokens.
`.field input` gained hover, focus, disabled and `aria-invalid` states.

## Spacing

The 4px base is `--spacing: 0.25rem`, so `p-1` = 4px, `p-4` = 16px, `gap-6` = 24px. Rhythm:

| Step      | px      | Use                             |
| --------- | ------- | ------------------------------- |
| `1`–`2`   | 4–8     | Icon ↔ label, badge padding     |
| `3`       | 12      | Between related controls        |
| `5` / `7` | 20 / 28 | Card padding (mobile / desktop) |
| `6`       | 24      | Between cards and sections      |
| `10`      | 40      | Page horizontal padding at `lg` |

Named layout sizes (`@theme --spacing-*`, so they work with `h-`, `w-`, `pl-`, `top-`…):
`header` 76px, `header-mobile` 3.5rem (56px), `sidebar` 248px, `sidebar-collapsed` 76px. Containers: `max-w-page` 1440px, `max-w-prose` 68ch.

## Radius

`--radius: 8px`. `rounded-xs` 2 · `rounded-sm` 4 · `rounded-md` 6 · `rounded-lg` **8 (controls: buttons, inputs, nav items)** ·
`rounded-xl` **12 (cards, panels)** · `rounded-2xl` 16 (dialogs, sheets) · `rounded-full` (badges, avatars, dots).

## Borders

1px only. Use `border-border` for edges, `border-border-subtle` for internal dividers, `border-border-strong` for hover or emphasis, and dashed `border-border-strong` for empty states.
Do not use a 2px border for emphasis. Use `--primary-subtle` fill or weight instead.

## Shadows (restrained)

All shadows are tinted with `--shadow-color` (petroleum blue in both themes), so they stay related to the palette.

| Class               | Value                    | Use                                  |
| ------------------- | ------------------------ | ------------------------------------ |
| `shadow-2xs`        | `0 1px 0 / 4%`           | Outline buttons (hairline lift)      |
| `shadow-xs`         | `0 1px 2px / 5%`         | Primary and inverse buttons          |
| `shadow-sm`         | two layers, 6% / 4%      | Sticky headers when scrolled         |
| `shadow-md`         | `0 4px 12px −2px / 8%`   | Dropdowns, command palette           |
| `shadow-lg`         | `0 12px 32px −8px / 14%` | Popovers, dialogs                    |
| `shadow-xl` / `2xl` | 18% / 22%                | Sheets and full-screen overlays only |

Static cards get **no shadow**. Before this change the `:root` shadow variables were fully transparent and had no effect, because Tailwind 4 inlined its own defaults. The values now live in `@theme` and apply.

## Motion

See [motion.md](./motion.md). Durations: `duration-instant` 80 · `duration-fast` 120 · `duration-base` 180 · `duration-slow` 280 ms.
Easings: `ease-standard` `cubic-bezier(.2,0,0,1)` · `ease-emphasized` `cubic-bezier(.16,1,.3,1)` · `ease-exit` `cubic-bezier(.4,0,1,1)`.
A bare `transition` / `transition-colors` defaults to 160 ms `ease-standard`.

## Breakpoints

Tailwind defaults, unchanged: `sm` 640 · `md` 768 · `lg` 1024 (sidebar becomes fixed) · `xl` 1280 (detail page gets its side column) · `2xl` 1536.
Design mobile-first at 375px.

## Z-index

| Class                   | Value | Use                                                                                    |
| ----------------------- | ----- | -------------------------------------------------------------------------------------- |
| `z-raised`              | 10    | Sticky table headers, overlapping chips                                                |
| `z-sticky`              | 20    | App header                                                                             |
| `z-overlay`             | 30    | Mobile nav scrim                                                                       |
| `z-nav`                 | 40    | Sidebar                                                                                |
| `z-modal` / `z-popover` | 50    | Dialogs, sheets, popovers, dropdowns, tooltips (shadcn default; DOM order stacks them) |
| `z-toast`               | 100   | Toasts                                                                                 |

## Focus

`--focus-ring-width: 2px`, `--focus-ring-offset: 2px`, color `--ring`. A base rule gives every `:focus-visible` element this outline,
so raw buttons and links are covered by default. Components that draw their own ring (shadcn inputs) opt out with `outline-none`.
The `focus-ring` utility reapplies it to custom controls.

## Addendum: scrim token (DS-DEBT migration)

| Token     | Class                        | Light                    | Dark                     | Use                                                                     |
| --------- | ---------------------------- | ------------------------ | ------------------------ | ----------------------------------------------------------------------- |
| `--scrim` | `bg-scrim/40`, `bg-scrim/50` | `198 57% 8%` | `198 57% 6%` | Backdrop behind dialogs, sheets, drawers (`/50`) and mobile nav (`/40`) |

Added because `bg-black/80` was a palette literal and `bg-foreground/40` flips to a light wash in dark mode. The scrim stays
dark in both themes, so always use it with alpha. It is exposed as `--color-scrim` in `@theme inline`.

The `!important` remap of the old green palette that sat at the end of `index.css` has been removed: landing and auth now use tokens.

## Warning / urgent (cycle 1 polish)

| Token (class) | Light | Dark | Contrast | Use |
|---|---|---|---|---|
| `--warning` (`bg-warning`, `text-warning`) | `36 92% 42%` | `40 90% 60%` | 3.16:1 / 8.99:1 vs surface (graphic ≥ 3:1) | top rules, icons |
| `--warning-subtle` (`bg-warning-subtle`) | `42 92% 92%` | `38 42% 16%` | — | pill / banner fill |
| `--warning-subtle-foreground` (`text-warning-subtle-foreground`) | `30 88% 27%` | `42 88% 66%` | 6.77:1 / 8.37:1 on warning-subtle | text on warning-subtle |
| `urgent-subtle` / `urgent-subtle-foreground` | alias of `destructive-subtle` pair | alias | 6.1:1 / 7.5:1 | deadlines ≤ 48 h |

Warning is "look at this soon" (deadline ≤ 7 days, degraded service), never an error. `accent` stays reserved for counters.
