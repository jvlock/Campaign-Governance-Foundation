import { date, index, integer, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { governedValuesTable } from "./taxonomy-governance";

export const accountSizeRulesTable = pgTable("account_size_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  segmentId: uuid("segment_id").notNull().references(() => governedValuesTable.id, { onDelete: "restrict" }),
  tierId: uuid("tier_id").notNull().references(() => governedValuesTable.id, { onDelete: "restrict" }),
  measurementBasis: text("measurement_basis").notNull(),
  minimum: numeric("minimum", { precision: 18, scale: 2 }),
  maximum: numeric("maximum", { precision: 18, scale: 2 }),
  unit: text("unit").notNull(),
  source: text("source").notNull(),
  effectiveStart: date("effective_start", { mode: "string" }).notNull(),
  effectiveEnd: date("effective_end", { mode: "string" }),
  version: text("version").notNull(),
}, (table) => [uniqueIndex("account_size_rule_version_idx").on(table.segmentId, table.tierId, table.version)]);

export const audienceEvidenceTable = pgTable("audience_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  segmentLabel: text("segment_label").notNull(),
  subsegmentLabel: text("subsegment_label").notNull(),
  sizeTierLabel: text("size_tier_label").notNull(),
  canonicalPersona: text("canonical_persona"),
  classificationStatus: text("classification_status").notNull(),
  rawClassification: text("raw_classification").notNull(),
  representativeTitles: text("representative_titles").notNull(),
  planningEstimate: integer("planning_estimate").notNull(),
  sourceFile: text("source_file").notNull(),
  sourceSheet: text("source_sheet").notNull(),
  sourceRows: text("source_rows").notNull(),
}, (table) => [index("audience_evidence_segment_idx").on(table.segmentLabel, table.subsegmentLabel)]);
