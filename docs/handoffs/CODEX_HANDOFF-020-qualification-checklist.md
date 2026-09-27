```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-020

Feature: Onda 3, item 3.5b — checklist automático de habilitação: lista os documentos que a empresa
  precisa apresentar (regularidade fiscal, trabalhista, qualificação técnica, econômico-financeira,
  documento societário), cada item com o trecho oficial e a página. Complementa a Ficha do Edital
  (que já tem os campos technical_qualification e financial_qualification, só como trecho único).

Priority: P1. Branch: antonioreal97/cycle9 (sobre main dd79dc4).
Motivação (27 set 2026): pesquisa de mercado (`docs/reviews/competitive-analysis-2026-09-27.md`) achou
que pelo menos dois concorrentes (Acumi, Licitei) já entregam checklist de habilitação; hoje não temos.
Decisão do owner: fazer.

Leia antes: docs/handoffs/CLAUDE_HANDOFF-015-tender-sheet.md e CLAUDE_HANDOFF-016 (índice/ficha atuais),
docs/contracts/ai-v1.md.

Regra inegociável da Onda 3 (a mesma da ficha): NADA é gerado. Cada item do checklist é um trecho oficial
do edital, com a página. Sem trecho que exija algo, o item não aparece — nunca inventar um requisito.

Sondagem do orquestrador (27 set 2026, jev-1.13.0, edital real 34028316000103-1-000086-2026, seção de
habilitação, 7 candidatos manuais): uma Noul ("isso exige um documento específico de habilitação, não é
item do objeto nem cláusula geral?") + uma Choice de tipo, no mesmo request.
  trecho                                                    is_req   tipo (confiança)
  "Aquisição/habilitação do dispositivo eletrônico (TAG)"    0,05    nao_e_requisito (0,99)  ← falso positivo lexical evitado
  "4.1. A participação neste Pregão implica a aceitação…"    0,03    nao_e_requisito (1,00)  ← cláusula geral evitada
  "7.3 … FGTS … CNDT"                                        0,89    regularidade_fiscal (0,61)  ← nota moderada, ver item 2
  "7.4 … Atestado de Capacidade Técnica…"                    0,92    qualificacao_tecnica (1,00)
  "7.5 … balanço patrimonial…"                                0,88    qualificacao_economica (1,00)
  "7.5.3 Certidão negativa de falência…"                     0,94    qualificacao_economica (1,00)
  "b) ato constitutivo, estatuto ou contrato social…"        0,93    ato_societario (1,00)
  Custo: 4.980 tokens para 7 candidatos ≈ US$ 0,0002 (todo o custo é por edital, global, como a ficha).
A abordagem funciona: rejeita bem o "habilitação" usado para outra coisa (TAG) e classifica certo os
5 requisitos reais. Único ponto fraco: FGTS+CNDT juntos numa frase só saem com confiança 0,61 no tipo
porque a frase cobre fiscal E trabalhista ao mesmo tempo — ver item 2.

1. Segmentação dos candidatos (novo; reaproveita o índice existente, tender_ai_passages)
   - Não dá para usar os trechos de ~700 caracteres já indexados direto: eles cortam no meio de itens
     lettered (a, b, c) e numerados (7.4, 7.5.1). Escreva uma segmentação PRÓPRIA para esta feature, só
     sobre os documentos já extraídos (reaproveite o texto por página do document-extractor, não
     reindexe): divida por marcador de item — `\b\d{1,2}(\.\d{1,2}){0,3}\.?\s` no início de linha/frase,
     e por letra `\b[a-z]\)\s`. Cada segmento carrega a página onde começa.
   - Candidatos: uma consulta tsvector 'portuguese' com termos fixos em código (PT-BR, com variações):
     "habilitação", "qualificação técnica", "qualificação econômico", "regularidade fiscal",
     "regularidade trabalhista", "certidão negativa", "atestado de capacidade", "balanço patrimonial",
     "patrimônio líquido", "índice de liquidez", "capital social", "ato constitutivo", "contrato social",
     "registro no conselho", "CREA", "CRA", "CAU", "alvará", "garantia de participação". Até ~40
     candidatos por edital (mais que a ficha, porque aqui é lista, não campo único); configurável.

2. Jev (mesmo padrão da sondagem, ajuste os tipos)
   - Um request por candidato: Noul `is_req` (texto da sondagem) + Choice `tipo`. Tipos, com o ajuste da
     sondagem: `ato_societario`, `regularidade_fiscal`, `regularidade_trabalhista` (SEPARADOS, mas
     aceite pontuação mista quando o trecho cobrir os dois — ver combinação abaixo),
     `qualificacao_tecnica`, `qualificacao_economica`, `nao_e_requisito`.
   - Combinação: quando um trecho cobrir fiscal E trabalhista na mesma frase (como no exemplo do FGTS+CNDT),
     não force uma escolha só; se `tipo` vier com confiança < 0,7, faça uma segunda pergunta (Noul) "o
     trecho cita regularidade trabalhista (CNDT) além da fiscal?" e emita DOIS itens do checklist a partir
     do mesmo trecho/página quando a resposta for `>= 0,5`, evitando perder um dos dois.
   - Corte: `is_req >= 0.5` (mesmo limiar da ficha). Registre o 2º candidato mais próximo por tipo, como
     a ficha já faz, para a calibração.

3. Deduplicação e formato de saída
   - Vários candidatos podem apontar o mesmo requisito (ex.: o item aparece resumido no preâmbulo e
     detalhado depois). Deduplicar por (tipo, página) mantendo o de maior `is_req`; se dois itens do
     mesmo tipo vierem de páginas diferentes e SEM sobreposição de texto relevante (ex.: um fala de
     atestado técnico e outro de registro no conselho, os dois `qualificacao_tecnica`), mantenha os dois
     — o checklist pode ter mais de um item por tipo.
   - Ordem de exibição fixa: ato_societario, regularidade_fiscal, regularidade_trabalhista,
     qualificacao_tecnica, qualificacao_economica.
   - Contrato (registre em docs/contracts/ai-v1.md, seção "Ficha"; ADITIVO, sem quebrar nada existente):
       GET /api/v1/tenders/:id/sheet ganha o campo:
         qualificationChecklist: QualificationItem[]
         QualificationItem = { type: 'ato_societario' | 'regularidade_fiscal' | 'regularidade_trabalhista'
           | 'qualificacao_tecnica' | 'qualificacao_economica';
           evidence: { documentTitle: string; documentUrl: string; page: number; text: string };
           confidence: number }
     Vazio quando nada encontrado (edital sem exigência do tipo, ou índice sem documentos). Sem
     inferência: um tipo ausente na lista significa "não encontrado", nunca "não exige" — mesma regra
     dos campos categóricos da ficha.
   - Sobe `SHEET_PROMPT_VERSION` (invalida o cache, como já acontece quando a ficha muda).

4. Custo e cache
   - Cache GLOBAL por edital, junto com o resto da ficha (mesma tabela `tender_ai_sheets`, coluna nova
     `qualification_checklist jsonb`, mesma versão/chave de cache). Não é custo por usuário.
   - Com até 40 candidatos por edital (mais o eventual 2º Noul de combinação), o custo por edital sobe
     em relação à ficha de hoje; meça e registre o número real (a calibração do item 5 já mede isso).

5. Calibração (antes de fixar limiares)
   - Rode nos mesmos 3 editais indexados no `licita_cycle4` (ou mais, se algum outro tiver documentos).
     Para cada edital: candidatos gerados, quantos passaram do limiar, tipo e confiança, e — MAIS
     IMPORTANTE — leia os documentos e diga se algum requisito REAL do edital ficou de fora
     (falso negativo) ou se algum item do checklist não é um requisito de verdade (falso positivo).
     Registre em docs/handoffs/CODEX_HANDOFF-020-calibration.json e um resumo legível no CLAUDE_HANDOFF.

Não faça: mudar os 13 campos existentes da ficha, tocar no frontend, mudar o contrato de
"Perguntar ao edital" ou do fit.

Acceptance criteria:
  - testes: segmentação por item lettered/numerado; candidato "habilitação" fora de contexto (dispositivo,
    sistema) rejeitado; FGTS+CNDT na mesma frase gera dois itens; deduplicação por (tipo, página);
    confiança baixa sem inferência; checklist vazio quando o edital não tem documentos; paridade
    schema x migration da coluna nova (banco vazio, dois push-force, banco existente); Jev mockado.
  - relatório de calibração com a leitura humana dos 3 editais (achados de falso positivo/negativo, se
    houver).
  - typecheck, build (com os testes pelo dist/ existentes) e suíte completa com Postgres
    (PNCP_TEST_DATABASE_URL=… no licita_cycle4, schema isolado).

Ambiente: Postgres do Compose em localhost:5432 (usuário/senha licita). NÃO escreva dados sintéticos em
"licita" nem em "licita_cycle4" fora das suítes com schema isolado. NÃO pare/reinicie/suba containers.
JEV_API_KEY está em /Users/antonio/CODE/MY/LicitAI/Licita-Insight/.env; leia só essa variável, não
imprima nem copie para arquivos versionados. O .env do worktree, o .gitignore (alteração local do owner)
e docs/reviews/security-audit-2026-09-26.md (outro agente, Hermes) não são seus.

Ownership: artifacts/api-server/**, lib/db/**, lib/api-spec/** e clientes gerados, docs/contracts/ai-v1.md,
docs/handoffs/CLAUDE_HANDOFF-020-qualification-checklist.md, docs/handoffs/CODEX_HANDOFF-020-calibration.json,
.env.example (só variáveis novas). NÃO edite artifacts/licitainsight/** (o frontend eu integro depois).
Processo: commite só seus paths (`git commit -- <paths>`), um commit por item, sem push.
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-020-qualification-checklist.md.
```
