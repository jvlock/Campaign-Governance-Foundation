import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "@workspace/db";

test("governed taxonomy schema, categories, and drafts are reachable", async () => {
  const counts = await pool.query<{
    categories: string;
    values: string;
    audits: string;
  }>(`
    select
      (select count(*) from taxonomy_categories)::text as categories,
      (select count(*) from governed_values)::text as values,
      (select count(*) from taxonomy_audit_events)::text as audits
  `);
  const row = counts.rows[0]!;
  assert.equal(Number(row.categories), 37);
  assert.ok(Number(row.values) >= 37);
  assert.ok(Number(row.audits) >= 37);
});

test("stable keys are unique and independent of fiscal hierarchy", async () => {
  const result = await pool.query<{ duplicates: string }>(`
    select count(*)::text as duplicates
    from (
      select stable_key from governed_values
      group by stable_key having count(*) > 1
    ) duplicate_keys
  `);
  assert.equal(Number(result.rows[0]?.duplicates ?? -1), 0);
});

test("campaign planning schema enforces enduring identity and append-only finance history", async () => {
  const result = await pool.query<{ campaigns: string; planning: string; historyTrigger: string }>(`
    select
      to_regclass('public.campaigns')::text as campaigns,
      to_regclass('public.campaign_planning_periods')::text as planning,
      (select count(*)::text from pg_trigger
       where tgname in ('campaigns_immutable_key', 'budget_history_append_only', 'campaign_period_closed_lock')) as "historyTrigger"
  `);
  assert.equal(result.rows[0]?.campaigns, "campaigns");
  assert.equal(result.rows[0]?.planning, "campaign_planning_periods");
  assert.equal(Number(result.rows[0]?.historyTrigger), 3);
});

test("closed planning periods require same-transaction immutable approval before value-preserving reopen", async () => {
  const result = await pool.query<{ func_def: string }>(`
    SELECT prosrc as func_def
    FROM pg_proc
    WHERE proname = 'protect_closed_campaign_period'
  `);
  const definition = result.rows[0]?.func_def;
  assert.ok(definition?.includes("Reopening cannot alter immutable closed-period values"));
  assert.ok(definition?.includes("action = 'reopen_approved'"));
  assert.ok(definition?.includes("created_at >= transaction_timestamp()"));
  assert.ok(definition?.includes("Closed campaign planning periods cannot be deleted"));
  const trigger = await pool.query<{ trigger_def: string }>(`
    SELECT pg_get_triggerdef(oid) as trigger_def
    FROM pg_trigger
    WHERE tgname = 'campaign_period_closed_lock'
  `);
  assert.ok(trigger.rows[0]?.trigger_def.includes("DELETE"));
});

test("activity and authoritative cost integrity constraints are installed", async () => {
  const result = await pool.query<{ constraints: string }>(`
    select count(*)::text as constraints
    from pg_constraint
    where conname in (
      'campaign_activity_delivery_range',
      'campaign_activity_minor_units',
      'campaign_cost_minor_units',
      'campaign_cost_basis_points_range'
    )
  `);
  assert.equal(Number(result.rows[0]?.constraints), 4);
});

test("configurable activities and stable execution lineage are installed and seeded", async () => {
  const result = await pool.query<{ configurations: string; published: string; executionTrigger: string }>(`
    select
      (select count(distinct stable_key)::text from activity_type_configurations) as configurations,
      (select count(*)::text from activity_type_configurations where status = 'published') as published,
      (select count(*)::text from pg_trigger where tgname = 'activity_execution_immutable_key') as "executionTrigger"
  `);
  assert.ok(Number(result.rows[0]?.configurations) >= 12);
  assert.ok(Number(result.rows[0]?.published) >= 12);
  assert.equal(Number(result.rows[0]?.executionTrigger), 1);
  const columns = await pool.query<{ count: string }>(`
    select count(*)::text as count from information_schema.columns
    where table_name = 'campaign_activities'
      and column_name in ('configuration_id','configuration_version','parent_activity_id','configuration_answers','row_version')
  `);
  assert.equal(Number(columns.rows[0]?.count), 5);
});

test("fiscal_snapshot_period_immutable trigger rejects INSERT when snapshot is published", async () => {
  const result = await pool.query<{ event_manipulation: string }>(`
    SELECT pg_get_triggerdef(oid) as event_manipulation
    FROM pg_trigger
    WHERE tgname = 'fiscal_snapshot_period_immutable'
  `);
  const triggerDef = result.rows[0]?.event_manipulation;
  assert.ok(
    triggerDef?.includes('INSERT') || triggerDef?.includes('insert'),
    "Trigger should apply to INSERT"
  );
  
  const funcResult = await pool.query<{ func_def: string }>(`
    SELECT prosrc as func_def
    FROM pg_proc
    WHERE proname = 'protect_fiscal_period_definition'
  `);
  const funcDef = funcResult.rows[0]?.func_def;
  assert.ok(
    funcDef?.includes('Cannot insert periods into a published snapshot'),
    "Function should reject INSERT into published snapshot"
  );
});

