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

- `GET /v1/tenders/{id}/award-history`: histórico de compras parecidas do mesmo órgão (ver abaixo). Resposta `{ data, meta }`; `404` se o edital não existe.

O contrato de campos está em `lib/api-spec/openapi.yaml`. A busca usa somente registros do banco; falha de banco retorna `503 SEARCH_UNAVAILABLE`.

## Coleta

O coletor lê por dia os feeds oficiais de contratos publicados e atualizados e faz upsert idempotente. Depois consulta os itens com `temResultado=true` de um lote de compras vinculadas, marcando cada compra verificada no banco. Falhas recuperáveis do PNCP nessa fase de resultados (rate limit, gateway/5xx ou timeout) deixam só a compra afetada pendente, registram `purchasesSkipped` em `ingest_runs.details` e permitem seguir para as próximas compras. Se várias compras seguidas falharem assim, o coletor interrompe somente o laço de resultados, sem marcar a execução como falha. A execução e eventuais falhas ficam em `ingest_runs` com `source=pncp-transparency`. O próximo ciclo automático retoma do último dia concluído; na primeira execução, começa pelos sete dias anteriores a ontem. Cada execução cobre no máximo 31 dias para permitir recuperação gradual após interrupções. Mesmo sem novo dia a coletar, o ciclo seguinte continua a fila de resultados pendentes.

- Manual no host: `pnpm --filter @workspace/api-server run collect:transparency`.
- Na imagem de produção: `docker exec licita-macbook-app-1 node artifacts/api-server/dist/collect-transparency.mjs` (`--help` mostra o uso). Usa o lock `pncp_transparency_collect` da agenda.
- Manual no Compose: `docker compose --profile collect run --rm collect-transparency`.
- Backfill: definir `TRANSPARENCY_FROM` e `TRANSPARENCY_TO` (`YYYY-MM-DD`, até 31 dias) e executar o comando manual. `TRANSPARENCY_PAGE_SIZE` aceita 10 a 500, padrão 500. `TRANSPARENCY_RESULTS_LIMIT` limita as compras verificadas por execução (0 a 1000, padrão 200); as demais seguem pendentes no banco.
- Agenda: no Compose, `TRANSPARENCY_DAILY_COLLECT` vem habilitado e inicia ao subir a API; depois roda às 07:00 em `America/Sao_Paulo`, após a coleta PNCP principal. Definir `false` desliga. No host, definir `true` para habilitar.

O coletor não consulta pagamentos; empenho e instrumento de cobrança também não comprovam liquidação ou pagamento efetivo.

## Histórico de compras parecidas

Bloco "Histórico de compras parecidas" no detalhe do edital PNCP. Responde: nos últimos 24 meses, quantas vezes este órgão comprou algo parecido, quem venceu, por quanto e com que desconto. Só lê `pncp_contracts`, `pncp_item_results` e `tenders`; não chama IA nem o PNCP por requisição.

**Critério de semelhança (explicável, sem IA):**

1. **Mesmo órgão:** compras cuja chave começa com o CNPJ do órgão do edital (`<cnpj>-1-<seq>-<ano>`). O próprio edital fica de fora.
2. **Janela:** data do contrato (assinatura, senão publicação) nos últimos 24 meses, em `America/Sao_Paulo`. "Últimos 12 meses" é um recorte da mesma lista.
3. **Palavras-chave do edital:** até 8 palavras de 4+ letras do título, do objeto e das descrições dos itens (título e objeto pesam 3×, item pesa 1×), sem acento, com plural simples dobrado (`medicamentos` → `medicamento`) e sem termos que todo edital tem (`aquisição`, `registro`, `preços`, `serviços`, `material`, `municipal`…; lista em `src/domain/award-history.ts`).
4. **Parecida** quando o objeto do contrato (ou o título/objeto do edital de origem, se ele estiver no banco) tem **2 palavras-chave em comum**, ou **1 palavra-chave e a mesma categoria**. A categoria da compra antiga vem do edital no banco ou, sem ele, das regras de `src/titles/category-rules.ts` aplicadas ao objeto do contrato; `outros` não conta.
5. **Unidade:** se 3 ou mais compras parecidas são da mesma unidade compradora do edital (nome igual, sem acento/caixa), o histórico fica só nessa unidade (`scope=unit`); senão, o órgão inteiro (`scope=organization`).

**Números:**

- Vencedores: fornecedores com resultado ativo (`is_active`) em algum item da compra; sem resultado publicado, o fornecedor do contrato. `wins` = compras em que o fornecedor venceu ao menos um item. Até 5 no ranking.
- Preço praticado: por compra, soma dos valores homologados dos itens ativos (ou quantidade × unitário); sem resultado, soma dos valores global/inicial dos contratos. A resposta traz mínimo, mediana e máximo.
- Desconto típico: `percentualDesconto` homologado por item, só quando maior que zero (o PNCP publica `0` e vazio sem distinção); mediana e quartis.
- Compras recentes: as 6 mais recentes, com link do edital no PNCP (`https://pncp.gov.br/app/editais/<cnpj>/<ano>/<seq>`) e, se existir no banco, o link interno.

**Limites:** cobre só contratos já coletados (sem contrato coletado, a compra não aparece) e só o órgão que fez a licitação (adesões de outros órgãos à mesma ata ficam de fora). Palavra genérica fora da lista pode aproximar compras diferentes; sinônimos não aproximam (`notebook` × `computador portátil`). Por requisição, no máximo 3.000 contratos e 300 compras mais recentes. Ausência de histórico não comprova ausência de compras.

**Privacidade:** só empresas (`PJ`, ou CNPJ de 14 dígitos sem tipo) têm nome e CNPJ na resposta. Pessoa física (`PF` ou 11 dígitos), fornecedor estrangeiro (`PE`) e fornecedor sem identidade utilizável aparecem só como grupo (`kind` = `individual`, `foreign`, `unidentified`), sem nome nem documento, inclusive para quem tem acesso. A contagem de fornecedores distintos usa o documento internamente e devolve só o número.

**Acesso:** números agregados são públicos. Nomes e CNPJ das empresas exigem acesso ativo (assinatura, trial, cupom ou beta); sem ele saem `null` e `meta.access.unlocked=false`. A regra fica na constante `AWARD_HISTORY_WINNER_NAMES` em `artifacts/api-server/src/domain/award-history.ts` (`"entitled"` ou `"public"`).

**Desempenho:** sem migração. A busca por órgão é um intervalo `[cnpj, cnpj+1)` sobre os índices btree já existentes de `purchase_tender_key` (dígitos ordenam igual em qualquer collation), filtrado pelos `LIKE` das palavras-chave em `search_text` (que o planejador pode resolver pelo índice trigram). Resultados e editais de origem são lidos por chave. O agregado completo fica 10 minutos em cache em memória por processo (até 500 editais); os nomes são retirados por requisição, conforme o acesso. A resposta usa o mesmo cache HTTP das rotas públicas (`public` sem sessão, `private` com sessão). A UI carrega o bloco em requisição separada, depois do detalhe, com estado de carregamento próprio.

