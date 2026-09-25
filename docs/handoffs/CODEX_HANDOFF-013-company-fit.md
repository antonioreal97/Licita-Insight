```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-013

Feature: Onda 3, fatia 2 — perfil da empresa e aderência edital × perfil (roadmap 3.6)
  Fase A (este handoff, bloqueia a UI): perfil + selo de aderência na busca e no detalhe.
  Fase B (mesmo handoff, depois da A): alerta diário "editais novos para o seu perfil".
  Fora: reordenar a busca (mode=semantic), ficha estruturada (3.5), habilitação e CNPJ.

Priority: P1. Branch: antonioreal97/cycle5 (sobre main f31350b, PR #6 mergeado).

Decisões do owner (25 set 2026, registradas no roadmap; não reabrir sem ele):
  - 6 campos: o que fornece, produtos/serviços, o que não atende, área de atuação (com "Brasil
    inteiro"), faixa de valor, porte.
  - Porte só pesa com TRECHO CITADO do edital. Sem trecho, porte não muda nada nem aparece.
  - Um perfil por conta.
  - Superfície: selo (busca + detalhe) → alerta diário. Sem reordenar a busca.
  - Formulário em Configurações; convite no painel inicial; sem wizard.

Princípio: código faz o que é regra (área, valor, filtro de termos); o Jev faz só o julgamento
semântico. Todo motivo mostrado tem origem verificável (termo do perfil, campo do edital ou trecho
com página). Nada gerado.

1. Perfil (proposta de contrato; registre o final em docs/contracts/ai-v1.md, seção "Aderência")
   GET    /api/v1/me/company-profile → { profile: CompanyProfile | null }
   PUT    /api/v1/me/company-profile (CSRF) → { profile }        corpo = CompanyProfileInput completo
   DELETE /api/v1/me/company-profile (CSRF) → 204
   Sessão basta para ler/editar/apagar (quem perdeu o acesso não perde o perfil). O cálculo exige acesso.
     CompanyProfileInput = {
       description: string                    // 20–600 caracteres, o que a empresa fornece
       offerings: string[]                    // 1–20 termos, 2–80 caracteres cada, sem duplicata (case/acento)
       exclusions: string[]                   // 0–20 termos, idem
       coverage: { scope: 'national' } | { scope: 'states'; states: UF[] }   // 1–27 UFs
       valueRange: { min: number | null; max: number | null }              // R$, min ≤ max
       size: 'me_epp' | 'cooperative' | 'other'
     }
     CompanyProfile = CompanyProfileInput & { version: number; updatedAt: string }
   version sobe a cada PUT e invalida as aderências calculadas. Municípios ficam fora da v1.
   Erros: 400 INVALID_PARAMETER com details por campo (a UI mostra no campo).

2. Aderência (Fase A)
   GET /api/v1/me/fit?tenderIds=a&tenderIds=b… (sessão + acesso; até 100 ids = pageSize máx. da busca)
     → { profileVersion: number | null, results: Record<tenderId, TenderFit> }
   Sem perfil: 200 { profileVersion: null, results: {} } (a UI mostra o convite, não erro).
   Sem acesso: 402 SUBSCRIPTION_REQUIRED.
     TenderFit = {
       status: 'ready' | 'pending' | 'filtered'
       level: 'high' | 'medium' | 'low' | null     // null quando pending/filtered
       score: number | null                        // 0–1, para ordenar/depurar; a UI mostra o nível
       reasons: FitReason[]                        // ordem de importância; ≤ 4
       model: string | null
       checkedAt: string | null
     }
     FitReason =
       | { kind: 'offering_match'; terms: string[] }                         // termos do perfil achados no objeto/itens
       | { kind: 'exclusion'; terms: string[] }                              // o Jev confirmou que o objeto é algo excluído
       | { kind: 'out_of_coverage'; state: string | null }                   // filtered
       | { kind: 'out_of_value_range'; estimatedValue: number }              // filtered
       | { kind: 'value_not_published' }                                     // informativo, não filtra
       | { kind: 'size_restricted'; restriction: 'me_epp_exclusive' | 'me_epp_quota'; evidence: Evidence }
     Evidence = { documentTitle: string; documentUrl: string; page: number; text: string }
   'pending' = entrou na fila; a UI refaz o GET com backoff curto (2 s → 10 s) só para os pending.
   'filtered' = regra em código reprovou (área ou valor); sem chamada ao Jev.

   Cálculo, nesta ordem:
     a. área: coverage.scope = 'national' passa tudo; senão tender.state ∈ states. Sem UF no edital: passa.
     b. valor: fora de [min, max] → filtered; estimatedValue nulo/não publicado → passa com
        value_not_published.
     c. Jev, um request por edital com várias perguntas sobre o mesmo state (fan-out):
        state = { perfil: { description, offerings, exclusions }, edital: { objeto, itens (descrições,
        truncar p/ caber em 32k), orgao } }
        - fit: Score, 4 níveis, PT-BR, ex.:
            0 "O objeto e os itens não têm relação com o que a empresa fornece."
            1 "Relação indireta: tema vizinho ou só item acessório que a empresa fornece."
            2 "A empresa fornece parte relevante dos itens, mas não o objeto principal."
            3 "A empresa fornece o objeto principal do edital."
        - excluded: Noul "O objeto principal do edital é algo que a empresa declarou em `perfil.exclusions`
          que não atende?" (só quando exclusions não vazio). Critério falso: "só menciona o tema".
     d. porte (só com trecho citado): se size = 'other' e o edital JÁ tem índice 'ready' (não disparar
        indexação só por causa do selo), shortlist de trechos ("exclusiva", "ME/EPP", "Lei Complementar
        123", "cota reservada") + Noul por trecho "Este trecho restringe a participação a ME/EPP (exclusiva)
        ou reserva cota para ME/EPP?"; acima do limiar → size_restricted com Evidence. Para me_epp e
        cooperative, a exclusividade não vira motivo positivo nesta fase.
     e. nível: score = fit/3; excluded ≥ limiar → low com reason exclusion; me_epp_exclusive para 'other'
        → low. Limiares iniciais high ≥ 0,75, medium ≥ 0,5; o passo 0 calibra.
   offering_match.terms vem de código (termos do perfil encontrados no objeto/itens por tsvector), não do Jev.

   Execução e custo:
     - Fila assíncrona; cache por (userId, profileVersion, tenderId, modelo, versão das perguntas).
     - Não conta na cota de "Perguntar ao edital"; teto próprio AI_DAILY_FIT_LIMIT (padrão 1.000/usuário/dia)
       e log de tokens/custo como em ai_ask_requests. Acima do teto: status 'pending' não progride até o dia
       seguinte; registrar em log. A UI para de consultar depois de ~2 min em pending e não mostra selo.
     - Edital que muda objeto/itens (fingerprint) invalida o cache daquele edital.

3. Passo 0 — calibração (antes da UI integrar)
   3 perfis realistas (ex.: limpeza e conservação predial / transporte de cargas / suprimentos de TI)
   × 30 editais reais do banco cada, escolhidos para ter positivos e vizinhos (ex.: "limpeza" vs "material
   de limpeza"). Relatório com score, nível, motivos e custo por perfil, em
   docs/handoffs/CODEX_HANDOFF-013-calibration.json. O Claude revisa os níveis com o owner antes de
   fixar limiares. Não fabricar editais.

4. Fase B — alerta diário do perfil (depois da A estar integrada)
   - Novo tipo de notificação profile_new_matches (snapshot: contagem + até 5 {tenderId, título, órgão,
     prazo, nível}), um por usuário por dia, só editais publicados desde o último alerta com level 'high'
     (e 'medium' se configurável depois; comece com high).
   - Entra no sino e no digest de e-mail existente (sem e-mail novo); respeita preferências e acesso.
   - Preferência: notification-preferences ganha profileAlerts: boolean (padrão true quando existe perfil).
   - Contrato nas seções de notificações/e-mail de account-v1.md.

5. LGPD: perfil e aderências no GET /me/export; DELETE /me e DELETE do perfil apagam perfil e cache.
   Só descrição/termos do perfil vão ao Jev; nada de e-mail/nome do usuário.

Acceptance criteria:
  - testes: validação do perfil (limites, duplicatas, min ≤ max, national vs states), version/invalidação,
    GET fit sem perfil / sem acesso (402) / lote de 100 / pending → ready, filtros em código sem chamada ao
    Jev, porte só com índice pronto e trecho acima do limiar, cache e teto diário, export/delete,
    Jev mockado nos testes; Fase B: um alerta por dia, só high, respeita preferência e acesso.
  - relatório do passo 0.
  - typecheck, build, testes (incluindo o caminho dist/), OpenAPI + codegen.

Frontend (Claude, em paralelo, contra esta proposta): seção "Perfil da empresa" em /settings#perfil-empresa,
convite no painel inicial, selo na lista da busca e no detalhe com os motivos; Fase B: toggle nas
preferências e item no sino.
Mock already implemented: NO. Blocking: SIM para a integração da UI.
Processo: commite só seus paths (`git commit -- <paths>`).
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-013-company-fit.md
```
