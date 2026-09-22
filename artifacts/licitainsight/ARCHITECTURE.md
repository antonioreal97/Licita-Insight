# Licita Insight — Frontend architecture

## Layering (mandatory)

```
UI component  →  Hook (features/*/hooks)  →  Service (services/)  →  API adapter (api/adapters/)  →  Backend /api/v1
```

- Components never import from `api/adapters/*` or fixtures. They call hooks.
- Hooks own React Query (cache keys in `services/query-keys.ts`) and URL state.
- Services own request normalization and URL ⇄ params mapping. No React.
- Adapters implement `SearchAdapter` (`api/adapters/search-adapter.ts`). Two exist:
  - `mock/` — in-memory implementation of the contract, with QA scenarios.
  - `http/` — `fetch` against `/api/v1`, parsing the standard error envelope into `ApiError`.
- Contract types live in `api/types.ts` and mirror `docs/contracts/search-v1.md`.

## Switching mock → real API

| Env var | Default | Effect |
|---|---|---|
| `VITE_API_MODE` | `mock` | `http` selects the real backend |
| `VITE_API_BASE_URL` | `/api` | base for the HTTP adapter |
| `VITE_MOCK_LATENCY_MS` | `350` | simulated latency |

No component, hook or service changes when switching.

## Mock QA scenarios

Append to any page URL: `?mock=slow` · `?mock=error` · `?mock=unavailable` · `?mock=empty`.
`/search` preserves the `mock` param while you change filters.

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
