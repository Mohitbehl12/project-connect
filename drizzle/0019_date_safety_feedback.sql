CREATE TABLE `date_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`match_id` text,
	`date_plan_id` text,
	`place` text NOT NULL,
	`starts_at` integer NOT NULL,
	`check_in_at` integer NOT NULL,
	`grace_minutes` integer DEFAULT 30 NOT NULL,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`status` text DEFAULT 'SCHEDULED' NOT NULL,
	`asked_at` integer,
	`safe_at` integer,
	`alerted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`date_plan_id`) REFERENCES `date_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `checkins_due` ON `date_checkins` (`status`,`check_in_at`);--> statement-breakpoint
CREATE INDEX `checkins_user` ON `date_checkins` (`user_id`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`context` text NOT NULL,
	`rating` text NOT NULL,
	`comment` text,
	`platform` text,
	`app_version` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_ctx` ON `feedback` (`context`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_user` ON `feedback` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ops_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`week` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opsr_week` ON `ops_reports` (`week`);--> statement-breakpoint
ALTER TABLE `preferences` ADD `quiet_start` integer;--> statement-breakpoint
ALTER TABLE `preferences` ADD `quiet_end` integer;--> statement-breakpoint
ALTER TABLE `preferences` ADD `activity_push_cap` integer DEFAULT 0 NOT NULL;