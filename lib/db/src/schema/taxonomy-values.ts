import { pgEnum, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taxonomyTypeEnum = pgEnum("taxonomy_type", [
  "segment", "persona", "product", "region", "channel",
]);
export const taxonomyStatusEnum = pgEnum("taxonomy_status", [
  "draft", "active", "retired", "superseded",
]);

export const taxonomyValuesTable = pgTable("taxonomy_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: taxonomyTypeEnum("type").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  status: taxonomyStatusEnum("status").notNull().default("draft"),
  source: text("source").notNull(),
  taxonomyVersion: text("taxonomy_version").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("taxonomy_values_type_code_version_idx").on(table.type, table.code, table.taxonomyVersion),
]);

export const insertTaxonomyValueSchema = createInsertSchema(taxonomyValuesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertTaxonomyValue = z.infer<typeof insertTaxonomyValueSchema>;
export type TaxonomyValue = typeof taxonomyValuesTable.$inferSelect;