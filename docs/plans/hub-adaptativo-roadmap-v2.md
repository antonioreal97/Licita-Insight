# Hub adaptativo — roadmap v2

Status: roadmap revisado após aprovação das decisões de 12/10/2026. Ele ordena trabalho futuro; este PR entrega somente a Fase 0 e não cria tabelas, migrações ou telas.

Referências: [plano original](./hub-adaptativo-2026-10-12.md), [revisão aprovada](./hub-adaptativo-revisao.md), [compatibilidade de `workspace_id`](./hub-adaptativo-compatibilidade.md) e contratos em `docs/contracts/`.

## Princípios e sequência crítica

O catálogo é universal; Espaços são contextos de descoberta e acompanhamento. Personalização não cria bases separadas. A primeira alteração estrutural de produção deve ser Espaços e compatibilidade dos recursos atuais, antes de qualquer redesenho do dashboard.

Sequência crítica:

`Fase 0: contratos` → `Fase 1: Espaços e backfill` → `Fase 2: catálogo universal` → `Fase 3: experiências/gates` → `Fase 4: escala e otimização`.

Pesquisa começa como especialização/filtro de Fomento. Estudo permanece oculto até haver pelo menos uma fonte oficial homologada e verificada. Banco Mundial entra em `procurement`; domínio, país e fonte continuam dimensões independentes.

## Fase 0 — contratos e baseline (este PR)

Entregas: schemas versionados dos cinco perfis; sinais e completude; registro de experiências; catálogo tipado e mapeadores; contrato de Espaços; homologação de fontes; flags desligadas por padrão; instrumentação mínima e baseline; revisão de compatibilidade; este roadmap.

Dependências: plano do dono, schemas e serviços atuais, inventário de coletores e decisões aprovadas.

Aceite:

- nenhum schema de banco, rota v1 ou comportamento visual muda;
- `FEATURE_JOURNEYS` vazio preserva o produto atual;
- contratos e mapeadores têm testes unitários;
- baseline separa consultas agregadas de eventos GA4 com consentimento;
- decisões restantes aparecem explicitamente como pendências.

Esforço indicativo: 1–2 semanas de engenharia/revisão, já concentradas neste PR. Gate de saída: aprovação dos contratos pelo dono e revisão técnica do plano de migração.

## Fase 1 — fundação de Espaços e compatibilidade

Objetivo: introduzir Espaços na persistência e nas APIs sem redesenhar o produto, executar um backfill único e manter rotas v1 por adaptadores.

Dependências: Fase 0 aprovada; backup e restore ensaiados; decisão sobre Espaços excedentes após expiração; métricas de integridade; versão de aplicação compatível com colunas nulas e adaptadores pronta para deploy.

Escopo:

- criar Espaços, memberships, invites, perfis versionados e sinais;
- atribuir recursos pessoais existentes ao Espaço padrão `procurement`;
- adaptar rotas `/me`, jobs, caches, e-mails, exportação e exclusão;
- manter assinatura/sessão na conta e catálogo atual global;
- criar telas de gestão somente depois da integridade estrutural; sem redesenhar dashboard nesta etapa.

Aceite:

- um Espaço padrão e membership `owner` para cada usuário preexistente;
- contagens antes/depois iguais, sem órfãos ou `workspace_id` nulo no cutover;
- isolamento negativo coberto em API, jobs, cache e links;
- rotas v1 mantêm payload e comportamento no Espaço padrão;
- conta grátis limitada a um Espaço; trial/assinatura a cinco; expiração não apaga dados;
- rollback ensaiado e janela operacional aprovada.

Esforço indicativo: 2–4 semanas, incluindo ensaio de backfill e rollout. Gate de produção: dono aprova relatório do dry run, backup verificado, regra dos Espaços excedentes e checklist LGPD.

## Fase 2 — catálogo universal e projeções

Objetivo: unificar leitura de `tenders` e `cultural_opportunities` sob `OpportunitySummary`, preservando tabelas/fontes de origem e proveniência.

Dependências: Fase 1 estável; fontes com homologação suficiente; estratégia de projeção e fingerprint validada; baseline quente/frio coletado.

Escopo:

- materializar/projetar catálogo comum sem duplicar a origem;
- incluir extensões por domínio, elegibilidade internacional e países;
- manter “Explorar tudo” fora dos Espaços e permitir o mesmo item no universal e no contexto personalizado;
- iniciar Pesquisa dentro de Fomento; manter Estudo oculto;
- criar índices de busca necessários antes de prometer metas agressivas.

