CREATE TABLE `message_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text DEFAULT '❤️' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reaction_once` ON `message_reactions` (`message_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `messages` ADD `media_key` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `media_meta` text;