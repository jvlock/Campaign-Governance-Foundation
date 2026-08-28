CREATE OR REPLACE FUNCTION protect_closed_campaign_period() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'closed' THEN
      RAISE EXCEPTION 'Closed campaign planning periods cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'closed' THEN
    IF NEW.status <> 'open' THEN
      RAISE EXCEPTION 'Closed campaign planning periods are locked';
    END IF;
    IF ROW(
      NEW.stable_key, NEW.campaign_key, NEW.fiscal_period_id, NEW.readable_name,
      NEW.requested_minor, NEW.approved_minor, NEW.planned_minor, NEW.committed_minor,
      NEW.actual_minor, NEW.forecast_minor, NEW.variance_explanation,
      NEW.unused_budget_treatment, NEW.closed_at
    ) IS DISTINCT FROM ROW(
      OLD.stable_key, OLD.campaign_key, OLD.fiscal_period_id, OLD.readable_name,
      OLD.requested_minor, OLD.approved_minor, OLD.planned_minor, OLD.committed_minor,
      OLD.actual_minor, OLD.forecast_minor, OLD.variance_explanation,
      OLD.unused_budget_treatment, OLD.closed_at
    ) THEN
      RAISE EXCEPTION 'Reopening cannot alter immutable closed-period values';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM budget_history
      WHERE planning_period_id = OLD.id
        AND action = 'reopen_approved'
        AND created_at >= transaction_timestamp()
    ) THEN
      RAISE EXCEPTION 'Closed period reopening requires an immutable approval record';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS campaign_period_closed_lock ON "campaign_planning_periods";
--> statement-breakpoint
CREATE TRIGGER campaign_period_closed_lock BEFORE UPDATE OR DELETE ON "campaign_planning_periods"
FOR EACH ROW EXECUTE FUNCTION protect_closed_campaign_period();
