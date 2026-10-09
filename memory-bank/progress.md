# Progress — Licita Insight

Deriva de [activeContext](activeContext.md).

## O que já funciona na interface

- Landing pública com hero, método e CTA. O preview do radar lê editais abertos da API.
- Telas visuais de login, cadastro e recuperação de senha (sem auth real; submit cai no dashboard ou mostra “confira seu e-mail”).
- Shell: sidebar (recolhível no desktop, drawer no mobile), topbar, tema claro/escuro, usuário demo.
- Dashboard com totais, publicações de 7 dias e prazos próximos lidos da busca. A lista mostra editais em aberto do banco.
- Busca com texto, filtros, facets, chip da query, alternância lista/tabela, empty state e “Atualizado em”.
- Detalhe: resumo, objeto, itens, cronologia, documentos, órgão, salvar e monitorar (estado local), link da fonte.
- Editais salvos resolvem os ids guardados no navegador pela busca. Buscas salvas e monitoramento não inventam contagens: a lista fica vazia até existir persistência.
- Página `/design-system` com cores, tipo, botões, badges e três estados. As amostras de tipo não são editais do banco.

## O que já funciona

- Pesquisa, filtros, facets, detalhe e sugestões no frontend, com contrato em [`docs/contracts/search-v1.md`](../docs/contracts/search-v1.md).
- API em `/api/v1`: busca, detalhe e sugestões leem só o PostgreSQL. Sem `DATABASE_URL`, a busca responde 503.
- Schema `tenders` e `ingest_runs`. Coletor do PNCP com upsert por `numeroControlePNCP`, carga dia a dia, repartição por UF em timeout, e revisão de processos abertos.
- Calendário `ingest_days` aplicado no Postgres local. A coleta pula partições seladas, retoma UFs incompletas e preserva a revisão individual. Cobertura exposta no GET de ingestão; backfills com datas explícitas continuam forçados.
- Calendário validado com testes unitários e integração em schema isolado de PostgreSQL: segunda execução sem leitura histórica, ausência de duplicatas, virada do dia, falhas parciais, retomada das 27 UFs e revisão individual com limite.
- Validação final do calendário: 27 testes passaram, typecheck e build da API concluídos. A tentativa real em 22 set 2026 (DF, modalidade 6, publicação em 21 set) falhou por timeout do PNCP antes da primeira página; os 19 editais foram preservados e a partição ficou pendente. A verificação de duas execuções foi concluída com respostas controladas do PNCP no Postgres real, não no serviço externo.
- Detalhe busca itens e arquivos do PNCP na primeira abertura e grava no banco.
- A busca mostra `Atualizado em` a partir de `meta.indexUpdatedAt` (última `fetched_at`).
- Chamadas de fomento audiovisual ficam fora de `tenders`. Tabela `cultural_opportunities`, coleta do Mapas Culturais (`source = mapas-culturais`) e lista em `/oportunidades`. Contrato: [`docs/contracts/opportunities-v1.md`](../docs/contracts/opportunities-v1.md). `CULTURE_DAILY_COLLECT=false` desliga a agenda. Comando: `pnpm --filter @workspace/api-server run collect:opportunities`. A consulta por termo `linguagem` foi trocada por `@keyword` depois que as instalações responderam 500 ou HTML.
- Verificado em 22 set 2026: 19 pregões eletrônicos do DF publicados em 21 set 2026. A busca por “correios” abre o edital `34028316000103-1-000087-2026`, com link `https://pncp.gov.br/app/editais/34028316000103/2026/87`. O registro permanece depois de reiniciar a API. Uma segunda coleta não duplica a contagem.

## O que já funciona — assinatura (MVP)

- Tabela `subscriptions`, gate `402 SUBSCRIPTION_REQUIRED` nas rotas `/me` de salvos/buscas/notificações.
- Checkout/cancelamento Asaas e webhook autenticado. UI em Configurações + `RequireSubscription` nas páginas pagas.
- 10 testes de billing passaram; typecheck da API e do frontend ok. Schema `subscriptions` no Postgres local.

## O que já funciona — e-mail (Onda 2)

- Preferências (`digest` diário 07:00 BRT, `immediateCritical`) fora do gate, descadastro público em um clique (RFC 8058), entregas idempotentes com retry, buscas salvas em job próprio (15 min).
- UI: switches em `/settings#notificacoes` (otimista, rollback), `/descadastro` com confirmação explícita. QA headless desktop/mobile em 24 set 2026.
- `RESEND_API_KEY`/`MAIL_FROM` no `.env` real desde 27 set 2026 (auditoria de promessas). Envio de teste real ainda não disparado — precisa de aprovação explícita do owner por ser ação com efeito externo.

## O que já funciona — Perguntar ao edital (Onda 3, fatia 1)

