-- Repair integrity objects omitted when the development database was schema-pushed.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_attribute column_row
      ON column_row.attrelid = constraint_row.conrelid
      AND column_row.attnum = ANY(constraint_row.conkey)
    WHERE constraint_row.contype = 'f'
      AND constraint_row.conrelid = 'campaign_activities'::regclass
      AND column_row.attname = 'configuration_id'
  ) THEN
    ALTER TABLE campaign_activities
      ADD CONSTRAINT campaign_activities_configuration_id_activity_type_configurations_id_fk
      FOREIGN KEY (configuration_id) REFERENCES activity_type_configurations(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_activity_delivery_range') THEN
    ALTER TABLE campaign_activities ADD CONSTRAINT campaign_activity_delivery_range CHECK (delivery_end_date >= delivery_start_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_activity_minor_units') THEN
    ALTER TABLE campaign_activities ADD CONSTRAINT campaign_activity_minor_units CHECK (authoritative_cost_minor ~ '^[0-9]+$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_cost_minor_units') THEN
    ALTER TABLE campaign_costs ADD CONSTRAINT campaign_cost_minor_units CHECK (authoritative_amount_minor ~ '^[0-9]+$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_cost_basis_points_range') THEN
    ALTER TABLE campaign_cost_dimensions ADD CONSTRAINT campaign_cost_basis_points_range CHECK (allocation_basis_points BETWEEN 0 AND 10000);
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_campaign_key_change() RETURNS trigger AS $$
BEGIN IF NEW.campaign_key <> OLD.campaign_key THEN RAISE EXCEPTION 'Campaign Key is immutable'; END IF; RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION prevent_immutable_record_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Immutable history or fiscal snapshot records cannot be changed'; END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION protect_fiscal_snapshot_transition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Fiscal calendar snapshots cannot be deleted'; END IF;
  IF OLD.is_published THEN RAISE EXCEPTION 'Published fiscal calendar snapshots cannot be changed'; END IF;
  IF NEW.id <> OLD.id OR NEW.fiscal_calendar_id <> OLD.fiscal_calendar_id OR NEW.version <> OLD.version OR NEW.rules::text <> OLD.rules::text OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN RAISE EXCEPTION 'Only the is_published status can be changed on a fiscal calendar snapshot'; END IF;
  IF OLD.is_published = false AND NEW.is_published = false THEN RAISE EXCEPTION 'Fiscal calendar snapshots can only transition from unpublished to published'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION protect_fiscal_period_definition() RETURNS trigger AS $$
DECLARE v_is_published boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN SELECT is_published INTO v_is_published FROM fiscal_calendar_snapshots WHERE id = NEW.snapshot_id; IF v_is_published THEN RAISE EXCEPTION 'Cannot insert periods into a published snapshot'; END IF; RETURN NEW; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Published fiscal periods cannot be deleted'; END IF;
  IF NEW.snapshot_id <> OLD.snapshot_id OR NEW.stable_key <> OLD.stable_key OR NEW.fiscal_year <> OLD.fiscal_year OR NEW.fiscal_quarter <> OLD.fiscal_quarter OR NEW.fiscal_period <> OLD.fiscal_period OR NEW.start_date <> OLD.start_date OR NEW.end_date <> OLD.end_date THEN RAISE EXCEPTION 'Published fiscal period definitions are immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION protect_closed_campaign_period() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN IF OLD.status = 'closed' THEN RAISE EXCEPTION 'Closed campaign planning periods cannot be deleted'; END IF; RETURN OLD; END IF;
  IF OLD.status = 'closed' THEN
    IF NEW.status <> 'open' THEN RAISE EXCEPTION 'Closed campaign planning periods are locked'; END IF;
    IF ROW(NEW.stable_key,NEW.campaign_key,NEW.fiscal_period_id,NEW.readable_name,NEW.requested_minor,NEW.approved_minor,NEW.planned_minor,NEW.committed_minor,NEW.actual_minor,NEW.forecast_minor,NEW.variance_explanation,NEW.unused_budget_treatment,NEW.closed_at) IS DISTINCT FROM ROW(OLD.stable_key,OLD.campaign_key,OLD.fiscal_period_id,OLD.readable_name,OLD.requested_minor,OLD.approved_minor,OLD.planned_minor,OLD.committed_minor,OLD.actual_minor,OLD.forecast_minor,OLD.variance_explanation,OLD.unused_budget_treatment,OLD.closed_at) THEN RAISE EXCEPTION 'Reopening cannot alter immutable closed-period values'; END IF;
    IF NOT EXISTS (SELECT 1 FROM budget_history WHERE planning_period_id = OLD.id AND action = 'reopen_approved' AND created_at >= transaction_timestamp()) THEN RAISE EXCEPTION 'Closed period reopening requires an immutable approval record'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS campaigns_immutable_key ON campaigns;
CREATE TRIGGER campaigns_immutable_key BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION prevent_campaign_key_change();
DROP TRIGGER IF EXISTS campaign_history_append_only ON campaign_history;
CREATE TRIGGER campaign_history_append_only BEFORE UPDATE OR DELETE ON campaign_history FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_change();
DROP TRIGGER IF EXISTS budget_history_append_only ON budget_history;
CREATE TRIGGER budget_history_append_only BEFORE UPDATE OR DELETE ON budget_history FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_change();
DROP TRIGGER IF EXISTS fiscal_snapshot_immutable ON fiscal_calendar_snapshots;
CREATE TRIGGER fiscal_snapshot_immutable BEFORE UPDATE OR DELETE ON fiscal_calendar_snapshots FOR EACH ROW EXECUTE FUNCTION protect_fiscal_snapshot_transition();
DROP TRIGGER IF EXISTS fiscal_snapshot_period_immutable ON fiscal_periods;
CREATE TRIGGER fiscal_snapshot_period_immutable BEFORE INSERT OR UPDATE OR DELETE ON fiscal_periods FOR EACH ROW EXECUTE FUNCTION protect_fiscal_period_definition();
DROP TRIGGER IF EXISTS campaign_period_closed_lock ON campaign_planning_periods;
CREATE TRIGGER campaign_period_closed_lock BEFORE UPDATE OR DELETE ON campaign_planning_periods FOR EACH ROW EXECUTE FUNCTION protect_closed_campaign_period();