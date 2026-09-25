ALTER TABLE "users"
  ADD COLUMN "email_digest" text DEFAULT 'daily' NOT NULL,
  ADD COLUMN "email_immediate_critical" boolean DEFAULT true NOT NULL,
  ADD COLUMN "email_preferences_updated_at" timestamp with time zone,
  ADD COLUMN "email_unsubscribe_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  ADD CONSTRAINT "users_email_digest_check" CHECK ("email_digest" IN ('daily', 'off'));
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD COLUMN "tender_organization_name" text,
  ADD COLUMN "tender_proposal_deadline" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unsubscribe_uidx"
  ON "users" USING btree ("email_unsubscribe_id");
--> statement-breakpoint
CREATE TABLE "email_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "channel" text DEFAULT 'email' NOT NULL,
  "mode" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "recipient_email" text NOT NULL,
  "subject" text NOT NULL,
  "html_body" text NOT NULL,
  "text_body" text NOT NULL,
  "message_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "last_error" text,
  "provider_message_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  CONSTRAINT "email_deliveries_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "email_deliveries_channel_check" CHECK ("channel" = 'email'),
  CONSTRAINT "email_deliveries_mode_check" CHECK ("mode" IN ('digest', 'immediate')),
  CONSTRAINT "email_deliveries_status_check" CHECK ("status" IN ('queued', 'sent', 'failed', 'skipped')),
  CONSTRAINT "email_deliveries_attempts_check" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_dedupe_uidx"
  ON "email_deliveries" USING btree ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "email_deliveries_retry_idx"
  ON "email_deliveries" USING btree ("status", "next_attempt_at");
--> statement-breakpoint
CREATE INDEX "email_deliveries_user_created_idx"
  ON "email_deliveries" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE TABLE "email_delivery_notifications" (
  "delivery_id" text NOT NULL,
  "notification_id" text NOT NULL,
  CONSTRAINT "email_delivery_notifications_delivery_id_notification_id_pk"
    PRIMARY KEY ("delivery_id", "notification_id"),
  CONSTRAINT "email_delivery_notifications_delivery_id_email_deliveries_id_fk"
    FOREIGN KEY ("delivery_id") REFERENCES "public"."email_deliveries"("id") ON DELETE cascade,
  CONSTRAINT "email_delivery_notifications_notification_id_notifications_id_fk"
    FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_delivery_notifications_notification_uidx"
  ON "email_delivery_notifications" USING btree ("notification_id");
