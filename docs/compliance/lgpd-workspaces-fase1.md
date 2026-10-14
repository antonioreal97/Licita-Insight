# Checklist LGPD — Espaços, Fase 1

Atualizado em 13 de outubro de 2026.

Escopo: dados pessoais novos ou movidos pela Fase 1 do hub adaptativo. Este registro complementa
[`retencao-dados-pessoais.md`](./retencao-dados-pessoais.md) e a ROPA de
[`lgpd-auditoria-2026-10.md`](./lgpd-auditoria-2026-10.md); não cria finalidade nem base legal nova.
Os tratamentos continuam desligados em produção até os gates do plano.

## Checklist de dados e evidências

As finalidades e bases legais abaixo são herdadas do recurso que já tratava o dado. “Exclusão da conta”
significa a transação de `DELETE /api/v1/me`, que passa pela porta de corte e apaga tanto o modelo legado
quanto Espaços, independentemente do modo atual da flag.

| Dado novo ou movido | Finalidade e base herdada | Onde aparece na exportação | Exclusão | Retenção | Evidência automatizada |
|---|---|---|---|---|---|
| Espaço: `id`, tipo, nome, proprietário, slot, estado de onboarding, arquivamento e datas (`workspaces`) | Organizar os recursos solicitados pelo titular e aplicar limites do plano; execução de contrato (art. 7º, V). | `workspaces[]`; `ownerUserId` não é repetido, pois o titular já está em `user.id`. | A conta proprietária apaga o Espaço; dependentes com FK de cascata são apagados na mesma transação. | Até a exclusão da conta; arquivar não apaga. | `privacy-isolation.integration.test.ts`: exportação em `workspaces`, desvirada e exclusão nos dois modos. |
| Preferência internacional copiada de `users` para `workspaces.show_international_opportunities` | Personalizar oportunidades exibidas; execução de contrato (art. 7º, V). | Campo homônimo em `workspaces[]`; a cópia legada continua em `user` enquanto o rollback for suportado. | Exclusão do Espaço/conta. | Até substituição ou exclusão da conta. | `v1-profile-adapter.integration.test.ts`: contrato nos dois modos e ida/volta; `privacy-isolation.integration.test.ts`: exportação/desvirada. |
| Membership `owner`, data de entrada e última seleção (`workspace_members`) | Autorizar e ordenar o acesso ao Espaço; execução de contrato (art. 7º, V). | Incorporada a cada `workspaces[]` como `role`, `memberSince` e `lastSelectedAt`. | Cascata do Espaço ou da conta. | Enquanto existir a associação; na Fase 1 há exatamente um owner por Espaço. | `privacy-isolation.integration.test.ts`: membership exportada e zerada na exclusão; `workspaces.integration.test.ts`: criação+owner atômica e isolamento. |
| Perfil empresarial movido de `company_profiles` para `workspace_profiles`, inclusive respostas, cobertura, porte, plataformas, versão e cursor de alerta | Recomendações, aderência e alertas pedidos pelo titular; execução de contrato (art. 7º, V). | O legado permanece em `companyProfile`; o novo modelo fica em `workspaceProfiles[]` com `workspaceId`. | Exclusão do perfil pela rota ou cascata do Espaço/conta. | Até substituição/exclusão do perfil ou da conta. Durante a reversibilidade, os dois modelos são exportados e apagados. | `privacy-isolation.integration.test.ts`: ambos os perfis após a virada e após a desvirada; `v1-profile-adapter.integration.test.ts`: delete e round trip. |
| Sinais derivados do perfil (`workspace_profile_signals`: tipo, valor normalizado, peso e origem) | Materializar os critérios do perfil para busca/recomendação; execução de contrato (art. 7º, V). | `workspaceProfileSignals[]`, sempre com `workspaceId`. | Recalculados/removidos com o perfil; cascata do Espaço/conta. | Enquanto o perfil correspondente existir; substituídos na atualização. | `privacy-isolation.integration.test.ts`: sinais exportados, isolados e apagados; `v1-profile-adapter.integration.test.ts`: criação e remoção com perfil. |
| Preferência de Espaço ativo (`user_workspace_preferences`) | Retomar o contexto selecionado pelo titular; execução de contrato (art. 7º, V). | `workspacePreference` (`activeWorkspaceId`, `updatedAt`). | Exclusão explícita pela conta; `activeWorkspaceId` vira `NULL` se só o Espaço for excluído. | Até nova seleção ou exclusão da conta. | `privacy-isolation.integration.test.ts`: preferência exportada e apagada; `workspace-service.test.ts`: fallback sem gravação em leitura. |
| Vínculo de aderência com Espaço (`company_tender_fits.workspace_id`) | Impedir reutilização de uma análise entre perfis/Espaços; mesma execução de contrato do cálculo de aderência. | `companyFits[].workspaceId`. | Cascata do Espaço e exclusão da conta. | Herda o ciclo do cache de aderência; é invalidado por versão de perfil e apagado com a conta. | `privacy-isolation.integration.test.ts`: `workspaceId`, isolamento e exclusão; `v1-profile-adapter.integration.test.ts`: fit separado por Espaço. |
| Vínculo de edital salvo/monitorado com Espaço (`saved_tenders.workspace_id`) | Organizar acompanhamento e participação por Espaço; execução de contrato (art. 7º, V). | `savedTenders[].workspaceId`. | Remoção pelo titular, cascata do Espaço ou exclusão da conta. | Até remoção pelo titular ou exclusão. | `privacy-isolation.integration.test.ts`: exportação/isolamento/exclusão; `v1-saved-adapter.integration.test.ts`: contrato nos dois modos. |
| Vínculo de busca salva com Espaço (`saved_searches.workspace_id`) | Monitorar critérios escolhidos no contexto correto; execução de contrato (art. 7º, V). | `savedSearches[].workspaceId`. | Soft delete/restore como antes; cascata do Espaço ou exclusão da conta. | Mesma retenção da busca salva: até remoção definitiva/conta. | `privacy-isolation.integration.test.ts`: exportação/isolamento/exclusão; `v1-searches-notifications-adapter.integration.test.ts`: contrato nos dois modos. |
| Vínculo de notificação com Espaço (`notifications.workspace_id`) | Exibir o alerta no contexto que o originou; execução de contrato (art. 7º, V). | `notifications[].workspaceId`. | Cascata do Espaço ou exclusão da conta; lidas também entram no expurgo diário. | Notificações lidas: 180 dias de `read_at`; não lidas até leitura/conta. | `privacy-isolation.integration.test.ts`: exportação, leitura negativa e exclusão; `cycle-email-drain.integration.test.ts`: retenção nos dois modos. |
| Vínculo de entrega de e-mail com Espaço (`email_deliveries.workspace_id`) | Auditoria de envio e agrupamento por contexto; execução de contrato e exercício regular de direitos (art. 7º, V e VI). | `emailDeliveries[].workspaceId`. | Exclusão explícita pela conta; se apenas o Espaço for apagado, a FK preserva o registro operacional com `workspaceId = null`. | Conteúdo e destinatário são redigidos após 180 dias; metadados restantes até exclusão da conta. | `privacy-isolation.integration.test.ts`: exportação/link/isolamento/exclusão; `cycle-email-drain.integration.test.ts`: agrupamento e retenção. |
| Vínculo entrega↔notificação e Espaço (`email_delivery_notifications.workspace_id`) | Provar quais alertas compuseram cada envio sem cruzar contas/Espaços; mesmas bases da entrega. | IDs relacionados em `emailDeliveries[].notificationIds`; o `workspaceId` da entrega identifica o contexto. | Cascata da entrega, notificação, Espaço ou conta. | Enquanto ambos os registros relacionados existirem. | `privacy-isolation.integration.test.ts`: `notificationIds` e contadores `crossed_accounts = 0`, `crossed_workspaces = 0`. |
| Vínculo de evento comportamental com Espaço (`recommendation_events.workspace_id`) | Personalização opt-in no contexto correto; consentimento (art. 7º, I). | `recommendationEvents[].workspaceId`. | Revogação/limpeza do histórico, cascata do Espaço ou exclusão da conta. | Máximo de 180 dias. | `privacy-isolation.integration.test.ts`: exportação/isolamento/exclusão; `v1-recommendations-adapter.integration.test.ts`: expurgo diário nos dois modos. |
| Vínculo de descarte com Espaço (`recommendation_dismissals.workspace_id`) | Não voltar a sugerir um item descartado naquele contexto; execução de contrato e, quando derivado do histórico, consentimento. | `recommendationDismissals[].workspaceId`. | Limpeza do histórico, cascata do Espaço ou exclusão da conta. | Até limpeza do histórico, Espaço ou conta. | `privacy-isolation.integration.test.ts`: exportação/isolamento/exclusão; `v1-recommendations-adapter.integration.test.ts`: separação por Espaço. |
| Vínculo do perfil agregado de interesses (`recommendation_interest_profiles.workspace_id`) | Materializar preferências para recomendações do Espaço; execução de contrato e consentimento para sinais comportamentais. | `recommendationInterestProfile.workspaceId`. | Limpeza/reconstrução do perfil, cascata do Espaço ou exclusão da conta. | Enquanto a personalização estiver ativa ou até exclusão. | `privacy-isolation.integration.test.ts`: exportação nos dois modelos e exclusão; `v1-recommendations-adapter.integration.test.ts`: preferência e reconstrução. |
| Vínculo das recomendações materializadas (`user_recommendations.workspace_id`) | Exibir ranking do contexto correto; execução de contrato. | `recommendations[].workspaceId`. | Reconstrução/limpeza, cascata do Espaço ou exclusão da conta. | Materialização substituível; até reconstrução, Espaço ou conta. | `privacy-isolation.integration.test.ts`: exportação/isolamento/exclusão; `v1-recommendations-adapter.integration.test.ts`: ranking por Espaço. |
| Vínculo de job de aderência (`ai_jobs.workspace_id`) | Executar o cálculo para o perfil correto e rejeitar vínculo removido; execução de contrato e proteção operacional. | `aiJobs[].workspaceId`. | Exclusão explícita pela conta; ao excluir só o Espaço, a FK preserva o histórico operacional com `workspaceId = null`. | Herda o ciclo operacional do job; é sempre apagado com a conta. | `privacy-isolation.integration.test.ts`: exportação/exclusão; `cycle-fit-collection.integration.test.ts`: membership removida cancela o job sem ler o Espaço. |
| Histórico de perguntas (`ai_ask_requests`), deliberadamente sem `workspace_id` | Histórico, cota e resposta à pergunta do titular; execução de contrato (art. 7º, V). | `aiQuestions[]`, como antes. | Exclusão explícita com a conta; excluir apenas Espaço não toca o log. | 90 dias ou exclusão da conta, conforme `ai-v1.md`. | `privacy-isolation.integration.test.ts`: pergunta exportada e removida nos dois modos. |

