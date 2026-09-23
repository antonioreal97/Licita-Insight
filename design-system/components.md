# Components

The living reference at `/design-system` renders every component on this page, in its real states.

## Button

```tsx
import { Button } from '@/components/common/action-button';

<Button>Salvar edital</Button>
<Button variant="outline" size="sm" onClick={clear}>Limpar filtros</Button>
<Button variant="dark" size="lg"><Plus size={16} /> Nova busca</Button>
<Button loading>Salvando</Button>
<Button variant="outline" aria-pressed={saved}>Salvar</Button>
```

| Prop      | Type                                          | Default     | Notes                                                                              |
| --------- | --------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `variant` | `'primary' \| 'outline' \| 'ghost' \| 'dark'` | `'primary'` |                                                                                    |
| `size`    | `'sm' \| 'md' \| 'lg'`                        | `'md'`      | 32 / 36 / 44px tall                                                                |
| `loading` | `boolean`                                     | `false`     | Spinner over an invisible label (no width jump), `aria-busy`, disabled             |
| …rest     | every `<button>` prop, including `ref`        |             | `className` is merged with `cn()`, so `h-11`, `w-full` and `mt-4` override cleanly |

The button sets no default `type`, same as before. Pass `type="submit"` or `type="button"` inside forms.

| Variant   | Use                                                                       | Rest                                        | Hover                                       | Active                         |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- | ------------------------------ |
| `primary` | The single main action of an area                                         | `bg-primary`, `shadow-xs`                   | `bg-primary-hover`                          | `bg-primary-active`, scale .98 |
| `outline` | Secondary actions, toolbars                                               | `bg-surface`, `border-border`, `shadow-2xs` | `bg-surface-sunken`, `border-border-strong` | scale .98                      |
| `dark`    | High-emphasis neutral: "Instrument navy" in light, flips to light in dark | `bg-inverse`                                | `bg-inverse-hover`                          | scale .98                      |
| `ghost`   | Tertiary, inline, icon-adjacent                                           | transparent, `text-muted-foreground`        | `bg-muted`, `text-foreground`               | scale .98                      |

`aria-pressed="true"` gives `outline` a `primary-subtle` fill and `ghost` a `muted` fill, for toggles such as "Salvar" and "Monitorar".

| Size | Height | Padding x | Text                    | Gap | Icon |
| ---- | ------ | --------- | ----------------------- | --- | ---- |
| `sm` | 32     | 10        | 12px                    | 6   | 14   |
| `md` | 36     | 14        | 13px (`--type-ui-size`) | 8   | 15   |
| `lg` | 44     | 20        | 14px                    | 8   | 16   |

Icons are sized by the caller (`<Icon size={15} />`). The button does not resize them.

### Decision: `common/action-button` versus `ui/button`

- **`@/components/common/action-button` → `Button` is the product button.** Feature code must use it. Its API is frozen: `variant`, children, and every button prop. `size` and `loading` are optional additions.
- **`@/components/ui/button` (shadcn) stays as an internal primitive.** It is imported by `ui/pagination`, `ui/alert-dialog`, `ui/calendar`, `ui/carousel`, `ui/sidebar` and `ui/input-group`, and keeps shadcn's `variant`/`size`/`asChild` API so upstream shadcn updates remain copy-pasteable. Its focus ring now matches the DS. Do not import it from `features/*`.
- If a feature needs `asChild` (a link styled as a button), use `<a className=…>` with the same token classes for now, and open a DS request to add `asChild` to the product Button. Do not reach for `ui/button`.

## StatusBadge

```tsx
import { StatusBadge } from "@/features/tenders/components/status-badge";
<StatusBadge status={tender.status} />;
```

