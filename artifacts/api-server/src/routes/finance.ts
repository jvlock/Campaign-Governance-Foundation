import { getAuditActor, requireMutationAuth } from "../middlewares/mutation-auth";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AllocateActivityAcrossPeriodsBody,
  AllocateActivityAcrossPeriodsParams,
  AllocateActivityAcrossPeriodsResponse,
  CloseCampaignPlanningPeriodBody,
  CloseCampaignPlanningPeriodParams,
  CloseCampaignPlanningPeriodResponse,
  CreateCampaignCostBody,
  CreateCampaignCostParams,
  CreateCampaignCostResponse,
  CreateFiscalCalendarBody,
  CreateFiscalCalendarResponse,
  GenerateCampaignPlanningPeriodsBody,
  GenerateCampaignPlanningPeriodsParams,
  GenerateCampaignPlanningPeriodsResponse,
  GetActiveFiscalCalendarSnapshotParams,
  GetActiveFiscalCalendarSnapshotResponse,
  ListFiscalCalendarsResponse,
  PublishFiscalCalendarSnapshotBody,
  PublishFiscalCalendarSnapshotParams,
  PublishFiscalCalendarSnapshotResponse,
  ReopenCampaignPlanningPeriodBody,
  ReopenCampaignPlanningPeriodParams,
  ReopenCampaignPlanningPeriodResponse,
  ReplaceCampaignCostDimensionsBody,
  ReplaceCampaignCostDimensionsParams,
  ReplaceCampaignCostDimensionsResponse,
  SetCampaignBudgetBody,
  SetCampaignBudgetParams,
  SetCampaignBudgetResponse,
  UpdateCampaignPlanningPeriodBody,
  UpdateCampaignPlanningPeriodParams,
  UpdateCampaignPlanningPeriodResponse,
  UpdateCampaignCostBody,
  UpdateCampaignCostParams,
  UpdateCampaignCostResponse,
} from "@workspace/api-zod";
import {
  activityPeriodAllocationsTable,
  budgetHistoryTable,
  campaignAudienceSelectionsTable,
  campaignActivitiesTable,
  campaignBudgetsTable,
  campaignCostDimensionsTable,
  campaignCostsTable,
  campaignPlanningPeriodsTable,
  campaignProductAssociationsTable,
  campaignsTable,
  db,
  fiscalCalendarsTable,
  fiscalCalendarSnapshotsTable,
  fiscalPeriodsTable,
} from "@workspace/db";
import {
  activityAllocation,
  allocateByWeights,
  parseMinor,
  periodAllocation,
  touchedPeriods,
  type DatedPeriod,
} from "../lib/campaign-domain";
import { planningPeriodResponse } from "./campaigns";
import { requireAdministrator, requireCampaignAccess } from "../lib/campaign-authorization";

const router: IRouter = Router();
router.use(requireMutationAuth);

async function authorizeCampaignKey(req: Parameters<typeof requireCampaignAccess>[0], res: Parameters<typeof requireCampaignAccess>[1], campaignKey: string, mode: "view" | "mutate") {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.campaignKey, campaignKey));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return undefined; }
  return await requireCampaignAccess(req, res, campaign, mode) ? campaign : undefined;
}

async function authorizeCost(req: Parameters<typeof requireCampaignAccess>[0], res: Parameters<typeof requireCampaignAccess>[1], costId: string) {
  const [cost] = await db.select().from(campaignCostsTable).where(eq(campaignCostsTable.id, costId));
  if (!cost) { res.status(404).json({ error: "Resource not found" }); return undefined; }
  return await authorizeCampaignKey(req, res, cost.campaignKey, "mutate") ? cost : undefined;
}

async function authorizePlanningPeriod(req: Parameters<typeof requireCampaignAccess>[0], res: Parameters<typeof requireCampaignAccess>[1], planningPeriodId: string) {
  const [period] = await db.select().from(campaignPlanningPeriodsTable).where(eq(campaignPlanningPeriodsTable.id, planningPeriodId));
  if (!period) { res.status(404).json({ error: "Resource not found" }); return undefined; }
  return await authorizeCampaignKey(req, res, period.campaignKey, "mutate") ? period : undefined;
}

