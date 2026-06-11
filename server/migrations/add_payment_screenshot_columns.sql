-- Payment bank transfer screenshot stored in Google Drive.
-- USE twf_mango_crm;

ALTER TABLE `payments`
  ADD COLUMN `screenshot_url` varchar(512) DEFAULT NULL AFTER `order_id`,
  ADD COLUMN `screenshot_file_id` varchar(128) DEFAULT NULL AFTER `screenshot_url`;
