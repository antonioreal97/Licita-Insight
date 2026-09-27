CREATE TABLE "subscriptions" (
  "user_id" text PRIMARY KEY NOT NULL,
  "status" text NOT NULL,
  "asaas_customer_id" text,
  "asaas_payment_link_id" text,
  "asaas_checkout_url" text,
  "asaas_subscription_id" text,
  "current_period_end" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "subscriptions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_payment_link_uidx"
  ON "subscriptions" USING btree ("asaas_payment_link_id")
  WHERE "asaas_payment_link_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_asaas_subscription_uidx"
  ON "subscriptions" USING btree ("asaas_subscription_id")
  WHERE "asaas_subscription_id" is not null;
--> statement-breakpoint
CREATE INDEX "subscriptions_asaas_customer_idx"
  ON "subscriptions" USING btree ("asaas_customer_id");
