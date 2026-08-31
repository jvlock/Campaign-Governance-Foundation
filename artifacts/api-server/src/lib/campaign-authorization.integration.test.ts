import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import {
  activityExecutionsTable,
  campaignActivitiesTable,
  campaignCostsTable,
  campaignsTable,
  db,
  fiscalCalendarsTable,
  sessionsTable,
  taxonomyUserRolesTable,
  usersTable,
} from "@workspace/db";

process.env.NODE_ENV = "production";

const denial = { error: "Campaign access denied" };

test("production HTTP routes enforce campaign object authorization", async () => {
  const suffix = randomUUID();
  const ownerId = `auth-owner-${suffix}`;
  const unrelatedId = `auth-unrelated-${suffix}`;
  const adminId = `auth-admin-${suffix}`;
  const ownerSid = `owner-${suffix}`;
  const unrelatedSid = `unrelated-${suffix}`;
  const adminSid = `admin-${suffix}`;
  const userIds = [ownerId, unrelatedId, adminId];
  const sessionIds = [ownerSid, unrelatedSid, adminSid];
  let campaignKey: string | undefined;
  let submittedSourceKey: string | undefined;
  let ownerTargetKey: string | undefined;
  let unrelatedTargetKey: string | undefined;
  let activityId: string | undefined;
  let executionKey: string | undefined;
  let costId: string | undefined;
  let adminCalendarId: string | undefined;
  let server: import("node:http").Server | undefined;

  try {
    await db.insert(usersTable).values(userIds.map((id) => ({
      id, email: `${id}@example.test`, firstName: id, lastName: "Authorization",
    })));
    await db.insert(taxonomyUserRolesTable).values([
      { userId: ownerId, role: "contributor" },
      { userId: unrelatedId, role: "reader" },
      { userId: adminId, role: "administrator" },
    ]);
    const expire = new Date(Date.now() + 60_000);
    const session = (id: string) => ({
      user: { id, email: `${id}@example.test`, firstName: id, lastName: "Authorization", profileImageUrl: null },
      access_token: "integration-test",
    });
    await db.insert(sessionsTable).values([
      { sid: ownerSid, sess: session(ownerId), expire },
      { sid: unrelatedSid, sess: session(unrelatedId), expire },
      { sid: adminSid, sess: session(adminId), expire },
    ]);
    const [campaign] = await db.insert(campaignsTable).values({
      name: `Authorization fixture ${suffix}`,
      campaignType: "integrated",
      status: "draft",
      createdBy: ownerId,
      updatedBy: ownerId,
    }).returning({ campaignKey: campaignsTable.campaignKey });
    campaignKey = campaign!.campaignKey;
    const [submittedSource, ownerTarget, unrelatedTarget] = await db.insert(campaignsTable).values([
      {
        name: `Authorization submitted source ${suffix}`,
        campaignType: "integrated",
        status: "submitted",
        createdBy: ownerId,
        updatedBy: ownerId,
      },
      {
        name: `Authorization owner target ${suffix}`,
        campaignType: "integrated",
        status: "draft",
        createdBy: ownerId,
        updatedBy: ownerId,
      },
      {
        name: `Authorization unrelated target ${suffix}`,
        campaignType: "integrated",
        status: "draft",
        createdBy: unrelatedId,
        updatedBy: unrelatedId,
      },
    ]).returning({ campaignKey: campaignsTable.campaignKey, createdBy: campaignsTable.createdBy, status: campaignsTable.status });
    submittedSourceKey = submittedSource!.campaignKey;
    ownerTargetKey = ownerTarget!.campaignKey;
    unrelatedTargetKey = unrelatedTarget!.campaignKey;
    const [cost] = await db.insert(campaignCostsTable).values({
      campaignKey, description: "Authorization fixture cost", authoritativeAmountMinor: "100", currency: "USD",
    }).returning({ id: campaignCostsTable.id });
    costId = cost!.id;
    const [activity] = await db.insert(campaignActivitiesTable).values({
      campaignKey,
      name: "Authorization fixture activity",
      deliveryStartDate: "2026-01-01",
      deliveryEndDate: "2026-01-02",
      currency: "USD",
      createdBy: ownerId,
      updatedBy: ownerId,
    }).returning({ id: campaignActivitiesTable.id });
    activityId = activity!.id;
    const [execution] = await db.insert(activityExecutionsTable).values({
      activityId,
      name: "Authorization fixture execution",
      createdBy: ownerId,
      updatedBy: ownerId,
    }).returning({ executionKey: activityExecutionsTable.executionKey });
    executionKey = execution!.executionKey;

    const app = (await import("../app.ts")).default;
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve());
    });
    const address = server!.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api`;
    const request = async (sid: string, path: string, method = "GET", body?: unknown) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${sid}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as unknown };
    };
    const assertDenied = async (path: string, method = "GET", body?: unknown) => {
      const response = await request(unrelatedSid, path, method, body);
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.deepEqual(response.body, denial, `${method} ${path}`);
    };

    const campaignUpdate = {
      name: `Unauthorized update ${suffix}`,
      campaignType: "integrated",
      relationshipType: "new",
      isEvergreen: false,
      rowVersion: 1,
      reason: "Authorization integration test",
    };
    const costInput = { description: "Unauthorized", authoritativeAmountMinor: "100", currency: "USD" };
    await assertDenied(`/campaigns/${campaignKey}`);
    await assertDenied(`/campaigns/${campaignKey}`, "PATCH", campaignUpdate);
    await assertDenied(`/campaigns/${campaignKey}/costs`, "POST", costInput);
    await assertDenied(`/costs/${costId}`, "PATCH", { ...costInput, reason: "Unauthorized" });
    await assertDenied(`/costs/${costId}/dimensions`, "PUT", {
      allocations: [{ dimension: "product", dimensionKey: randomUUID(), allocationBasisPoints: 10_000 }],
    });
    await assertDenied(`/activities/${activityId}/executions`);
    await assertDenied(`/activities/${activityId}/executions`, "POST", { name: "Unauthorized execution" });
    await assertDenied(`/executions/${executionKey}`, "PATCH", { name: "Unauthorized", rowVersion: 1 });
    await assertDenied(`/executions/${executionKey}/copy`, "POST", { name: "Unauthorized copy" });
    await assertDenied(`/executions/${executionKey}/versions`, "POST", { name: "Unauthorized version" });
    await assertDenied("/fiscal-calendars", "POST", { stableKey: `UNAUTHORIZED_${suffix}`, name: "Unauthorized" });

    const sources = [campaignKey, submittedSourceKey];
    for (const sourceKey of sources) {
      await assertDenied("/campaigns", "POST", {
        name: `Unauthorized copy ${sourceKey}`,
        campaignType: "integrated",
        relationshipType: "copy",
        copiedFromCampaignKey: sourceKey,
      });
      await assertDenied("/campaigns", "POST", {
        name: `Unauthorized related ${sourceKey}`,
        campaignType: "integrated",
        relationshipType: "wave",
        parentCampaignKey: sourceKey,
      });
      await assertDenied(`/campaigns/${unrelatedTargetKey}`, "PATCH", {
        name: `Authorization unrelated target ${suffix}`,
        campaignType: "integrated",
        relationshipType: "copy",
        copiedFromCampaignKey: sourceKey,
        isEvergreen: false,
        rowVersion: 1,
        reason: "Unauthorized source assignment",
      });
      await assertDenied(`/campaigns/${unrelatedTargetKey}`, "PATCH", {
        name: `Authorization unrelated target ${suffix}`,
        campaignType: "integrated",
        relationshipType: "wave",
        parentCampaignKey: sourceKey,
        isEvergreen: false,
        rowVersion: 1,
        reason: "Unauthorized source assignment",
      });
    }
    const [unchangedTarget] = await db.select().from(campaignsTable)
      .where(eq(campaignsTable.campaignKey, unrelatedTargetKey));
    assert.equal(unchangedTarget!.parentCampaignKey, null);
    assert.equal(unchangedTarget!.copiedFromCampaignKey, null);
    assert.equal(unchangedTarget!.rowVersion, 1);
    const unrelatedCampaigns = await db.select({ campaignKey: campaignsTable.campaignKey }).from(campaignsTable)
      .where(eq(campaignsTable.createdBy, unrelatedId));
    assert.deepEqual(unrelatedCampaigns.map((campaign) => campaign.campaignKey), [unrelatedTargetKey]);

    for (const sid of [ownerSid, adminSid]) {
      const detail = await request(sid, `/campaigns/${campaignKey}`);
      assert.notEqual(detail.status, 401);
      assert.notEqual(detail.status, 403);
      const executions = await request(sid, `/activities/${activityId}/executions`);
      assert.notEqual(executions.status, 401);
      assert.notEqual(executions.status, 403);
    }
    for (const sid of [ownerSid, adminSid]) {
      const authorizedCreate = await request(sid, "/campaigns", "POST", {
        name: `Authorization fixture ${suffix}`,
        campaignType: "integrated",
        relationshipType: "copy",
        copiedFromCampaignKey: campaignKey,
      });
      assert.notEqual(authorizedCreate.status, 401);
      assert.notEqual(authorizedCreate.status, 403);
    }
    const ownerSourceUpdate = await request(ownerSid, `/campaigns/${ownerTargetKey}`, "PATCH", {
      name: `Authorization owner target ${suffix}`,
      campaignType: "integrated",
      relationshipType: "wave",
      parentCampaignKey: campaignKey,
      isEvergreen: false,
      rowVersion: 999,
      reason: "Authorized source assignment preflight",
    });
    assert.notEqual(ownerSourceUpdate.status, 401);
    assert.notEqual(ownerSourceUpdate.status, 403);
    const adminSourceUpdate = await request(adminSid, `/campaigns/${unrelatedTargetKey}`, "PATCH", {
      name: `Authorization unrelated target ${suffix}`,
      campaignType: "integrated",
      relationshipType: "copy",
      copiedFromCampaignKey: submittedSourceKey,
      isEvergreen: false,
      rowVersion: 999,
      reason: "Administrator source assignment preflight",
    });
    assert.notEqual(adminSourceUpdate.status, 401);
    assert.notEqual(adminSourceUpdate.status, 403);
    const ownerExecution = await request(ownerSid, `/activities/${activityId}/executions`, "POST", {
      name: "Authorized owner execution",
    });
    assert.notEqual(ownerExecution.status, 401);
    assert.notEqual(ownerExecution.status, 403);
    const adminCalendar = await request(adminSid, "/fiscal-calendars", "POST", {
      stableKey: `AUTH_${suffix}`,
      name: "Authorization fixture calendar",
    });
    assert.notEqual(adminCalendar.status, 401);
    assert.notEqual(adminCalendar.status, 403);
    if (adminCalendar.status === 201 && typeof adminCalendar.body === "object" && adminCalendar.body) {
      adminCalendarId = (adminCalendar.body as { id?: string }).id;
    }
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (campaignKey) {
      await db.delete(campaignCostsTable).where(eq(campaignCostsTable.campaignKey, campaignKey));
      await db.delete(campaignActivitiesTable).where(eq(campaignActivitiesTable.campaignKey, campaignKey));
      await db.delete(campaignsTable).where(inArray(
        campaignsTable.campaignKey,
        [campaignKey, submittedSourceKey, ownerTargetKey, unrelatedTargetKey].filter((key): key is string => Boolean(key)),
      ));
    }
    if (adminCalendarId) await db.delete(fiscalCalendarsTable).where(eq(fiscalCalendarsTable.id, adminCalendarId));
    await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sessionIds));
    await db.delete(taxonomyUserRolesTable).where(inArray(taxonomyUserRolesTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
});