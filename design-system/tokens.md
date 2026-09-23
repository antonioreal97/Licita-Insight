# Tokens

Source of truth: `artifacts/licitainsight/src/index.css`.

- **Theme colors** are HSL triplets on `:root` (light) and `.dark`, e.g. `--primary: 210 78% 43%`. Use them with alpha as
  `hsl(var(--primary) / .2)` in CSS, or `bg-primary/20` in Tailwind.
- **`@theme inline`** exposes each color as `--color-*`, which is what makes `bg-*`, `text-*`, `border-*`, `ring-*`, `outline-*`, `fill-*` work.
- **`@theme`** holds static values: font sizes, tracking, easings, shadows, layout sizes.
- **`@utility`** adds type roles, durations, z-index and the focus ring (Tailwind has no namespace for these).

Hex values are shown for reference only. Never copy them into code.

## Color: surfaces

| Token                     | Class                                | Light                               | Dark      | Use                                              |
| ------------------------- | ------------------------------------ | ----------------------------------- | --------- | ------------------------------------------------ |
| `--background`            | `bg-background`                      | `#f6f7f9`                           | `#121821` | App canvas behind everything                     |
| `--surface`               | `bg-surface` (= `bg-card`)           | `#ffffff`                           | `#1a222d` | Cards, tables, panels, outline buttons           |
| `--surface-sunken`        | `bg-surface-sunken`                  | `#eff2f5`                           | `#151d28` | Table headers, inset wells, outline-button hover |
| `--surface-raised`        | `bg-surface-raised` (= `bg-popover`) | `#ffffff`                           | `#212936` | Popovers, menus, dialogs. Pair with `shadow-lg`  |
| `--muted` / `--secondary` | `bg-muted`, `bg-secondary`           | `#eaedf1`                           | `#252f3c` | Skeletons, chips, ghost hover                    |
| `--card`, `--popover`     | `bg-card`, `bg-popover`              | aliases of surface / surface-raised |           | Kept for shadcn and existing code                |

## Color: text

| Token                 | Class                    | Light     | Dark      | Contrast                                     | Use                                                   |
| --------------------- | ------------------------ | --------- | --------- | -------------------------------------------- | ----------------------------------------------------- |
| `--foreground`        | `text-foreground`        | `#18222f` | `#e5eaf0` | 15.0 / 14.7 on background                    | Headings, body, values                                |
| `--muted-foreground`  | `text-muted-foreground`  | `#5c697a` | `#95a1b1` | 5.2 / 6.8 on background · 4.8 / 5.2 on muted | Secondary text, meta, labels                          |
| `--foreground-subtle` | `text-foreground-subtle` | `#818d9c` | `#768293` | 3.4 / 4.1 on card                            | **Icons, disabled, decoration only.** Never body text |

`--muted-foreground` was darkened from 48% to 42% lightness in light mode: the old value measured 4.19:1 on the background and failed AA.

## Color: borders & focus

| Token             | Class                                      | Light     | Dark      | Use                                                      |
| ----------------- | ------------------------------------------ | --------- | --------- | -------------------------------------------------------- |
| `--border-subtle` | `border-border-subtle`                     | `#e7eaef` | `#232c38` | Row dividers inside a card                               |
| `--border`        | `border-border` (the default for `border`) | `#dae0e7` | `#2b3645` | Card and section edges                                   |
| `--border-strong` | `border-border-strong`                     | `#acb6c3` | `#414f62` | Hover on inputs and outline buttons, dashed empty states |
| `--input`         | `border-input`                             | `#c3cbd5` | `#39475b` | Input and select borders at rest                         |
| `--ring`          | `outline-ring`, `ring-ring`                | `#186ec3` | `#61a8ef` | Focus ring. 4.9:1 (light) / 7.1:1 (dark) on background   |

The input border at rest is under 3:1 against the surface (a common product choice). Inputs are also identified by their label, fill
and placeholder. On hover they move to `--border-strong`, and on focus to `--ring` plus a 3px halo.

## Color: intent

