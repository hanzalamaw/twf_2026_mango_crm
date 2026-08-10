-- Add Bank (TW Traders) / Bank (Others) splits to expense tables
-- (existing `bank` column = Bank (TWF), matching payments)
-- Run each block independently; skip tables that do not exist in your DB.

-- booking_expenses
ALTER TABLE `booking_expenses`
  ADD COLUMN `bank_tw_traders` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank`;
ALTER TABLE `booking_expenses`
  ADD COLUMN `bank_others` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank_tw_traders`;

-- farm_expenses (if present)
-- ALTER TABLE `farm_expenses`
--   ADD COLUMN `bank_tw_traders` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank`;
-- ALTER TABLE `farm_expenses`
--   ADD COLUMN `bank_others` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank_tw_traders`;

-- procurement_expenses (if present)
-- ALTER TABLE `procurement_expenses`
--   ADD COLUMN `bank_tw_traders` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank`;
-- ALTER TABLE `procurement_expenses`
--   ADD COLUMN `bank_others` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank_tw_traders`;

-- accounting_expenses (legacy)
ALTER TABLE `accounting_expenses`
  ADD COLUMN `bank_tw_traders` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank`;
ALTER TABLE `accounting_expenses`
  ADD COLUMN `bank_others` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank_tw_traders`;
