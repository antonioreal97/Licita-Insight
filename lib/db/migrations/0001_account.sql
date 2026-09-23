CREATE TABLE "users" (
  "id" text PRIMARY KEY NOT NULL,
  "google_sub" text,
  "email" text NOT NULL,
  "name" text,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_uidx" ON "users" USING btree ("google_sub") WHERE "google_sub" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE TABLE "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE TABLE "saved_tenders" (
  "user_id" text NOT NULL,
  "tender_id" text NOT NULL,
  "saved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "monitored" boolean DEFAULT false NOT NULL,
  "monitored_at" timestamp with time zone,
  CONSTRAINT "saved_tenders_user_id_tender_id_pk" PRIMARY KEY("user_id","tender_id"),
  CONSTRAINT "saved_tenders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "saved_tenders_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "saved_tenders_user_saved_at_idx" ON "saved_tenders" USING btree ("user_id","saved_at");
--> statement-breakpoint
CREATE INDEX "saved_tenders_monitored_tender_idx" ON "saved_tenders" USING btree ("tender_id") WHERE "monitored" = true;
--> statement-breakpoint
CREATE TABLE "saved_searches" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "query" text NOT NULL,
  "alerts_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_checked_at" timestamp with time zone,
  "new_matches_count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "saved_searches_user_updated_at_idx" ON "saved_searches" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE INDEX "saved_searches_alerts_idx" ON "saved_searches" USING btree ("alerts_enabled","last_checked_at") WHERE "alerts_enabled" = true;
--> statement-breakpoint
CREATE TABLE "notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "type" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "read_at" timestamp with time zone,
  "tender_id" text,
  "tender_title" text,
  "tender_number_short" text,
  "change" jsonb,
  "saved_search_id" text,
  "saved_search_name" text,
  "saved_search_query" text,
  "match_count" integer,
  "tender_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_uidx" ON "notifications" USING btree ("user_id","dedupe_key");
--> statement-breakpoint
CREATE INDEX "notifications_user_created_at_idx" ON "notifications" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","created_at") WHERE "read_at" is null;
