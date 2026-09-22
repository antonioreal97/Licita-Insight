```text
CLAUDE_HANDOFF

ID: CLAUDE_HANDOFF-003

Feature: Qualidade dos dados PNCP expostos pela Search API

Status: READY_FOR_CLAUDE

Contract decision:
  ACEITO como evolução aditiva do contrato Search v1, sem mudança de rotas ou parâmetros.
  tenderNumberShort é opcional e nullable no OpenAPI para preservar clientes existentes.
  Nenhuma migration foi necessária: o valor é derivado do rawPayload PNCP já preservado.

Base URL local: http://localhost:3001/api

Command to start API:
  DATABASE_URL='postgresql://...' PORT=3001 PNCP_DAILY_COLLECT=false pnpm --filter @workspace/api-server run dev

Route status:
  READY  GET /api/v1/tenders/search
         - facets.status e facets.modality usam os mesmos labels canônicos do frontend;
         - tenderNumberShort expõe numeroCompra/anoCompra sem prefixo da modalidade;
         - title preserva objetoCompra integral e objectSummary tem no máximo 300 caracteres;
         - relevance.score é normalizado entre mínimo/máximo da página;
         - relevance.score é null quando os resultados da página não têm discriminação.

  READY  GET /api/v1/tenders/{id}
         - aplica a mesma semântica de tenderNumberShort, title e objectSummary;
         - relevance.score permanece null no detalhe, como antes.

  READY  GET /api/v1/ingest/pncp
         - antes da leitura, runs running com heartbeat superior a 10 minutos são marcadas failed;
         - error informa "Abandonada: heartbeat da coleta expirou";
         - a mesma reconciliação ocorre no boot e antes de iniciar nova coleta.

Date provenance:
  publishedAt      <- dataPublicacaoPncp
  openingAt        <- dataAberturaProposta (início do recebimento de propostas)
  proposalDeadline <- dataEncerramentoProposta

  O payload de publicação consumido não fornece data separada de sessão pública. openingAt não
  deve ser rotulado como sessão; "Início das propostas" é o rótulo correto.

Response additions:
  TenderSummary.tenderNumberShort?: string | null
  TenderDetail herda tenderNumberShort.

Facet labels:
  Status: Aberto, Em análise, Encerrado, Suspenso, Revogado.
  Modalidades: Pregão eletrônico, Pregão presencial, Concorrência,
  Concorrência eletrônica, Dispensa, Inexigibilidade, Credenciamento, Leilão,
  Diálogo competitivo, Outra.

Relevance behavior:
  A ordenação usa o score bruto existente. Depois de selecionar a página, a resposta normaliza
  scores discriminantes para 0–1. Se todos forem iguais, devolve null sem remover highlights.
  Scores de páginas diferentes não devem ser comparados entre si.

Existing data behavior:
  tenderNumberShort é derivado de rawPayload.publication, então funciona nos registros PNCP já
  persistidos. objectSummary também é limitado na camada de resposta para registros antigos e
  passa a ser persistido já truncado nas próximas ingestões/upserts.

OpenAPI/codegen:
  lib/api-spec/openapi.yaml atualizado de forma aditiva, mantendo version 1.1.0 e /api/v1.
  lib/api-zod e lib/api-client-react/src/generated regenerados.
  docs/contracts/search-v1.md documenta datas, campos derivados, labels e relevância.

Validation:
  PASS  pnpm --config.verify-deps-before-run=false --dir lib/api-spec run codegen
  PASS  pnpm --config.verify-deps-before-run=false run typecheck
  PASS  pnpm --config.verify-deps-before-run=false --dir artifacts/api-server run build
  PASS  pnpm --config.verify-deps-before-run=false --dir artifacts/api-server run test
        15 testes passaram; 1 integração PostgreSQL opt-in foi pulada porque
        PNCP_TEST_DATABASE_URL não está configurada neste ambiente.
  PASS  git diff --check

Frontend considerations:
  Consumir tenderNumberShort quando presente e manter fallback para tenderNumber em servidores
  anteriores. Manter o label "Início das propostas" para openingAt. Tratar relevance.score null
  como ausência de diferenciação, não como relevância zero.

Process note:
  docs/handoffs/CLAUDE_HANDOFF-002-search-v1.1.md.prefeprefe foi renomeado para .md.

Breaking changes: NO

Migration required: NO

Database changes: NONE

N8N changes: NONE
```
