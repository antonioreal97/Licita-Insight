# Beta fechado no Mac — runbook do owner

Lançamento em beta gratuito para 3–5 convidados, rodando no Mac do owner e exposto na internet por um
Cloudflare Tunnel com domínio próprio. Sem cobrança: o acesso é liberado por convite, até uma data. O Fly
([`docs/ops/deploy-fly.md`](deploy-fly.md)) é o passo seguinte, com ~3 usuários ativos.

O stack do beta é independente do stack de desenvolvimento: projeto Compose `licitai-beta`, Postgres e
volume próprios (`beta_pg_data`), **nenhuma porta publicada no Mac** e nada em comum com os containers
`licita-insight-*`. Os dois podem rodar ao mesmo tempo.

**Limitações aceitas:** se o Mac dormir, desligar ou perder a internet, o site sai do ar e a coleta diária
não roda. Os dados dos convidados ficam neste Mac (por isso o backup vai para uma pasta sincronizada fora
dele). Não serve para cobrar de clientes.

## 1. Segredos (uma vez)

Os arquivos de segredo ficam **fora do repositório**, em `~/.licitai-secrets/`, e nunca são commitados.

```sh
mkdir -p ~/.licitai-secrets && chmod 700 ~/.licitai-secrets
cp deploy/beta-local/beta.env.example ~/.licitai-secrets/beta.env
cp deploy/beta-local/cloudflared.env.example ~/.licitai-secrets/cloudflared-beta.env
chmod 600 ~/.licitai-secrets/*.env
openssl rand -hex 24   # use como POSTGRES_PASSWORD (hex não precisa de URL-encode)
openssl rand -hex 32   # use como SESSION_SECRET
```

Preencha `~/.licitai-secrets/beta.env` (a lista completa está no `.example`):

- `POSTGRES_PASSWORD` e o **mesmo** valor dentro de `DATABASE_URL`.
- `PUBLIC_APP_ORIGIN=https://<host-do-beta>` — exatamente o endereço público do passo 3, sem barra no fim.
  O login e a proteção contra CSRF dependem dele.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JEV_API_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `MAIL_FROM`.
- `PNCP_LOOKBACK_DAYS` — janela da primeira coleta (seção 6).
- `ASAAS_*` fica **ausente** no beta: o checkout responde indisponível e o webhook não é usado; o acesso dos
  convidados vem do convite (seção 5).

## 2. Mac sempre ligado

- Ajustes do Sistema → Bateria → Opções: **impedir repouso automático no adaptador de energia quando a tela
  estiver desligada** (em Mac de mesa: Energia). Deixe o Mac na tomada.
- Docker Desktop → Settings → General → **Start Docker Desktop when you sign in**. Todos os serviços do beta
  usam `restart: unless-stopped` e voltam sozinhos quando o Docker volta. (Neste projeto o Docker Desktop
  já reiniciou sozinho uma vez; com isso ligado, o beta volta junto.)

## 3. Domínio e Cloudflare Tunnel

1. Adicione o domínio à Cloudflare (plano Free) e troque os nameservers no registro.br pelos que a
   Cloudflare indicar. Aguarde a zona ficar "Active".
2. Zero Trust → Networks → Tunnels → **Create a tunnel** (tipo Cloudflared), nome `licitai-beta`.
   **Não instale o cloudflared no Mac**: da tela de instalação, copie só o token (o texto depois de
   `--token`) para `TUNNEL_TOKEN=` em `~/.licitai-secrets/cloudflared-beta.env`.
3. Public Hostname: o host escolhido (ex. `beta.<dominio>`), Service **HTTP**, URL **`app:3001`**. Esse host
   é o `PUBLIC_APP_ORIGIN` do passo 1.
4. Segurança → WAF → **Custom rules → Create rule**: bloquear quando o *URI Path* **começa com**
   `/api/v1/ingest`. As rotas de ingestão não têm autenticação (só limite de 3/min); no beta a coleta roda
   sozinha pelo agendador, então elas não precisam ficar públicas.

## 4. Google OAuth e Resend

- Google Cloud Console → o cliente OAuth do app: em *Authorized redirect URIs* adicione
  `https://<host-do-beta>/api/v1/auth/google/callback` (mesmo host do `PUBLIC_APP_ORIGIN`).
