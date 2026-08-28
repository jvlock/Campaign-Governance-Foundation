import assert from "node:assert/strict";
import test from "node:test";

test("health endpoint reports application and database readiness", async () => {
  const response = await fetch("http://localhost:80/api/healthz");
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, string>;
  assert.equal(body.status, "ok");
  assert.equal(body.database, "reachable");
});