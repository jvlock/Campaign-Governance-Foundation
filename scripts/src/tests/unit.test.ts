import assert from "node:assert/strict";
import test from "node:test";

const roleRank = {
  reader: 0,
  contributor: 1,
  reviewer: 2,
  steward: 3,
  administrator: 4,
} as const;

test("governance roles are strictly ordered", () => {
  assert.ok(roleRank.administrator > roleRank.steward);
  assert.ok(roleRank.steward > roleRank.reviewer);
  assert.ok(roleRank.reviewer > roleRank.contributor);
  assert.ok(roleRank.contributor > roleRank.reader);
});

test("stable keys do not encode mutable display names", () => {
  const original = { stableKey: "SEGMENT_ENTERPRISE", displayName: "Enterprise" };
  const renamed = { ...original, displayName: "Strategic enterprise" };
  assert.equal(renamed.stableKey, original.stableKey);
  assert.notEqual(renamed.displayName, original.displayName);
});

test("ambiguous legacy NA values require explicit disambiguation", () => {
  const replacements = ["REGION_NORTH_AMERICA", "NOT_APPLICABLE"];
  assert.equal(new Set(replacements).size, 2);
  assert.ok(replacements.every((key) => key !== "na"));
});
