CREATE TABLE IF NOT EXISTS "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"target" varchar(255) NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"monitor_id" uuid,
	"job_id" uuid,
	"provider" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"monitor_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"notification_providers" jsonb,
	"alert_on_failure" boolean DEFAULT true NOT NULL,
	"alert_on_recovery" boolean DEFAULT true,
	"alert_on_ssl_expiration" boolean DEFAULT false,
	"alert_on_success" boolean DEFAULT false,
	"alert_on_timeout" boolean DEFAULT false,
	"failure_threshold" integer DEFAULT 1 NOT NULL,
	"recovery_threshold" integer DEFAULT 1 NOT NULL,
	"custom_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "apikey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"refill_interval" text,
	"refill_amount" text,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" text DEFAULT '60',
	"rate_limit_max" text DEFAULT '100',
	"request_count" text,
	"remaining" text,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"action" varchar(255) NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"service_name" varchar(255) NOT NULL,
	"config" jsonb NOT NULL,
	"encrypted_api_token" "bytea",
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"team_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_notification_settings" (
	"job_id" uuid NOT NULL,
	"notification_provider_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "job_notification_settings_job_id_notification_provider_id_pk" PRIMARY KEY("job_id","notification_provider_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_tests" (
	"job_id" uuid NOT NULL,
	"test_case_id" uuid NOT NULL,
	"order_position" integer,
	CONSTRAINT "job_test_cases_pk" PRIMARY KEY("job_id","test_case_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"created_by_user_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"cron_schedule" varchar(100),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"alert_config" jsonb,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"scheduled_job_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"created_by_user_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"timezone" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"team_id" uuid,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_maintenance_windows" (
	"maintenance_window_id" uuid NOT NULL,
	"monitor_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "monitor_maintenance_windows_maintenance_window_id_monitor_id_pk" PRIMARY KEY("maintenance_window_id","monitor_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_notification_settings" (
	"monitor_id" uuid NOT NULL,
	"notification_provider_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "monitor_notification_settings_pk" PRIMARY KEY("monitor_id","notification_provider_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(50) NOT NULL,
	"response_time_ms" integer,
	"details" jsonb,
	"is_up" boolean NOT NULL,
	"is_status_change" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_tags" (
	"monitor_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"assigned_at" timestamp DEFAULT now(),
	CONSTRAINT "monitor_tags_monitor_id_tag_id_pk" PRIMARY KEY("monitor_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"created_by_user_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" varchar(50) NOT NULL,
	"target" varchar(2048) NOT NULL,
	"frequency_minutes" integer DEFAULT 5 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"config" jsonb,
	"alert_config" jsonb,
	"last_check_at" timestamp,
	"last_status_change_at" timestamp,
	"muted_until" timestamp,
	"scheduled_job_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"created_by_user_id" uuid,
	"name" varchar(255) DEFAULT 'Default Provider' NOT NULL,
	"type" varchar(50) NOT NULL,
	"config" jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) DEFAULT 'email' NOT NULL,
	"content" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"created_by_user_id" uuid,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"report_path" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'passed' NOT NULL,
	"s3_url" varchar(1024),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'running' NOT NULL,
	"duration" varchar(100),
	"started_at" timestamp,
	"completed_at" timestamp,
	"artifact_paths" jsonb,
	"logs" text,
	"error_details" text,
	"trigger" varchar(50) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"active_organization_id" uuid,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"created_by_user_id" uuid,
	"name" varchar(100) NOT NULL,
	"color" varchar(50),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "test_tags" (
	"test_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"assigned_at" timestamp DEFAULT now(),
	CONSTRAINT "test_tags_test_id_tag_id_pk" PRIMARY KEY("test_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"created_by_user_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text,
	"script" text DEFAULT '' NOT NULL,
	"priority" varchar(50) DEFAULT 'medium' NOT NULL,
	"type" varchar(50) DEFAULT 'browser' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_entity_type_id_idx" ON "reports" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tags_organization_name_idx" ON "tags" USING btree ("organization_id","name");