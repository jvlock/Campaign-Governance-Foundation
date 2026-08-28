import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  db,
  sessionsTable,
  taxonomyUserRolesTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const baseUrl = "http://localhost:80/api";
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
    headers.set("Origin", "http://localhost:80");
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