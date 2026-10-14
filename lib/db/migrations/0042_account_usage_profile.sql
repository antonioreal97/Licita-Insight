ALTER TABLE "users"
  ADD COLUMN "usage_purposes" text[] DEFAULT '{}'::text[] NOT NULL,
  ADD COLUMN "applicant_types" text[] DEFAULT '{}'::text[] NOT NULL,
  ADD COLUMN "usage_invite_dismissed" boolean DEFAULT false NOT NULL;

ALTER TABLE "users"
  ADD CONSTRAINT "users_usage_purposes_check"
    CHECK ("usage_purposes" <@ ARRAY['procurement','culture','funding','research','study']::text[]),
  ADD CONSTRAINT "users_applicant_types_check"
    CHECK ("applicant_types" <@ ARRAY['individual','mei','company','nonprofit']::text[]);
