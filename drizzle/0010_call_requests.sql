CREATE TABLE `call_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`kind` text DEFAULT 'VIDEO' NOT NULL,
	`state` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer NOT NULL,
	`responded_at` integer,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `callreq_match` ON `call_requests` (`match_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `callreq_to` ON `call_requests` (`to_id`,`state`);--> statement-breakpoint
ALTER TABLE `preferences` ADD `call_requests` text DEFAULT 'MATCHES' NOT NULL;