- Tela de consentimento em **Testing** e cada convidado em **Test users** (até 100). Fora dessa lista o
  Google não deixa entrar.
- Resend → Domains → adicione o domínio e publique os registros DNS na Cloudflare. Use em `MAIL_FROM` um
  remetente desse domínio (ex. `Abriu lá <alertas@<dominio>>`). Com `onboarding@resend.dev` o Resend só
  entrega para o e-mail da própria conta.

## 5. Subir, convidar e ir ao ar

O beta começa com **somente dados públicos e análises compartilhadas** do desenvolvimento. Gere um
arquivo novo no dia da carga (o dump integral não é apropriado para o beta):

```sh
mkdir -p .local/backups/postgres
deploy/beta-local/export-shared.sh .local/backups/postgres/licitai-beta-shared-AAAAMMDD.dump
```

O export inclui `tenders` (metadados, classificação e títulos), `cultural_opportunities`, `ingest_days`
e os índices, documentos, trechos, fichas, respostas compartilhadas e exemplos de títulos. Ele **não**
inclui contas, sessões, assinaturas, salvos, perguntas individuais, perfis de empresa, notificações ou
uso/custos de IA. Guarde o hash SHA-256 exibido e confira a contagem num ensaio/restauração do snapshot
antes de convidar alguém. O arquivo fica em `.local/`, ignorado pelo Git.

Suba **só o banco e as migrações** primeiro; não inicie o app/coletor até a importação terminar:

```sh
docker compose -f deploy/beta-local/docker-compose.yml up -d --build db migrate
docker compose -f deploy/beta-local/docker-compose.yml ps                    # migrate "exited (0)"
deploy/beta-local/import-shared.sh .local/backups/postgres/licitai-beta-shared-AAAAMMDD.dump --yes
docker compose -f deploy/beta-local/docker-compose.yml up -d --build app
docker compose -f deploy/beta-local/docker-compose.yml ps                    # migrate "exited (0)"; app "Up"
deploy/beta-local/check-preinvite.sh                                        # dados pessoais = 0; prazos = OK
```

`import-shared.sh` exige banco vazio já migrado (incluindo `0024`), restaura apenas as nove tabelas
permitidas na ordem das chaves estrangeiras, atualiza os prazos vencidos e falha se qualquer tabela não
compartilhada tiver registros. `check-preinvite.sh` repete a verificação no beta real e exige que a rotina
horária de prazos já tenha rodado com sucesso. **Não use `restore.sh` para essa carga**: ele restaura contas e dados
pessoais também. Se a importação falhar no meio, não a rode novamente sobre o banco parcialmente cheio;
recrie apenas o volume beta descartável antes de receber usuários, refaça as migrações e repita.

Libere cada convidado (e-mail do Google dele; guardado em minúsculas; vale até a data):

```sh
docker compose -f deploy/beta-local/docker-compose.yml run --rm --no-deps app \
  node /app/lib/db/scripts/beta-access.mjs grant convidado@gmail.com 2026-12-31T23:59:59-03:00
# ... revoke convidado@gmail.com   |   list
```

O convite vale para o bloqueio de funções pagas, para a tela de Configurações ("Acesso beta por convite")
e para os e-mails de alerta. Depois da data, a conta volta a pedir assinatura; revogar corta na hora. O
webhook e o cancelamento do Asaas nunca alteram convites.

Por último, ligue o túnel:

```sh
docker compose -f deploy/beta-local/docker-compose.yml --profile tunnel up -d cloudflared
```

**Conferências depois de ir ao ar:**

1. `https://<host-do-beta>` abre a busca; `https://<host-do-beta>/api/readyz` responde `{"status":"ok"}`.
2. Login com uma conta de convidado funciona e Configurações mostra "Acesso beta por convite".
3. `https://<host-do-beta>/api/v1/ingest/pncp` responde **bloqueado pela Cloudflare** (regra do passo 3.4).
4. IP real no limite de taxa: o app usa `TRUST_PROXY=1` (confia só no salto `cloudflared → app`; o cliente
   não consegue forjar o IP prefixando `X-Forwarded-For` — coberto por teste). Se todos os convidados
   estiverem recebendo `429` juntos, o túnel está entregando o IP da Cloudflare em vez do do visitante;
   nesse caso avise o time antes de convidar mais gente.

