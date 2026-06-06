-- Expense categories / sub-categories schema for Accounting & Finance
-- Run on twf_mango_crm: mysql -u root twf_mango_crm < server/migrations/add_expense_categories_schema.sql

-- budget on categories
ALTER TABLE `booking_expense_categories`
  ADD COLUMN IF NOT EXISTS `budget` decimal(12,2) NOT NULL DEFAULT 0.00 AFTER `name`;

-- sub-categories
CREATE TABLE IF NOT EXISTS `booking_expense_sub_categories` (
  `sub_category_id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `budget` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`sub_category_id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `booking_expense_sub_cat_fk` FOREIGN KEY (`category_id`) REFERENCES `booking_expense_categories` (`category_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- category links on expenses
ALTER TABLE `booking_expenses`
  ADD COLUMN IF NOT EXISTS `category_id` int(11) DEFAULT NULL AFTER `description`,
  ADD COLUMN IF NOT EXISTS `sub_category_id` int(11) DEFAULT NULL AFTER `category_id`;

-- export audit log
CREATE TABLE IF NOT EXISTS `booking_expense_export_audit` (
  `audit_id` int(11) NOT NULL AUTO_INCREMENT,
  `record_count` int(11) NOT NULL DEFAULT 0,
  `expense_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`expense_ids`)),
  `exported_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`audit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
