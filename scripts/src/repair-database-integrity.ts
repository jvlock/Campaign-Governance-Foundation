import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(scriptsDir, "../../lib/db/drizzle");

const configurableActivities = await fs.readFile(
  path.join(migrationsDir, "0006_configurable_channel_activities.sql"),
  "utf8",
);
const integrityRepair = await fs.readFile(
  path.join(migrationsDir, "0007_schema_push_integrity_repair.sql"),
  "utf8",
);
const configurationUpdates = await fs.readFile(
  path.join(migrationsDir, "0008_display_partnership_paid_media_fields.sql"),
  "utf8",
);

const configurableActivityRepair = configurableActivities.slice(
  configurableActivities.indexOf("DO $$ BEGIN"),
);

if (!configurableActivityRepair) {
  throw new Error("Could not locate the configurable activity integrity section");
}

await pool.query(`
  BEGIN;
  ${configurableActivityRepair}
  ${integrityRepair}
  ${configurationUpdates}
  COMMIT;
`);

await pool.end();
console.log("Restored migration-only constraints, triggers, and system configurations.");