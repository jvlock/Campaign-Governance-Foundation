CREATE TABLE IF NOT EXISTS "activity_type_configurations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stable_key" text NOT NULL,
  "display_name" text NOT NULL,
  "channel_value_id" uuid REFERENCES "governed_values"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL CHECK ("version" > 0),
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','published')),
  "questions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "validations" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "naming_template" text NOT NULL,
  "member_statuses" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "inheritable_fields" text[] NOT NULL DEFAULT '{}',
  "permitted_overrides" text[] NOT NULL DEFAULT '{}',
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "published_by" text,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "activity_type_configuration_key_version_unique" UNIQUE ("stable_key","version")
);
CREATE INDEX IF NOT EXISTS "activity_type_configuration_status_idx" ON "activity_type_configurations" ("status","stable_key");
--> statement-breakpoint
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "parent_activity_id" uuid REFERENCES "campaign_activities"("id") ON DELETE RESTRICT;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "configuration_id" uuid REFERENCES "activity_type_configurations"("id") ON DELETE RESTRICT;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "configuration_version" integer;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "activity_type" text;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "owner" text;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "platform" text;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'draft';
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "audience_treatment" text;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "region" text;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "language" text;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "primary_cta" text;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "landing_destination" text;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "asset_ids" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "external_ids" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "configuration_answers" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "row_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "created_by" text NOT NULL DEFAULT 'public';
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "updated_by" text NOT NULL DEFAULT 'public';
ALTER TABLE "campaign_activities" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS "campaign_activities_parent_idx" ON "campaign_activities" ("parent_activity_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_executions" (
  "execution_key" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "activity_id" uuid NOT NULL REFERENCES "campaign_activities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "version_number" integer NOT NULL DEFAULT 1 CHECK ("version_number" > 0),
  "copied_from_execution_key" uuid REFERENCES "activity_executions"("execution_key") ON DELETE RESTRICT,
  "previous_version_execution_key" uuid REFERENCES "activity_executions"("execution_key") ON DELETE RESTRICT,
  "creative_lineage" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "copy_lineage" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "asset_ids" text[] NOT NULL DEFAULT '{}',
  "external_ids" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "configuration_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "activity_executions_activity_idx" ON "activity_executions" ("activity_id","created_at");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_execution_copy_not_self') THEN
    ALTER TABLE "activity_executions" ADD CONSTRAINT "activity_execution_copy_not_self"
      CHECK ("copied_from_execution_key" IS NULL OR "copied_from_execution_key" <> "execution_key");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_execution_version_not_self') THEN
    ALTER TABLE "activity_executions" ADD CONSTRAINT "activity_execution_version_not_self"
      CHECK ("previous_version_execution_key" IS NULL OR "previous_version_execution_key" <> "execution_key");
  END IF;
END $$;
CREATE OR REPLACE FUNCTION protect_activity_execution_key() RETURNS trigger AS $$
BEGIN
  IF NEW.execution_key <> OLD.execution_key THEN
    RAISE EXCEPTION 'Execution keys are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS activity_execution_immutable_key ON "activity_executions";
CREATE TRIGGER activity_execution_immutable_key BEFORE UPDATE ON "activity_executions"
FOR EACH ROW EXECUTE FUNCTION protect_activity_execution_key();
--> statement-breakpoint
INSERT INTO "activity_type_configurations"
("stable_key","display_name","version","status","questions","validations","naming_template","member_statuses","inheritable_fields","permitted_overrides","created_by","updated_by","published_by","published_at")
VALUES
('email','Email',1,'published','[{"key":"emailType","required":true,"options":["activation","nurture","newsletter","campaign","event invitation","post-event","single CTA"]}]','{}','{campaign}-{activityType}-{name}','["Sent","Opened","Clicked","Responded"]','{"region","language","owner"}','{"owner","region","language","primaryCta","landingDestination"}','system','system','system',now()),
('paid-search','Paid search',1,'published','[{"key":"objective","required":true},{"key":"campaign","required":true},{"key":"audienceOrAdGroup","required":true},{"key":"creative","required":true},{"key":"placement","required":true},{"key":"platformId","required":true},{"key":"landingPage","required":true}]','{}','{campaign}-paid-search-{name}','[]','{"region","language"}','{"region","language","landingDestination"}','system','system','system',now()),
('paid-social','Paid social',1,'published','[{"key":"objective","required":true},{"key":"campaign","required":true},{"key":"audienceOrAdGroup","required":true},{"key":"creative","required":true},{"key":"placement","required":true},{"key":"platformId","required":true},{"key":"landingPage","required":true}]','{}','{campaign}-paid-social-{name}','[]','{"region","language"}','{"region","language","landingDestination"}','system','system','system',now()),
('display-content-partnerships','Display and content partnerships',1,'published','[{"key":"campaign","required":true},{"key":"audienceOrAdGroup","required":true},{"key":"creative","required":true},{"key":"placement","required":true},{"key":"platformId","required":true},{"key":"objective","required":true},{"key":"landingPage","required":true}]','{}','{campaign}-display-{name}','[]','{"region","language"}','{"region","language","landingDestination"}','system','system','system',now()),
('organic-social','Organic social',1,'published','[{"key":"socialFormat","required":true}]','{}','{campaign}-organic-{name}','[]','{"region","language"}','{"region","language"}','system','system','system',now()),
('employee-advocacy','Employee advocacy',1,'published','[{"key":"advocacyProgram","required":true}]','{}','{campaign}-advocacy-{name}','[]','{"region","language"}','{"region","language"}','system','system','system',now()),
('events','Events',1,'published','[{"key":"eventType","required":true,"options":["event series","individual event","registration source","attendance","no-show","handraiser","follow-up"]}]','{}','{campaign}-{eventType}-{name}','["Registered","Attended","No-show","Handraiser","Follow-up"]','{"region","language","owner"}','{"owner","region","language"}','system','system','system',now()),
('sales-cadences','Sales cadences',1,'published','[{"key":"salesType","required":true,"options":["prospecting","handraiser recovery","event follow-up","account expansion","cross-sell","renewal support","executive outreach"]}]','{}','{campaign}-{salesType}-{name}','["Targeted","Contacted","Responded","Qualified"]','{"region","language","owner"}','{"owner","region","language"}','system','system','system',now()),
('in-app','In-app',1,'published','[{"key":"placement","required":true}]','{}','{campaign}-in-app-{name}','[]','{"region","language"}','{"region","language","primaryCta"}','system','system','system',now()),
('mcp','MCP',1,'published','[{"key":"intentCategory","required":true,"options":["awareness","consideration","evaluation","conversion","retention"]}]','{"rejectRawPrompt":true}','{campaign}-mcp-{intentCategory}','[]','{"region","language"}','{"region","language"}','system','system','system',now()),
('website','Website',1,'published','[{"key":"pageType","required":true}]','{}','{campaign}-web-{name}','[]','{"region","language"}','{"region","language","primaryCta","landingDestination"}','system','system','system',now()),
('partner-marketing','Partner marketing',1,'published','[{"key":"partner","required":true}]','{}','{campaign}-partner-{name}','[]','{"region","language"}','{"region","language","primaryCta"}','system','system','system',now())
ON CONFLICT ("stable_key","version") DO NOTHING;