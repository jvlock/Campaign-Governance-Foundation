ALTER TABLE "campaign_activities" ADD CONSTRAINT "campaign_activities_channel_value_id_governed_values_id_fk" FOREIGN KEY ("channel_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_activities" ADD CONSTRAINT "campaign_activity_delivery_range" CHECK ("delivery_end_date" >= "delivery_start_date");
--> statement-breakpoint
ALTER TABLE "campaign_activities" ADD CONSTRAINT "campaign_activity_minor_units" CHECK ("authoritative_cost_minor" ~ '^[0-9]+$');
--> statement-breakpoint
ALTER TABLE "campaign_costs" ADD CONSTRAINT "campaign_cost_minor_units" CHECK ("authoritative_amount_minor" ~ '^[0-9]+$');