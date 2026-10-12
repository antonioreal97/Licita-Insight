import { normalizeText } from "../domain/normalize";

export const INTERNATIONAL_REGIONS = [
  "america-latina",
  "africa",
  "europa",
  "asia",
  "oriente-medio",
  "global",
] as const;
export type InternationalRegion = (typeof INTERNATIONAL_REGIONS)[number];

export const internationalRegionLabels: Record<InternationalRegion, string> = {
  "america-latina": "América Latina e Caribe",
  africa: "África",
  europa: "Europa",
  asia: "Ásia e Pacífico",
  "oriente-medio": "Oriente Médio e Norte da África",
  global: "Vários países",
};

export type InternationalPlace = {
  /** ISO 3166-1 alpha-2; `null` for a regional or multi-country project. */
  country: string | null;
  /** Name in Portuguese; the name as published when the country is not in the table. */
  countryName: string | null;
  region: InternationalRegion | null;
  /** IANA zone, only when the whole country keeps a single one. */
  timeZone: string | null;
};

type Row = [
  code: string,
  region: InternationalRegion,
  timeZone: string | null,
  ...names: string[],
];

/**
 * Borrower countries as the World Bank spells them, plus common variants. The time zone is `null` where the
 * country has more than one (Brazil, Indonesia, DR Congo…): the notice gives a local hour with no zone, and
 * guessing the capital's would invent a deadline.
 */
