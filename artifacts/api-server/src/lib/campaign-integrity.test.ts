import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("../../lib/db/drizzle/0010_campaign_task6_governance.sql", "utf8");
const routes = readFileSync("src/routes/campaigns.ts", "utf8");
const wizard = readFileSync("../campaign-governance/src/pages/create-campaign.tsx", "utf8");
const openapi = readFileSync("../../lib/api-spec/openapi.yaml", "utf8");
const taxonomySeed = readFileSync("../../scripts/src/seed-taxonomy.ts", "utf8");
const taxonomyCategorySchema = readFileSync("../../lib/api-zod/src/generated/types/taxonomyCategoryKey.ts", "utf8");
const financeRoutes = readFileSync("src/routes/finance.ts", "utf8");
const executionRoutes = readFileSync("src/routes/channel-activities.ts", "utf8");

test("null-date campaign uniqueness uses a valid PostgreSQL sentinel", () => {
  assert.match(migration, /coalesce\("start_date", DATE '0001-01-01'\)/);
  assert.doesNotMatch(migration, /''::date/);
});

test("campaign cohort selection persists an exact main treatment version", () => {
  assert.match(migration, /PRIMARY KEY\("campaign_key","governed_value_id"\)/);
  assert.match(migration, /REFERENCES "public"\."messaging_cohort_versions"\("id"\)/);
  assert.match(migration, /campaign_cohort_treatment_unique/);
});

test("ownership, active values, product uniqueness, rules and reporting are integrated", () => {
  assert.match(routes, /requireCampaignOwner/);
  assert.match(routes, /active or approved governed values/);
  assert.match(migration, /campaign_product_value_unique/);
  assert.match(routes, /current segment-specific rule/);
  assert.match(routes, /authoritativeCosts/);
});

test("submission and replacement writes serialize on the campaign row", () => {
  assert.ok((routes.match(/\.for\("update"\)/g) ?? []).length >= 5);
  assert.match(routes, /locked\.rowVersion !== body\.data\.rowVersion/);
  assert.match(routes, /eq\(campaignsTable\.rowVersion, locked\.rowVersion\)/);
  assert.match(routes, /isUniqueViolation/);
  assert.ok((routes.match(/validatePersistedGovernanceAssignments/g) ?? []).length >= 3);
  assert.match(routes, /Revisit Cohorts & sizing/);
  assert.ok((routes.match(/nextCampaignPlanVersion/g) ?? []).length >= 3);
  assert.match(openapi, /required: \[rowVersion, selections\]/);
  assert.match(openapi, /required: \[rowVersion, associations\]/);
  assert.match(openapi, /AudiencePlanResponse/);
  assert.match(openapi, /ProductPlanResponse/);
});

