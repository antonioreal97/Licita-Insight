# Ensaio da importação seletiva — 03/10/2026

Ambiente de origem: PostgreSQL de desenvolvimento neste Mac. O snapshot integral de 00h45 tinha
137.952 editais e **não** foi usado. Antes da exportação final, foram corrigidos 4.996 editais PNCP
marcados `open` apesar de terem prazo vencido.

- Snapshot integral novo, local e privado: `.local/backups/postgres/licitai-postgres-2026-10-03-post-deadline-fix.dump`
  (SHA-256 `476e6afc0e91446f79f200ad98e89a2b065860e9e7f3667e8d2851afeda1b971`). Contém dados
  pessoais de desenvolvimento: **não enviar ao beta nem ao Git**.
- Arquivo de importação seletiva: `.local/backups/postgres/licitai-beta-shared-2026-10-03-post-deadline-fix.dump`
  (SHA-256 `f2d0036a4b851b27a49522756f47f1f1b2479abf86a6ecaee33902ce73c3bfce`). Contém somente
  `TABLE DATA` das nove tabelas abaixo; ambos os arquivos são ignorados pelo Git e têm permissão 0600.

| Tabela compartilhada | Linhas no ensaio restaurado |
|---|---:|
| `tenders` | 140.518 |
| `cultural_opportunities` | 10 |
| `ingest_days` | 590 |
| `tender_ai_indexes` | 31 |
| `tender_ai_documents` | 70 |
| `tender_ai_passages` | 7.757 |
| `tender_ai_sheets` | 16 |
| `tender_ai_answers` | 0 |
| `tender_title_examples` | 3.540 |

Ensaio: banco PostgreSQL vazio criado com as 25 migrações do repositório; restauração da seleção na
ordem das chaves estrangeiras, com `--exit-on-error`. Contagens acima verificadas **no banco restaurado**;
`open` + prazo PNCP vencido = 0. Todas as outras tabelas públicas permaneceram vazias, incluindo
`users`, `sessions`, `subscriptions`, `saved_tenders`, `saved_searches`, `ai_ask_requests` e
`notifications`. Isso demonstra que a migração `0024` funciona quando o esquema nasce das migrações e
somente os dados permitidos são importados.

**Ainda pendente:** repetir a exportação no dia da carga, pois o desenvolvimento continua mudando; comparar
as contagens novas com a restauração; subir o banco beta real, executar `import-shared.sh` antes do app e
repetir a conferência de zero dados pessoais **no beta real, antes dos convites**. Em 03/10, os arquivos
`~/.licitai-secrets/beta.env` e `cloudflared-beta.env` ainda não existiam, portanto o beta real não pôde
ser validado. A API de desenvolvimento que permanece ativa usa outro checkout, então o reinício dela
não ativou a nova rotina horária;
confirmar a execução do job `tender_deadline_reconciliation` na imagem beta construída **deste** workspace.
