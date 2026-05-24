-- Per-order dispatch → delivery timestamps for rider performance (run once).
-- Populated when a challan bulk status is set to Dispatched or Delivered in operations.
--
-- orders.order_id is VARCHAR(50) in this project — FK types must match exactly.

CREATE TABLE IF NOT EXISTS rider_delivery_timing (
  id INT NOT NULL AUTO_INCREMENT,
  order_id VARCHAR(50) NOT NULL,
  rider_id INT NOT NULL,
  challan_id INT NOT NULL,
  dispatched_at DATETIME NULL DEFAULT NULL,
  delivered_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rider_delivery_timing_order (order_id),
  KEY idx_rider_delivery_timing_rider (rider_id),
  KEY idx_rider_delivery_timing_challan (challan_id),
  CONSTRAINT fk_rider_delivery_timing_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE,
  CONSTRAINT fk_rider_delivery_timing_rider FOREIGN KEY (rider_id) REFERENCES riders (rider_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
