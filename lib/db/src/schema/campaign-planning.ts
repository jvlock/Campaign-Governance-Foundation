import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { governedValuesTable } from "./taxonomy-governance";
import { campaignActivitiesTable, campaignsTable } from "./campaign-registry";

export const campaignAudienceSelectionsTable = pgTable("campaign_audience_selections", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignKey: uuid("campaign_key").notNull().references(() => campaignsTable.campaignKey, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(),
  governedValueId: uuid("governed_value_id").references(() => governedValuesTable.id, { onDelete: "restrict" }),
  unresolvedLabel: text("unresolved_label"),
  isPrimary: boolean("is_primary").notNull().default(false),
  rawRepresentativeTitle: text("raw_representative_title"),
  estimatedAudienceCount: integer("estimated_audience_count"),
  measurementBasis: text("measurement_basis"),
  warningCodes: text("warning_codes").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("campaign_audience_value_unique").on(table.campaignKey, table.dimension, table.governedValueId),
  index("campaign_audience_dimension_idx").on(table.campaignKey, table.dimension),
]);

export const messagingCohortVersionsTable = pgTable("messaging_cohort_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  governedValueId: uuid("governed_value_id").notNull().references(() => governedValuesTable.id, { onDelete: "restrict" }),
  version: text("version").notNull(),
  inclusionRules: text("inclusion_rules").notNull(),
  exclusionRules: text("exclusion_rules").notNull(),
  valueProposition: text("value_proposition").notNull(),
  effectiveStart: date("effective_start", { mode: "string" }).notNull(),
  effectiveEnd: date("effective_end", { mode: "string" }),
  source: text("source").notNull(),
  owner: text("owner").notNull(),
  eligibleChannelValueIds: uuid("eligible_channel_value_ids").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("messaging_cohort_version_unique").on(table.governedValueId, table.version)]);

export const campaignProductAssociationsTable = pgTable("campaign_product_associations", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignKey: uuid("campaign_key").notNull().references(() => campaignsTable.campaignKey, { onDelete: "cascade" }),
  productValueId: uuid("product_value_id").notNull().references(() => governedValuesTable.id, { onDelete: "restrict" }),
  role: text("role").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("campaign_product_role_unique").on(table.campaignKey, table.productValueId, table.role)]);

export const activityProductAssociationsTable = pgTable("activity_product_associations", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").notNull().references(() => campaignActivitiesTable.id, { onDelete: "cascade" }),
  productValueId: uuid("product_value_id").notNull().references(() => governedValuesTable.id, { onDelete: "restrict" }),
}, (table) => [uniqueIndex("activity_product_unique").on(table.activityId, table.productValueId)]);

export const campaignCostsTable = pgTable("campaign_costs", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignKey: uuid("campaign_key").notNull().references(() => campaignsTable.campaignKey, { onDelete: "restrict" }),
  description: text("description").notNull(),
  authoritativeAmountMinor: text("authoritative_amount_minor").notNull(),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("campaign_cost_campaign_idx").on(table.campaignKey)]);

export const campaignCostDimensionsTable = pgTable("campaign_cost_dimensions", {
  id: uuid("id").primaryKey().defaultRandom(),
  costId: uuid("cost_id").notNull().references(() => campaignCostsTable.id, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(),
  dimensionKey: text("dimension_key").notNull(),
  allocationBasisPoints: integer("allocation_basis_points").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
}, (table) => [uniqueIndex("campaign_cost_dimension_unique").on(table.costId, table.dimension, table.dimensionKey)]);
