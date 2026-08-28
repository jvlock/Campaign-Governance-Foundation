import { pool } from "@workspace/db";
(async () => {
  const result = await pool.query("SELECT pg_get_triggerdef(oid) as def FROM pg_trigger WHERE tgname = 'fiscal_snapshot_period_immutable'");
  console.log(result.rows);
  process.exit(0);
})();
