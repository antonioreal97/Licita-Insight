# System Patterns — Licita Insight

## Arquitetura atual

Monorepo pnpm (template Replit) com três frentes:

| Pacote | Papel hoje |
| --- | --- |
| `artifacts/licitainsight` | App React. É o produto. |
| `artifacts/api-server` | Express 5. Só `/api/healthz`. |
| `lib/db` | Drizzle + Postgres. Schema vazio (`export {}`). |
| `lib/api-spec` | OpenAPI. Só `HealthStatus`. |
| `lib/api-client-react` / `lib/api-zod` | Client e Zod gerados pelo Orval a partir do spec. |
| `artifacts/mockup-sandbox` | Sandbox de mockups do template. Fora do produto. |

O frontend **não** chama a API de licitações. Lê o array `tenders` em `src/lib/mock-data.ts` direto nos componentes.

## Rotas (wouter)

Públicas, sem shell: `/`, `/login`, `/register`, `/forgot-password`.

Com `AppShell`: `/dashboard`, `/search`, `/tenders/:id`, `/saved-searches`, `/saved-tenders`, `/monitoring`, `/settings`, `/design-system`.

Auth visual faz `history.pushState` para `/dashboard`. Não há sessão.

## Onde a UI mora

Quase toda a interface de produto está em dois arquivos:

- `artifacts/licitainsight/src/pages/pages.tsx` — páginas, `TenderRow`, `StatusBadge`, `Button` local, estados de salvar/monitorar.
- `artifacts/licitainsight/src/components/app-shell.tsx` — sidebar, topbar, tema, usuário mock.

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

## Modelo de dados (mock)

`Tender` em `mock-data.ts`: id, título, descrição, órgão, unidade compradora, números, modalidade, status, valor, datas, UF/cidade, fonte, score, categorias, itens, documentos.

Status no código: `'Aberto' | 'Em análise' | 'Encerrado' | 'Suspenso'`. O brief fala em “recebendo propostas” e “cancelada”; isso ainda não está no tipo.

## Estado

Estado de UI é `useState` local por página (salvos, filtros, página, tema). Não há store global. Salvar um edital na busca não persiste na lista de salvos.

URL de busca: só `q` é lido na montagem e escrito no submit. Estado e status **não** entram na query string. Paginação incrementa um contador local e não fatia os mocks (o total “1.248” é texto fixo).

## Padrão alvo (ainda não implementado)

```text
UI → hooks/estado → tenderService → mock | API
```

Contrato futuro de busca: `results`, `total`, `page`, `pageSize`, `query`, `filters`, `facets`, `processingTime`.

Quando a API existir: spec em `lib/api-spec/openapi.yaml`, codegen com `pnpm --filter @workspace/api-spec run codegen`, rotas no `api-server`, tabelas em `lib/db`. Até lá, não amarrar a UI a Express, Drizzle ou Orval.

## Convenções de código observadas

- Copy e labels em português (Brasil).
- `data-testid` nos controles interativos.
- Componentes de página exportados de `pages.tsx` e roteados em `App.tsx`.
- `AppFrame` hoje é um fragmento; o layout real é o `AppShell`.
- Erros de página: `ErrorBoundary` com `resetKey` = location, shell fora do boundary.
