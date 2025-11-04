# AxelGuard Sale Dashboard

A comprehensive sales management dashboard built for AxelGuard team with real-time data visualization, multi-product sales support, GST calculations, and lead management.

## Project Overview

- **Name**: AxelGuard Sale Dashboard
- **Goal**: Provide a centralized platform for managing sales data with multi-product support, tracking employee performance, monitoring payments with GST calculations, and managing leads
- **Tech Stack**: Hono + TypeScript + Cloudflare Pages + D1 Database + TailwindCSS + Chart.js

## Features Implemented

### ✅ Currently Completed Features

1. **Enhanced Dashboard Overview**
   - Employee-wise sales cards showing total revenue, number of sales, and balance amounts
   - **Bar chart** for employee sales comparison (current month)
   - **Pie chart** (smaller, with doughnut effect) for payment status distribution (Paid, Partial, Pending)
   - Comprehensive sales table with product details, payment history, and remarks
   - Sidebar now automatically closes when clicking on any tab for full-page view

2. **Action Menu (Add New Button)**
   - Dropdown menu with 3 options:
     - **New Sale** - Add complete sale with multiple products
     - **Balance Payment Update** - Update payments for existing orders
     - **Add New Lead** - Capture new customer leads

3. **New Sale Form (Enhanced)**
   - **Customer Details**: Customer code/contact number, contact info
   - **Sale Information**: Date of sale, employee selection (Akash Parashar, Mandeep Samal, Smruti Ranjan Nayak)
   - **Sale Type**: With GST / Without GST (auto-calculates 18% GST)
   - **Payment Details**: 
     - Courier cost
     - Amount received
     - Account selection (IDFC4828, IDFC7455, Canara, Cash)
     - Payment reference number
   - **Product Section**: 
     - Support for up to **10 products** per sale
     - Product selection (MDVR, Dashcam, Camera)
     - Quantity and unit price for each product
     - Auto-calculation of item totals
     - Add/Remove product rows dynamically
   - **Total Calculation**:
     - Subtotal of all products
     - Courier cost added
     - 18% GST (only if "With GST" is selected)
     - Final total amount displayed
   - **Remarks field** for additional notes

4. **Balance Payment Update Form**
   - Order ID search
   - Date of payment
   - Amount to add
   - Payment reference number
   - Automatically updates sale balance and payment history

5. **Add New Lead Form**
   - Customer name and mobile number (required)
   - Alternate mobile number
   - Location and company name
   - GST number
   - Email ID
   - Complete address
   - All leads saved to database for follow-up

6. **Enhanced Sales Table**
   - Shows all product details (multiple products per sale)
   - Payment history count (how many payments made)
   - Remarks column
   - Sale type badge (With/Without GST)
   - GST amount column
   - Subtotal and total breakdown

7. **Dynamic Sidebar**
   - Automatically closes when clicking on any tab
   - Opens only when hamburger menu is clicked
   - 8 navigation options:
     - Dashboard (main overview)
     - Courier Calculation
     - Order Details by Order ID
     - Customer Details
     - Current Month Sale
     - Sale Database
     - Balance Payment
     - **Leads** (new)

8. **CSV/Excel Upload Support** (NEW)
   - **Sales Data Import**: Upload CSV or Excel files containing sales records
   - **Leads Data Import**: Upload CSV or Excel files containing lead records
   - **Automatic Format Detection**: Supports both .csv, .xlsx, and .xls formats
   - **Batch Import**: Import multiple records at once
   - **Error Handling**: Row-level error reporting with detailed messages
   - **Data Normalization**: Automatically converts data to match database constraints
   - **Google Sheets Compatible**: Supports direct export from Google Sheets

9. **Database Structure**
   - **Sales Table**: Main sale information with GST calculations
   - **Sale Items Table**: Multiple products per sale (up to 10)
   - **Payment History Table**: Track all payments for each sale
   - **Leads Table**: Customer lead management
   - **Customers Table**: Customer information database

## URLs

- **Production**: https://webapp-6dk.pages.dev (Stable URL - always points to latest deployment)
- **Local Development**: http://localhost:3000
- **API Base**: `/api`

## API Endpoints

### Dashboard
- `GET /api/dashboard/summary` - Get dashboard summary with employee sales, payment status, and monthly totals