## Retenção e porta de corte

- `personal_data_retention` continua tratando sessões, notificações lidas e conteúdo de e-mail. Para as duas
  tabelas que ganharam `workspace_id`, o ciclo passa pela porta, não começa durante a pausa e aplica o mesmo
  prazo em `legacy` e `workspaces`; isso é provado por `cycle-email-drain.integration.test.ts`.
- Espaços, memberships, perfis, sinais e preferência ativa não ganharam uma retenção temporal autônoma:
  existem enquanto necessários à conta e são apagados pela exclusão de conta. Arquivamento não equivale a
  apagamento.
- `exportAccountData` é leitura dos dois modelos e continua disponível durante a pausa. `deleteAccount` é
  mutação, consulta a pausa antes de qualquer cancelamento remoto e executa a exclusão local por
  `withCutoverGate`.
- O tombstone antifraude de trial continua preservado conforme o contrato atual: somente HMAC irreversível,
  fim do trial e data de criação; não ganhou vínculo com Espaço.

## Matriz de isolamento e pendências

Cobertura entregue nesta unidade:

- adaptadores v1: duas contas exercitam leitura, exportação e mutações negativas em `legacy` e
  `workspaces`; nenhum marcador, id, e-mail, contagem ou linha da conta vizinha aparece ou muda;
