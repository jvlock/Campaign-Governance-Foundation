import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CopyActivityExecutionBody,
  CopyActivityExecutionParams,
  CopyActivityExecutionResponse,
  CreateDeliveryPlatformConnectionBody,
  CreateDeliveryPlatformConnectionResponse,
  CreateActivityExecutionBody,
  CreateActivityExecutionParams,
  CreateActivityExecutionResponse,
  CreateActivityTypeConfigurationBody,
  CreateActivityTypeConfigurationResponse,
  ListActivityExecutionsParams,
  ListActivityExecutionsResponse,
  ListDeliveryPlatformConnectionsQueryParams,
  ListDeliveryPlatformConnectionsResponse,
  ListExecutionPublishAttemptsParams,
  ListExecutionPublishAttemptsResponse,
  ListActivityTypeConfigurationsQueryParams,
  ListActivityTypeConfigurationsResponse,
  PublishActivityTypeConfigurationBody,
  PublishActivityTypeConfigurationParams,
  PublishActivityTypeConfigurationResponse,
  PreviewActivityExecutionPublishBody,
  PreviewActivityExecutionPublishParams,
  PreviewActivityExecutionPublishResponse,
  PublishActivityExecutionBody,
  PublishActivityExecutionParams,
  PublishActivityExecutionResponse,
  UpdateActivityExecutionBody,
  UpdateActivityExecutionParams,
  UpdateActivityExecutionResponse,
  UpdateDeliveryPlatformConnectionBody,
  UpdateDeliveryPlatformConnectionParams,
  UpdateDeliveryPlatformConnectionResponse,
  VersionActivityExecutionBody,
  VersionActivityExecutionParams,
  VersionActivityExecutionResponse,
} from "@workspace/api-zod";
import {
  activityExecutionsTable,
  activityProductAssociationsTable,
  activityTypeConfigurationsTable,
  campaignActivitiesTable,
  campaignsTable,
  deliveryPlatformConnectionsTable,
  db,
  executionPublishAttemptsTable,
  governedValuesTable,
} from "@workspace/db";
import { getAuditActor, requireConfigurationAdministrator, requireMutationAuth } from "../middlewares/mutation-auth";
import {
  buildExecutionDeliveryPayload,
  containsRawPrompt,
  readExternalId,
  validateDeliveryEndpoint,
} from "../lib/campaign-domain";
import { postDeliveryPayload } from "../lib/delivery-platform-client";
import { requireCampaignAccess } from "../lib/campaign-authorization";

const router: IRouter = Router();
router.use(requireMutationAuth);

async function authorizeCampaignKey(req: Parameters<typeof requireCampaignAccess>[0], res: Parameters<typeof requireCampaignAccess>[1], campaignKey: string, mode: "view" | "mutate") {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.campaignKey, campaignKey));
  if (!campaign) { res.status(404).json({ error: "Resource not found" }); return undefined; }
  return await requireCampaignAccess(req, res, campaign, mode) ? campaign : undefined;
}

async function authorizeActivity(req: Parameters<typeof requireCampaignAccess>[0], res: Parameters<typeof requireCampaignAccess>[1], activityId: string, mode: "view" | "mutate") {
  const [activity] = await db.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.id, activityId));
  if (!activity) { res.status(404).json({ error: "Resource not found" }); return undefined; }
  return await authorizeCampaignKey(req, res, activity.campaignKey, mode) ? activity : undefined;
}

async function authorizeExecution(req: Parameters<typeof requireCampaignAccess>[0], res: Parameters<typeof requireCampaignAccess>[1], executionKey: string, mode: "view" | "mutate") {
  const [context] = await db.select({ execution: activityExecutionsTable, activity: campaignActivitiesTable })
    .from(activityExecutionsTable)
    .innerJoin(campaignActivitiesTable, eq(campaignActivitiesTable.id, activityExecutionsTable.activityId))
    .where(eq(activityExecutionsTable.executionKey, executionKey));
  if (!context) { res.status(404).json({ error: "Resource not found" }); return undefined; }
  return await authorizeCampaignKey(req, res, context.activity.campaignKey, mode) ? context : undefined;
}

