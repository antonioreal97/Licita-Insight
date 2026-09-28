CREATE TABLE IF NOT EXISTS "beta_access_grants" (
  "email" text PRIMARY KEY NOT NULL,
  "access_until" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "beta_access_grants_email_lowercase_check" CHECK ("email" = lower("email"))
);