## 6. Coleta de editais

A coleta diária do PNCP e das chamadas culturais roda sozinha no app: ao subir e todo dia às 06:00
(`America/Sao_Paulo`). Após a importação, o banco já tem os editais e o calendário do desenvolvimento.
O calendário `ingest_days` pula os dias já fechados, e cada dia novo custa só a coleta daquele dia. Uma
rotina horária também muda editais `open` para `under_review` quando o prazo de proposta passa.

Medido em 28 set 2026 neste Mac (Apple Silicon, imagem amd64 emulada), num banco vazio: **um dia útil do
Brasil inteiro (25/09/2026) = 5.264 editais, 115 páginas, ~11 min, +28 MB** (≈ 5,3 KB por edital com
índices). O gargalo é a API do PNCP, não o Mac. Projeção para a primeira subida:

| `PNCP_LOOKBACK_DAYS` | Editais (aprox.) | Tempo, uma vez | Espaço |
|---:|---:|---:|---:|
| 7 | ~27 mil | ~1h15 | ~150 MB |
| **14 (recomendado)** | **~53 mil** | **~2h30** | **~290 MB** |
| 30 (padrão do código) | ~115 mil | ~5h30 | ~600 MB |

Para uma instalação sem importação, recomenda-se **14** dias, porque o prazo de proposta costuma cair
8–15 dias depois da publicação. Com a importação, mantenha `PNCP_LOOKBACK_DAYS=14` para completar dias
ausentes. Suba o beta à noite; a busca já funciona enquanto a coleta avança.
Depois disso, cada dia novo custa ~11 min e ~28 MB (≈ 0,6 GB/mês; `tenders` não expira por decisão do
owner). Para acompanhar:

```sh
docker compose -f deploy/beta-local/docker-compose.yml logs -f app | grep "PNCP ingest"
```

Para refazer uma janela específica (por exemplo, um dia que falhou por timeout do PNCP), defina
`PNCP_FROM`/`PNCP_TO` (datas `AAAA-MM-DD`, força a recoleta) no `beta.env`, rode
`docker compose -f deploy/beta-local/docker-compose.yml up -d app` (o `restart` não relê o arquivo) e
**remova as duas variáveis depois**, senão toda subida repete aquela janela.

## 7. Backup e restauração

Backup noturno para uma pasta **sincronizada fora do Mac** (iCloud Drive, Google Drive ou similar), com
retenção de 14 dias (`BETA_BACKUP_RETENTION_DAYS`). O dump só aparece na pasta quando termina bem.

Crie `~/Library/LaunchAgents/com.licitai.beta-backup.plist` (troque `<repo>` pelo caminho absoluto do
repositório e `<pasta>` pela pasta de backup):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.licitai.beta-backup</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string><repo>/deploy/beta-local/backup.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>BETA_BACKUP_DIR</key><string><pasta></string>
  </dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>/tmp/licitai-beta-backup.log</string>
  <key>StandardErrorPath</key><string>/tmp/licitai-beta-backup.log</string>
</dict>
</plist>
```

```sh
launchctl load ~/Library/LaunchAgents/com.licitai.beta-backup.plist
launchctl start com.licitai.beta-backup && cat /tmp/licitai-beta-backup.log   # teste agora
```

Restaurar **substitui o banco atual** (o script para o app, recria o banco, restaura e religa o app):

```sh
deploy/beta-local/restore.sh "<pasta>/licitai-beta-AAAAMMDDTHHMMSSZ.dump" --yes
```

## 8. Depois: levar o beta para o Fly

Quando o Fly estiver pronto ([`docs/ops/deploy-fly.md`](deploy-fly.md)): pare o túnel, faça um backup com
`deploy/beta-local/backup.sh`, restaure o dump no banco privado do Fly com `pg_restore --no-owner --no-acl`
antes do primeiro `release_command` rodar migrations novas, aponte o DNS do domínio para o Fly e atualize a
redirect URI do Google. Os convites continuam valendo, porque viajam no dump.
