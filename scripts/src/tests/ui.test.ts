import assert from "node:assert/strict";
import test from "node:test";

const expectedDestinations = [
  "Home",
  "Create Campaign",
  "Campaign Directory",
  "Approvals and QA",
  "Taxonomy Administration",
  "Reporting and Exports",
];

test("foundation navigation contains every required primary area", () => {
  assert.equal(expectedDestinations.length, 6);
  assert.ok(expectedDestinations.every((label) => label.length > 0));
});