Aceite:

- mapeamento e round-trip de proveniência auditáveis;
- fingerprint estável e colisões monitoradas;
- busca universal e por domínio têm paridade funcional e paginação determinística;
- metas p95 são definidas a partir dos baselines quente e frio após cada índice, sem adotar 300 ms como meta inicial;
- nenhuma oportunidade internacional perde país, regra ou evidência de elegibilidade.

Esforço indicativo: 3–5 semanas. Gate: dono aprova qualidade das fontes, amostra de mapeamento e metas de latência por etapa.

## Fase 3 — experiências, acompanhamento e gates

Objetivo: habilitar progressivamente as jornadas aprovadas e o fluxo de acompanhamento por Espaço.

Dependências: Fases 1–2 estáveis; checkout Asaas homologado ponta a ponta; telemetria de funil; textos e UX aprovados; flags com rollback operacional.

Escopo:

- ligar experiências uma a uma por `FEATURE_JOURNEYS` e exposição controlada;
- busca e detalhe seguem públicos; salvar, monitorar e alertar seguem pagos em todos os domínios;
- onboarding exige somente palavras-chave e região, com salvamento parcial;
- gestão de até cinco Espaços conforme entitlement;
- Pesquisa continua filtro de Fomento até evidência de volume, qualidade e demanda justificar separação;
- Estudo só é habilitado após fonte oficial homologada.

Aceite:

- checkout, webhook, status ativo/inadimplente/cancelado, cupom e retomada validados em ambiente adequado;
- cada flag isolada pode ser desligada sem migração reversa nem tela quebrada;
- nenhum gate restringe busca/detalhe;
- eventos de funil respeitam consentimento e não carregam termo, nome, e-mail ou ID de usuário;
- experiência desligada mantém UI idêntica à anterior.

Esforço indicativo: 3–6 semanas em incrementos pequenos. Gate por jornada: aprovação do dono, fonte homologada, teste de acessibilidade e plano de rollback da flag.

## Fase 4 — escala, qualidade e otimização

Objetivo: melhorar relevância, latência e operação depois que uso real justificar investimento.

Dependências: volume suficiente, baseline confiável, SLOs aprovados e gargalo comprovado.

Escopo possível: índices adicionais, projeções incrementais, dedupe entre fontes, métricas de qualidade, expansão internacional, Pesquisa como jornada independente e novas fontes de Estudo.

Aceite: SLOs separados para cache quente/frio; custo e freshness monitorados; regressão de relevância medida; runbooks de fonte e reprocessamento testados.

Esforço: contínuo, priorizado por dados. Gate: cada otimização precisa de hipótese, baseline e critério de rollback.

## Sequência futura de migrações SQL

Esta é uma ordem de execução proposta, não nomes de arquivos a criar nesta Fase 0. Cada passo vira uma migração pequena e revisável; produção é operada manualmente pelo dono, uma por vez.

1. **Preflight sem DDL:** contar usuários e recursos, localizar órfãos/duplicidades, estimar locks e registrar checksums/contagens.
2. **Núcleo aditivo:** criar `workspaces`, `workspace_members`, `workspace_invites`, `workspace_profiles`, `workspace_profile_signals` e preferência server-side de Espaço; índices e FKs inicialmente compatíveis com carga.
3. **Espaços padrão:** inserir um `procurement` por usuário e membership `owner`, de forma idempotente; validar limite e unicidade explícita de padrão.
4. **Colunas de compatibilidade:** adicionar `workspace_id` anulável às tabelas pessoais identificadas em `hub-adaptativo-compatibilidade.md`; criar FKs como `NOT VALID` quando apropriado para reduzir lock.
5. **Backfill único:** atribuir recursos atuais ao Espaço padrão e converter `company_profiles` em perfil/sinais. Não há escrita dupla; a aplicação nessa janela deve tolerar coluna nula até o cutover.
6. **Dedupe e índices:** reconstruir chaves por Espaço (`saved_tenders`, buscas, notificações, recomendações, fits, jobs personalizados), preferindo índices concorrentes fora de transações quando o PostgreSQL exigir.
7. **Constraints:** comparar contagens, validar FKs, eliminar nulos e só então aplicar `NOT NULL`/novas unicidades. Qualquer falha interrompe a sequência.
8. **Cutover v1:** ativar adaptadores para Espaço padrão, revalidar autorização em jobs e limpar somente código legado já sem leitores/escritores.
9. **Catálogo aditivo (Fase 2):** criar projeção/estrutura comum e índices, backfill de `tenders` e `cultural_opportunities`, validar fingerprints e proveniência antes do cutover de leitura.
10. **Salvos genéricos (Fase 2/3):** criar recursos de catálogo por Espaço, copiar estados atuais com verificação e trocar leituras antes de remover qualquer estrutura antiga em uma versão posterior.

