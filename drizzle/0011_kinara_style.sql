CREATE TABLE `style_designs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`spec` text NOT NULL,
	`prompt` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `style_designs_user` ON `style_designs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `style_fabrics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`stock_m` real DEFAULT 0 NOT NULL,
	`reorder_m` real DEFAULT 10 NOT NULL,
	`cost_per_m` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `style_fabric_name_color` ON `style_fabrics` (`name`,`color`);--> statement-breakpoint
CREATE TABLE `style_order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`status` integer NOT NULL,
	`note` text,
	`by_id` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `style_orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `style_events_order` ON `style_order_events` (`order_id`);--> statement-breakpoint
CREATE TABLE `style_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_id` text,
	`profile_name` text DEFAULT '' NOT NULL,
	`spec` text NOT NULL,
	`measurements` text NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`status` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`fit_locked` integer DEFAULT false NOT NULL,
	`payment_status` text DEFAULT 'PENDING' NOT NULL,
	`payment_ref` text,
	`provider_order_id` text,
	`address` text DEFAULT '' NOT NULL,
	`eta` integer,
	`feedback` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `style_orders_user` ON `style_orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `style_orders_status` ON `style_orders` (`status`);--> statement-breakpoint
CREATE INDEX `style_orders_provider` ON `style_orders` (`provider_order_id`);--> statement-breakpoint
CREATE TABLE `style_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`fit` text DEFAULT 'Tailored' NOT NULL,
	`colors` text DEFAULT '' NOT NULL,
	`occasions` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `style_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`rel` text DEFAULT 'Self' NOT NULL,
	`fit` text DEFAULT 'Tailored' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `style_profiles_user` ON `style_profiles` (`user_id`);--> statement-breakpoint
-- Starting fabric stock for the workshop (from Darzi).
INSERT OR IGNORE INTO `style_fabrics` (`id`, `name`, `color`, `stock_m`, `reorder_m`, `cost_per_m`, `updated_at`) VALUES
 (lower(hex(randomblob(16))), 'Cotton poplin', 'White', 120, 30, 180, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Oxford cotton', 'Sky', 64, 20, 260, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Linen', 'Beige', 48, 20, 520, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Linen', 'Sage', 18, 20, 540, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Linen', 'Terracotta', 26, 15, 540, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Silk', 'Ivory', 22, 10, 1450, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Mul cotton', 'Mint', 40, 15, 220, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Chanderi', 'Maroon', 9, 10, 980, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Wool blend', 'Midnight', 30, 12, 1650, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Wool blend', 'Charcoal', 34, 12, 1650, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Organza', 'Dusty Rose', 14, 10, 1100, unixepoch() * 1000),
 (lower(hex(randomblob(16))), 'Mashru silk', 'Rust', 7, 8, 1050, unixepoch() * 1000);
