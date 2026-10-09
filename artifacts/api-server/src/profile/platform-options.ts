import { pool } from "@workspace/db";
import { REGISTRATION_OPTIONS, SICAF_REGISTRY } from "../catalog/tender-platforms";

export type ProfilePlatform = {
  slug: string;
  label: string;
  url: string | null;
  kind: "platform" | "registry";
  /** Open tenders disputed in the room; null for SICAF, which is a registry, not a room. */
  openTenderCount: number | null;
};

export async function listProfilePlatforms(): Promise<ProfilePlatform[]> {
  const result = await pool.query<{ platform: string; count: number }>(
    `select platform, count(*)::int as count
       from tenders
      where status = 'open' and (proposal_deadline is null or proposal_deadline > now())
        and platform is not null
      group by platform`,
  );
  const counts = new Map(
    result.rows.map(({ platform, count }) => [platform, Number(count)]),
  );
  return REGISTRATION_OPTIONS.map((option) =>
    option.slug === SICAF_REGISTRY.slug
      ? { ...option, kind: "registry", openTenderCount: null }
      : { ...option, kind: "platform", openTenderCount: counts.get(option.slug) ?? 0 },
  );
}
