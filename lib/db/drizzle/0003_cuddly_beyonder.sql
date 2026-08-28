CREATE TABLE "campaign_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_key" uuid NOT NULL,
	"name" text NOT NULL,
	"delivery_start_date" date NOT NULL,
	"delivery_end_date" date NOT NULL,
	"accounting_date" date,
	"channel_value_id" uuid,
	"authoritative_cost_minor" text DEFAULT '0' NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_key" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"campaign_key" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"campaign_type" text NOT NULL,
	"relationship_type" text DEFAULT 'new' NOT NULL,
	"parent_campaign_key" uuid,
	"copied_from_campaign_key" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"objective" text,
	"customer_need" text,
	"desired_action" text,
	"start_date" date,
	"end_date" date,
	"is_evergreen" boolean DEFAULT false NOT NULL,
	"review_date" date,
	"delivery_summary" text,
	"setup_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issue_summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_product_associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"product_value_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_audience_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_key" uuid NOT NULL,
	"dimension" text NOT NULL,
	"governed_value_id" uuid,
	"unresolved_label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"raw_representative_title" text,
	"estimated_audience_count" integer,
	"measurement_basis" text,
	"warning_codes" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_cost_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cost_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"dimension_key" text NOT NULL,
	"allocation_basis_points" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_key" uuid NOT NULL,
	"description" text NOT NULL,
	"authoritative_amount_minor" text NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_product_associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_key" uuid NOT NULL,
	"product_value_id" uuid NOT NULL,
	"role" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messaging_cohort_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"governed_value_id" uuid NOT NULL,
	"version" text NOT NULL,
	"inclusion_rules" text NOT NULL,
	"exclusion_rules" text NOT NULL,
	"value_proposition" text NOT NULL,
	"effective_start" date NOT NULL,
	"effective_end" date,
	"source" text NOT NULL,
	"owner" text NOT NULL,
	"eligible_channel_value_ids" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_period_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"campaign_planning_period_id" uuid NOT NULL,
	"allocation_method" text NOT NULL,
	"amount_minor" text NOT NULL,
	"accounting_date" date
);
--> statement-breakpoint
CREATE TABLE "budget_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_key" uuid NOT NULL,
	"planning_period_id" uuid,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"approved_by" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_key" uuid NOT NULL,
	"fiscal_calendar_snapshot_id" uuid NOT NULL,
	"requested_minor" text NOT NULL,
	"approved_minor" text NOT NULL,
	"currency" text NOT NULL,
	"currency_minor_units" integer NOT NULL,
	"budget_owner" text NOT NULL,
	"cost_center" text NOT NULL,
	"funding_source" text NOT NULL,
	"allocation_method" text NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_budgets_campaign_key_unique" UNIQUE("campaign_key")
);
--> statement-breakpoint
CREATE TABLE "campaign_planning_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_key" text NOT NULL,
	"campaign_key" uuid NOT NULL,
	"fiscal_period_id" uuid NOT NULL,
	"readable_name" text NOT NULL,
	"requested_minor" text DEFAULT '0' NOT NULL,
	"approved_minor" text DEFAULT '0' NOT NULL,
	"planned_minor" text DEFAULT '0' NOT NULL,
	"committed_minor" text DEFAULT '0' NOT NULL,
	"actual_minor" text DEFAULT '0' NOT NULL,
	"forecast_minor" text DEFAULT '0' NOT NULL,
	"variance_explanation" text,
	"unused_budget_treatment" text,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"reopened_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "campaign_planning_periods_stable_key_unique" UNIQUE("stable_key")
);
--> statement-breakpoint
CREATE TABLE "fiscal_calendar_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiscal_calendar_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_key" text NOT NULL,
	"name" text NOT NULL,
	"active_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_calendars_stable_key_unique" UNIQUE("stable_key")
);
--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	"fiscal_year" text NOT NULL,
	"fiscal_quarter" text NOT NULL,
	"fiscal_period" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "campaign_activities" ADD CONSTRAINT "campaign_activities_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_history" ADD CONSTRAINT "campaign_history_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_parent_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("parent_campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_copied_from_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("copied_from_campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_product_associations" ADD CONSTRAINT "activity_product_associations_activity_id_campaign_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."campaign_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_product_associations" ADD CONSTRAINT "activity_product_associations_product_value_id_governed_values_id_fk" FOREIGN KEY ("product_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD CONSTRAINT "campaign_audience_selections_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD CONSTRAINT "campaign_audience_selections_governed_value_id_governed_values_id_fk" FOREIGN KEY ("governed_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_cost_dimensions" ADD CONSTRAINT "campaign_cost_dimensions_cost_id_campaign_costs_id_fk" FOREIGN KEY ("cost_id") REFERENCES "public"."campaign_costs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_costs" ADD CONSTRAINT "campaign_costs_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_product_associations" ADD CONSTRAINT "campaign_product_associations_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_product_associations" ADD CONSTRAINT "campaign_product_associations_product_value_id_governed_values_id_fk" FOREIGN KEY ("product_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_cohort_versions" ADD CONSTRAINT "messaging_cohort_versions_governed_value_id_governed_values_id_fk" FOREIGN KEY ("governed_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_period_allocations" ADD CONSTRAINT "activity_period_allocations_activity_id_campaign_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."campaign_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_period_allocations" ADD CONSTRAINT "activity_period_allocations_campaign_planning_period_id_campaign_planning_periods_id_fk" FOREIGN KEY ("campaign_planning_period_id") REFERENCES "public"."campaign_planning_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_history" ADD CONSTRAINT "budget_history_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_history" ADD CONSTRAINT "budget_history_planning_period_id_campaign_planning_periods_id_fk" FOREIGN KEY ("planning_period_id") REFERENCES "public"."campaign_planning_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_budgets" ADD CONSTRAINT "campaign_budgets_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_budgets" ADD CONSTRAINT "campaign_budgets_fiscal_calendar_snapshot_id_fiscal_calendar_snapshots_id_fk" FOREIGN KEY ("fiscal_calendar_snapshot_id") REFERENCES "public"."fiscal_calendar_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_planning_periods" ADD CONSTRAINT "campaign_planning_periods_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_planning_periods" ADD CONSTRAINT "campaign_planning_periods_fiscal_period_id_fiscal_periods_id_fk" FOREIGN KEY ("fiscal_period_id") REFERENCES "public"."fiscal_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_calendar_snapshots" ADD CONSTRAINT "fiscal_calendar_snapshots_fiscal_calendar_id_fiscal_calendars_id_fk" FOREIGN KEY ("fiscal_calendar_id") REFERENCES "public"."fiscal_calendars"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_snapshot_id_fiscal_calendar_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."fiscal_calendar_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_activities_campaign_idx" ON "campaign_activities" USING btree ("campaign_key");--> statement-breakpoint
CREATE INDEX "campaign_history_campaign_idx" ON "campaign_history" USING btree ("campaign_key","created_at");--> statement-breakpoint
CREATE INDEX "campaigns_status_dates_idx" ON "campaigns" USING btree ("status","start_date","end_date");--> statement-breakpoint
CREATE INDEX "campaigns_parent_idx" ON "campaigns" USING btree ("parent_campaign_key");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_product_unique" ON "activity_product_associations" USING btree ("activity_id","product_value_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_audience_value_unique" ON "campaign_audience_selections" USING btree ("campaign_key","dimension","governed_value_id");--> statement-breakpoint
CREATE INDEX "campaign_audience_dimension_idx" ON "campaign_audience_selections" USING btree ("campaign_key","dimension");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_cost_dimension_unique" ON "campaign_cost_dimensions" USING btree ("cost_id","dimension","dimension_key");--> statement-breakpoint
CREATE INDEX "campaign_cost_campaign_idx" ON "campaign_costs" USING btree ("campaign_key");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_product_role_unique" ON "campaign_product_associations" USING btree ("campaign_key","product_value_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_cohort_version_unique" ON "messaging_cohort_versions" USING btree ("governed_value_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_period_allocation_unique" ON "activity_period_allocations" USING btree ("activity_id","campaign_planning_period_id");--> statement-breakpoint
CREATE INDEX "budget_history_campaign_idx" ON "budget_history" USING btree ("campaign_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_planning_period_unique" ON "campaign_planning_periods" USING btree ("campaign_key","fiscal_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_calendar_snapshot_version_unique" ON "fiscal_calendar_snapshots" USING btree ("fiscal_calendar_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_period_snapshot_key_unique" ON "fiscal_periods" USING btree ("snapshot_id","stable_key");--> statement-breakpoint
CREATE INDEX "fiscal_period_dates_idx" ON "fiscal_periods" USING btree ("snapshot_id","start_date","end_date");
--> statement-breakpoint
ALTER TABLE "fiscal_calendars" ADD CONSTRAINT "fiscal_calendars_active_snapshot_fk" FOREIGN KEY ("active_snapshot_id") REFERENCES "public"."fiscal_calendar_snapshots"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "campaign_cost_dimensions" ADD CONSTRAINT "campaign_cost_basis_points_range" CHECK ("allocation_basis_points" BETWEEN 0 AND 10000);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaign_date_range" CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date");
--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_period_date_range" CHECK ("end_date" >= "start_date");
--> statement-breakpoint
ALTER TABLE "campaign_budgets" ADD CONSTRAINT "campaign_budget_minor_units" CHECK ("requested_minor" ~ '^[0-9]+$' AND "approved_minor" ~ '^[0-9]+$' AND "currency_minor_units" BETWEEN 0 AND 4);
--> statement-breakpoint
ALTER TABLE "campaign_planning_periods" ADD CONSTRAINT "campaign_period_minor_units" CHECK (
  "requested_minor" ~ '^[0-9]+$' AND "approved_minor" ~ '^[0-9]+$' AND
  "planned_minor" ~ '^[0-9]+$' AND "committed_minor" ~ '^[0-9]+$' AND
  "actual_minor" ~ '^[0-9]+$' AND "forecast_minor" ~ '^[0-9]+$'
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_campaign_key_change() RETURNS trigger AS $$
BEGIN
  IF NEW.campaign_key <> OLD.campaign_key THEN
    RAISE EXCEPTION 'Campaign Key is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER campaigns_immutable_key BEFORE UPDATE ON "campaigns"
FOR EACH ROW EXECUTE FUNCTION prevent_campaign_key_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_immutable_record_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Immutable history or fiscal snapshot records cannot be changed';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER campaign_history_append_only BEFORE UPDATE OR DELETE ON "campaign_history"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_change();
--> statement-breakpoint
CREATE TRIGGER budget_history_append_only BEFORE UPDATE OR DELETE ON "budget_history"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_fiscal_snapshot_transition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Fiscal calendar snapshots cannot be deleted';
  END IF;

  IF OLD.is_published THEN
    RAISE EXCEPTION 'Published fiscal calendar snapshots cannot be changed';
  END IF;

  IF NEW.id <> OLD.id OR NEW.fiscal_calendar_id <> OLD.fiscal_calendar_id OR
     NEW.version <> OLD.version OR NEW.rules::text <> OLD.rules::text OR
     NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Only the is_published status can be changed on a fiscal calendar snapshot';
  END IF;

  IF OLD.is_published = false AND NEW.is_published = false THEN
    RAISE EXCEPTION 'Fiscal calendar snapshots can only transition from unpublished to published';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER fiscal_snapshot_immutable BEFORE UPDATE OR DELETE ON "fiscal_calendar_snapshots"
FOR EACH ROW EXECUTE FUNCTION protect_fiscal_snapshot_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_fiscal_period_definition() RETURNS trigger AS $$
DECLARE
  v_is_published boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT is_published INTO v_is_published FROM fiscal_calendar_snapshots WHERE id = NEW.snapshot_id;
    IF v_is_published THEN
      RAISE EXCEPTION 'Cannot insert periods into a published snapshot';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Published fiscal periods cannot be deleted';
  END IF;
  IF NEW.snapshot_id <> OLD.snapshot_id OR NEW.stable_key <> OLD.stable_key OR
     NEW.fiscal_year <> OLD.fiscal_year OR NEW.fiscal_quarter <> OLD.fiscal_quarter OR
     NEW.fiscal_period <> OLD.fiscal_period OR NEW.start_date <> OLD.start_date OR
     NEW.end_date <> OLD.end_date THEN
    RAISE EXCEPTION 'Published fiscal period definitions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER fiscal_snapshot_period_immutable BEFORE INSERT OR UPDATE OR DELETE ON "fiscal_periods"
FOR EACH ROW EXECUTE FUNCTION protect_fiscal_period_definition();
--> statement-breakpoint
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
CREATE TRIGGER campaign_period_closed_lock BEFORE UPDATE OR DELETE ON "campaign_planning_periods"
FOR EACH ROW EXECUTE FUNCTION protect_closed_campaign_period();