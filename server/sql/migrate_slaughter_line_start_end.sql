-- Slaughter / Line: end timestamps, Exclusive Goat type
-- Run once against your CRM database.

ALTER TABLE slaughter_records
  ADD COLUMN slaughter_end_time DATETIME NULL AFTER slaughter_time;

ALTER TABLE line_records
  ADD COLUMN recorded_end_time DATETIME NULL AFTER recorded_time;

ALTER TABLE slaughter_records
  MODIFY animal_type ENUM(
    'premium_cow',
    'standard_cow',
    'waqf_cow',
    'exclusive_cow',
    'premium_goat',
    'super_goat',
    'exclusive_goat'
  ) NOT NULL;

ALTER TABLE line_records
  MODIFY animal_type ENUM(
    'premium_cow',
    'standard_cow',
    'waqf_cow',
    'exclusive_cow',
    'premium_goat',
    'super_goat',
    'exclusive_goat'
  ) NOT NULL;