- Props: `{ status: TenderStatus }`. The label comes from `statusLabels` (PT-BR). `data-testid="status-<status>"`.
- Pill: `rounded-full px-2.5 py-1 text-2xs font-semibold`, a 6px dot and the label. It does not wrap or shrink.
- Tones come from the `--status-*` tokens (see tokens.md, all ≥5.3:1). `cancelled` has a hollow dot and a strike-through label. `closed` and `cancelled` are neutral because they need no action.
- It is not interactive. If it needs to filter, wrap it in a button. Do not add hover to the badge.

## Inputs & selects

| Property | Value                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Height   | 40px (`h-10`); 42px inside `.field`; 44px (`h-11`) for the main search bar                                                                                       |
| Border   | `border-input` at rest, `border-border-strong` on hover, `border-ring` + `ring-3 ring-ring/20` on focus                                                          |
| Fill     | `bg-background` (light), `bg-card` (dark)                                                                                                                        |
| Text     | `type-ui text-foreground`, placeholder `text-muted-foreground`                                                                                                   |
| Label    | Above the field, `.field` (11px semibold muted) or `type-label` for dense filters                                                                                |
| Error    | `aria-invalid="true"` sets `border-destructive`. The message goes below in `type-meta text-destructive` and is linked with `aria-describedby`. Never color alone |
| Disabled | `opacity-50 cursor-not-allowed`, no hover                                                                                                                        |

Use the `.field` wrapper for forms (settings, auth). For shadcn `Input`/`Select` in filters, keep the same measurements.

## Empty, loading and error states

| State   | Container                                                                                                                         | Content                                                                                                   | Action                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Empty   | `rounded-lg border border-dashed border-border-strong p-6 text-center`                                                            | `text-foreground-subtle` icon (18), `type-ui font-semibold` title, `type-meta text-muted-foreground` hint | `Button variant="outline" size="sm"`, e.g. "Limpar filtros" |
| Loading | Same box as the loaded content                                                                                                    | `animate-pulse bg-muted rounded-sm` bars at the real line heights, `aria-busy="true"`                     | none                                                        |
| Error   | `rounded-lg border border-destructive-subtle-border bg-destructive-subtle text-destructive-subtle-foreground p-6`, `role="alert"` | Icon, title that says what failed, one line of cause                                                      | `Button variant="outline" size="sm"` "Tentar novamente"     |

Copy rules: say what happened, then the next step. "Nenhum edital encontrado. Remova um filtro ou amplie o período." Do not write "Ops!" or blame the user.
Skeletons must mirror the final layout, so nothing jumps when data arrives. Show them only after roughly 150ms if you can, to avoid flashing on fast responses.

## Focus

- Every interactive element shows a **2px `--ring` outline with 2px offset** on `:focus-visible` (base rule in `index.css`).
- Mouse clicks do not show the ring. Keyboard focus always does.
- Never write `outline-none` without a replacement (`focus-ring`, or a `ring-*` + `border-ring` pair on inputs).
- On the navy sidebar, use `--sidebar-ring`.

## State matrix

| Component              | Default                  | Hover                          | Focus-visible                  | Active                    | Disabled                           | Loading                          |
| ---------------------- | ------------------------ | ------------------------------ | ------------------------------ | ------------------------- | ---------------------------------- | -------------------------------- |
| Button primary         | primary fill             | primary-hover                  | ring 2px +2                    | primary-active, scale .98 | 50% opacity, not-allowed, no hover | spinner, label hidden, aria-busy |
| Button outline         | surface + border         | surface-sunken + border-strong | ring                           | scale .98                 | 50%                                | spinner                          |
| Button dark            | inverse                  | inverse-hover                  | ring                           | scale .98                 | 50%                                | spinner                          |
| Button ghost           | transparent, muted text  | muted fill, foreground text    | ring                           | scale .98                 | 50%                                | spinner                          |
| Toggle (aria-pressed)  | as variant               | as variant                     | ring                           | scale .98                 | 50%                                | —                                |
| Input / select         | input border             | border-strong                  | border-ring + 3px ring/20 halo | —                         | 50%                                | trailing spinner (search)        |
| Nav item (sidebar)     | sidebar-muted-foreground | sidebar-accent fill, strong fg | sidebar-ring                   | —                         | —                                  | —                                |
| Table row / result row | surface                  | surface-sunken                 | ring on the row link           | —                         | —                                  | skeleton row                     |
| StatusBadge            | status tokens            | none                           | none (not interactive)         | —                         | —                                  | —                                |
| Link                   | primary text             | underline                      | ring                           | —                         | —                                  | —                                |

