import { sql } from "drizzle-orm";
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
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { governedValuesTable } from "./taxonomy-governance";

export const activityTypeConfigurationsTable = pgTable("activity_type_configurations", {
  id: uuid("id").primaryKey().defaultRandom(),
  stableKey: text("stable_key").notNull(),
  displayName: text("display_name").notNull(),
  channelValueId: uuid("channel_value_id").references(() => governedValuesTable.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  questions: jsonb("questions").notNull().default(sql`'[]'::jsonb`),
  validations: jsonb("validations").notNull().default(sql`'{}'::jsonb`),
  namingTemplate: text("naming_template").notNull(),
  memberStatuses: jsonb("member_statuses").notNull().default(sql`'[]'::jsonb`),
  inheritableFields: text("inheritable_fields").array().notNull().default([]),
  permittedOverrides: text("permitted_overrides").array().notNull().default([]),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  publishedBy: text("published_by"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("activity_type_configuration_key_version_unique").on(table.stableKey, table.version),
  index("activity_type_configuration_status_idx").on(table.status, table.stableKey),
]);

export const campaignsTable = pgTable("campaigns", {
  campaignKey: uuid("campaign_key").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  campaignType: text("campaign_type").notNull(),
  relationshipType: text("relationship_type").notNull().default("new"),
  parentCampaignKey: uuid("parent_campaign_key").references((): any => campaignsTable.campaignKey, { onDelete: "restrict" }),
  copiedFromCampaignKey: uuid("copied_from_campaign_key").references((): any => campaignsTable.campaignKey, { onDelete: "restrict" }),
  status: text("status").notNull().default("draft"),
  objective: text("objective"),
  customerNeed: text("customer_need"),
  desiredAction: text("desired_action"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  isEvergreen: boolean("is_evergreen").notNull().default(false),
  reviewDate: date("review_date", { mode: "string" }),
  deliverySummary: text("delivery_summary"),
  setupData: jsonb("setup_data").notNull().default(sql`'{}'::jsonb`),
  issueSummary: jsonb("issue_summary").notNull().default(sql`'[]'::jsonb`),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  rowVersion: integer("row_version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("campaigns_status_dates_idx").on(table.status, table.startDate, table.endDate),
  index("campaigns_parent_idx").on(table.parentCampaignKey),
]);

export const campaignHistoryTable = pgTable("campaign_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignKey: uuid("campaign_key").notNull().references(() => campaignsTable.campaignKey, { onDelete: "restrict" }),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("campaign_history_campaign_idx").on(table.campaignKey, table.createdAt)]);

export const campaignActivitiesTable = pgTable("campaign_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignKey: uuid("campaign_key").notNull().references(() => campaignsTable.campaignKey, { onDelete: "restrict" }),
  parentActivityId: uuid("parent_activity_id").references((): any => campaignActivitiesTable.id, { onDelete: "restrict" }),
  configurationId: uuid("configuration_id").references(() => activityTypeConfigurationsTable.id, { onDelete: "restrict" }),
  configurationVersion: integer("configuration_version"),
  name: text("name").notNull(),
  activityType: text("activity_type"),
  owner: text("owner"),
  source: text("source"),
  platform: text("platform"),
  status: text("status").notNull().default("draft"),
  audienceTreatment: text("audience_treatment"),
  region: text("region"),
  language: text("language"),
  primaryCta: text("primary_cta"),
  landingDestination: text("landing_destination"),
  assetIds: text("asset_ids").array().notNull().default([]),
  externalIds: jsonb("external_ids").notNull().default(sql`'{}'::jsonb`),
  configurationAnswers: jsonb("configuration_answers").notNull().default(sql`'{}'::jsonb`),
  deliveryStartDate: date("delivery_start_date", { mode: "string" }).notNull(),
  deliveryEndDate: date("delivery_end_date", { mode: "string" }).notNull(),
  accountingDate: date("accounting_date", { mode: "string" }),
  channelValueId: uuid("channel_value_id").references(() => governedValuesTable.id, { onDelete: "restrict" }),
  authoritativeCostMinor: text("authoritative_cost_minor").notNull().default("0"),
  currency: text("currency").notNull(),
  rowVersion: integer("row_version").notNull().default(1),
  createdBy: text("created_by").notNull().default("public"),
  updatedBy: text("updated_by").notNull().default("public"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("campaign_activities_campaign_idx").on(table.campaignKey),
  index("campaign_activities_parent_idx").on(table.parentActivityId),
]);

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({
  campaignKey: true, submittedAt: true, rowVersion: true, createdAt: true, updatedAt: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