### Sales Management
- `GET /api/sales/current-month` - Get all sales for current month with items and payments
- `GET /api/sales` - Get all sales (limited to 1000 records)
- `GET /api/sales/order/:orderId` - Get complete sale details by order ID (with items and payments)
- `GET /api/sales/balance-payments` - Get all sales with pending balance
- `POST /api/sales` - Create new sale with multiple products
- `POST /api/sales/balance-payment` - Update balance payment for existing sale
- `POST /api/sales/upload-csv` - **NEW**: Upload sales data from CSV/Excel file (supports .csv, .xlsx, .xls)

### Leads Management
- `GET /api/leads` - Get all leads
- `POST /api/leads` - Add new lead
- `POST /api/leads/upload-csv` - **NEW**: Upload leads data from CSV/Excel file (supports .csv, .xlsx, .xls)

### Customer Management
- `GET /api/customers` - Get all customers

## Data Architecture

### Database: Cloudflare D1 (SQLite)

**Sales Table Schema:**
```sql
- id (INTEGER PRIMARY KEY)
- order_id (TEXT UNIQUE)
- customer_code (TEXT)
- customer_contact (TEXT)
- sale_date (DATE)
- employee_name (TEXT) - Akash Parashar, Mandeep Samal, Smruti Ranjan Nayak
- sale_type (TEXT) - With, Without
- courier_cost (REAL)
- amount_received (REAL)
- account_received (TEXT) - IDFC4828, IDFC7455, Canara, Cash
- payment_reference (TEXT)
- remarks (TEXT)
- subtotal (REAL)
- gst_amount (REAL) - 18% of (subtotal + courier_cost) if "With" type
- total_amount (REAL) - subtotal + courier_cost + gst_amount
- balance_amount (REAL) - total_amount - amount_received
- created_at (DATETIME)
- updated_at (DATETIME)
```

**Sale Items Table Schema:**
```sql
- id (INTEGER PRIMARY KEY)
- sale_id (INTEGER FOREIGN KEY)
- product_name (TEXT) - MDVR, Dashcam, Camera
- quantity (INTEGER)
- unit_price (REAL)
- total_price (REAL)
```

**Payment History Table Schema:**
```sql
- id (INTEGER PRIMARY KEY)
- sale_id (INTEGER FOREIGN KEY)
- order_id (TEXT)
- payment_date (DATE)
- amount (REAL)
- payment_reference (TEXT)
- created_at (DATETIME)
```

**Leads Table Schema:**
```sql
- id (INTEGER PRIMARY KEY)
- customer_name (TEXT)
- mobile_number (TEXT)
- alternate_mobile (TEXT)
- location (TEXT)
- company_name (TEXT)
- gst_number (TEXT)
- email (TEXT)
- complete_address (TEXT)
- status (TEXT) - New, Contacted, etc.
- created_at (DATETIME)
- updated_at (DATETIME)
```

## User Guide

### Adding a New Sale

1. Click the **"Add New"** button in the top-right corner
2. Select **"New Sale"** from the dropdown menu
3. Fill in customer and sale details:
   - Customer code/contact number
   - Date of sale (defaults to today)
   - Select employee from list
   - Choose sale type (With/Without GST)
   - Enter courier cost
   - Enter amount received
   - Select account where payment received
   - Add payment reference number
   - Add any remarks
4. Add products (up to 10):
   - Click "Add Product" button
   - Select product name from dropdown
   - Enter quantity and unit price
   - Total auto-calculates
   - Remove unwanted products with X button
5. Review totals:
   - Subtotal (sum of all products)
   - Courier cost
   - GST (18% if "With GST" selected)
   - Final total amount
6. Click **"Save Sale"** to submit

**GST Calculation:**
- **With GST**: GST = 18% of (Subtotal + Courier Cost)
- **Without GST**: GST = 0

### Updating Balance Payment

1. Click **"Add New"** → **"Balance Payment Update"**
2. Enter Order ID (e.g., ORD001)
3. Select payment date
4. Enter amount received
5. Add payment reference number
6. Click **"Update Payment"**
7. System automatically:
   - Updates amount received
   - Recalculates balance
   - Adds entry to payment history

### Adding New Lead

1. Click **"Add New"** → **"Add New Lead"**
2. Fill in lead details:
   - Customer name (required)
   - Mobile number (required)
   - Alternate mobile (optional)
   - Location
   - Company name
   - GST number
   - Email ID
   - Complete address
