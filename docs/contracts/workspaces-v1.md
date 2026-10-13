# API de Espaços v1 — rascunho

Data de atualização: 13 out. 2026
Status: somente contrato consolidado; nenhuma rota, tabela ou migração implementada, e a Fase 1 não está autorizada
Plano de referência: [hub adaptativo](../plans/hub-adaptativo-2026-10-12.md)

Todas as rotas usam a sessão atual no cookie HttpOnly `licita_session`. Nenhuma aceita token de sessão ou perfil em `localStorage`. Escritas mantêm a proteção CSRF atual (`X-Requested-With`) e são `Cache-Control: no-store`.

Na Fase 1, todo Espaço tem exatamente uma associação em `workspace_members`, com papel `owner`. Convites, outros papéis, equipes, gerenciamento de membros e colaboração são escopo exclusivo da Fase 6; esta versão não define rotas para essas funções.

## Tipos comuns

```ts
type WorkspaceType = "procurement" | "funding" | "study" | "culture";
type WorkspaceRole = "owner";
type WorkspaceAccessMode = "write" | "read_only";
type OnboardingStatus = "not_started" | "in_progress" | "complete";

type WorkspaceSummary = {
  id: string;
  type: WorkspaceType;
  name: string;
  role: WorkspaceRole;
  accessMode: WorkspaceAccessMode;
  onboardingStatus: OnboardingStatus;
  profileCompleteness: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

IDs são opacos. O servidor calcula papel, completude, status e `accessMode`; o cliente não os grava diretamente. `accessMode` é derivado do entitlement atual e do slot estável do Espaço, não persistido como fonte de verdade.

`onboardingStatus` tem somente estes três estados (decisão de 13/10/2026). `not_started` e `in_progress` distinguem quem ainda não respondeu nada de quem começou; `complete` significa **mínimo aprovado concluído** — palavras-chave e região —, que é o que libera a primeira busca útil. A riqueza do perfil além do mínimo é dado derivado (`completeness.nextStep` e a contagem de etapas opcionais pendentes), nunca um quarto estado.

Na Fase 1, somente `procurement`, `funding` e `culture` podem ser criados, e ainda dependem de feature flag. Pesquisa é uma especialização de `funding`, não um tipo próprio. `study` permanece reservado e responde `FEATURE_DISABLED` enquanto não houver fonte oficial homologada.

## Limites e downgrade

| Situação da conta         | Espaços graváveis | Comportamento dos excedentes                                              |
| ------------------------- | ----------------: | ------------------------------------------------------------------------- |
| gratuita, sem teste ativo |                 1 | somente leitura                                                           |
| teste ativo               |             até 5 | criação bloqueada acima do teto                                           |
| assinatura ativa          |             até 5 | criação bloqueada acima do teto                                           |
| assinatura/teste expirado |                 1 | todos, exceto o Espaço não arquivado de menor slot, ficam somente leitura |

O slot é estável e único por proprietário entre Espaços não excluídos. Arquivar não renumera slots; ao restaurar, o acesso é recalculado com o Espaço novamente na ordenação. O servidor não reordena slots silenciosamente.

Downgrade nunca exclui, arquiva, mescla ou move dados. Espaços excedentes continuam listados, selecionáveis, consultáveis e exportáveis, mas não aceitam mutações de nome, perfil, salvos, monitoramentos, buscas, alertas ou preferências próprias. Antes da expiração, a UI deve informar claramente qual Espaço permanecerá editável.

Criar Espaço acima do limite retorna HTTP `402` com `error.code = WORKSPACE_LIMIT_REACHED`. Alterar um Espaço excedente retorna HTTP `402` com `error.code = WORKSPACE_READ_ONLY`. O código genérico `SUBSCRIPTION_REQUIRED` continua reservado ao gate de uma ação premium; os três casos permanecem distintos para permitir mensagens específicas sem mudar os gates atuais.

## Rotas de Espaços e onboarding

### `GET /api/v1/me/workspaces`

Resposta `200`:

```json
{
  "workspaces": [],
  "activeWorkspaceId": null,
  "limits": { "used": 0, "maximum": 1 }
}
```

Lista somente Espaços em que o usuário possui membership `owner`, cada um com `accessMode` calculado. Arquivados podem ser incluídos por `?archived=true`; padrão `false`. O limite é 1 para conta gratuita e 5 durante teste ou assinatura ativa.

Se a preferência gravada apontar para um Espaço arquivado, excluído ou sem acesso, `activeWorkspaceId` devolve o resultado da [resolução do Espaço ativo](#resolução-do-espaço-ativo) **sem gravar**: um `GET` não muda estado.

### `POST /api/v1/me/workspaces`

```json
{ "type": "procurement", "name": "Licitações da empresa" }
```

Resposta `201`: `WorkspaceSummary`. O servidor cria a associação `owner` na mesma transação e aloca o próximo slot serializando criações concorrentes do mesmo proprietário. Um Espaço representa um objetivo; “Explorar tudo” não cria Espaço e consulta o catálogo universal. `study` responde `FEATURE_DISABLED` enquanto não houver flag e fonte oficial homologada. Limite excedido responde `WORKSPACE_LIMIT_REACHED` conforme a seção de erros.

### `GET /api/v1/me/workspaces/{id}`

Resposta `200`:

```json
{
  "workspace": {},
  "profile": {
    "schemaVersion": 1,
    "type": "procurement",
    "answers": {},
    "completeness": {
      "percent": 0,
      "complete": false,
      "missing": ["keywords", "region"],
      "nextStep": "objective"
    }
  }
}
```

Aplica `requireWorkspaceMember` antes de carregar perfil ou derivados. Leitura é permitida em Espaço somente leitura.

### `PATCH /api/v1/me/workspaces/{id}`

Aceita subconjunto de:

```json
{ "name": "Novo nome", "archived": false }
```

Exige membership `owner` e `accessMode = write`. Arquivar o Espaço ativo aplica a [resolução do Espaço ativo](#resolução-do-espaço-ativo) e grava a nova preferência na mesma transação.

### `PUT /api/v1/me/workspaces/{id}/profile`

Salva uma etapa validada:

```json
{
  "schemaVersion": 1,
  "step": "objective",
  "baseRevision": 3,
  "answers": { "selectedKeywords": ["manutenção predial"] }
}
```

O tipo vem do Espaço, não do cliente. Resposta `200` devolve documento mesclado, completude calculada, `profileVersion` e a nova `revision`. Exige membership `owner` e `accessMode = write`. Campo de outra etapa, tipo inválido ou versão desconhecida responde `INVALID_PARAMETER` com detalhes, sem atualização parcial.

Controle otimista (decisão de 13/10/2026): `baseRevision` é obrigatório e deve ser a `revision` que o cliente leu; no primeiro salvamento é `0`. `revision` sobe a **toda** gravação do perfil e é independente de `profileVersion`, que continua subindo apenas quando muda algo que afeta afinidade — reaproveitar `profileVersion` deixaria passar conflitos em campos que não a alteram e invalidaria cache sem necessidade. A comparação acontece dentro da transação que já serializa a gravação do perfil. Divergência responde `409 PROFILE_VERSION_CONFLICT` com a `revision` e as respostas atuais em `details`, para a UI oferecer recarregar; nada é gravado. Etapas diferentes continuam sendo mescladas no servidor; o conflito protege a mesma etapa aberta em duas abas ou dispositivos.

A rota v1 `PUT /api/v1/me/company-profile` não muda: continua sem `baseRevision`, com a semântica atual de última gravação vence.

### `PUT /api/v1/me/active-workspace`

```json
{ "workspaceId": "ws_opaco" }
```

Resposta `200`: `{ "activeWorkspaceId": "ws_opaco" }`. Aplica associação antes de gravar preferência e registra o momento da seleção, usado pela resolução abaixo. Espaço somente leitura pode ser selecionado. Espaço arquivado responde `WORKSPACE_ARCHIVED`.

### Resolução do Espaço ativo

Decisão de 13/10/2026. Um único resolvedor determinístico é usado quando a preferência deixa de ser válida:

1. considerar os Espaços não arquivados com `accessMode = write`;
2. entre eles, escolher o selecionado mais recentemente;
3. em empate ou sem histórico de seleção, o criado primeiro e, depois, o de menor `id`;
4. se não houver nenhum Espaço não arquivado, `activeWorkspaceId = null`, e a UI leva a “Explorar tudo” ou à criação de um Espaço.

O resolvedor roda em dois lugares: na transação que arquiva o Espaço ativo, gravando a nova preferência, e na leitura de `GET /api/v1/me/workspaces` quando a preferência é inválida, devolvendo o resultado sem gravar. Depois de um downgrade, o critério 1 coincide com o Espaço não arquivado de menor slot, que é o único gravável; como esse Espaço existe sempre que há algum não arquivado, os critérios 1 a 3 cobrem todos os casos antes do `null`.

A preferência referencia o Espaço com `ON DELETE SET NULL`, para que a exclusão de um Espaço caia na resolução sem erro. O momento da última seleção por Espaço é persistido (por exemplo, `last_selected_at`); a forma física é definida no SQL da W1, que ainda não está autorizado.

## Artefatos por espaço

Todas aplicam `requireWorkspaceMember(id)`. A forma detalhada será fechada na fase responsável; estes são os envelopes mínimos. Leituras continuam disponíveis em Espaços somente leitura; toda mutação exige `accessMode = write` além do gate vigente.

| Rota                                             | Métodos e resposta mínima                                         | Gate adicional                                         |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------ |
| `/api/v1/me/workspaces/{id}/saved-opportunities` | `GET` paginado; `PUT /{opportunityId}`; `DELETE /{opportunityId}` | assinatura ativa para mutações e uso do recurso        |
| `/api/v1/me/workspaces/{id}/saved-searches`      | `GET`, `POST`, `PATCH /{searchId}`, `DELETE /{searchId}`          | assinatura ativa; busca salva deve pertencer ao Espaço |
| `/api/v1/me/workspaces/{id}/recommendations`     | `GET` paginado                                                    | personalização/assinatura conforme política vigente    |
| `/api/v1/me/workspaces/{id}/notifications`       | `GET`, `PATCH /read`                                              | assinatura ativa; ids filtrados por Espaço e usuário   |
| `/api/v1/me/workspaces/{id}/dashboard`           | `GET` com widgets tipados e métricas simples                      | leitura do membro; não faz N consultas pelo frontend   |

Busca e detalhe universais continuam públicos. `workspaceId` em busca é opcional e somente personaliza depois de validar sessão + associação.

### `workspaceId` na busca universal

Decisão de 13/10/2026, alinhada ao que a busca v1 já faz com parâmetros pessoais (`myRegion`, `notification`):

| Caso                                                               | Resposta                                                                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| sem sessão, com `workspaceId`                                      | `401 UNAUTHENTICATED`                                                                                                |
| com sessão, id malformado                                          | `400 INVALID_PARAMETER`; a validação é só de sintaxe e não consulta dados                                            |
| com sessão, id inexistente, de outro usuário ou sem acesso         | `200` com o resultado universal, sem personalização, e `meta.workspace = null`; corpo **idêntico** nos três subcasos |
| com sessão, Espaço próprio, inclusive arquivado ou somente leitura | `200` personalizado; ler não é mutação                                                                               |

O `401` sem sessão evita mostrar resultado genérico como se fosse personalizado quando a sessão expirou. Com sessão, nunca `404` nem `401`: qualquer variação entre “não existe” e “não é seu” permitiria enumerar Espaços. `meta.workspace = null` permite ao frontend detectar um id obsoleto e chamar a resolução do Espaço ativo.

A validação usa a mesma consulta de `requireWorkspaceMember` (id + associação em uma única leitura). Toda resposta de busca que receba `workspaceId` é `Cache-Control: no-store`, personalizada ou não.

## `requireWorkspaceMember`

Na Fase 1, a regra é satisfeita exclusivamente por memberships `owner`; o nome permanece estável para a ampliação de papéis na Fase 6.

Ordem obrigatória:

1. exigir sessão válida;
2. validar sintaxe do id sem consultar artefatos;
3. buscar `workspace_members` por `(workspace_id, user_id)` e Espaço não excluído;
4. se ausente, responder o mesmo `404 WORKSPACE_NOT_FOUND` usado para id inexistente;
5. anexar ao contexto somente `{workspaceId,type,role,ownerUserId,archivedAt,accessMode}`;
6. aplicar papel, estado e `accessMode` antes de qualquer leitura ou mutação subordinada;
7. toda consulta posterior inclui `workspace_id` no predicado, mesmo após o middleware;
8. jobs recebem `workspaceId` + versão e revalidam associação, estado e acesso no início da execução.

Não aceitar `owner_user_id` enviado pelo cliente nem autorizar apenas porque `workspaces.owner_user_id = user.id`; a associação vem de `workspace_members` desde o início.

## Erros

Mantém o envelope v1 atual `{ error: { code, message, requestId, details? } }`.

| HTTP | Código                     | Quando                                                                 |
| ---- | -------------------------- | ---------------------------------------------------------------------- |
| 400  | `INVALID_PARAMETER`        | payload, etapa, versão, paginação ou `workspaceId` malformado na busca |
| 401  | `UNAUTHENTICATED`          | sessão ausente/expirada                                                |
| 402  | `SUBSCRIPTION_REQUIRED`    | ação premium sem acesso                                                |
| 402  | `WORKSPACE_LIMIT_REACHED`  | criação excede o limite 1/5                                            |
| 402  | `WORKSPACE_READ_ONLY`      | mutação em Espaço excedente após downgrade                             |
| 403  | `WORKSPACE_ROLE_REQUIRED`  | reservado à Fase 6 para membro conhecido sem papel suficiente          |
| 404  | `WORKSPACE_NOT_FOUND`      | inexistente ou sem membership, sem distinção                           |
| 409  | `WORKSPACE_ARCHIVED`       | escrita ou seleção em Espaço arquivado                                 |
| 409  | `PROFILE_VERSION_CONFLICT` | `baseRevision` diferente da `revision` atual em `PUT .../profile`      |
| 422  | `FEATURE_DISABLED`         | jornada ainda não habilitada                                           |

## Matriz mínima de isolamento

| Cenário                                       | Ação                                         | Esperado                                                        |
| --------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| A acessa Espaço de A                          | listar/detalhar                              | 200                                                             |
| A usa id inexistente                          | detalhar                                     | 404                                                             |
| A usa Espaço de B                             | detalhar                                     | mesmo 404, corpo e timing de classe equivalentes                |
| A altera perfil de B                          | `PUT profile`                                | 404; nenhuma linha alterada                                     |
| A seleciona Espaço de B                       | `PUT active-workspace`                       | 404; preferência anterior preservada                            |
| A seleciona seu Espaço somente leitura        | `PUT active-workspace`                       | 200; seleção permitida                                          |
| A altera seu Espaço somente leitura           | qualquer mutação                             | 402 `WORKSPACE_READ_ONLY`; nada alterado                        |
| A lista salvos de B                           | `GET saved-opportunities`                    | 404; nenhum id ou contagem vazada                               |
| A usa `searchId` de B dentro do Espaço de A   | alterar/excluir                              | 404                                                             |
| papel futuro `viewer` tenta escrever (Fase 6) | qualquer mutação                             | 403 após associação; nada alterado                              |
| papel futuro `editor` arquiva (Fase 6)        | `PATCH`                                      | 403                                                             |
| owner arquiva                                 | `PATCH`                                      | 200; ativo reconciliado                                         |
| owner usa Espaço arquivado                    | leitura permitida conforme endpoint; escrita | 409 na escrita                                                  |
| request sem sessão envia `workspaceId`        | busca                                        | 401; nenhum resultado                                           |
| A envia `workspaceId` malformado              | busca                                        | 400 por sintaxe, sem consulta a dados                           |
| A envia `workspaceId` inexistente             | busca                                        | 200 universal, `meta.workspace = null`, `no-store`              |
| A envia `workspaceId` de B                    | busca                                        | mesmo corpo do id inexistente; nunca aplica sinais de B         |
| A envia seu Espaço arquivado ou só leitura    | busca                                        | 200 personalizado                                               |
| preferência de A aponta para Espaço arquivado | `GET workspaces`                             | ativo resolvido pela ordem definida; nada é gravado             |
| Espaço ativo de A é excluído                  | `GET workspaces`                             | preferência vira `NULL` e a resolução se aplica, sem erro       |
| A grava a mesma etapa em duas abas            | `PUT profile` com `baseRevision` obsoleto    | 409 `PROFILE_VERSION_CONFLICT`; nada alterado                   |
| A grava etapas diferentes em duas abas        | `PUT profile` com `baseRevision` atual       | 200 em ambas, respeitando a ordem; respostas mescladas          |
| job foi enfileirado e vínculo removido        | executar                                     | cancela/ignora sem ler dados do Espaço                          |
| A e B fazem requests concorrentes             | cache/React Query/API                        | chaves e predicados incluem `workspaceId`; zero mistura         |
| id válido com assinatura inativa              | salvar/alertar                               | 402 somente depois da associação; não revela Espaço de terceiro |

Os cenários de `viewer` e `editor` preservam a cobertura futura da matriz original, mas não autorizam esses papéis na Fase 1. Também são obrigatórios testes de exportação/exclusão LGPD, paginação limitada, transação de criação+owner, corrida no limite/slot e tentativas de mass assignment.

## Compatibilidade das rotas v1

As rotas atuais mantêm caminhos, payloads, respostas e gates. Após o backfill, adaptadores resolvem sempre o Espaço padrão `procurement`, não o Espaço ativo, e chamam o mesmo serviço das rotas novas:

- `/api/v1/me/company-profile` e `/api/v1/me/fit`;
- `/api/v1/me/saved-tenders*` e participação;
- `/api/v1/me/saved-searches*`;
- `/api/v1/me/notifications*`;
- `/api/v1/recommendations*` e seus eventos;
- busca com `includeMonitored`;
- exportação e exclusão de conta.

Não há escrita dupla: rota nova e adaptador v1 gravam apenas no modelo novo depois do corte. Nenhuma rota v1 foi alterada nesta consolidação, e a Fase 1 depende de autorização explícita.

## Backfill e concorrência

Cada usuário existente recebe exatamente um Espaço `procurement` e uma membership `owner`, com ids determinísticos ou mapeamento único e repetível. O backfill preserva integralmente perfil, versão e sinais; salvos, monitoramento, etapa, protocolo, próxima ação, checklist e histórico; buscas, soft delete, alertas, checkpoints e contadores; notificações e estado de leitura; afinidade legada, nunca elegibilidade; eventos, dismissals, perfil de interesse e recomendações materializadas.

Antes do lote, o operador registra contagens, checksums, órfãos e um marco por tabela. O lote é idempotente e auditável. No corte, somente as mutações afetadas entram em manutenção; busca e detalhes públicos continuam disponíveis; jobs afetados são drenados; as tabelas são bloqueadas no menor escopo; o delta após os marcos é aplicado; e integridade, isolamento e reversibilidade são conferidos antes de trocar a aplicação para o modelo novo.

Os parâmetros iniciais da janela (início às 03:30 de `America/Sao_Paulo`, teto de 15 minutos de mutações bloqueadas, ponto de não retorno em T+10 min) e os gatilhos de aborto foram aprovados em 13/10/2026 e estão no [roadmap](../plans/hub-adaptativo-roadmap-v2.md#janela-de-corte); os valores finais dependem do ensaio com volume real. Se o delta ou a validação excederem a janela aprovada, o corte é cancelado; escrita dupla não é introduzida como atalho.

O histórico de perguntas de IA (`ai_ask_requests`) não entra no backfill: é log pessoal do usuário, sem `workspace_id`.

Criação concorrente serializa a alocação do slot e revalida o entitlement dentro da transação. O mesmo usuário não pode receber dois Espaços padrão, duas memberships `owner` para o mesmo Espaço nem slots conflitantes por retry.

## LGPD

A exportação inclui Espaços, memberships `owner`, perfis, sinais e todos os artefatos pertencentes ao usuário, com seus `workspace_id`. O histórico de perguntas de IA continua exportado e excluído pela conta, com a retenção atual de 90 dias; excluir um Espaço não toca nesse log. A exclusão de conta remove Espaços de proprietário único e seus dados por cascata ou procedimento transacional validado. A regra será revista antes da Fase 6, porque um Espaço compartilhado não poderá ser apagado apenas pela saída de um membro.

## Critérios de aceite da Fase 1

1. nenhum registro existente perdido, órfão, duplicado ou ligado ao Espaço errado;
2. cada usuário preexistente tem exatamente um Espaço padrão e uma membership `owner`;
3. usuário A não descobre, lê nem altera Espaço ou artefato de B;
4. rotas v1 mantêm payloads, respostas, gates e semântica no Espaço padrão;
5. criação concorrente respeita o limite, não duplica slot e cria `owner` atomicamente;
6. downgrade preserva tudo, deixa gravável o menor slot não arquivado e torna os excedentes somente leitura;
7. Espaço somente leitura continua listável, selecionável, consultável e exportável;
8. a UI avisa antes da expiração qual Espaço continuará editável;
9. gravações ocorridas durante o lote aparecem no delta antes do corte;
10. exportação e exclusão LGPD cobrem as novas tabelas;
11. rollback de aplicação e restauração de banco são ensaiados como procedimentos distintos;
12. checkout e webhooks do Asaas são validados ponta a ponta sem alterar os gates atuais;
13. duração máxima e critério de aborto do corte são confirmados após ensaio com volume real, a partir dos parâmetros iniciais aprovados;
14. nenhuma flag de jornada é ativada e nenhuma migração é executada sem gate explícito;
15. preferência de Espaço ativo inválida é resolvida de forma determinística, sem gravação em leitura;
16. busca com `workspaceId` inexistente ou alheio devolve o mesmo corpo, sem personalização e sem cache;
17. gravação simultânea da mesma etapa do perfil responde conflito em vez de sobrescrever em silêncio.

## Pendências

As quatro pendências registradas na consolidação (fallback do Espaço ativo, estados de onboarding, busca com `workspaceId` inválido e concorrência otimista de perfil) foram decididas pelo dono em 13/10/2026 e estão incorporadas às seções acima. Continuam em aberto:

- **Valores finais da janela de corte:** duração máxima e ponto de não retorno são confirmados depois do ensaio com volume real; até lá valem os parâmetros iniciais do roadmap.
- **Forma física de `revision` e da última seleção por Espaço:** descritas aqui como contrato; colunas e índices são definidos no SQL da W1, ainda não autorizado.
- **Transferência e exclusão de Espaço com mais de um membro:** escopo da Fase 6.
