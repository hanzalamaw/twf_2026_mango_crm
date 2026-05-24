ALTER TABLE challan
  MODIFY COLUMN delivery_status VARCHAR(64) NOT NULL DEFAULT 'Pending';

ALTER TABLE orders
  MODIFY COLUMN delivery_status VARCHAR(64) NOT NULL DEFAULT 'Pending';
