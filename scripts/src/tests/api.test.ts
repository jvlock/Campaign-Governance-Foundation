import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  db,
  activityExecutionsTable,
  campaignPlanningPeriodsTable,
  fiscalPeriodsTable,
  governedValuesTable,
  sessionsTable,
  taxonomyUserRolesTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const baseUrl = process.env.API_URL || "http://localhost:80/api";
const baseOrigin = new URL(baseUrl).origin;
const adminUserId = "taxonomy-api-test-admin";
const readerUserId = "taxonomy-api-test-reader";
const scopedUserId = "taxonomy-api-test-scoped";
const logoutUserId = "taxonomy-api-test-logout";
const adminSid = `test-admin-${crypto.randomUUID()}`;
const readerSid = `test-reader-${crypto.randomUUID()}`;
const scopedSid = `test-scoped-${crypto.randomUUID()}`;
const logoutSid = `test-logout-${crypto.randomUUID()}`;

async function installActor(userId: string, sid: string, role: string, categories: string[] = []) {
  const user = {
    id: userId,
    email: `${userId}@example.invalid`,
    firstName: "Taxonomy",
    lastName: "Test",
    profileImageUrl: null,
  };
  await db.insert(usersTable).values(user).onConflictDoUpdate({
    target: usersTable.id,
    set: { email: user.email, updatedAt: new Date() },
  });
  await db.insert(taxonomyUserRolesTable).values({ userId, role, categories })
    .onConflictDoUpdate({ target: taxonomyUserRolesTable.userId, set: { role, categories } });
  await db.insert(sessionsTable).values({
    sid,
    sess: { user, access_token: "test-only", expires_at: Math.floor(Date.now() / 1000) + 3600 },
    expire: new Date(Date.now() + 3600_000),
  });
}

