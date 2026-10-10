# Contrato — editais abertos por UF v1

Status: **aceito** em 09/10/2026. Aditivo ao [Search API v1](./search-v1.md). Alimenta o mapa "Onde estão as
oportunidades agora" da página inicial.

## Endpoint

`GET /api/v1/public/tenders/by-state` — público, sem sessão, sem parâmetros. A resposta é a mesma para todos.

```json
{
  "data": [
    { "state": "AC", "openTenders": 74, "estimatedValueTotal": 42180350.9, "updatedAt": "2026-10-09T09:00:00.000Z" },
    { "state": "AL", "openTenders": 0, "estimatedValueTotal": null, "updatedAt": null }
  ],
  "meta": {
    "totalOpenTenders": 27724,
    "generatedAt": "2026-10-09T12:00:00.000Z",
    "indexUpdatedAt": "2026-10-09T09:00:00.000Z",
    "cacheTtlSeconds": 900
  }
}
```

| Campo | Regra |
|---|---|
| `data` | sempre as 27 UFs, em ordem de sigla; UF sem edital aberto vem com `0`, `null`, `null` |
| `openTenders` | editais com `status = open`, o mesmo critério do filtro "Abertos" da busca |
| `estimatedValueTotal` | soma dos valores estimados publicados, sem os marcados como implausíveis (`estimatedValueFlag`); `null` quando a UF não tem valor a somar |
| `updatedAt` | coleta mais recente entre os editais abertos da UF |
| `meta.generatedAt` | quando o agregado foi calculado |
| `meta.indexUpdatedAt` | coleta mais recente entre todos os editais contados |

A sigla é normalizada (sem espaços, maiúscula). Editais sem UF ou com valor que não é uma UF ficam fora da
contagem, então `totalOpenTenders` pode ser menor que o total de abertos da busca.

Um edital com valor estimado implausível (ver "Aditivo — valor estimado fora da curva" em
[search-v1.md](search-v1.md)) continua contado em `openTenders`, mas o valor dele não entra em
`estimatedValueTotal`: um único erro de digitação na fonte (uma dispensa de R$ 938 bilhões) chegava a
definir a soma de uma UF inteira.

## Custo e cache

- Uma consulta agrupada, respondida só pelo índice parcial `tenders_open_by_state_value_idx`
  (`state, estimated_value, fetched_at` onde `status = 'open'`), criado na migração `0037`.
- O resultado fica **15 minutos** em memória, por processo. Requisições que chegam durante o cálculo esperam o
  mesmo cálculo. Se o banco falhar na renovação, o último resultado continua sendo servido (com o `generatedAt`
  original) e a nova tentativa acontece depois de 1 minuto.
- `Cache-Control: public, max-age=300, stale-while-revalidate=600` e `ETag`, para o navegador e a borda.
- Limite de requisições: a janela de leitura pública já existente (`RATE_LIMIT_ANON_PER_MINUTE`, 60/min por IP),
  descrita em [scale-protection-v1.md](./scale-protection-v1.md).

## Erros

| Status | Código | Quando |
|---|---|---|
| 429 | `RATE_LIMITED` | janela de leitura pública esgotada |
| 503 | `SEARCH_UNAVAILABLE` | banco indisponível e nenhum resultado anterior em memória |

Erros saem com `Cache-Control: no-store`. A página inicial esconde a seção do mapa em qualquer erro.
