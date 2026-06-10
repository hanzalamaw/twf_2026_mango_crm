-- Mango CRM — Operations Management (Riders + Deliveries/Challans)
-- Run after schema_mango.sql on an existing database:
--   USE twf_mango_crm;
--   SOURCE server/migrations/add_operations_mango.sql;

-- --------------------------------------------------------
-- riders
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
  PRIMARY KEY (`rider_id`),
  KEY `idx_riders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- challan (grouped by batch + address — no challan_batch table)
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

-- --------------------------------------------------------
-- challan_orders (one order → one challan)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `challan_orders` (
  `challan_id` int(11) NOT NULL,
  `order_id` varchar(50) NOT NULL,
  PRIMARY KEY (`order_id`),
  KEY `challan_id` (`challan_id`),
  CONSTRAINT `challan_orders_challan_fk` FOREIGN KEY (`challan_id`) REFERENCES `challan` (`challan_id`) ON DELETE CASCADE,
  CONSTRAINT `challan_orders_order_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- orders.rider_id (skip if column already exists)
-- --------------------------------------------------------
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'rider_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `orders` ADD COLUMN `rider_id` int(11) DEFAULT NULL AFTER `batch`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_rider_id'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `orders` ADD KEY `idx_orders_rider_id` (`rider_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Grant Operations to Admin role (optional — adjust role_id as needed)
UPDATE `roles`
SET
  `operation_management` = 1,
  `operation_rider_management` = 1,
  `operation_deliveries_management` = 1
WHERE `role_id` IN (1, 2);
