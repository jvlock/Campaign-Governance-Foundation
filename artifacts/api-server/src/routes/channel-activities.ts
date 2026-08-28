import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CopyActivityExecutionBody,
  CopyActivityExecutionParams,
  CopyActivityExecutionResponse,
  CreateActivityExecutionBody,
  CreateActivityExecutionParams,
  CreateActivityExecutionResponse,
  CreateActivityTypeConfigurationBody,
  CreateActivityTypeConfigurationResponse,
  ListActivityExecutionsParams,
  ListActivityExecutionsResponse,
  ListActivityTypeConfigurationsQueryParams,
  ListActivityTypeConfigurationsResponse,
  PublishActivityTypeConfigurationBody,
  PublishActivityTypeConfigurationParams,
  PublishActivityTypeConfigurationResponse,
  UpdateActivityExecutionBody,
  UpdateActivityExecutionParams,
  UpdateActivityExecutionResponse,
  VersionActivityExecutionBody,
  VersionActivityExecutionParams,
  VersionActivityExecutionResponse,
} from "@workspace/api-zod";
import {
  activityExecutionsTable,
  activityTypeConfigurationsTable,
  campaignActivitiesTable,
  db,
  governedValuesTable,
} from "@workspace/db";
import { getAuditActor, requireConfigurationAdministrator, requireMutationAuth } from "../middlewares/mutation-auth";
import { containsRawPrompt } from "../lib/campaign-domain";

const router: IRouter = Router();
router.use(requireMutationAuth);

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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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
  const [activity] = await db.select().from(campaignActivitiesTable).where(eq(campaignActivitiesTable.id, params.data.activityId));
  if (!activity) { res.status(404).json({ error: "Activity not found" }); return; }
  const [configuration] = activity.configurationId ? await db.select().from(activityTypeConfigurationsTable).where(eq(activityTypeConfigurationsTable.id, activity.configurationId)) : [];
  if (await isProtectedMcpConfiguration(configuration, activity.activityType) && containsRawPrompt(body.data)) {
    res.status(400).json({ error: "MCP executions cannot contain raw prompt text" }); return;
  }
  const [created] = await db.insert(activityExecutionsTable).values({
    ...body.data, activityId: activity.id, createdBy: actorId, updatedBy: actorId,
  }).returning();
  res.status(201).json(CreateActivityExecutionResponse.parse(executionResponse(created!)));
});

router.patch("/executions/:executionKey", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = UpdateActivityExecutionParams.safeParse(req.params);
  const body = UpdateActivityExecutionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid execution update" }); return; }
  const [current] = await db.select({
    execution: activityExecutionsTable, activity: campaignActivitiesTable,
  }).from(activityExecutionsTable).innerJoin(
    campaignActivitiesTable, eq(campaignActivitiesTable.id, activityExecutionsTable.activityId),
  ).where(eq(activityExecutionsTable.executionKey, params.data.executionKey));
  if (!current) { res.status(404).json({ error: "Execution not found" }); return; }
  const [configuration] = current.activity.configurationId ? await db.select().from(activityTypeConfigurationsTable).where(eq(activityTypeConfigurationsTable.id, current.activity.configurationId)) : [];
  if (await isProtectedMcpConfiguration(configuration, current.activity.activityType) && containsRawPrompt(body.data)) {
    res.status(400).json({ error: "MCP executions cannot contain raw prompt text" }); return;
  }
  const { rowVersion, ...values } = body.data;
  const [updated] = await db.update(activityExecutionsTable).set({
    ...values, rowVersion: rowVersion + 1, updatedBy: actorId, updatedAt: new Date(),
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
  const [source] = await db.select().from(activityExecutionsTable).where(eq(activityExecutionsTable.executionKey, params.data.executionKey));
  if (!source) { res.status(404).json({ error: "Execution not found" }); return; }
  const targetActivityId = body.data.targetActivityId ?? source.activityId;
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
    copyLineage: source.copyLineage, assetIds: source.assetIds, externalIds: source.externalIds,
    configurationData: source.configurationData, createdBy: actorId, updatedBy: actorId,
  }).returning();
  res.status(201).json(CopyActivityExecutionResponse.parse(executionResponse(created!)));
});

router.post("/executions/:executionKey/versions", async (req, res): Promise<void> => {
  const actorId = getAuditActor(req);
  const params = VersionActivityExecutionParams.safeParse(req.params);
  const body = VersionActivityExecutionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid execution version" }); return; }
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
    externalIds: source.externalIds, configurationData: source.configurationData,
    createdBy: actorId, updatedBy: actorId,
  }).returning();
  res.status(201).json(VersionActivityExecutionResponse.parse(executionResponse(created!)));
});

export { configurationResponse, executionResponse };
export default router;