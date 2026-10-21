CREATE TABLE `boosts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `boosts_user` ON `boosts` (`user_id`,`started_at`);--> statement-breakpoint
ALTER TABLE `preferences` ADD `travel_city` text;--> statement-breakpoint
ALTER TABLE `preferences` ADD `travel_until` integer;