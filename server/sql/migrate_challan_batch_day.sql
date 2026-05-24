-- Run once: store which delivery day a challan batch was generated for.
ALTER TABLE challan_batch
  ADD COLUMN day VARCHAR(32) NULL AFTER label;

CREATE INDEX idx_challan_batch_day ON challan_batch (day, created_at);
