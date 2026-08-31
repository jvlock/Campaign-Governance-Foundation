import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateGovernedValueBody,
  CreateGovernedValueResponse,
  CreateTaxonomyAssociationBody,
  CreateTaxonomyAssociationResponse,
  CreateTaxonomyImportPreviewBody,
  CreateTaxonomyImportPreviewResponse,
  CreateTaxonomyReviewRequestBody,
  CreateTaxonomyReviewRequestResponse,
  DeleteGovernedValueParams,
  GetGovernedValueParams,
  GetGovernedValueResponse,
  GetTaxonomyAccessResponse,
  ListGovernedValueHistoryParams,
  ListGovernedValueHistoryResponse,
  ListGovernedValuesQueryParams,
  ListGovernedValuesResponse,
  ListTaxonomyCategoriesResponse,
  ListTaxonomyImportConflictsParams,
  ListTaxonomyImportConflictsResponse,
  ListTaxonomyImportsResponse,
  ListTaxonomyReviewRequestsResponse,
  ResolveTaxonomyImportConflictBody,
  ResolveTaxonomyImportConflictParams,
  ResolveTaxonomyImportConflictResponse,
  TransitionGovernedValueBody,
  TransitionGovernedValueParams,
  TransitionGovernedValueResponse,
  UpdateGovernedValueBody,
  UpdateGovernedValueParams,
  UpdateGovernedValueResponse,
} from "@workspace/api-zod";
import {
  db,
  governedValuesTable,
  taxonomyAssociationsTable,
  taxonomyAuditEventsTable,
  taxonomyCategoriesTable,
  taxonomyGovernanceEventsTable,
  taxonomyImportBatchesTable,
  taxonomyImportCandidatesTable,
  taxonomyImportConflictsTable,
  taxonomyReviewRequestsTable,
} from "@workspace/db";
import { allowsCategory, toAccess, type TaxonomyRole } from "../lib/taxonomy-access";
import { stageReferenceSource } from "../lib/reference-import";

const router: IRouter = Router();

type Actor = { id: string; label: string; role: string; categories: string[] };

async function actorFor(req: Request, res: Response, required: TaxonomyRole = "reader"): Promise<Actor | null> {
  return {
    id: "public",
    label: "Public user",
    role: "administrator",
    categories: [],
  };
}

function valueResponse(row: typeof governedValuesTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function auditResponse(row: typeof taxonomyAuditEventsTable.$inferSelect) {
  return { ...row, createdAt: row.createdAt.toISOString(), snapshot: row.snapshot as Record<string, unknown> };
}

async function validateParent(parentId: string | null | undefined, valueId?: string) {
  if (!parentId) return null;
  if (parentId === valueId) return "A value cannot be its own parent";
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === valueId) return "Parent relationship would create a hierarchy cycle";
    if (seen.has(cursor)) return "Existing hierarchy contains a cycle";
    seen.add(cursor);
    const [parent]: Array<{ id: string; parentId: string | null }> = await db
      .select({ id: governedValuesTable.id, parentId: governedValuesTable.parentId })
      .from(governedValuesTable)
      .where(eq(governedValuesTable.id, cursor));
    if (!parent) return "Parent value does not exist";
    cursor = parent.parentId;
  }
  return null;
}

const parentCategories: Record<string, string> = {
  subsegment: "segment",
  persona: "buying_group_function",
  product: "product_family",
  capability_solution: "product",
  source: "channel",
  delivery_mechanism: "source",
  subregion: "region",
  country: "subregion",
  market_cluster: "country",
  fiscal_year: "fiscal_calendar",
  fiscal_quarter: "fiscal_year",
  fiscal_period: "fiscal_quarter",
  campaign_member_status_template: "activity_type",
  campaign_shortcode: "product_line",
  subcampaign: "campaign_shortcode",
};

async function validateCategoryParent(category: string, parentId: string | null | undefined, valueId?: string) {
  const [metadata] = await db.select().from(taxonomyCategoriesTable).where(eq(taxonomyCategoriesTable.key, category));
  if (!metadata) return "Unknown taxonomy category";
  if (!parentId) return null;
  if (!metadata.supportsParent) return "This category does not support parent relationships";
  const [parent] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, parentId));
  if (!parent) return "Parent value does not exist";
  const expectedCategory = parentCategories[category] ?? category;
  if (parent.category !== expectedCategory) return `Parent must belong to the ${expectedCategory} category`;
  return validateParent(parentId, valueId);
}

