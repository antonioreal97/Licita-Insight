# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-010

**Feature:** Onda 2 — ajustes pós-QA do e-mail

**Status:** READY_FOR_CLAUDE

**Contrato:** mantido sem mudança pública. Os três follow-ups foram aceitos e implementados.

## Ajustes concluídos

### 1. Bootstrap do banco

- Decisão: não criar uma baseline retroativa neste follow-up.
- O caminho suportado para banco local vazio é
  `pnpm --filter @workspace/db run push-force`, igual ao `db-setup` do Docker Compose.
- `migrate` continua disponível para atualizar bancos que já possuem o baseline canônico de busca e
  ingestão; as migrations de conta não criam `tenders` nem `ingest_*`.
- `docs/account-api.md` e `docs/handoffs/CLAUDE_HANDOFF-009-email-alerts.md` foram corrigidos.
- O caminho foi testado em banco temporário vazio e criou `tenders`, `ingest_runs`, `users` e
  `email_deliveries` antes da remoção do banco de teste.

### 2. Texto dos e-mails

- Assunto do digest: `1 atualização` ou `N atualizações`, sem sufixo entre parênteses.
- Busca salva: `1 novo resultado` ou `N novos resultados`.
- Mudança de prazo com snapshot anterior: `Prazo alterado: <anterior> → <novo>`.
- Mudança de prazo sem valor anterior: `Novo prazo: <novo>`.
- O prazo atual não é mais repetido antes da descrição da mudança.
- Rodapés agora explicam que resumo/avisos estão ligados nas preferências, sem afirmar que o usuário
  os ativou manualmente.
- HTML e texto puro usam o mesmo conteúdo; escaping, links e headers RFC 8058 permanecem iguais.

### 3. Segredo de descadastro

- Nova variável opcional `EMAIL_UNSUBSCRIBE_SECRET`, com mínimo de 32 caracteres.
- Quando definida, assina e verifica os tokens de descadastro independentemente de
  `SESSION_SECRET`.
- Quando ausente, usa `SESSION_SECRET` como fallback compatível.
- O segredo dedicado deve permanecer estável durante rotações do segredo de sessão.
- `.env.example`, contrato e documentação operacional foram atualizados.

## Como subir

Stack completa:

```bash
docker compose up --build
```

Somente API com banco vazio no host:

```bash
docker compose up -d postgres
DATABASE_URL=postgres://licita:licita@localhost:5432/licita pnpm --filter @workspace/db run push-force
PORT=3001 DATABASE_URL=postgres://licita:licita@localhost:5432/licita PNCP_DAILY_COLLECT=false CULTURE_DAILY_COLLECT=false pnpm --filter @workspace/api-server run dev
```

Configuração recomendada para preservar links de descadastro:

```text
EMAIL_UNSUBSCRIBE_SECRET=<segredo aleatório estável com pelo menos 32 caracteres>
```

## Status por rota

| Método | Rota | Status | Alteração pública |
|---|---|---|---|
| `GET` | `/api/v1/me/notification-preferences` | pronto | nenhuma |
| `PUT` | `/api/v1/me/notification-preferences` | pronto | nenhuma |
| `POST` | `/api/v1/email/unsubscribe` | pronto | nenhuma |

## Validação

- Testes direcionados de template/token: **7/7 passaram**.
- Suíte completa com PostgreSQL: **97/97 passaram**.
- `pnpm -w run typecheck:libs` — passou.
- `pnpm --dir artifacts/api-server run typecheck` — passou.
- `pnpm --dir artifacts/api-server run build` — passou.
- `push-force` executado com sucesso em banco temporário inicialmente vazio; tabelas canônicas e de
  conta verificadas e banco removido ao final.

**Breaking changes:** NO

**Migration required:** NO

**Frontend changes required:** NO

**N8N changes:** NO
