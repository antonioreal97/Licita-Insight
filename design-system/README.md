# Licita Insight — Design System

A precision instrument for reading public procurement, not a government portal and not a SaaS template.
Tokens live in `artifacts/licitainsight/src/index.css`. The living reference renders at `/design-system` in the app
(`src/features/design-system/design-system-page.tsx`). These docs are the written spec.

| Doc                              | Contents                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------- |
| [tokens.md](./tokens.md)         | Every token: value (light/dark), Tailwind class, usage, contrast ratios       |
| [components.md](./components.md) | Button, StatusBadge, inputs/selects, empty/loading/error, focus, state matrix |
| [motion.md](./motion.md)         | Durations, easings, what animates and what never does, reduced motion         |

## Identity (keep it)

- **Instrument navy** sidebar, the same in both themes. It anchors the product.
- **Signal blue** (`--primary`) is the one interactive color. Green is used only for the tender status "Aberto".
- **DM Sans** for reading, **Space Mono** for data: IDs, money, dates, percentages, labels.
- Light and dark themes are equals. `.dark` on `<html>` flips every token. Nothing is hard-coded to one theme.

## Principles

1. **Typography does the work.** Build hierarchy with size, weight and whitespace before reaching for color, borders or cards.
2. **One signal per view.** One primary button per area. Blue means "you can act here". Amber means "look at this". Nothing else competes.
3. **Data is mono and aligned.** Values use `type-data` (tabular numbers) so columns line up and scanning is fast.
4. **Surfaces are flat.** A 1px border separates things. A shadow means something sits _on top_ (popover, dialog, sheet), never decoration.
5. **Every state is designed.** Default, hover, focus-visible, active, disabled, loading, empty, error. If a state is missing, the component is not done.
6. **Motion confirms, never performs.** 120–180 ms, ease-out, no bounce. The UI should feel fast, not animated.
7. **Tokens or nothing.** No hex, no `slate-400`, no arbitrary colors in feature code. If a token is missing, add it here first.

## "Is this premium?" checklist

Run through this before you open a PR that touches UI.

- [ ] Could I remove a border, card or background and keep the meaning? Then remove it.
- [ ] Is there exactly one primary action in this area?
- [ ] Is the hierarchy readable with color turned off (squint test)?
- [ ] Are numbers, codes and dates in `type-data` / mono and right-aligned in tables?
- [ ] Is spacing on the 4px grid (Tailwind spacing scale), with more space _between_ groups than _inside_ them?
- [ ] Does every interactive element show hover, a visible focus ring with Tab, and a disabled state?
- [ ] Does it look right in dark mode without any `dark:` override? (If you needed one, a token is missing.)
- [ ] Does loading keep the layout (skeleton or in-place spinner), with no jump when data arrives?
- [ ] Do empty and error states say what happened _and_ what to do next, in plain PT-BR?
- [ ] Are there zero hex values and zero palette colors (`slate-*`, `white`) in the diff?
- [ ] Does it work at 375px wide?

## Do / Don't

| Do                                                      | Don't                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `bg-status-open text-status-open-foreground`            | `bg-[#e1f4ed] text-[#14765c]`                                      |
| `text-muted-foreground` for secondary text              | `text-slate-500`, `opacity-60` on text                             |
| `border border-border` to separate                      | Cards inside cards inside cards                                    |
| `shadow-lg` only on popovers, dialogs, sheets           | Shadows on static cards, glow effects                              |
| `Button` from `@/components/common/action-button`       | `ui/button` or a raw `<button>` with custom classes in a feature   |
| One accent (`bg-accent`) for counts that need attention | Gradients, glassmorphism, `backdrop-blur` for decoration           |
| `type-label` for field and column labels                | Uppercase body text, letter-spacing on sentences                   |
| Transitions on color/border/shadow at `duration-fast`   | `transition-all`, bouncy springs, entrance animations on every row |
| Sentence case PT-BR copy: "Salvar edital"               | Title Case Everywhere, "CLIQUE AQUI"                               |

## Class-name cheat sheet (new in this version)

- Surfaces: `bg-surface`, `bg-surface-sunken`, `bg-surface-raised` (existing `bg-card`, `bg-background`, `bg-muted` still work)
- Text: `text-foreground`, `text-muted-foreground`, `text-foreground-subtle` (icons and disabled only)
- Borders: `border-border-subtle`, `border-border`, `border-border-strong`
- Intent: `bg-primary-hover`, `bg-primary-active`, `bg-primary-subtle` + `text-primary-subtle-foreground`, `bg-inverse` + `text-inverse-foreground`, `bg-destructive-subtle` + `text-destructive-subtle-foreground` + `border-destructive-subtle-border`
- Status: `bg-status-{open|under-review|closed|suspended|cancelled}` + `text-status-{…}-foreground`
- Sidebar text: `text-sidebar-strong-foreground`, `text-sidebar-foreground`, `text-sidebar-muted-foreground`, `text-sidebar-subtle-foreground`
- Type roles: `type-display`, `type-display-sm`, `type-title`, `type-section`, `type-body`, `type-ui`, `type-meta`, `type-label`, `type-eyebrow`, `type-data`
- Font sizes: `text-3xs` (10px), `text-2xs` (11px)
- Tracking: `tracking-display`, `tracking-heading`, `tracking-label`, `tracking-eyebrow`
- Motion: `duration-instant|fast|base|slow`, `ease-standard|emphasized|exit`
- Layers: `z-raised|sticky|overlay|nav|modal|popover|toast`
- Layout: `h-header`, `w-sidebar`, `w-sidebar-collapsed`, `pl-sidebar`, `max-w-page`, `max-w-prose`
- Focus: `focus-ring` (for custom controls that removed the outline)

> Type roles are named `type-*`, not `text-*`, on purpose: `cn()` (tailwind-merge) treats any unknown `text-foo` as a
> color and would drop it next to `text-muted-foreground`.

## Debt register

`// DS-DEBT:` marks code outside the system. Known debt, to migrate with tokens above:

- `src/components/app-shell.tsx`: `text-slate-400/500/100`, `text-white`, `bg-slate-950/40`, avatar `bg-[#d3b18c] text-[#3e2c20]`, `w-[248px]`, `lg:w-[76px]`, `h-[76px]`, `z-40/30/20`, `max-w-[1440px]`
- `src/features/landing/landing-page.tsx`, `src/features/auth/auth-page.tsx`: old green hex palette, currently remapped by `!important` selectors at the end of `index.css` (remove the remap after migration)
- `src/features/dashboard`, `monitoring`, `saved-searches`, `saved-tenders`: raw hex/palette colors
- `src/components/error-boundary.tsx`, `src/pages/not-found.tsx`: palette colors
- `src/components/common/page-title.tsx`: `text-[10px] tracking-[0.16em]`, `text-[28px]/[32px]` → `type-eyebrow`, `type-display-sm`
- `src/lib/utils.ts`: optionally extend tailwind-merge with the `type-*` and `z-*` groups