test("fiscal_snapshot_immutable trigger allows only false->true is_published transitions", async () => {
  const funcResult = await pool.query<{ func_def: string }>(`
    SELECT prosrc as func_def
    FROM pg_proc
    WHERE proname = 'protect_fiscal_snapshot_transition'
  `);
  const funcDef = funcResult.rows[0]?.func_def;
  assert.ok(funcDef?.includes('Fiscal calendar snapshots can only transition from unpublished to published'));
  assert.ok(funcDef?.includes('Published fiscal calendar snapshots cannot be changed'));
});

test("forward migration 0005 exists for campaign period lock and is tracked in journal", async () => {
  const journal = JSON.parse(fs.readFileSync('../lib/db/drizzle/meta/_journal.json', 'utf8'));
  assert.ok(journal.entries.some((e: any) => e.tag === '0005_closed_period_delete_lock'));
  assert.ok(fs.existsSync('../lib/db/drizzle/0005_closed_period_delete_lock.sql'));
});

test("forward migration 0006 contains idempotent channel seeds and execution integrity", () => {
  const journal = JSON.parse(fs.readFileSync('../lib/db/drizzle/meta/_journal.json', 'utf8'));
  assert.ok(journal.entries.some((e: any) => e.tag === '0006_configurable_channel_activities'));
  const migration = fs.readFileSync('../lib/db/drizzle/0006_configurable_channel_activities.sql', 'utf8');
  assert.match(migration, /ON CONFLICT \("stable_key","version"\) DO NOTHING/);
  assert.match(migration, /activity_execution_immutable_key/);
  for (const key of ['email', 'paid-search', 'paid-social', 'events', 'sales-cadences', 'mcp', 'partner-marketing']) {
    assert.ok(migration.includes(`('${key}'`), `missing seed ${key}`);
  }
});

test("forward repair migration 0007 restores schema-push integrity objects idempotently", () => {
  const journal = JSON.parse(fs.readFileSync('../lib/db/drizzle/meta/_journal.json', 'utf8'));
  assert.ok(journal.entries.some((e: any) => e.tag === '0007_schema_push_integrity_repair'));
  const migration = fs.readFileSync('../lib/db/drizzle/0007_schema_push_integrity_repair.sql', 'utf8');
  assert.match(migration, /DROP TRIGGER IF EXISTS campaign_period_closed_lock/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION protect_closed_campaign_period/);
  assert.match(migration, /campaign_activity_delivery_range/);
  assert.match(migration, /configuration_id/);
  assert.match(migration, /activity_type_configurations/);
});

test("activity configuration foreign key is declared in schema and installed in database", async () => {
  const schema = fs.readFileSync('../lib/db/src/schema/campaign-registry.ts', 'utf8');
  assert.match(schema, /configurationId: uuid\("configuration_id"\)\.references\(\(\) => activityTypeConfigurationsTable\.id/);
  const result = await pool.query<{ count: string }>(`
    select count(*)::text as count from pg_constraint constraint_row
    join pg_attribute column_row on column_row.attrelid = constraint_row.conrelid
      and column_row.attnum = any(constraint_row.conkey)
    where constraint_row.contype = 'f'
      and constraint_row.conrelid = 'campaign_activities'::regclass
      and column_row.attname = 'configuration_id'
  `);
  assert.equal(Number(result.rows[0]?.count), 1);
});

test("forward migration 0008 upgrades display partnership paid-media questions", () => {
  const migration = fs.readFileSync('../lib/db/drizzle/0008_display_partnership_paid_media_fields.sql', 'utf8');
  for (const field of ['campaign', 'audienceOrAdGroup', 'creative', 'placement', 'platformId', 'objective', 'landingPage']) {
    assert.ok(migration.includes(`"key":"${field}"`), `missing paid-media field ${field}`);
  }
  for (const field of ['deliveryStartDate', 'deliveryEndDate', 'productValueIds']) {
    assert.ok(migration.includes(`'${field}'`), `missing inheritance metadata ${field}`);
  }
  assert.match(migration, /inheritable_fields/);
  assert.match(migration, /permitted_overrides/);
});

test("route handlers use deterministic SELECT ... FOR UPDATE to eliminate races on period status", () => {
  const financeSrc = fs.readFileSync('../artifacts/api-server/src/routes/finance.ts', 'utf8');
  const campaignsSrc = fs.readFileSync('../artifacts/api-server/src/routes/campaigns.ts', 'utf8');

  // Verify finance endpoints
  const financeMatches = [...financeSrc.matchAll(/\.for\("update"\)/g)];
  assert.ok(financeMatches.length >= 6, "finance.ts should lock periods in cost, budget, generation, and allocation endpoints");

  // Verify campaign endpoints
  const campaignMatches = [...campaignsSrc.matchAll(/\.for\("update"\)/g)];
  assert.ok(campaignMatches.length >= 2, "campaigns.ts should use for('update') on activity endpoints");
});

test.after(async () => {
  await pool.end();
});
