/**
 * Official Mapas Culturais installs. Every URL comes from the "Instalações" list in the project README
 * (https://github.com/mapasculturais/mapasculturais, read on 2026-10-10). UFs with no state install stay as gaps.
 */

export type InstallationScope = "federal" | "state" | "municipal";

export type MapasInstallation = {
  id: string;
  uf: string;
  name: string;
  kind: "mapas";
  scope: InstallationScope;
  /** Municipality, for municipal installs only. */
  city?: string;
  baseUrl: string;
  /** The official list publishes this install without TLS and the host does not answer on 443. */
  plainHttp?: true;
  tlsDiagnosis?: {
    observedOn: string;
    expiresOn?: string;
    alsoWrongName?: boolean;
  };
};

export type GapInstallation = {
  id: string;
  uf: string;
  name: string;
  kind: "gap";
  scope: "state";
  reason: string;
};

export type CulturalInstallation = MapasInstallation | GapInstallation;

const GAP_REASON =
  "Esta UF não tem instalação estadual do Mapas Culturais na lista oficial do projeto. Editais da secretaria ficam de fora até existir API.";

const mapas = (
  uf: string,
  name: string,
  baseUrl: string,
): MapasInstallation => ({
  id: uf.toLowerCase(),
  uf,
  name,
  kind: "mapas",
  scope: "state",
  baseUrl,
});

const gap = (uf: string, name: string): GapInstallation => ({
  id: uf.toLowerCase(),
  uf,
  name,
  kind: "gap",
  scope: "state",
  reason: GAP_REASON,
});

const slug = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const municipal = (
  uf: string,
  city: string,
  baseUrl: string,
): MapasInstallation => ({
  id: `${uf.toLowerCase()}-${slug(city)}`,
  uf,
  name: `Mapa Cultural de ${city}`,
  kind: "mapas",
  scope: "municipal",
  city,
  baseUrl,
  ...(baseUrl.startsWith("http://") ? { plainHttp: true as const } : {}),
});

export const FEDERAL_INSTALLATION: MapasInstallation = {
  id: "br",
  uf: "BR",
  name: "Mapa da Cultura",
  kind: "mapas",
  scope: "federal",
  baseUrl: "https://mapa.cultura.gov.br",
};

/** 27 UFs. Mapas entries are the state installs published by mapasculturais. */
export const STATE_INSTALLATIONS: CulturalInstallation[] = [
  gap("AC", "Secretaria de Cultura do Acre"),
  gap("AL", "Secretaria de Cultura de Alagoas"),
  gap("AM", "Secretaria de Cultura do Amazonas"),
  mapas("AP", "Mapa Cultural do Amapá", "https://mapacultural.ap.gov.br"),
  gap("BA", "Secretaria de Cultura da Bahia"),
  mapas(
    "CE",
    "Mapa Cultural do Ceará",
    "https://mapacultural.secult.ce.gov.br",
  ),
  gap("DF", "Secretaria de Cultura do Distrito Federal"),
  mapas(
    "ES",
    "Mapa da Cultura do Espírito Santo",
    "https://mapa.cultura.es.gov.br",
  ),
  mapas("GO", "Mapa Goiano de Cultura", "https://mapagoiano.cultura.go.gov.br"),
  mapas("MA", "Mapa da Cultura do Maranhão", "https://mapadacultura.ma.gov.br"),
  gap("MG", "Secretaria de Cultura de Minas Gerais"),
  gap("MS", "Secretaria de Cultura de Mato Grosso do Sul"),
  {
    ...mapas("MT", "Mapas Culturais de Mato Grosso", "https://mapas.mt.gov.br"),
    tlsDiagnosis: { observedOn: "2026-10-08", expiresOn: "2026-07-14" },
  },
  mapas("PA", "Mapa Cultural do Pará", "https://mapacultural.pa.gov.br"),
  mapas("PB", "Mapa Cultural da Paraíba", "https://mapacultural.pb.gov.br"),
  mapas(
    "PE",
    "Mapa Cultural de Pernambuco",
    "https://www.mapacultural.pe.gov.br",
  ),
  mapas(
    "PI",
    "Mapa da Cultura do Piauí",
    "https://www.mapadacultura.pi.gov.br",
  ),
  gap("PR", "Secretaria de Cultura do Paraná"),
  gap("RJ", "Secretaria de Cultura do Rio de Janeiro"),
  gap("RN", "Secretaria de Cultura do Rio Grande do Norte"),
  gap("RO", "Secretaria de Cultura de Rondônia"),
  gap("RR", "Secretaria de Cultura de Roraima"),
  gap("RS", "Secretaria de Cultura do Rio Grande do Sul"),
  gap("SC", "Secretaria de Cultura de Santa Catarina"),
  mapas("SE", "Mapa Cultural de Sergipe", "https://mapacultural.se.gov.br"),
  gap("SP", "Secretaria de Cultura de São Paulo"),
  {
    ...mapas(
      "TO",
      "Mapa da Cultura do Tocantins",
      "https://mapadacultura.secult.to.gov.br",
    ),
    tlsDiagnosis: { observedOn: "2026-10-08", alsoWrongName: true },
  },
];

