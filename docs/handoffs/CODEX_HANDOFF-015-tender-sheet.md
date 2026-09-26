```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-015

Feature: Onda 3, item 3.5 — ficha do edital: campos-chave, cada um com o trecho oficial e a página.
  Campo sem evidência fica "não encontrado nos documentos". Nada gerado.

Priority: P1. Branch: antonioreal97/cycle6 (sobre main b4d1085, PR #7 mergeado).

Decisão do owner (25 set 2026): ciclo 6 = ficha do edital (3.5). Regra do orquestrador, não reabrir:
  AUSÊNCIA NÃO É RESPOSTA. "Não exige visita técnica" só aparece se um trecho disser isso; sem trecho,
  o campo é not_found. Isso vale para todo campo categórico.

Sondagem do orquestrador (25 set 2026, jev-1.13.0, EDITAL_PGE_26000415_AM.pdf, 101 trechos):
  um request por trecho candidato, com uma Noul por campo que aquele trecho candidata (fan-out);
  depois uma Choice só no melhor trecho dos campos categóricos.
    consórcio        p. 4   noul 0,98 → Choice "vedado" (conf 1,00)      correto (4.3)
    subcontratação   p. 4   noul 0,98 → Choice "parcial" (conf 1,00)     correto (4.4 / 4.4.1)
    multa            p. 20  noul 0,99                                     correto (8.1)
    garantia         —      melhor 0,02 (o único trecho era "Fundo de Garantia… FGTS")  not_found correto
    visita técnica   —      nenhum candidato no PDF principal             not_found correto
  Custo total ≈ 5,6 mil tokens ≈ US$ 0,0002 por edital.
  State usado: { trecho }. Noul true = "O trecho contém a regra ou o valor pedido."; false = "O trecho
  só menciona o tema, remete a outro documento ou item, ou trata de outro assunto."

1. Campos v1 (ids estáveis; os rótulos PT-BR ficam na UI)
   participação
     consortium        Choice: allowed | forbidden | not_defined
     subcontracting    Choice: allowed | limited | forbidden | not_defined
     me_epp            Choice: exclusive | quota | benefits_only | not_defined   (reaproveitar os critérios
                       do HANDOFF-014: preferência/empate ficto/regularidade tardia = benefits_only)
     site_visit        Choice: mandatory | optional | waived | not_defined
     samples           Choice: required | not_required | not_defined            (amostra/prova de conceito)
   garantias e penalidades
     bid_guarantee       só trecho (garantia de proposta)
     contract_guarantee  só trecho (garantia contratual)
     penalties           só trecho (multas)
   habilitação
     technical_qualification   só trecho (atestados, registro em conselho, capacidade técnica)
     financial_qualification   só trecho (índices, patrimônio/capital mínimo)
   execução
     contract_term      só trecho (vigência)
     delivery_term      só trecho (prazo de entrega/execução)
     price_adjustment   só trecho (reajuste/repactuação)
   Datas de proposta/sessão já vêm do PNCP: não duplicar.
   Choice cujo resultado é not_defined, ou com confidence < limiar (sugestão 0,6): campo 'found' com o
   trecho e answer null (a UI mostra "ver trecho"), não um palpite.

2. Cálculo
   - Depende do índice do HANDOFF-011 (tender_ai_passages). Não indexar só para a ficha além do que o
     ask-status já faz: a ficha dispara quando um usuário com acesso abre o detalhe (mesmo gatilho).
   - Candidatos por campo: tsvector com termos por campo (lista em código, PT-BR, com variações:
     "consórcio", "subcontrat*", "visita técnica", "vistoria", "garantia contratual", "garantia de
     proposta", "caução", "seguro-garantia", "multa", "atestado", "capacidade técnica", "CREA|CAU|CRA",
     "índice de liquidez", "patrimônio líquido", "vigência", "prazo de entrega|execução", "reajuste",
     "repactuação", "amostra", "prova de conceito", "exclusiva ME/EPP", "cota reservada"…), até ~6 por
     campo. Um request por trecho com as Nouls dos campos que ele candidata.
   - found = melhor noul ≥ limiar (inicial 0,5, a calibrar). Guardar também o 2º melhor (a UI pode
     oferecer "outro trecho" depois; não na v1).
   - Cache GLOBAL por (tender, versão do índice, modelo, promptVersion): a ficha é dado público do edital,
     não depende do usuário. Nada do usuário vai ao Jev.
   - Teto diário global AI_DAILY_SHEET_LIMIT (fichas geradas/dia, padrão 500) e log de tokens/custo;
     não consome a cota de perguntas do usuário.

3. Contrato (registre o final em docs/contracts/ai-v1.md, seção "Ficha")
   GET /api/v1/tenders/:id/sheet (sessão + acesso; 402 sem acesso; 404 edital)
     → { status: 'not_started' | 'processing' | 'ready' | 'failed' | 'no_documents' | 'unsupported',
         fields: SheetField[],        // vazio fora de 'ready'; sempre os 13 ids em 'ready'
         unreadDocuments: number,     // documentos 'failed'/'unsupported' do índice
         model: string | null, generatedAt: string | null }
     SheetField = { id: SheetFieldId; status: 'found' | 'not_found'; answer: string | null;
                    confidence: number | null; evidence: { documentTitle, documentUrl, page, text } | null }
   status espelha o índice; 'processing' = índice ou ficha em cálculo (a UI refaz com backoff 2 s → 10 s).

4. Calibração (antes de fixar limiares)
   Todos os editais com documentos indexáveis no banco (hoje 3 no licita_cycle5; tente enriquecer mais,
   sem fabricar) × 13 campos. JSON com, por campo: melhor trecho (página, 300 caracteres), noul, 2º noul,
   answer/confidence. O Claude revisa campo a campo contra o PDF e traz ao owner.
   Ambiente: DATABASE_URL=postgres://licita:licita@localhost:5432/licita_cycle5 e JEV_API_KEY
   (o .env do checkout CODE/MY/LicitAI/Licita-Insight tem a chave; o Claude roda se preferir).

5. LGPD: nada novo (dado público do edital; nenhum dado de usuário no cache).

Acceptance criteria:
  - testes: not_found sem candidatos, not_found abaixo do limiar, found com trecho/página, Choice
    not_defined → answer null, confidence baixa → answer null, cache global compartilhado entre usuários,
    invalidação por versão do índice/prompt, 402/404, teto diário, Jev mockado; um teste pelo dist/.
  - relatório de calibração.
  - typecheck, build, testes; OpenAPI + codegen.

Frontend (Claude, em paralelo, contra esta proposta): painel "Ficha do edital" no detalhe.
Mock already implemented: NO. Blocking: SIM para a integração da UI.
Processo: commite só seus paths (`git commit -- <paths>`).
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-015-tender-sheet.md
```
