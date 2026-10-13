# Plano técnico — Pardal Digital como hub adaptativo de oportunidades

Data: 12 out. 2026  
Status: proposta para decisão e execução incremental

## 1. Objetivo

Evoluir o Pardal Digital de uma experiência centrada em licitações para uma plataforma com cinco jornadas:

1. licitações públicas;
2. editais e fomento;
3. oportunidades acadêmicas internacionais;
4. financiamento de pesquisa;
5. editais e incentivos culturais.

A mesma conta poderá manter vários **Espaços**. Cada espaço terá perfil, vocabulário, filtros, salvos, buscas, alertas, recomendações e indicadores próprios. A infraestrutura, autenticação, assinatura, ingestão, busca, design system e componentes continuarão compartilhados.

Este plano preserva as decisões já adotadas no produto:

- monorepo TypeScript com React/Vite, Express, Drizzle e PostgreSQL;
- sessão no cookie HttpOnly `licita_session`, sem token em `localStorage`;
- API na mesma origem do frontend;
- busca e detalhes públicos; assinatura exigida para salvar, monitorar, criar alertas e receber notificações;
- processos pesados executados pelo worker e pela fila durável existente;
- fontes oficiais, atribuição e rastreabilidade de dados.

## 2. Diagnóstico do estado atual

O sistema já contém boa parte da fundação necessária:

- licitações normalizadas em `tenders` e busca própria;
- cultura, fomento, inovação e parcerias em `cultural_opportunities`;
- coletores do PNCP, Mapas Culturais, Transferegov.br, MinC, Funarte, CNPq e CAPES, com controles operacionais por fonte;
- perfil empresarial, aderência, recomendações, buscas e editais salvos;
- notificações no app e por e-mail;
- Google OAuth, LGPD, Asaas e controle de acesso;
- fila durável de IA e separação entre API e worker;
- frontend organizado por funcionalidades e design system próprio.

As principais limitações para a nova visão são estruturais, não visuais:

1. preferências e artefatos pessoais pertencem diretamente ao usuário, e não a um espaço;
2. salvos, buscas, participação, aderência e recomendações são orientados a `tender`;
3. licitações e demais oportunidades possuem contratos de busca separados;
4. o perfil atual representa apenas uma empresa interessada em licitações;
5. dashboard, navegação e vocabulário são estáticos;
6. oportunidades acadêmicas e parte das chamadas de pesquisa ainda não possuem catálogo e fontes validadas.

## 3. Decisões arquiteturais

### 3.1. Espaço é a unidade de personalização

Não adicionar um único campo `profileType` em `users`. Isso impediria múltiplas jornadas e dificultaria equipes no futuro.

Criar as entidades:

| Entidade | Responsabilidade |
| --- | --- |
| `workspaces` | nome, tipo, proprietário, estado do onboarding e configurações básicas |
| `workspace_members` | vínculo do usuário e papel `owner`, `editor` ou `viewer` |
| `workspace_profiles` | respostas do onboarding, versão do esquema e completude |
| `workspace_profile_signals` | termos, áreas, geografias, idiomas e demais sinais normalizados para busca e recomendação |
| `user_workspace_preferences` | espaço ativo e preferências pessoais por usuário |

Tipos iniciais de espaço:

```ts
type WorkspaceType =
  | "procurement"
  | "funding"
  | "study"
  | "research"
  | "culture";
```

`workspace_profiles.answers` pode ser `jsonb`, validado por um schema Zod versionado para cada tipo. Os atributos usados em filtro, elegibilidade ou ranking devem também ser materializados em colunas/tabelas normalizadas; não devem depender de varredura livre do JSON.

O papel `workspace_members` entra desde o início, embora o compartilhamento com outras pessoas fique desativado no MVP. Isso evita uma migração de propriedade mais cara quando equipes forem lançadas.

### 3.2. Catálogo unificado como projeção, não como fonte única de gravação

Não substituir imediatamente `tenders` e `cultural_opportunities` por uma tabela genérica. As fontes têm semânticas de atualização, documentos, status e identificadores muito diferentes.

Manter tabelas especializadas como fonte de verdade e criar uma projeção comum, `opportunity_catalog`, alimentada pelos coletores ou por jobs idempotentes:

