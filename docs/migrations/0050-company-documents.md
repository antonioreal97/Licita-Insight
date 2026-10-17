# 0050 — Documentos da empresa

> **Numeração:** a `main` já tem 0044/0045, o backfill manual 0046 e (via #160) **0049** `recommendation_interest_events` no diário (`idx` 46). Esta mudança é **0050** (`idx` 47, `when` crescente). A branch `feat/workspaces-phase-1` (0047/0048) será renumerada para depois de 0050 na sincronização. Em produção, aplicar a 0049 antes desta 0050.

Cria, de forma aditiva, `company_documents`: metadados do checklist de prontidão da empresa por usuário. A tabela guarda somente tipo, estado, datas e uma referência opcional curta (por exemplo, número ou órgão emissor); não recebe upload, conteúdo do documento nem dado pessoal desnecessário. A unicidade `(user_id, kind)` torna o `PUT` idempotente, e a chave estrangeira com `ON DELETE CASCADE` inclui esses dados na exclusão da conta.

## Produção (aplicação manual pelo dono)

Produção **nunca** roda `migrate`. Depois do merge e antes do deploy, o dono aplica esta migração em transação única com backup (depois da 0049 do #160, se ainda não estiver no banco):

```zsh
zsh ~/orca/workspaces/Licita-Insight/aplicar-migracao.sh 0050_company_documents
```

A saída deve terminar em `0050 ok`. Em seguida, conferir com `\d company_documents`: devem existir a chave primária, a FK para `users`, os três `CHECK`s, o índice único `company_documents_user_kind_uidx` e o índice parcial `company_documents_expiry_idx`. Só então publicar a API e o frontend.

Rollback, se necessário antes de haver uso: voltar a aplicação e executar `DROP TABLE company_documents;`. Se já houver uso, exportar os metadados antes; a operação apaga o checklist.
