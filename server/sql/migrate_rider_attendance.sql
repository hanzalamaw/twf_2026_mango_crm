-- Rider attendance (Day 1–3 check-in with optional Google Drive photo). Run once on twf_cattle_crm.

CREATE TABLE IF NOT EXISTS rider_attendance (
  id INT NOT NULL AUTO_INCREMENT,
  rider_id INT NOT NULL,
  day_label ENUM('Day 1', 'Day 2', 'Day 3') NOT NULL,
  check_in_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  photo_url VARCHAR(500) DEFAULT NULL,
  photo_drive_file_id VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY unique_rider_day (rider_id, day_label),
  KEY idx_rider_attendance_rider (rider_id),
  CONSTRAINT fk_rider_attendance_rider FOREIGN KEY (rider_id) REFERENCES riders (rider_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
