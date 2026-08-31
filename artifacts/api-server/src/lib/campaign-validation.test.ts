import assert from "node:assert/strict";
import test from "node:test";
import { allowedParent, normalizeCampaignName, validateCampaign } from "./campaign-validation.ts";

const base = {
  name: "  Asset Owner—Growth  ",
  hierarchyKind: "campaign",
  campaignType: "integrated",
  parentId: null,
  startDate: "2026-01-01",
  endDate: "2026-03-31",
  planningEstimate: 500,
  audiences: [
    { dimension: "segment_family", valueId: "segment-1", isPrimary: true },
    { dimension: "persona", valueId: "persona-1", rawValue: "Finance Leadership", isPrimary: false },
  ],
  products: [
    { productId: "product-1", role: "primary_solution" },
    { productId: "product-2", role: "proof_point" },
  ],
  promotedProductIds: [],
};

test("campaign names normalize without becoming identity", () => {
  assert.equal(normalizeCampaignName("  Asset Owner—Growth  "), "asset owner growth");
});

test("valid multi-persona and multi-product combinations do not duplicate campaign cost", () => {
  const issues = validateCampaign({
    ...base,
    audiences: [...base.audiences, { dimension: "persona", valueId: "persona-2", rawValue: "Investment Leadership", isPrimary: false }],
  });
  assert.equal(issues.filter((issue) => issue.severity === "error").length, 0);
  assert.equal(base.products.length, 2);
  assert.equal("cost" in base.products[0], false);
});

test("catch-all persona and duplicate product associations are rejected", () => {
  const issues = validateCampaign({
    ...base,
    audiences: [
      { dimension: "segment_family", valueId: "segment-1", isPrimary: true },
      { dimension: "persona", rawValue: "Other / Mixed-title", isPrimary: false },
    ],
    products: [base.products[0], base.products[0]],
  });
  assert.ok(issues.some((issue) => issue.code === "unresolved_classification"));
  assert.ok(issues.some((issue) => issue.code === "duplicate_product"));
  assert.ok(issues.some((issue) => issue.code === "meaningful_persona"));
});

test("planning estimates and inconsistent geography produce warnings", () => {
  const issues = validateCampaign({
    ...base,
    planningEstimate: 12,
    audiences: [...base.audiences, { dimension: "country", valueId: "country-1", isPrimary: false }],
  });
  assert.ok(issues.some((issue) => issue.code === "audience_too_small"));
  assert.ok(issues.some((issue) => issue.code === "geography_inconsistent"));
});

test("activity promotion is a subset and hierarchy rules are explicit", () => {
  const issues = validateCampaign({ ...base, hierarchyKind: "activity", parentId: "parent", promotedProductIds: ["outside"] });
  assert.ok(issues.some((issue) => issue.code === "promoted_subset"));
  assert.equal(allowedParent("wave", "campaign"), true);
  assert.equal(allowedParent("wave", "activity"), false);
  assert.equal(allowedParent("activity", "wave"), true);
});

test("type-specific hierarchy and dates are validated", () => {
  const issues = validateCampaign({ ...base, campaignType: "newsletter", hierarchyKind: "campaign", startDate: "2026-03-01", endDate: "2026-02-01" });
  assert.ok(issues.some((issue) => issue.code === "type_hierarchy"));
  assert.ok(issues.some((issue) => issue.code === "date_range"));
});