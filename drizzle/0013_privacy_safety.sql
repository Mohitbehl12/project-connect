CREATE TABLE `appeals` (
	`id` text PRIMARY KEY NOT NULL,
	`case_no` text NOT NULL,
	`user_id` text,
	`contact_email` text,
	`kind` text NOT NULL,
	`ref_id` text,
	`details` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`decision` text,
	`decided_by_id` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `appeals_status` ON `appeals` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `appeals_user` ON `appeals` (`user_id`);--> statement-breakpoint
CREATE TABLE `automated_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`system` text NOT NULL,
	`ref_id` text,
	`reviewed_by_id` text,
	`review_outcome` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `autodec_user` ON `automated_decisions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_mutes` (
	`user_id` text NOT NULL,
	`match_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_mute_pair` ON `chat_mutes` (`user_id`,`match_id`);--> statement-breakpoint
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`granted` integer NOT NULL,
	`version` text,
	`source` text DEFAULT 'app' NOT NULL,
	`ip` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `consents_user_kind` ON `consents` (`user_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `legal_holds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`kind` text DEFAULT 'SAFETY' NOT NULL,
	`reference` text,
	`created_by_id` text NOT NULL,
	`until` integer,
	`released_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `legal_holds_user` ON `legal_holds` (`user_id`);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `seq` integer;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `prev_hash` text;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `audit_seq` ON `audit_logs` (`seq`);--> statement-breakpoint
ALTER TABLE `legal_versions` ADD `change_summary` text;--> statement-breakpoint
ALTER TABLE `legal_versions` ADD `material` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `legal_versions` ADD `lawyer_reviewed_by` text;--> statement-breakpoint
ALTER TABLE `legal_versions` ADD `lawyer_reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `ended_at` integer;--> statement-breakpoint
ALTER TABLE `preferences` ADD `profile_visibility` text DEFAULT 'EVERYONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `preferences` ADD `photos_visibility` text DEFAULT 'EVERYONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `preferences` ADD `show_city` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `preferences` ADD `marketing` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `case_no` text;--> statement-breakpoint
ALTER TABLE `users` ADD `deactivated_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `staff_unlocked_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `restricted_at` integer;--> statement-breakpoint
UPDATE `reports` SET `case_no` = 'KN-R-' || strftime('%Y', `created_at` / 1000, 'unixepoch') || '-' || upper(substr(`id`, 1, 8)) WHERE `case_no` IS NULL;--> statement-breakpoint
UPDATE `matches` SET `ended_at` = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE `status` = 'UNMATCHED' AND `ended_at` IS NULL;--> statement-breakpoint
UPDATE `profiles` SET `lat` = round(`lat`, 2), `lng` = round(`lng`, 2);
