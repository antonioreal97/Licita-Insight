# Transparência v1

A área pública `/transparencia` consulta dados normalizados do PNCP armazenados no PostgreSQL. Não consulta o PNCP diretamente do navegador e não exige login ou assinatura.

## Fontes e semântica

- **Contrato/empenho publicado:** `pncp_contracts`, com fornecedor, órgão, compra de origem, valores e link oficial. Valor inicial/global/acumulado é valor do registro contratual, não pagamento.
- **Resultado de item:** `pncp_item_results`, com situação, fornecedor, quantidade e valor homologado quando publicados. Somente situação `Informado` sem cancelamento é resultado ativo. Registros cancelados continuam disponíveis como histórico.
- A API só expõe identificador de fornecedor PJ quando ele tem 14 dígitos de CNPJ. CPF e identificadores de pessoas estrangeiras não saem na resposta pública.
- Ausência de registro na API não comprova ausência no PNCP. A cobertura inclui as janelas de contratos já coletadas e os resultados dos itens das contratações vinculadas a esses contratos.
- `provenance.fetchedAt` indica quando a plataforma consultou a fonte. `meta.indexUpdatedAt` indica a última coleta de transparência concluída.

## API pública

Base `/api`:

- `GET /v1/transparency/contracts`: filtros `q`, `state`, `publishedFrom`, `publishedTo`, `valueMin`, `valueMax`, `sort`, `page`, `pageSize`. `sort` aceita `published_desc` (padrão), `published_asc`, `value_desc` e `value_asc`. `pageSize` vai de 1 a 50. Resposta `{ data, pagination, meta }`.
- `GET /v1/tenders/{id}/transparency/contracts`: contratos ligados à chave PNCP da compra. Resposta `{ data, meta }`.
- `GET /v1/tenders/{id}/transparency/results`: resultados por item ligados à compra, inclusive cancelados. Resposta `{ data, meta }`.

O contrato de campos está em `lib/api-spec/openapi.yaml`. A busca usa somente registros do banco; falha de banco retorna `503 SEARCH_UNAVAILABLE`.

## Coleta

O coletor lê por dia os feeds oficiais de contratos publicados e atualizados e faz upsert idempotente. Depois consulta os itens com `temResultado=true` de um lote de compras vinculadas, marcando cada compra verificada no banco. Falhas recuperáveis do PNCP nessa fase de resultados (rate limit, gateway/5xx ou timeout) deixam só a compra afetada pendente, registram `purchasesSkipped` em `ingest_runs.details` e permitem seguir para as próximas compras. Se várias compras seguidas falharem assim, o coletor interrompe somente o laço de resultados, sem marcar a execução como falha. A execução e eventuais falhas ficam em `ingest_runs` com `source=pncp-transparency`. O próximo ciclo automático retoma do último dia concluído; na primeira execução, começa pelos sete dias anteriores a ontem. Cada execução cobre no máximo 31 dias para permitir recuperação gradual após interrupções. Mesmo sem novo dia a coletar, o ciclo seguinte continua a fila de resultados pendentes.

- Manual no host: `pnpm --filter @workspace/api-server run collect:transparency`.
- Manual no Compose: `docker compose --profile collect run --rm collect-transparency`.
- Backfill: definir `TRANSPARENCY_FROM` e `TRANSPARENCY_TO` (`YYYY-MM-DD`, até 31 dias) e executar o comando manual. `TRANSPARENCY_PAGE_SIZE` aceita 10 a 500, padrão 500. `TRANSPARENCY_RESULTS_LIMIT` limita as compras verificadas por execução (0 a 1000, padrão 200); as demais seguem pendentes no banco.
- Agenda: no Compose, `TRANSPARENCY_DAILY_COLLECT` vem habilitado e inicia ao subir a API; depois roda às 07:00 em `America/Sao_Paulo`, após a coleta PNCP principal. Definir `false` desliga. No host, definir `true` para habilitar.

O coletor não consulta pagamentos; empenho e instrumento de cobrança também não comprovam liquidação ou pagamento efetivo.