const COUNTRIES: Row[] = [
  // América Latina e Caribe
  ["AR", "america-latina", "America/Argentina/Buenos_Aires", "Argentina"],
  ["BS", "america-latina", "America/Nassau", "Bahamas, The", "Bahamas"],
  ["BB", "america-latina", "America/Barbados", "Barbados"],
  ["BZ", "america-latina", "America/Belize", "Belize"],
  ["BO", "america-latina", "America/La_Paz", "Bolivia"],
  ["BR", "america-latina", null, "Brazil", "Brasil"],
  ["CL", "america-latina", null, "Chile"],
  ["CO", "america-latina", "America/Bogota", "Colombia"],
  ["CR", "america-latina", "America/Costa_Rica", "Costa Rica"],
  ["DM", "america-latina", "America/Dominica", "Dominica"],
  ["DO", "america-latina", "America/Santo_Domingo", "Dominican Republic"],
  ["EC", "america-latina", null, "Ecuador"],
  ["SV", "america-latina", "America/El_Salvador", "El Salvador"],
  ["GD", "america-latina", "America/Grenada", "Grenada"],
  ["GT", "america-latina", "America/Guatemala", "Guatemala"],
  ["GY", "america-latina", "America/Guyana", "Guyana"],
  ["HT", "america-latina", "America/Port-au-Prince", "Haiti"],
  ["HN", "america-latina", "America/Tegucigalpa", "Honduras"],
  ["JM", "america-latina", "America/Jamaica", "Jamaica"],
  ["MX", "america-latina", null, "Mexico"],
  ["NI", "america-latina", "America/Managua", "Nicaragua"],
  ["PA", "america-latina", "America/Panama", "Panama"],
  ["PY", "america-latina", "America/Asuncion", "Paraguay"],
  ["PE", "america-latina", "America/Lima", "Peru"],
  [
    "KN",
    "america-latina",
    "America/St_Kitts",
    "St. Kitts and Nevis",
    "Saint Kitts and Nevis",
  ],
  ["LC", "america-latina", "America/St_Lucia", "St. Lucia", "Saint Lucia"],
  [
    "VC",
    "america-latina",
    "America/St_Vincent",
    "St. Vincent and the Grenadines",
    "Saint Vincent and the Grenadines",
  ],
  ["SR", "america-latina", "America/Paramaribo", "Suriname"],
  [
    "TT",
    "america-latina",
    "America/Port_of_Spain",
    "Trinidad and Tobago",
  ],
  ["UY", "america-latina", "America/Montevideo", "Uruguay"],
  [
    "VE",
    "america-latina",
    "America/Caracas",
    "Venezuela, Republica Bolivariana de",
    "Venezuela",
  ],
  // África
  ["AO", "africa", "Africa/Luanda", "Angola"],
  ["BJ", "africa", "Africa/Porto-Novo", "Benin"],
  ["BW", "africa", "Africa/Gaborone", "Botswana"],
  ["BF", "africa", "Africa/Ouagadougou", "Burkina Faso"],
  ["BI", "africa", "Africa/Bujumbura", "Burundi"],
  ["CV", "africa", "Atlantic/Cape_Verde", "Cabo Verde", "Cape Verde"],
  ["CM", "africa", "Africa/Douala", "Cameroon"],
  ["CF", "africa", "Africa/Bangui", "Central African Republic"],
  ["TD", "africa", "Africa/Ndjamena", "Chad"],
  ["KM", "africa", "Indian/Comoro", "Comoros"],
  [
    "CD",
    "africa",
    null,
    "Congo, Democratic Republic of",
    "Democratic Republic of the Congo",
    "Congo, Dem. Rep.",
  ],
  [
    "CG",
    "africa",
    "Africa/Brazzaville",
    "Congo, Republic of",
    "Republic of Congo",
    "Congo, Rep.",
  ],
  ["CI", "africa", "Africa/Abidjan", "Cote d'Ivoire", "Côte d'Ivoire"],
  ["GQ", "africa", "Africa/Malabo", "Equatorial Guinea"],
  ["ER", "africa", "Africa/Asmara", "Eritrea"],
  ["SZ", "africa", "Africa/Mbabane", "Eswatini", "Swaziland"],
  ["ET", "africa", "Africa/Addis_Ababa", "Ethiopia"],
  ["GA", "africa", "Africa/Libreville", "Gabon"],
  ["GM", "africa", "Africa/Banjul", "Gambia, The", "Gambia"],
  ["GH", "africa", "Africa/Accra", "Ghana"],
  ["GN", "africa", "Africa/Conakry", "Guinea"],
  ["GW", "africa", "Africa/Bissau", "Guinea-Bissau"],
  ["KE", "africa", "Africa/Nairobi", "Kenya"],
  ["LS", "africa", "Africa/Maseru", "Lesotho"],
  ["LR", "africa", "Africa/Monrovia", "Liberia"],
  ["MG", "africa", "Indian/Antananarivo", "Madagascar"],
  ["MW", "africa", "Africa/Blantyre", "Malawi"],
  ["ML", "africa", "Africa/Bamako", "Mali"],
  ["MR", "africa", "Africa/Nouakchott", "Mauritania"],
  ["MU", "africa", "Indian/Mauritius", "Mauritius"],
  ["MZ", "africa", "Africa/Maputo", "Mozambique"],
  ["NA", "africa", "Africa/Windhoek", "Namibia"],
  ["NE", "africa", "Africa/Niamey", "Niger"],
  ["NG", "africa", "Africa/Lagos", "Nigeria"],
  ["RW", "africa", "Africa/Kigali", "Rwanda"],
  ["ST", "africa", "Africa/Sao_Tome", "Sao Tome and Principe"],
  ["SN", "africa", "Africa/Dakar", "Senegal"],
  ["SC", "africa", "Indian/Mahe", "Seychelles"],
  ["SL", "africa", "Africa/Freetown", "Sierra Leone"],
  [
    "SO",
    "africa",
    "Africa/Mogadishu",
    "Somalia",
    "Somalia, Federal Republic of",
  ],
  ["ZA", "africa", "Africa/Johannesburg", "South Africa"],
  ["SS", "africa", "Africa/Juba", "South Sudan"],
  ["SD", "africa", "Africa/Khartoum", "Sudan"],
  ["TZ", "africa", "Africa/Dar_es_Salaam", "Tanzania"],
  ["TG", "africa", "Africa/Lome", "Togo"],
  ["UG", "africa", "Africa/Kampala", "Uganda"],
  ["ZM", "africa", "Africa/Lusaka", "Zambia"],
  ["ZW", "africa", "Africa/Harare", "Zimbabwe"],
  // Oriente Médio e Norte da África
  ["DZ", "oriente-medio", "Africa/Algiers", "Algeria"],
  ["DJ", "oriente-medio", "Africa/Djibouti", "Djibouti"],
  [
    "EG",
    "oriente-medio",
    "Africa/Cairo",
    "Egypt, Arab Republic of",
    "Egypt",
  ],
  [
    "IR",
    "oriente-medio",
    "Asia/Tehran",
    "Iran, Islamic Republic of",
    "Iran",
  ],
  ["IQ", "oriente-medio", "Asia/Baghdad", "Iraq"],
  ["JO", "oriente-medio", "Asia/Amman", "Jordan"],
  ["LB", "oriente-medio", "Asia/Beirut", "Lebanon"],
  ["LY", "oriente-medio", "Africa/Tripoli", "Libya"],
  ["MA", "oriente-medio", "Africa/Casablanca", "Morocco"],
  ["SY", "oriente-medio", "Asia/Damascus", "Syrian Arab Republic", "Syria"],
  ["TN", "oriente-medio", "Africa/Tunis", "Tunisia"],
  [
    "PS",
    "oriente-medio",
    "Asia/Hebron",
    "West Bank and Gaza",
    "Palestine",
  ],
  ["YE", "oriente-medio", "Asia/Aden", "Yemen, Republic of", "Yemen"],
  // Europa e Ásia Central
  ["AL", "europa", "Europe/Tirane", "Albania"],
  ["AM", "europa", "Asia/Yerevan", "Armenia"],
  ["AZ", "europa", "Asia/Baku", "Azerbaijan"],
  ["BY", "europa", "Europe/Minsk", "Belarus"],
  ["BA", "europa", "Europe/Sarajevo", "Bosnia and Herzegovina"],
  ["BG", "europa", "Europe/Sofia", "Bulgaria"],
  ["HR", "europa", "Europe/Zagreb", "Croatia"],
  ["GE", "europa", "Asia/Tbilisi", "Georgia"],
  ["XK", "europa", "Europe/Belgrade", "Kosovo"],
  ["MD", "europa", "Europe/Chisinau", "Moldova", "Moldova (Republic of)"],
  ["ME", "europa", "Europe/Podgorica", "Montenegro"],
  [
    "MK",
    "europa",
    "Europe/Skopje",
    "North Macedonia",
    "Republic of North Macedonia",
  ],
  ["PL", "europa", "Europe/Warsaw", "Poland"],
  ["RO", "europa", "Europe/Bucharest", "Romania"],
  ["RU", "europa", null, "Russian Federation", "Russia"],
  ["RS", "europa", "Europe/Belgrade", "Serbia"],
  ["TR", "europa", "Europe/Istanbul", "Turkiye", "Türkiye", "Turkey"],
  ["UA", "europa", "Europe/Kyiv", "Ukraine"],
  // Ásia e Pacífico
  ["AF", "asia", "Asia/Kabul", "Afghanistan"],
  ["BD", "asia", "Asia/Dhaka", "Bangladesh"],
  ["BT", "asia", "Asia/Thimphu", "Bhutan"],
  ["KH", "asia", "Asia/Phnom_Penh", "Cambodia"],
  ["CN", "asia", "Asia/Shanghai", "China", "China (People's Republic of)"],
  ["FJ", "asia", "Pacific/Fiji", "Fiji"],
  ["IN", "asia", "Asia/Kolkata", "India"],
  ["ID", "asia", null, "Indonesia"],
  ["KZ", "asia", "Asia/Almaty", "Kazakhstan"],
  ["KI", "asia", null, "Kiribati"],
  ["KG", "asia", "Asia/Bishkek", "Kyrgyz Republic", "Kyrgyzstan"],
  [
    "LA",
    "asia",
    "Asia/Vientiane",
    "Lao People's Democratic Republic",
    "Lao PDR",
    "Laos",
  ],
  ["MY", "asia", "Asia/Kuala_Lumpur", "Malaysia"],
  ["MV", "asia", "Indian/Maldives", "Maldives"],
  ["MH", "asia", "Pacific/Majuro", "Marshall Islands"],
  [
    "FM",
    "asia",
    null,
    "Micronesia, Federated States of",
    "Micronesia",
  ],
  ["MN", "asia", null, "Mongolia"],
  ["MM", "asia", "Asia/Yangon", "Myanmar"],
  ["NR", "asia", "Pacific/Nauru", "Nauru"],
  ["NP", "asia", "Asia/Kathmandu", "Nepal"],
  ["PK", "asia", "Asia/Karachi", "Pakistan"],
  ["PW", "asia", "Pacific/Palau", "Palau"],
  ["PG", "asia", null, "Papua New Guinea"],
  ["PH", "asia", "Asia/Manila", "Philippines"],
  ["WS", "asia", "Pacific/Apia", "Samoa"],
  ["SB", "asia", "Pacific/Guadalcanal", "Solomon Islands"],
  ["LK", "asia", "Asia/Colombo", "Sri Lanka"],
  ["TJ", "asia", "Asia/Dushanbe", "Tajikistan"],
  ["TH", "asia", "Asia/Bangkok", "Thailand"],
  ["TL", "asia", "Asia/Dili", "Timor-Leste"],
  ["TO", "asia", "Pacific/Tongatapu", "Tonga"],
  ["TM", "asia", "Asia/Ashgabat", "Turkmenistan"],
  ["TV", "asia", "Pacific/Funafuti", "Tuvalu"],
  ["UZ", "asia", "Asia/Tashkent", "Uzbekistan"],
  ["VU", "asia", "Pacific/Efate", "Vanuatu"],
  ["VN", "asia", "Asia/Ho_Chi_Minh", "Viet Nam", "Vietnam"],
];

