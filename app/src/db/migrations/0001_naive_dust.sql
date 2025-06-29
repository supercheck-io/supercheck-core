ALTER TABLE "runs" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "updated_at" timestamp DEFAULT now();