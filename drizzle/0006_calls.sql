CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`caller_id` text NOT NULL,
	`callee_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'RINGING' NOT NULL,
	`end_reason` text,
	`ended_by_id` text,
	`created_at` integer NOT NULL,
	`answered_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`caller_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`callee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calls_match` ON `calls` (`match_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `calls_callee` ON `calls` (`callee_id`,`state`);