- Extração de PDF (inclusive dentro de ZIP) por página, trechos com `tsvector`, Jev (`jev-1.13.0`) ordena por noul, limiar 0,5, cota diária (teste 5, pago 30), cache por usuário.
- UI: painel no detalhe com estados de acesso/índice/cota, melhor trecho com termos destacados, link para o documento oficial e página, aviso fixo.
- [CODEX_HANDOFF-012](../docs/handoffs/CODEX_HANDOFF-012-ask-fixes.md) concluído: `pdfjs` resolvido no bundle, `search_vector` gerado pelo `push-force`, índices com falha retentáveis, ligaduras corrigidas e corte relativo de 0,25. Stack Docker e PDF real de 29 páginas validados.

## O que já funciona — ficha do edital (Onda 3, item 3.5)

- 13 campos com trecho oficial e página; ausência = "Não encontrado", nunca "não exige"; categorias por Choice (consórcio, subcontratação, ME/EPP, visita, amostra, garantias). Cache global por (edital, versão do índice, modelo, prompt); teto `AI_DAILY_SHEET_LIMIT`.
- Índice parcial: publica o que foi lido, `unreadDocuments`, retentativa em job (5 min, 30 min, 2 h, 1×/dia).

## O que já funciona — checklist automático de habilitação (Onda 3, item 3.5b)

- Motivado pela análise competitiva de 27 set 2026 ([`docs/reviews/competitive-analysis-2026-09-27.md`](../docs/reviews/competitive-analysis-2026-09-27.md)):
  Acumi e Licitei já entregam checklist de habilitação; decisão do owner foi fazer.
- `GET /tenders/:id/sheet` ganhou o campo aditivo `qualificationChecklist: QualificationItem[]`
  (`{ type, evidence, confidence }`, 5 tipos: ato_societario, regularidade_fiscal, regularidade_trabalhista,
  qualificacao_tecnica, qualificacao_economica). Sem inferência: tipo ausente = "não encontrado", nunca
  "não exige". Segmentação própria por item numerado/lettered sobre o texto já extraído (não reindexa);
  Jev com Noul `is_req` + Choice `tipo` por candidato; 2ª Noul quando o mesmo trecho cobre fiscal+trabalhista
  (ex. FGTS+CNDT), publicando os dois itens; dedup por `(tipo, página)` mantendo o de maior `is_req`.
  Cache global junto com o resto da ficha (`SHEET_PROMPT_VERSION` 2→3).
- Calibração real nos 3 editais do `licita_cycle4` (Codex + reteste meu independente com o Jev real):
  4, 8–9 e 8 itens finais; falso positivo lexical do "TAG" (dispositivo de pedágio) corretamente rejeitado
  nos 3; nenhum falso positivo encontrado na leitura humana; falsos negativos documentais esperados e
  documentados (regra de manter só um candidato por tipo/página). Custo: ~US$0,0015/edital, global.
- Frontend (minha integração, fora do ownership do Codex): seção "Requisitos de habilitação encontrados"
  na Ficha do Edital, ordem fixa por tipo, toggle "Ver trecho" por item, aviso de que não é lista exaustiva.
  QA visual headless (desktop 1440×900 + mobile 390×844) nos 3 editais de calibração: seção renderiza,
  ordem correta, toggle funciona, sem erros de console atribuíveis à feature.
  Detalhes: [`docs/reviews/qualification-checklist-2026-09-27.md`](../docs/reviews/qualification-checklist-2026-09-27.md).

## O que já funciona — prontidão de deploy (HANDOFF-021, ciclo 10)

- Migrations versionadas `0000`–`0018` como único caminho de schema em produção (`release_command`), com
  `verify:migrations` (migrate == push num banco vazio; idempotente; testado com mutação).
- `Dockerfile.prod` (147 MiB, amd64, sem `tsx`), frontend servido pela API com `STATIC_DIR` (mesma origem;
  só `assets/` com cache imutável), `fly.toml` enxuto + `deploy/fly-db/` (Postgres próprio + dump para Tigris).
- Beta fechado no Mac: `deploy/beta-local/` + [`docs/ops/beta-local.md`](../docs/ops/beta-local.md); convites em `beta_access_grants`
  respeitados pelo gate 402, por `/me/billing` (`source: beta`) e pelos e-mails; runner na imagem.
- Carga do PNCP medida: 1 dia útil nacional ≈ 5,3 mil editais, ~11 min, +28 MB.

## O que já funciona — ajustes finais (ciclo 12)

- Resumo diário por e-mail com "Seus prazos": editais salvos em Analisando e Preparando documentos, com
  prazo pessoal ou de proposta nos próximos 3 dias (Brasília). O resumo pode sair só com prazos. Contratos
  em `account-v1.md` §5 e `participation-v1.md`.
- Busca abre em Abertos. "Todos os status" persiste na URL (`status=all`, só no app). Busca por palavra-chave
  só (seletor semântico escondido até haver embeddings). Buscas salvas, notificações e e-mails sem status
  abrem com todos os status.
- Detalhe: um único aviso de trechos automáticos, próxima ação e prazo acima do histórico.
- QA: `docs/reviews/cycle12-qa.md` (199 + 9 testes de API, 25 de frontend, 104 verificações de navegador).

