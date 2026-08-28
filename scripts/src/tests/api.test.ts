import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  db,
  campaignPlanningPeriodsTable,
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