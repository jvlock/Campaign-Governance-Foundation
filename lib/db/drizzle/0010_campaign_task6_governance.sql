CREATE TABLE "campaign_cohort_treatments" (
	"campaign_key" uuid NOT NULL,
	"governed_value_id" uuid NOT NULL,
	"treatment_id" uuid NOT NULL,
	"treatment_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_cohort_treatments_campaign_key_governed_value_id_pk" PRIMARY KEY("campaign_key","governed_value_id")
);
--> statement-breakpoint
CREATE TABLE "account_size_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"measurement_basis" text NOT NULL,
	"minimum" numeric(18, 2),
	"maximum" numeric(18, 2),
	"unit" text NOT NULL,
	"source" text NOT NULL,
	"effective_start" date NOT NULL,
	"effective_end" date,
	"version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_label" text NOT NULL,
	"subsegment_label" text NOT NULL,
	"size_tier_label" text NOT NULL,
	"canonical_persona" text,
	"classification_status" text NOT NULL,
	"raw_classification" text NOT NULL,
	"representative_titles" text NOT NULL,
	"planning_estimate" integer NOT NULL,
	"source_file" text NOT NULL,
	"source_sheet" text NOT NULL,
	"source_rows" text NOT NULL
);
--> statement-breakpoint
DROP INDEX "campaign_product_role_unique";--> statement-breakpoint
WITH ranked_primary AS (
	SELECT "id", row_number() OVER (PARTITION BY "campaign_key" ORDER BY "created_at", "id") AS position
	FROM "campaign_product_associations"
	WHERE "is_primary" = true
)
UPDATE "campaign_product_associations" product
SET "is_primary" = false
FROM ranked_primary
WHERE product."id" = ranked_primary."id" AND ranked_primary.position > 1;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD COLUMN "provenance" text DEFAULT 'selected' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD COLUMN "inherited_from_campaign_key" uuid;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD COLUMN "account_size_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD COLUMN "account_size_rule_version" text;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD COLUMN "review_request_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD COLUMN "resolution_status" text DEFAULT 'governed' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD COLUMN "resolved_governed_value_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_product_associations" ADD COLUMN "provenance" text DEFAULT 'selected' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_product_associations" ADD COLUMN "inherited_from_campaign_key" uuid;--> statement-breakpoint
ALTER TABLE "campaign_cohort_treatments" ADD CONSTRAINT "campaign_cohort_treatments_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_cohort_treatments" ADD CONSTRAINT "campaign_cohort_treatments_governed_value_id_governed_values_id_fk" FOREIGN KEY ("governed_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_cohort_treatments" ADD CONSTRAINT "campaign_cohort_treatments_treatment_id_messaging_cohort_versions_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "public"."messaging_cohort_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_size_rules" ADD CONSTRAINT "account_size_rules_segment_id_governed_values_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_size_rules" ADD CONSTRAINT "account_size_rules_tier_id_governed_values_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_cohort_treatment_unique" ON "campaign_cohort_treatments" USING btree ("campaign_key","treatment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_size_rule_version_idx" ON "account_size_rules" USING btree ("segment_id","tier_id","version");--> statement-breakpoint
CREATE INDEX "audience_evidence_segment_idx" ON "audience_evidence" USING btree ("segment_label","subsegment_label");--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD CONSTRAINT "campaign_audience_selections_inherited_from_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("inherited_from_campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD CONSTRAINT "campaign_audience_selections_account_size_rule_id_account_size_rules_id_fk" FOREIGN KEY ("account_size_rule_id") REFERENCES "public"."account_size_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD CONSTRAINT "campaign_audience_selections_review_request_id_taxonomy_review_requests_id_fk" FOREIGN KEY ("review_request_id") REFERENCES "public"."taxonomy_review_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_selections" ADD CONSTRAINT "campaign_audience_selections_resolved_governed_value_id_governed_values_id_fk" FOREIGN KEY ("resolved_governed_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_product_associations" ADD CONSTRAINT "campaign_product_associations_inherited_from_campaign_key_campaigns_campaign_key_fk" FOREIGN KEY ("inherited_from_campaign_key") REFERENCES "public"."campaigns"("campaign_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_normalized_period_type_unique" ON "campaigns" USING btree (regexp_replace(lower(trim("name")), '[^a-z0-9]+', ' ', 'g'),coalesce("start_date", DATE '0001-01-01'),"campaign_type");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_product_value_unique" ON "campaign_product_associations" USING btree ("campaign_key","product_value_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_product_one_primary_unique" ON "campaign_product_associations" USING btree ("campaign_key") WHERE "campaign_product_associations"."is_primary" = true;