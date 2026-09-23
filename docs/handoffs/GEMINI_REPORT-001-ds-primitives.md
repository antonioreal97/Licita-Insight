# GEMINI_REPORT-001 — Dívida de Design System nos Primitivos de UI

**De:** Agente Gemini (Antigravity CLI)  
**Para:** Claude Orchestrator  
**Data:** 2026-09-23  
**Referência:** `docs/handoffs/GEMINI_TASK-001-ds-primitives.md`  

---

## 1. Arquivos alterados

1. `artifacts/licitainsight/src/components/ui/popover.tsx`
2. `artifacts/licitainsight/src/components/ui/dropdown-menu.tsx`
3. `artifacts/licitainsight/src/components/ui/tooltip.tsx`
4. `artifacts/licitainsight/src/components/ui/select.tsx`
5. `artifacts/licitainsight/src/components/ui/hover-card.tsx`
6. `artifacts/licitainsight/src/components/ui/context-menu.tsx`
7. `artifacts/licitainsight/src/components/ui/menubar.tsx`
8. `artifacts/licitainsight/src/components/common/action-button.tsx`
9. `artifacts/licitainsight/src/components/app-shell.tsx`
10. `artifacts/licitainsight/src/features/search/search-page.tsx`
11. `artifacts/licitainsight/src/index.css`
12. `design-system/components.md`
13. `design-system/tokens.md`
14. `design-system/README.md`

*(Nenhum arquivo fora do escopo atribuído foi editado. `saved-searches-page.tsx` foi preservado intocado).*

---

## 2. O que foi feito por item

### Item 1 — Primitivos de overlay com escala do DS
- Em `popover.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `select.tsx`, `hover-card.tsx`, `context-menu.tsx` e `menubar.tsx`:
  - Substituído `z-50` por `z-popover`.
  - Itens de menu (`DropdownMenuItem`, `DropdownMenuSubTrigger`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `ContextMenu...`, `Menubar...`, `SelectItem`): foco alterado de `focus:bg-accent focus:text-accent-foreground` para `focus:bg-muted focus:text-foreground`.
  - Em `tooltip.tsx`: alterado de `bg-primary text-primary-foreground` para `bg-inverse text-inverse-foreground`.
- Em `app-shell.tsx`:
  - Removidos overrides redundantes de classe: `z-popover` em `DropdownMenuContent` e `PopoverContent`, e `focus:bg-muted focus:text-foreground` no helper `menuItem`.

### Item 2 — Variante destrutiva do Button de produto
- Em `src/components/common/action-button.tsx`:
  - Adicionado `'destructive'` ao tipo `ActionButtonVariant`.
  - Mapeado no record `variants`: `bg-destructive text-destructive-foreground shadow-xs enabled:hover:bg-destructive/90 enabled:active:bg-destructive`. Foco (`focus-visible:outline-ring`), escala ativa (`scale-[0.98]`), estado desabilitado e loading são herdados de forma padronizada da definição `base` e do componente `Button`.
  - `src/features/saved-searches/saved-searches-page.tsx` **não** foi tocado, conforme instrução.
- Em `design-system/components.md`:
  - Atualizada a tabela de props com `'destructive'`.
  - Documentado o uso na tabela de variantes (`bg-destructive`, `text-destructive-foreground`, `shadow-xs`, `hover:bg-destructive/90`, active `bg-destructive`, `scale .98`).
  - Adicionada a linha correspondente na matriz de estados (`State matrix`).

### Item 3 — Token de altura do header mobile
- Em `src/index.css`: adicionado `--spacing-header-mobile: 3.5rem;` em `@theme` junto de `--spacing-header: 76px;`.
- Em `src/components/app-shell.tsx`: substituído `h-14` por `h-header-mobile` tanto no topo da sidebar quanto na tag `<header>` mobile.
- Em `src/features/search/search-page.tsx`: substituído o valor literal `3.5rem` por `var(--spacing-header-mobile)` no cálculo sticky/max-height do rail lateral de filtros (`aside`).
- Em `design-system/tokens.md`: documentado `header-mobile 3.5rem (56px)` junto dos tamanhos de layout nomeados.

### Item 4 — Registro de dívida atualizado
- Em `design-system/README.md`:
  - Verificados no código e movidos para "Itens resolvidos recentemente" todos os débitos que já haviam sido sanados: migração do `app-shell`, eliminação da paleta verde de landing/auth, substituição de cores literais/hex nas features, padronização do `page-title` e extensão do `tailwind-merge`.
  - Atualizada a lista de débitos em aberto com itens reais: adoção de `Button variant="destructive"` em `saved-searches-page.tsx` assim que o orquestrador liberar o arquivo, e os primitivos shadcn não utilizados que ainda possuem tokens padrão (`navigation-menu.tsx` e `command.tsx`).

---

## 3. Evidências e Critérios de Aceite

### 3.1. Typecheck TypeScript (`tsc`)
Executado em `artifacts/licitainsight`:
```
$ cd artifacts/licitainsight && ../../node_modules/.bin/tsc -p tsconfig.json --noEmit
(código de saída: 0 — nenhum erro reportado)
```

### 3.2. Grep de conformidade nos arquivos UI listados
Verificação de ausência de `z-50` e `focus:bg-accent` nos arquivos indicados:
```
$ grep -rn "z-50\|focus:bg-accent" artifacts/licitainsight/src/components/ui/{popover,dropdown-menu,tooltip,select,hover-card,context-menu,menubar}.tsx
(código de saída: 1 — nenhuma ocorrência encontrada)
```
Adicionalmente, uma varredura geral em todo o diretório `artifacts/licitainsight/src/components/ui` confirmou que `z-50` foi 100% erradicado.

### 3.3. Contraste do Tooltip (`inverse` sobre `inverse-foreground`)
Valores medidos com a fórmula padrão WCAG 2.x de luminância relativa nos valores sRGB dos tokens:
- **Tema Claro:** Fundo `hsl(216 28% 14%)` (`#19222e`) sobre Texto `hsl(216 20% 96%)` (`#f2f4f7`):
  - Razão calculada: **14.55:1** (excede amplamente a exigência de ≥ 4.5:1).
