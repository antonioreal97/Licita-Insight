import { normalizeText } from "../domain/normalize";
import type { MapasInstallation } from "./cultural-installations";

/**
 * Who published a Mapas Culturais call. The owner of a call is an agent, and an agent is either a person
 * (`type` 1, "Individual") or an organization (`type` 2, "Coletivo"). The name of a person is personal data
 * and is never stored: see `docs/compliance/minimizacao-fontes-publicas.md`.
 */

/** Bump to make the stored-row review re-evaluate every Mapas row with the current rules. */
export const OWNER_REVIEW_VERSION = 2;

export type OwnerKind = "individual" | "collective" | "unknown";

/** Kept inside `raw_payload.ownerReview`: what was decided about the owner, with no personal data in it. */
export type OwnerReview = {
  version: number;
  ownerKind: OwnerKind;
  /** The source had an owner name and it was not stored. */
  nameWithheld: boolean;
  /** Published by a person, with no sign of a public call. Left out of the hub unless asked for. */
  individualListing: boolean;
  /** False while the kind was only read from a stored name and the source has not been asked yet. */
  sourceChecked: boolean;
};

type Entity = Record<string, unknown>;

export type OwnerSource = {
  owner?: unknown;
  ownerEntity?: unknown;
  ownerReview?: unknown;
};

export type OwnerResolution = {
  organizationName: string;
  originName: string | null;
  /** The publisher is treated as a person: contact details are cut from the texts as well. */
  personal: boolean;
  review: OwnerReview;
  /** `owner` and `ownerEntity` as they may be stored. */
  owner: Entity | null;
  ownerEntity: Entity | null;
};

const AGENT_TYPE_INDIVIDUAL = 1;
const AGENT_TYPE_COLLECTIVE = 2;

/**
 * Words that only an institution carries in its name. Accent-free, as `normalizeText` leaves them. Used only
 * when the source sent no agent type. The list is short on purpose: a sole proprietor is registered as
 * "<own name> Produções" or "Ateliê <own name>", so trade and arts words do not count.
 */
const ORGANIZATION_WORDS = new Set([
  "secretaria",
  "secult",
  "prefeitura",
  "municipio",
  "municipal",
  "estadual",
  "federal",
  "governo",
  "estado",
  "ministerio",
  "fundacao",
  "fundo",
  "instituto",
  "associacao",
  "coordenadoria",
  "coordenacao",
  "diretoria",
  "departamento",
  "superintendencia",
  "gerencia",
  "conselho",
  "comite",
  "comissao",
  "camara",
  "universidade",
  "faculdade",
  "museu",
  "biblioteca",
  "sesc",
  "senac",
  "sesi",
  "sebrae",
  "sindicato",
  "federacao",
  "cooperativa",
  "consorcio",
  "ong",
  "oscip",
  "ltda",
  "eireli",
]);

const NAME_CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e", "di"]);

/** Vocabulary of a public call: the instrument or the public funding law behind it. */
const CALL_WORDS = new Set([
  "edital",
  "editais",
  "chamamento",
  "credenciamento",
  "concurso",
  "premio",
  "premiacao",
  "convocatoria",
  "licitacao",
  "pnab",
  "lpg",
  "fomento",
]);
const CALL_PHRASES = [
  "chamada publica",
  "selecao publica",
  "aldir blanc",
  "paulo gustavo",
  "termo de execucao cultural",
];
const PUBLIC_BODY_WORDS = new Set([
  "prefeitura",
  "secretaria",
  "secult",
  "municipal",
  "municipio",
  "estadual",
  "governo",
  "fundacao",
  "conselho",
  "fundo",
  "ministerio",
]);
/** A title that says the record is a trial of the form, not a call. */
const TEST_WORDS = new Set(["teste", "testes", "test", "testando", "rascunho"]);

const CPF = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g;
const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi;
/** Brazilian phone with area code: "(85) 99999-9999", "85 3101 1234". */
const PHONE = /(?<!\d)\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\d)/g;
const REDACTED = "[contato removido]";

const asText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const asEntity = (value: unknown): Entity | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Entity)
    : null;

const words = (value: string): string[] =>
  normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const hasAny = (value: string, vocabulary: Set<string>): boolean =>
  words(value).some((word) => vocabulary.has(word));

export const hasOrganizationSignal = (name: string): boolean =>
  hasAny(name, ORGANIZATION_WORDS);

