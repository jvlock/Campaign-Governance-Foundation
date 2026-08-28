import assert from "node:assert/strict";
import test from "node:test";

test("reference seeds carry governance provenance", () => {
  const seed = {
    status: "draft",
    source: "reference workbook",
    taxonomyVersion: "reference-import-2026.08",
  };
  assert.equal(seed.status, "draft");
  assert.ok(seed.source.length > 0);
  assert.match(seed.taxonomyVersion, /^reference-import-/);
});