function isActiveOn(row: typeof governedValuesTable.$inferSelect, day: string) {
  return row.status === "active" && row.effectiveStart <= day && (!row.effectiveEnd || row.effectiveEnd >= day);
}

async function writeAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  row: typeof governedValuesTable.$inferSelect,
  actor: Actor,
  action: string,
  reason: string,
) {
  await tx.insert(taxonomyAuditEventsTable).values({
    valueId: row.id,
    action,
    actorId: actor.id,
    actorLabel: actor.label,
    reason,
    snapshot: valueResponse(row),
  });
}

router.get("/taxonomy/access", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res);
  if (!actor) return;
  res.json(GetTaxonomyAccessResponse.parse(toAccess(actor.role, actor.categories)));
});

router.get("/taxonomy/categories", async (req, res): Promise<void> => {
  if (!await actorFor(req, res)) return;
  const rows = await db.select().from(taxonomyCategoriesTable).orderBy(asc(taxonomyCategoriesTable.sortOrder));
  res.json(ListTaxonomyCategoriesResponse.parse(rows));
});

router.get("/taxonomy/values", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res);
  if (!actor) return;
  const parsed = ListGovernedValuesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const filters = [];
  // Test fixtures are retained for referential integrity but never pollute
  // ordinary taxonomy selection lists.
  if (parsed.data.includeTestData !== true) {
    filters.push(sql`COALESCE(${governedValuesTable.metadata}->>'isTestData', 'false') <> 'true'`);
    filters.push(sql`${governedValuesTable.stableKey} !~* '^(TEST_|PUBLIC_|task14-channel)'`);
    filters.push(sql`${governedValuesTable.source} NOT IN ('Automated test', 'Test', 'browser-admin-test')`);
  }
  if (parsed.data.category) filters.push(eq(governedValuesTable.category, parsed.data.category));
  if (parsed.data.status) filters.push(eq(governedValuesTable.status, parsed.data.status));
  if (parsed.data.parentId) filters.push(eq(governedValuesTable.parentId, parsed.data.parentId));
  if (parsed.data.search) {
    const term = `%${parsed.data.search.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(governedValuesTable.displayName, term), ilike(governedValuesTable.stableKey, term), ilike(governedValuesTable.definition, term))!);
  }
  if (actor.categories.length) filters.push(sql`${governedValuesTable.category} = ANY(${actor.categories})`);
  const rows = await db.select().from(governedValuesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(governedValuesTable.category), asc(governedValuesTable.displayName));
  res.json(ListGovernedValuesResponse.parse(rows.map(valueResponse)));
});

router.post("/taxonomy/values", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res, "contributor");
  if (!actor) return;
  const parsed = CreateGovernedValueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!allowsCategory(actor.categories, parsed.data.category)) {
    res.status(403).json({ error: "Category is outside your stewardship scope" });
    return;
  }
  if (parsed.data.stableKey.toLowerCase() === "other") {
    res.status(400).json({ error: "Unresolved values must be submitted as review requests" });
    return;
  }
  if (parsed.data.effectiveEnd && parsed.data.effectiveEnd < parsed.data.effectiveStart) {
    res.status(400).json({ error: "Effective end cannot precede effective start" });
    return;
  }
  const parentError = await validateCategoryParent(parsed.data.category, parsed.data.parentId);
  if (parentError) {
    res.status(400).json({ error: parentError });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(governedValuesTable).values({
        ...parsed.data,
        legacyCodes: parsed.data.legacyCodes ?? [],
        status: "draft",
        createdBy: actor.id,
        updatedBy: actor.id,
      }).returning();
      await writeAudit(tx, created, actor, "created", "Value proposed");
      return created;
    });
    res.status(201).json(CreateGovernedValueResponse.parse(valueResponse(row)));
  } catch (error) {
    req.log.warn({ err: error }, "Unable to create governed value");
    res.status(409).json({ error: "Stable key already exists or relationship is invalid" });
  }
});

router.get("/taxonomy/values/:id", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res);
  if (!actor) return;
  const parsed = GetGovernedValueParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, parsed.data.id));
  if (!row) {
    res.status(404).json({ error: "Governed value not found" });
    return;
  }
  if (!allowsCategory(actor.categories, row.category)) {
    res.status(403).json({ error: "Category is outside your access scope" });
    return;
  }
  const associations = await db.select().from(taxonomyAssociationsTable)
    .where(or(eq(taxonomyAssociationsTable.fromValueId, row.id), eq(taxonomyAssociationsTable.toValueId, row.id)))
    .orderBy(asc(taxonomyAssociationsTable.createdAt));
  const history = await db.select().from(taxonomyAuditEventsTable)
    .where(eq(taxonomyAuditEventsTable.valueId, row.id)).orderBy(desc(taxonomyAuditEventsTable.createdAt));
  res.json(GetGovernedValueResponse.parse({
    ...valueResponse(row),
    associations: associations.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    history: history.map(auditResponse),
  }));
});

router.patch("/taxonomy/values/:id", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res, "contributor");
  if (!actor) return;
  const params = UpdateGovernedValueParams.safeParse(req.params);
  const body = UpdateGovernedValueBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid update" });
    return;
  }
  if (body.data.effectiveEnd && body.data.effectiveEnd < body.data.effectiveStart) {
    res.status(400).json({ error: "Effective end cannot precede effective start" });
    return;
  }
  const [current] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Governed value not found" });
    return;
  }
  if (!allowsCategory(actor.categories, current.category)) {
    res.status(403).json({ error: "Category is outside your stewardship scope" });
    return;
  }
  const parentError = await validateCategoryParent(current.category, body.data.parentId, current.id);
  if (parentError) {
    res.status(400).json({ error: parentError });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(governedValuesTable).set({
      ...body.data,
      legacyCodes: body.data.legacyCodes ?? [],
      rowVersion: body.data.rowVersion + 1,
      updatedBy: actor.id,
      updatedAt: new Date(),
    }).where(and(eq(governedValuesTable.id, current.id), eq(governedValuesTable.rowVersion, body.data.rowVersion))).returning();
    if (!row) return null;
    await writeAudit(tx, row, actor, "updated", "Metadata updated");
    return row;
  });
  if (!updated) {
    res.status(409).json({ error: "This value was updated by another user" });
    return;
  }
  res.json(UpdateGovernedValueResponse.parse(valueResponse(updated)));
});

const transitions: Record<string, { from: string[]; to: string; role: TaxonomyRole }> = {
  submit_review: { from: ["draft"], to: "in_review", role: "contributor" },
  approve: { from: ["in_review"], to: "approved", role: "reviewer" },
  activate: { from: ["approved", "inactive"], to: "active", role: "steward" },
  retire: { from: ["active", "approved"], to: "inactive", role: "steward" },
  supersede: { from: ["active", "inactive", "approved"], to: "superseded", role: "steward" },
};

router.post("/taxonomy/values/:id/transition", async (req, res): Promise<void> => {
  const params = TransitionGovernedValueParams.safeParse(req.params);
  const body = TransitionGovernedValueBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid transition" });
    return;
  }
  const rule = transitions[body.data.action];
  const actor = await actorFor(req, res, rule?.role ?? "administrator");
  if (!actor) return;
  const [current] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Governed value not found" });
    return;
  }
  if (!rule || !rule.from.includes(current.status)) {
    res.status(400).json({ error: `Cannot ${body.data.action} a ${current.status} value` });
    return;
  }
  if (!allowsCategory(actor.categories, current.category)) {
    res.status(403).json({ error: "Category is outside your stewardship scope" });
    return;
  }
  if (body.data.action === "supersede" && !body.data.replacementId) {
    res.status(400).json({ error: "A replacement value is required" });
    return;
  }
  if (body.data.replacementId === current.id) {
    res.status(400).json({ error: "A value cannot supersede itself" });
    return;
  }
  if (body.data.action === "supersede") {
    const [replacement] = await db.select().from(governedValuesTable)
      .where(eq(governedValuesTable.id, body.data.replacementId!));
    const today = new Date().toISOString().slice(0, 10);
    if (!replacement || replacement.category !== current.category || !isActiveOn(replacement, today)) {
      res.status(400).json({ error: "Replacement must be an effective active value in the same category" });
      return;
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  if (body.data.action === "activate") {
    if (current.effectiveStart > today || (current.effectiveEnd && current.effectiveEnd < today)) {
      res.status(400).json({ error: "Value is outside its effective date range" });
      return;
    }
    if (current.parentId) {
      const [parent] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, current.parentId));
      if (!parent || !isActiveOn(parent, today)) {
        res.status(400).json({ error: "Parent must be effective and active before this value can be activated" });
        return;
      }
    }
  }
  if (["retire", "supersede"].includes(body.data.action) && current.effectiveStart > today) {
    res.status(400).json({ error: "A value cannot end before its effective start date" });
    return;
  }
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(governedValuesTable).set({
      status: rule.to,
      supersededById: body.data.action === "supersede" ? body.data.replacementId : current.supersededById,
      effectiveEnd: ["inactive", "superseded"].includes(rule.to)
        ? (current.effectiveEnd && current.effectiveEnd < today ? current.effectiveEnd : today)
        : current.effectiveEnd,
      rowVersion: current.rowVersion + 1,
      updatedBy: actor.id,
      updatedAt: new Date(),
    }).where(and(eq(governedValuesTable.id, current.id), eq(governedValuesTable.rowVersion, body.data.rowVersion))).returning();
    if (!updated) return null;
    await writeAudit(tx, updated, actor, body.data.action, body.data.reason);
    return updated;
  });
  if (!row) {
    res.status(409).json({ error: "This value was updated by another user" });
    return;
  }
  res.json(TransitionGovernedValueResponse.parse(valueResponse(row)));
});

router.delete("/taxonomy/values/:id", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res, "administrator");
  if (!actor) return;
  const params = DeleteGovernedValueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid value id" });
    return;
  }
  const [current] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Governed value not found" });
    return;
  }
  if (current.status !== "draft" || current.usageCount > 0) {
    res.status(409).json({ error: "Only unreferenced draft values may be deleted" });
    return;
  }
  res.status(409).json({
    error: "Governed values are retained for audit. Supersede or retire this value instead.",
  });
});

router.get("/taxonomy/values/:id/history", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res);
  if (!actor) return;
  const params = ListGovernedValueHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid value id" });
    return;
  }
  const [value] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, params.data.id));
  if (!value) {
    res.status(404).json({ error: "Governed value not found" });
    return;
  }
  if (!allowsCategory(actor.categories, value.category)) {
    res.status(403).json({ error: "Category is outside your access scope" });
    return;
  }
  const rows = await db.select().from(taxonomyAuditEventsTable)
    .where(eq(taxonomyAuditEventsTable.valueId, params.data.id)).orderBy(desc(taxonomyAuditEventsTable.createdAt));
  res.json(ListGovernedValueHistoryResponse.parse(rows.map(auditResponse)));
});

router.post("/taxonomy/associations", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res, "contributor");
  if (!actor) return;
  const parsed = CreateTaxonomyAssociationBody.safeParse(req.body);
  if (!parsed.success || parsed.data.fromValueId === parsed.data.toValueId) {
    res.status(400).json({ error: "Invalid association" });
    return;
  }
  const associatedValues = await db.select().from(governedValuesTable)
    .where(or(
      eq(governedValuesTable.id, parsed.data.fromValueId),
      eq(governedValuesTable.id, parsed.data.toValueId),
    ));
  if (associatedValues.length !== 2) {
    res.status(400).json({ error: "Both associated values must exist" });
    return;
  }
  if (associatedValues.some((value) => !allowsCategory(actor.categories, value.category))) {
    res.status(403).json({ error: "Association is outside your stewardship scope" });
    return;
  }
  try {
    const [row] = await db.insert(taxonomyAssociationsTable).values({ ...parsed.data, createdBy: actor.id }).returning();
    await db.insert(taxonomyGovernanceEventsTable).values({
      entityType: "association",
      entityId: row.id,
      action: "created",
      actorId: actor.id,
      actorLabel: actor.label,
      reason: parsed.data.relationshipType,
      snapshot: row,
    });
    res.status(201).json(CreateTaxonomyAssociationResponse.parse({ ...row, createdAt: row.createdAt.toISOString() }));
  } catch {
    res.status(409).json({ error: "Association already exists or references an unknown value" });
  }
});

router.get("/taxonomy/review-requests", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res, "contributor");
  if (!actor) return;
  const rows = await db.select().from(taxonomyReviewRequestsTable)
    .where(actor.categories.length ? sql`${taxonomyReviewRequestsTable.category} = ANY(${actor.categories})` : undefined)
    .orderBy(desc(taxonomyReviewRequestsTable.createdAt));
  res.json(ListTaxonomyReviewRequestsResponse.parse(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))));
});

router.post("/taxonomy/review-requests", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res, "contributor");
  if (!actor) return;
  const parsed = CreateTaxonomyReviewRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!allowsCategory(actor.categories, parsed.data.category)) {
    res.status(403).json({ error: "Category is outside your access scope" });
    return;
  }
  const [row] = await db.insert(taxonomyReviewRequestsTable).values({ ...parsed.data, requestedBy: actor.id }).returning();
  res.status(201).json(CreateTaxonomyReviewRequestResponse.parse({ ...row, createdAt: row.createdAt.toISOString() }));
});

router.get("/taxonomy/imports", async (req, res): Promise<void> => {
  if (!await actorFor(req, res, "administrator")) return;
  const rows = await db.select().from(taxonomyImportBatchesTable).orderBy(desc(taxonomyImportBatchesTable.createdAt));
  res.json(ListTaxonomyImportsResponse.parse(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))));
});

router.post("/taxonomy/imports/preview", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res, "administrator");
  if (!actor) return;
  const parsed = CreateTaxonomyImportPreviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let candidates;
  try {
    candidates = await stageReferenceSource(parsed.data.sourceFile);
  } catch (error) {
    req.log.error({ err: error }, "Unable to parse preserved taxonomy source");
    res.status(500).json({ error: "Preserved source could not be parsed" });
    return;
  }
  const existing = await db.select().from(governedValuesTable);
  const stableKeys = new Set(existing.map((value) => value.stableKey.toLowerCase()));
  const conflicts = candidates.flatMap((candidate) => {
    const found: Array<{ conflictType: string; sourceValue: string; details: string }> = [];
    const candidateKey = (candidate.sourceKey ?? candidate.sourceLabel).toLowerCase();
    if (candidateKey === "na") {
      found.push({
        conflictType: "ambiguous_code",
        sourceValue: "na",
        details: `${candidate.sourceLocation}: legacy code can mean both REGION_NORTH_AMERICA and NOT_APPLICABLE. Explicitly map to a governed value or choose the not-applicable decision; never normalize silently.`,
      });
    }
    if (/^(other|others|all|other \/ mixed-title)$/i.test(candidate.sourceLabel)) {
      found.push({
        conflictType: "inconsistent_label",
        sourceValue: candidate.sourceLabel,
        details: `${candidate.sourceLocation}: unrestricted catch-all labels must become review requests.`,
      });
    }
    if (stableKeys.has(candidate.normalizedStableKey.toLowerCase())) {
      found.push({
        conflictType: "duplicate",
        sourceValue: candidate.sourceLabel,
        details: `${candidate.sourceLocation}: normalized stable key already exists as ${candidate.normalizedStableKey}.`,
      });
    }
    if (!candidate.sourceDefinition) {
      found.push({
        conflictType: "missing_definition",
        sourceValue: candidate.sourceLabel,
        details: `${candidate.sourceLocation}: candidate has no source definition and cannot be applied without review.`,
      });
    }
    return found;
  });
  const batch = await db.transaction(async (tx) => {
    const [created] = await tx.insert(taxonomyImportBatchesTable).values({
      sourceFile: parsed.data.sourceFile,
      status: "preview",
      candidateCount: candidates.length,
      conflictCount: conflicts.length,
      createdBy: actor.id,
    }).returning();
    await tx.insert(taxonomyImportCandidatesTable).values(candidates.map((candidate) => ({
      importBatchId: created.id,
      ...candidate,
      candidateStatus: conflicts.some((conflict) => conflict.sourceValue === candidate.sourceLabel) ? "conflict" : "candidate",
    })));
    if (conflicts.length) {
      await tx.insert(taxonomyImportConflictsTable).values(conflicts.map(({ conflictType, sourceValue, details }) => ({
        importBatchId: created.id,
        conflictType,
        sourceValue,
        details,
      })));
    }
    await tx.insert(taxonomyGovernanceEventsTable).values({
      entityType: "import_batch",
      entityId: created.id,
      action: "preview_created",
      actorId: actor.id,
      actorLabel: actor.label,
      reason: `Parsed preserved source ${parsed.data.sourceFile}`,
      snapshot: { sourceFile: parsed.data.sourceFile, candidateCount: candidates.length, conflictCount: conflicts.length },
    });
    return created;
  });
  res.status(201).json(CreateTaxonomyImportPreviewResponse.parse({ ...batch, createdAt: batch.createdAt.toISOString() }));
});

router.get("/taxonomy/imports/:id/conflicts", async (req, res): Promise<void> => {
  if (!await actorFor(req, res, "administrator")) return;
  const params = ListTaxonomyImportConflictsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid import id" });
    return;
  }
  const rows = await db.select().from(taxonomyImportConflictsTable)
    .where(eq(taxonomyImportConflictsTable.importBatchId, params.data.id))
    .orderBy(asc(taxonomyImportConflictsTable.sourceValue));
  res.json(ListTaxonomyImportConflictsResponse.parse(rows));
});

router.post("/taxonomy/conflicts/:id/resolve", async (req, res): Promise<void> => {
  const actor = await actorFor(req, res, "administrator");
  if (!actor) return;
  const params = ResolveTaxonomyImportConflictParams.safeParse(req.params);
  const body = ResolveTaxonomyImportConflictBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid resolution" });
    return;
  }
  const [current] = await db.select().from(taxonomyImportConflictsTable)
    .where(eq(taxonomyImportConflictsTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Conflict not found" });
    return;
  }
  if (body.data.status === "ignored" && body.data.resolutionDecision !== "ignore_source") {
    res.status(400).json({ error: "Ignored conflicts require the ignore_source decision" });
    return;
  }
  if (body.data.status === "resolved" && body.data.resolutionDecision === "ignore_source") {
    res.status(400).json({ error: "Resolved conflicts require a mapping or not-applicable decision" });
    return;
  }
  if (body.data.resolutionDecision === "map_to_governed_value") {
    if (!body.data.targetValueId) {
      res.status(400).json({ error: "A governed target value is required" });
      return;
    }
    const [target] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, body.data.targetValueId));
    if (!target) {
      res.status(400).json({ error: "Governed target value does not exist" });
      return;
    }
  } else if (body.data.targetValueId) {
    res.status(400).json({ error: "Target value is only valid for an explicit mapping decision" });
    return;
  }
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(taxonomyImportConflictsTable).set({
      ...body.data,
      resolvedBy: actor.id,
      resolvedAt: new Date(),
    }).where(eq(taxonomyImportConflictsTable.id, current.id)).returning();
    await tx.insert(taxonomyGovernanceEventsTable).values({
      entityType: "import_conflict",
      entityId: current.id,
      action: body.data.status,
      actorId: actor.id,
      actorLabel: actor.label,
      reason: body.data.resolution,
      snapshot: updated,
    });
    const open = await tx.select({ id: taxonomyImportConflictsTable.id }).from(taxonomyImportConflictsTable)
      .where(and(eq(taxonomyImportConflictsTable.importBatchId, current.importBatchId), eq(taxonomyImportConflictsTable.status, "open")))
      .limit(1);
    if (!open.length) {
      await tx.update(taxonomyImportBatchesTable).set({ status: "reviewed" })
        .where(eq(taxonomyImportBatchesTable.id, current.importBatchId));
    }
    return updated;
  });
  res.json(ResolveTaxonomyImportConflictResponse.parse(row));
});

export default router;