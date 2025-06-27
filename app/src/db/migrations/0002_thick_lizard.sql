ALTER TABLE "jobs" ADD COLUMN "alert_config" jsonb;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "alert_config" jsonb;