/**
 * The municipal installs of the official list, in its order. Ribeirão das Neves and Santa Luzia are listed
 * with `http://` and redirect to HTTPS, so they are stored as HTTPS. Aracaju and Bento Gonçalves answer on
 * port 80 only. An install that stops answering is switched off by the collector, not removed from here.
 */
export const MUNICIPAL_INSTALLATIONS: MapasInstallation[] = [
  municipal("GO", "Anápolis", "https://culturaemrede.anapolis.go.gov.br"),
  municipal(
    "GO",
    "Aparecida de Goiânia",
    "https://portaldacultura.aparecida.go.gov.br",
  ),
  municipal("PR", "Apucarana", "https://cultura.apucarana.pr.gov.br"),
  municipal("SE", "Aracaju", "http://mapa.cultura.aracaju.se.gov.br"),
  municipal("MG", "Belo Horizonte", "https://mapaculturalbh.pbh.gov.br"),
  municipal(
    "RS",
    "Bento Gonçalves",
    "http://mapacultural.bentogoncalves.rs.gov.br",
  ),
  municipal("PR", "Campo Mourão", "https://mapas.campomourao.pr.gov.br"),
  municipal(
    "RJ",
    "Campos dos Goytacazes",
    "https://mapasculturais.campos.rj.gov.br",
  ),
  municipal("BA", "Camaçari", "https://mapacultural.camacari.ba.gov.br"),
  municipal("SP", "Campinas", "https://mapacultural.campinas.sp.gov.br"),
  municipal("CE", "Chorozinho", "https://mapacultural.chorozinho.ce.gov.br"),
  municipal("PR", "Cianorte", "https://cultura.cianorte.pr.gov.br"),
  municipal("RS", "Gravataí", "https://mapacultural.gravatai.rs.gov.br"),
  municipal("CE", "Iguatu", "http://mapacultural.iguatu.ce.gov.br"),
  municipal("PB", "João Pessoa", "https://jpcultura.joaopessoa.pb.gov.br"),
  municipal("MG", "Lagoa Santa", "https://mapacultural.lagoasanta.mg.gov.br"),
  municipal("PR", "Londrina", "https://londrinacultura.londrina.pr.gov.br"),
  municipal("PR", "Maringá", "https://maringacultura.maringa.pr.gov.br"),
  municipal("SP", "Mauá", "https://mapacultural.maua.sp.gov.br"),
  municipal("RN", "Natal", "https://mapacultural.natal.rn.gov.br"),
  municipal("MG", "Nova Lima", "https://mapacultural.novalima.mg.gov.br"),
  municipal("PA", "Parauapebas", "https://mapacultural.parauapebas.pa.gov.br"),
  municipal("PE", "Petrolina", "https://mapacultural.petrolina.pe.gov.br"),
  municipal("MG", "Ribeirão das Neves", "https://mapaculturaneves.com.br"),
  municipal("MG", "Santa Luzia", "https://mapacultural.santaluzia.mg.gov.br"),
  municipal(
    "SP",
    "Santo Anastácio",
    "https://cultura.santoanastacio.sp.gov.br",
  ),
  municipal("SP", "Santo André", "https://culturaz.santoandre.sp.gov.br"),
  municipal(
    "CE",
    "São Gonçalo do Amarante",
    "https://mapacultural.saogoncalodoamarante.ce.gov.br",
  ),
  municipal(
    "SP",
    "São Bernardo do Campo",
    "https://mapacultural.saobernardo.sp.gov.br",
  ),
  municipal("PR", "Sarandi", "https://cultura.sarandi.pr.gov.br"),
  municipal("PR", "Toledo", "https://cultura.toledo.pr.gov.br"),
];

export const CULTURAL_INSTALLATIONS: CulturalInstallation[] = [
  FEDERAL_INSTALLATION,
  ...STATE_INSTALLATIONS,
  ...MUNICIPAL_INSTALLATIONS,
];

export const mapasInstallations = (): MapasInstallation[] =>
  CULTURAL_INSTALLATIONS.filter(
    (installation): installation is MapasInstallation =>
      installation.kind === "mapas",
  );

export const installationById = (
  id: string,
): CulturalInstallation | undefined =>
  CULTURAL_INSTALLATIONS.find((installation) => installation.id === id);
