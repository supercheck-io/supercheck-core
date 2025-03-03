CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`organization_id` text,
	`action` text NOT NULL,
	`details` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`service_name` text NOT NULL,
	`config` text NOT NULL,
	`encrypted_api_token` blob,
	`last_used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `job_test_cases` (
	`job_id` text NOT NULL,
	`test_case_id` text NOT NULL,
	`order_position` integer,
	PRIMARY KEY(`job_id`, `test_case_id`),
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
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
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text DEFAULT 'email' NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organization_members` (
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text DEFAULT 'read-only' NOT NULL,
	`invited_by` text,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(`user_id`, `organization_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`metadata` text,
	`billing_plan` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`subscription_expires_at` text,
	`test_quota` integer DEFAULT 100,
	`max_parallel_jobs` integer DEFAULT 5,
	`retention_days` integer DEFAULT 30,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`total_tests` integer NOT NULL,
	`passed_tests` integer NOT NULL,
	`failed_tests` integer NOT NULL,
	`skipped_tests` integer DEFAULT 0,
	`flaky_tests` integer DEFAULT 0,
	`duration` text NOT NULL,
	`browser_metrics` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`playwright_script` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`type` text DEFAULT 'browser' NOT NULL,
	`tags` text DEFAULT '[]',
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`test_case_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`duration` text,
	`started_at` text,
	`completed_at` text,
	`artifact_paths` text,
	`logs` text,
	`error_details` text,
	`video_url` text,
	`screenshot_urls` text DEFAULT '[]',
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`last_login` text
);
