import { pool } from "@workspace/db";
import { normalizeText } from "../domain/normalize";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { logger } from "../lib/logger";
import { millisecondsUntilSaoPauloHour } from "../lib/sao-paulo-schedule";
import {
  installationById,
  type MapasInstallation,
} from "./cultural-installations";
import {
  fetchOpportunitiesByIds,
  MAX_IDS_PER_REQUEST,
  type MapasFetcher,
} from "./mapas-client";
import {
  mapOpportunity,
  type MapasOpportunity,
  type OpportunityDraft,
} from "./opportunity-map";
import { OWNER_REVIEW_VERSION, type OwnerReview } from "./opportunity-owner";

/**
 * Rows stored before the collector asked for the agent type carry the name of whoever published the call,
 * person or not. This job re-evaluates them: first from what is stored, with no network, so a person's name
 * is gone in the first run; then by asking the source for the agent type, in small batches, so the name of an
 * organization that the first step could not recognize comes back. Both steps skip rows already done.
 */

type StoredRow = {
  id: string;
  installation_id: string;
  external_id: string;
  title: string;
  summary: string | null;
  organization_name: string;
  origin_name: string | null;
  state: string | null;
  city: string | null;
  raw_payload: unknown;
};

const STORED_COLUMNS =
  "id, installation_id, external_id, title, summary, organization_name, origin_name, state, city, raw_payload";

const reviewed = `raw_payload #>> '{ownerReview,version}' = '${OWNER_REVIEW_VERSION}'`;
const awaitingSource = `source = 'mapas' and ${reviewed}
  and raw_payload #>> '{ownerReview,ownerKind}' = 'unknown'
  and raw_payload #>> '{ownerReview,sourceChecked}' = 'false'`;

/** The install a row came from. A row of an install that left the list still gets a neutral label. */
const installationOf = (row: StoredRow): MapasInstallation => {
  const known = installationById(row.installation_id);
  if (known?.kind === "mapas") return known;
  return {
    id: row.installation_id,
    uf: row.state ?? "BR",
    name: "Mapas Culturais",
    kind: "mapas",
    scope: "state",
    ...(row.city ? { city: row.city } : {}),
    baseUrl: "",
  };
};

const withheldReview = (): OwnerReview => ({
  version: OWNER_REVIEW_VERSION,
  ownerKind: "unknown",
  nameWithheld: true,
  individualListing: false,
  sourceChecked: true,
});

type OwnerFields = {
  title: string;
  summary: string | null;
  organizationName: string;
  originName: string | null;
  searchText: string;
  raw: Record<string, unknown>;
};

/** Owner-dependent fields of a stored row, from its own `raw_payload` and nothing else. */
export const reviewStoredRow = (row: StoredRow, now: Date): OwnerFields => {
  const installation = installationOf(row);
  const stored =
    row.raw_payload && typeof row.raw_payload === "object"
      ? (row.raw_payload as MapasOpportunity & Record<string, unknown>)
      : {};
  const draft = mapOpportunity(
    {
      ...stored,
      id: row.external_id,
      name: stored.name ?? row.title,
      shortDescription: stored.shortDescription ?? row.summary,
      // Later phases and templates stored by older versions are reviewed like any other row.
      parent: null,
      isModel: null,
    },
    installation,
    now,
    { fromSource: false },
  );
  if (!draft) {
    // Nothing usable is stored about the owner: keep the call, drop whatever the payload had.
    return {
      title: row.title,
      summary: row.summary,
      organizationName: installation.name,
      originName: null,
      searchText: normalizeText(
        [row.title, row.summary, installation.name, row.state, row.city]
          .filter(Boolean)
          .join(" "),
      ),
      raw: { id: row.external_id, ownerReview: withheldReview() },
    };
  }
  return {
    ...ownerFieldsOf(draft),
    raw: {
      ...draft.raw,
      ...(stored.parent !== undefined ? { parent: stored.parent } : {}),
      ...(stored.isModel !== undefined ? { isModel: stored.isModel } : {}),
    },
  };
};

const ownerFieldsOf = (draft: OpportunityDraft): OwnerFields => ({
  title: draft.title,
  summary: draft.summary,
  organizationName: draft.organizationName,
  originName: draft.originName,
  searchText: draft.searchText,
  raw: draft.raw,
});

