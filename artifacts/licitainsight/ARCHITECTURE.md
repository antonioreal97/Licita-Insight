# Licita Insight — Frontend architecture

## Layering (mandatory)

```
UI component  →  Hook (features/*/hooks)  →  Service (services/)  →  API adapter (api/adapters/)  →  Backend /api/v1
```

- Components never import from `api/adapters/*`. They call hooks.
- Hooks own React Query (cache keys in `services/query-keys.ts`) and URL state.
- Services own request normalization and URL ⇄ params mapping. No React.
- Adapters implement `SearchAdapter` (`api/adapters/search-adapter.ts`).
  - `http/` — `fetch` against `/api/v1`, which reads PostgreSQL.
- Contract types live in `api/types.ts` and mirror `docs/contracts/search-v1.md`.

## API

| Env var | Default | Effect |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3001/api` | base of the search API |

The UI does not ship tender fixtures. Search, detail and suggestions always call this API.

## Directory map

```
src/
  api/                 contract types, ApiError, adapters, adapter selection (index.ts)
  services/            search-service (normalize, URL mapping), query-keys
  features/
    search/            search-page, components/, hooks/ (use-tender-search, use-search-url-state, use-search-suggestions)
    tenders/           tender-detail-page, components/ (tender-row, status-badge, highlighted-text), hooks/use-tender
    saved-tenders/     page + hooks/use-saved-tenders (localStorage until API exists)
    dashboard/ saved-searches/ monitoring/ settings/ landing/ auth/ design-system/
  components/
    common/            app-level shared pieces (action-button, page-title, query-states)
    ui/                shadcn primitives
  lib/                 format (BRL, dates, bytes), tender-labels (enum → PT-BR)
```

## Rules for agents

- Search state lives in the URL (`useSearchUrlState`). Don't mirror it in local state.
- Enums come from the API in English `snake_case`. Translate only via `lib/tender-labels.ts`.
- Highlights are rendered with `HighlightedText`, never `dangerouslySetInnerHTML`.
- Money/date fields may be `null`. Always use `lib/format.ts`, which handles `null`.
- `// DS-DEBT:` marks visual code outside the design system. `// TODO(<feature>):` marks placeholders waiting on an API.
- Formatting: `.prettierrc.json` (single quotes, width 160).
