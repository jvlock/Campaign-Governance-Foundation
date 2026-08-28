import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { activityTypeConfigurationsTable, campaignActivitiesTable } from "./campaign-registry";

export const activityExecutionsTable = pgTable("activity_executions", {
  executionKey: uuid("execution_key").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").notNull().references(() => campaignActivitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  versionNumber: integer("version_number").notNull().default(1),
  copiedFromExecutionKey: uuid("copied_from_execution_key").references((): any => activityExecutionsTable.executionKey, { onDelete: "restrict" }),
  previousVersionExecutionKey: uuid("previous_version_execution_key").references((): any => activityExecutionsTable.executionKey, { onDelete: "restrict" }),
  creativeLineage: jsonb("creative_lineage").notNull().default(sql`'{}'::jsonb`),
  copyLineage: jsonb("copy_lineage").notNull().default(sql`'{}'::jsonb`),
  assetIds: text("asset_ids").array().notNull().default([]),
  externalIds: jsonb("external_ids").notNull().default(sql`'{}'::jsonb`),
  configurationData: jsonb("configuration_data").notNull().default(sql`'{}'::jsonb`),
  rowVersion: integer("row_version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("activity_executions_activity_idx").on(table.activityId, table.createdAt)]);

export const insertActivityTypeConfigurationSchema = createInsertSchema(activityTypeConfigurationsTable).omit({
  id: true, publishedAt: true, createdAt: true, updatedAt: true,
});
export const insertActivityExecutionSchema = createInsertSchema(activityExecutionsTable).omit({
  executionKey: true, rowVersion: true, createdAt: true, updatedAt: true,
});
export type ActivityTypeConfiguration = typeof activityTypeConfigurationsTable.$inferSelect;
export type ActivityExecution = typeof activityExecutionsTable.$inferSelect;
export type InsertActivityTypeConfiguration = z.infer<typeof insertActivityTypeConfigurationSchema>;
export type InsertActivityExecution = z.infer<typeof insertActivityExecutionSchema>;