/** Writes the owner-dependent fields only. Dates, status and areas of the row stay as they are. */
async function storeOwnerFields(
  row: StoredRow,
  fields: OwnerFields,
  now: Date,
): Promise<boolean> {
  const changed =
    fields.organizationName !== row.organization_name ||
    fields.originName !== row.origin_name ||
    fields.title !== row.title ||
    fields.summary !== row.summary;
  await pool.query(
    `update cultural_opportunities
     set title = $2, summary = $3, organization_name = $4, origin_name = $5, search_text = $6,
         raw_payload = $7::jsonb, updated_at = case when $8 then $9 else updated_at end
     where id = $1`,
    [
      row.id,
      fields.title,
      fields.summary,
      fields.organizationName,
      fields.originName,
      fields.searchText,
      JSON.stringify(fields.raw),
      changed,
      now,
    ],
  );
  return changed;
}

export type StoredReviewResult = {
  scanned: number;
  /** Rows whose institution, origin or text changed. */
  changed: number;
  /** Rows whose owner name is no longer stored. */
  namesWithheld: number;
  individualListings: number;
  /** Rows of other sources that lost a copy of the page text. */
  pageTextsRemoved: number;
};

const reviewOf = (fields: OwnerFields): OwnerReview =>
  fields.raw.ownerReview as OwnerReview;

/**
 * Step 1, no network: every Mapas row not yet reviewed under the current rules. `dryRun` only counts.
 * Idempotent: a reviewed row is not selected again.
 */
export async function reviewStoredOwners(
  options: {
    now?: Date;
    batch?: number;
    dryRun?: boolean;
    shouldStop?: () => boolean;
  } = {},
): Promise<StoredReviewResult> {
  const now = options.now ?? new Date();
  const batch = Math.max(1, Math.min(1_000, options.batch ?? 200));
  const totals: StoredReviewResult = {
    scanned: 0,
    changed: 0,
    namesWithheld: 0,
    individualListings: 0,
    pageTextsRemoved: 0,
  };
  let afterId = "";
  for (;;) {
    if (options.shouldStop?.()) return totals;
    const { rows } = await pool.query<StoredRow>(
      `select ${STORED_COLUMNS}
       from cultural_opportunities
       where source = 'mapas' and id > $1 and not coalesce(${reviewed}, false)
       order by id
       limit $2`,
      [afterId, batch],
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const fields = reviewStoredRow(row, now);
      const review = reviewOf(fields);
      totals.scanned += 1;
      if (review.nameWithheld) totals.namesWithheld += 1;
      if (review.individualListing) totals.individualListings += 1;
      if (options.dryRun) {
        if (
          fields.organizationName !== row.organization_name ||
          fields.originName !== row.origin_name ||
          fields.title !== row.title ||
          fields.summary !== row.summary
        )
          totals.changed += 1;
      } else if (await storeOwnerFields(row, fields, now)) {
        totals.changed += 1;
      }
    }
    afterId = rows.at(-1)!.id;
  }

  // The funding collectors used to keep the whole text of the call page, which can name people.
  const pageTexts = options.dryRun
    ? await pool.query(
        `select 1 from cultural_opportunities where source <> 'mapas' and raw_payload ? 'text'`,
      )
    : await pool.query(
        `update cultural_opportunities set raw_payload = raw_payload - 'text'
         where source <> 'mapas' and raw_payload ? 'text'`,
      );
  totals.pageTextsRemoved = pageTexts.rowCount ?? 0;
  return totals;
}

export type SourceReviewResult = {
  asked: number;
  /** Rows the source answered for, now carrying the owner kind it declares. */
  answered: number;
  /** Rows the source no longer publishes: they keep what step 1 decided. */
  gone: number;
  namesRestored: number;
  failedInstallations: string[];
};

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const markSourceChecked = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  await pool.query(
    `update cultural_opportunities
     set raw_payload = jsonb_set(raw_payload, '{ownerReview,sourceChecked}', 'true'::jsonb)
     where id = any($1::text[])`,
    [ids],
  );
};

/**
 * Step 2, network: asks each install for the rows whose owner kind step 1 could only read from a name.
 * One request per `MAX_IDS_PER_REQUEST` rows, at the collector's pace. An install that fails keeps its rows
 * for the next run; `skip` leaves out installs the collector found blocked or switched off.
 */
