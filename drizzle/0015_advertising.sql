CREATE TABLE `ad_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`advertiser_id` text NOT NULL,
	`name` text NOT NULL,
	`objective` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`placements` text DEFAULT 'DISCOVER' NOT NULL,
	`pricing` text DEFAULT 'CPM' NOT NULL,
	`daily_budget_minor` integer DEFAULT 0 NOT NULL,
	`total_budget_minor` integer DEFAULT 0 NOT NULL,
	`spent_minor` integer DEFAULT 0 NOT NULL,
	`spent_today_minor` integer DEFAULT 0 NOT NULL,
	`spent_day` text,
	`start_at` integer,
	`end_at` integer,
	`targeting` text DEFAULT '{}' NOT NULL,
	`creative` text DEFAULT '{}' NOT NULL,
	`auto_flags` text,
	`review_note` text,
	`public_reason` text,
	`reviewed_by_id` text,
	`reviewed_at` integer,
	`submitted_at` integer,
	`conversion_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `adc_adv` ON `ad_campaigns` (`advertiser_id`);--> statement-breakpoint
CREATE INDEX `adc_status` ON `ad_campaigns` (`status`);--> statement-breakpoint
CREATE TABLE `ad_events` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`kind` text NOT NULL,
	`placement` text,
	`viewer` text,
	`click_id` text,
	`cost_minor` integer DEFAULT 0 NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ade_campaign_day` ON `ad_events` (`campaign_id`,`day`,`kind`);--> statement-breakpoint
CREATE INDEX `ade_viewer` ON `ad_events` (`viewer`,`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `ade_click` ON `ad_events` (`click_id`);--> statement-breakpoint
CREATE TABLE `ad_hidden` (
	`user_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_hidden_pair` ON `ad_hidden` (`user_id`,`campaign_id`);--> statement-breakpoint
CREATE TABLE `ad_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`case_no` text NOT NULL,
	`campaign_id` text NOT NULL,
	`reporter_id` text,
	`reason` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`resolution` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `adr_status` ON `ad_reports` (`status`);--> statement-breakpoint
CREATE TABLE `ad_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`advertiser_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`amount_minor` integer NOT NULL,
	`provider` text,
	`provider_order_id` text,
	`provider_payment_id` text,
	`receipt_no` text,
	`note` text,
	`decided_by_id` text,
	`created_at` integer NOT NULL,
	`paid_at` integer,
	FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `adt_adv` ON `ad_transactions` (`advertiser_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `adt_order` ON `ad_transactions` (`provider_order_id`);--> statement-breakpoint
CREATE TABLE `advertisers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`business_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`category` text NOT NULL,
	`website` text,
	`address` text,
	`gstin` text,
	`verification` text DEFAULT 'UNVERIFIED' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`balance_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`verified_by_id` text,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `advertisers_user_id_unique` ON `advertisers` (`user_id`);--> statement-breakpoint
ALTER TABLE `preferences` ADD `personalised_ads` integer;