ALTER TABLE `users` ADD `welcome_gift_at` integer;--> statement-breakpoint
-- Pricing v2 (India, Premium): men ₹250/3 months, ₹500/6 months, ₹1,000/year (₹100/month stays);
-- everyone else ₹500/year (₹50/month stays) after 3 free months. Adds rows only if missing.
INSERT INTO `plan_prices` (`id`, `plan_id`, `country`, `currency`, `amount_minor`, `duration_days`, `segment`, `active`)
SELECT lower(hex(randomblob(16))), p.id, 'IN', 'INR', v.amount, v.days, v.seg, 1
FROM `plans` p, (SELECT 25000 AS amount, 90 AS days, 'gender:MAN' AS seg UNION ALL SELECT 50000, 180, 'gender:MAN' UNION ALL SELECT 100000, 365, 'gender:MAN' UNION ALL SELECT 50000, 365, '*') v
WHERE p.code = 'PREMIUM'
  AND NOT EXISTS (SELECT 1 FROM `plan_prices` x WHERE x.plan_id = p.id AND x.country = 'IN' AND x.segment = v.seg AND x.duration_days = v.days);
--> statement-breakpoint
-- Women and everyone else now get the free months instead of the ₹1 intro.
UPDATE `offers` SET `active` = 0 WHERE `name` = 'Welcome ₹1 — everyone else';
