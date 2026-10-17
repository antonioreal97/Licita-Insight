# 0050 — Documentos da empresa

> **Numeração:** a `main` já usa 0044/0045; o backfill manual de contratação direta usa 0046; a branch `feat/workspaces-phase-1` usa 0047/0048; o PR #160 (triagem) reserva **0049** (`recommendation_interest_events`). Esta mudança é **0050**. A ordem do merge importa: aplicar 0049 do #160 antes desta 0050. As migrações da Fase 1 (Espaços, hoje 0047/0048) serão renumeradas para depois de 0050 na sincronização.

Cria, de forma aditiva, `company_documents`: metadados do checklist de prontidão da empresa por usuário. A tabela guarda somente tipo, estado, datas e uma referência opcional curta (por exemplo, número ou órgão emissor); não recebe upload, conteúdo do documento nem dado pessoal desnecessário. A unicidade `(user_id, kind)` torna o `PUT` idempotente, e a chave estrangeira com `ON DELETE CASCADE` inclui esses dados na exclusão da conta.

## Produção (aplicação manual pelo dono)

Produção **nunca** roda `migrate`. Depois do merge e antes do deploy, o dono aplica esta migração em transação única com backup (depois da 0049 do #160, se ainda não estiver no banco):

```zsh
zsh ~/orca/workspaces/Licita-Insight/aplicar-migracao.sh 0050_company_documents
```

A saída deve terminar em `0050 ok`. Em seguida, conferir com `\d company_documents`: devem existir a chave primária, a FK para `users`, os três `CHECK`s, o índice único `company_documents_user_kind_uidx` e o índice parcial `company_documents_expiry_idx`. Só então publicar a API e o frontend.

Rollback, se necessário antes de haver uso: voltar a aplicação e executar `DROP TABLE company_documents;`. Se já houver uso, exportar os metadados antes; a operação apaga o checklist.
