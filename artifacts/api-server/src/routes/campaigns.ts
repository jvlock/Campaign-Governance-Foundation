import { getAuditActor, requireMutationAuth } from "../middlewares/mutation-auth";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ArchiveCampaignParams,
  CreateCampaignActivityBody,
  CreateCampaignActivityParams,
  CreateCampaignActivityResponse,
  CreateCampaignBody,
  CreateCampaignResponse,
  GetCampaignParams,
  GetCampaignReadinessParams,
  GetCampaignReadinessResponse,
  GetCampaignResponse,
  ListCampaignsQueryParams,
  ListCampaignsResponse,
  ReplaceCampaignAudiencesBody,
  ReplaceCampaignAudiencesParams,
  ReplaceCampaignAudiencesResponse,
  ReplaceCampaignProductsBody,
  ReplaceCampaignProductsParams,
  ReplaceCampaignProductsResponse,
  SubmitCampaignBody,
  SubmitCampaignParams,
  SubmitCampaignResponse,
  UpdateCampaignBody,
  UpdateCampaignActivityBody,
  UpdateCampaignActivityParams,
  UpdateCampaignActivityResponse,
  UpdateCampaignParams,
  UpdateCampaignResponse,
} from "@workspace/api-zod";
import {
  campaignAudienceSelectionsTable,
  activityPeriodAllocationsTable,
  activityProductAssociationsTable,
  campaignActivitiesTable,
  activityExecutionsTable,
  activityTypeConfigurationsTable,
  campaignCostDimensionsTable,
  campaignCostsTable,
  campaignHistoryTable,
  campaignPlanningPeriodsTable,
  fiscalPeriodsTable,
  campaignProductAssociationsTable,
  campaignsTable,
  budgetHistoryTable,
  db,
  governedValuesTable,
  taxonomyReviewRequestsTable,
} from "@workspace/db";
import { activityAllocation, containsRawPrompt, setupIssues } from "../lib/campaign-domain";
import { configurationResponse, executionResponse, isProtectedMcpConfiguration } from "./channel-activities";

const router: IRouter = Router();
router.use(requireMutationAuth);


function dateString(value: Date | null | undefined): string | null | undefined {
  return value == null ? value : value.toISOString().slice(0, 10);
}

