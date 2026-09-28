# Cycle 1 — Premium UI review

Reviewer: Premium UI Designer (read-only). Date: 2026-09-22. Build: dev server `http://127.0.0.1:5173`, mock adapter.
Screenshots: `/tmp/claude-li/ui/` (`s*` = desktop, `m*` = 375px). Most desktop shots were taken at an effective 1231px CSS viewport (the shared browser reset the viewport on navigation). `s20`–`s24` and `s22` are true 1440px.
Scope note: app-shell, landing, auth, dashboard, monitoring and saved-* are being migrated to tokens by another agent, so colors there are out of scope. Findings on those surfaces cover structure and hierarchy only.

Question for every surface: *Does this look like a premium SaaS product ready for real customers?*

---

## 1. Verdict per surface

| Surface | Verdict | Why |
| --- | --- | --- |
| `/search` list (light/dark) | **Close** | Type, status tokens and the right-aligned value/deadline column read as a real product. What holds it back: three stacked bordered boxes (search card, facet card, results card), duplicated modality text in every row, and blue relevance bars competing with the one action color. |
| `/search` table view | **Not yet** | At ≤1280px the columns that drive decisions (Valor, Prazo, Status) sit off-screen to the right, behind the Órgão/UF/Modalidade columns (`s04`, `s08`). The view toggle uses a grid icon for "table". |
| Facet sidebar | **Close** | Counts, disjunctive logic and badges are good. The native scrollbar inside a sticky bordered card, one "Sem opções…" line repeated per group in empty/degraded states, and a flat hierarchy (same weight for group titles and options) make it read as a form, not an instrument. |
| Autocomplete | **Close** | Solid combobox. Long "Termo" suggestions truncate mid-phrase with no highlighted match, and the count column only appears on some rows, so the right edge is ragged (`s05`). |
| Empty (`?mock=empty`) | **Close** | Good copy and recovery actions. The facet column shows "Sem opções para os resultados atuais." four times (`s09`). |
| Degraded (`?mock=unavailable`) | **Close** | Countdown, preserved filters and request ref are excellent. Visually it is a full amber slab, and it uses `accent` (reserved for counters) as a warning surface. The result-count slot collapses to nothing (`s10`). |
| Loading (`?mock=slow`) | **Not yet** | The skeleton doesn't match the loaded row: it has a 32px avatar square that TenderRow doesn't have and no right value column, so the layout jumps when data arrives (`s11` vs `s01`). |
| `/tenders/pe-042-2026` | **Close** | The key-facts strip is the strongest element in the app. The header has three competing CTAs, one of them a filled primary "Salvo". The organization and source appear 3 times each and "Abrir fonte original" twice. Below xl it stacks into six bordered cards (`s12`, `s14`, `s15`). |
| `/tenders/pe-207-2026` (long objeto) | **Not yet** | The 330-character objeto takes 8 lines on desktop and 9 on mobile, which pushes the value and deadline below the fold (`s13`, `m04`). |
| `/dashboard` | **Close** (structure) | The greeting and metric band work. The eyebrow date is stale ("terça-feira, 22 out 2024" while the data is 2026). The metric band has square edges while every other card is rounded-xl. `<Link><Button>` nests one interactive element inside another. The priority list reuses the full search row, which is too heavy for an overview. |
| `/design-system` | **Premium-ready** | Clean living reference. Keep it. |
| App shell expanded/collapsed | **Close** (structure) | The navy anchor is right. When collapsed, the icons have no tooltips and nothing separates the Workspace and Conta groups (`s18`). The design-system nav item uses `CircleHelp`. The mobile header has no brand mark, and at 76px it takes 9% of a 812px screen. |
| Mobile 375 (search) | **Not yet** | The first result starts at y≈600 (`m01`). The title, a 3-line description, a disabled "Salvar busca", the search card, the mode toggle, a Filtros row and a sort row on its own line all come before any data. |

---

## 2. Prioritized findings

Legend: **P1** = blocks a premium perception or a decision task · **P2** = visible polish debt · **P3** = refinement.
Class changes are written `current → proposed`. Motion uses `duration-*` / `ease-*` tokens from [`design-system/motion.md`](../../design-system/motion.md).

### P1

