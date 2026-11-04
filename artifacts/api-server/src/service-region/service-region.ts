import municipalitiesJson from "./ibge-municipalities.json" with { type: "json" };

export const MACROREGION_UFS = {
  north: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"],
  northeast: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  central_west: ["DF", "GO", "MT", "MS"],
  southeast: ["ES", "MG", "RJ", "SP"],
  south: ["PR", "RS", "SC"],
} as const;

export type Macroregion = keyof typeof MACROREGION_UFS;
export type Municipality = {
  ibgeCode: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
};
export type MunicipalityReference = Pick<
  Municipality,
  "ibgeCode" | "name" | "state"
>;

export type ServiceRegionCoverage =
  | {
      scope: "national";
      mode: "strict" | "prioritize";
      acceptsRemote: boolean;
    }
  | {
      scope: "custom";
      mode: "strict" | "prioritize";
      acceptsRemote: boolean;
      regions: Macroregion[];
      states: string[];
      municipalities: MunicipalityReference[];
      radius: {
        center: MunicipalityReference;
        km: 50 | 100 | 200 | 300 | 500;
      } | null;
    };

export const municipalities = municipalitiesJson as Municipality[];
const municipalityByCode = new Map(
  municipalities.map((city) => [city.ibgeCode, city]),
);

export const municipalityForIbgeCode = (
  ibgeCode: string | null | undefined,
): Municipality | null =>
  ibgeCode ? (municipalityByCode.get(ibgeCode) ?? null) : null;

export const municipalityReference = (
  ibgeCode: string,
): MunicipalityReference | null => {
  const city = municipalityForIbgeCode(ibgeCode);
  return city
    ? { ibgeCode: city.ibgeCode, name: city.name, state: city.state }
    : null;
};

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

export function searchMunicipalities(
  query: string,
  state?: string,
  limit = 20,
): MunicipalityReference[] {
  const term = fold(query.trim());
  if (term.length < 2) return [];
  const normalizedState = state?.toUpperCase();
  return municipalities
    .filter(
      (city) =>
        (!normalizedState || city.state === normalizedState) &&
        fold(city.name).includes(term),
    )
    .sort((left, right) => {
      const leftStarts = fold(left.name).startsWith(term) ? 0 : 1;
      const rightStarts = fold(right.name).startsWith(term) ? 0 : 1;
      return (
        leftStarts - rightStarts ||
        left.name.localeCompare(right.name, "pt-BR") ||
        left.state.localeCompare(right.state)
      );
    })
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map(({ ibgeCode, name, state: cityState }) => ({
      ibgeCode,
      name,
      state: cityState,
    }));
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres. The comparison is inclusive at the configured radius. */
export function haversineKm(
  from: Pick<Municipality, "latitude" | "longitude">,
  to: Pick<Municipality, "latitude" | "longitude">,
): number {
  const earthRadiusKm = 6_371.0088;
  const deltaLatitude = radians(to.latitude - from.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const latitudeFrom = radians(from.latitude);
  const latitudeTo = radians(to.latitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeFrom) *
      Math.cos(latitudeTo) *
      Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Radius boundaries are inclusive so an edital exactly at the configured limit is retained. */
export const isWithinRadius = (distanceKm: number, radiusKm: number): boolean =>
  distanceKm <= radiusKm + Number.EPSILON;

export const statesForMacroregions = (
  regions: readonly Macroregion[],
): string[] => [
  ...new Set(regions.flatMap((region) => [...MACROREGION_UFS[region]])),
];

export type TenderServiceLocation = {
  state: string | null;
  municipalityIbge: string | null;
  categories: readonly { slug: string }[];
};

const REMOTE_CATEGORY_SLUGS = new Set([
  "ti-telecom",
  "consultoria-tecnica",
  "educacao-capacitacao",
  "publicidade-comunicacao",
  "seguros-financeiros",
]);

export const isRemoteCompatible = (
  categories: readonly { slug: string }[],
): boolean => categories.some(({ slug }) => REMOTE_CATEGORY_SLUGS.has(slug));

export type ServiceRegionMatch = {
  matches: boolean;
  remote: boolean;
  reason: string;
  distanceKm: number | null;
};

export function matchServiceRegion(
  coverage: ServiceRegionCoverage,
  tender: TenderServiceLocation,
): ServiceRegionMatch {
  if (coverage.scope === "national") {
    return {
      matches: true,
      remote: false,
      reason: "Em todo o Brasil, sua região de atuação",
      distanceKm: null,
    };
  }
  const state = tender.state?.toUpperCase() ?? null;
  const city = municipalityForIbgeCode(tender.municipalityIbge);
  const selectedMunicipality =
    city &&
    coverage.municipalities.some(({ ibgeCode }) => ibgeCode === city.ibgeCode);
  if (selectedMunicipality) {
    return {
      matches: true,
      remote: false,
      reason: `Em ${city.name}-${city.state}, município onde você atende`,
      distanceKm: 0,
    };
  }
  if (city && coverage.radius) {
    const center = municipalityForIbgeCode(coverage.radius.center.ibgeCode);
    if (center) {
      const distanceKm = haversineKm(center, city);
      if (isWithinRadius(distanceKm, coverage.radius.km)) {
        return {
          matches: true,
          remote: false,
          reason: `Na sua região: até ${coverage.radius.km} km de ${center.name}-${center.state}`,
          distanceKm,
        };
      }
    }
  }
  const regionStates = statesForMacroregions(coverage.regions);
  if (state && coverage.states.includes(state)) {
    return {
      matches: true,
      remote: false,
      reason: `Em ${state}, sua UF de atuação`,
      distanceKm: null,
    };
  }
  if (state && regionStates.includes(state)) {
    return {
      matches: true,
      remote: false,
      reason: `Na macrorregião onde você atende (${state})`,
      distanceKm: null,
    };
  }
  if (coverage.acceptsRemote && isRemoteCompatible(tender.categories)) {
    return {
      matches: true,
      remote: true,
      reason: "Pode ser executado à distância conforme a categoria",
      distanceKm: null,
    };
  }
  return {
    matches: false,
    remote: false,
    reason: "Fora da sua região",
    distanceKm: null,
  };
}

export const municipalityCodesWithinRadius = (
  centerIbge: string,
  radiusKm: number,
): string[] => {
  const center = municipalityForIbgeCode(centerIbge);
  if (!center) return [];
  return municipalities
    .filter((city) => isWithinRadius(haversineKm(center, city), radiusKm))
    .map((city) => city.ibgeCode);
};

/** UFs and municipalities that count as "inside" a custom coverage (for SQL candidate filters). */
export function coverageLocationTargets(
  coverage: Extract<ServiceRegionCoverage, { scope: "custom" }>,
): { states: string[]; municipalities: string[] } {
  const states = [
    ...new Set([
      ...coverage.states.map((state) => state.toUpperCase()),
      ...statesForMacroregions(coverage.regions),
    ]),
  ];
  const municipalities = [
    ...new Set([
      ...coverage.municipalities.map(({ ibgeCode }) => ibgeCode),
      ...(coverage.radius
        ? municipalityCodesWithinRadius(
            coverage.radius.center.ibgeCode,
            coverage.radius.km,
          )
        : []),
    ]),
  ];
  return { states, municipalities };
}
