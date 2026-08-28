import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "@workspace/db";

test("database schema and draft seeds are reachable", async () => {
  const result = await pool.query<{ count: string }>(
    "select count(*)::text as count from taxonomy_values where status = 'draft'",
  );
  assert.ok(Number(result.rows[0]?.count ?? 0) >= 5);
  await pool.end();
});