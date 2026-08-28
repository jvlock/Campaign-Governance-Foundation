CREATE TABLE "taxonomy_governance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_label" text NOT NULL,
	"reason" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_import_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"source_location" text NOT NULL,
	"category" text,
	"source_key" text,
	"source_label" text NOT NULL,
	"source_definition" text,
	"normalized_stable_key" text,
	"candidate_status" text DEFAULT 'candidate' NOT NULL,
	"raw_payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taxonomy_import_conflicts" ADD COLUMN "resolution_decision" text;--> statement-breakpoint
ALTER TABLE "taxonomy_import_conflicts" ADD COLUMN "target_value_id" uuid;--> statement-breakpoint
ALTER TABLE "taxonomy_import_candidates" ADD CONSTRAINT "taxonomy_import_candidates_import_batch_id_taxonomy_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."taxonomy_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_import_candidates" ADD CONSTRAINT "taxonomy_import_candidates_category_taxonomy_categories_key_fk" FOREIGN KEY ("category") REFERENCES "public"."taxonomy_categories"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taxonomy_governance_entity_idx" ON "taxonomy_governance_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "taxonomy_import_candidate_batch_idx" ON "taxonomy_import_candidates" USING btree ("import_batch_id");--> statement-breakpoint
ALTER TABLE "governed_values" ADD CONSTRAINT "governed_values_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governed_values" ADD CONSTRAINT "governed_values_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_import_conflicts" ADD CONSTRAINT "taxonomy_import_conflicts_target_value_id_governed_values_id_fk" FOREIGN KEY ("target_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "governed_values" ADD CONSTRAINT "governed_values_effective_dates_check" CHECK ("effective_end" IS NULL OR "effective_end" >= "effective_start");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_taxonomy_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Taxonomy audit records are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER taxonomy_audit_events_append_only
BEFORE UPDATE OR DELETE ON "taxonomy_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_taxonomy_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER taxonomy_governance_events_append_only
BEFORE UPDATE OR DELETE ON "taxonomy_governance_events"
FOR EACH ROW EXECUTE FUNCTION prevent_taxonomy_audit_mutation();