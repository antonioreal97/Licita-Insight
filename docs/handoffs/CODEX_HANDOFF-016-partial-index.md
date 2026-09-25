```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-016

Feature: índice de documentos resiliente ao PNCP — ficha e "Perguntar ao edital" com leitura parcial,
  retentativa com espera, e garantias como campo categórico.

Priority: P1 (itens 1 e 2). Branch: antonioreal97/cycle6 (sobre 98133b5 + 2537a63).

Evidência (QA real do orquestrador, 25 set 2026, licita_cycle4, jev-1.13.0):
  - Correios …087 e …086: índice 'failed' porque o PNCP deu timeout em PDFs (mesmo com
    AI_DOCUMENT_TIMEOUT_MS=120000). …087 tem o PDF principal (EDITAL_PGE_26000415_AM.pdf) que já foi lido
    em ciclos anteriores; com a subida do extrator para a v3 o índice foi refeito e caiu inteiro.
  - Na calibração do 015, 2 dos 3 editais não publicariam a ficha por falha de UM documento.
  - Cada GET de quem tem acesso num índice 'failed' dispara novo download (ensureIndex: retryable =
    failed || stale): visita = nova rodada de timeouts no PNCP; o usuário espera minutos e vê "não
    conseguimos ler".

1. P1 — leitura parcial publicável
   Regra do HANDOFF-014 ("qualquer failed → índice failed") existia para manter retentativa; manter a
   retentativa, mas publicar o que foi lido:
   - Índice 'ready' quando ≥ 1 documento 'ready' e nenhum em 'processing'. Documentos 'failed' e
     'unsupported' contam em unreadDocuments (ficha) e numa contagem equivalente no ask-status.
   - 'failed' só quando nenhum documento legível ficou 'ready'. 'unsupported' continua como hoje.
   - Quando um documento que falhou é lido depois, o índice ganha nova versão (a ficha regenera e o
     cache de perguntas invalida, como já previsto pela versão).
   - Reaproveitar documentos já lidos: não rebaixar um documento 'ready' por falha de download de outro.
     Se o extrator mudar de versão, re-extrair só se o download funcionar; se falhar, manter a extração
     anterior e marcar para nova tentativa (não perder o texto que já existia).

2. P1 — retentativa com espera, fora do request
   - Documento 'failed' com nextRetryAt e tentativas: 5 min, 30 min, 2 h, depois 1×/dia; teto de
     tentativas configurável (sugestão 6). Job próprio (como os jobs de e-mail), não o GET.
   - GET de ask-status/sheet nunca dispara download de documento cujo nextRetryAt não chegou; responde
     o estado atual na hora.
   - Timeout/erro transitório do PNCP (timeout, 5xx, 429) = retentável; 404/arquivo inválido = definitivo.
   - Log estruturado por tentativa.

3. P2 — garantias como campo categórico
   bid_guarantee e contract_guarantee: Choice required | not_required | not_defined (mesma regra:
   not_required só com trecho que diga isso, como "23.1. Não será exigida garantia da proposta").
   Manter o trecho como hoje. A UI passará a mostrar "Exige"/"Não exige" + a prévia do trecho
   (o Claude ajusta o frontend; você só muda o backend/contrato). Suba promptVersion da ficha.

Acceptance criteria:
  - testes: parcial vira 'ready' com unreadDocuments; nenhum legível → 'failed'; documento lido depois
    → nova versão do índice e ficha regenerada; GET não baixa antes de nextRetryAt; backoff e teto;
    transitório vs definitivo; extração anterior preservada quando o re-download falha; garantias
    categóricas (required/not_required/not_defined) com Jev mockado.
  - reteste real: …087 e …086 no licita_cycle4 devem publicar a ficha a partir do que for legível
    (se o PNCP estiver fora, registrar o que aconteceu, sem fabricar).
  - typecheck, build (incluindo teste pelo dist/), testes; OpenAPI + codegen se o contrato mudar.

Processo: commite só seus paths (`git commit -- <paths>`), sem push.
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-016-partial-index.md
```