const MCP_INTENTS = ["awareness", "consideration", "evaluation", "conversion", "retention"];
function validateConfigurationDefinition(input: { questions: Array<{ key: string; requiredWhen?: { field: string }; options?: string[] }>; validations: Record<string, unknown>; namingTemplate: string; memberStatuses: string[]; inheritableFields: string[]; permittedOverrides: string[] }): string | undefined {
  const keys = input.questions.map((question) => question.key);
  if (new Set(keys).size !== keys.length || keys.some((key) => !key.trim())) return "Question keys must be unique and nonempty";
  if (input.questions.some((question) => question.requiredWhen && !keys.includes(question.requiredWhen.field))) return "requiredWhen must reference a configured question";
  const allowed = new Set(["ownerRequired", "requiredFields", "allowedStatuses", "rejectRawPrompt"]);
  if (Object.keys(input.validations).some((key) => !allowed.has(key))) return "Unknown configuration validation";
  const v = input.validations;
  if (v.ownerRequired != null && typeof v.ownerRequired !== "boolean") return "ownerRequired must be boolean";
  if (v.rejectRawPrompt != null && typeof v.rejectRawPrompt !== "boolean") return "rejectRawPrompt must be boolean";
  if (v.requiredFields != null && (!Array.isArray(v.requiredFields) || v.requiredFields.some((x) => typeof x !== "string"))) return "requiredFields must be a string array";
  if (v.allowedStatuses != null && (!Array.isArray(v.allowedStatuses) || v.allowedStatuses.some((x) => typeof x !== "string"))) return "allowedStatuses must be a string array";
  for (const list of [input.memberStatuses, input.inheritableFields, input.permittedOverrides]) if (new Set(list).size !== list.length || list.some((x) => !x.trim())) return "Configured field and status lists must be nonempty unique strings";
  if (!input.namingTemplate.trim()) return "Naming template is required";
  return undefined;
}

export async function isProtectedMcpConfiguration(configuration: typeof activityTypeConfigurationsTable.$inferSelect | undefined, legacyType?: string | null): Promise<boolean> {
  if (!configuration) return legacyType?.toLowerCase() === "mcp";
  if ((configuration.validations as Record<string, unknown>).rejectRawPrompt === true) return true;
  if (!configuration.channelValueId) return false;
  const [channel] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, configuration.channelValueId));
  return !!channel && [channel.stableKey, channel.displayName].some((value) => value.toLowerCase().replace(/[^a-z]/g, "") === "mcp");
}

function mcpConfigurationError(input: { questions: Array<{ key: string; options?: string[] }>; validations: Record<string, unknown> }): string | undefined {
  if (input.validations.rejectRawPrompt !== true) return "MCP-channel configurations must enable rejectRawPrompt";
  const intent = input.questions.find((question) => question.key === "intentCategory");
  if (!intent?.options || intent.options.length !== MCP_INTENTS.length || !MCP_INTENTS.every((value) => intent.options!.includes(value))) return "MCP-channel configurations require controlled intentCategory options";
  return undefined;
}

