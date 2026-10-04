# Abriu lá — Design System

A precision instrument for reading public procurement, not a government portal and not a SaaS template.
Tokens live in `artifacts/licitainsight/src/index.css`. The living reference renders at `/design-system` in the app
(`src/features/design-system/design-system-page.tsx`). These docs are the written spec.

| Doc                              | Contents                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------- |
| [tokens.md](./tokens.md)         | Every token: value (light/dark), Tailwind class, usage, contrast ratios       |
| [components.md](./components.md) | Button, StatusBadge, inputs/selects, empty/loading/error, focus, state matrix |
| [motion.md](./motion.md)         | Durations, easings, what animates and what never does, reduced motion         |

## Identity (keep it)

- **Petroleum blue** anchors the sidebar and dark panels in both themes.
- **Teal** (`--primary`) marks links and selection. Action buttons use `#39F3F3` (`--action`), and sage fills accents and quiet surfaces.
- **DM Sans** for reading, **Space Mono** for data: IDs, money, dates, percentages, labels.
- Light and dark themes are equals. `.dark` on `<html>` flips every token. Nothing is hard-coded to one theme.

## Principles

1. **Typography does the work.** Build hierarchy with size, weight and whitespace before reaching for color, borders or cards.
2. **One signal per view.** One primary button per area. Bright cyan marks the main action; deep teal marks links. Amber means "look at this".
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
- Intent: `bg-action text-action-foreground` for action buttons; `text-primary` for links; `bg-primary-subtle text-primary-subtle-foreground` for selection; `bg-destructive-subtle text-destructive-subtle-foreground` for errors.
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

- `src/components/ui/navigation-menu.tsx`: primitivo shadcn não utilizado que ainda contém classes padrão (`hover:bg-accent focus:bg-accent` em vez de `muted`).
- `src/components/ui/command.tsx`: primitivo shadcn com `data-[selected=true]:bg-accent` (atualmente não consumido em features de produto).

### Itens resolvidos recentemente
- `src/components/app-shell.tsx`: migrado de classes slate/hex/literais para tokens do DS (`bg-sidebar`, `text-sidebar-*`, `h-header`, `h-header-mobile`, `w-sidebar`, `z-sticky`, `z-nav`).
- `src/features/landing/landing-page.tsx` e `src/features/auth/auth-page.tsx`: paleta verde legada removida; páginas utilizam tokens sem remap no CSS.
- `src/features/{dashboard,monitoring,saved-searches,saved-tenders}`: cores manuais/hex migradas para tokens do DS (`bg-status-*`, etc.).
- `src/components/error-boundary.tsx` e `src/pages/not-found.tsx`: migrados para tokens do DS.
- `src/components/common/page-title.tsx`: migrado para `type-eyebrow` e `type-display-sm`.
- `src/lib/utils.ts`: `tailwind-merge` estendido com os grupos `type-*` e `z-*`.
- `src/components/ui/{popover,dropdown-menu,tooltip,select,hover-card,context-menu,menubar}.tsx`: migrados de `z-50` para `z-popover`, foco em menus para `focus:bg-muted focus:text-foreground` e tooltip para `bg-inverse text-inverse-foreground`.
- `src/components/common/action-button.tsx`: adicionada variante `destructive` com tokens do DS.
