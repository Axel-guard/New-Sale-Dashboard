# AxelGuard Sale Dashboard

A comprehensive sales management dashboard built for team collaboration with real-time data visualization and management capabilities.

## Project Overview

- **Name**: AxelGuard Sale Dashboard
- **Goal**: Provide a centralized platform for managing sales data, tracking employee performance, monitoring payments, and managing customer information
- **Tech Stack**: Hono + TypeScript + Cloudflare Pages + D1 Database + TailwindCSS + Chart.js

## Features Implemented

### ✅ Currently Completed Features

1. **Dashboard Overview**
   - Employee-wise sales cards showing total revenue, number of sales, and balance amounts
   - Interactive pie chart for payment type distribution (Payment Done, Partial Payment, Credit)
   - Complete sales table for current month with detailed information
   - Real-time data updates from D1 database

2. **Dynamic Sidebar Navigation**
   - Hamburger menu toggle (hidden by default, opens on click)
   - 7 navigation options:
     - Dashboard (main overview)
     - Courier Calculation
     - Order Details by Order ID
     - Customer Details
     - Current Month Sale
     - Sale Database
     - Balance Payment

3. **Fixed Top Bar**
   - Always visible header with "AxelGuard Sale Dashboard" title
   - Gradient purple design
   - Hamburger menu icon for sidebar toggle

4. **Add Sale Modal**
   - Popup form in center of screen
   - Fields: Employee name, Customer info, Product details, Quantity, Price, Payment type, Courier details
   - Auto-calculation of total amount
   - Smart payment amount suggestions based on payment type

5. **Additional Pages**
   - **Order Search**: Search sales by Order ID
   - **Customer Details**: View all customer information
   - **Current Month Sales**: Filtered view of current month transactions
   - **Sales Database**: Complete sales history
   - **Balance Payments**: Track pending payments and credit sales

## URLs

- **Local Development**: http://localhost:3000
- **Public URL**: https://3000-id7zgaopnm7accybu066c-b32ec7bb.sandbox.novita.ai
- **API Base**: `/api`

## API Endpoints

### Dashboard
- `GET /api/dashboard/summary` - Get dashboard summary with employee sales, payment types, and monthly totals

### Sales Management
- `GET /api/sales/current-month` - Get all sales for current month
- `GET /api/sales` - Get all sales (limited to 1000 records)
- `GET /api/sales/order/:orderId` - Get sale details by order ID
- `GET /api/sales/balance-payments` - Get all sales with pending balance
- `POST /api/sales` - Create new sale

### Customer Management
- `GET /api/customers` - Get all customers
- `GET /api/customers/search?q={query}` - Search customers by name, phone, or email

## Data Architecture

### Database: Cloudflare D1 (SQLite)

**Sales Table Schema:**
```sql
- id (INTEGER PRIMARY KEY)
- employee_name (TEXT)
- customer_name (TEXT)
- customer_phone (TEXT)
- customer_email (TEXT)
- product_name (TEXT)
- quantity (INTEGER)
- unit_price (REAL)
- total_amount (REAL)
- payment_type (TEXT: payment_done, partial_payment, credit)
- paid_amount (REAL)
- balance_amount (REAL)
- order_id (TEXT UNIQUE)
- courier_details (TEXT)
- sale_date (DATETIME)
- created_at (DATETIME)
```

**Customers Table Schema:**
```sql
- id (INTEGER PRIMARY KEY)
- name (TEXT)
- phone (TEXT)
- email (TEXT)
- address (TEXT)
- created_at (DATETIME)
```

## User Guide

### Adding a New Sale

1. Click the **"Add Sale"** button in the top-right corner of the dashboard
2. Fill in the required fields (marked with *)
3. Select payment type:
   - **Payment Done**: Full payment received (auto-fills paid amount)
   - **Partial Payment**: Enter partial amount paid
   - **Credit**: No payment received (sets paid amount to 0)