async function authorizeActivity(req: Parameters<typeof requireCampaignAccess>[0], res: Parameters<typeof requireCampaignAccess>[1], activityId: string) {
  const [activity] = await db.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.id, activityId));
  if (!activity) { res.status(404).json({ error: "Resource not found" }); return undefined; }
  return await authorizeCampaignKey(req, res, activity.campaignKey, "mutate") ? activity : undefined;
}


function costResponse(row: typeof campaignCostsTable.$inferSelect) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

router.post("/campaigns/:campaignKey/costs", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = CreateCampaignCostParams.safeParse(req.params);
  const body = CreateCampaignCostBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid campaign cost" }); return; }
  if (!await authorizeCampaignKey(req, res, params.data.campaignKey, "mutate")) return;
  try {
    if (parseMinor(body.data.authoritativeAmountMinor) < 0n) throw new Error("Campaign cost cannot be negative");
  } catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  try {
    const row = await db.transaction(async (tx) => {
      const periods = await tx.select({ status: campaignPlanningPeriodsTable.status })
        .from(campaignPlanningPeriodsTable)
        .where(eq(campaignPlanningPeriodsTable.campaignKey, params.data.campaignKey))
        .for("update");
      if (periods.some((period) => period.status === "closed")) {
        throw new Error("LOCKED");
      }
      const [created] = await tx.insert(campaignCostsTable).values({
        ...body.data, campaignKey: params.data.campaignKey,
      }).returning();
      await tx.insert(budgetHistoryTable).values({
        campaignKey: created.campaignKey, action: "authoritative_cost_created", actorId,
        reason: created.description, snapshot: created,
      });
      return created;
    });
    res.status(201).json(CreateCampaignCostResponse.parse(costResponse(row)));
  } catch (error: any) {
    if (error.message === "LOCKED") {
      res.status(423).json({ error: "Authoritative costs cannot be created while a campaign period is closed" });
    } else {
      res.status(404).json({ error: "Campaign not found" });
    }
  }
});

router.patch("/costs/:costId", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = UpdateCampaignCostParams.safeParse(req.params);
  const body = UpdateCampaignCostBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid campaign cost update" }); return; }
  if (!await authorizeCost(req, res, params.data.costId)) return;
  try {
    if (parseMinor(body.data.authoritativeAmountMinor) < 0n) throw new Error("Campaign cost cannot be negative");
  } catch (error) { res.status(400).json({ error: (error as Error).message }); return; }

  try {
    const row = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(campaignCostsTable).where(eq(campaignCostsTable.id, params.data.costId));
      if (!current) throw new Error("NOT_FOUND");

      const periods = await tx.select().from(campaignPlanningPeriodsTable)
        .where(eq(campaignPlanningPeriodsTable.campaignKey, current.campaignKey))
        .for("update");
      if (periods.some((period) => period.status === "closed")) {
        throw new Error("LOCKED");
      }

      const { reason, ...values } = body.data;
      const [updated] = await tx.update(campaignCostsTable).set(values)
        .where(eq(campaignCostsTable.id, current.id)).returning();
      await tx.insert(budgetHistoryTable).values({
        campaignKey: updated.campaignKey, action: "authoritative_cost_updated", actorId, reason, snapshot: updated,
      });
      return updated;
    });
    res.json(UpdateCampaignCostResponse.parse(costResponse(row)));
  } catch (error: any) {
    if (error.message === "NOT_FOUND") res.status(404).json({ error: "Campaign cost not found" });
    else if (error.message === "LOCKED") res.status(423).json({ error: "Authoritative costs cannot change while a campaign period is closed" });
    else throw error;
  }
});