async function api(path: string, sid?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (sid) headers.set("Authorization", `Bearer ${sid}`);
  if (init.body) {
    headers.set("Content-Type", "application/json");
    headers.set("Origin", baseOrigin);
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

test.before(async () => {
  await installActor(adminUserId, adminSid, "administrator");
  await installActor(readerUserId, readerSid, "reader");
  await installActor(scopedUserId, scopedSid, "contributor", ["segment"]);
  await installActor(logoutUserId, logoutSid, "reader");
});

test("health remains public and database-aware", async () => {
  const response = await api("/healthz");
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, string>;
  assert.equal(body.status, "ok");
  assert.equal(body.database, "reachable");
});

test("taxonomy administration is publicly accessible, including mutations", async () => {
  const access = await api("/taxonomy/access");
  assert.equal(access.status, 200);
  assert.deepEqual(await access.json(), {
    role: "administrator",
    canRead: true,
    canPropose: true,
    canReview: true,
    canActivate: true,
    canAdminister: true,
    categories: [],
  });
  const created = await api("/taxonomy/values", undefined, {
    method: "POST",
    body: JSON.stringify({
      stableKey: `PUBLIC_${crypto.randomUUID()}`,
      category: "segment",
      displayName: "Public mutation",
      definition: "This unauthenticated request must be persisted.",
      effectiveStart: "2026-08-28",
      taxonomyVersion: "test",
      source: "Test",
      owner: "Test",
    }),
  });
  assert.equal(created.status, 201, await created.clone().text());
});

test("OIDC login and logout reject backslash return-path escapes", async () => {
  const login = await api("/login?returnTo=%2F%5Cattacker.example", undefined, { redirect: "manual" });
  assert.equal(login.status, 302);
  const loginCookies = login.headers.get("set-cookie") ?? "";
  assert.doesNotMatch(loginCookies, /attacker\.example/i);

  const logout = await api("/logout?returnTo=%2F%5Cattacker.example", logoutSid, { redirect: "manual" });
  assert.equal(logout.status, 302);
  const providerLocation = logout.headers.get("location");
  assert.ok(providerLocation);
  const postLogout = new URL(providerLocation).searchParams.get("post_logout_redirect_uri");
  assert.ok(postLogout);
  assert.notEqual(new URL(postLogout).hostname, "attacker.example");
  assert.equal(new URL(postLogout).pathname, "/");
});

test("public users can create review requests in any category", async () => {
  const response = await api("/taxonomy/review-requests", undefined, {
    method: "POST",
    body: JSON.stringify({
      category: "channel",
      proposedName: `Public channel ${crypto.randomUUID()}`,
      context: "This request is submitted through the public taxonomy workspace.",
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
});

test("administrator can add multiple categories without code changes", async () => {
  const categories = ["segment", "product", "persona", "channel", "fiscal_period"] as const;
  for (const category of categories) {
    const response = await api("/taxonomy/values", adminSid, {
      method: "POST",
      body: JSON.stringify({
        stableKey: `TEST_${category.toUpperCase()}_${crypto.randomUUID().replaceAll("-", "")}`,
        category,
        displayName: `Test ${category}`,
        definition: `Integration-test value for ${category}.`,
        effectiveStart: "2026-08-28",
        taxonomyVersion: "test-1",
        source: "Automated test",
        owner: "Test owner",
      }),
    });
    assert.equal(response.status, 201, await response.clone().text());
  }
});

test("administrator can create and publish a conditional future-channel configuration without code changes", async () => {
  const stableKey = `future-channel-${crypto.randomUUID()}`;
  const createdResponse = await api("/activity-type-configurations", adminSid, {
    method: "POST",
    body: JSON.stringify({
      stableKey,
      displayName: "Future conditional channel",
      version: 1,
      questions: [
        { key: "motion", required: true, options: ["launch", "always-on"] },
        { key: "launchCode", requiredWhen: { field: "motion", equals: "launch" } },
      ],
      validations: { ownerRequired: true },
      namingTemplate: "{campaign}-{motion}-{name}",
      memberStatuses: ["Targeted", "Responded"],
      inheritableFields: ["region", "language"],
      permittedOverrides: ["language"],
    }),
  });
  assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
  const created = await createdResponse.json() as any;
  assert.equal(created.status, "draft");
  assert.equal(created.stableKey, stableKey);
  assert.equal(created.questions[1].requiredWhen.field, "motion");

  const publishedResponse = await api(`/activity-type-configurations/${created.id}/publish`, adminSid, {
    method: "POST",
    body: JSON.stringify({ reason: "Approved for future use" }),
  });
  assert.equal(publishedResponse.status, 200, await publishedResponse.clone().text());
  assert.equal((await publishedResponse.json() as any).status, "published");

  const listedResponse = await api("/activity-type-configurations?status=published");
  assert.equal(listedResponse.status, 200, await listedResponse.clone().text());
  assert.ok((await listedResponse.json() as any[]).some((configuration) => configuration.stableKey === stableKey));
});

test("configured activities enforce conditional and MCP rules while execution copy/version lineage remains stable", async () => {
  const [product] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.category, "product")).limit(1);
  assert.ok(product);
  const suffix = crypto.randomUUID();
  const configResponse = await api("/activity-type-configurations", adminSid, {
    method: "POST",
    body: JSON.stringify({
      stableKey: `conditional-${suffix}`, displayName: "Conditional execution test", version: 1,
      questions: [
        { key: "motion", required: true, options: ["launch", "always-on"] },
        { key: "launchCode", requiredWhen: { field: "motion", equals: "launch" } },
      ],
      validations: { allowedStatuses: ["active"] }, namingTemplate: "{campaign}-{motion}-{name}", memberStatuses: [],
      inheritableFields: [], permittedOverrides: [],
    }),
  });
  assert.equal(configResponse.status, 201, await configResponse.clone().text());
  const config = await configResponse.json() as any;
  assert.equal((await api(`/activity-type-configurations/${config.id}/publish`, adminSid, {
    method: "POST", body: JSON.stringify({ reason: "integration test" }),
  })).status, 200);

  const campaignResponse = await api("/campaigns", undefined, {
    method: "POST",
    body: JSON.stringify({
      name: `Configured activity ${suffix}`, campaignType: "integrated", relationshipType: "new",
      startDate: "2034-01-01", endDate: "2034-01-31",
    }),
  });
  assert.equal(campaignResponse.status, 201, await campaignResponse.clone().text());
  const campaign = await campaignResponse.json() as any;
  assert.equal((await api(`/campaigns/${campaign.campaignKey}/products`, undefined, {
    method: "PUT", body: JSON.stringify({ associations: [{ productValueId: product.id, role: "primary_solution", isPrimary: true }] }),
  })).status, 200);
  const activityBase = {
    name: "Launch execution", deliveryStartDate: "2034-01-02", deliveryEndDate: "2034-01-10",
    authoritativeCostMinor: "100", currency: "USD", productValueIds: [product.id], configurationId: config.id,
  };
  const missingConditional = await api(`/campaigns/${campaign.campaignKey}/activities`, undefined, {
    method: "POST", body: JSON.stringify({ ...activityBase, configurationAnswers: { motion: "launch" } }),
  });
  assert.equal(missingConditional.status, 400);
  const omittedDraftStatus = await api(`/campaigns/${campaign.campaignKey}/activities`, undefined, {
    method: "POST", body: JSON.stringify({ ...activityBase, configurationAnswers: { motion: "always-on" } }),
  });
  assert.equal(omittedDraftStatus.status, 400);
  const activityResponse = await api(`/campaigns/${campaign.campaignKey}/activities`, undefined, {
    method: "POST", body: JSON.stringify({ ...activityBase, status: "active", configurationAnswers: { motion: "launch", launchCode: "L-1" } }),
  });
  assert.equal(activityResponse.status, 201, await activityResponse.clone().text());
  const activity = await activityResponse.json() as any;
  assert.equal(activity.configurationVersion, 1);

  const assets = ["asset-shared-a", "asset-shared-b"];
  const executionResponse = await api(`/activities/${activity.id}/executions`, undefined, {
    method: "POST", body: JSON.stringify({ name: "Primary creative", assetIds: assets, configurationData: { variant: "A" } }),
  });
  assert.equal(executionResponse.status, 201, await executionResponse.clone().text());
  const execution = await executionResponse.json() as any;
  const copiedResponse = await api(`/executions/${execution.executionKey}/copy`, undefined, {
    method: "POST", body: JSON.stringify({ name: "Copied creative" }),
  });
  assert.equal(copiedResponse.status, 201, await copiedResponse.clone().text());
  const copied = await copiedResponse.json() as any;
  assert.notEqual(copied.executionKey, execution.executionKey);
  assert.equal(copied.copiedFromExecutionKey, execution.executionKey);
  assert.deepEqual(copied.assetIds, assets);
  const versionResponse = await api(`/executions/${execution.executionKey}/versions`, undefined, {
    method: "POST", body: JSON.stringify({ name: "Primary creative v2" }),
  });
  assert.equal(versionResponse.status, 201, await versionResponse.clone().text());
  const version = await versionResponse.json() as any;
  assert.notEqual(version.executionKey, execution.executionKey);
  assert.equal(version.previousVersionExecutionKey, execution.executionKey);
  assert.equal(version.versionNumber, execution.versionNumber + 1);
  const stale = await api(`/executions/${execution.executionKey}`, undefined, {
    method: "PATCH", body: JSON.stringify({ name: "Updated creative", rowVersion: execution.rowVersion }),
  });
  assert.equal(stale.status, 200, await stale.clone().text());
  const staleAgain = await api(`/executions/${execution.executionKey}`, undefined, {
    method: "PATCH", body: JSON.stringify({ name: "Stale update", rowVersion: execution.rowVersion }),
  });
  assert.equal(staleAgain.status, 409);
  const detail = await api(`/campaigns/${campaign.campaignKey}`);
  assert.equal(detail.status, 200, await detail.clone().text());
  const persistedActivity = (await detail.json() as any).activities.find((item: any) => item.id === activity.id);
  assert.equal(persistedActivity.configuration.id, config.id);
  assert.equal(persistedActivity.executions.length, 3);

  const mcpChannelResponse = await api("/taxonomy/values", adminSid, {
    method: "POST",
    body: JSON.stringify({
      stableKey: `TEST_MCP_CHANNEL_${suffix.replaceAll("-", "")}`,
      category: "channel",
      displayName: "MCP",
      definition: "Governed MCP channel for policy enforcement testing.",
      effectiveStart: "2026-08-28",
      taxonomyVersion: "test-1",
      source: "Automated test",
      owner: "Test owner",
    }),
  });
  assert.equal(mcpChannelResponse.status, 201, await mcpChannelResponse.clone().text());
  const mcpChannel = await mcpChannelResponse.json() as any;
  const unsafeChannelConfig = await api("/activity-type-configurations", adminSid, {
    method: "POST",
    body: JSON.stringify({
      stableKey: `activation-orchestrator-${suffix}`,
      displayName: "Activation orchestrator",
      channelValueId: mcpChannel.id,
      version: 1,
      questions: [{ key: "intentCategory", required: true, options: ["awareness", "consideration", "evaluation", "conversion", "retention"] }],
      validations: {},
      namingTemplate: "{campaign}-activation-{name}",
      memberStatuses: [],
      inheritableFields: [],
      permittedOverrides: [],
    }),
  });
  assert.equal(unsafeChannelConfig.status, 400);
  const governedMcpConfigResponse = await api("/activity-type-configurations", adminSid, {
    method: "POST",
    body: JSON.stringify({
      stableKey: `activation-orchestrator-${suffix}`,
      displayName: "Activation orchestrator",
      channelValueId: mcpChannel.id,
      version: 1,
      questions: [{ key: "intentCategory", required: true, options: ["awareness", "consideration", "evaluation", "conversion", "retention"] }],
      validations: { rejectRawPrompt: true },
      namingTemplate: "{campaign}-activation-{name}",
      memberStatuses: [],
      inheritableFields: [],
      permittedOverrides: [],
    }),
  });
  assert.equal(governedMcpConfigResponse.status, 201, await governedMcpConfigResponse.clone().text());
  const governedMcpConfig = await governedMcpConfigResponse.json() as any;
  const governedMcpPublish = await api(`/activity-type-configurations/${governedMcpConfig.id}/publish`, adminSid, {
    method: "POST",
    body: JSON.stringify({ reason: "Administrator-authenticated MCP policy test" }),
  });
  assert.equal(governedMcpPublish.status, 200, await governedMcpPublish.clone().text());
  const governedMcpPrompt = await api(`/campaigns/${campaign.campaignKey}/activities`, adminSid, {
    method: "POST",
    body: JSON.stringify({
      ...activityBase,
      name: "Governed channel unsafe",
      configurationId: governedMcpConfig.id,
      channelValueId: mcpChannel.id,
      configurationAnswers: { intentCategory: "conversion", promptText: "must be rejected" },
    }),
  });
  assert.equal(governedMcpPrompt.status, 400);
  const governedMcpActivityResponse = await api(`/campaigns/${campaign.campaignKey}/activities`, adminSid, {
    method: "POST",
    body: JSON.stringify({
      ...activityBase,
      name: "Governed channel safe",
      configurationId: governedMcpConfig.id,
      channelValueId: mcpChannel.id,
      configurationAnswers: { intentCategory: "conversion" },
    }),
  });
  assert.equal(governedMcpActivityResponse.status, 201, await governedMcpActivityResponse.clone().text());
  const governedMcpActivity = await governedMcpActivityResponse.json() as any;
  const governedMcpExecution = await api(`/activities/${governedMcpActivity.id}/executions`, adminSid, {
    method: "POST",
    body: JSON.stringify({ name: "Governed channel unsafe execution", configurationData: { rawPrompt: "must be rejected" } }),
  });
  assert.equal(governedMcpExecution.status, 400);

  const configs = await (await api("/activity-type-configurations?status=published")).json() as any[];
  const mcp = configs.find((item) => item.stableKey === "mcp");
  assert.ok(mcp);
  const rejectedMcp = await api(`/campaigns/${campaign.campaignKey}/activities`, undefined, {
    method: "POST", body: JSON.stringify({
      ...activityBase, name: "Unsafe MCP", configurationId: mcp.id, activityType: "email",
      configurationAnswers: { intentCategory: "awareness", rawPrompt: "do not persist this" },
    }),
  });
  assert.equal(rejectedMcp.status, 400);
  const promptKeyMcp = await api(`/campaigns/${campaign.campaignKey}/activities`, undefined, {
    method: "POST", body: JSON.stringify({
      ...activityBase, name: "Prompt-key MCP", configurationId: mcp.id,
      configurationAnswers: { intentCategory: "awareness", prompt: "do not persist this" },
    }),
  });
  assert.equal(promptKeyMcp.status, 400);
  const mcpActivityResponse = await api(`/campaigns/${campaign.campaignKey}/activities`, undefined, {
    method: "POST", body: JSON.stringify({
      ...activityBase, name: "Safe MCP", configurationId: mcp.id,
      configurationAnswers: { intentCategory: "awareness" },
    }),
  });
  assert.equal(mcpActivityResponse.status, 201, await mcpActivityResponse.clone().text());
  const mcpActivity = await mcpActivityResponse.json() as any;
  const rejectedMcpExecution = await api(`/activities/${mcpActivity.id}/executions`, undefined, {
    method: "POST", body: JSON.stringify({ name: "Unsafe MCP copy", externalIds: { promptText: "secret prompt" } }),
  });
  assert.equal(rejectedMcpExecution.status, 400);
  const [legacyTainted] = await db.insert(activityExecutionsTable).values({
    activityId: mcpActivity.id,
    name: "Legacy tainted MCP execution",
    configurationData: { prompt: "legacy raw prompt" },
    createdBy: "legacy-import",
    updatedBy: "legacy-import",
  }).returning();
  const rejectedLegacyVersion = await api(`/executions/${legacyTainted.executionKey}/versions`, undefined, {
    method: "POST", body: JSON.stringify({ name: "Must not version" }),
  });
  assert.equal(rejectedLegacyVersion.status, 400);
});

test("activity allocations reconcile on create/update and lock only touched fiscal periods", async () => {
  const [product] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.category, "product")).limit(1);
  assert.ok(product);
  const suffix = crypto.randomUUID();
  const calendarResponse = await api("/fiscal-calendars", undefined, {
    method: "POST", body: JSON.stringify({ stableKey: `ALLOC-${suffix}`, name: "Allocation lock test" }),
  });
  assert.equal(calendarResponse.status, 201, await calendarResponse.clone().text());
  const calendar = await calendarResponse.json() as any;
  const snapshotResponse = await api(`/fiscal-calendars/${calendar.id}/snapshots`, undefined, {
    method: "POST", body: JSON.stringify({
      version: 1, rules: { test: true }, periods: [
        { stableKey: `OLD-${suffix}`, fiscalYear: "FY2040", fiscalQuarter: "Q1", fiscalPeriod: "P01", startDate: "2040-01-01", endDate: "2040-01-31" },
        { stableKey: `FUTURE-${suffix}`, fiscalYear: "FY2040", fiscalQuarter: "Q1", fiscalPeriod: "P02", startDate: "2040-02-01", endDate: "2040-02-29" },
      ],
    }),
  });
  assert.equal(snapshotResponse.status, 201, await snapshotResponse.clone().text());
  const snapshot = await snapshotResponse.json() as any;
  const campaignResponse = await api("/campaigns", undefined, {
    method: "POST", body: JSON.stringify({
      name: `Allocation campaign ${suffix}`, campaignType: "integrated", relationshipType: "new",
      startDate: "2040-01-01", endDate: "2040-02-29",
    }),
  });
  assert.equal(campaignResponse.status, 201, await campaignResponse.clone().text());
  const campaign = await campaignResponse.json() as any;
  assert.equal((await api(`/campaigns/${campaign.campaignKey}/products`, undefined, {
    method: "PUT", body: JSON.stringify({ associations: [{ productValueId: product.id, role: "primary_solution", isPrimary: true }] }),
  })).status, 200);
  assert.equal((await api(`/campaigns/${campaign.campaignKey}/budget`, undefined, {
    method: "PUT", body: JSON.stringify({
      fiscalCalendarSnapshotId: snapshot.id, requestedMinor: "10000", approvedMinor: "10000",
      currency: "USD", currencyMinorUnits: 2, budgetOwner: "Test", costCenter: "TEST",
      fundingSource: "Test", allocationMethod: "even",
    }),
  })).status, 200);
  const generatedResponse = await api(`/campaigns/${campaign.campaignKey}/planning-periods/generate`, undefined, {
    method: "POST", body: JSON.stringify({ method: "even" }),
  });
  assert.equal(generatedResponse.status, 200, await generatedResponse.clone().text());
  const periods = await generatedResponse.json() as any[];
  const oldPeriod = periods.find((period) => period.stableKey.includes(`OLD-${suffix}`)) ?? periods[0];

  const createActivity = (name: string, start: string, end: string, cost: string) => api(`/campaigns/${campaign.campaignKey}/activities`, undefined, {
    method: "POST", body: JSON.stringify({
      name, deliveryStartDate: start, deliveryEndDate: end, authoritativeCostMinor: cost,
      currency: "USD", productValueIds: [product.id],
    }),
  });
  const oldActivityResponse = await createActivity("Prior period activity", "2040-01-10", "2040-01-20", "1101");
  assert.equal(oldActivityResponse.status, 201, await oldActivityResponse.clone().text());
  const oldActivity = await oldActivityResponse.json() as any;
  assert.equal((await api(`/planning-periods/${oldPeriod.id}/close`, undefined, {
    method: "POST", body: JSON.stringify({ reason: "Close prior period", varianceExplanation: "None", unusedBudgetTreatment: "expire" }),
  })).status, 200);

  const futureResponse = await createActivity("Future activity", "2040-02-02", "2040-02-20", "3001");
  assert.equal(futureResponse.status, 201, await futureResponse.clone().text());
  let future = await futureResponse.json() as any;
  let detail = await (await api(`/campaigns/${campaign.campaignKey}`)).json() as any;
  let persisted = detail.activities.find((item: any) => item.id === future.id);
  assert.equal(persisted.periodAllocations.reduce((sum: bigint, row: any) => sum + BigInt(row.amountMinor), 0n), 3001n);

  const updateResponse = await api(`/activities/${future.id}`, undefined, {
    method: "PATCH", body: JSON.stringify({
      name: future.name, deliveryStartDate: "2040-02-05", deliveryEndDate: "2040-02-25",
      authoritativeCostMinor: "4003", currency: "USD", productValueIds: [product.id],
      rowVersion: future.rowVersion, reason: "Reforecast future delivery",
    }),
  });
  assert.equal(updateResponse.status, 200, await updateResponse.clone().text());
  future = await updateResponse.json() as any;
  detail = await (await api(`/campaigns/${campaign.campaignKey}`)).json() as any;
  persisted = detail.activities.find((item: any) => item.id === future.id);
  assert.equal(persisted.periodAllocations.reduce((sum: bigint, row: any) => sum + BigInt(row.amountMinor), 0n), 4003n);

  const oldTouchedUpdate = await api(`/activities/${oldActivity.id}`, undefined, {
    method: "PATCH", body: JSON.stringify({
      name: oldActivity.name, deliveryStartDate: "2040-01-10", deliveryEndDate: "2040-01-20",
      authoritativeCostMinor: "1102", currency: "USD", productValueIds: [product.id],
      rowVersion: oldActivity.rowVersion, reason: "Must remain locked",
    }),
  });
  assert.equal(oldTouchedUpdate.status, 423);
  const proposedClosedUpdate = await api(`/activities/${future.id}`, undefined, {
    method: "PATCH", body: JSON.stringify({
      name: future.name, deliveryStartDate: "2040-01-25", deliveryEndDate: "2040-02-25",
      authoritativeCostMinor: "4003", currency: "USD", productValueIds: [product.id],
      rowVersion: future.rowVersion, reason: "Must not touch closed period",
    }),
  });
  assert.equal(proposedClosedUpdate.status, 423);
  assert.equal((await createActivity("Closed activity", "2040-01-05", "2040-01-08", "100")).status, 423);
});

test("activity creation rejects planning-period coverage gaps", async () => {
  const [product] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.category, "product")).limit(1);
  assert.ok(product);
  const suffix = crypto.randomUUID();
  const calendar = await (await api("/fiscal-calendars", undefined, {
    method: "POST", body: JSON.stringify({ stableKey: `GAP-${suffix}`, name: "Gap coverage test" }),
  })).json() as any;
  const snapshotResponse = await api(`/fiscal-calendars/${calendar.id}/snapshots`, undefined, {
    method: "POST", body: JSON.stringify({
      version: 1, rules: {}, periods: [
        { stableKey: `G1-${suffix}`, fiscalYear: "FY2041", fiscalQuarter: "Q1", fiscalPeriod: "P01", startDate: "2041-01-01", endDate: "2041-01-10" },
        { stableKey: `G2-${suffix}`, fiscalYear: "FY2041", fiscalQuarter: "Q1", fiscalPeriod: "P02", startDate: "2041-01-12", endDate: "2041-01-31" },
      ],
    }),
  });
  assert.equal(snapshotResponse.status, 201, await snapshotResponse.clone().text());
  const snapshot = await snapshotResponse.json() as any;
  const campaign = await (await api("/campaigns", undefined, {
    method: "POST", body: JSON.stringify({ name: `Gap campaign ${suffix}`, campaignType: "integrated", relationshipType: "new", startDate: "2041-01-01", endDate: "2041-01-31" }),
  })).json() as any;
  await api(`/campaigns/${campaign.campaignKey}/products`, undefined, { method: "PUT", body: JSON.stringify({ associations: [{ productValueId: product.id, role: "primary_solution", isPrimary: true }] }) });
  await api(`/campaigns/${campaign.campaignKey}/budget`, undefined, { method: "PUT", body: JSON.stringify({ fiscalCalendarSnapshotId: snapshot.id, requestedMinor: "1", approvedMinor: "1", currency: "USD", currencyMinorUnits: 2, budgetOwner: "Test", costCenter: "TEST", fundingSource: "Test", allocationMethod: "even" }) });
  const fiscalPeriods = await db.select().from(fiscalPeriodsTable).where(eq(fiscalPeriodsTable.snapshotId, snapshot.id));
  await db.insert(campaignPlanningPeriodsTable).values(fiscalPeriods.map((period, index) => ({
    stableKey: `GAP-PLAN-${suffix}-${index}`,
    campaignKey: campaign.campaignKey,
    fiscalPeriodId: period.id,
    readableName: period.stableKey,
    requestedMinor: "1",
    approvedMinor: "1",
    plannedMinor: "0",
    committedMinor: "0",
    actualMinor: "0",
    forecastMinor: "0",
  })));
  const activity = await api(`/campaigns/${campaign.campaignKey}/activities`, undefined, {
    method: "POST", body: JSON.stringify({ name: "Spans gap", deliveryStartDate: "2041-01-09", deliveryEndDate: "2041-01-13", authoritativeCostMinor: "10", currency: "USD", productValueIds: [product.id] }),
  });
  assert.equal(activity.status, 409);
});

