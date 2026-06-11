-- Independent mango pricing per order type (not linked to batches).
-- USE twf_mango_crm;

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
