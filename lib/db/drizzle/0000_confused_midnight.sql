CREATE TYPE "public"."taxonomy_status" AS ENUM('draft', 'active', 'retired', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_type" AS ENUM('segment', 'persona', 'product', 'region', 'channel');--> statement-breakpoint
CREATE TYPE "public"."foundation_activity_kind" AS ENUM('decision', 'evidence', 'assessment');--> statement-breakpoint
CREATE TABLE "taxonomy_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "taxonomy_type" NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"status" "taxonomy_status" DEFAULT 'draft' NOT NULL,
	"source" text NOT NULL,
	"taxonomy_version" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "foundation_activity_kind" NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foundation_activity_title_unique" UNIQUE("title")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_values_type_code_version_idx" ON "taxonomy_values" USING btree ("type","code","taxonomy_version");