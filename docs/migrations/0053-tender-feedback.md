# 0053 — Feedback do usuário na página do edital

Migração aditiva para o botão "Reportar problema" da página do edital (contrato `docs/contracts/tender-feedback-v1.md`):

- Tabela nova `tender_feedback`: edital (`tender_id`, FK `tenders` com `ON DELETE cascade`), usuário opcional (`user_id`, FK `users` com `ON DELETE cascade`; `null` quando anônimo), tipo (`kind`), parte da página (`section`, opcional), mensagem (10–2000 caracteres), URL da página, user agent truncado (até 300 caracteres), `status` (`new` por padrão; `triaged`, `resolved`, `dismissed` para a triagem manual) e `created_at`.
- Índices: fila de triagem (`status`, `created_at`), por edital (`tender_id`, `created_at`) e por usuário (`user_id`, para exportação e exclusão de conta).

Nenhuma linha existente muda. A API anterior não conhece a tabela, então a migração pode entrar antes do deploy sem efeito.

## Produção (aplicação manual pelo dono)

Produção **nunca** roda `migrate`. Com o PR mergeado na `main`, no Mac do dono:

```zsh
zsh ~/orca/workspaces/Licita-Insight/aplicar-migracao.sh 0053_tender_feedback
```

O script faz o backup e aplica o arquivo em transação única. A saída termina em `0053 ok`.

Ordem: aplicar **antes** do deploy da API nova. Sem a tabela, `POST /v1/tenders/{id}/feedback` responde 500 e a exportação/exclusão de conta falham ao consultar `tender_feedback`.

Notificação opcional à equipe: definir `FEEDBACK_NOTIFY_EMAIL` no `.env` da API (com `BREVO_API_KEY` ou `RESEND_API_KEY` e `MAIL_FROM`) e recriar o container (`docker compose up -d`, não `restart`).

## Reverter

```sql
begin;
drop table if exists tender_feedback;
commit;
```

Reverter também exige voltar a API, porque a nova lê e grava a tabela.
