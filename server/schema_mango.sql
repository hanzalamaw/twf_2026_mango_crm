-- TWF Mango CRM — fresh database schema
-- Run: CREATE DATABASE twf_mango_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
-- Then: USE twf_mango_crm; SOURCE schema_mango.sql;

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- --------------------------------------------------------
-- audit_logs
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `log_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` varchar(50) DEFAULT NULL,
  `old_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_values`)),
  `new_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_values`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`log_id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- roles (Control Management — keep all permission columns for compatibility)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `role_id` int(11) NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) NOT NULL,
  `has_prev_logged_in` tinyint(1) DEFAULT 0,
  `control_management` tinyint(1) DEFAULT 0,
  `booking_management` tinyint(1) DEFAULT 0,
  `operation_management` tinyint(1) DEFAULT 0,
  `operation_general_dashboard` tinyint(1) DEFAULT 0,
  `operation_customer_support` tinyint(1) DEFAULT 0,
  `operation_rider_management` tinyint(1) DEFAULT 0,
  `operation_rider_management_supervisor` tinyint(1) DEFAULT 0,
  `operation_deliveries_management` tinyint(1) DEFAULT 0,
  `operation_challan_management` tinyint(1) DEFAULT 0,
  `operation_affluent_management` tinyint(1) DEFAULT 0,
  `operation_special_request_management` tinyint(1) DEFAULT 0,
  `operation_slaughter_management` tinyint(1) DEFAULT 0,
  `operation_line_management` tinyint(1) DEFAULT 0,
  `farm_management` tinyint(1) DEFAULT 0,
  `procurement_management` tinyint(1) DEFAULT 0,
  `accounting_and_finance` tinyint(1) DEFAULT 0,
  `performance_management` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `roles` (`role_id`, `role_name`, `control_management`, `booking_management`, `operation_management`, `operation_rider_management`, `operation_deliveries_management`, `accounting_and_finance`, `performance_management`) VALUES
(1, 'Super Admin', 1, 1, 1, 1, 1, 1, 1),
(2, 'Admin', 0, 1, 1, 1, 1, 1, 1),
(3, 'Manager - Bookings', 0, 1, 0, 0, 0, 0, 0),
(4, 'Staff - Bookings', 0, 1, 0, 0, 0, 0, 0),
(5, 'Co-Manager - Bookings', 0, 1, 0, 0, 0, 0, 0);

-- --------------------------------------------------------
-- users
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `user_id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `email` varchar(100) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `status` enum('active','inactive','suspended') DEFAULT 'active',
  `terms_accepted_at` timestamp NULL DEFAULT NULL,
  `has_prev_logged_in` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `role_id` int(11) DEFAULT NULL,
  `last_login_at` timestamp NULL DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `role_id` (`role_id`),
  KEY `created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Default admin — password: admin123
INSERT INTO `users` (`user_id`, `username`, `password`, `email`, `first_name`, `last_name`, `status`, `role_id`, `created_by`) VALUES
(1, 'admin', '$2b$10$qTtom2qSm.WolhN7UjKtbuNJc6dw0QRfYgupreCMwGG8jy443czGW', 'admin@twf.com', 'System', 'Administrator', 'active', 1, 1);

-- --------------------------------------------------------
-- user_sessions
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_sessions` (
  `session_id` varchar(255) NOT NULL,
  `user_id` int(11) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `login_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_activity_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `expires_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `refresh_token` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`session_id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- password_reset_tokens
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `token` varchar(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`token`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- batches (inventory / batch management)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `batches` (
  `batch_id` int(11) NOT NULL AUTO_INCREMENT,
  `batch_number` varchar(20) NOT NULL,
  `received_in_kgs` decimal(10,2) DEFAULT 0.00,
  `received_in_units` int(11) DEFAULT 0,
  `rotten` decimal(10,2) DEFAULT 0.00,
  `compensation_or_gift` decimal(10,2) DEFAULT 0.00,
  `weight_loss` decimal(10,2) DEFAULT 0.00,
  `description` text DEFAULT NULL,
  `received_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`batch_id`),
  UNIQUE KEY `batch_number` (`batch_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- order_type_prices (mango pricing — independent of batches)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_type_prices` (
  `price_id` int(11) NOT NULL AUTO_INCREMENT,
  `order_type` varchar(50) NOT NULL,
  `price_5kg` decimal(10,2) NOT NULL DEFAULT 0.00,
  `price_10kg` decimal(10,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`price_id`),
  UNIQUE KEY `order_type` (`order_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `order_type_prices` (`order_type`, `price_5kg`, `price_10kg`) VALUES
  ('Mango - Chaunsa', 0.00, 0.00),
  ('Mango - Sindhri', 0.00, 0.00),
  ('Mango - Anwar Ratol', 0.00, 0.00);

-- --------------------------------------------------------
-- orders (Mango booking)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `order_id` varchar(50) NOT NULL,
  `customer_id` varchar(50) DEFAULT NULL,
  `contact` varchar(20) DEFAULT NULL,
  `alt_contact` varchar(20) DEFAULT NULL,
  `order_type` varchar(50) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `area` varchar(100) DEFAULT NULL,
  `weight` decimal(10,2) DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `booking_date` date DEFAULT NULL,
  `total_amount` decimal(10,2) DEFAULT NULL,
  `received_amount` decimal(10,2) DEFAULT 0.00,
  `pending_amount` decimal(10,2) DEFAULT 0.00,
  `source` varchar(50) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `delivery_status` varchar(50) DEFAULT 'Pending',
  `batch` varchar(50) DEFAULT NULL,
  `rider_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`order_id`),
  KEY `idx_orders_customer` (`customer_id`),
  KEY `idx_orders_contact` (`contact`),
  KEY `idx_orders_batch` (`batch`),
  KEY `idx_orders_rider_id` (`rider_id`),
  KEY `idx_orders_booking_date` (`booking_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- riders (Operations)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `riders` (
  `rider_id` int(11) NOT NULL AUTO_INCREMENT,
  `rider_name` varchar(100) NOT NULL,
  `contact` varchar(20) DEFAULT NULL,
  `vehicle` varchar(50) DEFAULT NULL,
  `cnic` varchar(20) DEFAULT NULL,
  `number_plate` varchar(20) DEFAULT NULL,
  `amount_per_delivery` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_paid` decimal(10,2) NOT NULL DEFAULT 0.00,
  `availability` varchar(50) NOT NULL DEFAULT 'Available',
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`rider_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- challan (batch + address grouping)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `challan` (
  `challan_id` int(11) NOT NULL AUTO_INCREMENT,
  `batch` varchar(50) NOT NULL,
  `qr_token` varchar(64) NOT NULL,
  `address` text DEFAULT NULL,
  `address_norm` varchar(500) DEFAULT NULL,
  `area` varchar(100) DEFAULT NULL,
  `names` text DEFAULT NULL,
  `description` text DEFAULT NULL,
  `total_quantity` int(11) NOT NULL DEFAULT 0,
  `total_weight` decimal(10,2) NOT NULL DEFAULT 0.00,
  `challan_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`challan_id`),
  UNIQUE KEY `qr_token` (`qr_token`),
  KEY `idx_challan_batch` (`batch`),
  KEY `idx_challan_batch_addr` (`batch`, `address_norm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `challan_orders` (
  `challan_id` int(11) NOT NULL,
  `order_id` varchar(50) NOT NULL,
  PRIMARY KEY (`order_id`),
  KEY `challan_id` (`challan_id`),
  CONSTRAINT `challan_orders_challan_fk` FOREIGN KEY (`challan_id`) REFERENCES `challan` (`challan_id`) ON DELETE CASCADE,
  CONSTRAINT `challan_orders_order_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- cancelled_orders
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cancelled_orders` (
  `id` varchar(50) NOT NULL,
  `customer_id` varchar(50) DEFAULT NULL,
  `contact` varchar(20) DEFAULT NULL,
  `alt_contact` varchar(20) DEFAULT NULL,
  `order_type` varchar(50) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `area` varchar(100) DEFAULT NULL,
  `weight` decimal(10,2) DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `booking_date` date DEFAULT NULL,
  `total_amount` decimal(10,2) DEFAULT NULL,
  `source` varchar(50) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `batch` varchar(50) DEFAULT NULL,
  `cancelled_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- payments
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `payment_id` varchar(50) NOT NULL,
  `bank` decimal(10,2) DEFAULT 0.00,
  `bank_tw_traders` decimal(10,2) NOT NULL DEFAULT 0.00,
  `bank_others` decimal(10,2) NOT NULL DEFAULT 0.00,
  `cash` decimal(10,2) DEFAULT 0.00,
  `total_received` decimal(10,2) DEFAULT 0.00,
  `date` date DEFAULT NULL,
  `order_id` varchar(50) DEFAULT NULL,
  `screenshot_url` varchar(512) DEFAULT NULL,
  `screenshot_file_id` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`payment_id`),
  KEY `order_id` (`order_id`),
  CONSTRAINT `payments_order_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- booking_expenses
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `booking_expenses` (
  `expense_id` varchar(50) NOT NULL,
  `bank` decimal(10,2) DEFAULT 0.00,
  `bank_tw_traders` decimal(10,2) NOT NULL DEFAULT 0.00,
  `bank_others` decimal(10,2) NOT NULL DEFAULT 0.00,
  `cash` decimal(10,2) DEFAULT 0.00,
  `total` decimal(10,2) DEFAULT 0.00,
  `done_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `description` text DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL,
  `sub_category_id` int(11) DEFAULT NULL,
  `done_by` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  PRIMARY KEY (`expense_id`),
  KEY `created_by` (`created_by`),
  KEY `category_id` (`category_id`),
  KEY `sub_category_id` (`sub_category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- booking_expense_categories (Accounting)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `booking_expense_categories` (
  `category_id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `budget` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- booking_expense_sub_categories (Accounting)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `booking_expense_sub_categories` (
  `sub_category_id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `budget` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`sub_category_id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `booking_expense_sub_cat_fk` FOREIGN KEY (`category_id`) REFERENCES `booking_expense_categories` (`category_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- booking_expense_export_audit
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `booking_expense_export_audit` (
  `audit_id` int(11) NOT NULL AUTO_INCREMENT,
  `record_count` int(11) NOT NULL DEFAULT 0,
  `expense_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`expense_ids`)),
  `exported_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`audit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- accounting_expenses
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `accounting_expenses` (
  `expense_id` varchar(50) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `bank` decimal(10,2) DEFAULT 0.00,
  `bank_tw_traders` decimal(10,2) NOT NULL DEFAULT 0.00,
  `bank_others` decimal(10,2) NOT NULL DEFAULT 0.00,
  `cash` decimal(10,2) DEFAULT 0.00,
  `total` decimal(10,2) DEFAULT 0.00,
  `done_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `description` text DEFAULT NULL,
  `done_by` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  PRIMARY KEY (`expense_id`),
  KEY `category_id` (`category_id`),
  KEY `created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- performance_targets
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `performance_targets` (
  `target_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `year` int(11) NOT NULL,
  `month` int(11) NOT NULL,
  `target_value` decimal(12,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`target_id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- pms_daily_report
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pms_daily_report` (
  `report_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `report_date` date NOT NULL,
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`data`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`report_id`),
  KEY `user_id` (`user_id`),
  KEY `report_date` (`report_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Foreign keys
-- --------------------------------------------------------
ALTER TABLE `audit_logs`
  ADD CONSTRAINT `audit_logs_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `users`
  ADD CONSTRAINT `users_role_fk` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`),
  ADD CONSTRAINT `users_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`);

ALTER TABLE `user_sessions`
  ADD CONSTRAINT `sessions_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `reset_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `booking_expenses`
  ADD CONSTRAINT `booking_expenses_user_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`);

COMMIT;
