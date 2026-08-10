-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Feb 13, 2026 at 03:24 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `twf_cattle_crm`
--

-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `log_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` varchar(50) DEFAULT NULL,
  `old_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_values`)),
  `new_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_values`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `audit_logs`
--

INSERT INTO `audit_logs` (`log_id`, `user_id`, `action`, `entity_type`, `entity_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`) VALUES
(1, 1, 'TERMINATE_SESSION', 'sessions', 'd994316b071ec386c1826edd5d21522b0a34ad534122a37daa', NULL, NULL, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 13:53:28'),
(2, 1, 'UPDATE_ROLE', 'roles', '2', '{\"role_id\":2,\"role_name\":\"Admin\",\"has_prev_logged_in\":0,\"control_management\":1,\"booking_management\":1,\"operation_management\":1,\"farm_management\":1,\"procurement_management\":1,\"accounting_and_finance\":1,\"performance_management\":1}', '{\"role_id\":2,\"role_name\":\"Admin\",\"has_prev_logged_in\":0,\"control_management\":0,\"booking_management\":1,\"operation_management\":1,\"farm_management\":1,\"procurement_management\":1,\"accounting_and_finance\":1,\"performance_management\":1}', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 13:54:38'),
(3, 1, 'TERMINATE_SESSION', 'sessions', '0c7edd74191ff33f82e1f35f2433983793b9eb723956a44e83', NULL, NULL, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 14:12:14'),
(4, 1, 'TERMINATE_SESSION', 'sessions', '1caaa1a3ca6e978516108626a304c8bd35dcf7b5bc88a3332a', NULL, NULL, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 14:16:30'),
(5, 1, 'CREATE_USER', 'users', '2', NULL, '{\"username\":\"user\",\"email\":\"hanzalamaw@gmail.com\",\"role_id\":\"2\",\"status\":\"active\"}', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 14:24:58'),
(6, 1, 'TERMINATE_SESSION', 'sessions', 'bd23e256111ad6292176ee8ac8461436132131a4bfb40f0b12', NULL, NULL, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 14:36:47'),
(7, 1, 'UPDATE_ROLE', 'roles', '2', '{\"role_id\":2,\"role_name\":\"Admin\",\"has_prev_logged_in\":0,\"control_management\":0,\"booking_management\":1,\"operation_management\":1,\"farm_management\":1,\"procurement_management\":1,\"accounting_and_finance\":1,\"performance_management\":1}', '{\"role_id\":2,\"role_name\":\"Admin\",\"has_prev_logged_in\":0,\"control_management\":1,\"booking_management\":1,\"operation_management\":1,\"farm_management\":1,\"procurement_management\":1,\"accounting_and_finance\":1,\"performance_management\":1}', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 14:49:55'),
(8, 1, 'UPDATE_USER', 'users', '2', '{\"user_id\":2,\"username\":\"user\",\"password\":\"$2b$10$MG4Tl.8qgp2/6M4cBZAc4eV2ZrgxRx7LXlX/C3QH41GeLQ75/WdmS\",\"email\":\"hanzalamaw@gmail.com\",\"first_name\":\"User\",\"last_name\":\"Test\",\"phone\":\"0319-2401670\",\"status\":\"active\",\"created_at\":\"2026-02-10T14:24:58.000Z\",\"updated_at\":\"2026-02-10T14:28:01.000Z\",\"role_id\":2,\"last_login_at\":\"2026-02-10T14:28:01.000Z\",\"created_by\":1}', '{\"user_id\":2,\"username\":\"user\",\"password\":\"$2b$10$BuSkHv7POsQlYL88cOrrzuvhKpGWwsuRJiHtOKOQJbVYdGy0WHuNe\",\"email\":\"hanzalamaw@gmail.com\",\"first_name\":\"User\",\"last_name\":\"Test\",\"phone\":\"0319-2401670\",\"status\":\"active\",\"created_at\":\"2026-02-10T14:24:58.000Z\",\"updated_at\":\"2026-02-10T15:07:40.000Z\",\"role_id\":2,\"last_login_at\":\"2026-02-10T14:28:01.000Z\",\"created_by\":1}', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 15:07:40');

-- --------------------------------------------------------

--
-- Table structure for table `booking_expenses`
--

CREATE TABLE `booking_expenses` (
  `expense_id` varchar(50) NOT NULL,
  `bank` decimal(10,2) DEFAULT 0.00,
  `cash` decimal(10,2) DEFAULT 0.00,
  `total` decimal(10,2) DEFAULT 0.00,
  `done_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `description` text DEFAULT NULL,
  `done_by` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `booking_expenses`
--

INSERT INTO `booking_expenses` (`expense_id`, `bank`, `cash`, `total`, `done_at`, `description`, `done_by`, `created_by`) VALUES
('#E-0001-2026', 0.00, 500.00, 500.00, '2026-02-10 13:50:25', 'Fuel for field visit', 'admin', 1),
('#E-0002-2026', 2000.00, 0.00, 2000.00, '2026-02-10 13:50:25', 'Marketing flyers printing', 'admin', 1),
('#E-0003-2026', 0.00, 1200.00, 1200.00, '2026-02-10 13:50:25', 'Refreshments for customers', 'admin', 1),
('#E-0004-2026', 5000.00, 0.00, 5000.00, '2026-02-10 13:50:25', 'Social media ad campaign', 'admin', 1);

-- --------------------------------------------------------
--
-- Table structure for table `farm_expenses`
--

CREATE TABLE `farm_expenses` (
  `expense_id` varchar(50) NOT NULL,
  `bank` decimal(10,2) DEFAULT 0.00,
  `bank_tw_traders` decimal(10,2) NOT NULL DEFAULT 0.00,
  `bank_others` decimal(10,2) NOT NULL DEFAULT 0.00,
  `cash` decimal(10,2) DEFAULT 0.00,
  `total` decimal(10,2) DEFAULT 0.00,
  `done_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `description` text DEFAULT NULL,
  `done_by` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cancelled_orders`
--

CREATE TABLE `cancelled_orders` (
  `id` varchar(50) NOT NULL,
  `customer_id` varchar(50) DEFAULT NULL,
  `contact` varchar(20) DEFAULT NULL,
  `order_type` varchar(50) DEFAULT NULL,
  `booking_name` varchar(100) DEFAULT NULL,
  `shareholder_name` varchar(100) DEFAULT NULL,
  `alt_contact` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `area` varchar(100) DEFAULT NULL,
  `day` varchar(20) DEFAULT NULL,
  `booking_date` date DEFAULT NULL,
  `total_amount` decimal(10,2) DEFAULT NULL,
  `order_source` varchar(50) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `reference` varchar(100) DEFAULT NULL,
  `closed_by` varchar(100) DEFAULT NULL,
  `cancelled_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `cancelled_orders`
--

INSERT INTO `cancelled_orders` (`id`, `customer_id`, `contact`, `order_type`, `booking_name`, `shareholder_name`, `alt_contact`, `address`, `area`, `day`, `booking_date`, `total_amount`, `order_source`, `description`, `reference`, `cancelled_at`) VALUES
('#C-0001-2026', 'C-105', '0312-9998887', 'Qurbani Hissa', 'Cow E', 'Zubair Ali', NULL, NULL, NULL, NULL, NULL, 28000.00, NULL, 'Customer changed mind due to travel', NULL, '2026-02-10 13:50:25'),
('#C-0002-2026', 'C-109', '0333-4445551', 'Full Cow', 'Cow J', 'Kamran Akmal', NULL, NULL, NULL, NULL, NULL, 175000.00, NULL, 'Budget issues', NULL, '2026-02-10 13:50:25');

-- --------------------------------------------------------

--
-- Table structure for table `leads`
--

CREATE TABLE `leads` (
  `lead_id` varchar(50) NOT NULL,
  `customer_id` varchar(50) DEFAULT NULL,
  `contact` varchar(20) DEFAULT NULL,
  `order_type` varchar(50) DEFAULT NULL,
  `booking_name` varchar(100) DEFAULT NULL,
  `shareholder_name` varchar(100) DEFAULT NULL,
  `alt_contact` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `area` varchar(100) DEFAULT NULL,
  `day` varchar(20) DEFAULT NULL,
  `booking_date` date DEFAULT NULL,
  `total_amount` decimal(10,2) DEFAULT NULL,
  `order_source` varchar(50) DEFAULT NULL,
  `closed_by` varchar(100) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `reference` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `leads`
--

INSERT INTO `leads` (`lead_id`, `customer_id`, `contact`, `order_type`, `booking_name`, `shareholder_name`, `alt_contact`, `address`, `area`, `day`, `booking_date`, `total_amount`, `order_source`, `closed_by`, `description`, `reference`, `created_at`) VALUES
('#L-0001-2026', 'C-101', '0300-1234567', 'Qurbani Hissa', 'Cow A', 'John Doe', NULL, '123 Street, Karachi', 'Gulshan', 'Monday', '2026-06-15', 25000.00, 'Facebook', NULL, 'Interested in 2 shares', NULL, '2026-02-10 13:50:25'),
('#L-0002-2026', 'C-102', '0321-7654321', 'Full Cow', 'Cow B', 'Jane Smith', NULL, '456 Road, Lahore', 'DHA', 'Wednesday', '2026-06-16', 180000.00, 'WhatsApp', NULL, 'Wants a heavy weight animal', NULL, '2026-02-10 13:50:25'),
('#L-0003-2026', 'C-105', '0333-9998887', 'Qurbani Hissa', 'Cow F', 'Michael Brown', NULL, '789 Blvd, Islamabad', 'E-11', 'Thursday', '2026-06-17', 28000.00, 'Instagram', NULL, 'Inquiry for Day 2', NULL, '2026-02-10 13:50:25'),
('#L-0004-2026', 'C-106', '0344-5556667', 'Full Cow', 'Cow G', 'Sarah Wilson', NULL, '101 Lane, Karachi', 'Clifton', 'Friday', '2026-06-18', 195000.00, 'Website', NULL, 'Premium quality requested', NULL, '2026-02-10 13:50:25');

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `order_id` varchar(50) NOT NULL,
  `customer_id` varchar(50) DEFAULT NULL,
  `contact` varchar(20) DEFAULT NULL,
  `order_type` varchar(50) DEFAULT NULL,
  `booking_name` varchar(100) DEFAULT NULL,
  `shareholder_name` varchar(100) DEFAULT NULL,
  `cow_number` varchar(50) DEFAULT NULL,
  `hissa_number` varchar(50) DEFAULT NULL,
  `alt_contact` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `area` varchar(100) DEFAULT NULL,
  `day` varchar(20) DEFAULT NULL,
  `booking_date` date DEFAULT NULL,
  `total_amount` decimal(10,2) DEFAULT NULL,
  `received_amount` decimal(10,2) DEFAULT 0.00,
  `pending_amount` decimal(10,2) DEFAULT 0.00,
  `order_source` varchar(50) DEFAULT NULL,
  `reference` varchar(100) DEFAULT NULL,
  `closed_by` varchar(100) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `rider_id` int(11) DEFAULT NULL,
  `slot` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`order_id`, `customer_id`, `contact`, `order_type`, `booking_name`, `shareholder_name`, `cow_number`, `hissa_number`, `alt_contact`, `address`, `area`, `day`, `booking_date`, `total_amount`, `received_amount`, `pending_amount`, `order_source`, `reference`, `description`, `rider_id`, `slot`, `created_at`) VALUES
('#O-0001-2026', 'C-103', '0333-1112223', 'Qurbani Hissa', 'Cow C', 'Ali Khan', 'Cow-50', 'Hissa-3', NULL, '789 Flat, Karachi', 'Nazimabad', 'Day 1', '2026-06-10', 30000.00, 10000.00, 20000.00, 'Referral', NULL, NULL, NULL, NULL, '2026-02-10 13:50:25'),
('#O-0002-2026', 'C-104', '0345-4445556', 'Full Cow', 'Cow D', 'Ahmed Raza', 'Cow-12', 'Full', NULL, '321 Villa, Islamabad', 'F-7', 'Day 2', '2026-06-11', 200000.00, 200000.00, 0.00, 'Website', NULL, NULL, NULL, NULL, '2026-02-10 13:50:25'),
('#O-0003-2026', 'C-107', '0300-4443332', 'Qurbani Hissa', 'Cow H', 'Fatima Zahra', 'Cow-65', 'Hissa-1', NULL, '55 Sector, Karachi', 'North Nazimabad', 'Day 1', '2026-06-10', 32000.00, 32000.00, 0.00, 'Facebook', NULL, NULL, NULL, NULL, '2026-02-10 13:50:25'),
('#O-0004-2026', 'C-108', '0321-1231234', 'Qurbani Hissa', 'Cow I', 'Usman Sheikh', 'Cow-65', 'Hissa-2', NULL, '12 Garden, Lahore', 'Model Town', 'Day 1', '2026-06-10', 32000.00, 15000.00, 17000.00, 'WhatsApp', NULL, NULL, NULL, NULL, '2026-02-10 13:50:25');

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `payment_id` varchar(50) NOT NULL,
  `bank` decimal(10,2) DEFAULT 0.00,
  `cash` decimal(10,2) DEFAULT 0.00,
  `total_received` decimal(10,2) DEFAULT 0.00,
  `date` date DEFAULT NULL,
  `order_id` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
--
-- Table structure for table `procurements`
--

CREATE TABLE `procurements` (
  `procurement_id` varchar(50) NOT NULL,
  `type` varchar(50) NOT NULL,
  `no_of_animals` int(11) NOT NULL DEFAULT 0,
  `price_per_unit` decimal(12,2) DEFAULT NULL,
  `total_price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `price_paid` decimal(12,2) NOT NULL DEFAULT 0.00,
  `price_due` decimal(12,2) NOT NULL DEFAULT 0.00,
  `per_unit_weight` decimal(12,2) DEFAULT NULL,
  `date` date NOT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
--
-- Table structure for table `procurement_payments`
--

CREATE TABLE `procurement_payments` (
  `payment_id` varchar(50) NOT NULL,
  `procurement_id` varchar(50) NOT NULL,
  `bank` decimal(12,2) DEFAULT 0.00,
  `cash` decimal(12,2) DEFAULT 0.00,
  `total_received` decimal(12,2) DEFAULT 0.00,
  `date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
--
-- Table structure for table `procurement_expenses`
--

CREATE TABLE `procurement_expenses` (
  `expense_id` varchar(50) NOT NULL,
  `bank` decimal(12,2) DEFAULT 0.00,
  `bank_tw_traders` decimal(12,2) NOT NULL DEFAULT 0.00,
  `bank_others` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cash` decimal(12,2) DEFAULT 0.00,
  `total` decimal(12,2) DEFAULT 0.00,
  `done_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `description` text DEFAULT NULL,
  `done_by` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payments`
--

INSERT INTO `payments` (`payment_id`, `bank`, `cash`, `total_received`, `date`, `order_id`) VALUES
('#P-0001-2026', 10000.00, 0.00, 10000.00, '2026-02-05', '#O-0001-2026'),
('#P-0002-2026', 150000.00, 50000.00, 200000.00, '2026-02-05', '#O-0002-2026'),
('#P-0003-2026', 32000.00, 0.00, 32000.00, '2026-02-06', '#O-0003-2026'),
('#P-0004-2026', 0.00, 15000.00, 15000.00, '2026-02-06', '#O-0004-2026');

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `role_id` int(11) NOT NULL,
  `role_name` varchar(50) NOT NULL,
  `has_prev_logged_in` tinyint(1) DEFAULT 0,
  `control_management` tinyint(1) DEFAULT 0,
  `booking_management` tinyint(1) DEFAULT 0,
  `operation_management` tinyint(1) DEFAULT 0,
  `farm_management` tinyint(1) DEFAULT 0,
  `procurement_management` tinyint(1) DEFAULT 0,
  `accounting_and_finance` tinyint(1) DEFAULT 0,
  `performance_management` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `roles`
--

INSERT INTO `roles` (`role_id`, `role_name`, `has_prev_logged_in`, `control_management`, `booking_management`, `operation_management`, `farm_management`, `procurement_management`, `accounting_and_finance`, `performance_management`) VALUES
(1, 'Super Admin', 0, 1, 1, 1, 1, 1, 1, 1),
(2, 'Admin', 0, 0, 1, 1, 1, 1, 1, 1),
(3, 'Manager - Bookings', 0, 0, 1, 0, 0, 0, 0, 0),
(4, 'Staff - Bookings', 0, 0, 1, 0, 0, 0, 0, 0),
(5, 'Manager - Farm', 0, 0, 0, 0, 1, 0, 0, 0),
(6, 'Staff - Farm', 0, 0, 0, 0, 1, 0, 0, 0),
(7, 'Manager - Procurement', 0, 0, 0, 0, 0, 1, 0, 0),
(8, 'Staff - Procurement', 0, 0, 0, 0, 0, 1, 0, 0);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `user_id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `email` varchar(100) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `status` enum('active','inactive','suspended') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `role_id` int(11) DEFAULT NULL,
  `last_login_at` timestamp NULL DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`user_id`, `username`, `password`, `email`, `first_name`, `last_name`, `phone`, `status`, `created_at`, `updated_at`, `role_id`, `last_login_at`, `created_by`) VALUES
(1, 'admin', '$2b$10$qTtom2qSm.WolhN7UjKtbuNJc6dw0QRfYgupreCMwGG8jy443czGW', 'admin@twf.com', 'System', 'Administrator', NULL, 'active', '2026-02-10 13:50:25', '2026-02-10 14:16:39', 1, '2026-02-10 14:16:39', 1),
(2, 'user', '$2b$10$BuSkHv7POsQlYL88cOrrzuvhKpGWwsuRJiHtOKOQJbVYdGy0WHuNe', 'hanzalamaw@gmail.com', 'User', 'Test', '0319-2401670', 'active', '2026-02-10 14:24:58', '2026-02-10 15:07:40', 2, '2026-02-10 14:28:01', 1);

-- --------------------------------------------------------

--
-- Table structure for table `user_sessions`
--

CREATE TABLE `user_sessions` (
  `session_id` varchar(255) NOT NULL,
  `user_id` int(11) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `login_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_activity_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `expires_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user_sessions`
--

INSERT INTO `user_sessions` (`session_id`, `user_id`, `ip_address`, `user_agent`, `login_at`, `last_activity_at`, `expires_at`, `is_active`) VALUES
('0535b8dc0d1badb1ebe8cd3839f49751d5f23a840df4a289dc7bc12590f48fc7', 1, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 14:16:39', '2026-02-10 15:07:43', '2026-02-11 14:16:39', 1),
('0c7edd74191ff33f82e1f35f2433983793b9eb723956a44e83e5d64f6ad1c8de', 1, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 13:54:02', '2026-02-10 14:12:14', '2026-02-11 13:54:02', 0),
('1caaa1a3ca6e978516108626a304c8bd35dcf7b5bc88a3332a30b0514c35d78e', 1, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 14:16:24', '2026-02-10 14:16:30', '2026-02-11 14:16:24', 0),
('bd23e256111ad6292176ee8ac8461436132131a4bfb40f0b126b3ca233e3eb3c', 2, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 14:28:01', '2026-02-10 14:36:47', '2026-02-11 14:28:01', 0),
('d994316b071ec386c1826edd5d21522b0a34ad534122a37daacfa17d89b92b89', 1, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36', '2026-02-10 13:50:35', '2026-02-10 13:53:28', '2026-02-11 13:50:35', 0);

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_tokens`
-- (for forgot-password: email link to reset password)
--
DROP TABLE IF EXISTS `password_reset_tokens`;

CREATE TABLE `password_reset_tokens` (
  `token` varchar(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD PRIMARY KEY (`log_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `booking_expenses`
--
ALTER TABLE `booking_expenses`
  ADD PRIMARY KEY (`expense_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `farm_expenses`
--
ALTER TABLE `farm_expenses`
  ADD PRIMARY KEY (`expense_id`);

--
-- Indexes for table `cancelled_orders`
--
ALTER TABLE `cancelled_orders`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `leads`
--
ALTER TABLE `leads`
  ADD PRIMARY KEY (`lead_id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`order_id`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`payment_id`),
  ADD KEY `order_id` (`order_id`);

--
-- Indexes for table `procurements`
--
ALTER TABLE `procurements`
  ADD PRIMARY KEY (`procurement_id`),
  ADD KEY `idx_procurements_date` (`date`),
  ADD KEY `idx_procurements_type` (`type`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `procurement_payments`
--
ALTER TABLE `procurement_payments`
  ADD PRIMARY KEY (`payment_id`),
  ADD KEY `idx_procurement_payments_procurement_id` (`procurement_id`);

--
-- Indexes for table `procurement_expenses`
--
ALTER TABLE `procurement_expenses`
  ADD PRIMARY KEY (`expense_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`role_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `role_id` (`role_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `user_sessions`
--
ALTER TABLE `user_sessions`
  ADD PRIMARY KEY (`session_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`token`),
  ADD KEY `user_id` (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `audit_logs`
--
ALTER TABLE `audit_logs`
  MODIFY `log_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `roles`
--
ALTER TABLE `roles`
  MODIFY `role_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `booking_expenses`
--
ALTER TABLE `booking_expenses`
  ADD CONSTRAINT `booking_expenses_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`);

--
-- Constraints for table `procurements`
--
ALTER TABLE `procurements`
  ADD CONSTRAINT `procurements_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `procurement_payments`
--
ALTER TABLE `procurement_payments`
  ADD CONSTRAINT `procurement_payments_ibfk_1` FOREIGN KEY (`procurement_id`) REFERENCES `procurements` (`procurement_id`) ON DELETE CASCADE;

--
-- Constraints for table `procurement_expenses`
--
ALTER TABLE `procurement_expenses`
  ADD CONSTRAINT `procurement_expenses_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`),
  ADD CONSTRAINT `users_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `user_sessions`
--
ALTER TABLE `user_sessions`
  ADD CONSTRAINT `user_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `password_reset_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
