CREATE TABLE `ops_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`agent` text NOT NULL,
	`action` text NOT NULL,
	`incident_id` text,
	`proposal_id` text,
	`risk` integer,
	`result` text DEFAULT 'OK' NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `opsa_at` ON `ops_actions` (`at`);--> statement-breakpoint
CREATE TABLE `ops_deploys` (
	`id` text PRIMARY KEY NOT NULL,
	`commit` text NOT NULL,
	`started_at` integer NOT NULL,
	`status` text DEFAULT 'WATCHING' NOT NULL,
	`verdict` text,
	`decided_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opsd_commit` ON `ops_deploys` (`commit`);--> statement-breakpoint
CREATE TABLE `ops_health` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`rss_mb` integer NOT NULL,
	`heap_mb` integer NOT NULL,
	`load1` real NOT NULL,
	`cpus` integer NOT NULL,
	`disk_free_pct` real,
	`db_ms` integer NOT NULL,
	`checks` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `opsh_at` ON `ops_health` (`at`);--> statement-breakpoint
CREATE TABLE `ops_incident_events` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`at` integer NOT NULL,
	`user` text,
	`release` text,
	`context` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `ops_incidents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `opse_inc` ON `ops_incident_events` (`incident_id`,`at`);--> statement-breakpoint
CREATE TABLE `ops_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`fingerprint` text NOT NULL,
	`title` text NOT NULL,
	`service` text NOT NULL,
	`severity` text NOT NULL,
	`risk` integer NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`users_affected` integer DEFAULT 0 NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`sample` text DEFAULT '{}' NOT NULL,
	`diagnosis` text,
	`github_issue` integer,
	`pr_url` text,
	`pr_state` text,
	`fixed_at` integer,
	`notified_at` integer,
	`notified_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opsi_code` ON `ops_incidents` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `opsi_fp` ON `ops_incidents` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `opsi_status` ON `ops_incidents` (`status`,`last_seen`);--> statement-breakpoint
CREATE TABLE `ops_metrics` (
	`bucket` text NOT NULL,
	`route` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`rejected` integer DEFAULT 0 NOT NULL,
	`total_ms` integer DEFAULT 0 NOT NULL,
	`max_ms` integer DEFAULT 0 NOT NULL,
	`hist` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opsm_pk` ON `ops_metrics` (`bucket`,`route`);--> statement-breakpoint
CREATE TABLE `ops_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`signal` text NOT NULL,
	`title` text NOT NULL,
	`problem` text NOT NULL,
	`benefit` text NOT NULL,
	`evidence` text DEFAULT '{}' NOT NULL,
	`changes` text DEFAULT '' NOT NULL,
	`risk` text DEFAULT 'LOW' NOT NULL,
	`complexity` text DEFAULT 'M' NOT NULL,
	`status` text DEFAULT 'PROPOSED' NOT NULL,
	`source` text DEFAULT 'AUTO' NOT NULL,
	`github_issue` integer,
	`pr_url` text,
	`decided_by_id` text,
	`decided_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opsp_code` ON `ops_proposals` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `opsp_signal` ON `ops_proposals` (`signal`);