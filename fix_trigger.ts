import { pool } from "./lib/db/src/index.ts";
(async () => {
  await pool.query(`
    CREATE OR REPLACE FUNCTION protect_fiscal_snapshot_transition() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Fiscal calendar snapshots cannot be deleted';
      END IF;

      IF OLD.is_published THEN
        RAISE EXCEPTION 'Published fiscal calendar snapshots cannot be changed';
      END IF;

      IF NEW.id <> OLD.id OR NEW.fiscal_calendar_id <> OLD.fiscal_calendar_id OR
         NEW.version <> OLD.version OR NEW.rules <> OLD.rules OR
         NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Only the is_published status can be changed on a fiscal calendar snapshot';
      END IF;

      IF OLD.is_published = false AND NEW.is_published = false THEN
        RAISE EXCEPTION 'Fiscal calendar snapshots can only transition from unpublished to published';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log("Trigger replaced successfully.");
  process.exit(0);
})();
