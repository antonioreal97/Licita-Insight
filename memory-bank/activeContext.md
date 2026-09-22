# Active Context — Licita Insight

## Foco agora

Caminho PNCP → PostgreSQL → pesquisa e detalhe está implementado. A carga verificada em 22 set 2026 é um recorte: pregão eletrônico do DF em 21 set 2026 (19 registros). A coleta padrão, sem essas variáveis, percorre os últimos 30 dias e todas as modalidades.

## O que está na mesa

- Postgres local: `docker compose up -d` (container `licita-postgres`, `DATABASE_URL` em `.env` na raiz, gitignored).
- Tabelas `tenders`, `ingest_runs` e `ingest_days` em `lib/db`. Push: `pnpm --filter @workspace/db run push-force`.
- Coletor: `pnpm --filter @workspace/api-server run collect:pncp`. n8n pode chamar `POST /api/v1/ingest/pncp` (202) e ler `GET /api/v1/ingest/pncp`.
- API lê somente o PostgreSQL. Sem `DATABASE_URL`, a busca responde 503 `SEARCH_UNAVAILABLE`. Não há fixtures em memória.
- Frontend sempre chama a API. A coleta diária sobe com o processo da API e repete às 06:00 em `America/Sao_Paulo` (`PNCP_DAILY_HOUR`, `PNCP_DAILY_COLLECT=false` para desligar).
- Calendário de cobertura aplicado ao Postgres local: coleta incremental pula dias/modalidades/UFs selados, retoma lacunas e revisita hoje. Datas explícitas forçam backfill. A consulta deve começar depois da meia-noite de Brasília para selar o dia anterior.
- `GET /api/v1/ingest/pncp` inclui `coverage`, com dias selados, próximo dia aberto e partições. Detalhes operacionais: `docs/ingest-pncp-calendar.md`.
- Última tentativa real do calendário (DF/modalidade 6, 21 set 2026) terminou por timeout do PNCP; 19 editais preservados e cobertura pendente. Os 27 testes, incluindo duas execuções em Postgres isolado com respostas controladas, passaram; typecheck e build também.

## Próximos passos

1. Rodar a carga de 30 dias (`collect:pncp` sem `PNCP_FROM` / `PNCP_UF`) e conferir tempo e volume.
2. Conferir, no log da API, que a coleta diária disparou e que a segunda passagem não relê dia selado.
3. Auth real, favoritos por usuário, alertas e outras fontes ficam para depois.

## Cuidados ativos

- Dados do PNCP são publicações oficiais. A interface não serve editais fictícios.
- Valor `0` sem descrição de sigilo vira `not_published`. Sigilo explícito vira `confidential` e o valor não é guardado.
- A API de consulta do PNCP estoura tempo em janelas largas. O coletor pede um dia por vez e, se receber timeout, reparte por UF.
