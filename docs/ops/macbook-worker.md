# MacBook 24 horas (stack local)

Esta instalacao usa `compose.macbook.yml`: PostgreSQL 16 persistente, API, frontend
compilado e agendadores no mesmo container. Nao usa Ollama, Vite de desenvolvimento
nem hospedagem publica por padrao. A interface escuta apenas em `localhost:24252`; o PostgreSQL
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

## Acesso remoto por ngrok

O tunnel e opcional e so deve ser ativado depois do restore, com a aplicacao
saudavel. Ele torna o app acessivel pela internet; as rotas privadas continuam
exigindo login/assinatura, mas busca e outras rotas publicas ficam publicas.
O PostgreSQL e a API na porta 3001 nao sao publicados separadamente.

Se o ngrok ja foi instalado no MacBook e encaminha para `localhost:24252`, nao
inicie um segundo agente. No `.env` local, defina a URL HTTPS atual sem barra
final e habilite a confianca em um proxy:

```dotenv
PUBLIC_APP_ORIGIN=https://exemplo.ngrok-free.app
TRUST_PROXY=1
```

Recrie o app para aplicar as variaveis: `docker compose -f compose.macbook.yml
up -d --force-recreate app`. Verifique a URL externa com
`curl -fsS https://exemplo.ngrok-free.app/api/readyz`. O login e as escritas
devem ser feitos pela URL HTTPS, nao por `localhost`. Se o ngrok atribuir outra
URL em um restart, atualize `PUBLIC_APP_ORIGIN` e recrie o app novamente.

No cliente OAuth do Google, adicione
`https://exemplo.ngrok-free.app/api/v1/auth/google/callback` como URI de
redirecionamento autorizada. Se usar o Asaas, configure o webhook para
`https://exemplo.ngrok-free.app/api/v1/billing/asaas/webhook` e mantenha
`ASAAS_WEBHOOK_TOKEN` configurado. Uma URL variavel exige atualizar essas
integracoes a cada troca.

Para operar o agente ngrok pelo Docker em vez do host, pare primeiro o agente
atual e obtenha no painel ngrok o authtoken e uma URL HTTPS estavel atribuida a
sua conta. Preencha `NGROK_PUBLIC_URL` e `NGROK_AUTHTOKEN` no `.env` local, sem
enviar o token pelo chat ou versionar o arquivo. Entao use:

```sh
docker compose -f compose.macbook.yml -f compose.macbook.ngrok.yml up -d --build
docker compose -f compose.macbook.yml -f compose.macbook.ngrok.yml ps
```

Esse modo ajusta `PUBLIC_APP_ORIGIN` e `TRUST_PROXY` da API automaticamente.
Para voltar a usar somente localhost, pare o tunnel, remova ou comente as linhas
`PUBLIC_APP_ORIGIN` e `TRUST_PROXY` do `.env`, e recrie o app com o Compose basico:

```sh
docker compose -f compose.macbook.yml -f compose.macbook.ngrok.yml stop ngrok
docker compose -f compose.macbook.yml up -d --force-recreate app
```

O plano gratuito do ngrok tem limites de trafego e uma pagina intermediaria para
acessos via navegador; valide a experiencia e os webhooks antes de depender dele
em uso comercial continuo.

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

## Frontend na Vercel e sincronização ngrok -> Vercel