```ts
type OpportunityDomain =
  | "procurement"
  | "funding"
  | "study"
  | "research"
  | "culture";

type OpportunityCatalogRecord = {
  id: string;                 // id global estável
  domain: OpportunityDomain;
  sourceEntity: string;       // tenders, cultural_opportunities etc.
  sourceEntityId: string;
  source: string;
  externalId: string;
  title: string;
  summary: string | null;
  issuerName: string;
  status: "open" | "upcoming" | "closed" | "undated";
  publishedAt: Date | null;
  applicationDeadline: Date | null;
  amountMin: number | null;
  amountMax: number | null;
  currency: string | null;
  countries: string[];
  states: string[];
  areas: string[];
  audience: string[];
  sourceUrl: string | null;
  searchText: string;
  attributes: Record<string, unknown>; // somente atributos de exibição especializados
  fingerprint: string;
  updatedAt: Date;
};
```

Regras:

- `id` global no formato opaco e estável; o cliente não deve depender da composição;
- unicidade por origem e identificador externo;
- `sourceEntity` + `sourceEntityId` permitem buscar o detalhe completo especializado;
- `attributes` não substitui campos que participam de filtros ou regras;
- toda oportunidade exibe fonte, URL oficial, data da última leitura e proveniência;
- atualizações da fonte invalidam projeções de recomendação e elegibilidade pela `fingerprint`;
- falha na projeção não apaga o registro anterior: ele recebe estado operacional e é reprocessado.

Essa projeção fornece uma única superfície para pesquisa, dashboard, salvos e recomendações, sem destruir os contratos especializados existentes.

### 3.3. Afinidade e elegibilidade são resultados independentes

Criar dois conceitos separados:

```ts
type AffinityResult = {
  score: number; // 0–1
  level: "high" | "medium" | "low";
  reasons: Evidence[];
  profileVersion: number;
};

type EligibilityResult = {
  status: "eligible" | "ineligible" | "needs_review" | "unknown";
  criteria: Array<{
    key: string;
    result: "met" | "not_met" | "unknown";
    explanation: string;
    evidence: Evidence[];
  }>;
  rulesetVersion: number;
};
```

- Afinidade responde “isso combina com os seus objetivos?”.
- Elegibilidade responde “os requisitos obrigatórios conhecidos são atendidos?”.
- Dado ausente nunca vira aprovação automática; vira `unknown` ou `needs_review`.
- Regras determinísticas e evidências da fonte vêm antes de IA.
- IA pode auxiliar extração e classificação, mas não deve emitir uma confirmação de elegibilidade sem regra auditável.
- Todo resultado deve registrar versão do perfil, versão da oportunidade e versão das regras.

### 3.4. Experiência adaptativa orientada a configuração

Não criar cinco frontends nem cinco árvores de componentes. Criar um registro por tipo de espaço:

```ts
type WorkspaceExperienceDefinition = {
  type: WorkspaceType;
  vocabulary: {
    opportunity: string;
    saved: string;
    application: string;
    deadline: string;
  };
  navigation: NavigationItem[];
  dashboard: DashboardWidgetDefinition[];
  searchFilters: FilterDefinition[];
  onboarding: OnboardingStepDefinition[];
  quickActions: QuickActionDefinition[];
};
```

O `AppShell`, o dashboard, a busca e os cards consultam essa definição. Diferenças funcionais ficam em módulos especializados; diferenças apenas textuais ou de composição ficam na configuração. O `BrandLogo`, temas Creme/Petróleo e os tokens de `docs/design-system.md` permanecem compartilhados.

## 4. Modelo de dados proposto

### 4.1. Novas tabelas principais

| Tabela | Campos essenciais |
| --- | --- |
| `workspaces` | `id`, `type`, `name`, `owner_user_id`, `onboarding_status`, `created_at`, `updated_at`, `archived_at` |
| `workspace_members` | `workspace_id`, `user_id`, `role`, `created_at` |
| `workspace_profiles` | `workspace_id`, `schema_version`, `profile_version`, `answers`, `completeness`, `updated_at` |
| `workspace_profile_signals` | `workspace_id`, `kind`, `value`, `weight`, `source` |
| `user_workspace_preferences` | `user_id`, `active_workspace_id` |
| `opportunity_catalog` | projeção comum descrita acima |
| `workspace_saved_opportunities` | `workspace_id`, `opportunity_id`, monitoramento, etapa, checklist e próxima ação |
| `workspace_saved_searches` | `workspace_id`, `domain`, `query_json`, alertas e checkpoint |
| `workspace_opportunity_affinity` | cache versionado de afinidade |
| `workspace_opportunity_eligibility` | cache versionado de elegibilidade |
| `workspace_recommendations` | top oportunidades, score, razões, geração e expiração |

Adicionar `workspace_id` às notificações e entregas geradas por um espaço. Preferências de conta, autenticação, assinatura e consentimento continuam pertencendo ao usuário.

