ALTER TABLE `photos` ADD `dhash` text;--> statement-breakpoint
CREATE INDEX `photos_dhash` ON `photos` (`dhash`);