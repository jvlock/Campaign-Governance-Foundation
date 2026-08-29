CREATE TABLE "delivery_platform_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_value_id" uuid NOT NULL,
  "platform_key" text NOT NULL,
  "display_name" text NOT NULL,
  "endpoint_url" text NOT NULL,
  "external_id_path" text DEFAULT 'id' NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "delivery_platform_connections_channel_value_id_governed_values_id_fk"
    FOREIGN KEY ("channel_value_id") REFERENCES "public"."governed_values"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_platform_channel_key_unique"
  ON "delivery_platform_connections" USING btree ("channel_value_id","platform_key");
--> statement-breakpoint
CREATE INDEX "delivery_platform_channel_idx"
  ON "delivery_platform_connections" USING btree ("channel_value_id","is_active");
--> statement-breakpoint
ALTER TABLE "activity_executions" ADD COLUMN "sync_state" text DEFAULT 'not_published' NOT NULL;
--> statement-breakpoint
ALTER TABLE "activity_executions" ADD COLUMN "sync_platform_connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "activity_executions" ADD COLUMN "sync_idempotency_key" uuid DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "activity_executions" ADD COLUMN "sync_attempt_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "activity_executions" ADD COLUMN "last_sync_error" text;
--> statement-breakpoint
ALTER TABLE "activity_executions" ADD COLUMN "last_sync_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "activity_executions"
  ADD CONSTRAINT "activity_executions_sync_platform_connection_id_delivery_platform_connections_id_fk"
  FOREIGN KEY ("sync_platform_connection_id") REFERENCES "public"."delivery_platform_connections"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE TABLE "execution_publish_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "execution_key" uuid NOT NULL,
  "platform_connection_id" uuid NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "mode" text NOT NULL,
  "status" text NOT NULL,
  "request_payload" jsonb NOT NULL,
  "response_summary" jsonb,
  "error_message" text,
  "actor_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "execution_publish_attempts_execution_key_activity_executions_execution_key_fk"
    FOREIGN KEY ("execution_key") REFERENCES "public"."activity_executions"("execution_key") ON DELETE restrict,
  CONSTRAINT "execution_publish_attempts_platform_connection_id_delivery_platform_connections_id_fk"
    FOREIGN KEY ("platform_connection_id") REFERENCES "public"."delivery_platform_connections"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX "execution_publish_attempt_execution_idx"
  ON "execution_publish_attempts" USING btree ("execution_key","created_at");