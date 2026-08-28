import { db, foundationActivityTable, taxonomyValuesTable } from "@workspace/db";

const values = [
  ["segment", "ASSET_OWNERS", "Asset Owners", "Target Segments, Personas & Cohorts workbook"],
  ["segment", "HEDGE_FUNDS", "Hedge Funds", "Target Segments, Personas & Cohorts workbook"],
  ["persona", "FIN_EXEC", "Finance & Executive Leadership", "Target Segments, Personas & Cohorts workbook"],
  ["persona", "INVEST_DECISION", "Investment Decision-Makers", "Target Segments, Personas & Cohorts workbook"],
  ["product", "CLIMATE", "Climate", "Taxonomy Builder workbook"],
  ["region", "AMERICAS", "Americas", "Taxonomy Builder workbook"],
  ["channel", "PAID_SOCIAL", "Paid Social", "MSCI UTM Guide HTML"],
  ["channel", "EMAIL", "Email", "MSCI UTM Guide HTML"],
] as const;

await db.insert(taxonomyValuesTable).values(values.map(([type, code, label, source]) => ({
  type,
  code,
  label,
  source,
  status: "draft" as const,
  taxonomyVersion: "reference-import-2026.08",
  notes: "Incomplete reference seed; requires steward review.",
}))).onConflictDoNothing();

await db.insert(foundationActivityTable).values([
  {
    kind: "decision",
    title: "Greenfield architecture established",
    detail: "The supplied prototype and workbooks are immutable reference material, not prior application architecture.",
  },
  {
    kind: "assessment",
    title: "Reference inputs classified",
    detail: "Uploaded taxonomy values are incomplete seeds with source, status, and version provenance.",
  },
  {
    kind: "evidence",
    title: "Foundation services initialized",
    detail: "Application shell, typed API contract, PostgreSQL schema, and health checks were established.",
  },
]).onConflictDoNothing();