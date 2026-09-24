```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-011

Feature: Onda 3, fatia 1 — "Perguntar ao edital" com o Jev (TypeSafe): extração com página,
trechos, seleção por evidência, cota. Roadmap: docs/roadmap-monetizacao.md, itens 3.1–3.4, 3.8, 3.9.
Ficha estruturada (3.5) e aderência (3.6) ficam para a fatia 2.

Priority: P1. Branch: antonioreal97/cycle4, depois de CODEX_HANDOFF-010 (não misture os commits).

Decisões do owner (não reabrir sem ele):
  - Jev via API key só no servidor. Variável: JEV_API_KEY (não TYPESAFE_API_KEY; o SDK lê essa por
    padrão, então passe a chave explicitamente ao cliente).
  - O Jev não gera texto. A resposta mostrada é sempre trecho oficial do edital com documento e página.
    Sem evidência suficiente: "não encontrei no edital". Nunca texto inventado.

O que a doc viva diz (lida em 24 set 2026; releia antes de integrar: docs.typesafe.ai/llms.txt):
  - POST https://api.typesafe.ai/v1/systemone, Bearer. Corpo { state, model, questions }.
    SDK JS: @typesafe-ai/sdk (Node 20+), retry com backoff em 429/529 por padrão.
  - Modelo: fixe a versão que você calibrar (hoje jev-1.13.0) em JEV_MODEL; o alias jev-latest muda
    sem aviso e desloca limiares. Grave o `model` da resposta em cada uso.
  - Limites: 64k tokens por request; 32k para state + a pergunta mais longa. 1.200 req/min.
  - Preço: US$ 0,042 por milhão de tokens de entrada; saída grátis. Resposta traz usage.input_tokens.
  - Idioma: inglês é o principal; outros idiomas "funcionam, mas não igualmente bem". PT-BR precisa
    de validação própria (passo 0).
  - Padrão recomendado para este caso: cookbook de re-ranking. Busca rápida (tsvector) monta uma
    shortlist; uma pergunta Noul por par (pergunta do usuário, trecho) devolve a probabilidade de o
    trecho responder; ordene pela noul. Pares independentes podem ir em paralelo.

Sondagem do orquestrador (24 set 2026, jev-1.13.0, JEV_API_KEY do .env): edital PDF real
  34028316000103-1-000087-2026 (Correios, 29 páginas, arquivo 4), 102 trechos de ~700 caracteres por
  página, shortlist de até 10 por palavra-chave, uma Noul por par, instructions/criteria em PT-BR
  (state = { pergunta_do_usuario, trecho_do_edital }; criterio falso = "só trata do mesmo assunto").
    pergunta                               trecho certo   noul certo   melhor errado
    participação de consórcios?            1º             0,97         0,86 (declaração sobre consórcio)
    valor máximo da multa?                 1º             0,75         0,04
    benefício ME/EPP?                      1º e 2º        0,87 / 0,71  (5.14 e 6.11, os dois respondem)
    prazo para esclarecer/impugnar?        1º             0,95         0,05
    visita técnica obrigatória? (ausente)  —              —            0,08  → "não encontrei" correto
  45.422 tokens de entrada no total ≈ US$ 0,0019 (≈ US$ 0,0004 por pergunta com 10 candidatos).
  Ponto de partida do limiar: 0,5 para 'answered'; o passo 0 confirma ou ajusta com mais editais.
  Achados que entram no escopo da extração (item 1):
    - Metade dos anexos no banco hoje é .zip (4 de 8; um edital só tem o zip): abrir o zip e
      extrair os PDFs de dentro, guardando o nome do arquivo interno para citar.
    - pdftotext troca a ligadura "ti" por U+FFFD ("par�cipação") e mantém "ﬁ" (U+FB01). Isso quebra
      o tsvector. Normalizar NFKC e validar o extrator escolhido nesse arquivo.
    - Cabeçalho/rodapé repetido em toda página ("SEI/CORREIOS - 68276764 ... 4 of 29 https://...")
      vira ruído nos trechos: remover linhas que se repetem na maioria das páginas.
  Script da sondagem: pode ser reproduzido a partir desta descrição; não foi commitado.

Passo 0 (antes de qualquer UI): spike de calibração, script em artifacts/api-server/scripts/ ou teste
  manual, com 5 editais reais do Postgres que tenham PDF nativo e 10 perguntas típicas
  (prazo de proposta, garantia, habilitação técnica, visita técnica, penalidades, amostra, ME/EPP,
  consórcio, reajuste, local de entrega). Registre noul do trecho certo vs. os demais e proponha o
  limiar no CLAUDE_HANDOFF. Escreva instructions/criteria em PT-BR, com critério falso explícito
  ("só trata do mesmo assunto, sem responder").

1. Extração (3.1): baixar os anexos já listados em tenders.documents, extrair texto por página
   (PDF nativo). PDF escaneado sem texto: status 'unsupported' (OCR fica para depois; não bloquear).
   Assíncrono: dispara na primeira pergunta ou na abertura do detalhe por usuário com acesso; não
   bloqueia o request. Limite de tamanho/páginas configurável.
2. Trechos (3.2): tabela de trechos com tender_id, document_id, página, ordem, texto, tsvector
   'portuguese'. Trechos cabem com folga no orçamento de 32k junto com a pergunta.
3. Cliente Jev (3.3): ai/jev-client.ts, timeout, erros tipados; sem chave → a feature responde
   503 AI_UNAVAILABLE e o resto da API segue.
4. Perguntar (3.4), proposta de contrato (registre o final em docs/contracts/, novo ai-v1.md):
     GET  /api/v1/tenders/:id/ask-status (sessão) →
       { index: 'not_started'|'processing'|'ready'|'failed'|'no_documents'|'unsupported',
         documents: [{ id, title, pages: number|null, status }], quota: Quota }
     POST /api/v1/tenders/:id/ask (sessão + CSRF + acesso vigente) { question: string (3–300 chars) } →
       200 { status: 'answered'|'not_found'|'processing',
             passages: [{ documentId, documentTitle, documentUrl, page, text, relevance: number }],
             model: string, quota: Quota }
       Quota = { used: number, limit: number, resetsAt: string }
     'answered' = ao menos um trecho acima do limiar; devolva até 3, ordem decrescente.
     'not_found' = nada acima do limiar (não mande os de baixo como se respondessem).
     'processing' = índice ainda não pronto (a UI refaz em poucos segundos).
     Erros: 402 SUBSCRIPTION_REQUIRED, 429 AI_QUOTA_EXCEEDED, 503 AI_UNAVAILABLE, 404 edital.
     documentUrl é o link oficial do PNCP (a UI abre em nova aba; página vai no texto do link).
5. Cota e custo (3.8): contagem por usuário/dia (America/Sao_Paulo); limite menor no teste
   (AI_DAILY_ASK_LIMIT_TRIAL, AI_DAILY_ASK_LIMIT_PAID). Registrar input_tokens e custo estimado por
   chamada. Cache por (tender, pergunta normalizada, versão do índice, modelo) não consome cota.
6. LGPD: perguntas do usuário entram no GET /me/export e saem no DELETE /me. Não mande dados do
   usuário ao Jev, só a pergunta e os trechos. Retenção das perguntas: 90 dias, igual às notificações.

Acceptance criteria:
  - testes: extração com página (fixture PDF pequeno), unsupported sem texto, tsvector em PT-BR,
    ask answered/not_found/processing, limiar aplicado, cota (teste vs. pago, virada do dia BRT, cache
    não conta), 402/429/503, export/delete, cliente Jev mockado (sem chamada real nos testes).
  - relatório do passo 0 com os números reais e o limiar proposto.
  - typecheck, build, testes; OpenAPI + codegen.

Frontend (Claude, em paralelo, contra esta proposta): painel "Perguntar ao edital" no detalhe,
trechos com documento + página + link oficial, estado "não encontrei no edital", aviso fixo
"confira o edital original" (3.9), cota visível.
Mock already implemented: NO. Blocking: SIM para a integração da UI.
Processo: commite só seus paths (`git commit -- <paths>`).
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-011-ask-tender.md
```
