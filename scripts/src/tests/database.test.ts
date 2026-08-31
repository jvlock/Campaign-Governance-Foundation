import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "@workspace/db";

test("governed taxonomy and campaign planning schema are reachable", async () => {
  const result = await pool.query<{ categories: string; values: string; campaigns: string; planning: string }>(`
    select
      (select count(*) from taxonomy_categories)::text as categories,
      (select count(*) from governed_values)::text as values,
      to_regclass('public.campaigns')::text as campaigns,
      to_regclass('public.campaign_planning_periods')::text as planning
  `);
  assert.ok(Number(result.rows[0]?.categories) >= 41);
  assert.ok(Number(result.rows[0]?.values) >= 41);
  assert.equal(result.rows[0]?.campaigns, "campaigns");
  assert.equal(result.rows[0]?.planning, "campaign_planning_periods");
});

test("stable taxonomy and campaign keys are unique", async () => {
  const result = await pool.query<{ taxonomyDuplicates: string; campaignDuplicates: string }>(`
    select
      (select count(*) from (select stable_key from governed_values group by stable_key having count(*) > 1) rows)::text as "taxonomyDuplicates",
      (select count(*) from (select campaign_key from campaigns group by campaign_key having count(*) > 1) rows)::text as "campaignDuplicates"
  `);
  assert.equal(Number(result.rows[0]?.taxonomyDuplicates), 0);
  assert.equal(Number(result.rows[0]?.campaignDuplicates), 0);
});

test("main finance, activity, and immutable execution protections remain installed", async () => {
  const result = await pool.query<{ constraints: string; triggers: string; configurations: string }>(`
    select
      (select count(*) from pg_constraint where conname in (
        'campaign_activity_delivery_range','campaign_activity_minor_units','campaign_cost_minor_units','campaign_cost_basis_points_range'
      ))::text as constraints,
      (select count(*) from pg_trigger where tgname in (
        'campaigns_immutable_key','budget_history_append_only','campaign_period_closed_lock','activity_execution_immutable_key'
      ))::text as triggers,
      (select count(distinct stable_key) from activity_type_configurations)::text as configurations
  `);
  assert.equal(Number(result.rows[0]?.constraints), 4);
  assert.equal(Number(result.rows[0]?.triggers), 4);
  assert.ok(Number(result.rows[0]?.configurations) >= 12);
});

test("Task 6 rules, exact cohorts, request linkage, and product uniqueness are installed", async () => {
  const result = await pool.query<{ rules: string; cohorts: string; columns: string; productColumns: string; productIndexes: string }>(`
    select
      (select count(*) from account_size_rules)::text as rules,
      (select count(*) from messaging_cohort_versions)::text as cohorts,
      (select count(*) from information_schema.columns where table_schema = 'public'
        and table_name = 'campaign_audience_selections'
        and column_name in ('provenance','inherited_from_campaign_key','account_size_rule_id','account_size_rule_version','review_request_id','resolution_status','resolved_governed_value_id'))::text as columns,
      (select count(*) from information_schema.columns where table_schema = 'public'
        and table_name = 'campaign_product_associations'
        and column_name in ('provenance','inherited_from_campaign_key'))::text as "productColumns",
      (select count(*) from pg_indexes where schemaname = 'public'
        and indexname in ('campaign_product_value_unique','campaign_product_one_primary_unique'))::text as "productIndexes"
  `);
  assert.ok(Number(result.rows[0]?.rules) >= 2);
  assert.ok(Number(result.rows[0]?.cohorts) >= 3);
  assert.equal(Number(result.rows[0]?.columns), 7);
  assert.equal(Number(result.rows[0]?.productColumns), 2);
  assert.equal(Number(result.rows[0]?.productIndexes), 2);
});

test("migration journal retains main history and generated Task 6 metadata", () => {
  const journal = JSON.parse(fs.readFileSync("../lib/db/drizzle/meta/_journal.json", "utf8"));
  for (const tag of [
    "0005_closed_period_delete_lock", "0006_configurable_channel_activities",
    "0007_schema_push_integrity_repair", "0008_display_partnership_paid_media_fields",
    "0009_execution_delivery_publish", "0010_campaign_task6_governance",
  ]) assert.ok(journal.entries.some((entry: { tag: string }) => entry.tag === tag), `missing ${tag}`);
  const migration = fs.readFileSync("../lib/db/drizzle/0010_campaign_task6_governance.sql", "utf8");
  assert.match(migration, /messaging_cohort_versions/);
  assert.match(migration, /campaign_normalized_period_type_unique/);
});

test.after(async () => {
  await pool.end();
});