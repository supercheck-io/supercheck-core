ALTER TABLE `jobs` DROP COLUMN `config`;--> statement-breakpoint
ALTER TABLE `jobs` DROP COLUMN `retry_count`;--> statement-breakpoint
ALTER TABLE `jobs` DROP COLUMN `timeout_seconds`;--> statement-breakpoint
ALTER TABLE `test_runs` DROP COLUMN `video_url`;--> statement-breakpoint
ALTER TABLE `test_runs` DROP COLUMN `screenshot_urls`;