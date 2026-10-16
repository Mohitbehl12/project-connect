CREATE TABLE `verification_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`pose` text NOT NULL,
	`state` text DEFAULT 'CHALLENGE' NOT NULL,
	`storage_key` text,
	`face_count` integer,
	`best_distance` real,
	`profile_faces` integer,
	`note` text,
	`expires_at` integer NOT NULL,
	`submitted_at` integer,
	`decided_at` integer,
	`decided_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `verif_user` ON `verification_attempts` (`user_id`,`state`);