function configurationResponse(row: typeof activityTypeConfigurationsTable.$inferSelect) {
  return {
    ...row,
    questions: row.questions as Array<{ key: string; label?: string; required?: boolean; options?: string[] }>,
    validations: row.validations as Record<string, unknown>,
    memberStatuses: row.memberStatuses as string[],
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function executionResponse(row: typeof activityExecutionsTable.$inferSelect) {
  return {
    ...row,
    creativeLineage: row.creativeLineage as Record<string, unknown>,
    copyLineage: row.copyLineage as Record<string, unknown>,
    externalIds: row.externalIds as Record<string, unknown>,
    configurationData: row.configurationData as Record<string, unknown>,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function platformConnectionResponse(row: typeof deliveryPlatformConnectionsTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function publishAttemptResponse(row: typeof executionPublishAttemptsTable.$inferSelect) {
  return {
    ...row,
    requestPayload: row.requestPayload as Record<string, unknown>,
    responseSummary: row.responseSummary as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

router.get("/delivery-platform-connections", async (req, res): Promise<void> => {
  if (!await requireConfigurationAdministrator(req, res)) return;
  const parsed = ListDeliveryPlatformConnectionsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  let channelValueId = parsed.data.channelValueId;
  if (parsed.data.activityId) {
    const [activity] = await db.select().from(campaignActivitiesTable)
      .where(eq(campaignActivitiesTable.id, parsed.data.activityId));
    if (!activity) { res.status(404).json({ error: "Activity not found" }); return; }
    channelValueId = activity.channelValueId ?? undefined;
    if (!channelValueId) { res.json(ListDeliveryPlatformConnectionsResponse.parse([])); return; }
  }
  const rows = channelValueId
    ? await db.select().from(deliveryPlatformConnectionsTable)
      .where(eq(deliveryPlatformConnectionsTable.channelValueId, channelValueId))
      .orderBy(deliveryPlatformConnectionsTable.displayName)
    : await db.select().from(deliveryPlatformConnectionsTable)
      .orderBy(deliveryPlatformConnectionsTable.displayName);
  res.json(ListDeliveryPlatformConnectionsResponse.parse(rows.map(platformConnectionResponse)));
});

router.post("/delivery-platform-connections", async (req, res): Promise<void> => {
  if (!await requireConfigurationAdministrator(req, res)) return;
  const body = CreateDeliveryPlatformConnectionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const endpointError = validateDeliveryEndpoint(body.data.endpointUrl);
  if (endpointError) { res.status(400).json({ error: endpointError }); return; }
  const [channel] = await db.select().from(governedValuesTable)
    .where(eq(governedValuesTable.id, body.data.channelValueId));
  if (!channel || channel.category !== "channel") {
    res.status(400).json({ error: "Connection channel must reference a governed channel" }); return;
  }
  const actorId = getAuditActor(req);
  try {
    const [created] = await db.insert(deliveryPlatformConnectionsTable).values({
      ...body.data,
      externalIdPath: body.data.externalIdPath ?? "id",
      isActive: body.data.isActive ?? false,
      createdBy: actorId,
      updatedBy: actorId,
    }).returning();
    res.status(201).json(CreateDeliveryPlatformConnectionResponse.parse(platformConnectionResponse(created!)));
  } catch {
    res.status(409).json({ error: "That platform key is already configured for this channel" });
  }
});

router.patch("/delivery-platform-connections/:connectionId", async (req, res): Promise<void> => {
  if (!await requireConfigurationAdministrator(req, res)) return;
  const params = UpdateDeliveryPlatformConnectionParams.safeParse(req.params);
  const body = UpdateDeliveryPlatformConnectionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid connection update" }); return; }
  if (body.data.endpointUrl) {
    const endpointError = validateDeliveryEndpoint(body.data.endpointUrl);
    if (endpointError) { res.status(400).json({ error: endpointError }); return; }
  }
  const [updated] = await db.update(deliveryPlatformConnectionsTable).set({
    ...body.data, updatedBy: getAuditActor(req), updatedAt: new Date(),
  }).where(eq(deliveryPlatformConnectionsTable.id, params.data.connectionId)).returning();
  if (!updated) { res.status(404).json({ error: "Connection not found" }); return; }
  res.json(UpdateDeliveryPlatformConnectionResponse.parse(platformConnectionResponse(updated)));
});

router.get("/activity-type-configurations", async (req, res): Promise<void> => {
  const parsed = ListActivityTypeConfigurationsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const rows = parsed.data.status
    ? await db.select().from(activityTypeConfigurationsTable)
      .where(eq(activityTypeConfigurationsTable.status, parsed.data.status))
      .orderBy(activityTypeConfigurationsTable.stableKey, desc(activityTypeConfigurationsTable.version))
    : await db.select().from(activityTypeConfigurationsTable)
      .orderBy(activityTypeConfigurationsTable.stableKey, desc(activityTypeConfigurationsTable.version));
  res.json(ListActivityTypeConfigurationsResponse.parse(rows.map(configurationResponse)));
});

router.post("/activity-type-configurations", async (req, res): Promise<void> => {
  if (!await requireConfigurationAdministrator(req, res)) return;
  const actorId = getAuditActor(req);
  const body = CreateActivityTypeConfigurationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const definitionError = validateConfigurationDefinition(body.data);
  if (definitionError) { res.status(400).json({ error: definitionError }); return; }
  if (body.data.channelValueId) {
    const [channel] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, body.data.channelValueId));
    if (!channel || channel.category !== "channel") { res.status(400).json({ error: "Configuration channel must reference a governed channel" }); return; }
    if ([channel.stableKey, channel.displayName].some((value) => value.toLowerCase().replace(/[^a-z]/g, "") === "mcp")) {
      const mcpError = mcpConfigurationError(body.data);
      if (mcpError) { res.status(400).json({ error: mcpError }); return; }
    }
  }
  try {
    const [created] = await db.insert(activityTypeConfigurationsTable).values({
      ...body.data, status: "draft", createdBy: actorId, updatedBy: actorId,
    }).returning();
    res.status(201).json(CreateActivityTypeConfigurationResponse.parse(configurationResponse(created!)));
  } catch {
    res.status(409).json({ error: "That configuration key and version already exists" });
  }
});

router.post("/activity-type-configurations/:configurationId/publish", async (req, res): Promise<void> => {
  if (!await requireConfigurationAdministrator(req, res)) return;
  const actorId = getAuditActor(req);
  const params = PublishActivityTypeConfigurationParams.safeParse(req.params);
  const body = PublishActivityTypeConfigurationBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid publication" }); return; }
  const [current] = await db.select().from(activityTypeConfigurationsTable).where(eq(activityTypeConfigurationsTable.id, params.data.configurationId));
  if (!current) { res.status(404).json({ error: "Configuration not found" }); return; }
  const definitionError = validateConfigurationDefinition({
    questions: current.questions as Array<{ key: string; requiredWhen?: { field: string } }>,
    validations: current.validations as Record<string, unknown>,
    namingTemplate: current.namingTemplate,
    memberStatuses: current.memberStatuses as string[],
    inheritableFields: current.inheritableFields,
    permittedOverrides: current.permittedOverrides,
  });
  if (definitionError) { res.status(400).json({ error: definitionError }); return; }
  if (current.channelValueId) {
    const [channel] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.id, current.channelValueId));
    if (channel && [channel.stableKey, channel.displayName].some((value) => value.toLowerCase().replace(/[^a-z]/g, "") === "mcp")) {
      const mcpError = mcpConfigurationError({ questions: current.questions as any, validations: current.validations as Record<string, unknown> });
      if (mcpError) { res.status(400).json({ error: mcpError }); return; }
    }
  }
  const [updated] = await db.update(activityTypeConfigurationsTable).set({
    status: "published", publishedBy: actorId, publishedAt: new Date(), updatedBy: actorId, updatedAt: new Date(),
  }).where(and(
    eq(activityTypeConfigurationsTable.id, params.data.configurationId),
    eq(activityTypeConfigurationsTable.status, "draft"),
  )).returning();
  if (!updated) { res.status(409).json({ error: "Only a draft configuration may be published" }); return; }
  res.json(PublishActivityTypeConfigurationResponse.parse(configurationResponse(updated)));
});

router.get("/activities/:activityId/executions", async (req, res): Promise<void> => {
  const params = ListActivityExecutionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid activity key" }); return; }
  if (!await authorizeActivity(req, res, params.data.activityId, "view")) return;
  const rows = await db.select().from(activityExecutionsTable)
    .where(eq(activityExecutionsTable.activityId, params.data.activityId))
    .orderBy(desc(activityExecutionsTable.createdAt));
  res.json(ListActivityExecutionsResponse.parse(rows.map(executionResponse)));
});

router.post("/activities/:activityId/executions", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = CreateActivityExecutionParams.safeParse(req.params);
  const body = CreateActivityExecutionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid execution" }); return; }
  if (!await authorizeActivity(req, res, params.data.activityId, "mutate")) return;
  if (body.data.status && body.data.status.toLowerCase() !== "draft") {
    res.status(400).json({ error: "Executions must be created as drafts before approval" }); return;
  }
  const [activity] = await db.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.id, params.data.activityId));
  if (!activity) { res.status(404).json({ error: "Activity not found" }); return; }
  const [configuration] = activity.configurationId ? await db.select().from(activityTypeConfigurationsTable).where(eq(activityTypeConfigurationsTable.id, activity.configurationId)) : [];
  if (await isProtectedMcpConfiguration(configuration, activity.activityType) && containsRawPrompt(body.data)) {
    res.status(400).json({ error: "MCP executions cannot contain raw prompt text" }); return;
  }
  const [created] = await db.insert(activityExecutionsTable).values({
    ...body.data, status: "draft", activityId: activity.id, createdBy: actorId, updatedBy: actorId,
  }).returning();
  res.status(201).json(CreateActivityExecutionResponse.parse(executionResponse(created!)));
});