**UI-001 · P1 · Search / table view — decision columns are off-screen**
- Seen in `s04-table-1440.png`, `s08-table-dark.png`. At 1231px, Valor estimado, Prazo and Status need horizontal scroll. Visible are Objeto, Órgão, UF/Mun., Modalidade.
- Why it hurts: a procurement analyst scans value and deadline first. Hiding them behind a scrollbar makes the table feel like a raw data dump.
- Fix: in `src/features/search/components/results-table.tsx`, reorder `<colgroup>`, `<thead>` and `<tbody>` cells to **Objeto · Valor estimado · Prazo · Status · Órgão · UF/Mun. · Modalidade · Fonte · save**. Change `min-w-[1100px] → min-w-[960px]`. Fold Fonte into the Órgão cell as a second line (`type-meta text-muted-foreground`) and drop its column (−100px). Also fold Modalidade into the Objeto meta line next to `tenderNumber` and drop that column (−120px). The result is 7 columns that fit at ~1000px.

**UI-002 · Search / list — the loading skeleton doesn't match the row (layout jump)**
- Seen in `s11-loading.png` vs `s01-search-1440-light.png`.
- Why it hurts: DS rule "Skeletons must mirror the final layout". Every search visibly re-flows.
- Fix: in `src/components/common/query-states.tsx` → `RowsSkeleton`, remove the `h-8 w-8` square. Use the TenderRow grid: `grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_10.5rem_auto] sm:gap-x-5 sm:px-5`.
  - Col 1: a `h-5 w-16 rounded-full` badge bar, then `h-4 w-3/4` (title, `mt-2`), `h-3 w-1/2` (org, `mt-2`), `h-3 w-1/3` (published, `mt-2`).
  - Col 2 (`hidden sm:flex flex-col items-end gap-1.5`): `h-4 w-24` (value) and `h-3 w-20` (deadline).
  - Col 3: `h-9 w-9 rounded-md` (save).
  - Bars `animate-pulse rounded-sm bg-muted` (not `rounded`). Row divider `border-border-subtle`.
  - Also add a 150ms show delay: wrap it with `opacity-0 animate-in fade-in fill-mode-forwards delay-150 duration-fast`, or gate it in `search-page.tsx` with a `useDelayedFlag(isPending, 150)`.

**UI-003 · Tender detail — a long objeto pushes the facts below the fold**
- Seen in `s13-detail-207.png`, `m04-detail-375.png`.
- Why it hurts: value and deadline are the reason the page exists. The 140-character step-down rule isn't enough.
- Fix: `src/features/tenders/tender-detail-page.tsx`, `<h1>`.
  - Apply `line-clamp-3` when `title.length > 140`, keep `title={tender.title}`, and add a `Button variant="ghost" size="sm"` "Ver objeto completo" below it. It toggles local state that removes the clamp.
  - Title classes: `font-semibold leading-tight tracking-[-0.03em] text-[22px] sm:text-[28px] lg:text-[30px]` → `type-display-sm lg:type-display text-foreground text-balance`. For the long variant use `type-title sm:type-display-sm`.
  - Widen the column: header `lg:flex-row` → `xl:flex-row` so actions sit under the title below xl, and `max-w-4xl` → `max-w-prose`.

**UI-004 · Tender detail — three competing CTAs, and "saved" uses a filled primary**
- Seen in `s12-detail-042.png`, `s20-detail-dark.png`: filled blue "Salvo" + outline "Monitorar" + navy "Abrir fonte original".
- Why it hurts: DS principle 2, one signal per view. Two filled buttons compete, and a *state* (saved) gets the loudest treatment.
- Fix: in the header action group, change `variant={saved ? 'primary' : 'outline'}` → `variant="outline"` for both Salvar and Monitorar. The `aria-pressed` styling already gives `primary-subtle` when on. Keep "Abrir fonte original" as the only filled button: `variant="dark"` → `variant="primary"`, since opening the source is the main task. Group the two toggles in `inline-flex gap-2` and add `ml-1 pl-3 border-l border-border` before the primary.

