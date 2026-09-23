/** Official Mapas Culturais installs. State URLs come from the project README; UFs absent there stay as gaps. */

export type MapasInstallation = {
  id: string;
  uf: string;
  name: string;
  kind: "mapas";
  baseUrl: string;
};

export type GapInstallation = {
  id: string;
  uf: string;
  name: string;
  kind: "gap";
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
  baseUrl,
});

const gap = (uf: string, name: string): GapInstallation => ({
  id: uf.toLowerCase(),
  uf,
  name,
  kind: "gap",
  reason: GAP_REASON,
});

export const FEDERAL_INSTALLATION: MapasInstallation = {
  id: "br",
  uf: "BR",
  name: "Mapa da Cultura",
  kind: "mapas",
  baseUrl: "https://mapa.cultura.gov.br",
};

/** 27 UFs. Mapas entries are the state installs published by mapasculturais. */
export const STATE_INSTALLATIONS: CulturalInstallation[] = [
  gap("AC", "Secretaria de Cultura do Acre"),
  gap("AL", "Secretaria de Cultura de Alagoas"),
  gap("AM", "Secretaria de Cultura do Amazonas"),
  mapas("AP", "Mapa Cultural do Amapá", "https://mapacultural.ap.gov.br"),
  gap("BA", "Secretaria de Cultura da Bahia"),
  mapas("CE", "Mapa Cultural do Ceará", "https://mapacultural.secult.ce.gov.br"),
  gap("DF", "Secretaria de Cultura do Distrito Federal"),
  mapas("ES", "Mapa da Cultura do Espírito Santo", "https://mapa.cultura.es.gov.br"),
  mapas("GO", "Mapa Goiano de Cultura", "https://mapagoiano.cultura.go.gov.br"),
  mapas("MA", "Mapa da Cultura do Maranhão", "https://mapadacultura.ma.gov.br"),
  gap("MG", "Secretaria de Cultura de Minas Gerais"),
  gap("MS", "Secretaria de Cultura de Mato Grosso do Sul"),
  mapas("MT", "Mapas Culturais de Mato Grosso", "https://mapas.mt.gov.br"),
  mapas("PA", "Mapa Cultural do Pará", "https://mapacultural.pa.gov.br"),
  mapas("PB", "Mapa Cultural da Paraíba", "https://mapacultural.pb.gov.br"),
  mapas("PE", "Mapa Cultural de Pernambuco", "https://www.mapacultural.pe.gov.br"),
  mapas("PI", "Mapa da Cultura do Piauí", "https://www.mapadacultura.pi.gov.br"),
  gap("PR", "Secretaria de Cultura do Paraná"),
  gap("RJ", "Secretaria de Cultura do Rio de Janeiro"),
  gap("RN", "Secretaria de Cultura do Rio Grande do Norte"),
  gap("RO", "Secretaria de Cultura de Rondônia"),
  gap("RR", "Secretaria de Cultura de Roraima"),
  gap("RS", "Secretaria de Cultura do Rio Grande do Sul"),
  gap("SC", "Secretaria de Cultura de Santa Catarina"),
  mapas("SE", "Mapa Cultural de Sergipe", "https://mapacultural.se.gov.br"),
  gap("SP", "Secretaria de Cultura de São Paulo"),
  mapas("TO", "Mapa da Cultura do Tocantins", "https://mapadacultura.secult.to.gov.br"),
];

export const CULTURAL_INSTALLATIONS: CulturalInstallation[] = [
  FEDERAL_INSTALLATION,
  ...STATE_INSTALLATIONS,
];

export const mapasInstallations = (): MapasInstallation[] =>
  CULTURAL_INSTALLATIONS.filter(
    (installation): installation is MapasInstallation => installation.kind === "mapas",
  );

export const installationById = (
  id: string,
): CulturalInstallation | undefined =>
  CULTURAL_INSTALLATIONS.find((installation) => installation.id === id);
