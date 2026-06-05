# 🥭 TWF Mango CRM
### *Seasonal Mango Sales & Booking Management Suite*

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](#)
[![Status](https://img.shields.io/badge/status-active-success.svg)](#)
[![Security](https://img.shields.io/badge/security-RBAC%20Enabled-red.svg)](#)

---

## 📖 Overview

**TWF Mango CRM** is a focused booking and inventory system for mango season operations. It tracks batch-wise stock, customer orders, payments, and sales performance in one place—replacing the broader livestock modules (Operations, Farm, Procurement) with a streamlined mango workflow.

---

## 🏗️ Core Sub-Systems

The home screen exposes **four modules**:

| Module | Purpose |
| :--- | :--- |
| **Control Management** | Users, roles, permissions, audit logs |
| **Bookings Management** | Batches, orders, dashboard, transactions |
| **Accounting & Finance** | Expenses and financial dashboards |
| **Performance Management** | KPIs and team performance tracking |

---

### 1. 🔐 Control Management

- **Super Admin / Admin access** for system configuration
- **RBAC (Role-Based Access Control)** — Super Admin, Admin, Manager, Co-Manager, Staff
- **Audit logs** for user actions
- **Session security** and user lifecycle management

### 2. 📅 Bookings Management

The primary mango sales module.

#### Dashboard
Six KPI cards:
- Total Orders
- Payment Clearance (%)
- Pending Payments (count)
- Total Sales
- Total Received Amount
- Total Pending Amount

Additional dashboard views:
- **Batch Wise Order Summary** — per-batch inventory vs. orders (received, compensation/gift, rotten, weight loss, ordered, delivered/undelivered pending amounts, unordered stock)
- **Source-Wise Order Summary**
- **Area Wise Orders** (filterable by batch)
- **Sales Overview** chart

#### Batch Management
Managers create and maintain mango batches:
- Batch number, received weight (KG & units), rotten, compensation/gift, weight loss, description, received date
- Add, edit, and delete batches from a dedicated page (`/bookings/batches`)

#### New Order
- **Batch** dropdown populated from Batch Management (latest batch auto-selected)
- **Order types:** Mango - Chaunsa, Mango - Sindhri, Mango - Anwar Ratol
- **Weight:** 10 KG, 5 KG, or Custom
- **Quantity:** 1–5 or Custom
- Customer details, area, source, and description fields

#### Order Management
- Search, filter, edit, invoice, and cancel orders
- Tracks delivery status (`Pending` / `Delivered`) and payment status

#### Transactions
- Payment ledger for booking transactions

**Sidebar order (managers):** Dashboard → New Order → Order Management → Transactions → Batch Management

**Staff role** sees: New Order, Order Management, Transactions only.

### 3. 📊 Accounting & Finance

- Financial dashboard and expense tracking for the mango CRM context
- Consolidated views aligned with booking revenue and expenses

### 4. 📈 Performance Management

- Admin configuration and performance dashboards
- KPI tracking for team members

---

## 🗄️ Database

Fresh installs use **`server/schema_mango.sql`**.

```sql
CREATE DATABASE twf_mango_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE twf_mango_crm;
SOURCE server/schema_mango.sql;
```

**Existing databases** that pre-date batch support can run:

```sql
SOURCE server/migrations/add_batches_table.sql;
```

Key tables:
- `batches` — inventory batches
- `orders` — mango bookings (`order_id`, `customer_id`, `order_type`, `batch`, `weight`, `quantity`, `delivery_status`, amounts, etc.)
- `payments`, `cancelled_orders`, `users`, `roles`, `audit_logs`

Set `DB_NAME=twf_mango_crm` in `server/.env`.

---

## 🛠️ Technical Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19 + Vite |
| **Backend** | Node.js + Express |
| **Database** | MySQL / MariaDB |
| **Auth** | JWT + RBAC |
| **UI** | Responsive layout with collapsible sidebar |

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js** 18+
- **MySQL / MariaDB** (e.g. XAMPP)
- **npm**

### 2. Installation

```bash
# Client
cd client
npm install

# Server
cd ../server
npm install
```

### 3. Environment Setup

Create `server/.env` with at least:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=twf_mango_crm
JWT_SECRET=your-secret-key
PORT=5000
CLIENT_URL=http://localhost:5173
```

Configure SMTP and OAuth variables if using email login or Google sign-in.

### 4. Database Setup

Import `server/schema_mango.sql` into MySQL (see [Database](#-database) above).

### 5. Run the Application

**Backend:**
```bash
cd server
npm run dev
```
API: `http://localhost:5000`

**Frontend:**
```bash
cd client
npm run dev
```
App: `http://localhost:5173`

---

## 📁 Project Structure

```
twf_2026_mango_crm/
├── client/                 # React frontend
│   └── src/pages/          # Dashboard, BatchManagement, NewOrder, OrderManagement, …
├── server/
│   ├── schema_mango.sql    # Full database schema
│   ├── migrations/         # Incremental SQL (e.g. batches table)
│   └── routes/             # API routes (booking, batches, dashboard, …
└── README.md
```

---

<p align="center">
  <b>© 2026 TWF Mango CRM</b><br>
  <i>Streamlining mango season sales & inventory</i>
</p>