**UI-005 · Mobile search — the first result is below the fold**
- Seen in `m01-search-375.png`.
- Why it hurts: on a phone the product looks like a form, not a search tool.
- Fix:
  - (a) `src/components/common/page-title.tsx`: description `mt-2 max-w-2xl type-body` → add `hidden sm:block`.
  - (b) `src/features/search/components/save-search-button.tsx`: on `<sm`, render icon-only (`size="sm"` + `sr-only` label) and place it in the `PageTitle` row via `sm:flex-row` → `flex-row items-end`.
  - (c) `search-page.tsx` toolbar: the sort `SelectTrigger` gets `w-[172px]` → `w-auto min-w-0 max-w-[9.5rem]`. Hide the "Ordenar por" label (already hidden). Keep the toolbar `flex-nowrap` below `sm` so Filtros · count · sort share one 40px row. Move the result count under the toolbar on mobile (`order-last basis-full sm:order-none sm:basis-auto`).
  - (d) Search card: `p-3 sm:p-4` → `p-0 border-0 bg-transparent sm:p-4 sm:border sm:bg-card` (see UI-007).

**UI-006 · Search list — modality is printed twice in every row**
- Seen in `s01`: "Pregão eletrônico  Pregão Eletrônico 042/2026".
- Why it hurts: redundant tokens in the highest-scan line look auto-generated.
- Fix: `src/features/tenders/components/tender-row.tsx`, meta line. Show only the number part of `tenderNumber` when it starts with the modality label. Add a helper `shortTenderNumber(tender)` in `features/tenders/lib/tender-display.ts` that strips a leading, accent- and case-folded match with `modalityLabel`, giving "042/2026". Render it as `type-data text-3xs text-muted-foreground` with the full value in `title`. Apply the same change in the `tender-detail-page.tsx` header meta and the `results-table.tsx` Objeto cell.

### P2

**UI-007 · Search — too many bordered boxes (card inside page inside card)**
- Seen in `s01`. Four boxed regions: search card, facet card, results card, plus bordered chips.
- Why it hurts: this is a "generic SaaS template" tell. The DS checklist asks "could I remove a border and keep the meaning?"
- Fix: `search-page.tsx`, search wrapper `mb-5 space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4` → `mb-6 space-y-3`. The input already has a border, so let it sit on `bg-background`. Facet `aside` inner `rounded-xl border border-border bg-card px-4 pb-2` → `pr-4 pb-2 border-r border-border-subtle` (a flat rail, no card). Keep the results card, which is the one surface that holds data.

**UI-008 · Search — relevance bars use primary blue and compete with actions**
- Seen in `s01`, `s22`: blue "100%" and blue bars in every row.
- Why it hurts: blue means "you can act here" (DS). Five blue meters per page dilute the save button and links.
- Fix: `src/features/tenders/components/relevance-meter.tsx`: `text-primary` → `text-muted-foreground`, filled `bg-primary` → `bg-foreground/70`, empty `bg-primary/15` → `bg-border`. Keep blue only for score ≥ 0.9, as a "best match" signal: `step<=filled && pct>=90 ? 'bg-primary' : …`.

**UI-009 · Result row — only the title is clickable**
- Seen in `s22-focus-row.png`. The whole row hovers (`hover:bg-muted/40`) but clicking the row body does nothing.
- Why it hurts: a hover affordance with no action feels broken. Premium lists make the row the target.
- Fix: `tender-row.tsx`. Add `relative` to the `<article>`. On the title `<Link>`, add `after:absolute after:inset-0 after:content-['']`. Give the save button wrapper and the category `<ul>` `relative z-raised`. Row hover `hover:bg-muted/40` → `hover:bg-surface-sunken`, with `transition-colors duration-fast ease-standard`.

**UI-010 · Focus ring on the result title sits on the text**
- Seen in `s22-focus-row.png`: the ring hugs the glyphs and clips the highlight `<mark>`.
- Fix: in `tender-row.tsx` and `results-table.tsx`, title link `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` → remove all three (let the base `:focus-visible` outline apply: 2px ring, 2px offset). With UI-009, move focus styling to the row: `<article … className="… has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ring has-[a:focus-visible]:-outline-offset-2">`.

**UI-011 · Focus styling is inconsistent across custom controls**
- `ring-primary/40` (faint, ~1.8:1) is used in `search-page.tsx` (view toggle, sidebar Limpar), `facet-panel.tsx` (Section button, Ver mais, deadline presets), `active-filters.tsx`, `search-mode-control.tsx`, `search-pagination.tsx`, `search-unavailable.tsx`, `search-combobox.tsx` (clear button).
- Why it hurts: keyboard users see a different, weaker ring on half the controls.
- Fix: replace `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40` → `focus-ring` (the DS utility) in every file listed. Search input: `outline-none ring-primary/25 transition-shadow focus:border-primary/50 focus:ring-2` → `outline-none transition-[border-color,box-shadow] duration-fast ease-standard hover:border-border-strong focus:border-ring focus:ring-3 focus:ring-ring/20`, which matches the DS input spec.

