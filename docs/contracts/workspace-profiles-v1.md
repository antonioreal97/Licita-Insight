# Perfis e experiências de Espaços v1 — rascunho

Status: rascunho da Fase 0; sem persistência ou rota ativa  
Plano de referência: [hub adaptativo](../plans/hub-adaptativo-2026-10-12.md)

O contrato executável está em `@workspace/api-zod/hub`, nos módulos `workspace-profiles.ts` e `experience-registry.ts`. Ele não é gerado pelo OpenAPI e não é importado pela aplicação em produção nesta fase.

## Envelope versionado

```ts
type WorkspaceProfile = {
  schemaVersion: 1;
  type: "procurement" | "funding" | "study" | "research" | "culture";
  answers: Partial<AnswersForType>;
};
```

`answers` aceita documentos incompletos. A versão é validada tanto no documento quanto em cada salvamento de etapa. Uma versão desconhecida é rejeitada; atualização futura exige migrador explícito.

## Salvamento parcial por etapa

```ts
type WorkspaceProfileStepSave = {
  schemaVersion: 1;
  type: WorkspaceType;
  step: "objective" | "region" | "qualification";
  answers: Record<string, unknown>;
};
```

Cada etapa possui uma lista fechada de campos. `parseWorkspaceProfileStep` rejeita campo de outra etapa; `mergeWorkspaceProfileStep` preserva as respostas anteriores e impede troca de tipo. O servidor da Fase 1 deverá validar o resultado completo antes de persistir e nunca confiar em completude enviada pelo cliente.

## Campos por perfil

| Perfil        | `objective`                                           | `region`   | `qualification`                                                                                                          |
| ------------- | ----------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `procurement` | `offerings`, `selectedKeywords`, `selectedCategories` | `coverage` | `description`, `exclusions`, `excludedKeywords`, `registeredPlatforms`, `valueRange`, `size`, `buyerTypes`, `modalities` |
| `funding`     | `keywords`, `thematicAreas`                           | `regions`  | `applicantTypes`, `fundingTypes`, `projectStages`, `valueRange`, `counterpartAvailable`, `languages`                     |
| `study`       | `keywords`, `fields`, `studyLevels`                   | `regions`  | `fundingNeeds`, `languages`, `startFrom`                                                                                 |
| `research`    | `keywords`, `researchAreas`, `careerStages`           | `regions`  | `fundingTypes`, `institutionTypes`, `collaborationModes`, `languages`                                                    |
| `culture`     | `keywords`, `culturalAreas`                           | `regions`  | `applicantTypes`, `opportunityTypes`, `programs`, `valueRange`, `languages`                                              |

`regions` distingue `national`, `international` e `custom`, com países ISO alfa-2, UFs e opção remota. `coverage` de `procurement` conserva exatamente a forma vigente: nacional ou customizada com macrorregiões, UFs, municípios e raio.

## Completude

`workspaceProfileCompleteness` implementa a decisão aprovada na [revisão](../plans/hub-adaptativo-revisao.md): perfil mínimo requer somente palavras-chave e região. Para `procurement`, `selectedKeywords` ou `offerings` satisfaz palavras-chave; `coverage` satisfaz região. A função retorna `percent` (0, 50 ou 100), `complete`, `missing` e `nextStep`.

Esse percentual representa somente o mínimo para a primeira busca útil, não riqueza do perfil nem elegibilidade.

## Sinais normalizados

O allow-list `WORKSPACE_PROFILE_SIGNAL_FIELDS` é a fonte de verdade. `workspaceProfileSignals` normaliza Unicode, espaços e caixa, elimina duplicatas e gera `{ kind, value, weight, sourceField }`. Peso negativo representa exclusão; o intervalo válido é −1 a 1.

| Perfil        | Campos materializados                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `procurement` | ofertas e palavras-chave; exclusões; categorias; UFs e códigos IBGE; plataformas; porte; valores mínimo/máximo |
| `funding`     | palavras-chave; áreas; países/UFs; tipos de proponente e fomento; idiomas; valores                             |
| `study`       | palavras-chave; áreas de estudo; países; níveis; idiomas                                                       |
| `research`    | palavras-chave; áreas; países/UFs; estágio de carreira; tipos de financiamento; idiomas                        |
| `culture`     | palavras-chave; áreas culturais; países/UFs; tipos de proponente e oportunidade; idiomas; valores              |

Campos descritivos livres, nomes, e-mails e dados de sessão não viram sinais. A Fase 1 deve substituir os sinais de um perfil em transação, registrar a versão que os gerou e limitar o vocabulário de `kind` ao schema.

## Compatibilidade com `company_profiles`

`ProcurementAnswersSchema` é superconjunto do `CompanyProfileInput` atual. `companyProfileToProcurementProfile` é o adaptador de backfill proposto, ainda sem escrita.

| `company_profiles` / API atual                         | `procurement.answers`                               | Transformação                                                    |
| ------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------- |
| `description`                                          | `description`                                       | cópia literal após validação 20–600 caracteres                   |
| `offerings`                                            | `offerings`                                         | cópia; também gera `keyword` peso 1                              |
| `exclusions`                                           | `exclusions`                                        | cópia; gera `excluded_keyword` peso −1                           |
| `selected_categories` / `selectedCategories`           | `selectedCategories`                                | cópia de slugs; gera `category`                                  |
| `selected_keywords` / `selectedKeywords`               | `selectedKeywords`                                  | cópia; gera `keyword` peso 1                                     |
| `excluded_keywords` / `excludedKeywords`               | `excludedKeywords`                                  | cópia; gera `excluded_keyword` peso −1                           |
| `registered_platforms` / `registeredPlatforms`         | `registeredPlatforms`                               | cópia; gera `platform`; continua fora do score de IA atual       |
| `coverage_scope = national` + modo/remoto              | `coverage = {scope: national, mode, acceptsRemote}` | cópia estrutural                                                 |
| escopo customizado, regiões, UFs e municípios          | `coverage.regions/states/municipalities`            | cópia; município mantém `{ibgeCode,name,state}` na API           |
| sede + raio                                            | `coverage.radius.center/km`                         | recompõe a referência municipal; ausência permanece `null`       |
| `value_min`, `value_max`                               | `valueRange.min/max`                                | decimal do banco vira número da API sem arredondamento adicional |
| `size`                                                 | `size`                                              | enum `me_epp`, `cooperative`, `other`                            |
| `version`, `created_at`, `updated_at`, `last_alert_at` | fora de `answers`                                   | pertencem ao registro/controle operacional, não às respostas     |

Campos novos (`buyerTypes`, `modalities`) começam ausentes. O adaptador não infere respostas que o usuário nunca forneceu.

## Experiência por jornada

`WorkspaceExperienceDefinition` contém vocabulário, navegação, widgets, filtros, onboarding e ações rápidas. `WORKSPACE_EXPERIENCES` registra os cinco tipos usando rótulos já presentes no produto: “Visão geral”, “Explorar editais”, “Chamadas culturais”, “Editais salvos”, “Monitoramento”, “Situação das inscrições”, “Fonte” e “Áreas culturais”. Os destinos são identificadores sem rotas concretas; nada está conectado ao `AppShell`. `research` possui schema e definição desde a Fase 0, mas a decisão aprovada é começar a experiência ativa como especialização/filtros de Fomento e só promovê-la a jornada separada conforme volume, qualidade e demanda.

## Privacidade e armazenamento

Perfis serão salvos somente no servidor. Nenhuma resposta ou token vai para `localStorage`; o cookie `licita_session` continua HttpOnly. Logs devem registrar tipo, versão e erro de validação, nunca o conteúdo das respostas.
