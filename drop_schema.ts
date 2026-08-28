import { pool } from "./lib/db/src/index.ts";
(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  process.exit(0);
})();