- **Tema Escuro:** Fundo `hsl(214 24% 92%)` (`#e5eaf0`) sobre Texto `hsl(216 30% 10%)` (`#121821`):
  - Razão calculada: **14.73:1** (excede amplamente a exigência de ≥ 4.5:1).

### 3.4. Formatação Prettier
Todos os arquivos alterados foram formatados com Prettier segundo `.prettierrc.json`:
```
$ cd artifacts/licitainsight && ../../node_modules/.bin/prettier --write src/components/ui/{context-menu,dropdown-menu,hover-card,menubar,popover,select,tooltip}.tsx src/components/common/action-button.tsx src/components/app-shell.tsx src/features/search/search-page.tsx src/index.css
(todos em conformidade)
```

### 3.5. Build de produção Vite
Executado com as variáveis de ambiente obrigatórias:
```
$ PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run build
✓ built in 2.53s (código de saída: 0)
```

---

## 4. O que ficou pendente e por quê

1. **Adoção de `variant="destructive"` em `saved-searches-page.tsx`:**
   - **Motivo:** O arquivo estava sob edição ativa do Claude Orchestrator durante este ciclo. A instrução `GEMINI_TASK-001` determinou expressamente: *"Não edite saved-searches-page.tsx (o Claude está mexendo nela e vai adotar a variante depois)"*. A variante está pronta e documentada em `@/components/common/action-button`.
2. **Primitivos shadcn não utilizados com classes padrão (`navigation-menu.tsx` e `command.tsx`):**
   - **Motivo:** Esses componentes não fazem parte dos primitivos de overlay elencados na tarefa e não são utilizados por nenhuma tela do produto atual. Foram catalogados no `design-system/README.md` para tratamento oportuno caso venham a ser adotados.
