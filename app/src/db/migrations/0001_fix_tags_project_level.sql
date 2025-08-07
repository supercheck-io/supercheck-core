-- First clear all existing tag data
TRUNCATE TABLE "test_tags" CASCADE;
TRUNCATE TABLE "monitor_tags" CASCADE;
TRUNCATE TABLE "tags" CASCADE;

-- Drop old index
DROP INDEX IF EXISTS "tags_organization_name_idx";

-- Add project_id column
ALTER TABLE "tags" ADD COLUMN "project_id" uuid;

-- Update any remaining rows (shouldn't be any after TRUNCATE)
-- But just in case, we'll set a default project for any orphaned tags
UPDATE "tags" SET "project_id" = (
    SELECT "id" FROM "projects" WHERE "is_default" = true LIMIT 1
) WHERE "project_id" IS NULL;

-- Make the column NOT NULL
ALTER TABLE "tags" ALTER COLUMN "project_id" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "tags" ADD CONSTRAINT "tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;

-- Create unique index for project-scoped tag names
CREATE UNIQUE INDEX "tags_project_name_idx" ON "tags" USING btree ("project_id","name");