| Token                                              | Class                                                                                       | Light                             | Dark                              | fg contrast | Use                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------- | ----------- | ---------------------------------------------------------------- |
| `--primary` / `-foreground`                        | `bg-primary text-primary-foreground`                                                        | `#186ec3` / `#fff`                | `#61a8ef` / `#0d131b`             | 5.2 / 7.4   | Primary actions, links, selection                                |
| `--primary-hover`                                  | `bg-primary-hover`                                                                          | `#1361ae`                         | `#7cb8f4`                         | 6.3 / 8.9   | Primary hover (darker in light, lighter in dark)                 |
| `--primary-active`                                 | `bg-primary-active`                                                                         | `#10579e`                         | `#4799eb`                         | 7.3 / 6.2   | Primary pressed                                                  |
| `--primary-subtle` / `-foreground`                 | `bg-primary-subtle text-primary-subtle-foreground`                                          | `#e8f2fc` / `#11579c`             | `#192d43` / `#7db8f2`             | 6.5 / 6.7   | Selected rows, pressed toggles, active nav, info callouts        |
| `--inverse` / `-foreground`                        | `bg-inverse text-inverse-foreground`                                                        | `#19222e` / `#f2f4f7`             | `#e5eaf0` / `#121821`             | 14.7 / 14.7 | Highest-emphasis neutral (Button `dark`). **Flips in dark mode** |
| `--inverse-hover`                                  | `bg-inverse-hover`                                                                          | `#263040`                         | `#ccd5e1`                         | 12.1 / 12.0 | Hover for inverse                                                |
| `--accent` / `-foreground`                         | `bg-accent text-accent-foreground`                                                          | `#f6b32c` / `#18222f`             | same                              | 8.7         | Attention only: counters, "new" dots. Never a button             |
| `--destructive` / `-foreground`                    | `bg-destructive text-destructive-foreground`                                                | `#d32e22` / `#fff`                | `#ee6c63` / `#0d131b`             | 5.0 / 6.2   | Destructive actions, error text (`text-destructive`)             |
| `--destructive-subtle` / `-foreground` / `-border` | `bg-destructive-subtle text-destructive-subtle-foreground border-destructive-subtle-border` | `#fdeeed` / `#a92c23` / `#f1c9c6` | `#341a18` / `#f6988d` / `#592f2c` | 6.1 / 7.5   | Error panels and banners                                         |

`--destructive` changed: light went from 55% to 48% lightness (white text was 4.15:1), and dark now uses dark text (white on the old value was 3.83:1).

## Color: tender status

The API sends `TenderStatus` (`open | under_review | closed | suspended | cancelled`). PT-BR labels come from `lib/tender-labels.ts`.
Classes use kebab-case: `under_review` becomes `status-under-review`.

| Status         | Label      | Classes                                                      | Light bg / fg         | Light ratio | Dark bg / fg          | Dark ratio |
| -------------- | ---------- | ------------------------------------------------------------ | --------------------- | ----------- | --------------------- | ---------- |
| `open`         | Aberto     | `bg-status-open text-status-open-foreground`                 | `#e1f4eb` / `#116949` | **5.82:1**  | `#18352a` / `#83d8b0` | **7.86:1** |
| `under_review` | Em análise | `bg-status-under-review text-status-under-review-foreground` | `#fdefce` / `#814508` | **6.59:1**  | `#3c2d16` / `#f5c25c` | **8.10:1** |
| `closed`       | Encerrado  | `bg-status-closed text-status-closed-foreground`             | `#e7eaef` / `#475466` | **6.37:1**  | `#28313e` / `#b1bbc9` | **6.76:1** |
| `suspended`    | Suspenso   | `bg-status-suspended text-status-suspended-foreground`       | `#fce6e3` / `#9f2b23` | **6.17:1**  | `#411d1b` / `#f6988d` | **6.90:1** |
| `cancelled`    | Revogado   | `bg-status-cancelled text-status-cancelled-foreground`       | `#f0f2f5` / `#5a6472` | **5.35:1**  | `#202732` / `#929caa` | **5.41:1** |

