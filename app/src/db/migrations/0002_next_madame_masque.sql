ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'passed';--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "status" SET DEFAULT 'running';