router.put("/costs/:costId/dimensions", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = ReplaceCampaignCostDimensionsParams.safeParse(req.params);
  const body = ReplaceCampaignCostDimensionsBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid cost-dimension plan" }); return; }
  if (!await authorizeCost(req, res, params.data.costId)) return;

  const allocations = body.data.allocations;
  const pairKeys = allocations.map((item) => `${item.dimension}:${item.dimensionKey}`);
  if (new Set(pairKeys).size !== pairKeys.length) {
    res.status(400).json({ error: "Duplicate allocations within a reporting dimension are not allowed" }); return;
  }
  for (const dimension of new Set(allocations.map((item) => item.dimension))) {
    const total = allocations.filter((item) => item.dimension === dimension)
      .reduce((sum, item) => sum + item.allocationBasisPoints, 0);
    if (total !== 10_000) {
      res.status(400).json({ error: `${dimension} allocations must reconcile exactly to 10000 basis points` }); return;
    }
  }

  try {
    const rows = await db.transaction(async (tx) => {
      const [cost] = await tx.select().from(campaignCostsTable).where(eq(campaignCostsTable.id, params.data.costId));
      if (!cost) throw new Error("NOT_FOUND");

      const periods = await tx.select().from(campaignPlanningPeriodsTable)
        .where(eq(campaignPlanningPeriodsTable.campaignKey, cost.campaignKey))
        .for("update");
      if (periods.some((period) => period.status === "closed")) {
        throw new Error("LOCKED");
      }

      const [products, audiences, activities] = await Promise.all([
        tx.select().from(campaignProductAssociationsTable).where(eq(campaignProductAssociationsTable.campaignKey, cost.campaignKey)),
        tx.select().from(campaignAudienceSelectionsTable).where(eq(campaignAudienceSelectionsTable.campaignKey, cost.campaignKey)),
        tx.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.campaignKey, cost.campaignKey)),
      ]);
      const allowed: Record<string, Set<string>> = {
        product: new Set(products.map((item) => item.productValueId)),
        segment: new Set(audiences.filter((item) => ["segment_family", "subsegment"].includes(item.dimension)).flatMap((item) => item.governedValueId ? [item.governedValueId] : [])),
        region: new Set(audiences.filter((item) => ["region", "country"].includes(item.dimension)).flatMap((item) => item.governedValueId ? [item.governedValueId] : [])),
        channel: new Set(activities.flatMap((item) => item.channelValueId ? [item.channelValueId] : [])),
      };
      const invalid = allocations.find((item) => !allowed[item.dimension]?.has(item.dimensionKey));
      if (invalid) throw new Error("INVALID");

      await tx.delete(campaignCostDimensionsTable).where(eq(campaignCostDimensionsTable.costId, cost.id));
      const newRows = allocations.length
        ? await tx.insert(campaignCostDimensionsTable).values(allocations.map((item) => ({ ...item, costId: cost.id, metadata: item.metadata || {} }))).returning()
        : [];
      await tx.insert(budgetHistoryTable).values({
        campaignKey: cost.campaignKey, action: "cost_dimensions_replaced", actorId,
        reason: "Cost dimension allocation updated", snapshot: { costId: cost.id, dimensions: allocations },
      });
      return newRows;
    });
    res.json(ReplaceCampaignCostDimensionsResponse.parse(rows));
  } catch (error: any) {
    if (error.message === "NOT_FOUND") res.status(404).json({ error: "Campaign cost not found" });
    else if (error.message === "LOCKED") res.status(423).json({ error: "Cost dimensions cannot change while a campaign period is closed" });
    else if (error.message === "INVALID") res.status(400).json({ error: "Allocations must reference existing campaign entities" });
    else throw error;
  }
});

router.get("/fiscal-calendars", async (_req, res): Promise<void> => {
  const rows = await db.select().from(fiscalCalendarsTable).orderBy(asc(fiscalCalendarsTable.name));
  res.json(ListFiscalCalendarsResponse.parse(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))));
});

