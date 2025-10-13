ALTER TABLE "status_page_components" DROP CONSTRAINT "status_page_components_monitor_id_monitors_id_fk";
--> statement-breakpoint
ALTER TABLE "status_page_component_monitors" ADD COLUMN "weight" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "status_page_components" ADD COLUMN "aggregation_method" varchar(50) DEFAULT 'worst_case' NOT NULL;--> statement-breakpoint
ALTER TABLE "status_page_components" ADD COLUMN "failure_threshold" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "status_page_components" DROP COLUMN "monitor_id";