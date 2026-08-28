import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityKindEnum = pgEnum("foundation_activity_kind", [
  "decision", "evidence", "assessment",
]);

export const foundationActivityTable = pgTable("foundation_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: activityKindEnum("kind").notNull(),
  title: text("title").notNull().unique(),
  detail: text("detail").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFoundationActivitySchema = createInsertSchema(foundationActivityTable).omit({
  id: true, recordedAt: true,
});
export type InsertFoundationActivity = z.infer<typeof insertFoundationActivitySchema>;