# Avisos de aquisição do BID nas Internacionais

Os avisos de aquisição do BID (Banco Interamericano de Desenvolvimento) passam a entrar na coleta internacional diária como fonte `idb`. Aparecem em Internacionais com o selo **BID**, entram no filtro de fonte e mostram, no item e no detalhe, a atribuição exigida pela licença: “Fonte: BID (Banco Interamericano de Desenvolvimento), CC BY 4.0”. O uso foi autorizado pelo próprio BID; o registro está em [`docs/ops/autorizacoes-fontes.md`](../../ops/autorizacoes-fontes.md). As regras de coleta, prazo e elegibilidade estão em [`docs/contracts/opportunities-v1.md`](../../contracts/opportunities-v1.md).

## Capturas

Dados reais: uma coleta do BID (4 requisições a `data.iadb.org`, 113 avisos abertos em 15/10/2026) gravada num Postgres temporário. A tela vem do frontend desta branch, com sessão e assinatura simuladas por `review-server.ts`. Viewports: desktop 1440 × 1000 e celular 390 × 844.

| Tela                                         | Captura                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| Lista filtrada por BID / desktop / Creme     | [lista-bid-desktop-creme](capturas/lista-bid-desktop-creme.png)           |
| Lista filtrada por BID / desktop / Petróleo  | [lista-bid-desktop-petroleo](capturas/lista-bid-desktop-petroleo.png)     |
| Lista filtrada por BID / celular / Creme     | [lista-bid-celular-creme](capturas/lista-bid-celular-creme.png)           |
| Filtro de fonte com BID / desktop / Creme    | [filtro-fonte-desktop-creme](capturas/filtro-fonte-desktop-creme.png)     |
| Detalhe de aviso do BID / desktop / Creme    | [detalhe-bid-desktop-creme](capturas/detalhe-bid-desktop-creme.png)       |
| Detalhe de aviso do BID / celular / Petróleo | [detalhe-bid-celular-petroleo](capturas/detalhe-bid-celular-petroleo.png) |

O menu lateral destaca “Editais nacionais” no detalhe internacional; esse comportamento já existia e não muda aqui.

## Reprodução local

Postgres temporário próprio (um container de 512 MB), esquema aplicado com `push-force` e uma coleta só do BID:

```sh
docker run -d --name feat-idb-procurement-pg -m 512m -e POSTGRES_USER=licita -e POSTGRES_PASSWORD=licita -e POSTGRES_DB=licita_test -p 55445:5432 postgres:16
DATABASE_URL=postgres://licita:licita@localhost:55445/licita_test pnpm --filter @workspace/db run push-force
cd artifacts/api-server
DATABASE_URL=postgres://licita:licita@localhost:55445/licita_test INTERNATIONAL_SOURCES=idb pnpm run collect:international
DATABASE_URL=postgres://licita:licita@localhost:55445/licita_test npx tsx ../../docs/reviews/idb-procurement/review-server.ts
```

Em outro terminal, o frontend (proxy `/api` para `:3001`) e um Chrome headless com CDP em 24733:

```sh
PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run dev
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=24733 --user-data-dir=/tmp/idb-chrome --no-first-run about:blank
cd docs/reviews/idb-procurement && node capture.mjs http://localhost:24252 ./capturas
```

Encerrar os processos e remover o container ao terminar.
