import assert from "node:assert/strict";
import test from "node:test";
import { loadCanonicalUtmGuide } from "../utm-taxonomy-catalog";

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

test("canonical UTM guide catalog has hierarchy and complete channel capabilities", () => {
  const guide = loadCanonicalUtmGuide();
  assert.equal(guide.productLines.length, 7);
  assert.ok(Object.keys(guide.hierarchy).length >= 7);
  assert.deepEqual(guide.hierarchy.privateasset.expansion.slice(0, 2), ["super-return", "pa-lp"]);
  assert.equal(guide.subCampaignLabels.index.i4e["custom-indx"], "Custom Indexes");
  assert.equal(guide.channels.length, 13);
  const paidSearch = guide.channels.find((channel) => channel.id === "psg");
  assert.deepEqual(paidSearch && {
    source: paidSearch.source, medium: paidSearch.medium, type: paidSearch.type,
    searchOnly: paidSearch.searchOnly, targeting: paidSearch.targeting,
  }, { source: "google", medium: "cpc", type: "paid", searchOnly: true, targeting: { obj: true, aud: true, seg: true, reg: true } });
});