test("rename preserves stable key, rejects stale updates, records history, and protects deletion", async () => {
  const stableKey = `TEST_RENAME_${crypto.randomUUID().replaceAll("-", "")}`;
  const create = await api("/taxonomy/values", adminSid, {
    method: "POST",
    body: JSON.stringify({
      stableKey,
      category: "segment",
      displayName: "Original label",
      definition: "Original governed definition.",
      effectiveStart: "2026-08-28",
      taxonomyVersion: "test-1",
      source: "Automated test",
      owner: "Test owner",
    }),
  });
  assert.equal(create.status, 201, await create.clone().text());
  const created = await create.json() as any;
  const updateBody = {
    displayName: "Renamed label",
    definition: "Updated governed definition.",
    effectiveStart: created.effectiveStart,
    effectiveEnd: null,
    taxonomyVersion: "test-2",
    source: created.source,
    owner: created.owner,
    parentId: null,
    legacyCodes: [],
    measurementRule: null,
    rowVersion: created.rowVersion,
  };
  const update = await api(`/taxonomy/values/${created.id}`, adminSid, { method: "PATCH", body: JSON.stringify(updateBody) });
  assert.equal(update.status, 200, await update.clone().text());
  const updated = await update.json() as any;
  assert.equal(updated.stableKey, stableKey);
  assert.equal(updated.displayName, "Renamed label");

  const stale = await api(`/taxonomy/values/${created.id}`, adminSid, { method: "PATCH", body: JSON.stringify(updateBody) });
  assert.equal(stale.status, 409);

  const history = await api(`/taxonomy/values/${created.id}/history`, adminSid);
  assert.equal(history.status, 200);
  const events = await history.json() as any[];
  assert.ok(events.some((event) => event.action === "updated" && event.actorId === "public"));

  const deletion = await api(`/taxonomy/values/${created.id}`, adminSid, { method: "DELETE" });
  assert.equal(deletion.status, 409);
});

