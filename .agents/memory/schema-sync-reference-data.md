---
name: Schema sync and reference data
description: How governed reference rows must be delivered alongside schema changes in this project.
---

Keep required governed reference rows in an idempotent seed path even when a migration also inserts them. The seed must repair canonical metadata on conflict, not merely ignore an existing stable key.

**Why:** Replit development schema sync applies structural changes but does not reliably execute migration DML or raw trigger/function SQL. Migration-only cohort, source-evidence, activity-configuration, and integrity objects were absent after successful schema pushes. Existing stable keys may also retain stale category/status metadata unless conflict updates restore the canonical record.

**How to apply:** After schema push, run the idempotent database-integrity repair and governed-data seed. Upsert all canonical metadata required for classification, then verify live row counts, indexes, foreign keys, triggers, and representative records.