router.patch("/executions/:executionKey", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = UpdateActivityExecutionParams.safeParse(req.params);
  const body = UpdateActivityExecutionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid execution update" }); return; }
  if (!await authorizeExecution(req, res, params.data.executionKey, "mutate")) return;
  const [current] = await db.select({
    execution: activityExecutionsTable, activity: campaignActivitiesTable,
  }).from(activityExecutionsTable).innerJoin(
    campaignActivitiesTable, eq(campaignActivitiesTable.id, activityExecutionsTable.activityId),
  ).where(eq(activityExecutionsTable.executionKey, params.data.executionKey));
  if (!current) { res.status(404).json({ error: "Execution not found" }); return; }
  if (current.execution.syncState === "publishing") {
    res.status(409).json({ error: "Execution cannot be changed while publication is in progress" }); return;
  }
  if (body.data.status?.toLowerCase() === "approved"
    && current.execution.status.toLowerCase() !== "approved"
    && !await requireConfigurationAdministrator(req, res)) return;
  if (current.execution.status.toLowerCase() === "approved"
    && !await requireConfigurationAdministrator(req, res)) return;
  const [configuration] = current.activity.configurationId ? await db.select().from(activityTypeConfigurationsTable).where(eq(activityTypeConfigurationsTable.id, current.activity.configurationId)) : [];
  if (await isProtectedMcpConfiguration(configuration, current.activity.activityType) && containsRawPrompt(body.data)) {
    res.status(400).json({ error: "MCP executions cannot contain raw prompt text" }); return;
  }
  const { rowVersion, ...values } = body.data;
  const materialChanged = values.name !== current.execution.name
    || JSON.stringify(values.creativeLineage ?? {}) !== JSON.stringify(current.execution.creativeLineage)
    || JSON.stringify(values.copyLineage ?? {}) !== JSON.stringify(current.execution.copyLineage)
    || JSON.stringify(values.assetIds ?? []) !== JSON.stringify(current.execution.assetIds)
    || JSON.stringify(values.configurationData ?? {}) !== JSON.stringify(current.execution.configurationData);
  if (current.execution.syncState === "published" && materialChanged) {
    res.status(409).json({ error: "Published execution content is immutable; create a new version before changing delivery content" });
    return;
  }
  const [updated] = await db.update(activityExecutionsTable).set({
    ...values,
    status: current.execution.status.toLowerCase() === "approved" && materialChanged ? "draft" : values.status,
    rowVersion: rowVersion + 1, updatedBy: actorId, updatedAt: new Date(),
  }).where(and(
    eq(activityExecutionsTable.executionKey, params.data.executionKey),
    eq(activityExecutionsTable.rowVersion, rowVersion),
  )).returning();
  if (!updated) { res.status(409).json({ error: "Execution was changed by another actor" }); return; }
  res.json(UpdateActivityExecutionResponse.parse(executionResponse(updated)));
});

