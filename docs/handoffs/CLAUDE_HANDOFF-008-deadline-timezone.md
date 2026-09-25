# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-008

**Feature:** Filtros de data por dia civil de Brasília

**Status:** READY_FOR_CLAUDE

**Contrato:** aceito. `publishedFrom`, `publishedTo`, `deadlineFrom` e `deadlineTo` agora usam limites inclusivos do dia em `America/Sao_Paulo`. O mesmo comportamento foi aplicado a `deadlineFrom` e `deadlineTo` das oportunidades culturais.

## Comportamento

- `From=YYYY-MM-DD` compara a partir de `00:00:00.000` em Brasília.
- `To=YYYY-MM-DD` usa limite exclusivo no início do dia seguinte, incluindo integralmente o dia solicitado até a maior precisão armazenável pelo PostgreSQL.
- Um prazo às `23:59` BRT de D-1 fica fora de `deadlineFrom=D` e dentro de `deadlineTo=D-1`.
- A comparação mantém a coluna temporal sem casts ou funções, preservando o uso dos índices existentes.
- Datas inexistentes, como `2026-02-30`, continuam sendo rejeitadas como parâmetros inválidos.

## Status por rota

| Método | Rota | Status | Filtros corrigidos |
|---|---|---|---|
| `GET` | `/api/v1/tenders/search` | pronto | `publishedFrom`, `publishedTo`, `deadlineFrom`, `deadlineTo` |
| `GET` | `/api/v1/opportunities` | pronto | `deadlineFrom`, `deadlineTo` |

## Contratos

- `docs/contracts/search-v1.md` explicita que publicação e prazo usam horário de Brasília.
- `docs/contracts/opportunities-v1.md` já declarava a mesma regra e agora a implementação está alinhada.
- O OpenAPI documenta `America/Sao_Paulo` nos seis parâmetros afetados.
- Clientes React e Zod foram regenerados a partir do OpenAPI.
- Formato de request e response permanece inalterado.

## Validação

- Teste unitário cobre parsing de datas reais e a virada do dia às `03:00Z` (`00:00` BRT).
- Teste integrado com PostgreSQL cobre início, fim e troca de dia para publicação, prazo de edital e prazo cultural.
- `pnpm --dir artifacts/api-server run typecheck` — passou.
- `pnpm -w run typecheck:libs` — passou.
- `pnpm --dir artifacts/api-server run build` — passou.
- `PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita pnpm --dir artifacts/api-server exec tsx --test src/account/account.integration.test.ts` — **14/14 passaram**.
- `PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita pnpm --dir artifacts/api-server run test` — **84/84 passaram**.

## Como subir

```bash
docker compose up --build
```

**Breaking changes:** NO

**Migration required:** NO

**Frontend changes required:** NO

**N8N changes:** NO