## O que já funciona — rate limiting por perfil (ciclo 13)

- Toda rota `/api` tem janela, com perfis independentes: IA, gravações, billing, privacidade, gravações públicas
  e leitura. 429 com `Retry-After` e `RateLimit-*`; store em memória com teto. Contrato em `scale-protection-v1.md`.
- "Seus prazos" com uma linha por edital; perfil e buscas salvas sem status abrem em todos os status.
- QA: `docs/reviews/cycle13-qa.md`.

## O que já funciona — resumos redigidos pela OpenAI (ciclo 14)

- Perguntar ao edital e ficha ganham `summary` opcional, redigido pelo `gpt-4o-mini` só a partir do que o Jev
  selecionou, com citações clicáveis. Sem `OPENAI_API_KEY`, a tela fica como antes.
- Ligar a chave ou trocar o modelo não recalcula a ficha no Jev; o resumo vem de um job próprio.
- Custos `ask_summary` e `sheet_summary` no ledger e no disjuntor. Contratos: `ai-v1.md`, `ai-cost-v1.md`,
  `ai-queue-v1.md`.

## Em PR — plataforma de disputa (`feat/tender-platform`)

- `tenders.platform`/`platform_label` normalizados na ingestão a partir de `usuarioNome` e links (regras em `artifacts/api-server/src/catalog/tender-platforms.ts`). Software de gestão vira "Sistema de origem: X", nunca "Disputa em". Contrato em [`docs/contracts/search-v1.md`](../docs/contracts/search-v1.md).
- Filtro/facet `platform` na busca; badge "Disputa em" no card e no detalhe; perfil "Sou cadastrado em" (`registeredPlatforms`, não muda `version` nem a aderência); aviso de credenciamento prévio na ficha, por regex e dias úteis com feriados nacionais ([`docs/contracts/ai-v1.md`](../docs/contracts/ai-v1.md)).
- Produção: a migração `0033_tender_platform` precisa ser aplicada manualmente antes do deploy; o job `tender_platform_backfill` da API preenche os antigos sozinho (ao subir e às 02:00, só enquanto houver `platform` nulo). Amostra de 8 out 2026 (104.748 abertos): 36,4% em sala conhecida, 39,9% sistema de origem, 23,7% outro sistema.

## Pardal em movimento na landing (PR #69 mergeado; aproximação na branch `feat/pardal-aproximacao`, 09 out 2026)

- Pardal 3D (Three.js, `pardal-flight-3d.tsx`) extrudado de `public/brand/pardal-silhueta.svg` (os 4 paths do logo:
  corpo, olho e asa em dois paths, que bate). Render sob demanda; tinta invertida sobre `bg-superficie-inversa`.
  Carrega sob demanda (`React.lazy`), como o globo.
- Aproximação (branch nova): perto de cada fronteira o pássaro voa em direção à câmera e o corpo se enche com o
  fundo da próxima seção até cobrir a tela; depois uma cortina da mesma cor sobe com a borda da seção e revela a
  próxima. Em todas as larguras; repouso nas margens só a partir de 1360 px. Com movimento reduzido não há
  transição. O contorno `corpo` do logo é aberto na cauda, então o SVG ganhou `corpo-cheio` (`fill="none"`, não
  muda o desenho): silhueta sólida gerada uma vez por fechamento morfológico do contorno. O zoom pivota no centro
  do maior círculo inscrito nela (`BODY_INNER` no componente); se o SVG mudar, regenerar os dois.
- Dois clipes HyperFrames (`motion/pardal-assinatura`, `motion/pardal-raio-x`) renderizados por
  `pnpm --filter @workspace/licitainsight run motion:render` em `public/motion/` (WebM alfa + HEVC alfa + pôster PNG),
  tocados uma vez na seção "IA com fonte" e na chamada final (`pardal-clip.tsx`).
- Exceção de movimento da landing em [`design-system/motion.md`](../design-system/motion.md).
- Verificado em navegador (sem API): Chrome escolhe WebM, WebKit escolhe HEVC, alfa correto nos dois, temas Creme e
  Petróleo, movimento reduzido. Falta: Safari real, conferência com dados da API e ao vivo após o deploy.

## O que falta

- Beta no ar: depende do owner (nome/domínio, Cloudflare Tunnel, Google OAuth em Testing, Resend).
- Deploy no Fly.io `gru` enxuto: quando o beta tiver ~3 usuários ativos (decisão do owner, 28 set 2026).
- Outras fontes além do Mapas Culturais.
- Alerta por WhatsApp e histórico de preços (achados como gap competitivo em 27 set 2026, não iniciados).

## Problemas conhecidos

- Overrides de binários nativos no `pnpm-workspace.yaml` são para linux-x64 (Replit). Dev no macOS pode falhar ao resolver esbuild/lightningcss/rollup.
- Id inexistente na API responde 404.
