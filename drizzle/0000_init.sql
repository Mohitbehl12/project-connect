CREATE TABLE `app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`meta` text DEFAULT '{}' NOT NULL,
	`ip` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_time` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_pair` ON `blocks` (`blocker_id`,`blocked_id`);--> statement-breakpoint
CREATE INDEX `blocks_blocked` ON `blocks` (`blocked_id`);--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`coupon_id` text NOT NULL,
	`user_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`discount_minor` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupon_redemptions_payment_id_unique` ON `coupon_redemptions` (`payment_id`);--> statement-breakpoint
CREATE INDEX `coupon_red_user` ON `coupon_redemptions` (`coupon_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`currency` text,
	`max_discount_minor` integer,
	`min_purchase_minor` integer,
	`audience` text DEFAULT 'ALL' NOT NULL,
	`countries` text DEFAULT '' NOT NULL,
	`plans` text DEFAULT '' NOT NULL,
	`genders` text DEFAULT '' NOT NULL,
	`usage_limit` integer,
	`per_user_limit` integer DEFAULT 1 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_unique` ON `coupons` (`code`);--> statement-breakpoint
CREATE TABLE `date_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`proposer_id` text NOT NULL,
	`kind` text NOT NULL,
	`place` text NOT NULL,
	`starts_at` integer NOT NULL,
	`status` text DEFAULT 'PROPOSED' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dates_match` ON `date_plans` (`match_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`push_token` text NOT NULL,
	`platform` text NOT NULL,
	`app_version` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_push_token_unique` ON `devices` (`push_token`);--> statement-breakpoint
CREATE INDEX `devices_user` ON `devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `invoice_counters` (
	`fy` text PRIMARY KEY NOT NULL,
	`last` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `legal_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`version_id` text NOT NULL,
	`ip` text,
	`accepted_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `legal_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_accept_pair` ON `legal_acceptances` (`user_id`,`version_id`);--> statement-breakpoint
CREATE TABLE `legal_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`required_at_signup` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_documents_slug_unique` ON `legal_documents` (`slug`);--> statement-breakpoint
CREATE TABLE `legal_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`effective_at` integer,
	`published_at` integer,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `legal_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_doc_version` ON `legal_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE TABLE `likes` (
	`id` text PRIMARY KEY NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`from_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `likes_pair` ON `likes` (`from_id`,`to_id`);--> statement-breakpoint
CREATE INDEX `likes_to` ON `likes` (`to_id`,`kind`);--> statement-breakpoint
CREATE INDEX `likes_from_time` ON `likes` (`from_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `login_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`success` integer NOT NULL,
	`reason` text,
	`ip` text,
	`platform` text,
	`device_name` text,
	`install_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `login_user` ON `login_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_install` ON `login_events` (`install_id`);--> statement-breakpoint
CREATE INDEX `login_ip` ON `login_events` (`ip`,`created_at`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_a_id` text NOT NULL,
	`user_b_id` text NOT NULL,
	`score` integer NOT NULL,
	`reasons` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`unmatched_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_a_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_b_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_pair` ON `matches` (`user_a_id`,`user_b_id`);--> statement-breakpoint
CREATE INDEX `matches_b` ON `matches` (`user_b_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`kind` text DEFAULT 'TEXT' NOT NULL,
	`flags` text DEFAULT '' NOT NULL,
	`read_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_match_time` ON `messages` (`match_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`report_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mod_target` ON `moderation_actions` (`target_user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notif_user` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`headline` text NOT NULL,
	`badge` text,
	`plan_code` text NOT NULL,
	`country` text DEFAULT 'IN' NOT NULL,
	`genders` text DEFAULT '' NOT NULL,
	`audience` text DEFAULT 'ALL' NOT NULL,
	`price_minor` integer,
	`days` integer,
	`discount_pct` integer,
	`once_per_user` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `offers_lookup` ON `offers` (`country`,`plan_code`,`active`);--> statement-breakpoint
CREATE TABLE `otp_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `otp_user` ON `otp_codes` (`user_id`,`channel`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subscription_id` text,
	`provider` text NOT NULL,
	`purpose` text DEFAULT 'INITIAL' NOT NULL,
	`status` text DEFAULT 'CREATED' NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`plan_code` text NOT NULL,
	`offer_id` text,
	`coupon_code` text,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`provider_order_id` text,
	`provider_payment_id` text,
	`method` text,
	`failure_code` text,
	`failure_reason` text,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`disputed` integer DEFAULT false NOT NULL,
	`invoice_no` text,
	`created_at` integer NOT NULL,
	`paid_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_payment_id_unique` ON `payments` (`provider_payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_invoice_no_unique` ON `payments` (`invoice_no`);--> statement-breakpoint
CREATE INDEX `payments_user` ON `payments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_status` ON `payments` (`status`,`paid_at`);--> statement-breakpoint
CREATE TABLE `personality_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`question_key` text NOT NULL,
	`value` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pa_user_q` ON `personality_answers` (`user_id`,`question_key`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`blurhash` text NOT NULL,
	`status` text DEFAULT 'LIVE' NOT NULL,
	`quality` text DEFAULT 'GOOD' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_user_pos` ON `photos` (`user_id`,`position`);--> statement-breakpoint
CREATE TABLE `plan_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`country` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`promo_minor` integer,
	`duration_days` integer NOT NULL,
	`segment` text DEFAULT '*' NOT NULL,
	`provider_plan_id` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_plan_country` ON `plan_prices` (`plan_id`,`country`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`features` text DEFAULT '{}' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_code_unique` ON `plans` (`code`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`interested_in` text DEFAULT '' NOT NULL,
	`age_min` integer DEFAULT 21 NOT NULL,
	`age_max` integer DEFAULT 35 NOT NULL,
	`max_distance_km` integer DEFAULT 50 NOT NULL,
	`intents` text DEFAULT '' NOT NULL,
	`long_distance` integer DEFAULT false NOT NULL,
	`discoverable` integer DEFAULT true NOT NULL,
	`show_online` integer DEFAULT true NOT NULL,
	`read_receipts` integer DEFAULT true NOT NULL,
	`incognito` integer DEFAULT false NOT NULL,
	`show_distance` integer DEFAULT true NOT NULL,
	`likes_from` text DEFAULT 'EVERYONE' NOT NULL,
	`notify_matches` integer DEFAULT true NOT NULL,
	`notify_messages` integer DEFAULT true NOT NULL,
	`notify_likes` integer DEFAULT true NOT NULL,
	`notify_email` integer DEFAULT false NOT NULL,
	`theme` text DEFAULT 'SYSTEM' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`dob` text NOT NULL,
	`gender` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`country` text NOT NULL,
	`city` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`education` text,
	`profession` text,
	`industry` text,
	`height_cm` integer,
	`drinking` text,
	`smoking` text,
	`food` text,
	`exercise` text,
	`pets` text,
	`intent` text NOT NULL,
	`interests` text DEFAULT '' NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`prompts` text DEFAULT '[]' NOT NULL,
	`completeness` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profiles_discovery` ON `profiles` (`country`,`gender`,`dob`);--> statement-breakpoint
CREATE INDEX `profiles_city` ON `profiles` (`city`);--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`referrer_id` text NOT NULL,
	`referee_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`reason` text,
	`reward_days` integer,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`referrer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`referee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referrals_referee_id_unique` ON `referrals` (`referee_id`);--> statement-breakpoint
CREATE INDEX `referrals_referrer` ON `referrals` (`referrer_id`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`reason` text NOT NULL,
	`revoke_access` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`requested_by_id` text NOT NULL,
	`decided_by_id` text,
	`decision_note` text,
	`provider_refund_id` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	`processed_at` integer,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_provider_refund_id_unique` ON `refunds` (`provider_refund_id`);--> statement-breakpoint
CREATE INDEX `refunds_status` ON `refunds` (`status`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text,
	`reported_id` text NOT NULL,
	`match_id` text,
	`message_id` text,
	`category` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`automated` integer DEFAULT false NOT NULL,
	`resolution` text,
	`resolved_by_id` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reported_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reports_queue` ON `reports` (`status`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_reported` ON `reports` (`reported_id`);--> statement-breakpoint
CREATE TABLE `risk_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`weight` integer NOT NULL,
	`detail` text,
	`resolved_at` integer,
	`resolved_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `risk_user` ON `risk_signals` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`family` text NOT NULL,
	`refresh_hash` text NOT NULL,
	`device_name` text,
	`platform` text,
	`ip` text,
	`install_id` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_refresh_hash_unique` ON `sessions` (`refresh_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_family` ON `sessions` (`family`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_code` text NOT NULL,
	`price_id` text,
	`provider` text DEFAULT 'MOCK' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`kind` text DEFAULT 'RECURRING' NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`period_days` integer DEFAULT 30 NOT NULL,
	`offer_id` text,
	`coupon_code` text,
	`intro_ends_at` integer,
	`next_charge_at` integer,
	`next_charge_minor` integer,
	`pending_plan_code` text,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`provider_ref` text,
	`reminder_sent_for` integer,
	`terms_accepted_at` integer,
	`started_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subs_user` ON `subscriptions` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `subs_provider_ref` ON `subscriptions` (`provider_ref`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`password_hash` text NOT NULL,
	`dob` text,
	`role` text DEFAULT 'USER' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`token_version` integer DEFAULT 0 NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`phone_verified` integer DEFAULT false NOT NULL,
	`selfie_status` text DEFAULT 'NONE' NOT NULL,
	`plan_code` text DEFAULT 'FREE' NOT NULL,
	`plan_ends_at` integer,
	`onboarding_step` integer DEFAULT 0 NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`referral_code` text,
	`referred_by_id` text,
	`risk_level` text DEFAULT 'LOW' NOT NULL,
	`totp_secret` text,
	`totp_pending` text,
	`totp_last_step` integer,
	`deleted_at` integer,
	`boost_until` integer,
	`completion_rewarded_at` integer,
	`signup_ip` text,
	`signup_install_id` text,
	`created_at` integer NOT NULL,
	`last_active_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_referral_code_unique` ON `users` (`referral_code`);--> statement-breakpoint
CREATE INDEX `users_status_role` ON `users` (`status`,`role`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	`error` text,
	`received_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_unique` ON `webhook_events` (`provider`,`event_id`);