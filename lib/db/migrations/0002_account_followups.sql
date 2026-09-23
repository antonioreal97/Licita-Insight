ALTER TABLE "saved_searches" ADD COLUMN "deleted_at" timestamp with time zone;
--> statement-breakpoint
WITH "ranked_searches" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "user_id", "query"
      ORDER BY "updated_at" DESC, "id" DESC
    ) AS "position"
  FROM "saved_searches"
)
UPDATE "saved_searches"
SET "deleted_at" = now()
FROM "ranked_searches"
WHERE "saved_searches"."id" = "ranked_searches"."id"
  AND "ranked_searches"."position" > 1;
--> statement-breakpoint
DROP INDEX "saved_searches_alerts_idx";
--> statement-breakpoint
CREATE INDEX "saved_searches_alerts_idx"
  ON "saved_searches" USING btree ("alerts_enabled", "last_checked_at")
  WHERE "alerts_enabled" = true AND "deleted_at" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "saved_searches_user_query_active_uidx"
  ON "saved_searches" USING btree ("user_id", "query")
  WHERE "deleted_at" is null;