/** Two to seven plain words and nothing that says "organization": the shape of a person's name. */
export const looksLikePersonName = (name: string): boolean => {
  if (hasOrganizationSignal(name)) return false;
  const parts = words(name).filter((word) => !NAME_CONNECTORS.has(word));
  return (
    parts.length >= 2 &&
    parts.length <= 7 &&
    parts.every((word) => /^[a-z]+$/.test(word))
  );
};

const matches = (pattern: RegExp, value: string): boolean => {
  pattern.lastIndex = 0;
  return pattern.test(value);
};

/**
 * First word of a public body's name. Some secretariats and city halls are registered in Mapas as an
 * "Individual" agent; a name that starts like this is an institution, not a person, so it may be stored.
 */
const PUBLIC_BODY_PREFIXES = new Set([
  "secretaria",
  "secult",
  "prefeitura",
  "municipio",
  "governo",
  "fundacao",
  "instituto",
  "coordenadoria",
  "coordenacao",
  "conselho",
  "camara",
  "departamento",
  "diretoria",
  "superintendencia",
  "gerencia",
  "assessoria",
  "ministerio",
  "fundo",
  "sistema",
  "museu",
  "biblioteca",
  "arquivo",
  "centro",
  "teatro",
  "universidade",
  "autarquia",
  "agencia",
  "orgao",
]);

/** A name that opens with a public body word ("Secretaria Municipal de…", "Prefeitura de…"). */
export const startsAsPublicBody = (name: string): boolean => {
  const first = normalizeText(name).split(/[^a-z0-9]+/).find(Boolean);
  return first !== undefined && PUBLIC_BODY_PREFIXES.has(first);
};

/** CPF, e-mail or phone inside a name: a sole proprietor registered with their own documents. */
export const hasPersonalIdentifier = (value: string): boolean =>
  matches(CPF, value) || matches(EMAIL, value) || matches(PHONE, value);

/** Cuts e-mail, phone and CPF from a text published by a person. */
export const redactContacts = (value: string): string =>
  value
    .replace(EMAIL, REDACTED)
    .replace(CPF, REDACTED)
    .replace(PHONE, REDACTED);

/** Agent type as Mapas sends it: `{ id: 1, name: "Individual" }`. Older installs send only the id. */
export const agentKind = (type: unknown): OwnerKind => {
  const entity = asEntity(type);
  const id = entity ? entity.id : type;
  if (id === AGENT_TYPE_INDIVIDUAL || id === String(AGENT_TYPE_INDIVIDUAL))
    return "individual";
  if (id === AGENT_TYPE_COLLECTIVE || id === String(AGENT_TYPE_COLLECTIVE))
    return "collective";
  return agentKindByName(type);
};

const agentKindByName = (type: unknown): OwnerKind => {
  const label = asText(asEntity(type)?.name ?? type);
  const normalized = label ? normalizeText(label) : "";
  if (normalized === "individual") return "individual";
  if (normalized === "coletivo") return "collective";
  return "unknown";
};

export const individualLabel = (
  installation: Pick<MapasInstallation, "name">,
): string => `Proponente individual (${installation.name})`;

const sameName = (left: string | null, right: string | null): boolean =>
  left !== null &&
  right !== null &&
  normalizeText(left) === normalizeText(right);

const sameId = (left: unknown, right: unknown): boolean =>
  left !== null && left !== undefined && String(left) === String(right);

const entityType = (entity: Entity | null): string | null =>
  asText(entity?.["@entityType"])?.toLowerCase() ?? null;

const priorReview = (value: unknown): Partial<OwnerReview> | null =>
  asEntity(value) as Partial<OwnerReview> | null;

/**
 * The project, space, event or organization the call hangs from, when its name may be stored. `ownerEntity`
 * is polymorphic: when it is an agent it can be the same person who owns the call, and Mapas sends no agent
 * type for it, so an agent is kept only when it is the owner (already judged) or its name is an organization's.
 */
