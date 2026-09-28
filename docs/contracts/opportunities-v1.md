# Contrato — Oportunidades culturais v1

Chamadas de fomento audiovisual (Mapa da Cultura e instâncias estaduais do Mapas Culturais). Não são licitações do PNCP e não entram em `/v1/tenders/search`.

## Convenções

Iguais às de [`docs/contracts/search-v1.md`](search-v1.md): JSON `camelCase`, enums em inglês, datas ISO 8601, erro no envelope padrão. `null` explícito quando o campo existe e a fonte não trouxe o valor.

`OpportunityStatus`: `open` | `upcoming` | `closed` | `undated`

`OpportunityProgram`: `audiovisual` | `lpg` | `fac` | `fsa`

A coleta já restringe a lista a audiovisual. `program` só distingue o fundo quando o título ou o resumo cita FSA, Lei Paulo Gustavo ou FAC.

## Acesso

As duas rotas de leitura exigem sessão e acesso vigente (teste, assinatura ou bypass de
desenvolvimento). Sem sessão respondem `401 UNAUTHENTICATED`; sessão sem acesso responde
`402 SUBSCRIPTION_REQUIRED`. A coleta e as rotas internas de ingestão permanecem inalteradas.

## `GET /api/v1/opportunities`

| Nome | Tipo | Default | Notas |
|---|---|---|---|
| `q` | string | — | texto no título, resumo e órgão |
| `state` | UF[] | — | OR. Não inclui o mapa federal (`state` nulo) |
| `installation` | string[] | — | id da instalação (`br`, `ce`, …) |
| `status` | OpportunityStatus[] | — | OR |
| `program` | OpportunityProgram[] | — | OR |
| `deadlineFrom` / `deadlineTo` | `YYYY-MM-DD` | — | sobre o fim das inscrições, inclusivo, horário de Brasília. Registro sem prazo fica de fora |
| `page` | int ≥ 1 | 1 | |
| `pageSize` | int 1–100 | 20 | |
| `facets` | boolean | `true` | |

Ordem fixa: inscrições abertas, depois em breve, sem prazo e encerradas; dentro do grupo, pelo fim das inscrições.

```ts
{
  data: OpportunitySummary[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; totalIsEstimate: boolean };
  facets: {
    status: FacetBucket[];
    state: FacetBucket[];
    installation: FacetBucket[];
    program: FacetBucket[];
  } | null;
  meta: {
    query: string | null;
    tookMs: number;
    indexUpdatedAt: string | null;
    installationIssues: { installationId: string; name: string; message: string }[];
    gaps: { uf: string; name: string }[];
  };
}

type OpportunitySummary = {
  id: string;
  title: string;
  summary: string | null;
  organizationName: string;
  status: OpportunityStatus;
  program: OpportunityProgram;
  registrationFrom: string | null;
  registrationTo: string | null;
  state: string | null;
  installation: { id: string; name: string; uf: string };
  sourceUrl: string | null;
  updatedAt: string;
};
```

`installationIssues` traz falha de coleta ou ausência do termo Audiovisual na última execução. `gaps` são UFs sem instalação do Mapas Culturais. 401 sem sessão, 402 sem acesso e 503 `SEARCH_UNAVAILABLE` quando o Postgres não responde.

## `GET /api/v1/opportunities/{id}`

200: `OpportunitySummary`. 401 sem sessão, 402 sem acesso e 404 `NOT_FOUND` quando o id não existe.

## `POST /api/v1/ingest/opportunities`

202 `{ runId, status: "running" }`. 409 `INGEST_IN_PROGRESS` se já houver coleta desta fonte.

## `GET /api/v1/ingest/opportunities`

```ts
{
  run: {
    id: string;
    status: string;
    windowFrom: string;
    windowTo: string;
    pagesRead: number;
    upserted: number;
    refreshed: number;
    refreshErrors: number;
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
    coverage: InstallationCoverage[];
  } | null;
  coverage: InstallationCoverage[];
}

type InstallationCoverage = {
  id: string;
  uf: string;
  name: string;
  kind: "mapas" | "gap";
  url: string | null;
  outcome: "ok" | "gap" | "failed" | "vocabulary_fallback" | "pending";
  upserted: number;
  message: string | null;
};
```

Sem execução anterior, `coverage` lista as 27 UFs e o mapa federal, com `pending` nas instalações Mapas e `gap` nas demais.