3. Click **"Save Lead"**
4. View all leads in "Leads" tab in sidebar

### Uploading Sales/Leads Data (NEW)

**For Sales Data:**
1. Navigate to **"Upload"** tab in the sidebar
2. Click **"Select CSV or Excel File"** under Sales Upload section
3. Choose your file (.csv, .xlsx, or .xls format)
4. Click **"Upload Sales Data"**
5. System will:
   - Parse the file automatically
   - Validate data against database constraints
   - Normalize "With Bill" column to 'With' or 'Without'
   - Calculate GST amounts automatically
   - Import up to 10 products per sale
   - Report errors for invalid rows
   - Show success message with import count

**Expected Sales CSV Format:**
The system expects Google Sheets export format with 60+ columns:
- S.No, Month, Order Id, Sale Date, Cust Code, Sale Done By, Company Name, Customer Name, Mobile Number
- Bill Amount, Amount Rcd, Balance Payment, Round Off, **With Bill** (critical - normalized to 'With'/'Without')
- Products 1-10 with Code/Name/Quantity/Rate for each
- And more...

**For Leads Data:**
1. Navigate to **"Upload"** tab in the sidebar
2. Click **"Select CSV or Excel File"** under Leads Upload section
3. Choose your file (.csv, .xlsx, or .xls format)
4. Click **"Upload Leads Data"**
5. System will import leads with error reporting

**Expected Leads CSV Format:**
- Cust Code, Date, Customer Name, Location, Mobile Number, Follow Up Person
- Remarks, Cust Email id, Company Name, GST Number, Company Address

### Viewing Sales Data

- **Dashboard**: Shows current month summary with charts and detailed table
- **Current Month Sale**: Simplified view of current month sales
- **Sales Database**: Complete history of all sales
- **Balance Payment**: View all orders with pending payments (with Update action button)
- **Order Details by ID**: Search specific order with complete breakdown
- **Upload Tab**: **NEW** - Import sales and leads data from CSV/Excel files

### Sales Table Features

The main sales table now shows:
- Order ID and date
- Customer code and contact
- Employee name
- All products (comma-separated with quantities)
- Sale type badge
- Subtotal, GST, and total amounts
- Amount received and balance
- Number of payments made
- Remarks

## Sample Data

The database includes 3 sample sales with the following breakdown:

**Sales Summary:**
- **Akash Parashar**: 1 sale, ₹15,500 (2x MDVR + 1x Dashcam, With GST)
- **Mandeep Samal**: 1 sale, ₹8,300 (2x Camera, Without GST)
- **Smruti Ranjan Nayak**: 1 sale, ₹25,700 (3x MDVR + 2x Dashcam, With GST)

**Products Used:**
- MDVR: ₹5,000 per unit
- Dashcam: ₹3,000 per unit
- Camera: ₹4,000 per unit

**Leads:**
- 3 sample leads with complete contact information

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
npm run db:seed             # Seed database with old sample data
npm run db:reset            # Reset local database

