CREATE TABLE `grievances` (
	`id` text PRIMARY KEY NOT NULL,
	`ref_no` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`category` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'ACKNOWLEDGED' NOT NULL,
	`ack_due_at` integer NOT NULL,
	`resolve_due_at` integer NOT NULL,
	`acknowledged_at` integer,
	`resolved_at` integer,
	`resolution` text,
	`handled_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grievances_ref_no_unique` ON `grievances` (`ref_no`);--> statement-breakpoint
CREATE INDEX `grievances_status` ON `grievances` (`status`,`resolve_due_at`);