router.post("/executions/:executionKey/copy", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = CopyActivityExecutionParams.safeParse(req.params);
  const body = CopyActivityExecutionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid execution copy" }); return; }
  const authorizedSource = await authorizeExecution(req, res, params.data.executionKey, "mutate");
  if (!authorizedSource) return;
  const [source] = await db.select().from(activityExecutionsTable).where(eq(activityExecutionsTable.executionKey, params.data.executionKey));
  if (!source) { res.status(404).json({ error: "Execution not found" }); return; }
  const targetActivityId = body.data.targetActivityId ?? source.activityId;
  if (!await authorizeActivity(req, res, targetActivityId, "mutate")) return;
  const [[target], [sourceActivity]] = await Promise.all([
    db.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.id, targetActivityId)),
    db.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.id, source.activityId)),
  ]);
  if (!target) { res.status(400).json({ error: "Target activity does not exist" }); return; }
  if (!sourceActivity || sourceActivity.campaignKey !== target.campaignKey) {
    res.status(400).json({ error: "Execution lineage cannot cross campaign scope" }); return;
  }
  const [targetConfiguration] = target.configurationId ? await db.select().from(activityTypeConfigurationsTable).where(eq(activityTypeConfigurationsTable.id, target.configurationId)) : [];
  if (await isProtectedMcpConfiguration(targetConfiguration, target.activityType) && containsRawPrompt({
    creativeLineage: source.creativeLineage,
    copyLineage: source.copyLineage,
    externalIds: source.externalIds,
    configurationData: source.configurationData,
  })) {
    res.status(400).json({ error: "MCP executions cannot contain raw prompt text" }); return;
  }
  const [created] = await db.insert(activityExecutionsTable).values({
    activityId: targetActivityId, name: body.data.name ?? source.name, status: "draft", versionNumber: 1,
    copiedFromExecutionKey: source.executionKey, creativeLineage: source.creativeLineage,
    copyLineage: source.copyLineage, assetIds: source.assetIds, externalIds: {},
    configurationData: source.configurationData, createdBy: actorId, updatedBy: actorId,
  }).returning();
  res.status(201).json(CopyActivityExecutionResponse.parse(executionResponse(created!)));
});