### 4.2. Migração dos dados existentes

A migração deve ser aditiva e reversível:

1. criar as tabelas de espaço sem alterar rotas atuais;
2. criar, para cada usuário existente, um espaço padrão `procurement`;
3. converter `company_profiles` no perfil desse espaço, preservando versão e sinais;
4. associar salvos, buscas, recomendações, aderências e alertas existentes ao espaço padrão;
5. fazer API nova e antiga lerem o mesmo serviço de domínio;
6. ativar escrita dupla temporária somente onde uma compatibilidade de rota exigir;
7. medir divergências e, após uma janela estável, tornar `workspace_id` obrigatório;
8. manter as rotas v1 como adaptadores enquanto o frontend migra; removê-las apenas em uma versão incompatível futura.

Não apagar ou renomear tabelas existentes na primeira entrega.

## 5. Contratos de API

### 5.1. Espaços e onboarding

| Método | Rota | Uso |
| --- | --- | --- |
| `GET` | `/api/v1/me/workspaces` | listar espaços acessíveis e o ativo |
| `POST` | `/api/v1/me/workspaces` | criar espaço a partir de um objetivo |
| `GET` | `/api/v1/me/workspaces/{id}` | resumo e progresso do onboarding |
| `PATCH` | `/api/v1/me/workspaces/{id}` | nome, arquivamento e preferências |
| `PUT` | `/api/v1/me/workspaces/{id}/profile` | salvar uma etapa validada do perfil |
| `PUT` | `/api/v1/me/active-workspace` | selecionar o espaço ativo |

Toda rota com `{id}` deve aplicar `requireWorkspaceMember` e testar isolamento entre usuários. O onboarding aceita salvamento parcial, `schemaVersion` e `step`; a API calcula completude e a próxima pergunta.

### 5.2. Busca universal

Criar `/api/v2/opportunities/search`, preservando `/api/v1/tenders/search` e `/api/v1/opportunities`:

- parâmetros comuns: `q`, `domain[]`, `status[]`, localização, prazo, valor, área, fonte, ordenação e paginação;
- `workspaceId` opcional para aplicar preferências autenticadas; nunca confiar apenas no id enviado;
- `facets.common` para filtros compartilhados;
- `facets.byDomain` para modalidade, nível acadêmico, cobertura de bolsa, tipo de financiamento, linguagem artística etc.;
- `meta.appliedWorkspace`, `meta.searchMode`, `meta.indexUpdatedAt` e degradações;
- detalhe em `/api/v2/opportunities/{id}` com bloco comum e extensão tipada por domínio.

O modo “Explorar tudo” omite `domain`; dentro de um espaço, o frontend envia o domínio padrão. Busca e detalhe permanecem públicos. Personalização, salvos, alertas e histórico exigem sessão e, quando aplicável, acesso ativo.

### 5.3. Artefatos por espaço

Novas rotas devem endereçar o espaço explicitamente:

- `/api/v1/me/workspaces/{id}/saved-opportunities`;
- `/api/v1/me/workspaces/{id}/saved-searches`;
- `/api/v1/me/workspaces/{id}/recommendations`;
- `/api/v1/me/workspaces/{id}/notifications`;
- `/api/v1/me/workspaces/{id}/dashboard`.

O endpoint de dashboard devolve uma composição pronta para a jornada, mas baseada em tipos estáveis de widget. O frontend não deve fazer várias consultas apenas para calcular números simples.

## 6. Ingestão e qualidade das fontes

Cada nova fonte passa por uma etapa de homologação antes de entrar no catálogo:

1. acesso permitido por termos, licença e `robots.txt`;
2. API ou página oficial preferida a agregadores;
3. identificador externo e URL canônica estáveis;
4. regras de paginação, atualização e encerramento conhecidas;
5. deduplicação dentro da fonte e entre fontes;
6. datas, fuso horário, moeda e localização normalizados;
7. atribuição e trechos armazenados dentro da licença;
8. limites de taxa, retentativa e circuito de falha definidos;
9. métricas de atualidade e cobertura;
10. amostra revisada manualmente antes da publicação.

Ordem sugerida de expansão:

1. consolidar cultura e fomento já existentes na projeção unificada;
2. classificar as chamadas CNPq/CAPES atuais entre `funding` e `research`;
3. pilotar uma ou duas fontes acadêmicas internacionais com contrato e qualidade comprovados;
4. adicionar novas fontes somente após medir duplicação, atualização e utilidade.

