# MacBook 24 horas (stack local)

Esta instalacao usa `compose.macbook.yml`: PostgreSQL 16 persistente, API, frontend
compilado e agendadores no mesmo container. Nao usa Ollama, Vite de desenvolvimento
nem hospedagem publica. A interface escuta apenas em `localhost:24252`; o PostgreSQL
nao publica porta. A imagem `linux/amd64` funciona em Macs Intel e, com emulacao
Docker, em Apple Silicon. Deixe o Mac ligado, sem suspensao automatica, e configure
o Docker Desktop para iniciar no login.

## 1. Preparar o clone

```sh
git clone --branch ops/macbook-worker https://github.com/antonioreal97/Licita-Insight.git
cd Licita-Insight
cp docs/ops/macbook-worker.env.example .env
chmod 600 .env
uname -m
docker compose version
```

Edite `.env` localmente. Gere valores independentes para `MAC_DB_PASSWORD` e
`SESSION_SECRET` com `openssl rand -hex 32`. A senha do banco deve conter somente
caracteres seguros para URL (a saida hexadecimal serve). Reutilize a chave OpenAI
existente em `OPENAI_API_KEY`, sem envia-la pelo chat ou coloca-la no Git. Configure
o mesmo cliente OAuth do Google e confirme que ele aceita a URI de redirecionamento
`http://localhost:24252/api/v1/auth/google/callback`. `SESSION_SECRET` precisa ser
estavel para manter sessoes entre restarts. O `.env` ja e ignorado pelo Git.

Deixe as tres flags `*_DAILY_COLLECT=false` ate terminar a restauracao. Nao rode
`docker compose up` com o compose de desenvolvimento neste clone: ele cria outra
topologia e publica o banco. Nao e necessario rodar `pnpm install` no Mac para
esta stack; as dependencias ficam dentro das imagens.

## 2. Fazer o corte do banco atual

A base de origem e o PostgreSQL da stack atual em `localhost:24252`. O dump deve
ser feito **no computador de origem**, na raiz do checkout que executa essa stack.
Pode-se tirar um dump preliminar com a aplicacao ativa para medir a transferencia,
mas o dump final precisa ocorrer depois de parar os coletores antigos:

```sh
docker compose stop api web worker
docker compose exec -T postgres pg_dump -U licita -d licita -Fc > "$HOME/licita-macbook-final.dump"
```

Confira que o arquivo nao esta vazio e transfira-o ao MacBook por um meio privado,
fora do repositorio. O dump inclui contas e outros dados sensiveis. Nao reinicie a
API antiga depois do dump final: duas bases independentes passariam a divergir.

No MacBook, com `.env` preenchido, suba **somente** o banco e restaure no banco
recem-criado e vazio:

```sh
docker compose -f compose.macbook.yml up -d postgres
docker compose -f compose.macbook.yml exec -T postgres \
  pg_restore --exit-on-error --no-owner --no-privileges -U licita -d licita \
  < "$HOME/licita-macbook-final.dump"
```

Se o restore falhar, nao inicie a aplicacao nem continue em cima de um banco
parcial. Investigue a causa e recrie **somente o volume novo do MacBook**, apos
confirmar que nao ha dados nele que precisem ser preservados. O volume de origem
jamais deve ser apagado como parte deste procedimento.

O dump ja contem o schema e os dados. **Nao execute `db-setup` nem `migrate` depois
de restaura-lo.** A base atual tem as tabelas das migrations 0024/0025 aplicadas
por `push-force`, mas o historico Drizzle ainda termina em 0023; `migrate` pode
tentar recriar objetos existentes. Antes de qualquer futura alteracao de schema,
faca um novo backup e reconcilie esse historico.

## 3. Validar e assumir as coletas

Confira os totais restaurados antes de ligar os agendadores:

```sh
docker compose -f compose.macbook.yml exec -T postgres \
  psql -U licita -d licita -Atc 'select count(*) from tenders'
docker compose -f compose.macbook.yml exec -T postgres \
  psql -U licita -d licita -Atc 'select count(*) from pncp_contracts'
```

Compare com a origem (na medicao de 05/10/2026: cerca de 145 mil editais e 52 mil
contratos). Depois altere no `.env` as tres flags `PNCP_DAILY_COLLECT`,
`TRANSPARENCY_DAILY_COLLECT` e `CULTURE_DAILY_COLLECT` para `true`. Inicie a stack:

```sh
docker compose -f compose.macbook.yml up -d --build
docker compose -f compose.macbook.yml ps
curl -fsS http://localhost:24252/api/healthz
curl -fsS http://localhost:24252/api/readyz
```

Abra `http://localhost:24252` no proprio MacBook. Verifique login Google, busca,
detalhe de edital, `/transparencia` e `/oportunidades`. Veja os primeiros logs com
`docker compose -f compose.macbook.yml logs --tail=200 app`, sem compartilhamento
de linhas que contenham segredos. A coleta PNCP comeca ao subir e roda diariamente;
somente editais novos ou cujo titulo oficial mudou entram na fila OpenAI. A chave
nao reprocessa o acervo antigo. Os limites iniciais sao 500 titulos/dia e
US$ 10/dia para o orcamento de IA compartilhado. Ajuste os limites no `.env`
conforme o uso real. As categorias desses novos editais tambem saem da resposta
OpenAI; `TITLE_TEACHER_ENABLED` e `CATEGORY_STUDENT_ENABLED` ficam desligados.

O webhook Asaas nao consegue alcancar um Mac exposto somente em localhost. A busca
e a consulta publica funcionam, mas assinatura/checkout automatizado precisam de
um endpoint publico ou outra integracao antes do uso comercial.

## Operacao

```sh
docker compose -f compose.macbook.yml ps
docker compose -f compose.macbook.yml logs --tail=100 app
docker compose -f compose.macbook.yml restart app
docker compose -f compose.macbook.yml stop
```

`restart: unless-stopped` recupera containers depois de reinicio do Docker, desde
que Docker Desktop inicie no login. `docker compose down` sem `-v` preserva o banco;
**nunca use `down -v` no MacBook com dados**. Mantenha backups periodicos com
`pg_dump -Fc` em destino privado fora do clone e teste uma restauracao isolada.
