import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const taxonomyCategoriesTable = pgTable("taxonomy_categories", {
  key: text("key").primaryKey(),
  displayName: text("display_name").notNull(),
  supportsParent: boolean("supports_parent").notNull().default(false),
  supportsMeasurementRule: boolean("supports_measurement_rule").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const governedValuesTable = pgTable("governed_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  stableKey: text("stable_key").notNull().unique(),
  category: text("category").notNull().references(() => taxonomyCategoriesTable.key),
  displayName: text("display_name").notNull(),
  definition: text("definition").notNull(),
  status: text("status").notNull().default("draft"),
  effectiveStart: date("effective_start", { mode: "string" }).notNull(),
  effectiveEnd: date("effective_end", { mode: "string" }),
  taxonomyVersion: text("taxonomy_version").notNull(),
  source: text("source").notNull(),
  owner: text("owner").notNull(),
  parentId: uuid("parent_id"),
  supersededById: uuid("superseded_by_id"),
  legacyCodes: text("legacy_codes").array().notNull().default(sql`ARRAY[]::text[]`),
  measurementRule: text("measurement_rule"),
  usageCount: integer("usage_count").notNull().default(0),
  rowVersion: integer("row_version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  foreignKey({ columns: [table.parentId], foreignColumns: [table.id], name: "governed_values_parent_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.supersededById], foreignColumns: [table.id], name: "governed_values_superseded_by_fk" }).onDelete("restrict"),
  index("governed_values_category_status_idx").on(table.category, table.status),
  index("governed_values_parent_idx").on(table.parentId),
]);

export const taxonomyAssociationsTable = pgTable("taxonomy_associations", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromValueId: uuid("from_value_id").notNull().references(() => governedValuesTable.id, { onDelete: "restrict" }),
  toValueId: uuid("to_value_id").notNull().references(() => governedValuesTable.id, { onDelete: "restrict" }),
  relationshipType: text("relationship_type").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("taxonomy_association_unique_idx").on(table.fromValueId, table.toValueId, table.relationshipType),
]);

export const taxonomyAuditEventsTable = pgTable("taxonomy_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  valueId: uuid("value_id").notNull().references(() => governedValuesTable.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  actorLabel: text("actor_label").notNull(),
  reason: text("reason").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("taxonomy_audit_value_idx").on(table.valueId, table.createdAt)]);

export const taxonomyUserRolesTable = pgTable("taxonomy_user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("reader"),
  categories: text("categories").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("taxonomy_user_role_user_idx").on(table.userId)]);

export const taxonomyReviewRequestsTable = pgTable("taxonomy_review_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull().references(() => taxonomyCategoriesTable.key),
  proposedName: text("proposed_name").notNull(),
  context: text("context").notNull(),
  status: text("status").notNull().default("open"),
  requestedBy: text("requested_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const taxonomyImportBatchesTable = pgTable("taxonomy_import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceFile: text("source_file").notNull(),
  status: text("status").notNull().default("preview"),
  candidateCount: integer("candidate_count").notNull(),
  conflictCount: integer("conflict_count").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxonomyImportCandidatesTable = pgTable("taxonomy_import_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  importBatchId: uuid("import_batch_id").notNull().references(() => taxonomyImportBatchesTable.id, { onDelete: "cascade" }),
  sourceLocation: text("source_location").notNull(),
  category: text("category").references(() => taxonomyCategoriesTable.key),
  sourceKey: text("source_key"),
  sourceLabel: text("source_label").notNull(),
  sourceDefinition: text("source_definition"),
  normalizedStableKey: text("normalized_stable_key"),
  candidateStatus: text("candidate_status").notNull().default("candidate"),
  rawPayload: jsonb("raw_payload").notNull(),
}, (table) => [index("taxonomy_import_candidate_batch_idx").on(table.importBatchId)]);

export const taxonomyImportConflictsTable = pgTable("taxonomy_import_conflicts", {
  id: uuid("id").primaryKey().defaultRandom(),
  importBatchId: uuid("import_batch_id").notNull().references(() => taxonomyImportBatchesTable.id, { onDelete: "cascade" }),
  conflictType: text("conflict_type").notNull(),
  sourceValue: text("source_value").notNull(),
  details: text("details").notNull(),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  resolutionDecision: text("resolution_decision"),
  targetValueId: uuid("target_value_id").references(() => governedValuesTable.id, { onDelete: "restrict" }),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const taxonomyGovernanceEventsTable = pgTable("taxonomy_governance_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  actorLabel: text("actor_label").notNull(),
  reason: text("reason").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("taxonomy_governance_entity_idx").on(table.entityType, table.entityId, table.createdAt)]);

export const governedValuesRelations = relations(governedValuesTable, ({ one, many }) => ({
  categoryDefinition: one(taxonomyCategoriesTable, { fields: [governedValuesTable.category], references: [taxonomyCategoriesTable.key] }),
  associationsFrom: many(taxonomyAssociationsTable, { relationName: "from" }),
  associationsTo: many(taxonomyAssociationsTable, { relationName: "to" }),
  history: many(taxonomyAuditEventsTable),
}));