/** Names the sources use for a regional or multi-country project. */
const REGIONAL_NAMES: Array<[InternationalRegion, ...string[]]> = [
  [
    "africa",
    "Western and Central Africa",
    "Eastern and Southern Africa",
    "Africa",
    "Western Africa",
    "Eastern Africa",
    "Southern Africa",
    "Central Africa",
    "Sub-Saharan Africa",
    "Africa, Caribbean and Pacific",
    "Southwest Indian Ocean",
    "Sahel",
    "Horn of Africa",
  ],
  [
    "america-latina",
    "Latin America and Caribbean",
    "Latin America",
    "Caribbean",
    "OECS Countries",
    "Central America",
    "Latin America and the Caribbean",
  ],
  [
    "europa",
    "Europe and Central Asia",
    "Central Asia",
    "Western Balkans",
    "South Caucasus",
    "Neighbourhood",
    "Instrument for Pre-accession Assistance",
    "Europe",
    "EU Europe",
    "Pre-accession Region",
  ],
  [
    "asia",
    "East Asia and Pacific",
    "South Asia",
    "Pacific Islands",
    "Pacific",
    "Pacific 1",
    "South East Asia",
    "Asia and the Pacific",
  ],
  ["oriente-medio", "Middle East and North Africa", "Middle East"],
  ["global", "World", "Multi-Regional", "Global", "Multi", "Others"],
];

