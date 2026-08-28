import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "@workspace/db";

test("governed taxonomy schema, categories, and drafts are reachable", async () => {
  const counts = await pool.query<{
    categories: string;
    values: string;
    audits: string;
  }>(`
    select
      (select count(*) from taxonomy_categories)::text as categories,
      (select count(*) from governed_values)::text as values,
      (select count(*) from taxonomy_audit_events)::text as audits
  `);
  const row = counts.rows[0]!;
  assert.equal(Number(row.categories), 37);
  assert.ok(Number(row.values) >= 37);
  assert.ok(Number(row.audits) >= 37);
});

test("stable keys are unique and independent of fiscal hierarchy", async () => {
  const result = await pool.query<{ duplicates: string }>(`
    select count(*)::text as duplicates
    from (
      select stable_key from governed_values
      group by stable_key having count(*) > 1
    ) duplicate_keys
  `);
  assert.equal(Number(result.rows[0]?.duplicates ?? -1), 0);
});

test.after(async () => {
  await pool.end();
});