## Migration notes (DS-DEBT cleanup)

- **Overlays** (`ui/dialog`, `ui/sheet`, `ui/drawer`, `ui/alert-dialog`): backdrop is `bg-scrim/50` at `z-modal`, content is
  `bg-surface-raised` (`rounded-2xl` for dialogs, `shadow-lg` dialogs / `shadow-xl` sheets and drawers). The close button uses the
  base focus ring, not `focus:ring-*`.
- **Close labels**: `SheetContent` and `DialogContent` accept an optional `closeLabel` prop (default `"Fechar"`), used as the
  screen-reader text of the X button. Existing call sites need no change.
- **`cn()`** knows the DS utilities: `type-{eyebrow,label,meta,ui,body,section,title,display-sm,display}` are in the font-size
  group (they override each other and `text-<size>`, last wins; `type-data` is not in the group and combines freely), and
  `z-{raised,sticky,overlay,nav,modal,popover,toast}` are in the z-index group.
- **App shell**: skip link "Pular para o conteúdo" (`data-testid="link-skip-to-content"`) is the first focusable element and
  targets `<main id="conteudo" tabIndex={-1}>`. Nav links set `aria-current="page"` and use `focus-visible:outline-sidebar-ring`.
- **Avatar**: header avatar is `bg-primary-subtle text-primary-subtle-foreground`; sidebar avatar is `bg-sidebar-accent text-sidebar-strong-foreground`.
- **Selected chip** (saved tenders "Todos"): `bg-inverse text-inverse-foreground`, count in `text-inverse-foreground/70`.
- **Marketing** (landing/auth): the navy panels and brand tile use `bg-sidebar` + `text-sidebar-*` (same in both themes);
  high-emphasis CTAs are `bg-inverse` like `Button variant="dark"`. Hero display sizes (48/72px) stay arbitrary on purpose.

## App shell navigation (cycle 1 QA)

- **lg and up:** fixed `<aside>` sidebar, collapsible to 76px. The collapsed state persists in `localStorage` (`licita-sidebar-collapsed`).
- **Below lg:** the `<aside>` is `display: none` (out of the tab order and the accessibility tree). "Abrir menu" is a `SheetTrigger` for a
  left `Sheet` (`ui/sheet`, Radix Dialog) with the same sidebar content: focus moves in, is trapped, Escape and the overlay close it, and
  focus returns to "Abrir menu" (which exposes `aria-expanded`, `aria-controls`, `aria-haspopup="dialog"`). Following a link closes the
  drawer and focus goes to `<main id="conteudo">` instead. The drawer closes itself if the window grows past lg.
- `SheetContent` accepts `closeProps` (merged into the X button, e.g. `data-testid` or navy colors).
- **Theme toggle:** fixed label "Tema escuro" with `aria-pressed`. `index.html` applies `dark` from `licita-theme` before first paint,
  on every route (public pages included).
- **Notifications bell:** `aria-disabled` + tooltip/toast "Notificações em breve" (same pattern as `SaveSearchButton`); no unread dot.
- **Routes:** `App.tsx` maps static routes to `document.title` ("Explorar editais · Licita Insight"…). Pages with dynamic titles (tender
  detail, 404) set their own. On in-app route changes (pathname, not query) focus moves to `#conteudo`; landing, auth and 404 also render
  `<main id="conteudo" tabIndex={-1}>`.