Não lançar a jornada “Estudar no exterior” apenas com cards estáticos ou dados simulados. Ela deve ficar oculta por feature flag até possuir cobertura mínima real.

## 7. Frontend

Estrutura proposta em `artifacts/licitainsight/src/features`:

```text
workspaces/
  components/workspace-switcher.tsx
  hooks/use-active-workspace.ts
  experience-registry.ts
onboarding/
  onboarding-page.tsx
  schemas/
universal-search/
  universal-search-page.tsx
  filter-registry.ts
adaptive-dashboard/
  adaptive-dashboard-page.tsx
  widget-registry.tsx
eligibility/
  compatibility-panel.tsx
```

Rotas sugeridas:

- `/onboarding` — escolha de objetivos e perguntas progressivas;
- `/w/{workspaceId}` — dashboard do espaço;
- `/w/{workspaceId}/explorar` — busca contextual;
- `/w/{workspaceId}/salvos` — carteira do espaço;
- `/w/{workspaceId}/alertas` — buscas e monitoramento;
- `/explorar` — catálogo completo entre jornadas.

O seletor de espaço fica no topo da barra lateral. A troca invalida apenas queries com chave do espaço e preserva dados de conta e sessão. As chaves do React Query passam a incluir `workspaceId` para impedir vazamento visual entre espaços.

O onboarding deve:

- permitir vários objetivos e criar um espaço para cada objetivo confirmado;
- pedir no máximo três ou quatro respostas por etapa;
- salvar cada etapa no servidor;
- permitir pular campos não obrigatórios;
- levar à primeira busca relevante antes de exigir o perfil completo;
- mostrar por que cada dado melhora filtros, afinidade ou elegibilidade;
- não persistir perfil sensível em `localStorage`.

## 8. Segurança, privacidade e cobrança

- manter `licita_session` HttpOnly e a proteção CSRF atual;
- verificar associação ao espaço em toda consulta e mutação, incluindo jobs assíncronos;
- incluir espaços, perfis, salvos, buscas, afinidade e elegibilidade na exportação e exclusão LGPD;
- registrar eventos de auditoria para convite, mudança de papel e exclusão quando equipes forem ativadas;
- evitar dados pessoais, respostas do perfil e termos privados em logs;
- manter a assinatura no usuário no MVP; equipes e cobrança por assento são uma fase posterior;
- tornar busca e detalhe públicos em todos os domínios; aplicar o gate pago apenas às ações premium definidas;
- separar consentimento de personalização comportamental das preferências declaradas no perfil, preservando o opt-in já existente.

## 9. Observabilidade e metas

Métricas técnicas:

- atraso entre fonte e `opportunity_catalog`;
- registros lidos, criados, atualizados, encerrados e rejeitados por fonte;
- p50/p95/p99 da busca por domínio e do modo “Explorar tudo”;
- profundidade e idade da fila de projeção/recomendação;
- divergências durante leitura/escrita compatível da migração;
- custo de IA por espaço, domínio e função;
- taxa de elegibilidade `unknown` e falhas de extração.

Métricas de produto:

- início e conclusão do onboarding por tipo de espaço;
- tempo até a primeira oportunidade aberta;
- primeira busca, primeiro salvo e primeiro alerta;
- CTR e taxa de descarte das recomendações;
- uso de múltiplos espaços;
- conversão para assinatura após ação premium.

Metas iniciais:

- busca p95 menor que 300 ms no volume de referência;
- troca de espaço com conteúdo útil em até 1 s após dados em cache;
- projeção de oportunidade disponível em até 15 min após ingestão normal;
- zero acesso cruzado entre espaços em testes de autorização;
- nenhuma recomendação de “elegível” quando existir critério obrigatório desconhecido.

## 10. Testes obrigatórios

1. testes de contrato Zod para cada perfil, domínio e versão de API;
2. testes de migração e backfill com usuário sem perfil, com perfil e com muitos salvos;
3. testes de isolamento: usuário A nunca lê ou altera espaço de B;
4. testes de idempotência e reconciliação do catálogo;
5. testes de deduplicação entre fontes;
6. testes de busca/facetas comuns e especializadas;
7. testes de afinidade separados dos de elegibilidade;
8. testes de LGPD para exportação e exclusão completas;
9. testes de acessibilidade e navegação por teclado no onboarding e seletor;
10. teste de carga com mistura realista de domínios e filtros.

## 11. Roadmap executável

### Fase 0 — contrato e instrumentação (1 sprint)