router.get("/fiscal-calendars/:calendarId/active-snapshot", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = GetActiveFiscalCalendarSnapshotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid fiscal calendar id" }); return; }
  const [calendar] = await db.select().from(fiscalCalendarsTable).where(eq(fiscalCalendarsTable.id, params.data.calendarId));
  if (!calendar?.activeSnapshotId) { res.status(404).json({ error: "Fiscal calendar or active snapshot not found" }); return; }
  const [[snapshot], periods] = await Promise.all([
    db.select().from(fiscalCalendarSnapshotsTable).where(eq(fiscalCalendarSnapshotsTable.id, calendar.activeSnapshotId)),
    db.select().from(fiscalPeriodsTable).where(eq(fiscalPeriodsTable.snapshotId, calendar.activeSnapshotId)).orderBy(asc(fiscalPeriodsTable.startDate)),
  ]);
  if (!snapshot) { res.status(404).json({ error: "Fiscal calendar or active snapshot not found" }); return; }
  res.json(GetActiveFiscalCalendarSnapshotResponse.parse({
    ...snapshot,
    rules: snapshot.rules as Record<string, unknown>,
    createdAt: snapshot.createdAt.toISOString(),
    periods: periods.map((period) => ({ ...period, closedAt: period.closedAt?.toISOString() ?? null })),
  }));
});

router.post("/fiscal-calendars", async (req, res): Promise<void> => {
  if (!await requireAdministrator(req, res)) return;
  const actorId = getAuditActor(req);
  const body = CreateFiscalCalendarBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  try {
    const [row] = await db.insert(fiscalCalendarsTable).values(body.data).returning();
    res.status(201).json(CreateFiscalCalendarResponse.parse({ ...row, createdAt: row.createdAt.toISOString() }));
  } catch {
    res.status(409).json({ error: "Fiscal calendar stable key already exists" });
  }
});

router.post("/fiscal-calendars/:calendarId/snapshots", async (req, res): Promise<void> => {
  if (!await requireAdministrator(req, res)) return;
  const actorId = getAuditActor(req);
  const params = PublishFiscalCalendarSnapshotParams.safeParse(req.params);
  const body = PublishFiscalCalendarSnapshotBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid calendar snapshot" }); return; }
  const periodsAsStrings = body.data.periods.map((period) => ({
    ...period,
    startDate: period.startDate.toISOString().slice(0, 10),
    endDate: period.endDate.toISOString().slice(0, 10),
  }));
  const sorted = periodsAsStrings.sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (new Set(sorted.map(({ stableKey }) => stableKey)).size !== sorted.length ||
      sorted.some((period) => period.endDate < period.startDate) ||
      sorted.some((period, index) => index > 0 && sorted[index - 1]!.endDate >= period.startDate)) {
    res.status(400).json({ error: "Fiscal periods require unique keys, valid ranges, and no overlaps" }); return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [snapshot] = await tx.insert(fiscalCalendarSnapshotsTable).values({
        fiscalCalendarId: params.data.calendarId,
        version: body.data.version,
        rules: body.data.rules,
        isPublished: false,
        createdBy: actorId,
      }).returning();
      const periods = await tx.insert(fiscalPeriodsTable).values(sorted.map((period) => ({
        ...period, snapshotId: snapshot.id,
      }))).returning();
      const [published] = await tx.update(fiscalCalendarSnapshotsTable).set({ isPublished: true })
        .where(eq(fiscalCalendarSnapshotsTable.id, snapshot.id)).returning();
      await tx.update(fiscalCalendarsTable).set({ activeSnapshotId: snapshot.id })
        .where(eq(fiscalCalendarsTable.id, params.data.calendarId));
      return { snapshot: published, periods };
    });
    res.status(201).json(PublishFiscalCalendarSnapshotResponse.parse({
      ...result.snapshot,
      rules: result.snapshot.rules as Record<string, unknown>,
      createdAt: result.snapshot.createdAt.toISOString(),
      periods: result.periods.map((period) => ({ ...period, closedAt: period.closedAt?.toISOString() ?? null })),
    }));
  } catch (error) {
    req.log.warn({ err: error }, "Unable to publish fiscal calendar snapshot");
    res.status(409).json({ error: "Calendar does not exist or snapshot version already exists" });
  }
});

