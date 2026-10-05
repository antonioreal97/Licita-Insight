import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tendersTable } from "./tenders";

const money = (name: string) => numeric(name, { precision: 18, scale: 4 });

export const pncpContractsTable = pgTable(
  "pncp_contracts",
  {
    id: text("id").primaryKey(),
    pncpControlNumber: text("pncp_control_number").notNull(),
    purchasePncpControlNumber: text("purchase_pncp_control_number").notNull(),
    purchaseTenderKey: text("purchase_tender_key").notNull(),
    tenderId: text("tender_id").references(() => tendersTable.id, { onDelete: "set null" }),
    cnpj: text("cnpj").notNull(),
    year: integer("year").notNull(),
    sequence: integer("sequence").notNull(),
    contractNumber: text("contract_number"),
    contractTypeId: integer("contract_type_id"),
    contractTypeName: text("contract_type_name"),
    processNumber: text("process_number"),
    organizationName: text("organization_name").notNull(),
    purchasingUnit: text("purchasing_unit"),
    state: text("state"),
    city: text("city"),
    cityIbgeCode: text("city_ibge_code"),
    supplierType: text("supplier_type"),
    supplierIdentifier: text("supplier_identifier"),
    supplierName: text("supplier_name"),
    object: text("object"),
    initialValue: money("initial_value"),
    globalValue: money("global_value"),
    accumulatedValue: money("accumulated_value"),
    installmentValue: money("installment_value"),
    installmentCount: integer("installment_count"),
    signatureDate: date("signature_date", { mode: "string" }),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    sourceGlobalUpdatedAt: timestamp("source_global_updated_at", { withTimezone: true }),
    officialUrl: text("official_url"),
    searchText: text("search_text").notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    resultsCheckedAt: timestamp("results_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pncp_contracts_control_uidx").on(table.pncpControlNumber),
    index("pncp_contracts_purchase_control_idx").on(table.purchasePncpControlNumber),
    index("pncp_contracts_purchase_tender_key_idx").on(table.purchaseTenderKey),
    index("pncp_contracts_tender_id_idx").on(table.tenderId),
    index("pncp_contracts_supplier_identifier_idx").on(table.supplierIdentifier),
    index("pncp_contracts_supplier_name_idx").on(table.supplierName),
    index("pncp_contracts_published_at_idx").on(table.publishedAt),
    index("pncp_contracts_source_updated_at_idx").on(table.sourceUpdatedAt),
    index("pncp_contracts_fetched_at_idx").on(table.fetchedAt),
    index("pncp_contracts_results_checked_at_idx").on(table.resultsCheckedAt),
    index("pncp_contracts_search_text_trgm_idx").using(
      "gin",
      table.searchText.asc().op("gin_trgm_ops"),
    ),
    check(
      "pncp_contracts_supplier_type_check",
      sql`${table.supplierType} is null or ${table.supplierType} in ('PJ', 'PF', 'PE')`,
    ),
  ],
);

export const pncpItemResultsTable = pgTable(
  "pncp_item_results",
  {
    id: text("id").primaryKey(),
    purchasePncpControlNumber: text("purchase_pncp_control_number").notNull(),
    purchaseTenderKey: text("purchase_tender_key").notNull(),
    tenderId: text("tender_id").references(() => tendersTable.id, { onDelete: "set null" }),
    cnpj: text("cnpj").notNull(),
    purchaseYear: integer("purchase_year").notNull(),
    purchaseSequence: integer("purchase_sequence").notNull(),
    itemNumber: integer("item_number").notNull(),
    resultSequence: integer("result_sequence").notNull(),
    statusId: integer("status_id").notNull(),
    statusName: text("status_name").notNull(),
    isActive: boolean("is_active").notNull(),
    supplierType: text("supplier_type"),
    supplierIdentifier: text("supplier_identifier"),
    supplierName: text("supplier_name"),
    quantityHomologated: money("quantity_homologated"),
    unitValueHomologated: money("unit_value_homologated"),
    totalValueHomologated: money("total_value_homologated"),
    discountPercent: numeric("discount_percent", { precision: 9, scale: 4 }),
    rankOrderSrp: integer("rank_order_srp"),
    resultDate: date("result_date", { mode: "string" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    sourceIncludedAt: timestamp("source_included_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    officialUrl: text("official_url"),
    rawPayload: jsonb("raw_payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pncp_item_results_purchase_item_result_uidx").on(
      table.purchasePncpControlNumber,
      table.itemNumber,
      table.resultSequence,
    ),
    index("pncp_item_results_purchase_tender_key_idx").on(table.purchaseTenderKey),
    index("pncp_item_results_tender_id_idx").on(table.tenderId),
    index("pncp_item_results_supplier_identifier_idx").on(table.supplierIdentifier),
    index("pncp_item_results_status_idx").on(table.statusId),
    index("pncp_item_results_active_idx").on(table.isActive),
    index("pncp_item_results_fetched_at_idx").on(table.fetchedAt),
    check(
      "pncp_item_results_supplier_type_check",
      sql`${table.supplierType} is null or ${table.supplierType} in ('PJ', 'PF', 'PE')`,
    ),
  ],
);
