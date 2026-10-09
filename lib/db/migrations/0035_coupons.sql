CREATE TABLE "coupon_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code_hash" text NOT NULL,
  "code_last4" text NOT NULL,
  "duration_days" integer NOT NULL,
  "max_redemptions" integer DEFAULT 1 NOT NULL,
  "redeemed_count" integer DEFAULT 0 NOT NULL,
  "starts_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "coupon_codes_duration_days_check" CHECK ("coupon_codes"."duration_days" in (7, 30)),
  CONSTRAINT "coupon_codes_max_redemptions_check" CHECK ("coupon_codes"."max_redemptions" > 0),
  CONSTRAINT "coupon_codes_redeemed_count_check" CHECK ("coupon_codes"."redeemed_count" >= 0),
  CONSTRAINT "coupon_codes_redeemed_limit_check" CHECK ("coupon_codes"."redeemed_count" <= "coupon_codes"."max_redemptions"),
  CONSTRAINT "coupon_codes_window_check" CHECK ("coupon_codes"."expires_at" is null or "coupon_codes"."starts_at" is null or "coupon_codes"."expires_at" > "coupon_codes"."starts_at")
);
CREATE UNIQUE INDEX "coupon_codes_hash_uidx" ON "coupon_codes" USING btree ("code_hash");

CREATE TABLE "coupon_redemptions" (
  "coupon_id" text NOT NULL,
  "user_id" text NOT NULL,
  "redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "access_until" timestamp with time zone NOT NULL,
  CONSTRAINT "coupon_redemptions_coupon_id_coupon_codes_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "coupon_codes"("id") ON DELETE cascade,
  CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "coupon_redemptions_coupon_id_user_id_pk" PRIMARY KEY("coupon_id","user_id")
);
CREATE INDEX "coupon_redemptions_user_access_idx" ON "coupon_redemptions" USING btree ("user_id","access_until");