- fechar schemas dos cinco perfis e vocabulário de cada jornada;
- definir `OpportunitySummary` comum e extensões especializadas;
- documentar critérios de homologação de fontes;
- instrumentar funil atual para criar baseline;
- criar feature flags por jornada.

**Saída:** contratos aprovados, sem mudança visível para usuários.

### Fase 1 — Espaços e onboarding com dados existentes (2 sprints)

- criar tabelas, autorização e APIs de Espaços;
- backfill de um espaço de licitações por usuário;
- migrar o perfil empresarial para o novo domínio;
- implementar seletor e onboarding progressivo;
- oferecer inicialmente `procurement`, `funding` e `culture`, porque já possuem dados reais;
- manter as telas atuais funcionando por adaptadores.

**Saída:** uma conta pode manter múltiplos espaços, sem regressão dos recursos atuais.

### Fase 2 — catálogo e busca universal (2–3 sprints)

- criar `opportunity_catalog` e jobs de projeção;
- projetar `tenders` e `cultural_opportunities`;
- publicar API v2, facetas e detalhe universal;
- criar `/explorar` e busca adaptativa;
- manter rotas antigas e comparar resultados automaticamente.

**Saída:** busca única para licitações, fomento e cultura.

### Fase 3 — salvos, alertas e dashboard adaptativos (2 sprints)

- generalizar salvos, buscas e notificações para `opportunity_id` + `workspace_id`;
- migrar participação de licitações sem perder checklist e histórico;
- implementar widgets e navegação por tipo de espaço;
- revisar gates de assinatura e e-mails.

**Saída:** cada espaço possui carteira, indicadores e alertas próprios.

### Fase 4 — afinidade e elegibilidade (2–3 sprints)

- generalizar o motor de recomendações existente;
- implementar afinidade determinística para os três domínios ativos;
- criar rulesets e interface de elegibilidade com evidências;
- só adicionar extração por IA depois de benchmarks de precisão e custo;
- calibrar limiares por domínio, sem um score global arbitrário.

**Saída:** recomendações explicáveis e distinção visível entre interesse e requisito obrigatório.

### Fase 5 — estudo e pesquisa (incremental por fonte)

- homologar fontes e modelar extensões acadêmicas/de pesquisa;
- ativar `research` primeiro se as fontes CNPq/CAPES já oferecerem cobertura suficiente;
- ativar `study` somente após fonte internacional real, atualizada e auditável;
- liberar cada jornada por feature flag e coorte.

**Saída:** cinco jornadas sustentadas por dados reais.

### Fase 6 — equipes e organizações (P2)

- convites, papéis, auditoria e transferência de propriedade;
- preferências individuais dentro de espaço compartilhado;
- avaliar cobrança por organização/assento sem alterar a assinatura atual antes da validação comercial.

## 12. Ordem de prioridade

| Prioridade | Entrega |
| --- | --- |
| P0 | modelo de Espaços, migração compatível, autorização e onboarding |
| P0 | projeção comum e busca universal para domínios já existentes |
| P0 | salvos, buscas, alertas e dashboard por espaço |
| P1 | afinidade explicável e elegibilidade auditável |
| P1 | novas fontes de pesquisa e estudo com homologação |
| P2 | colaboração, papéis avançados e cobrança por equipe |

## 13. Decisões que precisam de validação do produto

Antes da implementação, fechar apenas estas decisões:

1. criar um espaço por objetivo selecionado ou permitir um espaço híbrido; recomendação: um espaço por objetivo, com “Explorar tudo” fora deles;
2. limites de espaços por conta gratuita, teste e assinatura;
3. quais dados de perfil são obrigatórios para entregar a primeira recomendação útil;
4. se a etapa de pesquisa será inicialmente parte de Fomento ou uma jornada separada;
5. cobertura mínima e SLA necessários para tornar Estudo visível;
6. quais ações continuam públicas e quais são premium em cada domínio.

## 14. Critério de conclusão do programa

A transformação estará completa quando:

- um usuário puder criar e alternar espaços sem misturar dados;
- cada espaço alterar navegação, vocabulário, filtros e dashboard por configuração;
- uma busca puder consultar vários domínios por um contrato comum;
- cada oportunidade mantiver detalhe e proveniência específicos da fonte;
- salvos, alertas, recomendações e histórico pertencerem ao espaço correto;
- afinidade e elegibilidade forem mostradas separadamente e com evidências;
- as cinco jornadas forem alimentadas por fontes reais, monitoradas e homologadas;
- rotas antigas continuarem estáveis durante a migração e puderem ser desativadas com métricas de uso, não por uma troca abrupta.