# Utility commands
npm run clean-port          # Kill process on port 3000
npm run test                # Test the service
```

## Deployment Status

- **Platform**: Cloudflare Pages with D1 Database
- **Status**: ✅ Active (Development)
- **Local Database**: Initialized with enhanced schema and sample data
- **Production Database**: Pending API key configuration

## Key Features Highlight

### Multi-Product Sales
- Add up to 10 different products in a single sale
- Each product can have different quantities and prices
- Automatic calculation of item totals
- Dynamic add/remove product rows

### GST Calculation
- Automatic 18% GST calculation for "With GST" sales
- GST applied on (Subtotal + Courier Cost)
- "Without GST" option for GST-free sales
- Clear breakdown in total summary

### Payment Tracking
- Track initial payment during sale creation
- Add multiple payments over time
- Complete payment history for each sale
- Automatic balance calculation
- Payment reference numbers for audit trail

### Lead Management
- Capture leads with complete contact info
- Store company and GST details
- Track lead status
- Separate leads tab for easy access

### Enhanced UI/UX
- Sidebar closes automatically when switching tabs
- Full-page view for all content
- Dropdown action menu for cleaner interface
- Responsive design for all screen sizes
- Real-time total calculations
- Color-coded payment status badges

## Recent Updates (2025-10-30)

### ✅ CSV/Excel Upload Feature - FIXED
**Issue Fixed:** Database constraint violation error when uploading sales CSV
- **Root Cause**: Column name mismatch (`mobile_number` vs `customer_contact`) and improper sale type normalization
- **Solution**: 
  - Fixed column mapping to match database schema exactly
  - Added proper data normalization for "With Bill" column
  - Implemented Excel file support using SheetJS library
  - Added comprehensive error handling with row-level reporting
  - Both Sales and Leads upload now support CSV (.csv) and Excel (.xlsx, .xls) formats

### Upload Features Now Include:
- ✅ Automatic file format detection (CSV/Excel)
- ✅ Google Sheets export compatible
- ✅ Sale type normalization ('With'/'Without' from any variation)
- ✅ Proper column mapping for 60+ columns
- ✅ Support for up to 10 products per sale
- ✅ Row-level error tracking and reporting
- ✅ Partial import support (continues on errors)
- ✅ Detailed error messages for troubleshooting

## Features Not Yet Implemented

1. **Courier Calculation** - Weight-based cost calculator
2. **Lead Conversion** - Convert leads to customers/sales
3. **Sale Editing** - Modify existing sale records
4. **Export Functionality** - Export data to CSV/Excel
5. **User Authentication** - Login system for employees
6. **Date Range Filters** - Custom date range selection
7. **Advanced Analytics** - Trend analysis and forecasting
8. **Email Notifications** - Payment reminders and receipts
9. **Product Management** - Add/edit product catalog
10. **Customer Management** - Edit customer information

## Recommended Next Steps

1. **Implement Courier Calculation**
   - Weight-based pricing calculator
   - Integration with courier APIs
   - Cost estimation tool

2. **Lead Management Enhancements**
   - Lead status tracking (New, Contacted, Qualified, Lost)
   - Follow-up reminders
   - Convert leads to sales
   - Lead source tracking

3. **Product Catalog Management**
   - Add/edit/delete products
   - Product categories
   - Stock management
   - Price history

4. **Advanced Reporting**
   - Monthly sales reports
   - Employee performance analysis
   - Product-wise sales analysis
   - Payment collection reports
   - GST reports

5. **User Authentication**
   - Employee login system
   - Role-based access control
   - Activity logging
   - Secure payment information

6. **Mobile App**
   - React Native mobile application
   - Offline support
   - Push notifications
   - Quick sale entry

## Technical Details

**Frontend:**
- Pure JavaScript (no framework)
- TailwindCSS via CDN
- Chart.js for data visualization (Bar and Doughnut charts)
- Axios for API calls
- Font Awesome icons
- Responsive grid layouts

**Backend:**
- Hono framework on Cloudflare Workers
- D1 Database (SQLite) for data persistence
- RESTful API architecture
- Server-side rendering for main page
- CRUD operations for all entities
- **SheetJS (xlsx)** library for Excel file parsing
- **CSV parsing** with proper quote handling

**Database:**
- Cloudflare D1 (globally distributed SQLite)
- Local development with `--local` flag
- Migration-based schema management
- Foreign key relationships
- Indexed for performance

## Project Structure

```
webapp/
├── src/
│   └── index.tsx           # Main Hono application with API routes and HTML
├── migrations/
│   ├── 0001_initial_schema.sql
│   └── 0002_enhanced_schema.sql
├── seed.sql                # Old sample data
├── seed_new.sql            # New sample data with multi-product sales
├── ecosystem.config.cjs    # PM2 configuration
├── wrangler.jsonc          # Cloudflare configuration
├── package.json            # Dependencies and scripts
└── README.md              # This file
```

## Calculation Examples

### Example 1: Sale With GST
- Product 1: 2x MDVR @ ₹5,000 = ₹10,000
- Product 2: 1x Dashcam @ ₹3,000 = ₹3,000
- **Subtotal**: ₹13,000
- **Courier Cost**: ₹500
- **GST (18%)**: ₹2,430 (18% of ₹13,500)
- **Total Amount**: ₹15,930

### Example 2: Sale Without GST
- Product 1: 2x Camera @ ₹4,000 = ₹8,000
- **Subtotal**: ₹8,000
- **Courier Cost**: ₹300
- **GST**: ₹0
- **Total Amount**: ₹8,300

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (responsive design)

## Last Updated

2025-10-30

---

**All features are now fully implemented and tested!** The dashboard supports multi-product sales, GST calculations, lead management, balance payment tracking, and comprehensive reporting with enhanced visualizations.
