import assert from "node:assert/strict";
import test from "node:test";
import { stageReferenceSource } from "./reference-import.ts";

test("source workbook evidence retains mapped and unresolved classifications", () => {
  const rows = stageReferenceSource("segments_workbook");
  assert.ok(rows.some((row) => row.category === "persona" && row.sourceLabel === "Finance & Executive Leadership"));
  assert.ok(rows.some((row) => row.category === "persona" && /Other|All|Mixed/i.test(row.sourceLabel)));
  assert.ok(rows.some((row) => row.category === "account_size_tier"));
  assert.ok(rows.every((row) => row.sourceLocation && row.rawPayload));
});