Nunca combinar criação, backfill massivo, constraint e remoção em uma única migração. Nenhuma remoção de coluna/tabela ocorre até uma release posterior comprovar que não há leitores, jobs ou retries antigos.

## Operação, backup e rollback

Antes de cada passo em produção:

- dono confirma janela e executa backup; verificar conclusão e capacidade de restore, não apenas existência do arquivo;
- registrar versão da aplicação, contagens, tamanho das tabelas, duração esperada e queries de cancelamento;
- pausar somente jobs que escrevem nas tabelas afetadas, preservando coleta global quando segura;
- executar uma migração por vez, medir lock/duração, rodar validações e obter aprovação antes da próxima.

Rollback por categoria:

- DDL aditivo: desligar flags/adaptadores e voltar a versão anterior; estruturas novas podem permanecer vazias até remoção planejada.
- Backfill: manter relatório das linhas inseridas/atualizadas e chave determinística. Se a validação falhar antes do cutover, remover apenas dados identificados do backfill ou restaurar o backup, conforme volume e runbook aprovado.
- Índices/constraints: cancelar operação longa; remover somente o índice novo inválido pelo nome exato. Não relaxar constraint depois do cutover sem primeiro voltar a aplicação.
- Cutover: flags desligadas e rollback da aplicação retornam às rotas v1 anteriores enquanto estruturas legadas ainda existem. Escrita dupla não será usada como mecanismo de rollback.
- Incidente de integridade ou isolamento: interromper rollout e jobs personalizados, preservar evidências, restaurar backup se necessário e não prosseguir para a fase seguinte.

## Riscos para usuários existentes

| Risco                                    | Mitigação/validação                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| perfil atual perde nuance                | conversão campo a campo, amostra antes/depois e schemaVersion preservado             |
| salvos/checklists/histórico somem        | contagens e hashes de payload; sem recomputação                                      |
| alertas duplicados ou omitidos           | dedupe com Espaço, cursores preservados e execução sombra em dados fictícios/staging |
| link antigo de e-mail deixa de abrir     | adaptador v1 resolve Espaço padrão; teste de URLs emitidas antes do cutover          |
| cache mostra dados de outro Espaço       | chave inclui `workspaceId`, invalidação na troca e teste negativo                    |
| assinatura expira durante migração       | dados nunca apagados; entitlement é consultado na ação, não no backfill              |
| conta recebe mais de um Espaço por retry | idempotência e unique de Espaço padrão por usuário                                   |
| job antigo persiste sem Espaço           | drenar/pause de workers, payload versionado e rejeição segura                        |
| aumento de latência                      | índices antes do cutover e SLO quente/frio medido por etapa                          |
| exclusão/exportação incompleta           | testes LGPD abrangendo todos os Espaços antes de liberar criação múltipla            |

## Gates de aprovação

1. **Contrato:** dono aprova Fase 0 e resolve pendências registradas.
2. **Migração:** revisão de SQL, estimativa de lock, backup/restore e dry run com dados representativos.
3. **Integridade:** contagens, órfãos, dedupe e matriz de isolamento verdes antes de `NOT NULL` e cutover.
4. **Catálogo:** proveniência, fingerprint, fontes e metas de busca aprovadas.
5. **Cobrança:** checkout Asaas ponta a ponta aprovado antes de alterar gates na Fase 3.
6. **Jornada:** fonte, UX, acessibilidade, analytics e rollback de flag aprovados individualmente.
7. **Escala:** qualquer SLO ou índice novo nasce de baseline observado, com custo e rollback documentados.

Nenhuma fase começa automaticamente pela aprovação deste roadmap. Em especial, este PR não inicia a Fase 1.