router.put("/campaigns/:campaignKey/budget", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = SetCampaignBudgetParams.safeParse(req.params);
  const body = SetCampaignBudgetBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid campaign budget" }); return; }
  if (!await authorizeCampaignKey(req, res, params.data.campaignKey, "mutate")) return;
  try {
    if (parseMinor(body.data.requestedMinor) < 0n || parseMinor(body.data.approvedMinor) < 0n) throw new Error("Budgets cannot be negative");
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid money value" }); return;
  }

  try {
    const row = await db.transaction(async (tx) => {
      const [campaign] = await tx.select().from(campaignsTable).where(eq(campaignsTable.campaignKey, params.data.campaignKey));
      if (!campaign) throw new Error("NOT_FOUND");

      const existingPeriods = await tx.select().from(campaignPlanningPeriodsTable)
        .where(eq(campaignPlanningPeriodsTable.campaignKey, params.data.campaignKey))
        .for("update");
      if (existingPeriods.some((period) => period.status === "closed")) {
        throw new Error("LOCKED");
      }

      const [budget] = await tx.insert(campaignBudgetsTable).values({
        ...body.data, campaignKey: params.data.campaignKey,
      }).onConflictDoUpdate({
        target: campaignBudgetsTable.campaignKey,
        set: { ...body.data, updatedAt: new Date() },
      }).returning();

      await tx.insert(budgetHistoryTable).values({
        campaignKey: params.data.campaignKey,
        action: "budget_set",
        actorId,
        reason: "Campaign budget configured",
        snapshot: budget,
      });
      return budget;
    });
    res.json(SetCampaignBudgetResponse.parse({ ...row, updatedAt: row.updatedAt.toISOString() }));
  } catch (error: any) {
    if (error.message === "NOT_FOUND") res.status(404).json({ error: "Campaign not found" });
    else if (error.message === "LOCKED") res.status(423).json({ error: "A budget with closed planning periods cannot be replaced" });
    else throw error;
  }
});

