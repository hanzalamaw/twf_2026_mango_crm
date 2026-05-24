-- Slaughter Management (independent tables + Operations permission)
-- Run once against your CRM database.

CREATE TABLE IF NOT EXISTS slaughter_qassai_groups (
  group_id INT AUTO_INCREMENT PRIMARY KEY,
  group_name VARCHAR(255) NOT NULL,
  day TINYINT NOT NULL COMMENT '1=Day 1, 2=Day 2, 3=Day 3',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_slaughter_group_day (day)
);

CREATE TABLE IF NOT EXISTS slaughter_records (
  slaughter_id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  day TINYINT NOT NULL COMMENT '1=Day 1, 2=Day 2, 3=Day 3',
  animal_type ENUM(
    'premium_cow',
    'standard_cow',
    'waqf_cow',
    'exclusive_cow',
    'premium_goat',
    'super_goat'
  ) NOT NULL,
  animal_number VARCHAR(32) NOT NULL,
  slaughter_time DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_slaughter_group FOREIGN KEY (group_id)
    REFERENCES slaughter_qassai_groups (group_id) ON DELETE CASCADE,
  INDEX idx_slaughter_day_type (day, animal_type),
  INDEX idx_slaughter_group (group_id),
  INDEX idx_slaughter_time (slaughter_time)
);

ALTER TABLE roles
  ADD COLUMN operation_slaughter_management TINYINT(1) NOT NULL DEFAULT 0
  AFTER operation_special_request_management;
