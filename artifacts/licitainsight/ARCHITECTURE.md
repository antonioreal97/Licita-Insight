# Licita Insight — Frontend architecture

## Layering (mandatory)

```
UI component  →  Hook (features/*/hooks)  →  Service (services/)  →  API adapter (api/adapters/)  →  Backend /api/v1
```

- Components never import from `api/adapters/*`. They call hooks.
- Hooks own React Query (cache keys in `services/query-keys.ts`) and URL state.
- Services own request normalization and URL ⇄ params mapping. No React.
- Adapters implement `SearchAdapter` (`api/adapters/search-adapter.ts`) and `AccountAdapter` (`api/adapters/account-adapter.ts`).
  - `http/` — `fetch` against `/api/v1` with `credentials: 'include'`. `getJson` for reads; `sendJson` for POST/PUT/PATCH/DELETE
    (JSON body + CSRF header `X-Requested-With: licita-insight`; 204 → `undefined`).
- Contract types live in `api/types.ts` and mirror `docs/contracts/search-v1.md` and `docs/contracts/account-v1.md`.

## API

| Env var | Default | Effect |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | base of the API as seen by the browser |

Same origin: the Vite dev server proxies `/api` → `http://localhost:3001` (`vite.config.ts`, `changeOrigin: false`), and production
must do the same with a reverse proxy. The session cookie `licita_session` is then first-party, and the browser's `Origin` (the app
origin) is what the API's CSRF check compares with `PUBLIC_APP_ORIGIN`. Open the app on that exact origin (`localhost` ≠ `127.0.0.1`).

The UI does not ship tender fixtures. Search, detail and suggestions always call this API.

## Auth and account data

- Session: `useSession()` (`features/auth/hooks/use-session.ts`) → `GET /api/v1/auth/session`. 401 = signed out. 404 (API without
  auth routes yet) = signed out + one `console.error`. Other failures keep `status: 'loading'` and set `error` — never "signed out".
- Sign in: `signInWithGoogle(returnTo?)` does a full-page navigation to `/api/v1/auth/google/start`. Sign out: `useSignOut()`.
- Private routes (`/saved-tenders`, `/saved-searches`, `/monitoring`, `/settings`) are wrapped in `<RequireAuth>` in `App.tsx`;
  signed out → `/login?returnTo=<path>`. `/dashboard`, `/search`, `/tenders/:id` stay public.
- User data lives under the `['me', …]` query keys (`services/query-keys.ts`). Sign-out removes them all; any 401 re-checks the session
  (`QueryCache`/`MutationCache` `onError` in `App.tsx`); `me` queries retry only transient errors.
- Hooks: `useSavedTenders` (ids + optimistic save/monitor; signed out → Google sign-in; imports the legacy `licita-saved-tenders`
  localStorage ids once), `useSavedTendersList`, `useSavedSearches` + mutations (`features/saved-searches/hooks`),
  `useNotifications` / `useUnreadCount` (60 s poll, visible tab only) / `useMarkNotificationsRead` (`features/monitoring/hooks`).

## Directory map

```
src/
  api/                 contract types, ApiError, adapters, adapter selection (index.ts)
  services/            search-service (normalize, URL mapping), account-service (session, /me, saved-search query), query-keys
  features/
    search/            search-page, components/, hooks/ (use-tender-search, use-search-url-state, use-search-suggestions)
    tenders/           tender-detail-page, components/ (tender-row, status-badge, highlighted-text), hooks/use-tender
    auth/              auth-page, hooks/use-session, components/require-auth
    saved-tenders/     page + hooks/use-saved-tenders, use-saved-tenders-list (/me/saved-tenders)
    saved-searches/    page + hooks/use-saved-searches (/me/saved-searches)
    monitoring/        page + hooks/use-notifications (/me/notifications)
    dashboard/ settings/ landing/ design-system/
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