Every pair passes AA for 11px semibold text (≥4.5:1). The dot uses `currentColor`, so it also passes the 3:1 rule for graphics.
Meaning never depends on color alone. Each badge has a text label, and `cancelled` also has a hollow dot and a strike-through.
The fg tokens also work as plain text on a surface (open fg on white is 6.66:1; on the dark card it is 9.47:1).

Ratios use the WCAG 2.x relative-luminance formula on the sRGB values above.

## Color: sidebar (the same navy in both themes)

| Token                         | Class                                        | Value                      | On `--sidebar`   | Replaces                          |
| ----------------------------- | -------------------------------------------- | -------------------------- | ---------------- | --------------------------------- |
| `--sidebar`                   | `bg-sidebar`                                 | `#151d28` / dark `#0d131b` | —                |                                   |
| `--sidebar-strong-foreground` | `text-sidebar-strong-foreground`             | `#ffffff`                  | 17:1             | `text-white`, `text-slate-100`    |
| `--sidebar-foreground`        | `text-sidebar-foreground`                    | `#d2dae5`                  | 12.1:1           |                                   |
| `--sidebar-muted-foreground`  | `text-sidebar-muted-foreground`              | `#9aa6b6`                  | 6.9:1 (7.6 dark) | `text-slate-400`                  |
| `--sidebar-subtle-foreground` | `text-sidebar-subtle-foreground`             | `#7c8a9c`                  | 4.8:1 (5.3 dark) | `text-slate-500` (eyebrows, meta) |
| `--sidebar-primary`           | `bg-sidebar-primary`, `text-sidebar-primary` | `#58a3ee` / `#61a8ef`      | 6.4:1 (7.4 dark) | Brand mark, active nav            |
| `--sidebar-accent`            | `bg-sidebar-accent`                          | `#252f3c` / `#1f2733`      |                  | Nav hover                         |
| `--sidebar-border`            | `border-sidebar-border`                      | `#293342` / `#212a35`      |                  |                                   |

The active nav item is `text-sidebar-primary` on `bg-sidebar-primary/15` over `--sidebar`. Light `--sidebar-primary` moved from
`210 80% 58%` (`#3e94ea`) to `210 82% 64%` (`#58a3ee`): the old pair measured **4.31:1** on that tinted background (fails AA for 13px text),
the new one is **4.97:1** (measured in the browser: `#58a3ee` on `#1f3146`). Dark is unchanged at **5.87:1**. The brand tile
(`text-sidebar-primary-foreground` on `bg-sidebar-primary`) goes from 5.35:1 to 6.37:1.

## Color: charts

`--chart-1` to `--chart-5` (`bg-chart-1`, `fill-chart-1`…): blue, amber, blue-2, red, violet. They are unchanged from the previous version.

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
`header` 76px, `sidebar` 248px, `sidebar-collapsed` 76px. Containers: `max-w-page` 1440px, `max-w-prose` 68ch.

## Radius

`--radius: 8px`. `rounded-xs` 2 · `rounded-sm` 4 · `rounded-md` 6 · `rounded-lg` **8 (controls: buttons, inputs, nav items)** ·
`rounded-xl` **12 (cards, panels)** · `rounded-2xl` 16 (dialogs, sheets) · `rounded-full` (badges, avatars, dots).

## Borders

1px only. Use `border-border` for edges, `border-border-subtle` for internal dividers, `border-border-strong` for hover or emphasis, and dashed `border-border-strong` for empty states.
Do not use a 2px border for emphasis. Use `--primary-subtle` fill or weight instead.

## Shadows (restrained)

All shadows are tinted with `--shadow-color` (navy in light, near-black in dark), so they never look grey or muddy.

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
| `--scrim` | `bg-scrim/40`, `bg-scrim/50` | `216 30% 8%` (`#0e141c`) | `216 50% 3%` (`#04070b`) | Backdrop behind dialogs, sheets, drawers (`/50`) and mobile nav (`/40`) |

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
