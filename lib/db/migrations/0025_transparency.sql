CREATE TABLE IF NOT EXISTS "pncp_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"pncp_control_number" text NOT NULL,
	"purchase_pncp_control_number" text NOT NULL,
	"purchase_tender_key" text NOT NULL,
	"tender_id" text,
	"cnpj" text NOT NULL,
	"year" integer NOT NULL,
	"sequence" integer NOT NULL,
	"contract_number" text,
	"contract_type_id" integer,
	"contract_type_name" text,
	"process_number" text,
	"organization_name" text NOT NULL,
	"purchasing_unit" text,
	"state" text,
	"city" text,
	"city_ibge_code" text,
	"supplier_type" text,
	"supplier_identifier" text,
	"supplier_name" text,
	"object" text,
	"initial_value" numeric(18, 4),
	"global_value" numeric(18, 4),
	"accumulated_value" numeric(18, 4),
	"installment_value" numeric(18, 4),
	"installment_count" integer,
	"signature_date" date,
	"valid_from" date,
	"valid_to" date,
	"published_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"source_global_updated_at" timestamp with time zone,
	"official_url" text,
	"search_text" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"results_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pncp_contracts_supplier_type_check" CHECK ("pncp_contracts"."supplier_type" is null or "pncp_contracts"."supplier_type" in ('PJ', 'PF', 'PE'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pncp_item_results" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_pncp_control_number" text NOT NULL,
	"purchase_tender_key" text NOT NULL,
	"tender_id" text,
	"cnpj" text NOT NULL,
	"purchase_year" integer NOT NULL,
	"purchase_sequence" integer NOT NULL,
	"item_number" integer NOT NULL,
	"result_sequence" integer NOT NULL,
	"status_id" integer NOT NULL,
	"status_name" text NOT NULL,
	"is_active" boolean NOT NULL,
	"supplier_type" text,
	"supplier_identifier" text,
	"supplier_name" text,
	"quantity_homologated" numeric(18, 4),
	"unit_value_homologated" numeric(18, 4),
	"total_value_homologated" numeric(18, 4),
	"discount_percent" numeric(9, 4),
	"rank_order_srp" integer,
	"result_date" date,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"source_included_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"official_url" text,
	"raw_payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pncp_item_results_supplier_type_check" CHECK ("pncp_item_results"."supplier_type" is null or "pncp_item_results"."supplier_type" in ('PJ', 'PF', 'PE'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pncp_contracts" ADD CONSTRAINT "pncp_contracts_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pncp_item_results" ADD CONSTRAINT "pncp_item_results_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pncp_contracts_control_uidx" ON "pncp_contracts" USING btree ("pncp_control_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_contracts_purchase_control_idx" ON "pncp_contracts" USING btree ("purchase_pncp_control_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_contracts_purchase_tender_key_idx" ON "pncp_contracts" USING btree ("purchase_tender_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_contracts_tender_id_idx" ON "pncp_contracts" USING btree ("tender_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_contracts_supplier_identifier_idx" ON "pncp_contracts" USING btree ("supplier_identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_contracts_supplier_name_idx" ON "pncp_contracts" USING btree ("supplier_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_contracts_published_at_idx" ON "pncp_contracts" USING btree ("published_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_contracts_source_updated_at_idx" ON "pncp_contracts" USING btree ("source_updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_contracts_fetched_at_idx" ON "pncp_contracts" USING btree ("fetched_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_contracts_results_checked_at_idx" ON "pncp_contracts" USING btree ("results_checked_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_contracts_search_text_trgm_idx" ON "pncp_contracts" USING gin ("search_text" gin_trgm_ops);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pncp_item_results_purchase_item_result_uidx" ON "pncp_item_results" USING btree ("purchase_pncp_control_number","item_number","result_sequence");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_item_results_purchase_tender_key_idx" ON "pncp_item_results" USING btree ("purchase_tender_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_item_results_tender_id_idx" ON "pncp_item_results" USING btree ("tender_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_item_results_supplier_identifier_idx" ON "pncp_item_results" USING btree ("supplier_identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_item_results_status_idx" ON "pncp_item_results" USING btree ("status_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_item_results_active_idx" ON "pncp_item_results" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pncp_item_results_fetched_at_idx" ON "pncp_item_results" USING btree ("fetched_at");
