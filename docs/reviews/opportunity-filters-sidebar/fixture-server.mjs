import http from "node:http";

const json = (response, body, status = 200) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
};

const common = {
  summary:
    "Oportunidade fictícia criada exclusivamente para validar a interface local do Pardal Digital.",
  audience: null,
  amount: null,
  documents: [],
  registrationFrom: "2026-10-01",
  registrationTo: "2026-11-30",
  continuousFlow: false,
  originName: null,
  individualListing: false,
  sourceUrl: "https://example.invalid/edital",
  updatedAt: "2026-10-15T12:00:00.000Z",
  profileMatch: null,
  applicationCheckedAt: "2026-10-15T12:00:00.000Z",
  noticeDates: null,
};

const national = [
  {
    ...common,
    id: "demo-nacional-1",
    title: "Mostra Fictícia de Cinema Brasileiro 2027",
    organizationName: "Fundação Cultural de Exemplo",
    status: "open",
    program: "audiovisual",
    kind: "culture",
    source: "mapas",
    sourceName: "Mapas Culturais",
    state: "SP",
    city: "São Paulo",
    areas: ["audiovisual"],
    areaTerms: ["Cinema"],
    opportunityType: "Edital",
    installation: {
      id: "mapas-sp-demo",
      name: "Mapa Cultural fictício",
      uf: "SP",
      city: "São Paulo",
    },
    scope: "national",
    international: null,
    application: {
      url: "https://example.invalid/inscricao",
      platform: "mapas-culturais",
      label: "Mapas Culturais",
      article: "o",
      origin: "source_page",
      documentTitle: null,
    },
  },
  {
    ...common,
    id: "demo-nacional-2",
    title: "Programa Experimental de Formação Musical",
    organizationName: "Secretaria de Cultura Modelo",
    status: "upcoming",
    program: "lpg",
    kind: "funding",
    source: "minc",
    sourceName: "Ministério da Cultura",
    state: "CE",
    city: "Fortaleza",
    areas: ["musica", "formacao"],
    areaTerms: ["Música", "Formação"],
    opportunityType: "Chamada pública",
    installation: {
      id: "cultura-demo",
      name: "Portal fictício de cultura",
      uf: "CE",
      city: "Fortaleza",
    },
    scope: "national",
    international: null,
    application: null,
  },
];

const international = [
  {
    ...common,
    id: "demo-internacional-1",
    title: "Programa fictício de inovação climática para a América Latina",
    organizationName: "Organismo Internacional de Demonstração",
    status: "open",
    program: null,
    kind: "funding",
    source: "worldbank",
    sourceName: "Banco Mundial",
    state: null,
    city: null,
    areas: [],
    areaTerms: [],
    opportunityType: "Subvenção",
    installation: {
      id: "worldbank-demo",
      name: "Banco Mundial",
      uf: "",
      city: null,
    },
    scope: "international",
    application: null,
    international: {
      agency: "Fundo Global Fictício",
      country: "BR",
      countryName: "Brasil",
      region: "america-latina",
      regionName: "América Latina e Caribe",
      brazilProject: true,
      language: "en",
      languageName: "Inglês",
      titleOriginal: "Fictional climate innovation programme for Latin America",
      titlePt: "Programa fictício de inovação climática para a América Latina",
      translationSource: "source",
      amountOriginal: 500000,
      currency: "USD",
      amountBrlApprox: 2750000,
      fxRate: 5.5,
      fxDate: "2026-10-15",
      deadline: {
        at: "2026-11-30T20:59:59.000Z",
        precision: "date",
        timeZone: "America/Sao_Paulo",
        original: "2026-11-30",
      },
      brazilEligibility: {
        status: "yes",
        label: "Aberto a brasileiros",
        reason:
          "Organizações sediadas no Brasil podem participar nesta demonstração.",
        rule: null,
      },
      brazilFunding: {
        status: "yes",
        label: "Financia participante do Brasil",
        reason: null,
      },
      eligibilityCheckedAt: "2026-10-15T12:00:00.000Z",
      details: [],
    },
  },
  {
    ...common,
    id: "demo-internacional-2",
    title: "Consultoria fictícia para patrimônio digital",
    organizationName: "Agência Europeia de Exemplo",
    status: "open",
    program: null,
    kind: "procurement",
    source: "eu_ft",
    sourceName: "União Europeia (Funding & Tenders)",
    state: null,
    city: null,
    areas: [],
    areaTerms: [],
    opportunityType: "Consultoria",
    installation: { id: "eu-demo", name: "União Europeia", uf: "", city: null },
    scope: "international",
    application: {
      url: "https://example.invalid/eu",
      platform: "eu-funding-tenders",
      label: "Funding & Tenders",
      article: "o",
      origin: "source_page",
      documentTitle: null,
    },
    international: {
      agency: "Agência Europeia de Exemplo",
      country: "BE",
      countryName: "Bélgica",
      region: "europa",
      regionName: "Europa",
      brazilProject: false,
      language: "fr",
      languageName: "Francês",
      titleOriginal: "Consultation fictive pour le patrimoine numérique",
      titlePt: "Consultoria fictícia para patrimônio digital",
      translationSource: "model",
      amountOriginal: 180000,
      currency: "EUR",
      amountBrlApprox: 1170000,
      fxRate: 6.5,
      fxDate: "2026-10-15",
      deadline: {
        at: "2026-12-15T22:59:59.000Z",
        precision: "date",
        timeZone: "Europe/Brussels",
        original: "2026-12-15",
      },
      brazilEligibility: {
        status: "conditional",
        label: "Condicional",
        reason: "Participação em consórcio internacional nesta demonstração.",
        rule: null,
      },
      brazilFunding: {
        status: "conditional",
        label: "Financiamento condicional",
        reason: null,
      },
      eligibilityCheckedAt: "2026-10-15T12:00:00.000Z",
      details: [],
    },
  },
];

