-- Split bank payments into Bank (TWF) and Bank (TW Traders).
-- Existing `bank` column values remain as Bank (TWF).
-- USE twf_mango_crm;

ALTER TABLE `payments`
  ADD COLUMN `bank_tw_traders` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank`;