const linkedEntity = (
  value: unknown,
  owner: { id: unknown; name: string | null; kept: boolean },
): Entity | null => {
  const entity = asEntity(value);
  const name = asText(entity?.name);
  if (!entity || !name || hasPersonalIdentifier(name)) return null;
  if (!owner.kept && sameName(name, owner.name)) return null;

  const declared = entityType(entity);
  const typeKind = agentKindByName(entity.type);
  const isAgent =
    declared === "agent" || (declared === null && typeKind !== "unknown");
  // Ids of agents and projects come from different tables, so an id alone does not say "same agent".
  const isOwner =
    sameId(entity.id, owner.id) &&
    (isAgent || (declared === null && sameName(name, owner.name)));
  const kept = isOwner
    ? owner.kept
    : isAgent
      ? typeKind === "collective" ||
        (typeKind === "unknown" && hasOrganizationSignal(name))
      : declared !== null || !looksLikePersonName(name);
  if (!kept) return null;

  return {
    id: entity.id ?? null,
    name,
    ...(declared ? { "@entityType": declared } : {}),
    ...(entity.type !== undefined ? { type: entity.type } : {}),
  };
};

/** What stays of a linked entity whose name is not stored: only its class. */
const withheldEntity = (value: unknown): Entity | null => {
  const entity = asEntity(value);
  if (!entity) return null;
  const declared = entityType(entity);
  return declared ? { "@entityType": declared } : {};
};

/** True when the texts name a public instrument, a public funding law or a public body. */
export const mentionsPublicCall = (...texts: Array<string | null>): boolean => {
  const text = normalizeText(texts.filter(Boolean).join(" "));
  const tokens = text.split(/[^a-z0-9]+/);
  return (
    tokens.some(
      (word) => CALL_WORDS.has(word) || PUBLIC_BODY_WORDS.has(word),
    ) || CALL_PHRASES.some((phrase) => text.includes(phrase))
  );
};

/**
 * Decides what may be stored about the publisher of a call and whether the call belongs in the hub.
 *
 * - Organization: its name is the institution.
 * - Person, or no agent type and a name that is not clearly an organization's: the name is never stored.
 *   The institution is the linked project, space or organization, or a neutral label.
 * - A person's call with no public instrument, funding law or public body in its text, or whose title says
 *   it is a test, is an individual listing (classes, private workshops, form trials), not a public call.
 */
export const resolveOwner = (
  source: OwnerSource,
  installation: Pick<MapasInstallation, "name">,
  texts: { title: string; summary: string | null },
  options: { fromSource?: boolean } = {},
): OwnerResolution => {
  const owner = asEntity(source.owner);
  const prior = priorReview(source.ownerReview);
  const name = asText(owner?.name);
  const kind = owner ? agentKind(owner.type) : "unknown";

  const kept =
    name !== null &&
    !hasPersonalIdentifier(name) &&
    (kind === "collective" ||
      (kind === "unknown" && hasOrganizationSignal(name)) ||
      // Public bodies registered as an "Individual" agent keep their name.
      (kind === "individual" && startsAsPublicBody(name)));
  // A row minimized before carries no name: what was decided then still stands.
  const nameWithheld = name !== null ? !kept : prior?.nameWithheld === true;
  const personal = kind === "individual" || nameWithheld;

  const linked = linkedEntity(source.ownerEntity, {
    id: owner?.id,
    name,
    kept,
  });
  const linkedName = asText(linked?.name);
  const originName =
    linkedName && !sameName(linkedName, texts.title) ? linkedName : null;

  const isTest = hasAny(texts.title, TEST_WORDS);
  const individualListing =
    personal &&
    (isTest || !mentionsPublicCall(texts.title, texts.summary, originName));

  return {
    organizationName: kept
      ? name
      : personal
        ? (originName ?? individualLabel(installation))
        : installation.name,
    originName,
    personal,
    review: {
      version: OWNER_REVIEW_VERSION,
      ownerKind: kind,
      nameWithheld,
      individualListing,
      sourceChecked:
        options.fromSource !== false ||
        kind !== "unknown" ||
        prior?.sourceChecked === true,
    },
    owner: owner
      ? {
          ...(kept ? { id: owner.id ?? null, name } : {}),
          ...(owner.type !== undefined ? { type: owner.type } : {}),
        }
      : null,
    ownerEntity: linked ?? withheldEntity(source.ownerEntity),
  };
};

/** Reads the decision back from a stored `raw_payload`. */
export const storedOwnerReview = (rawPayload: unknown): OwnerReview | null => {
  const review = asEntity(asEntity(rawPayload)?.ownerReview);
  if (!review || typeof review.version !== "number") return null;
  return review as OwnerReview;
};
