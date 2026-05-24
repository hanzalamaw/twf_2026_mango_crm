ALTER TABLE roles
  ADD COLUMN operation_special_request_management TINYINT(1) NOT NULL DEFAULT 0 AFTER operation_affluent_management;

UPDATE roles
SET operation_special_request_management = operation_affluent_management
WHERE operation_affluent_management = 1;
