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
