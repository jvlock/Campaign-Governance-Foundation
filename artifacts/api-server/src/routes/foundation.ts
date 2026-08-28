import { Router, type IRouter } from "express";
import { asc, count, eq } from "drizzle-orm";
import {
  db,
  foundationActivityTable,
  taxonomyValuesTable,
} from "@workspace/db";
import {
  GetFoundationSummaryResponse,
  ListFoundationActivityResponse,
  ListTaxonomyValuesQueryParams,
  ListTaxonomyValuesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/foundation/summary", async (_req, res): Promise<void> => {
  const counts = await db.select({
    type: taxonomyValuesTable.type,
    count: count(),
  }).from(taxonomyValuesTable).groupBy(taxonomyValuesTable.type);

  res.json(GetFoundationSummaryResponse.parse({
    phase: "Foundation",
    readiness: {
      applicationShell: "ready",
      database: "ready",
      api: "ready",
      documentation: "ready",
      testing: "ready",
    },
    governedValues: Object.fromEntries(counts.map((item) => [item.type, Number(item.count)])),
    taxonomyVersion: "reference-import-2026.08",
    principles: [
      "One enduring Campaign Key survives naming, fiscal-period, and taxonomy changes.",
      "Products, audiences, regions, and channels are governed relationships—not encoded positions.",
      "Historical taxonomy values are retired or superseded, never deleted while referenced.",
      "No personal or confidential information belongs in URLs, logs, or generated identifiers.",
    ],
  }));
});

router.get("/foundation/taxonomies", async (req, res): Promise<void> => {
  const parsed = ListTaxonomyValuesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = parsed.data.type
    ? await db.select().from(taxonomyValuesTable)
        .where(eq(taxonomyValuesTable.type, parsed.data.type))
        .orderBy(asc(taxonomyValuesTable.type), asc(taxonomyValuesTable.label))
    : await db.select().from(taxonomyValuesTable)
        .orderBy(asc(taxonomyValuesTable.type), asc(taxonomyValuesTable.label));
  res.json(ListTaxonomyValuesResponse.parse(rows));
});

router.get("/foundation/activity", async (_req, res): Promise<void> => {
  const rows = await db.select().from(foundationActivityTable)
    .orderBy(asc(foundationActivityTable.recordedAt));
  res.json(ListFoundationActivityResponse.parse(rows));
});

export default router;