function campaignResponse(row: typeof campaignsTable.$inferSelect) {
  return {
    ...row,
    setupData: row.setupData as Record<string, unknown>,
    issueSummary: row.issueSummary as string[],
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readiness(campaign: typeof campaignsTable.$inferSelect) {
  const [audiences, products] = await Promise.all([
    db.select().from(campaignAudienceSelectionsTable).where(eq(campaignAudienceSelectionsTable.campaignKey, campaign.campaignKey)),
    db.select().from(campaignProductAssociationsTable).where(eq(campaignProductAssociationsTable.campaignKey, campaign.campaignKey)),
  ]);
  const issues = setupIssues({ ...campaign, audienceCount: audiences.length, productCount: products.length });
  if (!audiences.some((item) => item.dimension === "segment_family" && item.isPrimary)) {
    issues.push("One primary segment is required");
  }
  if (!audiences.some((item) => item.dimension === "persona")) issues.push("At least one meaningful persona is required");
  const probableDuplicates = await db.select().from(campaignsTable).where(and(
    ilike(campaignsTable.name, campaign.name),
    eq(campaignsTable.campaignType, campaign.campaignType),
  ));
  return {
    ready: issues.length === 0,
    issues,
    probableDuplicates: probableDuplicates.filter((item) => item.campaignKey !== campaign.campaignKey).map(campaignResponse),
  };
}

router.get("/campaigns", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const parsed = ListCampaignsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [or(eq(campaignsTable.status, "draft"), eq(campaignsTable.status, "submitted"), eq(campaignsTable.status, "approved"))!];
  if (parsed.data.status) filters.push(eq(campaignsTable.status, parsed.data.status));
  if (parsed.data.search) {
    const term = `%${parsed.data.search.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(campaignsTable.name, term), sql`${campaignsTable.campaignKey}::text ILIKE ${term}`)!);
  }
  const rows = await db.select().from(campaignsTable).where(and(...filters)).orderBy(desc(campaignsTable.updatedAt));
  res.json(ListCampaignsResponse.parse(rows.map(campaignResponse)));
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const body = CreateCampaignBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (body.data.relationshipType === "new" && (body.data.parentCampaignKey || body.data.copiedFromCampaignKey)) {
    res.status(400).json({ error: "A new campaign cannot have an inherited or copied source" }); return;
  }
  const sourceKey = body.data.relationshipType === "copy" ? body.data.copiedFromCampaignKey : body.data.parentCampaignKey;
  const [source] = sourceKey
    ? await db.select().from(campaignsTable).where(eq(campaignsTable.campaignKey, sourceKey))
    : [undefined];
  if (sourceKey && !source) { res.status(400).json({ error: "Related campaign does not exist" }); return; }
  const created = await db.transaction(async (tx) => {
    const [row] = await tx.insert(campaignsTable).values({
      ...body.data,
      startDate: dateString(body.data.startDate),
      endDate: dateString(body.data.endDate),
      reviewDate: dateString(body.data.reviewDate),
      objective: body.data.objective ?? source?.objective,
      customerNeed: body.data.customerNeed ?? source?.customerNeed,
      desiredAction: body.data.desiredAction ?? source?.desiredAction,
      deliverySummary: body.data.deliverySummary ?? source?.deliverySummary,
      isEvergreen: body.data.isEvergreen ?? false,
      setupData: { ...(source?.setupData as object ?? {}), ...(body.data.setupData ?? {}) },
      createdBy: actorId,
      updatedBy: actorId,
    }).returning();
    await tx.insert(campaignHistoryTable).values({
      campaignKey: row.campaignKey, action: "draft_created", actorId, reason: "Guided setup draft created", snapshot: row,
    });
    if (source) {
      const inheritedAudience = await tx.select().from(campaignAudienceSelectionsTable)
        .where(eq(campaignAudienceSelectionsTable.campaignKey, source.campaignKey));
      if (inheritedAudience.length) await tx.insert(campaignAudienceSelectionsTable).values(inheritedAudience.map(({ id, campaignKey, createdAt, ...item }) => ({ ...item, campaignKey: row.campaignKey })));
      const inheritedProducts = await tx.select().from(campaignProductAssociationsTable)
        .where(eq(campaignProductAssociationsTable.campaignKey, source.campaignKey));
      if (inheritedProducts.length) await tx.insert(campaignProductAssociationsTable).values(inheritedProducts.map(({ id, campaignKey, createdAt, ...item }) => ({ ...item, campaignKey: row.campaignKey })));
    }
    return row;
  });
  res.status(201).json(CreateCampaignResponse.parse(campaignResponse(created)));
});

router.get("/campaigns/:campaignKey", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.campaignKey, params.data.campaignKey));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const [audiences, products, activities, costs, periods, history, budgetHistory] = await Promise.all([
    db.select().from(campaignAudienceSelectionsTable).where(eq(campaignAudienceSelectionsTable.campaignKey, campaign.campaignKey)),
    db.select().from(campaignProductAssociationsTable).where(eq(campaignProductAssociationsTable.campaignKey, campaign.campaignKey)),
    db.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.campaignKey, campaign.campaignKey)),
    db.select().from(campaignCostsTable).where(eq(campaignCostsTable.campaignKey, campaign.campaignKey)),
    db.select().from(campaignPlanningPeriodsTable).where(eq(campaignPlanningPeriodsTable.campaignKey, campaign.campaignKey)),
    db.select().from(campaignHistoryTable).where(eq(campaignHistoryTable.campaignKey, campaign.campaignKey)).orderBy(desc(campaignHistoryTable.createdAt)),
    db.select().from(budgetHistoryTable).where(eq(budgetHistoryTable.campaignKey, campaign.campaignKey)).orderBy(desc(budgetHistoryTable.createdAt)),
  ]);
  const [activityProducts, activityAllocations, activityExecutions, activityConfigurations, costDimensions] = await Promise.all([
    activities.length
      ? db.select().from(activityProductAssociationsTable).where(inArray(activityProductAssociationsTable.activityId, activities.map((item) => item.id)))
      : Promise.resolve([] as (typeof activityProductAssociationsTable.$inferSelect)[]),
    activities.length
      ? db.select().from(activityPeriodAllocationsTable).where(inArray(activityPeriodAllocationsTable.activityId, activities.map((item) => item.id)))
      : Promise.resolve([] as (typeof activityPeriodAllocationsTable.$inferSelect)[]),
    activities.length
      ? db.select().from(activityExecutionsTable).where(inArray(activityExecutionsTable.activityId, activities.map((item) => item.id)))
      : Promise.resolve([] as (typeof activityExecutionsTable.$inferSelect)[]),
    activities.some((item) => item.configurationId)
      ? db.select().from(activityTypeConfigurationsTable).where(inArray(
        activityTypeConfigurationsTable.id,
        activities.flatMap((item) => item.configurationId ? [item.configurationId] : []),
      ))
      : Promise.resolve([] as (typeof activityTypeConfigurationsTable.$inferSelect)[]),
    costs.length
      ? db.select().from(campaignCostDimensionsTable).where(inArray(campaignCostDimensionsTable.costId, costs.map((item) => item.id)))
      : Promise.resolve([] as (typeof campaignCostDimensionsTable.$inferSelect)[]),
  ]);
  res.json(GetCampaignResponse.parse({
    ...campaignResponse(campaign),
    audiences: audiences.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    products: products.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    activities: activities.map((item) => activityResponse(
      item,
      activityProducts.filter((association) => association.activityId === item.id).map((association) => association.productValueId),
    )).map((item) => ({
      ...item,
      periodAllocations: activityAllocations.filter((allocation) => allocation.activityId === item.id),
      executions: activityExecutions.filter((execution) => execution.activityId === item.id).map(executionResponse),
      configuration: item.configurationId
        ? configurationResponse(activityConfigurations.find((configuration) => configuration.id === item.configurationId)!)
        : null,
    })),
    costs: costs.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      dimensions: costDimensions.filter((allocation) => allocation.costId === item.id).map((allocation) => ({
        ...allocation,
        metadata: allocation.metadata as Record<string, unknown>,
      })),
    })),
    planningPeriods: periods.map(planningPeriodResponse),
    history: [...history, ...budgetHistory]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((item) => ({
        id: item.id,
        campaignKey: item.campaignKey,
        action: item.action,
        actorId: item.actorId,
        reason: item.reason,
        snapshot: Array.isArray(item.snapshot)
          ? { items: item.snapshot }
          : item.snapshot as Record<string, unknown>,
        createdAt: item.createdAt.toISOString(),
      })),
  }));
});

router.patch("/campaigns/:campaignKey", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = UpdateCampaignParams.safeParse(req.params);
  const body = UpdateCampaignBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid campaign update" }); return; }
  const { rowVersion, reason, ...values } = body.data;
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(campaignsTable).set({
      ...values, rowVersion: rowVersion + 1, updatedBy: actorId, updatedAt: new Date(),
      startDate: dateString(values.startDate),
      endDate: dateString(values.endDate),
      reviewDate: dateString(values.reviewDate),
    }).where(and(
      eq(campaignsTable.campaignKey, params.data.campaignKey),
      eq(campaignsTable.status, "draft"),
      eq(campaignsTable.rowVersion, rowVersion),
    )).returning();
    if (row) await tx.insert(campaignHistoryTable).values({ campaignKey: row.campaignKey, action: "draft_updated", actorId, reason, snapshot: row });
    return row;
  });
  if (!updated) { res.status(409).json({ error: "Only the current version of a draft may be updated" }); return; }
  res.json(UpdateCampaignResponse.parse(campaignResponse(updated)));
});

router.delete("/campaigns/:campaignKey", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = ArchiveCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid campaign key" }); return; }
  const [row] = await db.update(campaignsTable).set({ status: "archived", updatedBy: actorId, updatedAt: new Date() })
    .where(and(eq(campaignsTable.campaignKey, params.data.campaignKey), eq(campaignsTable.status, "draft"))).returning();
  if (!row) { res.status(409).json({ error: "Only drafts may be archived" }); return; }
  await db.insert(campaignHistoryTable).values({ campaignKey: row.campaignKey, action: "archived", actorId, reason: "Draft archived", snapshot: row });
  res.sendStatus(204);
});

router.get("/campaigns/:campaignKey/readiness", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = GetCampaignReadinessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid campaign key" }); return; }
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.campaignKey, params.data.campaignKey));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(GetCampaignReadinessResponse.parse(await readiness(campaign)));
});

router.post("/campaigns/:campaignKey/submit", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = SubmitCampaignParams.safeParse(req.params);
  const body = SubmitCampaignBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid submission" }); return; }
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.campaignKey, params.data.campaignKey));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const result = await readiness(campaign);
  if (!result.ready) { res.status(409).json(GetCampaignReadinessResponse.parse(result)); return; }
  const [updated] = await db.update(campaignsTable).set({
    status: "submitted", submittedAt: new Date(), issueSummary: [], rowVersion: campaign.rowVersion + 1, updatedAt: new Date(), updatedBy: actorId,
  }).where(and(eq(campaignsTable.campaignKey, campaign.campaignKey), eq(campaignsTable.status, "draft"))).returning();
  if (!updated) { res.status(409).json({ error: "Campaign is no longer a draft" }); return; }
  await db.insert(campaignHistoryTable).values({ campaignKey: updated.campaignKey, action: "submitted", actorId, reason: body.data.reason, snapshot: updated });
  res.json(SubmitCampaignResponse.parse(campaignResponse(updated)));
});

router.put("/campaigns/:campaignKey/audiences", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = ReplaceCampaignAudiencesParams.safeParse(req.params);
  const body = ReplaceCampaignAudiencesBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid audience plan" }); return; }
  const selections = body.data.selections;
  const keys = selections.map((item) => `${item.dimension}:${item.governedValueId ?? item.unresolvedLabel?.toLowerCase()}`);
  if (new Set(keys).size !== keys.length) { res.status(400).json({ error: "Duplicate audience selections are not allowed" }); return; }
  if (selections.filter((item) => item.dimension === "segment_family" && item.isPrimary).length !== 1) {
    res.status(400).json({ error: "Exactly one primary segment is required" }); return;
  }
  if (selections.some((item) => item.dimension === "account_size_tier" && !item.measurementBasis)) {
    res.status(400).json({ error: "Account size tiers require a measurement basis and threshold" }); return;
  }
  const governedIds = selections.flatMap((item) => item.governedValueId ? [item.governedValueId] : []);
  const governed = governedIds.length ? await db.select().from(governedValuesTable).where(or(...governedIds.map((id) => eq(governedValuesTable.id, id)))) : [];
  if (governed.length !== new Set(governedIds).size) { res.status(400).json({ error: "Audience plan references an unknown governed value" }); return; }
  const invalidPersona = governed.some((value) => value.category === "persona" && /^(other|all|mixed-title)$/i.test(value.displayName));
  if (invalidPersona) { res.status(400).json({ error: "Other, All, and Mixed-title require an unresolved governance request, not a permanent persona" }); return; }
  const rows = await db.transaction(async (tx) => {
    await tx.delete(campaignAudienceSelectionsTable).where(eq(campaignAudienceSelectionsTable.campaignKey, params.data.campaignKey));
    const unresolved = selections.filter((item) => item.unresolvedLabel);
    for (const item of unresolved) await tx.insert(taxonomyReviewRequestsTable).values({
      category: item.dimension === "segment_family" ? "segment" : item.dimension,
      proposedName: item.unresolvedLabel!,
      context: `Unresolved campaign audience classification for ${params.data.campaignKey}`,
      requestedBy: actorId,
    });
    if (!selections.length) return [];
    return tx.insert(campaignAudienceSelectionsTable).values(selections.map((item) => ({
      ...item,
      campaignKey: params.data.campaignKey,
      warningCodes: [
        ...(item.estimatedAudienceCount != null && item.estimatedAudienceCount < 100 ? ["TOO_SMALL"] : []),
        ...(item.estimatedAudienceCount != null && item.estimatedAudienceCount > 10_000_000 ? ["TOO_BROAD"] : []),
        ...(!item.governedValueId ? ["UNRESOLVED_CLASSIFICATION"] : []),
      ],
    }))).returning();
  });
  res.json(ReplaceCampaignAudiencesResponse.parse(rows.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))));
});

router.put("/campaigns/:campaignKey/products", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = ReplaceCampaignProductsParams.safeParse(req.params);
  const body = ReplaceCampaignProductsBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid product plan" }); return; }
  const keys = body.data.associations.map((item) => `${item.productValueId}:${item.role}`);
  if (new Set(keys).size !== keys.length) { res.status(400).json({ error: "Duplicate product associations are not allowed" }); return; }
  const values = body.data.associations.length
    ? await db.select().from(governedValuesTable).where(or(...body.data.associations.map((item) => eq(governedValuesTable.id, item.productValueId))))
    : [];
  if (values.length !== new Set(body.data.associations.map((item) => item.productValueId)).size ||
      values.some((value) => !["product", "capability_solution"].includes(value.category))) {
    res.status(400).json({ error: "Associations must reference governed products or capabilities" }); return;
  }
  const rows = await db.transaction(async (tx) => {
    await tx.delete(campaignProductAssociationsTable).where(eq(campaignProductAssociationsTable.campaignKey, params.data.campaignKey));
    if (!body.data.associations.length) return [];
    return tx.insert(campaignProductAssociationsTable).values(body.data.associations.map((item) => ({
      ...item, campaignKey: params.data.campaignKey,
    }))).returning();
  });
  res.json(ReplaceCampaignProductsResponse.parse(rows.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))));
});

async function validateActivityProducts(campaignKey: string, productValueIds: string[]): Promise<string | null> {
  if (new Set(productValueIds).size !== productValueIds.length) return "Duplicate activity products are not allowed";
  if (!productValueIds.length) return null;
  const campaignProducts = await db.select().from(campaignProductAssociationsTable)
    .where(eq(campaignProductAssociationsTable.campaignKey, campaignKey));
  const allowed = new Set(campaignProducts.map((item) => item.productValueId));
  return productValueIds.some((id) => !allowed.has(id))
    ? "An activity may only promote a subset of its campaign products"
    : null;
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && new Set(left).size === new Set(right).size
    && left.every((value) => right.includes(value));
}

function campaignInheritanceError(
  configuration: ActivityConfiguration | undefined,
  campaign: typeof campaignsTable.$inferSelect,
  campaignProductIds: string[],
  input: { deliveryStartDate: string; deliveryEndDate: string; productValueIds: string[] },
): string | null {
  if (!configuration) return null;
  const inherited = new Set(configuration.inheritableFields);
  const overrides = new Set(configuration.permittedOverrides);
  if (inherited.has("deliveryStartDate") && !overrides.has("deliveryStartDate")
    && campaign.startDate && input.deliveryStartDate !== campaign.startDate) {
    return "deliveryStartDate is inherited from the campaign and is not a permitted override";
  }
  const campaignEnd = campaign.isEvergreen ? campaign.reviewDate : campaign.endDate;
  if (inherited.has("deliveryEndDate") && !overrides.has("deliveryEndDate")
    && campaignEnd && input.deliveryEndDate !== campaignEnd) {
    return "deliveryEndDate is inherited from the campaign and is not a permitted override";
  }
  if (inherited.has("productValueIds") && !overrides.has("productValueIds")
    && !sameStringSet(input.productValueIds, campaignProductIds)) {
    return "productValueIds are inherited from the campaign and are not a permitted override";
  }
  return null;
}

function activityResponse(row: typeof campaignActivitiesTable.$inferSelect, productValueIds: string[]) {
  return {
    ...row,
    externalIds: row.externalIds as Record<string, unknown>,
    configurationAnswers: row.configurationAnswers as Record<string, unknown>,
    productValueIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function renderActivityName(template: string, campaignName: string, activityType: string, baseName: string, values: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_all, key: string) => {
    const value = ({ campaign: campaignName, activityType, name: baseName, ...values })[key];
    if (value == null || typeof value === "object") throw new Error(`Unknown or unusable naming template placeholder: ${key}`);
    return String(value);
  });
}

function nextUtcDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function hasFiscalCoverageGap(periods: Array<{ fiscalPeriod: { startDate: string; endDate: string } }>): boolean {
  return periods.some((period, index) => index > 0
    && period.fiscalPeriod.startDate !== nextUtcDate(periods[index - 1]!.fiscalPeriod.endDate));
}

type ActivityConfiguration = typeof activityTypeConfigurationsTable.$inferSelect;

async function validateConfiguredActivity(input: {
  campaignKey: string;
  configurationId?: string | null;
  channelValueId?: string | null;
  parentActivityId?: string | null;
  activityType?: string | null;
  owner?: string | null;
  status?: string | null;
  configurationAnswers?: Record<string, unknown>;
  externalIds?: Record<string, unknown>;
  landingDestination?: string | null;
}): Promise<{
  configuration?: ActivityConfiguration;
  parent?: typeof campaignActivitiesTable.$inferSelect;
  error?: string;
}> {
  let configuration: ActivityConfiguration | undefined;
  let parent: typeof campaignActivitiesTable.$inferSelect | undefined;
  if (input.parentActivityId) {
    [parent] = await db.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.id, input.parentActivityId));
    if (!parent || parent.campaignKey !== input.campaignKey) return { error: "Parent activity must belong to the same campaign" };
  }
  if (input.configurationId) {
    [configuration] = await db.select().from(activityTypeConfigurationsTable)
      .where(eq(activityTypeConfigurationsTable.id, input.configurationId));
    if (!configuration || configuration.status !== "published") return { error: "Activity configuration must be published" };
    if (input.activityType && input.activityType !== configuration.stableKey) return { error: "Activity type is determined by its configuration" };
    if (configuration.channelValueId && configuration.channelValueId !== input.channelValueId) {
      return { error: "Activity channel must match its governed configuration channel" };
    }
    const answers = input.configurationAnswers ?? {};
    const rules = configuration.validations as { ownerRequired?: boolean; requiredFields?: string[]; allowedStatuses?: string[] };
    if (rules.ownerRequired && !input.owner) return { error: "owner is required by the activity configuration" };
    if (rules.requiredFields?.some((field) => {
      const value = (input as Record<string, unknown>)[field] ?? answers[field];
      return value == null || value === "";
    })) return { error: "A required configured field is missing" };
    const effectiveStatus = input.status ?? "draft";
    if (rules.allowedStatuses && !rules.allowedStatuses.includes(effectiveStatus)) return { error: "Activity status is not allowed by its configuration" };
    const questions = configuration.questions as Array<{
      key: string;
      required?: boolean;
      options?: string[];
      requiredWhen?: { field: string; equals: unknown };
    }>;
    for (const question of questions) {
      const answer = answers[question.key];
      const conditionallyRequired = question.requiredWhen
        ? answers[question.requiredWhen.field] === question.requiredWhen.equals
        : false;
      if ((question.required || conditionallyRequired) && (answer == null || answer === "")) {
        return { error: `${question.key} is required by the activity configuration` };
      }
      if (answer != null && question.options?.length && !question.options.includes(String(answer))) {
        return { error: `${question.key} must use a controlled configured value` };
      }
    }
    if (parent) {
      const supplied = input as Record<string, unknown>;
      const inherited = parent as unknown as Record<string, unknown>;
      for (const field of configuration.inheritableFields) {
        if (supplied[field] != null && supplied[field] !== inherited[field] && !configuration.permittedOverrides.includes(field)) {
          return { error: `${field} is inherited and is not a permitted override` };
        }
      }
    }
  }
  const isMcp = await isProtectedMcpConfiguration(configuration, input.activityType);
  if (isMcp) {
    const intentCategory = input.configurationAnswers?.intentCategory;
    const controlled = ["awareness", "consideration", "evaluation", "conversion", "retention"];
    if (!controlled.includes(String(intentCategory ?? ""))) return { error: "MCP activities require a controlled intentCategory" };
    if (containsRawPrompt({
      configurationAnswers: input.configurationAnswers,
      externalIds: input.externalIds,
      landingDestination: input.landingDestination,
    })) return { error: "MCP configuration, URLs, and analytics fields cannot contain raw prompt text" };
  }
  return { configuration, parent };
}

router.post("/campaigns/:campaignKey/activities", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = CreateCampaignActivityParams.safeParse(req.params);
  const body = CreateCampaignActivityBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid activity" }); return; }
  const deliveryStartDate = dateString(body.data.deliveryStartDate)!;
  const deliveryEndDate = dateString(body.data.deliveryEndDate)!;
  if (deliveryEndDate < deliveryStartDate) { res.status(400).json({ error: "Delivery end cannot precede delivery start" }); return; }
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.campaignKey, params.data.campaignKey));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const campaignEnd = campaign.isEvergreen ? campaign.reviewDate : campaign.endDate;
  if ((campaign.startDate && deliveryStartDate < campaign.startDate) || (campaignEnd && deliveryEndDate > campaignEnd)) {
    res.status(400).json({ error: "Activity dates must be within campaign dates" }); return;
  }
  try {
    if (BigInt(body.data.authoritativeCostMinor) < 0n) throw new Error();
  } catch {
    res.status(400).json({ error: "Activity cost must be a nonnegative integer minor-unit amount" }); return;
  }
  const productError = await validateActivityProducts(params.data.campaignKey, body.data.productValueIds);
  if (productError) { res.status(400).json({ error: productError }); return; }
  const configured = await validateConfiguredActivity({ ...body.data, campaignKey: params.data.campaignKey });
  if (configured.error) { res.status(400).json({ error: configured.error }); return; }
  const campaignProducts = await db.select().from(campaignProductAssociationsTable)
    .where(eq(campaignProductAssociationsTable.campaignKey, params.data.campaignKey));
  const inheritanceError = campaignInheritanceError(
    configured.configuration,
    campaign,
    campaignProducts.map((item) => item.productValueId),
    { deliveryStartDate, deliveryEndDate, productValueIds: body.data.productValueIds },
  );
  if (inheritanceError) { res.status(400).json({ error: inheritanceError }); return; }
  if (body.data.channelValueId) {
    const [channel] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, body.data.channelValueId));
    if (!channel || channel.category !== "channel") { res.status(400).json({ error: "Channel must reference a governed channel" }); return; }
  }
  try {
    const row = await db.transaction(async (tx) => {
      const campaignPeriods = await tx.select({ id: campaignPlanningPeriodsTable.id, status: campaignPlanningPeriodsTable.status, fiscalPeriod: fiscalPeriodsTable })
        .from(campaignPlanningPeriodsTable).innerJoin(fiscalPeriodsTable, eq(fiscalPeriodsTable.id, campaignPlanningPeriodsTable.fiscalPeriodId))
        .where(eq(campaignPlanningPeriodsTable.campaignKey, params.data.campaignKey))
        .for("update");
      const touched = campaignPeriods
        .filter((period) => period.fiscalPeriod.startDate <= deliveryEndDate && period.fiscalPeriod.endDate >= deliveryStartDate)
        .sort((left, right) => left.fiscalPeriod.startDate.localeCompare(right.fiscalPeriod.startDate));
      if (touched.some((period) => period.status === "closed")) {
        throw new Error("LOCKED");
      }
      if (campaignPeriods.length && (!touched.length
        || touched[0]!.fiscalPeriod.startDate > deliveryStartDate
        || touched[touched.length - 1]!.fiscalPeriod.endDate < deliveryEndDate
        || hasFiscalCoverageGap(touched))) {
        throw new Error("UNCOVERED");
      }
      const { productValueIds, ...input } = body.data;
      if (configured.configuration && configured.parent) {
        const mutableInput = input as Record<string, unknown>;
        const parent = configured.parent as unknown as Record<string, unknown>;
        for (const field of configured.configuration.inheritableFields) {
          if (mutableInput[field] == null && parent[field] != null) mutableInput[field] = parent[field];
        }
      }
      if (configured.configuration) {
        try {
          input.name = renderActivityName(
            configured.configuration.namingTemplate,
            campaign.name,
            configured.configuration.stableKey,
            input.name,
            { ...(input as Record<string, unknown>), ...(input.configurationAnswers ?? {}) },
          );
        } catch (error: any) {
          throw new Error(`TEMPLATE_ERROR:${error.message}`);
        }
      }
      const [created] = await tx.insert(campaignActivitiesTable).values({
        ...input,
        configurationVersion: configured.configuration?.version,
        activityType: configured.configuration?.stableKey ?? input.activityType,
        campaignKey: params.data.campaignKey,
        deliveryStartDate,
        deliveryEndDate,
        accountingDate: dateString(input.accountingDate),
        createdBy: actorId,
        updatedBy: actorId,
      }).returning();
      if (productValueIds.length) await tx.insert(activityProductAssociationsTable).values(
        productValueIds.map((productValueId) => ({ activityId: created.id, productValueId })),
      );
      if (campaignPeriods.length) {
        const allocations = activityAllocation("daily", created.authoritativeCostMinor, deliveryStartDate, deliveryEndDate,
          touched.map((item) => ({ id: item.id, stableKey: item.fiscalPeriod.stableKey, fiscalYear: item.fiscalPeriod.fiscalYear, fiscalQuarter: item.fiscalPeriod.fiscalQuarter, fiscalPeriod: item.fiscalPeriod.fiscalPeriod, startDate: item.fiscalPeriod.startDate, endDate: item.fiscalPeriod.endDate })));
        await tx.insert(activityPeriodAllocationsTable).values(allocations.map((allocation) => ({
          activityId: created.id, campaignPlanningPeriodId: allocation.key, allocationMethod: "daily", amountMinor: allocation.amountMinor,
        })));
      }
      await tx.insert(campaignHistoryTable).values({
        campaignKey: created.campaignKey, action: "activity_created", actorId,
        reason: "Campaign activity created", snapshot: { ...created, productValueIds },
      });
      return created;
    });
    res.status(201).json(CreateCampaignActivityResponse.parse(activityResponse(row, body.data.productValueIds)));
  } catch (error: any) {
    if (error.message === "LOCKED") {
      res.status(423).json({ error: "Activities cannot be created while a campaign period is closed" });
    } else if (error.message === "UNCOVERED") {
      res.status(409).json({ error: "Activity dates are not fully covered by campaign planning periods" });
    } else {
      req.log.warn({ err: error }, "Unable to create campaign activity");
      res.status(409).json({ error: "Campaign does not exist or activity references are invalid" });
    }
  }
});

router.patch("/activities/:activityId", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = UpdateCampaignActivityParams.safeParse(req.params);
  const body = UpdateCampaignActivityBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid activity update" }); return; }

  const deliveryStartDate = dateString(body.data.deliveryStartDate)!;
  const deliveryEndDate = dateString(body.data.deliveryEndDate)!;
  if (deliveryEndDate < deliveryStartDate) { res.status(400).json({ error: "Delivery end cannot precede delivery start" }); return; }
  try {
    if (BigInt(body.data.authoritativeCostMinor) < 0n) throw new Error();
  } catch {
    res.status(400).json({ error: "Activity cost must be a nonnegative integer minor-unit amount" }); return;
  }

  if (body.data.channelValueId) {
    const [channel] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, body.data.channelValueId));
    if (!channel || channel.category !== "channel") { res.status(400).json({ error: "Channel must reference a governed channel" }); return; }
  }

  try {
    const row = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.id, params.data.activityId));
      if (!current) throw new Error("NOT_FOUND");
      if (body.data.rowVersion != null && body.data.rowVersion !== current.rowVersion) throw new Error("STALE");
      const [campaign] = await tx.select().from(campaignsTable).where(eq(campaignsTable.campaignKey, current.campaignKey));
      if (!campaign) throw new Error("NOT_FOUND");
      const campaignEnd = campaign.isEvergreen ? campaign.reviewDate : campaign.endDate;
      if ((campaign.startDate && deliveryStartDate < campaign.startDate) || (campaignEnd && deliveryEndDate > campaignEnd)) {
        throw new Error("DATE_BOUNDS");
      }

      const productError = await validateActivityProducts(current.campaignKey, body.data.productValueIds);
      if (productError) throw new Error("PRODUCT_ERROR:" + productError);
      const configured = await validateConfiguredActivity({
        ...current,
        ...body.data,
        configurationAnswers: body.data.configurationAnswers ?? current.configurationAnswers as Record<string, unknown>,
        externalIds: body.data.externalIds ?? current.externalIds as Record<string, unknown>,
        campaignKey: current.campaignKey,
      });
      if (configured.error) throw new Error("CONFIG_ERROR:" + configured.error);
      const campaignProducts = await tx.select().from(campaignProductAssociationsTable)
        .where(eq(campaignProductAssociationsTable.campaignKey, current.campaignKey));
      const inheritanceError = campaignInheritanceError(
        configured.configuration,
        campaign,
        campaignProducts.map((item) => item.productValueId),
        { deliveryStartDate, deliveryEndDate, productValueIds: body.data.productValueIds },
      );
      if (inheritanceError) throw new Error("CONFIG_ERROR:" + inheritanceError);

      const campaignPeriods = await tx.select({
        id: campaignPlanningPeriodsTable.id,
        status: campaignPlanningPeriodsTable.status,
        fiscalPeriod: fiscalPeriodsTable,
      })
        .from(campaignPlanningPeriodsTable)
        .innerJoin(fiscalPeriodsTable, eq(fiscalPeriodsTable.id, campaignPlanningPeriodsTable.fiscalPeriodId))
        .where(eq(campaignPlanningPeriodsTable.campaignKey, current.campaignKey))
        .for("update");
      const existingAllocations = await tx.select({ campaignPlanningPeriodId: activityPeriodAllocationsTable.campaignPlanningPeriodId })
        .from(activityPeriodAllocationsTable)
        .where(eq(activityPeriodAllocationsTable.activityId, current.id));
      const existingPeriodIds = new Set(existingAllocations.map((item) => item.campaignPlanningPeriodId));
      const touched = campaignPeriods
        .filter((period) => period.fiscalPeriod.startDate <= deliveryEndDate && period.fiscalPeriod.endDate >= deliveryStartDate)
        .sort((left, right) => left.fiscalPeriod.startDate.localeCompare(right.fiscalPeriod.startDate));
      if (campaignPeriods.some((item) => existingPeriodIds.has(item.id) && item.status === "closed")
        || touched.some((item) => item.status === "closed")) {
        throw new Error("LOCKED");
      }
      if (campaignPeriods.length && (!touched.length
        || touched[0]!.fiscalPeriod.startDate > deliveryStartDate
        || touched[touched.length - 1]!.fiscalPeriod.endDate < deliveryEndDate
        || hasFiscalCoverageGap(touched))) {
        throw new Error("UNCOVERED");
      }

      const { productValueIds, reason, ...input } = body.data;
      if (configured.configuration && input.name !== current.name) {
        try {
          input.name = renderActivityName(
            configured.configuration.namingTemplate,
            campaign.name,
            configured.configuration.stableKey,
            input.name,
            { ...(input as Record<string, unknown>), ...(input.configurationAnswers ?? {}) },
          );
        } catch (error: any) {
          throw new Error(`TEMPLATE_ERROR:${error.message}`);
        }
      }
      const [updated] = await tx.update(campaignActivitiesTable).set({
        ...input,
        configurationVersion: configured.configuration?.version ?? current.configurationVersion,
        activityType: configured.configuration?.stableKey ?? input.activityType ?? current.activityType,
        rowVersion: current.rowVersion + 1,
        updatedBy: actorId,
        updatedAt: new Date(),
        deliveryStartDate,
        deliveryEndDate,
        accountingDate: dateString(input.accountingDate),
      }).where(eq(campaignActivitiesTable.id, current.id)).returning();

      await tx.delete(activityProductAssociationsTable).where(eq(activityProductAssociationsTable.activityId, current.id));
      if (productValueIds.length) await tx.insert(activityProductAssociationsTable).values(
        productValueIds.map((productValueId) => ({ activityId: current.id, productValueId })),
      );
      if (campaignPeriods.length) {
        const allocations = activityAllocation(
          "daily",
          updated.authoritativeCostMinor,
          deliveryStartDate,
          deliveryEndDate,
          touched.map((item) => ({
            id: item.id,
            stableKey: item.fiscalPeriod.stableKey,
            fiscalYear: item.fiscalPeriod.fiscalYear,
            fiscalQuarter: item.fiscalPeriod.fiscalQuarter,
            fiscalPeriod: item.fiscalPeriod.fiscalPeriod,
            startDate: item.fiscalPeriod.startDate,
            endDate: item.fiscalPeriod.endDate,
          })),
        );
        await tx.delete(activityPeriodAllocationsTable).where(eq(activityPeriodAllocationsTable.activityId, current.id));
        await tx.insert(activityPeriodAllocationsTable).values(allocations.map((allocation) => ({
          activityId: current.id,
          campaignPlanningPeriodId: allocation.key,
          allocationMethod: "daily",
          amountMinor: allocation.amountMinor,
        })));
      }

      await tx.insert(campaignHistoryTable).values({
        campaignKey: current.campaignKey, action: "activity_updated", actorId, reason,
        snapshot: { ...updated, productValueIds },
      });
      return updated;
    });
    res.json(UpdateCampaignActivityResponse.parse(activityResponse(row, body.data.productValueIds)));
  } catch (error: any) {
    if (error.message === "NOT_FOUND") res.status(404).json({ error: "Activity not found" });
    else if (error.message === "STALE") res.status(409).json({ error: "Activity was changed by another actor" });
    else if (error.message === "LOCKED") res.status(423).json({ error: "Activities cannot change while a campaign period is closed" });
    else if (error.message === "DATE_BOUNDS") res.status(400).json({ error: "Activity dates must be within campaign dates" });
    else if (error.message === "UNCOVERED") res.status(409).json({ error: "Activity dates are not fully covered by campaign planning periods" });
    else if (error.message.startsWith("PRODUCT_ERROR:")) res.status(400).json({ error: error.message.slice(14) });
    else if (error.message.startsWith("CONFIG_ERROR:")) res.status(400).json({ error: error.message.slice(13) });
    else if (error.message.startsWith("TEMPLATE_ERROR:")) res.status(400).json({ error: error.message.slice(15) });
    else throw error;
  }
});

function planningPeriodResponse(row: typeof campaignPlanningPeriodsTable.$inferSelect) {
  const approved = BigInt(row.approvedMinor);
  return {
    ...row,
    remainingMinor: (approved - BigInt(row.actualMinor) - BigInt(row.committedMinor)).toString(),
    varianceMinor: (approved - BigInt(row.forecastMinor)).toString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    reopenedAt: row.reopenedAt?.toISOString() ?? null,
  };
}

export { planningPeriodResponse };
export default router;