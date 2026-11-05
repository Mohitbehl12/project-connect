CREATE TABLE `nominees` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`relationship` text NOT NULL,
	`contact` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