router.post("/campaigns/:campaignKey/planning-periods/generate", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = GenerateCampaignPlanningPeriodsParams.safeParse(req.params);
  const body = GenerateCampaignPlanningPeriodsBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid period generation request" }); return; }
  if (!await authorizeCampaignKey(req, res, params.data.campaignKey, "mutate")) return;
  const [[campaign], [budget]] = await Promise.all([
    db.select().from(campaignsTable).where(eq(campaignsTable.campaignKey, params.data.campaignKey)),
    db.select().from(campaignBudgetsTable).where(eq(campaignBudgetsTable.campaignKey, params.data.campaignKey)),
  ]);
  const missingEffectiveEnd = campaign?.isEvergreen ? !campaign.reviewDate : !campaign?.endDate;
  if (!campaign || !budget || !campaign.startDate || missingEffectiveEnd) {
    res.status(409).json({ error: "Campaign dates, evergreen review date, and budget must be configured first" }); return;
  }
  const endDate = campaign.isEvergreen ? campaign.reviewDate! : campaign.endDate!;
  const allPeriods = await db.select().from(fiscalPeriodsTable)
    .where(eq(fiscalPeriodsTable.snapshotId, budget.fiscalCalendarSnapshotId))
    .orderBy(asc(fiscalPeriodsTable.startDate));
  let periods: DatedPeriod[];
  try {
    periods = touchedPeriods(campaign.startDate, endDate, allPeriods);
    if (!periods.length || periods[0]!.startDate > campaign.startDate || periods.at(-1)!.endDate < endDate) {
      throw new Error("Published fiscal snapshot does not cover all campaign dates");
    }
    for (let index = 1; index < periods.length; index += 1) {
      const priorEnd = new Date(`${periods[index - 1]!.endDate}T00:00:00Z`);
      priorEnd.setUTCDate(priorEnd.getUTCDate() + 1);
      if (priorEnd.toISOString().slice(0, 10) !== periods[index]!.startDate) throw new Error("Fiscal snapshot contains a date gap");
    }
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Unable to determine fiscal periods" }); return;
  }
  let approved;
  let requested;
  try {
    const weighted = body.data.method === "activity" || body.data.method === "channel";
    if (weighted && !body.data.allocationWeights?.length) {
      throw new Error(`${body.data.method} allocation requires explicit period weights`);
    }
    if (weighted) {
      const periodIds = new Set(periods.map((period) => period.id));
      const weightIds = body.data.allocationWeights!.map((item) => item.key);
      if (new Set(weightIds).size !== periods.length || weightIds.some((id) => !periodIds.has(id))) {
        throw new Error("Activity/channel weights must cover each touched period exactly once");
      }
    }
    if (weighted) {
      approved = allocateByWeights(budget.approvedMinor, body.data.allocationWeights!.map((item) => ({
          key: item.key,
          weight: parseMinor(item.amountMinor),
        })));
      requested = allocateByWeights(budget.requestedMinor, body.data.allocationWeights!.map((item) => ({
          key: item.key,
          weight: parseMinor(item.amountMinor),
        })));
    } else if (body.data.method === "custom") {
      approved = periodAllocation("custom", budget.approvedMinor, periods, body.data.customAllocations);
      requested = allocateByWeights(budget.requestedMinor, body.data.customAllocations!.map((item) => ({
        key: item.key,
        weight: parseMinor(item.amountMinor),
      })));
    } else {
      const standardMethod = body.data.method as "even" | "monthly" | "quarterly";
      approved = periodAllocation(standardMethod, budget.approvedMinor, periods);
      requested = periodAllocation(standardMethod, budget.requestedMinor, periods);
    }
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Allocation failed" }); return;
  }
  const requestedByPeriod = new Map(requested.map((item) => [item.key, item.amountMinor]));
  try {
    const rows = await db.transaction(async (tx) => {
      const existing = await tx.select().from(campaignPlanningPeriodsTable)
        .where(eq(campaignPlanningPeriodsTable.campaignKey, campaign.campaignKey))
        .for("update");
      if (existing.some((item) => item.status === "closed")) throw new Error("LOCKED");
      await tx.delete(campaignPlanningPeriodsTable).where(eq(campaignPlanningPeriodsTable.campaignKey, campaign.campaignKey));
      const inserted = await tx.insert(campaignPlanningPeriodsTable).values(periods.map((period) => {
        const amount = approved.find((item) => item.key === period.id)!.amountMinor;
        return {
          stableKey: `${campaign.campaignKey}:${period.stableKey}`,
          campaignKey: campaign.campaignKey,
          fiscalPeriodId: period.id,
          readableName: `${period.fiscalYear} ${period.fiscalQuarter} | ${campaign.name}`,
          requestedMinor: requestedByPeriod.get(period.id) ?? "0",
          approvedMinor: amount,
          plannedMinor: amount,
          forecastMinor: amount,
        };
      })).returning();
      await tx.insert(budgetHistoryTable).values({
        campaignKey: campaign.campaignKey, action: "planning_periods_generated", actorId,
        reason: `Exact ${body.data.method} allocation`, snapshot: inserted,
      });
      return inserted;
    });
    const fiscalById = new Map(allPeriods.map((period) => [period.id, period]));
    res.json(GenerateCampaignPlanningPeriodsResponse.parse(rows.map((row) =>
      planningPeriodResponse(row, fiscalById.get(row.fiscalPeriodId)!))));
  } catch (error: any) {
    if (error.message === "LOCKED") {
      res.status(423).json({ error: "Closed planning periods cannot be regenerated" });
      return;
    }
    throw error;
  }
});

