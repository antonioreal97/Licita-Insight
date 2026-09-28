# Participação — ativação local em 28/09/2026

## Resultado

Migration `0019_participation` aplicada ao banco local `licita`. API e frontend recriados com o código de
`/Users/antonio/orca/workspaces/Licita-Insight/main`, disponíveis em `http://localhost:24252`.
Projeto Docker `licita-insight`; Postgres e volume `licita-insight_licita_pg` permaneceram em execução, sem recriação.
Não houve deploy no Fly, commit, push, reset do banco ou execução de `push-force`/`db-setup`.

## Reconciliação autorizada pelo owner

O ledger tinha apenas as migrations 0001–0005, embora o schema já contivesse as mudanças até a 0018.
Antes de alterar o banco real:

1. Um backup completo foi restaurado em banco isolado, com `pg_restore --exit-on-error`.
2. Outro banco vazio foi migrado pelas migrations versionadas 0000–0018.
3. A comparação de extensões, relações, colunas/defaults, constraints, índices e views resultou em **diff vazio**.
   Foram reutilizadas as consultas de catálogo de `lib/db/scripts/verify-migrations.mjs`.
4. Reconciliação e 0019 foram ensaiadas na cópia; uma segunda execução da migração foi idempotente.
5. Contagens e fingerprints de todas as linhas/colunas anteriores das 26 tabelas públicas permaneceram iguais.

No banco real, com API/frontend parados, foi feito novo backup e repetida a comparação de estrutura.
Em transação com `lock_timeout=5s`, `statement_timeout=30s` e lock exclusivo do ledger, foram inseridos
somente os 14 registros ausentes: 0000 e 0006–0018. Os cinco registros antigos não foram alterados.
Essas inserções registram uma **baseline reconciliada por equivalência de estrutura**, não comprovam
que cada arquivo foi executado originalmente. O `created_at` é o identificador temporal do journal, não a hora desta operação.

### Exceção histórica da 0004

O checksum já gravado da `0004_email_alerts` difere do arquivo atual:

- Histórico preservado: `37a696b1ac96536e8f1479fa8252898c3aaee4d82ee3890ce0ba6a236ae13d5d`.
- Arquivo atual: `ae8a36f24e48ff2a75e42f5180313baf1ee7e6b811fa4192cec98749c0bd49b1`.

A versão original desse arquivo não foi recuperada; sua execução exata não foi presumida. O schema final
foi comprovado equivalente ao gerado pelos arquivos atuais. O checksum original foi mantido para não
reescrever a evidência histórica. Um verificador que exija igualdade literal de todos os checksums ainda
deverá considerar essa exceção documentada. Nenhum outro checksum existente divergiu.

A correção histórica de dados da 0008 não foi reexecutada: não havia documentos com status `failed`,
nem índices `failed` com documentos `ready`, na cópia auditada. Assim não foram reiniciadas tentativas
nem modificados timestamps antigos de processamento.

## Aplicação e integridade

A 0019 foi aplicada pelo runner oficial, com `DATABASE_URL` explícito e timeouts via `PGOPTIONS`:

```sh
pnpm --filter @workspace/db run migrate
```

A segunda execução não alterou nada. O ledger terminou com 20 entradas. A estrutura real pós-migração
foi comparada a uma base vazia migrada até a 0019: **diff vazio**.

Antes de reiniciar os serviços, todas as contagens e fingerprints dos dados/colunas anteriores das
26 tabelas públicas continuaram idênticas. Entre eles: 8.431 editais, 10 oportunidades culturais,
1 usuário e 3 editais salvos. Os três salvos receberam `stage=analyzing`, `stage_at=saved_at`,
checklist/histórico vazios e campos opcionais nulos, sem histórico fictício.
Depois do reinício, os jobs normais voltaram a gravar seus registros operacionais.

Backup completo imediatamente anterior à alteração, com acesso local restrito:

```text
.local/backups/0019-aTSS4o/before-0019.dump
```

No mesmo diretório estão os comprovantes `licita-before.json`, `licita-catalog-before.json` e
`licita-verified.json`. Contêm fingerprints e metadados, não linhas exportadas. O dump contém dados
reais e deve permanecer privado. Scripts do ensaio e capturas de navegador estão em
`/private/tmp/licitai-activate-0019-aTSS4o/`, sujeitos à limpeza de temporários do sistema.

## Reinício e configuração

O `.env` deste workspace não foi usado para a API: contém bypasses de desenvolvimento e não contém
as credenciais reais. Foi preservado o arquivo de configuração que a stack anterior usava, via
override local ignorado pelo Git: `.local/compose-activation-0019.yml`.
Comparação das variáveis antes e depois confirmou os mesmos valores, sem expor segredos, inclusive
Google OAuth, segredo de sessão, Asaas, Resend e Jev. Nenhum bypass de login/cobrança foi ativado.

As dependências do host já estavam instaladas; imagem e build do frontend foram validados em Docker
antes da parada. Os avisos já conhecidos de sourcemaps e bundle acima de 500 kB não impediram o build.
Comando usado para subir a imagem previamente construída:

```sh
docker compose -p licita-insight \
  --env-file /Users/antonio/CODE/MY/LicitAI/Licita-Insight/.env \
  -f docker-compose.yml -f .local/compose-activation-0019.yml \
  up -d --no-deps --wait --wait-timeout 120 api web
```

**Não omitir `--no-deps` nessa configuração:** o `db-setup` do compose ainda executa `push-force`.
Para futuras alterações de schema, usar migrations versionadas após backup, não esse inicializador.
O override depende do `.env` do checkout anterior; não remover esse arquivo sem migrar explicitamente
a configuração. Os containers de outro projeto (WordPress) não foram alterados.

## Verificação da versão ativa

- API e web `healthy`; `/api/healthz` pela origem do frontend respondeu `200`, `{"status":"ok"}`.
- Chromium/Playwright em 1440×1000 e 390×844: home, busca, login e acesso a salvos sem sessão.
- Conteúdo e controles renderizados, sem overlays, pageerrors ou overflow horizontal; capturas inspecionadas.
- Sem erros HTTP inesperados. `401` de `/api/v1/auth/session` é esperado no navegador anônimo.
- Salvos redireciona para login; API de salvos respondeu `401` sem sessão, preservando o controle de acesso.
- Não foi criado login de teste no banco real nem disparada cobrança/análise paga. O fluxo autenticado de
  participação foi previamente validado em ambiente isolado, conforme o relatório de implementação.
- O coletor cultural retomado pela configuração existente apresentou timeout no Mapas Culturais do Ceará.
  Isso não impediu os healthchecks ou as páginas testadas; a integração externa continua sujeita a falhas.

As orientações de PostgreSQL determinaram o ensaio, a conferência de integridade e os locks/timeouts.
A skill de verificação de navegador orientou o teste pós-reinício; Playwright foi o fallback porque
`agent-browser` não estava instalado.