const facets = (isInternational) => ({
  status: [
    { value: "open", label: "Inscrições abertas", count: 2 },
    { value: "upcoming", label: "Inscrições em breve", count: 1 },
  ],
  state: [
    { value: "SP", label: "SP", count: 1 },
    { value: "CE", label: "CE", count: 1 },
  ],
  installation: [
    { value: "mapas-sp-demo", label: "Mapa Cultural fictício", count: 1 },
    { value: "cultura-demo", label: "Portal fictício de cultura", count: 1 },
  ],
  program: [
    { value: "audiovisual", label: "Audiovisual", count: 1 },
    { value: "lpg", label: "Lei Paulo Gustavo", count: 1 },
  ],
  kind: [
    { value: "culture", label: "Cultura", count: 1 },
    { value: "funding", label: "Fomento", count: 1 },
  ],
  source: [
    {
      value: isInternational ? "worldbank" : "mapas",
      label: isInternational ? "Banco Mundial" : "Mapas Culturais",
      count: 1,
    },
    {
      value: isInternational ? "eu_ft" : "minc",
      label: isInternational ? "União Europeia" : "Ministério da Cultura",
      count: 1,
    },
  ],
  area: [
    { value: "audiovisual", label: "Audiovisual", count: 1 },
    { value: "musica", label: "Música", count: 1 },
    { value: "formacao", label: "Formação e pesquisa", count: 1 },
  ],
  city: [
    { value: "São Paulo", label: "São Paulo (SP)", count: 1, state: "SP" },
    { value: "Fortaleza", label: "Fortaleza (CE)", count: 1, state: "CE" },
  ],
  organization: [
    {
      value: "Fundação Cultural de Exemplo",
      label: "Fundação Cultural de Exemplo",
      count: 1,
    },
    {
      value: "Secretaria de Cultura Modelo",
      label: "Secretaria de Cultura Modelo",
      count: 1,
    },
  ],
  agency: [
    {
      value: "Fundo Global Fictício",
      label: "Fundo Global Fictício",
      count: 1,
    },
    {
      value: "Agência Europeia de Exemplo",
      label: "Agência Europeia de Exemplo",
      count: 1,
    },
  ],
  region: [
    { value: "america-latina", label: "América Latina e Caribe", count: 1 },
    { value: "europa", label: "Europa", count: 1 },
  ],
  language: [
    { value: "en", label: "Inglês", count: 1 },
    { value: "fr", label: "Francês", count: 1 },
  ],
  opportunityType: [
    { value: "Subvenção", label: "Subvenção", count: 1 },
    { value: "Consultoria", label: "Consultoria", count: 1 },
  ],
  eligibility: [
    { value: "yes", label: "Aberto a brasileiros", count: 1 },
    { value: "conditional", label: "Condicional", count: 1 },
  ],
  funding: [
    { value: "yes", label: "Financia participante do Brasil", count: 1 },
    { value: "conditional", label: "Financiamento condicional", count: 1 },
  ],
});

http
  .createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/api/v1/auth/session")
      return json(response, {
        user: {
          id: "demo-user",
          email: "demo@example.invalid",
          name: "Demonstração",
          avatarUrl: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      });
    if (url.pathname === "/api/v1/me/billing")
      return json(response, {
        status: "active",
        entitled: true,
        currentPeriodEnd: "2027-01-01T00:00:00.000Z",
        canCancel: false,
        monthlyBrl: 29,
        source: "subscription",
      });
    if (url.pathname === "/api/v1/me/notifications/unread-count")
      return json(response, { unreadCount: 0 });
    if (url.pathname === "/api/v1/tenders/search") {
      return json(response, {
        data: [],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
          totalIsEstimate: false,
        },
        facets: {
          status: [{ value: "open", label: "Aberta", count: 0 }],
          state: [],
          city: [],
          modality: [],
          source: [],
          category: [],
          organization: [],
          platform: [],
          valueRange: { min: null, max: null },
          newCount: 0,
        },
        meta: {
          query: url.searchParams.get("q"),
          searchMode: "keyword",
          tookMs: 1,
          indexUpdatedAt: null,
        },
      });
    }
    if (url.pathname === "/api/v1/opportunities") {
      const isInternational = url.searchParams.get("scope") === "international";
      const candidates = isInternational ? international : national;
      const data = candidates.filter((item) => {
        for (const key of [
          "state",
          "kind",
          "status",
          "source",
          "city",
          "organization",
        ]) {
          const values = url.searchParams.getAll(key);
          if (
            values.length &&
            !values.includes(
              item[key === "organization" ? "organizationName" : key],
            )
          )
            return false;
        }
        if (isInternational) {
          for (const key of ["region", "country", "language", "agency"]) {
            const values = url.searchParams.getAll(key);
            if (values.length && !values.includes(item.international[key]))
              return false;
          }
        }
        return true;
      });
      return json(response, {
        data,
        pagination: {
          page: 1,
          pageSize: 20,
          total: data.length,
          totalPages: 1,
          totalIsEstimate: false,
        },
        facets: facets(isInternational),
        meta: {
          query: url.searchParams.get("q"),
          tookMs: 8,
          indexUpdatedAt: "2026-10-15T12:00:00.000Z",
          installationIssues: [],
          gaps: [],
          hiddenIndividualListings: 3,
          scope: isInternational ? "international" : "national",
          internationalInProfile: true,
        },
      });
    }
    return json(
      response,
      {
        error: { code: "NOT_FOUND", message: "Rota fictícia não implementada" },
      },
      404,
    );
  })
  .listen(24732, "127.0.0.1");
