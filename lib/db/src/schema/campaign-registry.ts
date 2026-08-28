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
  name: text("name").notNull(),
  deliveryStartDate: date("delivery_start_date", { mode: "string" }).notNull(),
  deliveryEndDate: date("delivery_end_date", { mode: "string" }).notNull(),
  accountingDate: date("accounting_date", { mode: "string" }),
  channelValueId: uuid("channel_value_id").references(() => governedValuesTable.id, { onDelete: "restrict" }),
  authoritativeCostMinor: text("authoritative_cost_minor").notNull().default("0"),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("campaign_activities_campaign_idx").on(table.campaignKey)]);

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({
  campaignKey: true, submittedAt: true, rowVersion: true, createdAt: true, updatedAt: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