const key = (name: string): string =>
  normalizeText(name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const portugueseNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });

/** Where the ICU name is not the one a Portuguese reader expects ("Congo - Kinshasa"). */
const PORTUGUESE_NAMES: Record<string, string> = {
  CD: "República Democrática do Congo",
  CG: "República do Congo",
  XK: "Kosovo",
  PS: "Cisjordânia e Gaza",
};

const portugueseName = (code: string, fallback: string): string => {
  if (PORTUGUESE_NAMES[code]) return PORTUGUESE_NAMES[code];
  try {
    // ICU has no Portuguese name for the user-assigned code of Kosovo in every build.
    const name = portugueseNames.of(code);
    return name && name !== code ? name : fallback;
  } catch {
    return fallback;
  }
};

const byName = new Map<string, InternationalPlace>();
for (const [code, region, timeZone, ...names] of COUNTRIES) {
  const place: InternationalPlace = {
    country: code,
    countryName: portugueseName(code, names[0]!),
    region,
    timeZone,
  };
  for (const name of names) byName.set(key(name), place);
}

const regionLabelsPt: Record<string, string> = {
  "western and central africa": "África Ocidental e Central",
  "eastern and southern africa": "África Oriental e Austral",
  "latin america and caribbean": "América Latina e Caribe",
  "europe and central asia": "Europa e Ásia Central",
  "east asia and pacific": "Leste Asiático e Pacífico",
  "south asia": "Sul da Ásia",
  "middle east and north africa": "Oriente Médio e Norte da África",
  world: "Vários países",
  africa: "África",
  "western africa": "África Ocidental",
  "eastern africa": "África Oriental",
  "southern africa": "África Austral",
  "central africa": "África Central",
  "sub saharan africa": "África Subsaariana",
  "southwest indian ocean": "Sudoeste do Oceano Índico",
  "horn of africa": "Chifre da África",
  "latin america": "América Latina",
  "latin america and the caribbean": "América Latina e Caribe",
  caribbean: "Caribe",
  "central america": "América Central",
  "oecs countries": "Caribe Oriental (OECS)",
  "central asia": "Ásia Central",
  "western balkans": "Bálcãs Ocidentais",
  europe: "Europa",
  "eu europe": "Europa",
  "pre accession region": "Países em pré-adesão à UE",
  neighbourhood: "Vizinhança da UE",
  "instrument for pre accession assistance": "Países em pré-adesão à UE",
  "south caucasus": "Cáucaso do Sul",
  "pacific islands": "Ilhas do Pacífico",
  pacific: "Ilhas do Pacífico",
  "pacific 1": "Ilhas do Pacífico",
  "south east asia": "Sudeste Asiático",
  "asia and the pacific": "Ásia e Pacífico",
  "middle east": "Oriente Médio",
  "multi regional": "Vários países",
  global: "Vários países",
  multi: "Vários países",
  others: "Vários países",
};