router.post("/executions/:executionKey/versions", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = VersionActivityExecutionParams.safeParse(req.params);
  const body = VersionActivityExecutionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid execution version" }); return; }
  if (!await authorizeExecution(req, res, params.data.executionKey, "mutate")) return;
  const [source] = await db.select().from(activityExecutionsTable).where(eq(activityExecutionsTable.executionKey, params.data.executionKey));
  if (!source) { res.status(404).json({ error: "Execution not found" }); return; }
  const [activity] = await db.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.id, source.activityId));
  if (!activity) { res.status(404).json({ error: "Activity not found" }); return; }
  const [configuration] = activity.configurationId
    ? await db.select().from(activityTypeConfigurationsTable).where(eq(activityTypeConfigurationsTable.id, activity.configurationId))
    : [];
  if (await isProtectedMcpConfiguration(configuration, activity.activityType) && containsRawPrompt({
    creativeLineage: source.creativeLineage,
    copyLineage: source.copyLineage,
    externalIds: source.externalIds,
    configurationData: source.configurationData,
  })) {
    res.status(400).json({ error: "MCP executions cannot contain raw prompt text" }); return;
  }
  const [created] = await db.insert(activityExecutionsTable).values({
    activityId: source.activityId, name: body.data.name ?? source.name, status: "draft",
    versionNumber: source.versionNumber + 1, previousVersionExecutionKey: source.executionKey,
    creativeLineage: source.creativeLineage, copyLineage: source.copyLineage, assetIds: source.assetIds,
    externalIds: {}, configurationData: source.configurationData,
    createdBy: actorId, updatedBy: actorId,
  }).returning();
  res.status(201).json(VersionActivityExecutionResponse.parse(executionResponse(created!)));
});

