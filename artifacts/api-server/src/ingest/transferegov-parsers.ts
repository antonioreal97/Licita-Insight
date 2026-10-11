import { Unzip, UnzipInflate } from "fflate";
import {
  dayFromText,
  endOfDay,
  federalDraft,
  mentionsCulture,
  startOfDay,
  todayInSaoPaulo,
  type FederalOpportunityDraft,
} from "./federal-draft";

export const TRANSFEREGOV_API =
  "https://api-publica.transferegov.gestao.gov.br";
/** Where a proponent signs in to send a proposal. The platform has no public page per programme. */
export const TRANSFEREGOV_PORTAL =
  "https://portal.transferegov.sistema.gov.br/portal/home";
export const TRANSFEREGOV_PARCERIAS_URL = `${TRANSFEREGOV_API}/parcerias/programa`;
export const TRANSFEREGOV_PROGRAMS_ZIP_URL = `${TRANSFEREGOV_API}/downloads/dadosgov/siconv_programa.zip`;
export const TRANSFEREGOV_DOWNLOADS_PAGE = `${TRANSFEREGOV_API}/downloads`;

const UF_COUNT = 27;

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
};

const brazilianDay = (day: string | null): string =>
  day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : "";

/** The CSV prints instruments in capitals and without accents. */
const INSTRUMENT_LABELS: Record<string, string> = {
  CONVENIO: "Convênio",
  "CONTRATO DE REPASSE": "Contrato de repasse",
  "CONVENIO OU CONTRATO DE REPASSE": "Convênio ou contrato de repasse",
  "TERMO DE FOMENTO": "Termo de fomento",
  "TERMO DE COLABORACAO": "Termo de colaboração",
  "TERMO DE COMPROMISSO": "Termo de compromisso",
  "TERMO DE PARCERIA": "Termo de parceria",
  "ACORDO DE COOPERACAO": "Acordo de cooperação",
};

const instrumentLabel = (value: string): string => {
  const known = INSTRUMENT_LABELS[value.toUpperCase()];
  if (known) return known;
  const lower = value.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
};

const PARTICLES = new Set([
  "a",
  "à",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "para",
]);

/** "MINISTERIO DA CULTURA" as "Ministerio da Cultura": the spelling stays the one the source publishes. */
const organizationLabel = (value: string): string =>
  value !== value.toLocaleUpperCase("pt-BR")
    ? value
    : value
        .toLocaleLowerCase("pt-BR")
        .split(" ")
        .map((word, index) =>
          index > 0 && PARTICLES.has(word)
            ? word
            : word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1),
        )
        .join(" ");

/** Fomento and tax-incentive instruments fund a project; the others are partnerships to deliver a public policy. */
const kindOf = (instruments: string[]): "funding" | "partnership" =>
  instruments.some((instrument) => /fomento|incentivo/i.test(instrument))
    ? "funding"
    : "partnership";

/** One UF fills the state filter; several or all of them leave the call national and are named in the text. */
const coverage = (
  ufs: string[],
): { state: string | null; sentence: string | null } => {
  if (ufs.length === 0) return { state: null, sentence: null };
  if (ufs.length === 1)
    return { state: ufs[0]!, sentence: `Abrangência: ${ufs[0]}.` };
  if (ufs.length >= UF_COUNT)
    return { state: null, sentence: "Abrangência: todas as UFs." };
  return { state: null, sentence: `Abrangência: ${ufs.join(", ")}.` };
};

export type ParceriasProgram = Record<string, unknown>;

/**
 * Gestão de Parcerias module (JSON API). A programme is a call only while it is "Disponibilizado" and the
 * window for spontaneous beneficiaries is still running; amendment and named-beneficiary windows are not
 * open to the public.
 */
