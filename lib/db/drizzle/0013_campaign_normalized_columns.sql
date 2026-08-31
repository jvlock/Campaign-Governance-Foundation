DROP INDEX IF EXISTS "campaign_normalized_period_type_unique";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "normalized_name" text GENERATED ALWAYS AS (regexp_replace(lower(trim("name")), '[^a-z0-9]+', ' ', 'g')) STORED;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "normalized_start_date" date GENERATED ALWAYS AS (coalesce("start_date", DATE '0001-01-01')) STORED;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_normalized_period_type_unique" ON "campaigns" USING btree ("normalized_name","normalized_start_date","campaign_type");