O frontend público fica no projeto Vercel `abriu-la` (https://abriu-la.vercel.app). Um Routing Middleware
encaminha `/api/*` para `API_UPSTREAM_ORIGIN` (a URL do ngrok) com `ngrok-skip-browser-warning`; API, banco e
coletas continuam neste servidor, com `PUBLIC_APP_ORIGIN=https://abriu-la.vercel.app` e `TRUST_PROXY=2` no
`.env`. A URL de callback cadastrada no Google é `https://abriu-la.vercel.app/api/v1/auth/google/callback`.

Enquanto o ngrok usar URL aleatória, `ops/macbook/ngrok-vercel-sync.sh` mantém a Vercel atualizada: a cada
minuto compara a URL do túnel com a última publicada e, quando muda, atualiza `API_UPSTREAM_ORIGIN`, refaz o
deploy de produção e confere `https://abriu-la.vercel.app/api/readyz`. Instalação (systemd de usuário):

```sh
install -m 755 ops/macbook/ngrok-vercel-sync.sh ~/.local/bin/licita-ngrok-vercel-sync
cp ops/macbook/licita-ngrok-vercel-sync.{service,timer} ~/.config/systemd/user/
install -d -m 700 ~/.config/licita
install -m 600 /dev/null ~/.config/licita/vercel-token   # cole o token da Vercel aqui
systemctl --user daemon-reload
systemctl --user enable --now licita-ngrok-vercel-sync.timer
```

O token é um Vercel Access Token com escopo no time do projeto; ele fica só neste arquivo. Teste sem alterar
nada com `FORCE=1 DRY_RUN=1 ~/.local/bin/licita-ngrok-vercel-sync` e acompanhe com
`journalctl --user -u licita-ngrok-vercel-sync.service -f`. Durante a troca, `/api` na Vercel fica indisponível
por cerca de 1 a 2 minutos (detecção + deploy). Com um domínio ngrok fixo, a sincronização deixa de ser necessária.

### Publicar o frontend deste checkout

No Mac com a CLI da Vercel autenticada e o vínculo do projeto em
`~/abriu-la-vercel/.vercel/project.json`, execute na raiz do repositório:

```sh
ops/vercel/deploy.sh
```

O script instala as dependências pelo lockfile, compila a UI com `/api` na mesma
origem e publica somente `dist/public` e os arquivos em `ops/vercel/` no projeto
`abriu-la`. Ao terminar, compara o bundle do HTML público com o build local e
verifica `/api/readyz` e `/transparencia`. A variável `API_UPSTREAM_ORIGIN`
continua sob responsabilidade da sincronização no servidor; este deploy não a altera.
Se o túnel mudar e o serviço do servidor fizer outro deploy a partir de um pacote
antigo, será necessário atualizar aquele pacote para evitar a volta da UI antiga.

## Monitor do servidor (Albert-CLAUDE)

`ops/macbook/monitor/` instala em `~/licita-monitor/` um monitor sem LLM e o runbook do agente:

- `licita-monitor-check.timer` (5 min): coleta usuários, consumo HTTP/OpenAI, jobs de IA, coletas, containers,
  disco/memória, ngrok e `readyz` local/público. Anomalia **nova** (deduplicada por 6 h, no máximo 6 acionamentos
  por dia) vira `~/licita-monitor/alerts/<data>.json` e um prompt curto no terminal do Albert-CLAUDE (Claude Code
  no Orca do servidor, via `~/.config/orca/linux-orca-cli-shim/orca terminal send`). Ele segue `ALBERT.md`
  (somente leitura) e comenta a causa provável e a ação sugerida na issue #29.
- `licita-monitor-digest.timer` (08:00): relatório diário sem LLM na issue #29.
- Configuração em `~/licita-monitor/config.env` (`MONITOR_ISSUE`, `ALBERT_TERMINAL`, limites). Teste com
  `python3 ~/licita-monitor/licita_monitor.py status`.

- `licita-monitor-deploy.timer` (10 min): `git fetch` da `ops/macbook-worker`; havendo commits novos, grava
  `~/licita-monitor/alerts/deploy-<data>.json` (commits, arquivos, tipos `app_build`/`monitor_ops`/`docs`/`db_schema`)
  e aciona o agente, que segue a seção "Atualização da branch" do `ALBERT.md`: `pull --ff-only`, rebuild só do app
  quando há código, reinstalação do monitor quando muda `ops/macbook/`, e **nunca** aplica `db_schema` sozinho.

O histórico do Drizzle (`drizzle.__drizzle_migrations`) foi reconciliado em 06/10 com 0024–0026 (hash SHA-256 de
cada `.sql` e `created_at` = `when` do `_journal.json`), então `migrate` não tenta recriar tabelas existentes.

No Linux, `/usr/bin/orca` é o leitor de tela do GNOME; nunca o execute.