**UI-012 · Table view toggle uses the wrong icon**
- `search-page.tsx`: table button renders `LayoutGrid` (reads as "cards").
- Fix: `LayoutGrid` → `Table2` (lucide), `size={15}`. Active state `bg-secondary text-foreground` → `bg-surface text-foreground shadow-2xs`, with `transition-colors duration-fast`. Group wrapper `bg-card` → `bg-muted/60`, matching `SearchModeControl` so both segmented controls look the same.

**UI-013 · Facet sidebar — native scrollbar inside a sticky card**
- Seen in `s01`, `s03`: a grey OS scrollbar next to the "Filtros" header.
- Fix: `search-page.tsx` aside inner div: add `[scrollbar-width:thin] [scrollbar-color:hsl(var(--border-strong))_transparent] overscroll-contain`. Change `top-[92px]` → `top-[calc(var(--spacing-header)+1rem)]` and `max-h-[calc(100dvh-108px)]` → `max-h-[calc(100dvh-var(--spacing-header)-2rem)]`. This removes the magic numbers.

**UI-014 · Facet hierarchy is flat**
- Group titles (`text-[13px] font-semibold`) and options (`text-[13px]`) are the same size. Counts are fine.
- Fix: `facet-panel.tsx` Section button `text-[13px] font-semibold text-foreground` → `type-label text-muted-foreground` (mono uppercase 10px, as in the DS). Option label `text-[13px]` → `type-ui`. Section `py-3` → `py-4`, and remove `border-b border-border` (whitespace does the grouping) → `border-b border-border-subtle`. Chevron `transition-transform` → `transition-transform duration-fast ease-standard`.