router.patch("/planning-periods/:planningPeriodId", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = UpdateCampaignPlanningPeriodParams.safeParse(req.params);
  const body = UpdateCampaignPlanningPeriodBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid planning-period update" }); return; }
  if (!await authorizePlanningPeriod(req, res, params.data.planningPeriodId)) return;
  try {
    [body.data.plannedMinor, body.data.committedMinor, body.data.actualMinor, body.data.forecastMinor]
      .forEach((value) => { if (parseMinor(value) < 0n) throw new Error("Spend values cannot be negative"); });
  } catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  const { rowVersion, reason, ...values } = body.data;
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(campaignPlanningPeriodsTable).set({
      ...values, rowVersion: rowVersion + 1,
    }).where(and(
      eq(campaignPlanningPeriodsTable.id, params.data.planningPeriodId),
      eq(campaignPlanningPeriodsTable.status, "open"),
      eq(campaignPlanningPeriodsTable.rowVersion, rowVersion),
    )).returning();
    if (updated) await tx.insert(budgetHistoryTable).values({
      campaignKey: updated.campaignKey, planningPeriodId: updated.id, action: "values_updated", actorId, reason, snapshot: updated,
    });
    return updated;
  });
  if (!row) { res.status(423).json({ error: "Period is closed or the row version is stale" }); return; }
  const [fiscalPeriod] = await db.select().from(fiscalPeriodsTable)
    .where(eq(fiscalPeriodsTable.id, row.fiscalPeriodId));
  res.json(UpdateCampaignPlanningPeriodResponse.parse(planningPeriodResponse(row, fiscalPeriod!)));
});

router.post("/planning-periods/:planningPeriodId/close", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = CloseCampaignPlanningPeriodParams.safeParse(req.params);
  const body = CloseCampaignPlanningPeriodBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid close request" }); return; }
  if (!await authorizePlanningPeriod(req, res, params.data.planningPeriodId)) return;
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(campaignPlanningPeriodsTable).set({
      status: "closed",
      closedAt: new Date(),
      varianceExplanation: body.data.varianceExplanation,
      unusedBudgetTreatment: body.data.unusedBudgetTreatment,
    }).where(and(eq(campaignPlanningPeriodsTable.id, params.data.planningPeriodId), eq(campaignPlanningPeriodsTable.status, "open"))).returning();
    if (updated) await tx.insert(budgetHistoryTable).values({
      campaignKey: updated.campaignKey, planningPeriodId: updated.id, action: "closed", actorId, reason: body.data.reason, snapshot: updated,
    });
    return updated;
  });
  if (!row) { res.status(409).json({ error: "Planning period is already closed or does not exist" }); return; }
  const [fiscalPeriod] = await db.select().from(fiscalPeriodsTable)
    .where(eq(fiscalPeriodsTable.id, row.fiscalPeriodId));
  res.json(CloseCampaignPlanningPeriodResponse.parse(planningPeriodResponse(row, fiscalPeriod!)));
});

