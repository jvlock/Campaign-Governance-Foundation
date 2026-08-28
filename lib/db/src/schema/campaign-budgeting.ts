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
import { campaignActivitiesTable, campaignsTable } from "./campaign-registry";

export const fiscalCalendarsTable = pgTable("fiscal_calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  stableKey: text("stable_key").notNull().unique(),
  name: text("name").notNull(),
  activeSnapshotId: uuid("active_snapshot_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fiscalCalendarSnapshotsTable = pgTable("fiscal_calendar_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  fiscalCalendarId: uuid("fiscal_calendar_id").notNull().references(() => fiscalCalendarsTable.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  rules: jsonb("rules").notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("fiscal_calendar_snapshot_version_unique").on(table.fiscalCalendarId, table.version)]);

export const fiscalPeriodsTable = pgTable("fiscal_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  snapshotId: uuid("snapshot_id").notNull().references(() => fiscalCalendarSnapshotsTable.id, { onDelete: "restrict" }),
  stableKey: text("stable_key").notNull(),
  fiscalYear: text("fiscal_year").notNull(),
  fiscalQuarter: text("fiscal_quarter").notNull(),
  fiscalPeriod: text("fiscal_period").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("open"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("fiscal_period_snapshot_key_unique").on(table.snapshotId, table.stableKey),
  index("fiscal_period_dates_idx").on(table.snapshotId, table.startDate, table.endDate),
]);

export const campaignBudgetsTable = pgTable("campaign_budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignKey: uuid("campaign_key").notNull().unique().references(() => campaignsTable.campaignKey, { onDelete: "restrict" }),
  fiscalCalendarSnapshotId: uuid("fiscal_calendar_snapshot_id").notNull().references(() => fiscalCalendarSnapshotsTable.id, { onDelete: "restrict" }),
  requestedMinor: text("requested_minor").notNull(),
  approvedMinor: text("approved_minor").notNull(),
  currency: text("currency").notNull(),
  currencyMinorUnits: integer("currency_minor_units").notNull(),
  budgetOwner: text("budget_owner").notNull(),
  costCenter: text("cost_center").notNull(),
  fundingSource: text("funding_source").notNull(),
  allocationMethod: text("allocation_method").notNull(),
  rowVersion: integer("row_version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const campaignPlanningPeriodsTable = pgTable("campaign_planning_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  stableKey: text("stable_key").notNull().unique(),
  campaignKey: uuid("campaign_key").notNull().references(() => campaignsTable.campaignKey, { onDelete: "restrict" }),
  fiscalPeriodId: uuid("fiscal_period_id").notNull().references(() => fiscalPeriodsTable.id, { onDelete: "restrict" }),
  readableName: text("readable_name").notNull(),
  requestedMinor: text("requested_minor").notNull().default("0"),
  approvedMinor: text("approved_minor").notNull().default("0"),
  plannedMinor: text("planned_minor").notNull().default("0"),
  committedMinor: text("committed_minor").notNull().default("0"),
  actualMinor: text("actual_minor").notNull().default("0"),
  forecastMinor: text("forecast_minor").notNull().default("0"),
  varianceExplanation: text("variance_explanation"),
  unusedBudgetTreatment: text("unused_budget_treatment"),
  status: text("status").notNull().default("open"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  rowVersion: integer("row_version").notNull().default(1),
}, (table) => [uniqueIndex("campaign_planning_period_unique").on(table.campaignKey, table.fiscalPeriodId)]);

export const activityPeriodAllocationsTable = pgTable("activity_period_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").notNull().references(() => campaignActivitiesTable.id, { onDelete: "cascade" }),
  campaignPlanningPeriodId: uuid("campaign_planning_period_id").notNull().references(() => campaignPlanningPeriodsTable.id, { onDelete: "restrict" }),
  allocationMethod: text("allocation_method").notNull(),
  amountMinor: text("amount_minor").notNull(),
  accountingDate: date("accounting_date", { mode: "string" }),
}, (table) => [uniqueIndex("activity_period_allocation_unique").on(table.activityId, table.campaignPlanningPeriodId)]);

export const budgetHistoryTable = pgTable("budget_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignKey: uuid("campaign_key").notNull().references(() => campaignsTable.campaignKey, { onDelete: "restrict" }),
  planningPeriodId: uuid("planning_period_id").references(() => campaignPlanningPeriodsTable.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason").notNull(),
  approvedBy: text("approved_by"),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("budget_history_campaign_idx").on(table.campaignKey, table.createdAt)]);