**UI-015 · Empty and degraded — repeated "no options" message in every facet group**
- Seen in `s09-empty.png`, `s10-unavailable.png`.
- Fix: `facet-panel.tsx` `FacetPanel`. If every group has `buckets.length === 0` and nothing is selected, render one line instead of the groups: `<p className="type-meta text-muted-foreground py-4">{countsKnown ? 'Nenhum filtro disponível para estes resultados.' : 'Filtros indisponíveis enquanto a busca é restabelecida.'}</p>`. Keep ValueRange and DeadlineRange (they don't depend on buckets). Groups with a selected value still render.

**UI-016 · Degraded state uses `accent` as a warning surface**
- Seen in `s10`: `border-accent/50 bg-accent/10` full slab, icon in `bg-accent/25`.
- Why it hurts: accent is reserved for counters (DS tokens.md). A 400px amber slab reads as an alarm, not "temporarily degraded".
- Fix: add the `--warning-*` tokens from §3. In `search-unavailable.tsx`, container `rounded-xl border border-accent/50 bg-accent/10 px-5 py-10` → `rounded-xl border border-border bg-surface px-5 py-12`. Icon circle `bg-accent/25 text-foreground` → `bg-warning-subtle text-warning-subtle-foreground`. Add a 3px top rule: `before:block before:h-0.5 before:bg-warning before:rounded-full before:mx-auto before:w-12 before:mb-6`. Show the countdown as `type-data` inside the button label instead ("Tentar agora · 28s").

**UI-017 · Degraded — the result-count slot is empty**
- Seen in `s10`: the toolbar row has no left text, and sort and view controls look orphaned.
- Fix: `search-page.tsx` `resultCount`: when `search.isError`, return `'Resultados indisponíveis'` (styled `text-muted-foreground font-medium`). Disable the sort `Select` and the view toggle (`disabled` / `aria-disabled`) while `unavailable`.

**UI-018 · Deadline "soon" pill uses `accent` (DS-DEBT)**
- `src/features/tenders/components/deadline-indicator.tsx` `tones.soon: 'bg-accent/25 text-foreground'`, `critical: 'bg-destructive/10 text-destructive'`.
- Fix: after adding the tokens (§3), set `soon: 'bg-warning-subtle text-warning-subtle-foreground'` and `critical: 'bg-destructive-subtle text-destructive-subtle-foreground'`. Remove the DS-DEBT comment.

**UI-019 · Deadline icon duplicates the label icon in the detail facts strip**
- Seen in `s12`: the "PRAZO DE PROPOSTAS" label has `CalendarClock`, and "Encerra em 13 dias" below it also has `CalendarClock`.
- Fix: `deadline-indicator.tsx` `icons.normal: CalendarClock` → `Clock3`. The `block` variant shows no icon when `urgency === 'normal'` (`{info.urgency !== 'normal' && <Icon …/>}`).

**UI-020 · Detail facts strip — 6 columns wrap dates at xl**
- Seen in `s20-detail-dark.png`: "05 de out de 2026, / 18:00", "atualizado 09 de set de / 2026".
- Fix: `tender-detail-page.tsx` `dl` `xl:grid-cols-6` → `xl:grid-cols-[1.2fr_1.4fr_1.2fr_1fr_1fr_1.2fr]` and `gap-x-4` → `gap-x-6`. Values use `whitespace-nowrap` for dates (`DateValue` `<time>` add `whitespace-nowrap`). Source sub-line `atualizado …` → `type-meta`, with only the date: `formatDateNumeric`.

**UI-021 · Detail facts strip — a static shadow below xl**
- `section aria-label="Principais informações"` has `shadow-sm` at every width, but it is only sticky at `xl`.
- Fix: `shadow-sm` → `xl:shadow-sm`, or better, show it only when stuck. Add a sentinel + IntersectionObserver `data-stuck` and use `data-[stuck=true]:shadow-sm transition-shadow duration-base ease-standard`. When stuck, compact it: `data-[stuck=true]:[&_dt]:sr-only data-[stuck=true]:py-3`.

**UI-022 · Detail — organization/source repeated 3× and "Abrir fonte original" twice**
- Seen in the header, facts strip and "Órgão e fonte" panel (`s15`, `s21`).
- Fix: delete the `Órgão e fonte` `<Panel>` in `tender-detail-page.tsx`. Move the unique fields (purchasing unit is already in Objeto; `updatedAt`) into the facts strip Fonte cell, which already has them. Keep one "Abrir fonte original", in the header (UI-004). On mobile, add a sticky bottom action bar instead: `fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:hidden` with Salvar (outline, icon) + Abrir fonte (primary, flex-1).

**UI-023 · Detail — document rows are cards inside a card**
- Seen in `s14`, `s15`: each document has `rounded-lg border border-border p-3` inside the panel.
- Fix: `DocumentsPanel` `<ul className="space-y-2">` → `<ul className="-mx-2 divide-y divide-border-subtle">`. Link `rounded-lg border border-border p-3 … hover:bg-muted` → `rounded-md px-2 py-3 hover:bg-surface-sunken transition-colors duration-fast ease-standard`. The download icon goes from `text-muted-foreground` to `text-foreground-subtle group-hover:text-primary` (add `group` on the link). The file icon `text-primary` → `text-foreground-subtle` (blue icons ×3 compete with CTAs).

**UI-024 · Detail — Panel titles use the legacy class and inconsistent counts**
- `Panel` `<h2 className="section-title">` with `aside` as raw `text-xs`. The Documentos count is a bare "3", while the others say "2 itens" / "2 eventos".
- Fix: `h2` → `type-section text-foreground`. `aside` span → `type-data text-2xs text-muted-foreground`. Documentos passes `` `${n} ${n===1?'arquivo':'arquivos'}` ``. Panel padding `p-5 sm:p-6` → `p-5 sm:p-7` (DS card padding 20/28).

**UI-025 · Detail — the items table on mobile hides values behind a horizontal scroll**
- Seen in `m05-detail-375-b.png`: Valor unitário / total are off-screen, and the footer note is cut.
- Fix: `ItemsPanel`: below `sm`, render a stacked list instead of the table (`sm:hidden`), one row per item: description (`type-ui font-medium`), then `type-data text-2xs text-muted-foreground` "{qtd} {unid} × {unit}" and right-aligned `ValueDisplay precise` total. The table becomes `hidden sm:block`. Total row stays.

**UI-026 · Dashboard — `<Link><Button>` nests interactive elements**
- `src/features/dashboard/dashboard-page.tsx` `action`.
- Fix: replace it with a `Link` styled as the primary button: `<Link href="/search" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[length:var(--type-ui-size)] font-semibold text-primary-foreground shadow-xs transition-[background-color,scale] duration-fast ease-standard hover:bg-primary-hover active:scale-[0.98] focus-ring">`. Also open a DS request for `asChild` on `Button` (components.md already says to do this).

**UI-027 · Dashboard — stale date eyebrow**
- Seen in `s23`: "terça-feira, 22 out 2024" while every tender is 2026.
- Fix: `eyebrow={new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'short',year:'numeric'}).format(new Date())}` via a `formatLongDate` in `lib/format.ts`. Activity sample items `PE 042/2024` → `PE 042/2026`.

**UI-028 · Dashboard — the metric band breaks the radius system**
- Seen in `s23`: `border-y bg-card` full-bleed band with square corners, next to `rounded-xl` cards.
- Fix (structure): `mb-8 grid gap-6 border-y border-border bg-card px-5 py-6 sm:grid-cols-3 sm:px-7` → `mb-8 grid gap-6 rounded-xl border border-border bg-card px-5 py-6 sm:grid-cols-3 sm:divide-x sm:divide-border-subtle sm:px-0`. `MiniMetric`: remove `border-l-2 border-primary/30` (DS: no 2px emphasis borders) → `sm:px-7`. Value `text-[25px] font-semibold tracking-[-0.04em]` → `type-title sm:type-display-sm type-data`. On mobile, use `grid-cols-3 gap-3` with values at `type-title` so the band is one row, not the 330px stack in `m06`.

**UI-029 · Dashboard — the priority list reuses the full search row**
- Seen in `s23`: snippets, categories and published date make the overview as dense as search.
- Fix: pass `compact` to `TenderRow` in `dashboard-page.tsx` (the prop exists). Extend `compact` in `tender-row.tsx` to also hide the published/fonte `MetaItem` line and use `py-3.5`.

**UI-030 · App shell collapsed — no tooltips, no group separation**
- Seen in `s18-collapsed.png`.
- Fix (structure; colors belong to the migrating agent): in `src/components/app-shell.tsx`, when `collapsed`, wrap each nav `Link` in `Tooltip` (`side="right"`, `delayDuration={300}`). Replace the hidden group eyebrows with `<div className="mx-3 my-4 h-px bg-sidebar-border" />`. Center icons: `px-3` → `justify-center px-0` when collapsed. Sidebar width transition: `transition-[padding] duration-200` → `transition-[padding] duration-slow ease-emphasized`, and the aside `duration-200` → `duration-slow ease-emphasized` (motion.md reference table).

**UI-031 · App shell — the design-system nav item uses a help icon**
- `CircleHelp` → `Palette` (or `Component`). A question mark tells users it is help or support.

**UI-032 · Mobile header — no brand, and 76px tall**
- Seen in `m01`, `m07`.
- Fix (structure): in `app-shell.tsx` header, add a compact brand mark (`LI` tile, `size-7 rounded-md`) next to the menu button `lg:hidden`. Change the header height to `h-14 lg:h-header` and the sidebar top block to `h-14 lg:h-header`. The sticky offsets in UI-013 use the token, so they follow.

### P3

**UI-033 · Autocomplete — ragged count column and unmatched long term suggestions**
- Seen in `s05-autocomplete-1440.png`.
- Fix: `search-combobox.tsx` option row. Always render the count slot: `<span className="w-10 shrink-0 text-right type-data text-2xs text-muted-foreground">{count ?? ''}</span>`. For `term` suggestions longer than 60 characters, center the truncation window on the match (slice ±28 characters around the index, prefixed with "…"). Icon tile `bg-secondary` → no background, `text-foreground-subtle` (fewer boxes). Popover entrance: add `animate-in fade-in-0 slide-in-from-top-1 duration-base ease-emphasized`. Add a footer hint row `border-t border-border-subtle px-3 py-2 type-meta text-muted-foreground` with `Kbd` ↑↓ navegar · ↵ selecionar · Esc fechar.

**UI-034 · Search mode control — the "beta" pill uses raw classes**
- `rounded bg-primary/10 px-1 py-px font-mono text-[9px] uppercase tracking-wide text-primary` → `rounded-xs bg-primary-subtle px-1 py-px type-label text-primary-subtle-foreground`. Checked segment `shadow-sm` → `shadow-2xs` (static element).

**UI-035 · Active filter chips — hover color uses primary**
- `active-filters.tsx`: `hover:border-primary/40 hover:bg-muted` → `hover:border-border-strong hover:bg-surface-sunken`. Remove the inner X circle's `group-hover:bg-background` → `group-hover:text-foreground`. "Limpar tudo" `hover:underline` stays.

**UI-036 · Pagination — the active page is a filled primary square**
- `search-pagination.tsx` active `border-primary bg-primary font-bold text-primary-foreground` → `border-primary/40 bg-primary-subtle font-bold text-primary-subtle-foreground`. The filled primary is reserved for "Pesquisar". Disabled `disabled:opacity-40` → `disabled:opacity-50` (DS).

**UI-037 · Categories — chips use raw sizes and are over-weighted**
- `tender-row.tsx` `rounded bg-muted px-2 py-0.5 text-[10px] font-medium` → `rounded-sm px-1.5 py-px text-3xs font-medium text-muted-foreground ring-1 ring-inset ring-border-subtle` (no fill). This lowers visual noise per row. Detail page: `text-[11px]` → `text-2xs`.

**UI-038 · Empty state — tip bullets are hand-typed "•"**
- `empty-search.tsx`: replace the `<li>• …` characters with `list-disc pl-4 marker:text-foreground-subtle`. Container `border-border bg-card` → `border-border-strong bg-transparent` (DS empty spec: dashed `border-border-strong`, no fill). Title `text-base` → `type-section`.

**UI-039 · Error state — legacy alpha tokens**
- `query-states.tsx` `ErrorState`: `border-destructive/30 bg-destructive/[0.04]` → `border-destructive-subtle-border bg-destructive-subtle text-destructive-subtle-foreground`, as in the DS components spec. `h2 text-sm` → `type-ui font-semibold`. Ref line `text-[10px]` → `type-data text-3xs`.

**UI-040 · Search results — placeholder-data dim uses a raw 200ms**
- `search-page.tsx` results wrapper `transition-opacity duration-200` → `transition-opacity duration-base ease-standard`. `opacity-60` → `opacity-50`, and delay the dim by 120ms (`delay-120`) so fast refetches don't flicker.

---

## 3. Cross-cutting recommendations

### Typography rhythm
- Adopt `type-*` roles in all feature code. The main offenders are raw sizes: `text-[13px]`, `text-[11px]`, `text-[10px]`, `text-[14px]`, `text-[9px]`, `tracking-[0.14em]` and `font-mono text-[10px] uppercase tracking-wide` in `facet-panel.tsx`, `tender-row.tsx`, `results-table.tsx`, `search-combobox.tsx`, `tender-detail-page.tsx`. Mapping:
  - `text-[13px]` → `type-ui`
  - `text-[11px]` → `type-meta`
  - mono uppercase labels / `th` → `type-label`
  - popover section header → `type-eyebrow`
  - money, IDs, dates → add `type-data`. `ValueDisplay` uses `tabular-nums` but not mono. Keep DS Sans for money in rows (legibility) and use `type-data` only in tables and fact strips. Decide this once and document it in tokens.md.
- One heading scale per page: page `type-display-sm`; panel `type-section`; row title `type-ui font-semibold` at 14px (keep `text-sm`).
- Vertical rhythm: 24px (`gap-6`) between regions, 12px (`gap-3`) inside groups, 6px (`gap-1.5`) between a label and its value. Today the search page mixes `mb-5`, `mb-3`, `mt-5`.

### Density
- Search rows are about 168px tall at desktop. Target ≤ 132px: drop the modality duplicate (UI-006), move "publicado · fonte" onto the org line as `·`-separated `type-meta`, and lighten the category chips (UI-037). Offer a "Compacto" density later via `compact`.
- Table view is the power-user mode, so make it genuinely dense: `py-3` → `py-2.5`, row height ≤ 56px, and a single-line title with `line-clamp-1` plus a tooltip.

### Grid & alignment
- Money is right-aligned in list and table: keep it. Align the deadline sub-date to the same right edge (it already is), and make the relevance meter right-aligned with the same 10.5rem column.
- Replace magic offsets with layout tokens: `top-[92px]`, `top-[88px]`, `max-h-[calc(100dvh-108px)]`, `max-h-[calc(100dvh-9rem)]` → `calc(var(--spacing-header) + …)`.
- Container queries on `/search` are good. Apply the same `@container` approach to the detail layout (`xl:grid-cols-[minmax(0,1fr)_340px]` → `@min-[64rem]/page:`) so the collapsed sidebar at 1231 also gets the two-column layout.

### Icon usage
- Lucide at 1.5–1.75 stroke; sizes 13 (inline meta), 15 (buttons md), 17 (nav). Today nav uses 17 with a stroke of 2.4 when active. Make that `strokeWidth={2}` active and 1.75 idle, because 2.4 looks bolded rather than selected.
- Icons are `text-foreground-subtle` unless they are the action. File icons, meta icons and timeline icons should not be primary blue.
- Semantic fixes: table toggle `Table2` (UI-012), design system `Palette` (UI-031), normal deadline `Clock3` (UI-019).

### Motion language
- All hover/press: `transition-colors duration-fast ease-standard` (+ `enabled:active:scale-[0.98]` on buttons only). About 15 places use a bare `transition-colors` (160ms default). That's acceptable, but make them explicit when touched.
- Popovers (autocomplete, select): `duration-base ease-emphasized` in, `ease-exit` ~130ms out, translateY 4px.
- Sidebar collapse and mobile nav: `duration-slow ease-emphasized` (currently `duration-200` linear-ish).
- No entrance animation on rows. Keep it that way.
- Missing microinteraction, worth adding: bookmark save. Scale the icon `0.9 → 1` over `duration-fast ease-emphasized` and swap the icon, with no bounce. Announce it via the existing toast or an `aria-live` "Edital salvo".

### Missing tokens (add to `index.css` `:root` / `.dark` and to `@theme inline`)

| Token | Light | Dark | Pair contrast (target) | Use |
| --- | --- | --- | --- | --- |
| `--warning` | `36 92% 42%` (≈ `#cf8a08`) | `40 90% 60%` (≈ `#f5b93d`) | ≥ 3:1 vs surface (graphic) | Top rules, icons |
| `--warning-subtle` | `42 92% 92%` (≈ `#fdf2d5`) | `38 42% 16%` (≈ `#3a2e17`) | — | Pill/banner fill |
| `--warning-subtle-foreground` | `30 88% 27%` (≈ `#814508`) | `42 88% 66%` (≈ `#f4c966`) | ≈ 6.8:1 light / ≈ 8.3:1 dark (≥ 4.5 required) | Text on warning-subtle |
| `--urgent-subtle` / `-foreground` | alias `--destructive-subtle` / `-foreground` (`#fdeeed` / `#a92c23`, 6.1:1) | alias (`#341a18` / `#f6988d`, 7.5:1) | already AA | Deadline ≤ 48h |

Tailwind: `--color-warning`, `--color-warning-subtle`, `--color-warning-subtle-foreground`, `--color-urgent-subtle`, `--color-urgent-subtle-foreground`. Verify the ratios with the same WCAG 2.x script used for tokens.md before merging, since the hex values above are HSL conversions. Warning shares a hue family with `status-under-review`. That is intentional ("amber = look at this"), and the two never share a row slot.

---

## 4. Do not change

- **Instrument-navy sidebar**, the same in both themes, with the `sidebar-primary` active pill. It is the anchor of the brand.
- **Status badges** (`status-badge.tsx`): tokens, dot, and the struck-through hollow dot for Revogado. They are accessible and elegant.
- **Right-aligned value/deadline column** in `TenderRow` with sub-date. It is the core scanning pattern.
- **Key-facts strip** on detail (labelled mono `dt` + strong value). Refine it (UI-020/021) but keep the concept and its stickiness at xl.
- **`DeadlineIndicator` text+icon urgency** ("Encerra em 2 dias") in three variants. Only the tones change (UI-018).
- **`ValueDisplay` null state** ("Não informado" with an EyeOff icon and an explanatory title). Honest and premium.
- **Degraded-search behavior**: auto-retry countdown, preserved filters, request ref, and a pointer to saved tenders. Restyle it only (UI-016).
- **Empty-state relaxation** ("Filtro mais restritivo · Removê-lo mostraria…"). A real procurement-intelligence touch.
- **Mobile filters sheet** (`m03`): sticky footer with "Aplicar · N resultados" and 40px targets.
- **Combobox semantics** (WAI-ARIA 1.2, `/` shortcut, recent searches, accent-insensitive bolding).
- **Container-query layout on `/search`**, so the sidebar collapse re-flows the facet rail correctly.
- **Timeline "Previsto" dashed node** for future events. Subtle and meaningful.
- **Items table** with right-aligned quantities and values, the "not summed" footnote and the estimate-difference note.
- **`/design-system` living reference page.**
- **Dark mode parity**: no hard-coded surfaces were seen on the reviewed search and detail surfaces. Keep it that way.
