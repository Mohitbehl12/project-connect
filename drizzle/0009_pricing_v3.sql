-- Pricing v3 (India): men get a 15-day free trial instead of the ₹1 intro offer (rewards.menTrialDays);
-- women and everyone else are free forever (rewards.womenFreeForever), handled in code, so prices stay as they are.
UPDATE `offers` SET `active` = 0 WHERE `name` = 'Welcome ₹1 — men';
