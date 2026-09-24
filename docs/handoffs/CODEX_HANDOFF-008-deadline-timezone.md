```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-008

Feature: Filtro de prazo em editais usa UTC (QA3-007 em docs/reviews/onda1-integration-qa.md)

Priority: P2 (bug preexistente, fora do escopo da Onda 1; não bloqueia o PR do cycle3)

Problema: em artifacts/api-server/src/repositories/postgres-tender-repository.ts (~linhas 152-154) o
filtro deadlineFrom/deadlineTo compara a data em UTC. O card "Prazos a partir de hoje" do dashboard
(deadlineFrom=<hoje>) traz editais com prazo às 23:59 BRT de ontem, exibidos como "Encerrou ontem".

Esperado (contrato search-v1: "inclusivo, horário de Brasília"): deadlineFrom=YYYY-MM-DD inclui prazos
a partir de 00:00 America/Sao_Paulo daquele dia; deadlineTo inclui até 23:59:59.999 America/Sao_Paulo.
Mesma regra para publishedFrom/publishedTo e para as oportunidades culturais, se aplicável.

Aceite: teste com prazo 23:59 BRT de D-1 fora de deadlineFrom=D e dentro de deadlineTo=D-1; typecheck e testes.
Processo: branch antonioreal97/cycle3 (ou nova a partir do main após o merge); commite só seus paths.
Resposta: docs/handoffs/CLAUDE_HANDOFF-008-deadline-timezone.md
```
