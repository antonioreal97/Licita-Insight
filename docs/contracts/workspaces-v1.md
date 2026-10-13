# API de Espaços v1 — rascunho

Status: somente contrato; nenhuma rota, tabela ou migração implementada
Plano de referência: [hub adaptativo](../plans/hub-adaptativo-2026-10-12.md)

Todas as rotas usam a sessão atual no cookie HttpOnly `licita_session`. Nenhuma aceita token de sessão ou perfil em `localStorage`. Escritas mantêm a proteção CSRF atual (`X-Requested-With`) e são `Cache-Control: no-store`.

## Tipos comuns

```ts
type WorkspaceType =
  "procurement" | "funding" | "study" | "research" | "culture";
type WorkspaceRole = "owner" | "editor" | "viewer";
type OnboardingStatus = "not_started" | "in_progress" | "complete";

type WorkspaceSummary = {
  id: string;
  type: WorkspaceType;
  name: string;
  role: WorkspaceRole;
  onboardingStatus: OnboardingStatus;
  profileCompleteness: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

IDs são opacos. O servidor calcula papel, completude e status; o cliente não os grava diretamente.

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

Lista somente espaços em que o usuário é membro. Arquivados podem ser incluídos por `?archived=true`; padrão `false`. O limite é 1 para conta gratuita e 5 durante teste ou assinatura ativa.

### `POST /api/v1/me/workspaces`

```json
{ "type": "procurement", "name": "Licitações da empresa" }
```

Resposta `201`: `WorkspaceSummary`. O servidor cria o vínculo `owner` na mesma transação. Um espaço representa um objetivo; “Explorar tudo” não cria espaço e consulta o catálogo universal. `study` deve responder `FEATURE_DISABLED` enquanto não houver flag e fonte oficial homologada. Limite excedido responde `WORKSPACE_LIMIT_REACHED`.

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

Aplica `requireWorkspaceMember` antes de carregar perfil ou derivados.

### `PATCH /api/v1/me/workspaces/{id}`

Aceita subconjunto de:

```json
{ "name": "Novo nome", "archived": false }
```

`viewer` não altera. `editor` pode renomear se o produto aprovar; arquivar/desarquivar requer `owner`. Arquivar o espaço ativo deve escolher outro acessível ou deixar `activeWorkspaceId = null` na mesma transação.

### `PUT /api/v1/me/workspaces/{id}/profile`

Salva uma etapa validada:

```json
{
  "schemaVersion": 1,
  "step": "objective",
  "answers": { "selectedKeywords": ["manutenção predial"] }
}
```

O tipo vem do espaço, não do cliente. Resposta `200` devolve documento mesclado, completude calculada e `profileVersion`. `owner` e `editor` escrevem; `viewer` somente lê. Campo de outra etapa, tipo inválido ou versão desconhecida responde `INVALID_PARAMETER` com detalhes, sem atualização parcial.

### `PUT /api/v1/me/active-workspace`

```json
{ "workspaceId": "ws_opaco" }
```

Resposta `200`: `{ "activeWorkspaceId": "ws_opaco" }`. Aplica associação antes de gravar preferência. Espaço arquivado responde `WORKSPACE_ARCHIVED`.

## Artefatos por espaço

Todas aplicam `requireWorkspaceMember(id)`. A forma detalhada será fechada na fase responsável; estes são os envelopes mínimos.

| Rota                                             | Métodos e resposta mínima                                         | Gate adicional                                         |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------ |
| `/api/v1/me/workspaces/{id}/saved-opportunities` | `GET` paginado; `PUT /{opportunityId}`; `DELETE /{opportunityId}` | assinatura ativa para mutações e uso do recurso        |
| `/api/v1/me/workspaces/{id}/saved-searches`      | `GET`, `POST`, `PATCH /{searchId}`, `DELETE /{searchId}`          | assinatura ativa; busca salva deve pertencer ao espaço |
| `/api/v1/me/workspaces/{id}/recommendations`     | `GET` paginado                                                    | personalização/assinatura conforme política vigente    |
| `/api/v1/me/workspaces/{id}/notifications`       | `GET`, `PATCH /read`                                              | assinatura ativa; ids filtrados por espaço e usuário   |
| `/api/v1/me/workspaces/{id}/dashboard`           | `GET` com widgets tipados e métricas simples                      | leitura do membro; não faz N consultas pelo frontend   |

Busca e detalhe universais continuam públicos. `workspaceId` em busca é opcional e somente personaliza depois de validar sessão + associação; id inválido ou de terceiro não deve revelar existência.

## Expiração de teste ou assinatura com mais de um espaço

Decisão aprovada: nenhum espaço excedente é excluído, arquivado ou mesclado automaticamente. Todos permanecem exportáveis e voltam integralmente quando o acesso é reativado.

Regra de acesso ainda **a definir pelo produto**: recomenda-se manter leitura dos cinco espaços, permitir escolher um espaço “ativo gratuito” para ações que não sejam premium e bloquear novas criações/mutações premium nos demais com `SUBSCRIPTION_REQUIRED`. Não implementar essa recomendação sem validação específica. Em qualquer alternativa, a busca e o detalhe universais continuam públicos e o downgrade nunca apaga perfil, salvos, alertas ou histórico.

## `requireWorkspaceMember`

Ordem obrigatória:

1. exigir sessão válida;
2. validar sintaxe do id sem consultar artefatos;
3. buscar `workspace_members` por `(workspace_id, user_id)` e espaço não excluído;
4. se ausente, responder o mesmo `404 WORKSPACE_NOT_FOUND` usado para id inexistente;
5. anexar ao contexto somente `{workspaceId,type,role,ownerUserId,archivedAt}`;
6. aplicar requisito de papel e estado antes de qualquer leitura ou mutação subordinada;
7. toda consulta posterior inclui `workspace_id` no predicado, mesmo após o middleware;
8. jobs recebem `workspaceId` + versão e revalidam a associação/estado no início da execução.

Não aceitar `owner_user_id` enviado pelo cliente nem autorizar apenas porque `workspaces.owner_user_id = user.id`; a associação vem de `workspace_members` desde o início.

## Erros

Mantém o envelope v1 atual `{ error: { code, message, requestId, details? } }`.

| HTTP | Código                     | Quando                                                                                      |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------- |
| 400  | `INVALID_PARAMETER`        | payload, etapa, versão ou paginação inválidos                                               |
| 401  | `UNAUTHENTICATED`          | sessão ausente/expirada                                                                     |
| 402  | `SUBSCRIPTION_REQUIRED`    | ação premium sem acesso                                                                     |
| 403  | `WORKSPACE_ROLE_REQUIRED`  | membro conhecido sem papel suficiente; usar somente após a associação ter sido estabelecida |
| 404  | `WORKSPACE_NOT_FOUND`      | inexistente ou não membro, sem distinção                                                    |
| 409  | `WORKSPACE_ARCHIVED`       | escrita em espaço arquivado                                                                 |
| 409  | `WORKSPACE_LIMIT_REACHED`  | limite da conta atingido                                                                    |
| 409  | `PROFILE_VERSION_CONFLICT` | atualização baseada em versão obsoleta, se controle otimista for adotado                    |
| 422  | `FEATURE_DISABLED`         | jornada ainda não habilitada                                                                |

## Matriz mínima de isolamento

| Cenário                                     | Ação                                         | Esperado                                                                       |
| ------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| A acessa espaço de A                        | listar/detalhar                              | 200                                                                            |
| A usa id inexistente                        | detalhar                                     | 404                                                                            |
| A usa espaço de B                           | detalhar                                     | mesmo 404, corpo e timing de classe equivalentes                               |
| A altera perfil de B                        | `PUT profile`                                | 404; nenhuma linha alterada                                                    |
| A seleciona espaço de B                     | `PUT active-workspace`                       | 404; preferência anterior preservada                                           |
| A lista salvos de B                         | `GET saved-opportunities`                    | 404; nenhum id ou contagem vazada                                              |
| A usa `searchId` de B dentro do espaço de A | alterar/excluir                              | 404                                                                            |
| viewer tenta escrever                       | qualquer mutação                             | 403 após associação; nada alterado                                             |
| editor arquiva                              | `PATCH`                                      | 403                                                                            |
| owner arquiva                               | `PATCH`                                      | 200; ativo reconciliado                                                        |
| membro usa espaço arquivado                 | leitura permitida conforme endpoint; escrita | 409 na escrita                                                                 |
| request público envia `workspaceId` de B    | busca                                        | ignora personalização ou 401 conforme contrato final; nunca aplica sinais de B |
| job foi enfileirado e vínculo removido      | executar                                     | cancela/ignora sem ler dados do espaço                                         |
| A e B fazem requests concorrentes           | cache/React Query/API                        | chaves e predicados incluem `workspaceId`; zero mistura                        |
| id válido com assinatura inativa            | salvar/alertar                               | 402 somente depois da associação; não revela espaço de terceiro                |

Também são obrigatórios testes de exportação/exclusão LGPD, paginação limitada, transação de criação+owner e tentativas de mass assignment.

## Compatibilidade v1 aprovada para a Fase 1

Conforme a [revisão aprovada](../plans/hub-adaptativo-revisao.md), as rotas atuais virarão adaptadores para o espaço `procurement` padrão após backfill único, sem escrita dupla. Nenhuma rota v1 foi alterada nesta fase, e a Fase 1 depende de nova autorização explícita.