4. Add courier details if applicable
5. Click **"Save Sale"** to submit

### Viewing Sales Data

- **Dashboard**: Shows current month summary with employee performance and payment distribution
- **Current Month Sale**: Table view of all sales in current month
- **Sales Database**: Complete history of all sales transactions
- **Balance Payment**: View all orders with pending payments

### Searching Orders

1. Click **"Order Details by ID"** in sidebar
2. Enter the Order ID (e.g., ORD001)
3. Click **"Search"** to view complete order details

### Managing Customers

- Click **"Customer Details"** in sidebar to view all customer information
- Customer data is automatically captured when creating sales

## Development Commands

```bash
# Start development server (local)
npm run dev

# Start development server (sandbox with D1)
npm run dev:sandbox

# Build for production
npm run build

# Deploy to Cloudflare Pages
npm run deploy:prod

# Database commands
npm run db:migrate:local    # Apply migrations to local database
npm run db:migrate:prod     # Apply migrations to production database
npm run db:seed             # Seed database with sample data
npm run db:reset            # Reset local database

# Utility commands
npm run clean-port          # Kill process on port 3000
npm run test                # Test the service
```

## Deployment Status

- **Platform**: Cloudflare Pages with D1 Database
- **Status**: ✅ Active (Development)
- **Local Database**: Initialized with migrations and sample data
- **Production Database**: Pending API key configuration

## Sample Data

The database includes 8 sample sales transactions from 3 employees:
- **John Smith**: 3 sales, ₹110,000 revenue
- **Michael Davis**: 2 sales, ₹45,000 revenue
- **Sarah Williams**: 3 sales, ₹40,000 revenue

Payment distribution:
- Payment Done: 4 transactions (₹75,000)
- Partial Payment: 2 transactions (₹30,000)
- Credit: 2 transactions (₹90,000)

## Features Not Yet Implemented

1. **Courier Calculation** - Cost calculation feature for shipping
2. **Payment Updates** - Update partial payments to full payment
3. **Sale Editing** - Modify existing sale records
4. **Export Functionality** - Export data to CSV/Excel
5. **User Authentication** - Login system for employees
6. **Date Range Filters** - Custom date range selection
7. **Advanced Analytics** - Trend analysis and forecasting
8. **Email Notifications** - Payment reminders and receipts

## Recommended Next Steps

1. **Implement Courier Calculation**
   - Add weight-based pricing
   - Integration with courier APIs
   - Cost estimation tool

2. **Add Payment Update Feature**
   - Allow updating payment status
   - Track payment history
   - Generate payment receipts

3. **User Authentication System**
   - Employee login
   - Role-based access control
   - Activity logging

4. **Export Functionality**
   - Export to CSV/Excel
   - PDF invoice generation
   - Email reports

5. **Deploy to Production**
   - Set up Cloudflare API key
   - Create production D1 database
   - Deploy to Cloudflare Pages

## Technical Details

**Frontend:**
- Pure JavaScript (no framework)
- TailwindCSS via CDN
- Chart.js for data visualization
- Axios for API calls
- Font Awesome icons

**Backend:**
- Hono framework on Cloudflare Workers
- D1 Database (SQLite) for data persistence
- RESTful API architecture
- Server-side rendering for main page

**Database:**
- Cloudflare D1 (globally distributed SQLite)
- Local development with `--local` flag
- Migration-based schema management
- Indexed for performance

## Project Structure

```
webapp/
├── src/
│   └── index.tsx           # Main Hono application with API routes
├── migrations/
│   └── 0001_initial_schema.sql
├── seed.sql                # Sample data
├── ecosystem.config.cjs    # PM2 configuration
├── wrangler.jsonc          # Cloudflare configuration
├── package.json            # Dependencies and scripts
└── README.md              # This file
```

## Last Updated

2025-10-30

---

**Note**: This is a development version. For production deployment, ensure you configure Cloudflare API keys and create a production D1 database instance.
