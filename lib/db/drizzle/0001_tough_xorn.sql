CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "governed_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_key" text NOT NULL,
	"category" text NOT NULL,
	"display_name" text NOT NULL,
	"definition" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_start" date NOT NULL,
	"effective_end" date,
	"taxonomy_version" text NOT NULL,
	"source" text NOT NULL,
	"owner" text NOT NULL,
	"parent_id" uuid,
	"superseded_by_id" uuid,
	"legacy_codes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"measurement_rule" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governed_values_stable_key_unique" UNIQUE("stable_key")
);
--> statement-breakpoint
CREATE TABLE "taxonomy_associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_value_id" uuid NOT NULL,
	"to_value_id" uuid NOT NULL,
	"relationship_type" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"value_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_label" text NOT NULL,
	"reason" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_categories" (
	"key" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"supports_parent" boolean DEFAULT false NOT NULL,
	"supports_measurement_rule" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"status" text DEFAULT 'preview' NOT NULL,
	"candidate_count" integer NOT NULL,
	"conflict_count" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_import_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"conflict_type" text NOT NULL,
	"source_value" text NOT NULL,
	"details" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "taxonomy_review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"proposed_name" text NOT NULL,
	"context" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "taxonomy_user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'reader' NOT NULL,
	"categories" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "governed_values" ADD CONSTRAINT "governed_values_category_taxonomy_categories_key_fk" FOREIGN KEY ("category") REFERENCES "public"."taxonomy_categories"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_associations" ADD CONSTRAINT "taxonomy_associations_from_value_id_governed_values_id_fk" FOREIGN KEY ("from_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_associations" ADD CONSTRAINT "taxonomy_associations_to_value_id_governed_values_id_fk" FOREIGN KEY ("to_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_audit_events" ADD CONSTRAINT "taxonomy_audit_events_value_id_governed_values_id_fk" FOREIGN KEY ("value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_import_conflicts" ADD CONSTRAINT "taxonomy_import_conflicts_import_batch_id_taxonomy_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."taxonomy_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_review_requests" ADD CONSTRAINT "taxonomy_review_requests_category_taxonomy_categories_key_fk" FOREIGN KEY ("category") REFERENCES "public"."taxonomy_categories"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_user_roles" ADD CONSTRAINT "taxonomy_user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "governed_values_category_status_idx" ON "governed_values" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "governed_values_parent_idx" ON "governed_values" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_association_unique_idx" ON "taxonomy_associations" USING btree ("from_value_id","to_value_id","relationship_type");--> statement-breakpoint
CREATE INDEX "taxonomy_audit_value_idx" ON "taxonomy_audit_events" USING btree ("value_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_user_role_user_idx" ON "taxonomy_user_roles" USING btree ("user_id");