CREATE TABLE `job_tests` (
	`job_id` text NOT NULL,
	`test_case_id` text NOT NULL,
	`order_position` integer,
	PRIMARY KEY(`job_id`, `test_case_id`),
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_case_id`) REFERENCES `tests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cron_schedule` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`config` text,
	`retry_count` integer DEFAULT 0,
	`timeout_seconds` integer DEFAULT 1800,
	`last_run_at` text,
	`next_run_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`duration` text,
	`started_at` text,
	`completed_at` text,
	`artifact_paths` text,
	`logs` text,
	`error_details` text,
	`video_url` text,
	`screenshot_urls` text DEFAULT '[]',
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tests` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`script` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`type` text DEFAULT 'browser' NOT NULL,
	`tags` text DEFAULT '[]',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
