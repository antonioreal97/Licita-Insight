# Borda Oracle via Tailscale

Dependencias integradas: PR #39 em `ops/macbook-worker` e PR #38 em `main`
(cabecalhos confiaveis da Vercel). Fluxo:
`Vercel -> HTTPS Oracle -> Tailscale -> proxy do servidor -> app:3001`.
O IP reservado e `137.131.233.192`; o hostname e `137-131-233-192.sslip.io`.
A VM usa Ubuntu 24.04 / E2.1.Micro porque A1 estava sem capacidade.

Os dois proxies reutilizam `ops/macbook/nginx/templates/default.conf.template`:
validacao de `x-abriu-origin`, IP do cliente autenticado por esse segredo,
limites, bloqueio de ingest/metrics e timeouts de 180s. O proxy da borda preserva
`x-abriu-origin` e `x-abriu-client-ip` para o proxy do servidor; o app continua
com `TRUST_PROXY=1`. O segredo deve ser o mesmo nas tres pontas. Health/readiness
continuam publicos. A VM executa somente o proxy; banco e app ficam no servidor.

## 1. Preparar o servidor

Instale/autentique Tailscale no host e obtenha o IPv4 com `tailscale ip -4`.
No `.env` do servidor, acrescente `MACBOOK_TAILSCALE_IP` com esse IP e confirme
`ORIGIN_SHARED_SECRET` (hexadecimal, gerado com `openssl rand -hex 32`).
Mantenha `PUBLIC_APP_ORIGIN` como a URL publica do frontend Vercel, usada por
OAuth/CSRF; o hostname da borda e apenas o upstream da API.

```sh
docker compose -f compose.macbook.yml -f compose.macbook.tailscale.yml config -q
docker compose -f compose.macbook.yml -f compose.macbook.tailscale.yml up -d --no-deps --force-recreate proxy
```

O override acrescenta somente `${MACBOOK_TAILSCALE_IP}:24252`, preservando
`127.0.0.1:24252`. Nao use `0.0.0.0`. O app e o PostgreSQL continuam sem portas
publicadas. A interface Tailscale precisa estar ativa antes da subida do proxy. Para
que um boot com Docker antes do Tailscale nao deixe o proxy sem subir (inclusive em
loopback),
instale as units de usuario no servidor. O usuario ja deve ter linger habilitado;
a unit aguarda ate cinco minutos pelo IPv4 Tailscale esperado e tenta novamente
a cada 30 segundos se Compose falhar:

```sh
cd ~/Documentos/LICITA/Licita-Insight
install -m 644 ops/macbook/licita-proxy-tailscale.service ops/macbook/licita-dashboard-tailscale.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now licita-proxy-tailscale.service licita-dashboard-tailscale.service
```

A unit do proxy executa `docker compose -f compose.macbook.yml -f
compose.macbook.tailscale.yml up -d --no-deps proxy`; a do Grafana espera o mesmo
IP antes de executar `docker compose -f ops/macbook/dashboard/compose.yml up -d`.
Use os mesmos arquivos Compose em todos os deploys futuros, inclusive nos comandos
do agente. Atualize a copia instalada de `~/licita-monitor/ALBERT.md` com a
orientacao deste PR.

## 2. Preparar a VM e o acesso privado

A VM ja tem os pacotes `nginx` e `certbot` do apt, com o Nginx do sistema
ativo na porta 80 e um certificado webroot em
`/etc/letsencrypt/live/137-131-233-192.sslip.io`. Mantenha os pacotes instalados,
mas desative os servicos que conflitam com a borda em container. Instale Docker
Engine pelo pacote `docker.io` e o plugin Compose do Ubuntu, ou pelo repositorio
oficial do Docker; por exemplo, no Ubuntu 24.04:

```sh
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo systemctl disable --now nginx certbot.timer
```

Autentique Tailscale no mesmo tailnet (o IPv4 atual da VM e `100.100.59.75`).
Na politica do Tailscale, autorize a identidade ou tag exclusiva da borda a acessar
**somente o servidor TCP 24252**. Remova
permissoes amplas que tambem se apliquem a essa identidade; as regras sao aditivas.
Teste esse acesso antes de publicar o proxy. Nao anuncie rotas nem use exit node.

Na Oracle, a subnet deve usar a Security List com TCP 80 e 443 de `0.0.0.0/0`,
e rota `0.0.0.0/0` para Internet Gateway. O firewall do Ubuntu tambem precisa
permitir TCP 80/443, respostas a conexoes de saida e SSH via Tailscale. Conserve
a porta 22 publica ate testar uma **nova sessao SSH pelo Tailscale**; so depois
remova a regra publica 22 da Oracle e do firewall local.

