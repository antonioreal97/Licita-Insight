import type { WorkspaceType, WorkspaceProfileStep } from "./workspace-profiles";

export type NavigationItem = {
  id: string;
  label: string;
  destination: "dashboard" | "search" | "saved" | "alerts" | "settings";
};

export type DashboardWidgetDefinition = {
  id:
    | "recommended"
    | "closing_soon"
    | "recent"
    | "saved"
    | "alerts"
    | "profile_progress";
  label: string;
};

export type FilterDefinition = {
  id: string;
  label: string;
  kind: "text" | "single" | "multiple" | "date" | "money" | "location";
};

export type OnboardingStepDefinition = {
  id: WorkspaceProfileStep;
  label: string;
  description: string;
};

export type QuickActionDefinition = {
  id: "search" | "saved" | "alerts" | "profile";
  label: string;
  destination: "search" | "saved" | "alerts" | "settings";
};

export type WorkspaceExperienceDefinition = {
  type: WorkspaceType;
  vocabulary: {
    opportunity: string;
    opportunityPlural: string;
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

const commonDashboard: DashboardWidgetDefinition[] = [
  { id: "recommended", label: "Recomendados para você" },
  { id: "closing_soon", label: "Prazos próximos" },
  { id: "recent", label: "Publicados recentemente" },
  { id: "saved", label: "Salvos" },
  { id: "alerts", label: "Alertas" },
  { id: "profile_progress", label: "Complete seu perfil" },
];

const sharedNavigation = (search: string, saved: string): NavigationItem[] => [
  { id: "overview", label: "Visão geral", destination: "dashboard" },
  { id: "explore", label: search, destination: "search" },
  { id: "saved", label: saved, destination: "saved" },
  { id: "alerts", label: "Alertas", destination: "alerts" },
  { id: "settings", label: "Configurações", destination: "settings" },
];

const onboarding = (
  objective: string,
  region: string,
  qualification: string,
): OnboardingStepDefinition[] => [
  { id: "objective", label: "Objetivo", description: objective },
  { id: "region", label: "Região", description: region },
  { id: "qualification", label: "Preferências", description: qualification },
];

const quickActions = (
  search: string,
  saved: string,
): QuickActionDefinition[] => [
  { id: "search", label: search, destination: "search" },
  { id: "saved", label: saved, destination: "saved" },
  { id: "alerts", label: "Criar alerta", destination: "alerts" },
  { id: "profile", label: "Completar perfil", destination: "settings" },
];

export const WORKSPACE_EXPERIENCES: Record<
  WorkspaceType,
  WorkspaceExperienceDefinition
> = {
  procurement: {
    type: "procurement",
    vocabulary: {
      opportunity: "edital",
      opportunityPlural: "editais",
      saved: "Editais salvos",
      application: "participação",
      deadline: "Prazo da proposta",
    },
    navigation: sharedNavigation("Explorar editais", "Editais salvos"),
    dashboard: commonDashboard,
    searchFilters: [
      { id: "query", label: "Objeto, órgão ou localização", kind: "text" },
      { id: "status", label: "Situação", kind: "multiple" },
      { id: "modality", label: "Modalidade", kind: "multiple" },
      { id: "location", label: "Estado e município", kind: "location" },
      { id: "organization", label: "Órgão", kind: "multiple" },
      { id: "value", label: "Valor estimado", kind: "money" },
      { id: "deadline", label: "Prazo da proposta", kind: "date" },
      { id: "source", label: "Fonte", kind: "multiple" },
      { id: "platform", label: "Plataforma", kind: "multiple" },
    ],
    onboarding: onboarding(
      "O que a empresa fornece e quais editais procura.",
      "Onde a empresa atende presencialmente ou a distância.",
      "Porte, faixa de valor, plataformas e exclusões.",
    ),
    quickActions: quickActions("Explorar editais", "Ver editais salvos"),
  },
  funding: {
    type: "funding",
    vocabulary: {
      opportunity: "chamada de fomento",
      opportunityPlural: "chamadas de fomento",
      saved: "Chamadas salvas",
      application: "inscrição",
      deadline: "Prazo de inscrição",
    },
    navigation: sharedNavigation("Explorar chamadas", "Chamadas salvas"),
    dashboard: commonDashboard,
    searchFilters: [
      { id: "query", label: "Título, órgão ou resumo", kind: "text" },
      { id: "status", label: "Situação das inscrições", kind: "multiple" },
      { id: "kind", label: "Tipo de oportunidade", kind: "multiple" },
      { id: "area", label: "Área temática", kind: "multiple" },
      { id: "location", label: "Estado ou país", kind: "location" },
      { id: "applicant", label: "Quem pode participar", kind: "multiple" },
      { id: "value", label: "Valor de apoio", kind: "money" },
      { id: "source", label: "Fonte", kind: "multiple" },
    ],
    onboarding: onboarding(
      "Temas e resultados que você quer financiar.",
      "Onde o projeto será executado.",
      "Tipo de proponente, estágio do projeto e faixa de apoio.",
    ),
    quickActions: quickActions("Explorar chamadas", "Ver chamadas salvas"),
  },
  study: {
    type: "study",
    vocabulary: {
      opportunity: "oportunidade acadêmica",
      opportunityPlural: "oportunidades acadêmicas",
      saved: "Oportunidades salvas",
      application: "candidatura",
      deadline: "Prazo de candidatura",
    },
    navigation: sharedNavigation(
      "Explorar oportunidades",
      "Oportunidades salvas",
    ),
    dashboard: commonDashboard,
    searchFilters: [
      { id: "query", label: "Curso, área ou instituição", kind: "text" },
      { id: "level", label: "Nível acadêmico", kind: "multiple" },
      { id: "country", label: "País", kind: "location" },
      { id: "funding", label: "Cobertura da bolsa", kind: "multiple" },
      { id: "language", label: "Idioma", kind: "multiple" },
      { id: "deadline", label: "Prazo de candidatura", kind: "date" },
      { id: "source", label: "Fonte", kind: "multiple" },
    ],
    onboarding: onboarding(
      "Área e nível de estudo desejados.",
      "Países de interesse e opção remota.",
      "Idioma, bolsa necessária e data de início.",
    ),
    quickActions: quickActions(
      "Explorar oportunidades",
      "Ver oportunidades salvas",
    ),
  },
  research: {
    type: "research",
    vocabulary: {
      opportunity: "chamada de pesquisa",
      opportunityPlural: "chamadas de pesquisa",
      saved: "Chamadas salvas",
      application: "proposta",
      deadline: "Prazo da proposta",
    },
    navigation: sharedNavigation("Explorar chamadas", "Chamadas salvas"),
    dashboard: commonDashboard,
    searchFilters: [
      { id: "query", label: "Tema, programa ou instituição", kind: "text" },
      { id: "area", label: "Área de pesquisa", kind: "multiple" },
      { id: "career", label: "Estágio de carreira", kind: "multiple" },
      { id: "funding", label: "Tipo de financiamento", kind: "multiple" },
      { id: "country", label: "País", kind: "location" },
      { id: "eligibility", label: "Elegibilidade do Brasil", kind: "multiple" },
      { id: "deadline", label: "Prazo da proposta", kind: "date" },
      { id: "source", label: "Fonte", kind: "multiple" },
    ],
    onboarding: onboarding(
      "Temas de pesquisa e estágio de carreira.",
      "Países e formatos de colaboração.",
      "Instituição, financiamento e idiomas.",
    ),
    quickActions: quickActions("Explorar chamadas", "Ver chamadas salvas"),
  },
  culture: {
    type: "culture",
    vocabulary: {
      opportunity: "chamada cultural",
      opportunityPlural: "chamadas culturais",
      saved: "Chamadas salvas",
      application: "inscrição",
      deadline: "Prazo de inscrição",
    },
    navigation: sharedNavigation("Chamadas culturais", "Chamadas salvas"),
    dashboard: commonDashboard,
    searchFilters: [
      { id: "query", label: "Título, órgão ou resumo", kind: "text" },
      { id: "status", label: "Situação das inscrições", kind: "multiple" },
      { id: "area", label: "Áreas culturais", kind: "multiple" },
      { id: "kind", label: "Tipo de oportunidade", kind: "multiple" },
      { id: "program", label: "Programa", kind: "multiple" },
      { id: "location", label: "Estado e município", kind: "location" },
      { id: "value", label: "Valor", kind: "money" },
      { id: "source", label: "Fonte", kind: "multiple" },
    ],
    onboarding: onboarding(
      "Linguagens e tipos de chamada que você procura.",
      "Onde o projeto cultural será realizado.",
      "Tipo de proponente, programas e faixa de valor.",
    ),
    quickActions: quickActions("Chamadas culturais", "Ver chamadas salvas"),
  },
};

export const workspaceExperience = (
  type: WorkspaceType,
): WorkspaceExperienceDefinition => WORKSPACE_EXPERIENCES[type];
