# System Patterns — Licita Insight

Deriva de [projectbrief](projectbrief.md). Alimenta [activeContext](activeContext.md).

## Arquitetura atual

Monorepo pnpm (template Replit) com três frentes:

| Pacote | Papel hoje |
| --- | --- |
| `artifacts/licitainsight` | App React. É o produto. |
| `artifacts/api-server` | Express 5. Busca em `/api/v1` lendo só o PostgreSQL. Sem `DATABASE_URL`, responde 503. |
| `lib/db` | Drizzle + Postgres. Tabelas `tenders`, `ingest_runs` e `ingest_days`. |
| `lib/api-spec` | OpenAPI 1.1.0 da Search API (busca, detalhe, sugestões, health). |
| `lib/api-client-react` / `lib/api-zod` | Client e Zod gerados pelo Orval a partir do spec. |
| `artifacts/mockup-sandbox` | Sandbox de mockups do template. Fora do produto. |

O frontend sempre chama a API de licitações. Não há adapter de fixtures.

## Rotas (wouter)

Públicas, sem shell: `/`, `/login`, `/register`, `/forgot-password`.

Com `AppShell`: `/dashboard`, `/search`, `/tenders/:id`, `/saved-searches`, `/saved-tenders`, `/monitoring`, `/settings`, `/design-system`.

Auth visual faz `history.pushState` para `/dashboard`. Não há sessão.

## Onde a UI mora

Código em `artifacts/licitainsight/src/`, organizado por feature. Mapa completo em [`artifacts/licitainsight/ARCHITECTURE.md`](../artifacts/licitainsight/ARCHITECTURE.md).

- `features/<feature>/` — página, `components/`, `hooks/` e `lib/` de cada área: `search`, `tenders` (linha de resultado, tabela, detalhe), `dashboard`, `saved-tenders`, `saved-searches`, `monitoring`, `settings`, `landing`, `auth`, `design-system`.
- `api/` — tipos do contrato (`types.ts`), `ApiError` e o adapter HTTP. `services/` — `search-service` (normalização, URL ⇄ params) e `query-keys`.
- `components/common/` — `Button` de produto (`action-button.tsx`), `PageTitle`, estados de carregamento/erro.
- `components/app-shell.tsx` — sidebar, topbar, tema, persona de demonstração.
- `components/ui/*` — kit shadcn/Radix. É primitivo interno: telas de produto usam o `Button` de `components/common/action-button.tsx`, nunca `ui/button` direto.

Camadas obrigatórias: componente → hook → service → adapter → API. Componente não importa adapter.

## Design system

Documentação em `design-system/` (raiz): [`README.md`](../design-system/README.md), [`tokens.md`](../design-system/tokens.md), [`components.md`](../design-system/components.md), [`motion.md`](../design-system/motion.md). Tokens em `artifacts/licitainsight/src/index.css` (Tailwind v4, variáveis HSL, `@theme inline`). Referência viva em `/design-system`.

- Primary: azul (`--primary: 210 78% 43%`; dark `210 82% 66%`). É a cor de ação.
- Sidebar: navy (“instrument navy”), igual nos dois temas.
- Status de edital: tokens `status-open`, `status-under-review`, `status-closed`, `status-suspended`, `status-cancelled` (fundo + texto, AA nos dois temas).
- Warning (âmbar) para prazo ≤ 7 dias e busca degradada; `urgent-subtle` para prazo ≤ 48 h. `accent` fica só para contadores.
- Tipografia por papéis `type-*` (`type-display`, `type-title`, `type-section`, `type-ui`, `type-meta`, `type-label`, `type-data`…). Fontes: DM Sans (UI) e Space Mono (dados, números, labels).
- Motion: `duration-fast|base|slow`, `ease-standard|emphasized|exit`; respeita `prefers-reduced-motion`.
- Dark mode: classe `dark` no `<html>`, persistida em `localStorage` (`licita-theme`).
- Sem cor hex/paleta crua em feature; usar tokens.

Status de edital usa cor **e** texto (`Aberto`, `Em análise`, `Encerrado`, `Suspenso`, `Revogado`). Não comunicar situação só por cor.

## Modelo de dados

O contrato de busca está em [`docs/contracts/search-v1.md`](../docs/contracts/search-v1.md) e em `artifacts/licitainsight/src/api/types.ts`. Status e modalidade são enums `snake_case` (`open`, `under_review`, `pregao_eletronico`, `concorrencia`, …). A UI traduz os rótulos em `src/lib/tender-labels.ts`, inclusive nos facets. Os registros ficam na tabela `tenders`.

## Estado

Filtros, ordenação e página da busca vivem na URL. Editais salvos ficam no `localStorage` do navegador e são resolvidos pela busca. Não há store global.

## Fonte de dados

```text
UI → hooks → searchService → HTTP /api/v1 → PostgreSQL
```

A busca pagina no servidor. Sem `DATABASE_URL`, a API responde 503. O contrato está em [`docs/contracts/search-v1.md`](../docs/contracts/search-v1.md) (v1 + aditivos v1.1) e em `lib/api-spec/openapi.yaml`. Handoffs entre frontend e backend ficam em `docs/handoffs/`.

## Convenções de código observadas

- Copy e labels em português (Brasil).
- `data-testid` nos controles interativos.
- Cada página é o `default export` de `features/<feature>/<feature>-page.tsx`, roteada em `App.tsx`.
- O layout é o `AppShell`.
- Formatação: `artifacts/licitainsight/.prettierrc.json` (aspas simples, largura 160).
- Erros de página: `ErrorBoundary` com `resetKey` = location, shell fora do boundary.
