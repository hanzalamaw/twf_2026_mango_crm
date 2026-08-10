-- Add Bank (TW Traders) / Bank (Others) to booking_expenses only.
-- Existing `bank` column = Bank (TWF), matching payments.
-- Accounting CRM expenses use booking_expenses (there is no separate accounting_expenses flow).

ALTER TABLE `booking_expenses`
  ADD COLUMN `bank_tw_traders` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank`;

ALTER TABLE `booking_expenses`
  ADD COLUMN `bank_others` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `bank_tw_traders`;
