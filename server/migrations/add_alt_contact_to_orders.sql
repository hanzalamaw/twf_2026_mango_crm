-- Add alternate contact to mango orders tables.
-- USE twf_mango_crm;

ALTER TABLE `orders`
  ADD COLUMN `alt_contact` varchar(20) DEFAULT NULL AFTER `contact`;

ALTER TABLE `cancelled_orders`
  ADD COLUMN `alt_contact` varchar(20) DEFAULT NULL AFTER `contact`;