router.post("/planning-periods/:planningPeriodId/reopen", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = ReopenCampaignPlanningPeriodParams.safeParse(req.params);
  const body = ReopenCampaignPlanningPeriodBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Reopening requires a reason and approver" }); return; }
  if (!await authorizePlanningPeriod(req, res, params.data.planningPeriodId)) return;
  if (!await requireAdministrator(req, res)) return;

  let approver = body.data.approvedBy;
  if (process.env.NODE_ENV === "production") {
    approver = req.user!.email || req.user!.id;
  }

  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(campaignPlanningPeriodsTable)
      .where(and(
        eq(campaignPlanningPeriodsTable.id, params.data.planningPeriodId),
        eq(campaignPlanningPeriodsTable.status, "closed"),
      ));
    if (!current) return undefined;
    await tx.insert(budgetHistoryTable).values({
      campaignKey: current.campaignKey,
      planningPeriodId: current.id,
      action: "reopen_approved",
      actorId,
      approvedBy: approver,
      reason: body.data.reason,
      snapshot: current,
    });
    const [updated] = await tx.update(campaignPlanningPeriodsTable).set({
      status: "open", reopenedAt: new Date(), rowVersion: 1,
    }).where(and(eq(campaignPlanningPeriodsTable.id, params.data.planningPeriodId), eq(campaignPlanningPeriodsTable.status, "closed"))).returning();
    if (updated) await tx.insert(budgetHistoryTable).values({
      campaignKey: updated.campaignKey, planningPeriodId: updated.id, action: "reopened", actorId,
      approvedBy: approver, reason: body.data.reason, snapshot: updated,
    });
    return updated;
  });
  if (!row) { res.status(409).json({ error: "Only a closed planning period may be reopened" }); return; }
  const [fiscalPeriod] = await db.select().from(fiscalPeriodsTable)
    .where(eq(fiscalPeriodsTable.id, row.fiscalPeriodId));
  res.json(ReopenCampaignPlanningPeriodResponse.parse(planningPeriodResponse(row, fiscalPeriod!)));
});

router.put("/activities/:activityId/period-allocations", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = AllocateActivityAcrossPeriodsParams.safeParse(req.params);
  const body = AllocateActivityAcrossPeriodsBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid activity allocation" }); return; }
  if (!await authorizeActivity(req, res, params.data.activityId)) return;

  try {
    const rows = await db.transaction(async (tx) => {
      const [activity] = await tx.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.id, params.data.activityId));
      if (!activity) throw new Error("NOT_FOUND");

      const planning = await tx.select().from(campaignPlanningPeriodsTable)
        .where(eq(campaignPlanningPeriodsTable.campaignKey, activity.campaignKey))
        .for("update");

      const fiscal = planning.length
        ? await tx.select().from(fiscalPeriodsTable).where(inArray(fiscalPeriodsTable.id, planning.map((item) => item.fiscalPeriodId)))
        : [];
      const planningByFiscal = new Map(planning.map((item) => [item.fiscalPeriodId, item]));

      let allocations;
      try {
        allocations = activityAllocation(
          body.data.method,
          activity.authoritativeCostMinor,
          activity.deliveryStartDate,
          activity.deliveryEndDate,
          fiscal,
          activity.accountingDate,
          body.data.customAllocations?.map((item) => {
            const planningPeriod = planning.find((period) => period.id === item.key);
            if (!planningPeriod) throw new Error("Custom allocation references an unrelated planning period");
            return { ...item, key: planningPeriod.fiscalPeriodId };
          }),
        );
      } catch (e: any) { throw new Error(`DOMAIN_ERROR:${e.message}`); }

      const affected = allocations.map((item) => planningByFiscal.get(item.key)).filter((item) => item != null);
      if (affected.length !== allocations.length) { throw new Error("DOMAIN_ERROR:Activity dates are not fully covered by campaign planning periods"); }
      if (affected.some((item) => item.status === "closed")) { throw new Error("LOCKED"); }

      await tx.delete(activityPeriodAllocationsTable).where(eq(activityPeriodAllocationsTable.activityId, activity.id));
      return tx.insert(activityPeriodAllocationsTable).values(allocations.map((item) => ({
        activityId: activity.id,
        campaignPlanningPeriodId: planningByFiscal.get(item.key)!.id,
        allocationMethod: body.data.method,
        amountMinor: item.amountMinor,
        accountingDate: body.data.method === "invoice_date" ? activity.accountingDate : null,
      }))).returning();
    });
    res.json(AllocateActivityAcrossPeriodsResponse.parse(rows));
  } catch (error: any) {
    if (error.message === "NOT_FOUND") res.status(404).json({ error: "Activity not found" });
    else if (error.message === "LOCKED") res.status(423).json({ error: "An affected planning period is closed" });
    else if (error.message.startsWith("DOMAIN_ERROR:")) res.status(409).json({ error: error.message.slice(13) });
    else throw error;
  }
});

export default router;