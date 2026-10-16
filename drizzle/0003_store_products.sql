ALTER TABLE `plan_prices` ADD `apple_product_id` text;--> statement-breakpoint
ALTER TABLE `plan_prices` ADD `google_product_id` text;--> statement-breakpoint
-- Default in-app product ids (same rule as src/lib/storeProducts.ts), only where not set yet.
UPDATE `plan_prices` SET
  `apple_product_id` = (SELECT CASE p.code WHEN 'PREMIUM' THEN 'premium' WHEN 'PREMIUM_PLUS' THEN 'plus' WHEN 'VIP' THEN 'vip' END FROM `plans` p WHERE p.id = `plan_prices`.`plan_id`)
    || CASE `segment` WHEN 'gender:MAN' THEN '_men' ELSE '' END || '_' || CAST(MAX(1, ROUND(`duration_days` / 30.4)) AS INTEGER) || 'm'
WHERE `apple_product_id` IS NULL AND `segment` IN ('*', 'gender:MAN')
  AND `plan_id` IN (SELECT id FROM `plans` WHERE code IN ('PREMIUM', 'PREMIUM_PLUS', 'VIP'));
--> statement-breakpoint
UPDATE `plan_prices` SET `google_product_id` = `apple_product_id` WHERE `google_product_id` IS NULL AND `apple_product_id` IS NOT NULL;