export const mapParceriasProgram = (
  record: ParceriasProgram,
  now: Date,
): FederalOpportunityDraft | null => {
  const id =
    typeof record.id_programa === "number" ||
    typeof record.id_programa === "string"
      ? String(record.id_programa)
      : null;
  const title = text(record.nm_programa);
  if (!id || !/^\d+$/.test(id) || !title) return null;
  if (text(record.situacao_programa) !== "Disponibilizado") return null;
  const from = dayFromText(record.dt_inicio_beneficiario_espontaneo);
  const to = dayFromText(record.dt_fim_beneficiario_espontaneo);
  if (!to || to < todayInSaoPaulo(now)) return null;

  const instrument = text(record.tp_instrumento);
  const granting = text(record.nm_ente_repassador);
  const organizationName =
    text(record.nm_ente_superior) ?? granting ?? "Transferegov.br";
  const ufs = Array.isArray(record.ufs_habilitadas)
    ? [
        ...new Set(
          record.ufs_habilitadas.flatMap((uf) => {
            const sigla = text((uf as { sg_uf?: unknown } | null)?.sg_uf);
            return sigla ? [sigla.toUpperCase()] : [];
          }),
        ),
      ].sort()
    : [];
  const audiences = Array.isArray(record.programa_atende_a)
    ? record.programa_atende_a.flatMap((item) => {
        const value = text(
          (item as { tp_atende_a?: unknown } | null)?.tp_atende_a,
        );
        return value ? [value] : [];
      })
    : [];
  const code = text(record.cd_programa);
  const objective = text(record.ds_objetivo);
  const place = coverage(ufs);
  const amount =
    typeof record.nr_vlr_global === "number" ? record.nr_vlr_global : null;
  const cultural = mentionsCulture(
    organizationName,
    granting,
    title,
    objective,
  );
  return federalDraft({
    source: "transferegov",
    externalId: `parcerias-${id}`,
    kind: kindOf(instrument ? [instrument] : []),
    title,
    summary: [
      objective,
      place.sentence,
      code ? `Programa ${code} no Transferegov.br.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    organizationName,
    audience:
      audiences.length > 0
        ? audiences.join("; ")
        : text(record.ds_publico_alvo),
    amount,
    documents: [
      {
        title: "Registro do programa nos dados abertos do Transferegov.br",
        url: `${TRANSFEREGOV_PARCERIAS_URL}?id_programa=${id}`,
        mediaType: "application/json",
      },
    ],
    state: place.state,
    registrationFrom: startOfDay(from),
    registrationTo: endOfDay(to),
    cultural,
    opportunityType: instrument,
    sourceUrl: TRANSFEREGOV_PORTAL,
    searchExtras: [code, granting, ...ufs],
    raw: { module: "parcerias", record },
    now,
  });
};

/**
 * Minimal RFC 4180 reader fed in pieces: the programmes file is 350 MB once inflated and is never held
 * whole. Unquoted text is copied in runs, not character by character.
 */
export class CsvRowReader {
  private field = "";
  private row: string[] = [];
  private quoted = false;
  private quotePending = false;
  private started = false;
  private readonly delimiterCode: number;

  constructor(
    delimiter: string,
    private readonly onRow: (row: string[]) => void,
  ) {
    this.delimiterCode = delimiter.charCodeAt(0);
  }

  push(chunk: string): void {
    let input = chunk;
    if (!this.started && input.length > 0) {
      if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);
      this.started = true;
    }
    const QUOTE = 34;
    const NEWLINE = 10;
    const RETURN = 13;
    let runStart = 0;
    for (let index = 0; index < input.length; index += 1) {
      const code = input.charCodeAt(index);
      if (this.quoted) {
        if (this.quotePending) {
          this.quotePending = false;
          if (code === QUOTE) {
            // An escaped quote: keep one and go on inside the quoted field.
            runStart = index;
            continue;
          }
          this.quoted = false;
          runStart = index;
        } else {
          if (code === QUOTE) {
            this.field += input.slice(runStart, index);
            this.quotePending = true;
          }
          continue;
        }
      }
      if (code === this.delimiterCode) {
        this.row.push(this.field + input.slice(runStart, index));
        this.field = "";
        runStart = index + 1;
      } else if (code === NEWLINE) {
        this.field += input.slice(runStart, index);
        runStart = index + 1;
        this.flush();
      } else if (code === RETURN) {
        this.field += input.slice(runStart, index);
        runStart = index + 1;
      } else if (code === QUOTE && this.field === "" && runStart === index) {
        this.quoted = true;
        runStart = index + 1;
      }
    }
    // A closing quote seen as the last character of the piece has already been copied out.
    if (!this.quotePending) this.field += input.slice(runStart);
  }

  end(): void {
    if (this.field !== "" || this.row.length > 0) this.flush();
  }

  private flush(): void {
    this.row.push(this.field);
    this.field = "";
    this.quoted = false;
    this.quotePending = false;
    const row = this.row;
    this.row = [];
    if (row.length > 1 || row[0] !== "") this.onRow(row);
  }
}

const PROGRAM_COLUMNS = [
  "DESC_ORGAO_SUP_PROGRAMA",
  "ID_PROGRAMA",
  "COD_PROGRAMA",
  "NOME_PROGRAMA",
  "SIT_PROGRAMA",
  "DT_PROG_INI_RECEB_PROP",
  "DT_PROG_FIM_RECEB_PROP",
  "MODALIDADE_PROGRAMA",
  "NATUREZA_JURIDICA_PROGRAMA",
  "UF_PROGRAMA",
  "ACAO_ORCAMENTARIA",
] as const;
type ProgramColumn = (typeof PROGRAM_COLUMNS)[number];

type OpenProgram = {
  code: string;
  id: string;
  title: string;
  organizationName: string;
  from: string | null;
  to: string;
  budgetAction: string | null;
  instruments: Set<string>;
  audiences: Set<string>;
  ufs: Set<string>;
};

/**
 * `siconv_programa.csv` (Transferências Discricionárias e Legais) repeats a programme on one line per
 * instrument, kind of proponent and UF. Lines are folded by programme code, keeping only programmes that
 * are "DISPONIBILIZADO" and still inside the window for voluntary proposals.
 */
export class DiscricionariasPrograms {
  private columns: Record<ProgramColumn, number> | null = null;
  private readonly programs = new Map<string, OpenProgram>();
  rows = 0;

  constructor(private readonly now: Date) {}

  readonly accept = (row: string[]): void => {
    if (!this.columns) {
      const index = Object.fromEntries(
        PROGRAM_COLUMNS.map((name) => [name, row.indexOf(name)]),
      ) as Record<ProgramColumn, number>;
      const missing = PROGRAM_COLUMNS.filter((name) => index[name] < 0);
      if (missing.length > 0)
        throw new Error(
          `siconv_programa.csv sem as colunas esperadas: ${missing.join(", ")}`,
        );
      this.columns = index;
      return;
    }
    this.rows += 1;
    const cell = (name: ProgramColumn): string =>
      (row[this.columns![name]] ?? "").trim();
    if (cell("SIT_PROGRAMA") !== "DISPONIBILIZADO") return;
    const to = dayFromText(cell("DT_PROG_FIM_RECEB_PROP"));
    if (!to || to < todayInSaoPaulo(this.now)) return;
    const code = cell("COD_PROGRAMA");
    const title = cell("NOME_PROGRAMA");
    if (!/^\d+$/.test(code) || title === "") return;
    let program = this.programs.get(code);
    if (!program) {
      program = {
        code,
        id: cell("ID_PROGRAMA"),
        title,
        organizationName:
          organizationLabel(cell("DESC_ORGAO_SUP_PROGRAMA")) ||
          "Transferegov.br",
        from: dayFromText(cell("DT_PROG_INI_RECEB_PROP")),
        to,
        budgetAction: cell("ACAO_ORCAMENTARIA") || null,
        instruments: new Set(),
        audiences: new Set(),
        ufs: new Set(),
      };
      this.programs.set(code, program);
    }
    const instrument = cell("MODALIDADE_PROGRAMA");
    if (instrument) program.instruments.add(instrument);
    const audience = cell("NATUREZA_JURIDICA_PROGRAMA");
    if (audience) program.audiences.add(audience);
    const uf = cell("UF_PROGRAMA").toUpperCase();
    if (/^[A-Z]{2}$/.test(uf)) program.ufs.add(uf);
  };

  drafts(): FederalOpportunityDraft[] {
    if (!this.columns) throw new Error("siconv_programa.csv veio vazio");
    return [...this.programs.values()].map((program) => {
      const instruments = [...program.instruments].sort();
      const ufs = [...program.ufs].sort();
      const place = coverage(ufs);
      const instrumentNames =
        instruments.map(instrumentLabel).join(" / ") || null;
      return federalDraft({
        source: "transferegov",
        externalId: `programa-${program.code}`,
        kind: kindOf(instruments),
        title: program.title,
        summary: [
          `Recebimento de propostas voluntárias de ${brazilianDay(program.from) || "data não informada"} a ${brazilianDay(program.to)}.`,
          instrumentNames ? `Instrumento: ${instrumentNames}.` : null,
          place.sentence,
          `Programa ${program.code} no Transferegov.br.`,
        ]
          .filter(Boolean)
          .join(" "),
        organizationName: program.organizationName,
        audience: [...program.audiences].sort().join("; ") || null,
        documents: [
          {
            title:
              "Dados abertos do Transferegov.br — Transferências Discricionárias e Legais",
            url: TRANSFEREGOV_DOWNLOADS_PAGE,
            mediaType: "text/html",
          },
        ],
        state: place.state,
        registrationFrom: startOfDay(program.from),
        registrationTo: endOfDay(program.to),
        cultural: mentionsCulture(program.organizationName, program.title),
        opportunityType: instrumentNames,
        sourceUrl: TRANSFEREGOV_PORTAL,
        searchExtras: [program.code, program.budgetAction, ...ufs],
        raw: {
          module: "discricionarias",
          idPrograma: program.id,
          codPrograma: program.code,
          orgaoSuperior: program.organizationName,
          inicioRecebimentoPropostas: program.from,
          fimRecebimentoPropostas: program.to,
          acaoOrcamentaria: program.budgetAction,
          modalidades: instruments,
          naturezasJuridicas: [...program.audiences].sort(),
          ufs,
        },
        now: this.now,
      });
    });
  }
}

const ZIP_SLICE_BYTES = 32 * 1024;

/**
 * Inflates one CSV out of a zip and hands its rows over as they appear. Between slices it yields, so
 * the worker that also serves jobs is never held for the whole file.
 */
export const readCsvFromZip = async (
  zip: Uint8Array,
  entryName: RegExp,
  onRow: (row: string[]) => void,
  delimiter = ";",
): Promise<void> => {
  const decoder = new TextDecoder("utf-8");
  const reader = new CsvRowReader(delimiter, onRow);
  let found = false;
  let failure: unknown;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (found || !entryName.test(file.name)) return;
    found = true;
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      try {
        if (error) throw error;
        reader.push(decoder.decode(chunk, { stream: !final }));
        if (final) reader.end();
      } catch (caught) {
        failure = caught;
      }
    };
    file.start();
  };
  for (let offset = 0; offset < zip.length; offset += ZIP_SLICE_BYTES) {
    const end = Math.min(zip.length, offset + ZIP_SLICE_BYTES);
    unzip.push(zip.subarray(offset, end), end === zip.length);
    if (failure) throw failure;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (!found) throw new Error("O arquivo zip não trouxe o CSV esperado");
};
