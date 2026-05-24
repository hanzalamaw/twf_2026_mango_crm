-- Split Goat(Hissa) counts on challan into Super vs Premium (run once).
ALTER TABLE challan
  ADD COLUMN total_super_goat_hissa INT NOT NULL DEFAULT 0,
  ADD COLUMN total_premium_goat_hissa INT NOT NULL DEFAULT 0;

-- Existing rows: treat legacy total_goat_hissa as super goat.
UPDATE challan
SET total_super_goat_hissa = COALESCE(total_goat_hissa, 0),
    total_premium_goat_hissa = 0
WHERE COALESCE(total_super_goat_hissa, 0) = 0 AND COALESCE(total_premium_goat_hissa, 0) = 0;
