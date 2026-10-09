import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db, tendersTable } from "@workspace/db";
import {
  municipalityCodesWithinRadius,
  statesForMacroregions,
  type ServiceRegionCoverage,
} from "./service-region";

const REMOTE_SLUGS = [
  "ti-telecom",
  "consultoria-tecnica",
  "educacao-capacitacao",
  "publicidade-comunicacao",
  "seguros-financeiros",
];

export async function countOpenTendersInServiceRegion(
  coverage: ServiceRegionCoverage,
  now = new Date(),
): Promise<number> {
  const locationFilter =
    coverage.scope === "national"
      ? undefined
      : (() => {
          const states = [
            ...new Set([
              ...coverage.states,
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
          const remote = coverage.acceptsRemote
            ? sql`${tendersTable.categories} @> any(array[${sql.join(
                REMOTE_SLUGS.map(
                  (slug) => sql`${JSON.stringify([{ slug }])}::jsonb`,
                ),
                sql`, `,
              )}])`
            : undefined;
          return or(
            ...(states.length ? [inArray(tendersTable.state, states)] : []),
            ...(municipalities.length
              ? [inArray(tendersTable.cityIbgeCode, municipalities)]
              : []),
            ...(remote ? [remote] : []),
          );
        })();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tendersTable)
    .where(
      and(
        eq(tendersTable.status, "open"),
        gt(tendersTable.proposalDeadline, now),
        locationFilter,
      ),
    );
  return Number(row?.count ?? 0);
}