- jobs: o teste de fit cancela job cuja membership foi removida antes de ler dados do Espaço;
- cache HTTP: respostas pessoais verificadas não são públicas e a busca por notificação alheia usa
  `no-store` e o mesmo resultado vazio;
- links: entrega↔notificação é validada por conta e por `workspace_id`;
- LGPD: exportação, desvirada, exclusão dos dois modelos, vizinho intacto e pausa são cobertos pelo teste
  `privacy-isolation.integration.test.ts`;
- guarda estática: `cutover-gate-static.test.ts` aponta `arquivo:linha` para gravação fora da porta ou na
  tabela da flag.

Exceções explícitas do scanner estático:

1. `account/notification-service.ts` / `notifications`: notificações da coleta usam a transação do upsert,
   que entra na porta com `enterCutoverGate` antes de consultar assinantes e inserir;
2. `ai/ai-job-queue.ts` / `ai_jobs`: manutenção genérica da fila altera apenas estado, tentativas e locks;
   o job `fit` nasce na transação gated do chamador, grava o resultado pela porta e participa da drenagem;
3. `auth/session-service.ts` / `users`: a função interna só insere quando recebe `createIn`; apenas o fluxo
   de criação gated passa esse parâmetro, enquanto o primeiro lookup ungated retorna antes do insert.

Pendências que não podem ser fechadas pela unidade F:

- **C2:** rotas novas de Espaços ainda não existem; seus casos 404/402, paginação, mass assignment e busca
  com `workspaceId` alheio permanecem na matriz de `workspaces-v1.md` para implementação/teste em C2;
- **G:** a ferramenta de corte será a única escritora autorizada de `workspace_cutover_events`; como fica
  fora do código da aplicação, não cria exceção no scanner desta unidade;
- **H:** chaves React Query do frontend com `workspaceId` e isolamento visual/cache de jornadas pertencem
  ao frontend mínimo desligado.

## Resultado do gate da unidade F

- [x] exportação preserva o formato anterior de forma aditiva e cobre os dois modelos em qualquer modo;
- [x] exclusão de conta passa pela porta e remove os dois modelos sem atingir a conta vizinha;
- [x] retenção das tabelas afetadas foi conferida nos dois modos;
- [x] isolamento disponível de API, jobs, cache HTTP e links tem evidência automatizada;
- [x] scanner estático bloqueia gravações fora da porta e na tabela da flag, com exceções justificadas;
- [x] itens dependentes de C2, G e H estão identificados como pendentes.
