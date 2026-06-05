-- Run on existing twf_mango_crm database if batches table does not exist yet.
-- USE twf_mango_crm;

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
