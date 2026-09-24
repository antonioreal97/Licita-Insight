ALTER TABLE "users"
  ADD COLUMN "trial_ends_at" timestamp with time zone
  DEFAULT (now() + interval '7 days') NOT NULL;
--> statement-breakpoint
CREATE TABLE "google_trial_tombstones" (
  "subject_hash" text PRIMARY KEY NOT NULL,
  "trial_ends_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
