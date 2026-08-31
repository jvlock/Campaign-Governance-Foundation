import assert from "node:assert/strict";
import test from "node:test";
import { chooseCohortTreatment, type CohortTreatmentCandidate } from "./campaign-cohort.ts";

const candidates: CohortTreatmentCandidate[] = [
  { id: "v1", stableKey: "COHORT_TEST", version: "1.0", status: "active", effectiveStart: "2026-01-01", effectiveEnd: null, eligibleChannels: ["CHANNEL_EMAIL"] },
  { id: "v2", stableKey: "COHORT_TEST", version: "2.0", status: "active", effectiveStart: "2026-07-01", effectiveEnd: null, eligibleChannels: ["CHANNEL_EMAIL"] },
];

test("an explicitly selected treatment ID persists exact version intent", () => {
  assert.equal(chooseCohortTreatment(candidates, "2026-08-01", ["CHANNEL_EMAIL"], "v1")?.id, "v1");
});

test("multiple effective versions resolve deterministically to latest effective treatment", () => {
  assert.equal(chooseCohortTreatment(candidates, "2026-08-01", ["CHANNEL_EMAIL"])?.id, "v2");
});

test("missing, inactive, or channel-ineligible treatment is rejected", () => {
  assert.equal(chooseCohortTreatment(candidates, "2025-01-01", ["CHANNEL_EMAIL"]), null);
  assert.equal(chooseCohortTreatment(candidates, "2026-08-01", ["CHANNEL_EVENT"]), null);
  assert.equal(chooseCohortTreatment(candidates, "2026-08-01", ["CHANNEL_EMAIL"], "missing"), null);
});