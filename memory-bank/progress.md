# Progress — Licita Insight

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

- Pesquisa, filtros, facets, detalhe e sugestões no frontend, com contrato em `docs/contracts/search-v1.md`.
- API em `/api/v1`: busca, detalhe e sugestões leem só o PostgreSQL. Sem `DATABASE_URL`, a busca responde 503.
- Schema `tenders` e `ingest_runs`. Coletor do PNCP com upsert por `numeroControlePNCP`, carga dia a dia, repartição por UF em timeout, e revisão de processos abertos.
- Calendário `ingest_days` aplicado no Postgres local. A coleta pula partições seladas, retoma UFs incompletas e preserva a revisão individual. Cobertura exposta no GET de ingestão; backfills com datas explícitas continuam forçados.
- Calendário validado com testes unitários e integração em schema isolado de PostgreSQL: segunda execução sem leitura histórica, ausência de duplicatas, virada do dia, falhas parciais, retomada das 27 UFs e revisão individual com limite.
- Validação final do calendário: 27 testes passaram, typecheck e build da API concluídos. A tentativa real em 22 set 2026 (DF, modalidade 6, publicação em 21 set) falhou por timeout do PNCP antes da primeira página; os 19 editais foram preservados e a partição ficou pendente. A verificação de duas execuções foi concluída com respostas controladas do PNCP no Postgres real, não no serviço externo.
- Detalhe busca itens e arquivos do PNCP na primeira abertura e grava no banco.
- A busca mostra `Atualizado em` a partir de `meta.indexUpdatedAt` (última `fetched_at`).
- Chamadas de fomento audiovisual ficam fora de `tenders`. Tabela `cultural_opportunities`, coleta do Mapas Culturais (`source = mapas-culturais`) e lista em `/oportunidades`. Contrato: `docs/contracts/opportunities-v1.md`. `CULTURE_DAILY_COLLECT=false` desliga a agenda. Comando: `pnpm --filter @workspace/api-server run collect:opportunities`. A consulta por termo `linguagem` foi trocada por `@keyword` depois que as instalações responderam 500 ou HTML.
- Verificado em 22 set 2026: 19 pregões eletrônicos do DF publicados em 21 set 2026. A busca por “correios” abre o edital `34028316000103-1-000087-2026`, com link `https://pncp.gov.br/app/editais/34028316000103/2026/87`. O registro permanece depois de reiniciar a API. Uma segunda coleta não duplica a contagem.

## O que já funciona — assinatura (MVP)

- Tabela `subscriptions`, gate `402 SUBSCRIPTION_REQUIRED` nas rotas `/me` de salvos/buscas/notificações.
- Checkout/cancelamento Asaas e webhook autenticado. UI em Configurações + `RequireSubscription` nas páginas pagas.
- 10 testes de billing passaram; typecheck da API e do frontend ok. Schema `subscriptions` no Postgres local.

## O que já funciona — e-mail (Onda 2)

- Preferências (`digest` diário 07:00 BRT, `immediateCritical`) fora do gate, descadastro público em um clique (RFC 8058), entregas idempotentes com retry, buscas salvas em job próprio (15 min).
- UI: switches em `/settings#notificacoes` (otimista, rollback), `/descadastro` com confirmação explícita. QA headless desktop/mobile em 24 set 2026.

## O que já funciona — Perguntar ao edital (Onda 3, fatia 1)

- Extração de PDF (inclusive dentro de ZIP) por página, trechos com `tsvector`, Jev (`jev-1.13.0`) ordena por noul, limiar 0,5, cota diária (teste 5, pago 30), cache por usuário.
- UI: painel no detalhe com estados de acesso/índice/cota, melhor trecho com termos destacados, link para o documento oficial e página, aviso fixo.
- CODEX_HANDOFF-012 concluído: `pdfjs` resolvido no bundle, `search_vector` gerado pelo `push-force`, índices com falha retentáveis, ligaduras corrigidas e corte relativo de 0,25. Stack Docker e PDF real de 29 páginas validados.

## O que já funciona — ficha do edital (Onda 3, item 3.5)

- 13 campos com trecho oficial e página; ausência = "Não encontrado", nunca "não exige"; categorias por Choice (consórcio, subcontratação, ME/EPP, visita, amostra, garantias). Cache global por (edital, versão do índice, modelo, prompt); teto `AI_DAILY_SHEET_LIMIT`.
- Índice parcial: publica o que foi lido, `unreadDocuments`, retentativa em job (5 min, 30 min, 2 h, 1×/dia).

## O que falta

- Credenciais Asaas no ambiente e restart da API do Compose para as rotas de billing entrarem no processo em execução.
- Deploy online (fora do ciclo do paywall).
- Carga nacional dos últimos 30 dias do PNCP.
- Outras fontes além do Mapas Culturais.
- Chave Resend + domínio (click/open tracking desligados) e CODEX_HANDOFF-010.

## Problemas conhecidos

- Overrides de binários nativos no `pnpm-workspace.yaml` são para linux-x64 (Replit). Dev no macOS pode falhar ao resolver esbuild/lightningcss/rollup.
- `Button` das páginas não é o `components/ui/button`. Dois estilos coexistem.
- Id inexistente na API responde 404.