test("exact sizing rule and product inheritance semantics are migrated", () => {
  assert.match(migration, /account_size_rule_id/);
  assert.match(migration, /account_size_rules_id_fk/);
  assert.match(migration, /campaign_product_one_primary_unique/);
  assert.match(migration, /campaign_product_associations" ADD COLUMN "provenance"/);
  assert.match(migration, /campaign_product_associations" ADD COLUMN "inherited_from_campaign_key"/);
  assert.match(routes, /Exactly one campaign product must be primary/);
});

test("wizard has a persisted resume contract and at least seven steps", () => {
  assert.match(wizard, /requestedKey/);
  assert.match(wizard, /wizardStep/);
  assert.match(wizard, /useUpdateCampaign/);
  assert.match(wizard, /Review & submit/);
  assert.match(wizard, /pipelineRef/);
  assert.match(wizard, /rowVersion: saved\.rowVersion/);
  assert.match(wizard, /rowVersion: latest\.rowVersion, selections/);
  assert.match(wizard, /rowVersion: latest\.rowVersion, associations/);
  assert.match(wizard, /latest = \{ \.\.\.latest, rowVersion: audienceResult\.rowVersion \}/);
  assert.match(wizard, /latest = \{ \.\.\.latest, rowVersion: productResult\.rowVersion \}/);
  assert.ok((wizard.match(/Step/g) ?? []).length >= 7);
});

test("wizard and idempotent seed expose canonical active primary segments", () => {
  assert.match(wizard, /category: "segment", status: "active"/);
  assert.match(wizard, /dimension === "segment_family"/);
  assert.match(wizard, /value\.category === "segment" && value\.status === "active"/);
  assert.match(taxonomySeed, /SEGMENT_ASSET_OWNERS.*category: "segment".*Asset Owners/);
  assert.match(taxonomySeed, /SEGMENT_HEDGE_FUNDS.*category: "segment".*Hedge Funds/);
  assert.match(taxonomySeed, /onConflictDoUpdate[\s\S]*category: seed\.category[\s\S]*status: "active"/);
});

test("wizard isolates the all-active catalog from segment queries for products, cohorts and channels", () => {
  assert.match(wizard, /\["campaign-wizard", "all-active-governed-values"\]/);
  assert.match(wizard, /\["campaign-wizard", "active-segments"\]/);
  assert.match(wizard, /governed\.filter\(\(value\) => value\.category === CATEGORY\[dimension\] && value\.status === "active"\)/);
  assert.match(wizard, /\["product","capability_solution"\]\.includes\(value\.category\)/);
  assert.match(wizard, /value\.category === "channel"/);
  assert.match(wizard, /\["account_size_tier","messaging_cohort","behavioral_cohort"\]/);
});

test("generated governed-value category schema accepts every seeded category", () => {
  const seededCategories = [
    "strategic_program", "segment", "subsegment", "account_size_tier", "account_priority_tier", "relationship",
    "buying_group_function", "persona", "seniority_level", "messaging_cohort", "behavioral_cohort", "audience_origin",
    "product", "product_family", "capability_solution", "customer_need", "campaign_type", "business_objective",
    "commercial_motion", "marketing_objective", "primary_conversion", "journey_stage", "region", "subregion",
    "country", "market_cluster", "language", "channel", "source", "delivery_mechanism", "platform", "activity_type",
    "creative_format", "call_to_action", "campaign_member_status_template", "fiscal_calendar", "fiscal_year",
    "fiscal_quarter", "fiscal_period", "currency", "cost_center",
  ];
  for (const category of seededCategories) {
    assert.match(taxonomyCategorySchema, new RegExp(`['\"]${category}['\"]`), `generated schema rejects ${category}`);
  }
});

test("campaign authorization covers direct and indirect finance resources", () => {
  assert.match(routes, /requireCampaignAccess/);
  assert.match(financeRoutes, /authorizeCost\(req, res, params\.data\.costId\)/);
  assert.match(financeRoutes, /authorizePlanningPeriod\(req, res, params\.data\.planningPeriodId\)/);
  assert.match(financeRoutes, /authorizeActivity\(req, res, params\.data\.activityId\)/);
  assert.match(financeRoutes, /requireAdministrator\(req, res\)/);
});

test("campaign relationship inheritance requires mutate access to its source", () => {
  assert.match(routes, /if \(source && !await requireCampaignOwner\(req, res, source\)\) return;/);
  assert.match(routes, /if \(source && !existingSourceKey && !await requireCampaignOwner\(req, res, source\)\) return;/);
  assert.match(routes, /relationshipType === "copy" \? body\.data\.copiedFromCampaignKey : body\.data\.parentCampaignKey/);
  assert.match(routes, /relationshipType === "copy" \? values\.copiedFromCampaignKey : values\.parentCampaignKey/);
});

test("campaign authorization covers execution lists, copies, versions and publication", () => {
  assert.match(executionRoutes, /authorizeActivity\(req, res, params\.data\.activityId, "view"\)/);
  assert.match(executionRoutes, /authorizeExecution\(req, res, params\.data\.executionKey, "mutate"\)/);
  assert.match(executionRoutes, /authorizeActivity\(req, res, targetActivityId, "mutate"\)/);
  assert.match(executionRoutes, /authorizeExecution\(req, res, params\.data\.executionKey, "view"\)/);
});