-- Add Bank (Others) payment column alongside existing bank splits.
-- USE twf_mango_crm;

ALTER TABLE `payments`
  ADD COLUMN `bank_others` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank_tw_traders`;
