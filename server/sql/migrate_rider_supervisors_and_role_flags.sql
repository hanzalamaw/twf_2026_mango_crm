-- Rider supervisors + role flags
-- Run once on your DB. If a column/constraint already exists, skip that statement.

ALTER TABLE roles
  ADD COLUMN operation_rider_management_supervisor TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE roles
  ADD COLUMN operation_affluent_management TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE rider_supervisors (
  supervisor_id INT NOT NULL AUTO_INCREMENT,
  supervisor_code VARCHAR(20) NOT NULL,
  supervisor_name VARCHAR(200) NOT NULL,
  phone VARCHAR(40) DEFAULT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (supervisor_id),
  UNIQUE KEY uq_rider_supervisors_code (supervisor_code),
  UNIQUE KEY uq_rider_supervisors_user (user_id),
  CONSTRAINT fk_rider_supervisors_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE riders
  ADD COLUMN supervisor_id INT NULL DEFAULT NULL;

ALTER TABLE riders
  ADD CONSTRAINT fk_riders_supervisor FOREIGN KEY (supervisor_id) REFERENCES rider_supervisors (supervisor_id) ON DELETE SET NULL;

-- Preserve previous behavior: affluent was gated with deliveries
UPDATE roles SET operation_affluent_management = 1 WHERE operation_deliveries_management = 1;