async function loadPublishContext(executionKey: string, platformConnectionId: string) {
  const [context] = await db.select({
    execution: activityExecutionsTable,
    activity: campaignActivitiesTable,
  }).from(activityExecutionsTable).innerJoin(
    campaignActivitiesTable, eq(campaignActivitiesTable.id, activityExecutionsTable.activityId),
  ).where(eq(activityExecutionsTable.executionKey, executionKey));
  if (!context) return { error: "Execution not found" as const, status: 404 as const };
  if (context.execution.status.toLowerCase() !== "approved") {
    return { error: "Only approved executions can be published" as const, status: 409 as const };
  }
  const stalePublishing = context.execution.syncState === "publishing"
    && !!context.execution.lastSyncAt
    && context.execution.lastSyncAt.getTime() < Date.now() - 120_000;
  if (context.execution.syncState === "publishing" && !stalePublishing) {
    return { error: "This execution already has a publish request in progress" as const, status: 409 as const };
  }
  const [connection] = await db.select().from(deliveryPlatformConnectionsTable)
    .where(eq(deliveryPlatformConnectionsTable.id, platformConnectionId));
  if (!connection || !connection.isActive) {
    return { error: "Delivery platform connection is unavailable or inactive" as const, status: 409 as const };
  }
  if (!context.activity.channelValueId || connection.channelValueId !== context.activity.channelValueId) {
    return { error: "Delivery platform is not connected to this execution's governed channel" as const, status: 409 as const };
  }
  const [configuration] = context.activity.configurationId
    ? await db.select().from(activityTypeConfigurationsTable)
      .where(eq(activityTypeConfigurationsTable.id, context.activity.configurationId))
    : [];
  const protectedMcp = await isProtectedMcpConfiguration(configuration, context.activity.activityType);
  const productAssociations = await db.select().from(activityProductAssociationsTable)
    .where(eq(activityProductAssociationsTable.activityId, context.activity.id));
  try {
    return {
      ...context,
      connection,
      payload: buildExecutionDeliveryPayload({
        execution: context.execution,
        activity: {
          ...context.activity,
          productValueIds: productAssociations.map((association) => association.productValueId),
        },
        protectedMcp,
      }),
      idempotencyKey: context.execution.syncIdempotencyKey!,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid delivery payload", status: 409 as const };
  }
}

router.post("/executions/:executionKey/publish-preview", async (req, res): Promise<void> => {
  if (!await requireConfigurationAdministrator(req, res)) return;
  const params = PreviewActivityExecutionPublishParams.safeParse(req.params);
  const body = PreviewActivityExecutionPublishBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid publish preview" }); return; }
  if (!await authorizeExecution(req, res, params.data.executionKey, "mutate")) return;
  const context = await loadPublishContext(params.data.executionKey, body.data.platformConnectionId);
  if ("error" in context) { res.status(context.status!).json({ error: context.error }); return; }
  const [attempt] = await db.insert(executionPublishAttemptsTable).values({
    executionKey: context.execution.executionKey,
    platformConnectionId: context.connection.id,
    idempotencyKey: context.idempotencyKey,
    mode: "preview",
    status: "previewed",
    requestPayload: context.payload,
    responseSummary: { validated: true, delivered: false },
    actorId: getAuditActor(req),
    completedAt: new Date(),
  }).returning();
  req.log.info({
    executionKey: context.execution.executionKey,
    platformConnectionId: context.connection.id,
    attemptId: attempt!.id,
  }, "Execution publish preview validated");
  res.json(PreviewActivityExecutionPublishResponse.parse({
    mode: "preview",
    idempotencyKey: context.idempotencyKey,
    platformConnection: platformConnectionResponse(context.connection),
    payload: context.payload,
    execution: executionResponse(context.execution),
    externalId: null,
  }));
});

router.post("/executions/:executionKey/publish", async (req, res): Promise<void> => {
  if (!await requireConfigurationAdministrator(req, res)) return;
  const params = PublishActivityExecutionParams.safeParse(req.params);
  const body = PublishActivityExecutionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid publication" }); return; }
  if (!await authorizeExecution(req, res, params.data.executionKey, "mutate")) return;
  const context = await loadPublishContext(params.data.executionKey, body.data.platformConnectionId);
  if ("error" in context) { res.status(context.status!).json({ error: context.error }); return; }

  const existingExternalId = (context.execution.externalIds as Record<string, unknown>)[context.connection.platformKey];
  if (context.execution.syncState === "published"
    && context.execution.syncPlatformConnectionId === context.connection.id
    && (typeof existingExternalId === "string" || typeof existingExternalId === "number")) {
    res.json(PublishActivityExecutionResponse.parse({
      mode: "idempotent",
      idempotencyKey: context.idempotencyKey,
      platformConnection: platformConnectionResponse(context.connection),
      payload: context.payload,
      execution: executionResponse(context.execution),
      externalId: String(existingExternalId),
    }));
    return;
  }

  const actorId = getAuditActor(req);
  const claimed = await db.transaction(async (tx) => {
    if (context.execution.syncState === "publishing") {
      await tx.update(executionPublishAttemptsTable).set({
        status: "failed",
        errorMessage: "Superseded after the prior publisher stopped before completing",
        completedAt: new Date(),
      }).where(and(
        eq(executionPublishAttemptsTable.executionKey, context.execution.executionKey),
        eq(executionPublishAttemptsTable.status, "pending"),
      ));
    }
    const [execution] = await tx.update(activityExecutionsTable).set({
      syncState: "publishing",
      syncPlatformConnectionId: context.connection.id,
      syncAttemptCount: context.execution.syncAttemptCount + 1,
      lastSyncError: null,
      lastSyncAt: new Date(),
      rowVersion: context.execution.rowVersion + 1,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(and(
      eq(activityExecutionsTable.executionKey, context.execution.executionKey),
      eq(activityExecutionsTable.rowVersion, context.execution.rowVersion),
      eq(activityExecutionsTable.syncState, context.execution.syncState),
    )).returning();
    if (!execution) return undefined;
    const [attempt] = await tx.insert(executionPublishAttemptsTable).values({
      executionKey: context.execution.executionKey,
      platformConnectionId: context.connection.id,
      idempotencyKey: context.idempotencyKey,
      mode: "publish",
      status: "pending",
      requestPayload: context.payload,
      actorId,
    }).returning();
    return { execution, attempt: attempt! };
  });
  if (!claimed) {
    res.status(409).json({ error: "Execution publish state changed; refresh before retrying" });
    return;
  }

  try {
    const response = await postDeliveryPayload(context.connection.endpointUrl, context.payload, {
        "idempotency-key": context.idempotencyKey,
        "x-campaign-execution-key": context.execution.executionKey,
    });
    const externalId = readExternalId(response.body, context.connection.externalIdPath);
    if (!externalId) throw new Error(`Delivery platform response did not include ${context.connection.externalIdPath}`);
    const [updated] = await db.update(activityExecutionsTable).set({
      externalIds: {
        ...(context.execution.externalIds as Record<string, unknown>),
        [context.connection.platformKey]: externalId,
      },
      syncState: "published",
      syncPlatformConnectionId: context.connection.id,
      lastSyncError: null,
      lastSyncAt: new Date(),
      rowVersion: claimed.execution.rowVersion + 1,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(and(
      eq(activityExecutionsTable.executionKey, context.execution.executionKey),
      eq(activityExecutionsTable.rowVersion, claimed.execution.rowVersion),
      eq(activityExecutionsTable.syncState, "publishing"),
    )).returning();
    if (!updated) throw new Error("Execution publish state changed before completion");
    await db.update(executionPublishAttemptsTable).set({
      status: "succeeded",
      responseSummary: { httpStatus: response.status, externalId },
      completedAt: new Date(),
    }).where(eq(executionPublishAttemptsTable.id, claimed.attempt.id));
    req.log.info({
      executionKey: context.execution.executionKey,
      platformConnectionId: context.connection.id,
      attemptId: claimed.attempt.id,
    }, "Execution published to delivery platform");
    res.json(PublishActivityExecutionResponse.parse({
      mode: "publish",
      idempotencyKey: context.idempotencyKey,
      platformConnection: platformConnectionResponse(context.connection),
      payload: context.payload,
      execution: executionResponse(updated!),
      externalId,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery platform request failed";
    await Promise.all([
      db.update(activityExecutionsTable).set({
        syncState: "failed",
        syncPlatformConnectionId: context.connection.id,
        lastSyncError: message,
        lastSyncAt: new Date(),
        updatedBy: actorId,
        updatedAt: new Date(),
      }).where(and(
        eq(activityExecutionsTable.executionKey, context.execution.executionKey),
        eq(activityExecutionsTable.rowVersion, claimed.execution.rowVersion),
        eq(activityExecutionsTable.syncState, "publishing"),
      )),
      db.update(executionPublishAttemptsTable).set({
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      }).where(eq(executionPublishAttemptsTable.id, claimed.attempt.id)),
    ]);
    req.log.warn({
      executionKey: context.execution.executionKey,
      platformConnectionId: context.connection.id,
      attemptId: claimed.attempt.id,
      err: error,
    }, "Execution delivery platform publish failed");
    res.status(502).json({ error: message });
  }
});

router.get("/executions/:executionKey/publish-attempts", async (req, res): Promise<void> => {
  if (!await requireConfigurationAdministrator(req, res)) return;
  const params = ListExecutionPublishAttemptsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid execution key" }); return; }
  if (!await authorizeExecution(req, res, params.data.executionKey, "view")) return;
  const rows = await db.select().from(executionPublishAttemptsTable)
    .where(eq(executionPublishAttemptsTable.executionKey, params.data.executionKey))
    .orderBy(desc(executionPublishAttemptsTable.createdAt));
  res.json(ListExecutionPublishAttemptsResponse.parse(rows.map(publishAttemptResponse)));
});

export { configurationResponse, executionResponse, platformConnectionResponse };
export default router;