test("legal lifecycle transitions activate a value and block direct deletion", async () => {
  const create = await api("/taxonomy/values", adminSid, {
    method: "POST",
    body: JSON.stringify({
      stableKey: `TEST_LIFECYCLE_${crypto.randomUUID().replaceAll("-", "")}`,
      category: "product",
      displayName: "Lifecycle product",
      definition: "Product used to verify governed transitions.",
      effectiveStart: "2026-08-28",
      taxonomyVersion: "test-1",
      source: "Automated test",
      owner: "Test owner",
    }),
  });
  let value = await create.json() as any;
  for (const action of ["submit_review", "approve", "activate"]) {
    const response = await api(`/taxonomy/values/${value.id}/transition`, adminSid, {
      method: "POST",
      body: JSON.stringify({ action, reason: `Testing ${action}`, rowVersion: value.rowVersion }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    value = await response.json();
  }
  assert.equal(value.status, "active");
  assert.equal((await api(`/taxonomy/values/${value.id}`, adminSid, { method: "DELETE" })).status, 409);
});

test("import preview exposes the NA conflict and allows explicit resolution", async () => {
  const preview = await api("/taxonomy/imports/preview", adminSid, {
    method: "POST",
    body: JSON.stringify({ sourceFile: "taxonomy_workbook" }),
  });
  assert.equal(preview.status, 201, await preview.clone().text());
  const batch = await preview.json() as any;
  const response = await api(`/taxonomy/imports/${batch.id}/conflicts`, adminSid);
  const conflicts = await response.json() as any[];
  const na = conflicts.find((conflict) => conflict.sourceValue === "na");
  assert.ok(na);
  assert.match(na.details, /REGION_NORTH_AMERICA/);
  assert.match(na.details, /NOT_APPLICABLE/);

  const resolved = await api(`/taxonomy/conflicts/${na.id}/resolve`, adminSid, {
    method: "POST",
    body: JSON.stringify({
      status: "resolved",
      resolution: "The source row means no targeting was applied.",
      resolutionDecision: "not_applicable",
    }),
  });
  assert.equal(resolved.status, 200, await resolved.clone().text());
  assert.equal((await resolved.json() as any).status, "resolved");
});

test("campaign identity survives non-calendar multi-period budget planning with exact minor units", async () => {
  const [segment] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.category, "segment")).limit(1);
  const [persona] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.category, "persona")).limit(1);
  const [product] = await db.select().from(governedValuesTable).where(eq(governedValuesTable.category, "product")).limit(1);
  assert.ok(segment && persona && product);

  const calendarResponse = await api("/fiscal-calendars", undefined, {
    method: "POST",
    body: JSON.stringify({ stableKey: `TEST_CAL_${crypto.randomUUID()}`, name: "February fiscal year" }),
  });
  assert.equal(calendarResponse.status, 201, await calendarResponse.clone().text());
  const calendar = await calendarResponse.json() as any;
  const snapshotResponse = await api(`/fiscal-calendars/${calendar.id}/snapshots`, undefined, {
    method: "POST",
    body: JSON.stringify({
      version: 1,
      rules: { fiscalYearStarts: "02-01" },
      periods: [
        { stableKey: "FY30-P01", fiscalYear: "FY2030", fiscalQuarter: "Q1", fiscalPeriod: "P01", startDate: "2030-02-01", endDate: "2030-03-31" },
        { stableKey: "FY30-P02", fiscalYear: "FY2030", fiscalQuarter: "Q1", fiscalPeriod: "P02", startDate: "2030-04-01", endDate: "2030-04-30" },
      ],
    }),
  });
  assert.equal(snapshotResponse.status, 201, await snapshotResponse.clone().text());
  const snapshot = await snapshotResponse.json() as any;
  const activeSnapshot = await api(`/fiscal-calendars/${calendar.id}/active-snapshot`);
  assert.equal(activeSnapshot.status, 200, await activeSnapshot.clone().text());
  assert.deepEqual((await activeSnapshot.json() as any).periods.map((period: any) => period.stableKey), ["FY30-P01", "FY30-P02"]);

  const campaignResponse = await api("/campaigns", undefined, {
    method: "POST",
    body: JSON.stringify({
      name: `Portfolio visibility ${crypto.randomUUID()}`,
      campaignType: "integrated",
      relationshipType: "new",
      objective: "Create qualified demand",
      customerNeed: "Understand total portfolio exposure",
      desiredAction: "Request a consultation",
      startDate: "2030-02-01",
      endDate: "2030-04-30",
      deliverySummary: "Integrated email and event delivery",
    }),
  });
  assert.equal(campaignResponse.status, 201, await campaignResponse.clone().text());
  const campaign = await campaignResponse.json() as any;

  const audience = await api(`/campaigns/${campaign.campaignKey}/audiences`, undefined, {
    method: "PUT",
    body: JSON.stringify({ selections: [
      { dimension: "segment_family", governedValueId: segment.id, isPrimary: true, estimatedAudienceCount: 2500 },
      { dimension: "persona", governedValueId: persona.id, isPrimary: true, rawRepresentativeTitle: "Asset Owner CIO" },
    ] }),
  });
  assert.equal(audience.status, 200, await audience.clone().text());
  const products = await api(`/campaigns/${campaign.campaignKey}/products`, undefined, {
    method: "PUT",
    body: JSON.stringify({ associations: [
      { productValueId: product.id, role: "primary_solution", isPrimary: true },
    ] }),
  });
  assert.equal(products.status, 200, await products.clone().text());

  const activityResponse = await api(`/campaigns/${campaign.campaignKey}/activities`, undefined, {
    method: "POST",
    body: JSON.stringify({
      name: "Asset Owner roundtable",
      deliveryStartDate: "2030-03-15",
      deliveryEndDate: "2030-04-15",
      accountingDate: "2030-04-05",
      authoritativeCostMinor: "3001",
      currency: "USD",
      productValueIds: [product.id],
    }),
  });
  assert.equal(activityResponse.status, 201, await activityResponse.clone().text());
  const activity = await activityResponse.json() as any;
  assert.deepEqual(activity.productValueIds, [product.id]);
  const activityUpdate = await api(`/activities/${activity.id}`, undefined, {
    method: "PATCH",
    body: JSON.stringify({
      name: "Asset Owner executive roundtable",
      deliveryStartDate: "2030-03-15",
      deliveryEndDate: "2030-04-15",
      accountingDate: "2030-04-05",
      authoritativeCostMinor: "3001",
      currency: "USD",
      productValueIds: [product.id],
      reason: "Confirmed executive format",
    }),
  });
  assert.equal(activityUpdate.status, 200, await activityUpdate.clone().text());

  const costResponse = await api(`/campaigns/${campaign.campaignKey}/costs`, undefined, {
    method: "POST",
    body: JSON.stringify({
      description: "Shared creative and media",
      authoritativeAmountMinor: "10001",
      currency: "USD",
    }),
  });
  assert.equal(costResponse.status, 201, await costResponse.clone().text());
  const cost = await costResponse.json() as any;
  const invalidDimensions = await api(`/costs/${cost.id}/dimensions`, undefined, {
    method: "PUT",
    body: JSON.stringify({ allocations: [
      { dimension: "product", dimensionKey: product.id, allocationBasisPoints: 9999 },
    ] }),
  });
  assert.equal(invalidDimensions.status, 400);
  const dimensions = await api(`/costs/${cost.id}/dimensions`, undefined, {
    method: "PUT",
    body: JSON.stringify({ allocations: [
      { dimension: "product", dimensionKey: product.id, allocationBasisPoints: 10000 },
    ] }),
  });
  assert.equal(dimensions.status, 200, await dimensions.clone().text());
  assert.equal((await dimensions.json() as any[]).reduce((sum, item) => sum + item.allocationBasisPoints, 0), 10000);

  const budget = await api(`/campaigns/${campaign.campaignKey}/budget`, undefined, {
    method: "PUT",
    body: JSON.stringify({
      fiscalCalendarSnapshotId: snapshot.id,
      requestedMinor: "10001",
      approvedMinor: "10001",
      currency: "USD",
      currencyMinorUnits: 2,
      budgetOwner: "Demand Generation",
      costCenter: "MKT-100",
      fundingSource: "Annual plan",
      allocationMethod: "even",
    }),
  });
  assert.equal(budget.status, 200, await budget.clone().text());
  const generated = await api(`/campaigns/${campaign.campaignKey}/planning-periods/generate`, undefined, {
    method: "POST",
    body: JSON.stringify({ method: "even" }),
  });
  assert.equal(generated.status, 200, await generated.clone().text());
  const periods = await generated.json() as any[];
  assert.equal(periods.length, 2);
  assert.equal(periods.reduce((sum, period) => sum + BigInt(period.approvedMinor), 0n), 10001n);
  assert.equal(new Set(periods.map((period) => period.campaignKey)).size, 1);
  assert.equal(periods[0]!.campaignKey, campaign.campaignKey);
  const splitActivity = await api(`/activities/${activity.id}/period-allocations`, undefined, {
    method: "PUT",
    body: JSON.stringify({ method: "daily" }),
  });
  assert.equal(splitActivity.status, 200, await splitActivity.clone().text());
  const detail = await api(`/campaigns/${campaign.campaignKey}`);
  assert.equal(detail.status, 200, await detail.clone().text());
  const detailBody = await detail.json() as any;
  assert.equal(detailBody.activities.length, 1);
  assert.equal(detailBody.activities[0].periodAllocations.reduce((sum: bigint, allocation: any) => sum + BigInt(allocation.amountMinor), 0n), 3001n);
  assert.equal(detailBody.activities[0].productValueIds[0], product.id);
  assert.equal(detailBody.costs.length, 1);
  assert.equal(detailBody.costs[0].authoritativeAmountMinor, "10001");
  assert.equal(detailBody.costs[0].dimensions[0].allocationBasisPoints, 10000);

  const close = await api(`/planning-periods/${periods[0]!.id}/close`, undefined, {
    method: "POST",
    body: JSON.stringify({
      reason: "Quarter reconciliation approved",
      varianceExplanation: "No variance",
      unusedBudgetTreatment: "expire",
    }),
  });
  assert.equal(close.status, 200, await close.clone().text());
  await assert.rejects(
    db.update(campaignPlanningPeriodsTable)
      .set({ plannedMinor: "99999" })
      .where(eq(campaignPlanningPeriodsTable.id, periods[0]!.id)),
    (error: any) => /Closed campaign planning periods are locked|Reopening cannot alter immutable closed-period values/
      .test(String(error?.cause?.message ?? error?.message)),
  );
  await assert.rejects(
    db.update(campaignPlanningPeriodsTable)
      .set({ status: "open" })
      .where(eq(campaignPlanningPeriodsTable.id, periods[0]!.id)),
    (error: any) => /requires an immutable approval record/
      .test(String(error?.cause?.message ?? error?.message)),
  );
  const lockedCost = await api(`/costs/${cost.id}`, undefined, {
    method: "PATCH",
    body: JSON.stringify({
      description: "Attempted closed-period change",
      authoritativeAmountMinor: "10002",
      currency: "USD",
      reason: "Should be rejected",
    }),
  });
  assert.equal(lockedCost.status, 423);
  const newLockedCost = await api(`/campaigns/${campaign.campaignKey}/costs`, undefined, {
    method: "POST",
    body: JSON.stringify({
      description: "Attempted cost creation after close",
      authoritativeAmountMinor: "100",
      currency: "USD",
    }),
  });
  assert.equal(newLockedCost.status, 423);
  const reopened = await api(`/planning-periods/${periods[0]!.id}/reopen`, undefined, {
    method: "POST",
    body: JSON.stringify({
      reason: "Approved correction",
      approvedBy: "Finance administrator",
    }),
  });
  assert.equal(reopened.status, 200, await reopened.clone().text());

  const ready = await api(`/campaigns/${campaign.campaignKey}/readiness`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json() as any).ready, true);
});