const byRegionalName = new Map<string, InternationalPlace>();
for (const [region, ...names] of REGIONAL_NAMES) {
  for (const name of names)
    byRegionalName.set(key(name), {
      country: null,
      countryName: regionLabelsPt[key(name)] ?? name,
      region,
      timeZone: null,
    });
}

const UNKNOWN: InternationalPlace = {
  country: null,
  countryName: null,
  region: null,
  timeZone: null,
};

/** Resolves a country or region name of a source. An unknown name is kept as published, with no region. */
export const placeFromName = (name: string | null): InternationalPlace => {
  const text = name?.replace(/\s+/g, " ").trim();
  if (!text) return UNKNOWN;
  return (
    byName.get(key(text)) ??
    byRegionalName.get(key(text)) ?? { ...UNKNOWN, countryName: text }
  );
};

/** BCP 47 codes of the languages the sources name ("Spanish; Castilian", "French"…). */
const LANGUAGES: Array<[code: string, label: string, ...names: string[]]> = [
  ["en", "Inglês", "english", "en"],
  ["fr", "Francês", "french", "fr", "francais"],
  ["es", "Espanhol", "spanish", "spanish castilian", "es", "espanol"],
  ["pt", "Português", "portuguese", "pt", "portugues"],
  ["ru", "Russo", "russian", "ru"],
  ["ar", "Árabe", "arabic", "ar"],
  ["zh", "Chinês", "chinese", "zh"],
];

const languageByName = new Map<string, string>();
for (const [code, , ...names] of LANGUAGES)
  for (const name of names) languageByName.set(name, code);

export const internationalLanguageLabels: Record<string, string> =
  Object.fromEntries(LANGUAGES.map(([code, label]) => [code, label]));

export const languageCode = (name: string | null): string | null => {
  const text = name ? key(name) : "";
  return text ? (languageByName.get(text) ?? null) : null;
};
