DROP TABLE `style_designs`;--> statement-breakpoint
DROP TABLE `style_fabrics`;--> statement-breakpoint
DROP TABLE `style_order_events`;--> statement-breakpoint
DROP TABLE `style_orders`;--> statement-breakpoint
DROP TABLE `style_prefs`;--> statement-breakpoint
DROP TABLE `style_profiles`;--> statement-breakpoint
UPDATE `users` SET `role` = 'USER' WHERE `role` = 'TAILOR';--> statement-breakpoint
DELETE FROM `notifications` WHERE `link` LIKE '/style%';
