import assert from "node:assert/strict";
import test from "node:test";
import { governanceAssignmentIssues, nextCampaignPlanVersion } from "./campaign-governance-validity.ts";

const valid = {
  campaignStart: "2026-04-01",
  campaignEnd: "2026-06-30",
  channelValueIds: ["email"],
  primarySegmentId: "segment",
  accountSelections: [{ tierId: "large", measurementBasis: "AUM", ruleId: "rule-1", ruleVersion: "2" }],
  accountRules: [{ id: "rule-1", segmentId: "segment", tierId: "large", measurementBasis: "AUM", version: "2", effectiveStart: "2026-01-01", effectiveEnd: "2026-12-31" }],
  cohortSelectionIds: ["cohort"],
  cohortAssociations: [{ governedValueId: "cohort", treatmentId: "treatment-1", treatmentVersion: "3" }],
  cohortVersions: [{ id: "treatment-1", governedValueId: "cohort", version: "3", effectiveStart: "2026-01-01", effectiveEnd: "2026-12-31", eligibleChannelValueIds: ["email", "events"] }],
};

test("exact account rule and cohort treatment remain valid across their full interval", () => {
  assert.deepEqual(governanceAssignmentIssues(valid), []);
});

test("date and channel changes invalidate exact persisted assignments without switching versions", () => {
  assert.deepEqual(governanceAssignmentIssues({ ...valid, campaignEnd: "2027-01-01" }), [
    "Persisted account-size rule is no longer eligible",
    "Persisted messaging-cohort treatment is no longer eligible",
  ]);
  assert.deepEqual(governanceAssignmentIssues({ ...valid, channelValueIds: ["paid-social"] }), [
    "Persisted messaging-cohort treatment is no longer eligible",
  ]);
});

test("stale IDs, versions, basis, segment, and tier are rejected", () => {
  assert.deepEqual(governanceAssignmentIssues({
    ...valid,
    accountSelections: [{ ...valid.accountSelections[0]!, ruleVersion: "1" }],
    cohortAssociations: [{ ...valid.cohortAssociations[0]!, treatmentId: "missing" }],
  }), [
    "Persisted account-size rule is no longer eligible",
    "Persisted messaging-cohort treatment is no longer eligible",
  ]);
});

test("plan replacements reject stale versions and hand off versions sequentially", () => {
  const afterAudience = nextCampaignPlanVersion("draft", 7, 7);
  assert.equal(afterAudience, 8);
  assert.equal(nextCampaignPlanVersion("draft", afterAudience!, afterAudience!), 9);
  assert.equal(nextCampaignPlanVersion("draft", afterAudience!, 7), null);
  assert.equal(nextCampaignPlanVersion("submitted", afterAudience!, afterAudience!), null);
});