import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { activityTypeConfigurationsTable, campaignActivitiesTable } from "./campaign-registry";
import { governedValuesTable } from "./taxonomy-governance";

export const deliveryPlatformConnectionsTable = pgTable("delivery_platform_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelValueId: uuid("channel_value_id").notNull().references(() => governedValuesTable.id, { onDelete: "restrict" }),
  platformKey: text("platform_key").notNull(),
  displayName: text("display_name").notNull(),
  endpointUrl: text("endpoint_url").notNull(),
  externalIdPath: text("external_id_path").notNull().default("id"),
  isActive: boolean("is_active").notNull().default(false),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("delivery_platform_channel_key_unique").on(table.channelValueId, table.platformKey),
  index("delivery_platform_channel_idx").on(table.channelValueId, table.isActive),
]);

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
  syncState: text("sync_state").notNull().default("not_published"),
  syncPlatformConnectionId: uuid("sync_platform_connection_id").references(() => deliveryPlatformConnectionsTable.id, { onDelete: "restrict" }),
  syncIdempotencyKey: uuid("sync_idempotency_key").defaultRandom(),
  syncAttemptCount: integer("sync_attempt_count").notNull().default(0),
  lastSyncError: text("last_sync_error"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  rowVersion: integer("row_version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("activity_executions_activity_idx").on(table.activityId, table.createdAt)]);

export const executionPublishAttemptsTable = pgTable("execution_publish_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  executionKey: uuid("execution_key").notNull().references(() => activityExecutionsTable.executionKey, { onDelete: "restrict" }),
  platformConnectionId: uuid("platform_connection_id").notNull().references(() => deliveryPlatformConnectionsTable.id, { onDelete: "restrict" }),
  idempotencyKey: uuid("idempotency_key").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  requestPayload: jsonb("request_payload").notNull(),
  responseSummary: jsonb("response_summary"),
  errorMessage: text("error_message"),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("execution_publish_attempt_execution_idx").on(table.executionKey, table.createdAt),
]);

export const insertActivityTypeConfigurationSchema = createInsertSchema(activityTypeConfigurationsTable).omit({
  id: true, publishedAt: true, createdAt: true, updatedAt: true,
});
export const insertActivityExecutionSchema = createInsertSchema(activityExecutionsTable).omit({
  executionKey: true, rowVersion: true, createdAt: true, updatedAt: true,
});
export const insertDeliveryPlatformConnectionSchema = createInsertSchema(deliveryPlatformConnectionsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ActivityTypeConfiguration = typeof activityTypeConfigurationsTable.$inferSelect;
export type ActivityExecution = typeof activityExecutionsTable.$inferSelect;
export type DeliveryPlatformConnection = typeof deliveryPlatformConnectionsTable.$inferSelect;
export type ExecutionPublishAttempt = typeof executionPublishAttemptsTable.$inferSelect;
export type InsertActivityTypeConfiguration = z.infer<typeof insertActivityTypeConfigurationSchema>;
export type InsertActivityExecution = z.infer<typeof insertActivityExecutionSchema>;