export async function reviewOwnersAtSource(
  options: {
    now?: Date;
    fetcher?: MapasFetcher;
    maxRows?: number;
    skip?: (installationId: string) => boolean;
    shouldStop?: () => boolean;
  } = {},
): Promise<SourceReviewResult> {
  const now = options.now ?? new Date();
  const { rows } = await pool.query<StoredRow>(
    `select ${STORED_COLUMNS}
     from cultural_opportunities
     where ${awaitingSource}
     order by installation_id, id
     limit $1`,
    [Math.max(1, options.maxRows ?? 2_000)],
  );
  const totals: SourceReviewResult = {
    asked: 0,
    answered: 0,
    gone: 0,
    namesRestored: 0,
    failedInstallations: [],
  };
  const byInstallation = new Map<string, StoredRow[]>();
  for (const row of rows) {
    byInstallation.set(row.installation_id, [
      ...(byInstallation.get(row.installation_id) ?? []),
      row,
    ]);
  }

  for (const [installationId, stored] of byInstallation) {
    if (options.shouldStop?.()) break;
    const installation = installationById(installationId);
    if (installation?.kind !== "mapas") {
      // The install left the list: there is no source to ask.
      await markSourceChecked(stored.map((row) => row.id));
      totals.gone += stored.length;
      continue;
    }
    if (options.skip?.(installationId)) continue;

    for (const group of chunks(stored, MAX_IDS_PER_REQUEST)) {
      if (options.shouldStop?.()) break;
      let drafts: Map<string, OpportunityDraft>;
      try {
        drafts = await fetchOpportunitiesByIds(
          installation,
          group.map((row) => row.external_id),
          now,
          { fetcher: options.fetcher },
        );
      } catch (error) {
        logger.warn(
          { err: error, installationId },
          "Owner review could not read the source; the rows stay for the next run",
        );
        totals.failedInstallations.push(installationId);
        break;
      }
      totals.asked += group.length;
      const missing: string[] = [];
      for (const row of group) {
        const draft = drafts.get(row.external_id);
        if (!draft) {
          missing.push(row.id);
          continue;
        }
        const wasWithheld = (
          row.raw_payload as { ownerReview?: OwnerReview } | null
        )?.ownerReview?.nameWithheld;
        await storeOwnerFields(row, ownerFieldsOf(draft), now);
        totals.answered += 1;
        if (wasWithheld && !draft.raw.ownerReview.nameWithheld)
          totals.namesRestored += 1;
      }
      await markSourceChecked(missing);
      totals.gone += missing.length;
    }
  }
  return totals;
}

const pendingReview = async (): Promise<boolean> => {
  const { rows } = await pool.query<{ pending: boolean }>(
    `select exists (
       select 1 from cultural_opportunities
       where (source = 'mapas' and not coalesce(${reviewed}, false))
          or (${awaitingSource})
          or (source <> 'mapas' and raw_payload ? 'text')
     ) as pending`,
  );
  return rows[0]?.pending === true;
};

const OWNER_REVIEW_HOUR = 7;

export type OwnerReviewResult = {
  stored: StoredReviewResult;
  source: SourceReviewResult | null;
};

/** Both steps under one lock. The network step runs only where the Mapas collection itself is on. */
export async function runOpportunityOwnerReview(
  reason: string,
  shouldStop?: () => boolean,
): Promise<OwnerReviewResult | null> {
  if (!(await pendingReview())) {
    logger.info(
      { reason },
      "Opportunity owner review skipped: nothing pending",
    );
    return null;
  }
  const result = await tryRunSingletonJob(
    "opportunity_owner_review",
    async (): Promise<OwnerReviewResult> => {
      const stored = await reviewStoredOwners({ shouldStop });
      if (process.env.CULTURE_DAILY_COLLECT === "false") {
        return { stored, source: null };
      }
      const { getLatestCultureIngest } =
        await import("./collect-opportunities");
      const unreachable = new Set(
        (await getLatestCultureIngest()).coverage
          .filter(
            (row) => row.outcome === "blocked" || row.outcome === "disabled",
          )
          .map((row) => row.id),
      );
      const source = await reviewOwnersAtSource({
        skip: (installationId) => unreachable.has(installationId),
        shouldStop,
      });
      return { stored, source };
    },
  );
  if (!result.acquired) {
    logger.info(
      { reason },
      "Opportunity owner review skipped: another worker holds the lock",
    );
    return null;
  }
  logger.info({ reason, ...result.value }, "Opportunity owner review finished");
  return result.value;
}

/** Runs once at startup and daily at 07:00 (São Paulo), after the 06:00 Mapas collection. */
export function startOpportunityOwnerReviewScheduler(): () => void {
  if (!process.env.DATABASE_URL) {
    logger.error(
      "DATABASE_URL is not set; opportunity owner review will not start",
    );
    return () => undefined;
  }
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const run = (reason: string) =>
    runOpportunityOwnerReview(reason, () => stopped).catch((error) =>
      logger.error({ err: error, reason }, "Opportunity owner review failed"),
    );
  const arm = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      void run("schedule").finally(arm);
    }, millisecondsUntilSaoPauloHour(OWNER_REVIEW_HOUR));
    timer.unref();
  };
  void run("startup");
  arm();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
