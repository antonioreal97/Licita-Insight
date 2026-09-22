```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-003

Feature: Qualidade dos dados PNCP expostos pela Search API (pós-migração para PostgreSQL)

Objective:
  Após o commit 2e6f63c (API lendo só PostgreSQL + coleta PNCP), o frontend foi validado com dados
  reais (19 pregões do DF). Estes pontos são de mapeamento/semântica no backend; o frontend não
  deve "consertar" dado oficial.

Priority: P1 itens 1–3 · P2 itens 4–6

Backend requirement:

  P1-1  Semântica de openingAt
        Ex.: 34028316000103-1-000087-2026 → openingAt 2026-09-22T09:00, proposalDeadline 2026-10-15.
        Parece dataAberturaProposta (início do recebimento de propostas), não a sessão pública.
        Confirmar a origem de cada campo de data no pncp-map e documentar no contrato. Se não
        houver data de sessão no PNCP, manter openingAt = início das propostas e registrar isso em
        docs/contracts/search-v1.md (o frontend passou a rotular como "Início das propostas").

  P1-2  Rótulos de facets de enum
        facets.status devolve label "Aberta" enquanto a UI usa "Aberto" (tender-labels.ts). Para
        grupos de enum (status, modality) o frontend passará a usar seus próprios rótulos; por
        favor padronize os labels da API para os mesmos termos (Aberto, Em análise, Encerrado,
        Suspenso, Revogado; modalidades como em src/lib/tender-labels.ts) para outros clientes.

  P1-3  Execução de ingestão "running" órfã
        GET /api/v1/ingest/pncp mostra run 1cb44406-… status "running", pagesRead 0, iniciado
        2026-09-22T20:17:06Z, sem processo ativo (a API desta sessão sobe com
        PNCP_DAILY_COLLECT=false). Provável processo morto no meio da coleta. Marcar runs
        órfãs como "failed"/"abandoned" no boot (ou por heartbeat/timeout) para não bloquear/confundir.

  P2-4  tenderNumber com modalidade embutida
        tenderNumber = "Pregão - Eletrônico 26000415/2026" (repete a modalidade com hífen).
        Sugestão: expor também tenderNumberShort = "26000415/2026" (aditivo) ou normalizar.
        O frontend hoje remove o prefixo por heurística.

  P2-5  Calibração de relevância
        relevance.score = 1.0 para praticamente todos os resultados de "correios"; o medidor de
        relevância perde valor. Normalizar o score por consulta (ex.: ts_rank normalizado pelo
        máximo da página ou por faixas) — ou retornar null quando não houver discriminação.

  P2-6  Objeto muito longo em title
        title chega com ~500 caracteres (objeto completo, com instruções "IMPORTANTE:…").
        Sugestão aditiva: manter title = objeto oficial e expor objectSummary truncado a ~300 chars
        no servidor (hoje objectSummary == title). Não reescrever o texto oficial.

Endpoint required: GET /api/v1/tenders/search, GET /api/v1/tenders/{id}, GET /api/v1/ingest/pncp
Breaking changes: NÃO (apenas correções de mapeamento e campos aditivos)
Mock already implemented: N/A (não há mais adapter mock — decisão do owner)
Blocking: NO

Processo (worktree/índice git compartilhados): commitar só seus paths com `git commit -- <paths>`.
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-003-pncp-data-quality.md
Obs.: o arquivo docs/handoffs/CLAUDE_HANDOFF-002-search-v1.1.md.prefeprefe parece ter um sufixo
acidental no nome; renomeie para .md se concordar.
```