test("evergreen planning uses review date and includes leap-day fiscal boundaries", async () => {
  const calendarResponse = await api("/fiscal-calendars", undefined, {
    method: "POST",
    body: JSON.stringify({ stableKey: `TEST_LEAP_${crypto.randomUUID()}`, name: "Leap-day fiscal calendar" }),
  });
  assert.equal(calendarResponse.status, 201, await calendarResponse.clone().text());
  const calendar = await calendarResponse.json() as any;
  const snapshotResponse = await api(`/fiscal-calendars/${calendar.id}/snapshots`, undefined, {
    method: "POST",
    body: JSON.stringify({
      version: 1,
      rules: { fiscalYearStarts: "02-01", leapDayExplicit: true },
      periods: [
        { stableKey: "FY32-P01", fiscalYear: "FY2032", fiscalQuarter: "Q1", fiscalPeriod: "P01", startDate: "2032-02-28", endDate: "2032-02-29" },
        { stableKey: "FY32-P02", fiscalYear: "FY2032", fiscalQuarter: "Q1", fiscalPeriod: "P02", startDate: "2032-03-01", endDate: "2032-03-31" },
      ],
    }),
  });
  assert.equal(snapshotResponse.status, 201, await snapshotResponse.clone().text());
  const snapshot = await snapshotResponse.json() as any;
  const campaignResponse = await api("/campaigns", undefined, {
    method: "POST",
    body: JSON.stringify({
      name: `Evergreen leap campaign ${crypto.randomUUID()}`,
      campaignType: "nurture",
      relationshipType: "new",
      startDate: "2032-02-28",
      isEvergreen: true,
      reviewDate: "2032-03-01",
    }),
  });
  assert.equal(campaignResponse.status, 201, await campaignResponse.clone().text());
  const campaign = await campaignResponse.json() as any;
  const budget = await api(`/campaigns/${campaign.campaignKey}/budget`, undefined, {
    method: "PUT",
    body: JSON.stringify({
      fiscalCalendarSnapshotId: snapshot.id,
      requestedMinor: "3",
      approvedMinor: "3",
      currency: "USD",
      currencyMinorUnits: 2,
      budgetOwner: "Lifecycle",
      costCenter: "MKT-LEAP",
      fundingSource: "Annual plan",
      allocationMethod: "monthly",
    }),
  });
  assert.equal(budget.status, 200, await budget.clone().text());
  const generated = await api(`/campaigns/${campaign.campaignKey}/planning-periods/generate`, undefined, {
    method: "POST",
    body: JSON.stringify({ method: "monthly" }),
  });
  assert.equal(generated.status, 200, await generated.clone().text());
  const periods = await generated.json() as any[];
  assert.equal(periods.length, 2);
  assert.equal(periods.reduce((sum, period) => sum + BigInt(period.approvedMinor), 0n), 3n);
  assert.ok(periods.some((period) => period.readableName.includes("FY2032 Q1")));
});

test.after(async () => {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, adminSid));
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, readerSid));
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, scopedSid));
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, logoutSid));
  await db.delete(taxonomyUserRolesTable).where(eq(taxonomyUserRolesTable.userId, adminUserId));
  await db.delete(taxonomyUserRolesTable).where(eq(taxonomyUserRolesTable.userId, readerUserId));
  await db.delete(taxonomyUserRolesTable).where(eq(taxonomyUserRolesTable.userId, scopedUserId));
  await db.delete(taxonomyUserRolesTable).where(eq(taxonomyUserRolesTable.userId, logoutUserId));
  await db.delete(usersTable).where(eq(usersTable.id, adminUserId));
  await db.delete(usersTable).where(eq(usersTable.id, readerUserId));
  await db.delete(usersTable).where(eq(usersTable.id, scopedUserId));
  await db.delete(usersTable).where(eq(usersTable.id, logoutUserId));
});