Clone ou copie o repositorio contendo este PR em `/opt/abriu-edge`. Dentro de
`ops/oracle-edge`, copie `.env.example` para `.env`, preencha o IP Tailscale do
servidor (`100.76.192.116`) e o segredo e aplique `chmod 600 .env`.
`network_mode: host` e intencional: o Nginx usa o Tailscale do host Linux. A porta
8080 da borda fica em loopback.

## 3. Emitir HTTPS e subir a borda

Confirme que o DNS do hostname resolve para o IP reservado. O caminho padrao do
PR emite um certificado com o nome `abriu-edge` no volume do Compose. O Nginx e
o timer do Certbot do apt ja foram desativados acima, entao a porta 80 fica livre.
Ainda nao suba o servico `proxy`, que precisa dos arquivos do certificado.

```sh
cd /opt/abriu-edge/ops/oracle-edge
mkdir -p letsencrypt acme
# Informe um email real para avisos do certificado. Execute apos aceitar os termos ACME.
read -r -p 'Email para certificado: ' CERT_EMAIL
docker compose run --rm -p 80:80 certbot certonly --standalone \
  --cert-name abriu-edge -d 137-131-233-192.sslip.io \
  --email "$CERT_EMAIL" --agree-tos --non-interactive
docker compose up -d proxy
docker compose exec -T proxy nginx -t
```

Nao ha certificado ficticio nem fallback HTTP para a API. A porta 80 atende
ACME e redireciona o restante para HTTPS. Os certificados ficam fora do Git.
Se houver bloqueio ou limite de emissao no dominio compartilhado sslip.io,
resolva a emissao antes da virada; nao ignore erros de validacao TLS.

Instale a renovacao automatica (ajuste `ExecStart` se mudar o caminho):

```sh
sudo install -m 644 abriu-edge-renew.service abriu-edge-renew.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now abriu-edge-renew.timer
docker compose run --rm certbot renew --dry-run --webroot -w /var/www/acme
```

O timer executa duas vezes ao dia. `renew.sh` renova via webroot sem parar Nginx,
valida a configuracao e recarrega o certificado. Verifique falhas com
`journalctl -u abriu-edge-renew.service`.

## 4. Validar antes da virada

- Da VM: health/readiness do servidor via IP Tailscale e porta 24252 retornam 200.
- De fora: `https://137-131-233-192.sslip.io/api/readyz` retorna 200 com TLS valido,
  sem `curl -k`. HTTP redireciona para HTTPS; ingest e metrics retornam 404.
- Uma rota normal de API sem segredo retorna 403; com o segredo correto, responde
  como no origin atual. Nos dois proxies, confirme `origin_valid:"sim"`.
- Confirme que o middleware atualmente publicado na Vercel sobrescreve
  `x-abriu-origin` com `ORIGIN_SHARED_SECRET` e `x-abriu-client-ip` com o IP
  confiavel da Vercel. O #39 sozinho nao publica essa mudanca no frontend;
  o middleware legado em `ops/vercel` nao satisfaz esse requisito.
- Teste login Google, cookies, busca, detalhes e resposta longa de IA pela Vercel
  em preview com o novo upstream antes de mudar a producao.

## 5. Virada e reversao

Somente apos os testes, pare temporariamente o sincronizador para impedir que
sobrescreva a URL durante a virada:

```sh
systemctl --user stop licita-ngrok-vercel-sync.timer licita-ngrok-vercel-sync.service
```

Mantenha ngrok em execucao para rollback. Na Vercel, altere
`API_UPSTREAM_ORIGIN` de producao para `https://137-131-233-192.sslip.io`, preserve
`ORIGIN_SHARED_SECRET` e publique um novo deployment. Registre previamente o
upstream antigo. Teste os fluxos acima na producao e observe erros e latencia.
Depois do sucesso:

```sh
systemctl --user disable licita-ngrok-vercel-sync.timer
# Se ngrok roda como servico do host:
systemctl --user disable --now ngrok-licita.service
# Se roda no Compose, em vez do comando anterior:
# docker compose -f compose.macbook.yml -f compose.macbook.ngrok.yml stop ngrok
```

Nao use `down`: o banco e o app devem continuar ativos. Retire o override ngrok
dos deploys futuros e mantenha o override Tailscale. Se necessario, recrie o app
para aplicar `PUBLIC_APP_ORIGIN` da Vercel, preservando o volume do banco.

Para reverter, religue o ngrok, restaure `API_UPSTREAM_ORIGIN` anterior e faca
redeploy. Reative `licita-ngrok-vercel-sync.timer` apenas quando a rota ngrok
estiver validada. A publicacao local em 127.0.0.1 continua disponivel.
