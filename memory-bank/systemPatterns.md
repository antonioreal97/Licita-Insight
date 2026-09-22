# System Patterns — Licita Insight

## Arquitetura atual

Monorepo pnpm (template Replit) com três frentes:

| Pacote | Papel hoje |
| --- | --- |
| `artifacts/licitainsight` | App React. É o produto. |
| `artifacts/api-server` | Express 5. Busca em `/api/v1` lendo só o PostgreSQL. Sem `DATABASE_URL`, responde 503. |
| `lib/db` | Drizzle + Postgres. Tabelas `tenders` e `ingest_runs`. |
| `lib/api-spec` | OpenAPI. Só `HealthStatus`. |
| `lib/api-client-react` / `lib/api-zod` | Client e Zod gerados pelo Orval a partir do spec. |
| `artifacts/mockup-sandbox` | Sandbox de mockups do template. Fora do produto. |

O frontend sempre chama a API de licitações. Não há adapter de fixtures.

## Rotas (wouter)

Públicas, sem shell: `/`, `/login`, `/register`, `/forgot-password`.

Com `AppShell`: `/dashboard`, `/search`, `/tenders/:id`, `/saved-searches`, `/saved-tenders`, `/monitoring`, `/settings`, `/design-system`.

Auth visual faz `history.pushState` para `/dashboard`. Não há sessão.

## Onde a UI mora

Quase toda a interface de produto está em dois arquivos:

- `artifacts/licitainsight/src/pages/pages.tsx` — páginas, `TenderRow`, `StatusBadge`, `Button` local, estados de salvar/monitorar.
- `artifacts/licitainsight/src/components/app-shell.tsx` — sidebar, topbar, tema, persona de demonstração.

`src/components/ui/*` é o kit shadcn/Radix do template. As páginas de produto **não** usam esse kit; têm um `Button` próprio inline. Não duplicar um terceiro sistema de botões sem necessidade.

## Design system

Tokens em `artifacts/licitainsight/src/index.css` (Tailwind v4, `@theme inline`, variáveis HSL).

- Primary: verde (“signal green”).
- Sidebar: navy (“instrument navy”).
- Accent: âmbar.
- Fontes: DM Sans (UI) e Space Mono (dados, números, labels).
- Dark mode: classe `dark` no `<html>`, persistida em `localStorage` (`licita-theme`).
- Página de referência: `/design-system` (ainda enxuta).

Status de edital usa cor **e** texto (`Aberto`, `Em análise`, `Encerrado`, `Suspenso`). Não comunicar situação só por cor.

## Modelo de dados

O contrato de busca está em `docs/contracts/search-v1.md` e em `artifacts/licitainsight/src/api/types.ts`. Status e modalidade são enums em inglês (`open`, `electronic_auction`, …). A UI traduz os rótulos. Os registros ficam na tabela `tenders`.

## Estado

Filtros, ordenação e página da busca vivem na URL. Editais salvos ficam no `localStorage` do navegador e são resolvidos pela busca. Não há store global.

## Fonte de dados

```text
UI → hooks → searchService → HTTP /api/v1 → PostgreSQL
```

A busca pagina no servidor. Sem `DATABASE_URL`, a API responde 503. Spec de health em `lib/api-spec/openapi.yaml`; o contrato de busca ainda não está nesse OpenAPI.

## Convenções de código observadas

- Copy e labels em português (Brasil).
- `data-testid` nos controles interativos.
- Componentes de página exportados de `pages.tsx` e roteados em `App.tsx`.
- `AppFrame` hoje é um fragmento; o layout real é o `AppShell`.
- Erros de página: `ErrorBoundary` com `resetKey` = location, shell fora do boundary.
