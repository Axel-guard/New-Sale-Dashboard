import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// API Routes

// Get dashboard summary data
app.get('/api/dashboard/summary', async (c) => {
  const { env } = c;
  
  try {
    // Get current month date range
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    // Employee-wise sales for current month
    const employeeSales = await env.DB.prepare(`
      SELECT 
        employee_name,
        COUNT(*) as total_sales,
        SUM(total_amount) as total_revenue,
        SUM(paid_amount) as total_paid,
        SUM(balance_amount) as total_balance
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      GROUP BY employee_name
      ORDER BY total_revenue DESC
    `).bind(firstDay.toISOString()).all();
    
    // Payment type distribution
    const paymentTypeData = await env.DB.prepare(`
      SELECT 
        payment_type,
        COUNT(*) as count,
        SUM(total_amount) as total_amount
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      GROUP BY payment_type
    `).bind(firstDay.toISOString()).all();
    
    // Current month sales count and revenue
    const monthlySummary = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_sales,
        SUM(total_amount) as total_revenue,
        SUM(paid_amount) as total_paid,
        SUM(balance_amount) as total_balance
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
    `).bind(firstDay.toISOString()).first();
    
    return c.json({
      success: true,
      data: {
        employeeSales: employeeSales.results,
        paymentTypeData: paymentTypeData.results,
        monthlySummary
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch dashboard data' }, 500);
  }
});

// Get all sales for current month (for table)
app.get('/api/sales/current-month', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const sales = await env.DB.prepare(`
      SELECT * FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      ORDER BY sale_date DESC
    `).bind(firstDay.toISOString()).all();
    
    return c.json({ success: true, data: sales.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch sales' }, 500);
  }
});

// Get all sales (for sales database page)
app.get('/api/sales', async (c) => {
  const { env } = c;
  
  try {
    const sales = await env.DB.prepare(`
      SELECT * FROM sales
      ORDER BY sale_date DESC
      LIMIT 1000
    `).all();
    
    return c.json({ success: true, data: sales.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch sales' }, 500);
  }
});

// Get sale by order ID
app.get('/api/sales/order/:orderId', async (c) => {
  const { env } = c;
  const orderId = c.req.param('orderId');
  
  try {
    const sale = await env.DB.prepare(`
      SELECT * FROM sales WHERE order_id = ?
    `).bind(orderId).first();
    
    if (!sale) {
      return c.json({ success: false, error: 'Order not found' }, 404);
    }
    
    return c.json({ success: true, data: sale });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch order' }, 500);
  }
});

// Get balance payments
app.get('/api/sales/balance-payments', async (c) => {
  const { env } = c;
  
  try {
    const sales = await env.DB.prepare(`
      SELECT * FROM sales
      WHERE balance_amount > 0
      ORDER BY sale_date DESC
    `).all();
    
    return c.json({ success: true, data: sales.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch balance payments' }, 500);
  }
});

// Add new sale
app.post('/api/sales', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const {
      employee_name,
      customer_name,
      customer_phone,
      customer_email,
      product_name,
      quantity,
      unit_price,
      payment_type,
      paid_amount,
      courier_details
    } = body;
    
    // Calculate amounts
    const total_amount = quantity * unit_price;
    const balance_amount = total_amount - paid_amount;
    
    // Generate order ID
    const timestamp = Date.now();
    const order_id = `ORD${timestamp.toString().slice(-8)}`;
    
    // Insert sale
    const result = await env.DB.prepare(`
      INSERT INTO sales (
        employee_name, customer_name, customer_phone, customer_email,
        product_name, quantity, unit_price, total_amount,
        payment_type, paid_amount, balance_amount, order_id, courier_details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      employee_name,
      customer_name,
      customer_phone || null,
      customer_email || null,
      product_name,
      quantity,
      unit_price,
      total_amount,
      payment_type,
      paid_amount,
      balance_amount,
      order_id,
      courier_details || null
    ).run();
    
    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        order_id,
        total_amount,
        balance_amount
      }
    }, 201);
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create sale' }, 500);
  }
});

// Get all customers
app.get('/api/customers', async (c) => {
  const { env } = c;
  
  try {
    const customers = await env.DB.prepare(`
      SELECT * FROM customers
      ORDER BY created_at DESC
    `).all();
    
    return c.json({ success: true, data: customers.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch customers' }, 500);
  }
});

// Search customer by phone or email
app.get('/api/customers/search', async (c) => {
  const { env } = c;
  const query = c.req.query('q');
  
  if (!query) {
    return c.json({ success: false, error: 'Search query required' }, 400);
  }
  
  try {
    const customers = await env.DB.prepare(`
      SELECT * FROM customers
      WHERE phone LIKE ? OR email LIKE ? OR name LIKE ?
      LIMIT 10
    `).bind(`%${query}%`, `%${query}%`, `%${query}%`).all();
    
    return c.json({ success: true, data: customers.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to search customers' }, 500);
  }
});

// Home page with dashboard
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AxelGuard Sale Dashboard</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: #f0f2f5;
            }
            
            /* Top Bar Fixed */
            .top-bar {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 60px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 1000;
            }
            
            .top-bar h1 {
                font-size: 24px;
                font-weight: 600;
                margin: 0 auto;
            }
            
            /* Sidebar */
            .sidebar {
                position: fixed;
                top: 60px;
                left: -280px;
                width: 280px;
                height: calc(100vh - 60px);
                background: white;
                box-shadow: 2px 0 10px rgba(0,0,0,0.1);
                transition: left 0.3s ease;
                z-index: 999;
                overflow-y: auto;
            }
            
            .sidebar.open {
                left: 0;
            }
            
            .sidebar-item {
                padding: 15px 20px;
                border-bottom: 1px solid #e5e7eb;
                cursor: pointer;
                transition: all 0.3s;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .sidebar-item:hover {
                background: #f3f4f6;
                padding-left: 25px;
            }
            
            .sidebar-item.active {
                background: #eef2ff;
                border-left: 4px solid #667eea;
            }
            
            /* Main Content */
            .main-content {
                margin-top: 60px;
                padding: 20px;
                transition: margin-left 0.3s ease;
            }
            
            .main-content.shifted {
                margin-left: 280px;
            }
            
            /* Cards */
            .card {
                background: white;
                border-radius: 10px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                padding: 20px;
                margin-bottom: 20px;
            }
            
            .card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .card-title {
                font-size: 18px;
                font-weight: 600;
                color: #1f2937;
            }
            
            /* Button */
            .btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 500;
                transition: transform 0.2s;
            }
            
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
            
            /* Modal */
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 2000;
                align-items: center;
                justify-content: center;
            }
            
            .modal.show {
                display: flex;
            }
            
            .modal-content {
                background: white;
                border-radius: 12px;
                padding: 30px;
                width: 90%;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 2px solid #e5e7eb;
            }
            
            .close {
                font-size: 28px;
                cursor: pointer;
                color: #6b7280;
            }
            
            /* Form */
            .form-group {
                margin-bottom: 15px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
                color: #374151;
            }
            
            .form-group input,
            .form-group select {
                width: 100%;
                padding: 10px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
            }
            
            .form-group input:focus,
            .form-group select:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            
            /* Table */
            .table-container {
                overflow-x: auto;
            }
            
            table {
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
            }
            
            thead {
                background: #f9fafb;
            }
            
            th {
                padding: 12px;
                text-align: left;
                font-weight: 600;
                color: #374151;
                border-bottom: 2px solid #e5e7eb;
            }
            
            td {
                padding: 12px;
                border-bottom: 1px solid #e5e7eb;
            }
            
            tbody tr:hover {
                background: #f9fafb;
            }
            
            /* Badges */
            .badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 500;
            }
            
            .badge-success {
                background: #d1fae5;
                color: #065f46;
            }
            
            .badge-warning {
                background: #fef3c7;
                color: #92400e;
            }
            
            .badge-danger {
                background: #fee2e2;
                color: #991b1b;
            }
            
            /* Hamburger Menu */
            .menu-toggle {
                cursor: pointer;
                font-size: 24px;
            }
            
            /* Grid Layout */
            .grid-2 {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
                margin-bottom: 20px;
            }
            
            .employee-card {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            }
            
            .employee-card h3 {
                font-size: 16px;
                margin-bottom: 10px;
                opacity: 0.9;
            }
            
            .employee-card .value {
                font-size: 28px;
                font-weight: 700;
                margin-bottom: 5px;
            }
            
            .employee-card .sub-value {
                font-size: 14px;
                opacity: 0.8;
            }
            
            /* Page Content */
            .page-content {
                display: none;
            }
            
            .page-content.active {
                display: block;
            }
            
            /* Loading */
            .loading {
                text-align: center;
                padding: 40px;
                color: #6b7280;
            }
        </style>
    </head>
    <body>
        <!-- Top Bar -->
        <div class="top-bar">
            <div class="menu-toggle" onclick="toggleSidebar()">
                <i class="fas fa-bars"></i>
            </div>
            <h1>AxelGuard Sale Dashboard</h1>
            <div style="width: 40px;"></div>
        </div>

        <!-- Sidebar -->
        <div class="sidebar" id="sidebar">
            <div class="sidebar-item active" onclick="showPage('dashboard')">
                <i class="fas fa-chart-line"></i>
                <span>Dashboard</span>
            </div>
            <div class="sidebar-item" onclick="showPage('courier-calculation')">
                <i class="fas fa-shipping-fast"></i>
                <span>Courier Calculation</span>
            </div>
            <div class="sidebar-item" onclick="showPage('order-details')">
                <i class="fas fa-search"></i>
                <span>Order Details by ID</span>
            </div>
            <div class="sidebar-item" onclick="showPage('customer-details')">
                <i class="fas fa-users"></i>
                <span>Customer Details</span>
            </div>
            <div class="sidebar-item" onclick="showPage('current-month-sale')">
                <i class="fas fa-calendar-alt"></i>
                <span>Current Month Sale</span>
            </div>
            <div class="sidebar-item" onclick="showPage('sale-database')">
                <i class="fas fa-database"></i>
                <span>Sale Database</span>
            </div>
            <div class="sidebar-item" onclick="showPage('balance-payment')">
                <i class="fas fa-money-bill-wave"></i>
                <span>Balance Payment</span>
            </div>
        </div>

        <!-- Main Content -->
        <div class="main-content" id="mainContent">
            <!-- Dashboard Page -->
            <div class="page-content active" id="dashboard-page">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="font-size: 24px; font-weight: 600; color: #1f2937;">Dashboard Overview</h2>
                    <button class="btn-primary" onclick="openAddSaleModal()">
                        <i class="fas fa-plus"></i> Add Sale
                    </button>
                </div>

                <!-- Employee-wise Sales -->
                <div id="employeeSalesGrid" class="grid-2">
                    <div class="loading">Loading...</div>
                </div>

                <!-- Payment Type Chart -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Payment Type Distribution</h3>
                    </div>
                    <div style="max-width: 400px; margin: 0 auto;">
                        <canvas id="paymentChart"></canvas>
                    </div>
                </div>

                <!-- Sales Table -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Complete Sale Details - Current Month</h3>
                    </div>
                    <div class="table-container">
                        <table id="salesTable">
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Date</th>
                                    <th>Employee</th>
                                    <th>Customer</th>
                                    <th>Product</th>
                                    <th>Quantity</th>
                                    <th>Total Amount</th>
                                    <th>Payment Type</th>
                                    <th>Paid</th>
                                    <th>Balance</th>
                                </tr>
                            </thead>
                            <tbody id="salesTableBody">
                                <tr><td colspan="10" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Other Pages (will be loaded dynamically) -->
            <div class="page-content" id="courier-calculation-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Courier Calculation</h2>
                    <p>Courier calculation feature coming soon...</p>
                </div>
            </div>

            <div class="page-content" id="order-details-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Search Order by ID</h2>
                    <div class="form-group">
                        <label>Enter Order ID</label>
                        <input type="text" id="searchOrderId" placeholder="e.g., ORD001">
                    </div>
                    <button class="btn-primary" onclick="searchOrder()">
                        <i class="fas fa-search"></i> Search
                    </button>
                    <div id="orderResult" style="margin-top: 20px;"></div>
                </div>
            </div>

            <div class="page-content" id="customer-details-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Customer Details</h2>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Email</th>
                                    <th>Address</th>
                                    <th>Joined Date</th>
                                </tr>
                            </thead>
                            <tbody id="customersTableBody">
                                <tr><td colspan="5" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="page-content" id="current-month-sale-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Current Month Sales</h2>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Date</th>
                                    <th>Employee</th>
                                    <th>Customer</th>
                                    <th>Product</th>
                                    <th>Total Amount</th>
                                    <th>Payment Type</th>
                                </tr>
                            </thead>
                            <tbody id="currentMonthTableBody">
                                <tr><td colspan="7" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="page-content" id="sale-database-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Complete Sales Database</h2>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Date</th>
                                    <th>Employee</th>
                                    <th>Customer</th>
                                    <th>Product</th>
                                    <th>Quantity</th>
                                    <th>Total Amount</th>
                                    <th>Payment Type</th>
                                    <th>Balance</th>
                                </tr>
                            </thead>
                            <tbody id="allSalesTableBody">
                                <tr><td colspan="9" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="page-content" id="balance-payment-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Pending Balance Payments</h2>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Date</th>
                                    <th>Employee</th>
                                    <th>Customer</th>
                                    <th>Phone</th>
                                    <th>Total Amount</th>
                                    <th>Paid Amount</th>
                                    <th>Balance Amount</th>
                                    <th>Payment Type</th>
                                </tr>
                            </thead>
                            <tbody id="balancePaymentTableBody">
                                <tr><td colspan="9" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add Sale Modal -->
        <div class="modal" id="addSaleModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Add New Sale</h2>
                    <span class="close" onclick="closeAddSaleModal()">&times;</span>
                </div>
                <form id="addSaleForm" onsubmit="submitSale(event)">
                    <div class="form-group">
                        <label>Employee Name *</label>
                        <input type="text" name="employee_name" required>
                    </div>
                    <div class="form-group">
                        <label>Customer Name *</label>
                        <input type="text" name="customer_name" required>
                    </div>
                    <div class="form-group">
                        <label>Customer Phone</label>
                        <input type="tel" name="customer_phone">
                    </div>
                    <div class="form-group">
                        <label>Customer Email</label>
                        <input type="email" name="customer_email">
                    </div>
                    <div class="form-group">
                        <label>Product Name *</label>
                        <input type="text" name="product_name" required>
                    </div>
                    <div class="form-group">
                        <label>Quantity *</label>
                        <input type="number" name="quantity" min="1" value="1" required onchange="calculateTotal()">
                    </div>
                    <div class="form-group">
                        <label>Unit Price *</label>
                        <input type="number" name="unit_price" min="0" step="0.01" required onchange="calculateTotal()">
                    </div>
                    <div class="form-group">
                        <label>Total Amount</label>
                        <input type="number" name="total_amount" readonly style="background: #f3f4f6;">
                    </div>
                    <div class="form-group">
                        <label>Payment Type *</label>
                        <select name="payment_type" required onchange="updatePaidAmount()">
                            <option value="">Select Payment Type</option>
                            <option value="payment_done">Payment Done</option>
                            <option value="partial_payment">Partial Payment</option>
                            <option value="credit">Credit</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Paid Amount *</label>
                        <input type="number" name="paid_amount" min="0" step="0.01" value="0" required>
                    </div>
                    <div class="form-group">
                        <label>Courier Details</label>
                        <input type="text" name="courier_details" placeholder="e.g., DHL - Track#12345">
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-save"></i> Save Sale
                    </button>
                </form>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            let paymentChart = null;

            // Toggle Sidebar
            function toggleSidebar() {
                const sidebar = document.getElementById('sidebar');
                const mainContent = document.getElementById('mainContent');
                sidebar.classList.toggle('open');
                mainContent.classList.toggle('shifted');
            }

            // Show Page
            function showPage(pageName) {
                // Hide all pages
                document.querySelectorAll('.page-content').forEach(page => {
                    page.classList.remove('active');
                });
                
                // Show selected page
                document.getElementById(pageName + '-page').classList.add('active');
                
                // Update sidebar active state
                document.querySelectorAll('.sidebar-item').forEach(item => {
                    item.classList.remove('active');
                });
                event.target.closest('.sidebar-item').classList.add('active');
                
                // Load page data
                loadPageData(pageName);
                
                // Close sidebar on mobile
                if (window.innerWidth < 768) {
                    toggleSidebar();
                }
            }

            // Load page data
            function loadPageData(pageName) {
                switch(pageName) {
                    case 'dashboard':
                        loadDashboard();
                        break;
                    case 'customer-details':
                        loadCustomers();
                        break;
                    case 'current-month-sale':
                        loadCurrentMonthSales();
                        break;
                    case 'sale-database':
                        loadAllSales();
                        break;
                    case 'balance-payment':
                        loadBalancePayments();
                        break;
                }
            }

            // Load Dashboard
            async function loadDashboard() {
                try {
                    const response = await axios.get('/api/dashboard/summary');
                    const { employeeSales, paymentTypeData, monthlySummary } = response.data.data;
                    
                    // Render employee cards
                    const grid = document.getElementById('employeeSalesGrid');
                    grid.innerHTML = employeeSales.map(emp => \`
                        <div class="employee-card">
                            <h3>\${emp.employee_name}</h3>
                            <div class="value">₹\${emp.total_revenue.toLocaleString()}</div>
                            <div class="sub-value">\${emp.total_sales} sales | Balance: ₹\${emp.total_balance.toLocaleString()}</div>
                        </div>
                    \`).join('');
                    
                    // Render payment chart
                    renderPaymentChart(paymentTypeData);
                    
                    // Load sales table
                    loadSalesTable();
                } catch (error) {
                    console.error('Error loading dashboard:', error);
                }
            }

            // Render Payment Chart
            function renderPaymentChart(data) {
                const ctx = document.getElementById('paymentChart').getContext('2d');
                
                if (paymentChart) {
                    paymentChart.destroy();
                }
                
                const labels = data.map(d => {
                    if (d.payment_type === 'payment_done') return 'Payment Done';
                    if (d.payment_type === 'partial_payment') return 'Partial Payment';
                    return 'Credit';
                });
                
                const values = data.map(d => d.count);
                const colors = ['#10b981', '#f59e0b', '#ef4444'];
                
                paymentChart = new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: values,
                            backgroundColor: colors,
                            borderWidth: 2,
                            borderColor: 'white'
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                position: 'bottom',
                            }
                        }
                    }
                });
            }

            // Load Sales Table
            async function loadSalesTable() {
                try {
                    const response = await axios.get('/api/sales/current-month');
                    const sales = response.data.data;
                    
                    const tbody = document.getElementById('salesTableBody');
                    tbody.innerHTML = sales.map(sale => \`
                        <tr>
                            <td><strong>\${sale.order_id}</strong></td>
                            <td>\${new Date(sale.sale_date).toLocaleDateString()}</td>
                            <td>\${sale.employee_name}</td>
                            <td>\${sale.customer_name}</td>
                            <td>\${sale.product_name}</td>
                            <td>\${sale.quantity}</td>
                            <td>₹\${sale.total_amount.toLocaleString()}</td>
                            <td>\${getPaymentBadge(sale.payment_type)}</td>
                            <td>₹\${sale.paid_amount.toLocaleString()}</td>
                            <td>₹\${sale.balance_amount.toLocaleString()}</td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading sales:', error);
                }
            }

            // Get Payment Badge
            function getPaymentBadge(type) {
                if (type === 'payment_done') {
                    return '<span class="badge badge-success">Payment Done</span>';
                } else if (type === 'partial_payment') {
                    return '<span class="badge badge-warning">Partial Payment</span>';
                } else {
                    return '<span class="badge badge-danger">Credit</span>';
                }
            }

            // Load Customers
            async function loadCustomers() {
                try {
                    const response = await axios.get('/api/customers');
                    const customers = response.data.data;
                    
                    const tbody = document.getElementById('customersTableBody');
                    tbody.innerHTML = customers.map(customer => \`
                        <tr>
                            <td>\${customer.name}</td>
                            <td>\${customer.phone || 'N/A'}</td>
                            <td>\${customer.email || 'N/A'}</td>
                            <td>\${customer.address || 'N/A'}</td>
                            <td>\${new Date(customer.created_at).toLocaleDateString()}</td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading customers:', error);
                }
            }

            // Load Current Month Sales
            async function loadCurrentMonthSales() {
                try {
                    const response = await axios.get('/api/sales/current-month');
                    const sales = response.data.data;
                    
                    const tbody = document.getElementById('currentMonthTableBody');
                    tbody.innerHTML = sales.map(sale => \`
                        <tr>
                            <td><strong>\${sale.order_id}</strong></td>
                            <td>\${new Date(sale.sale_date).toLocaleDateString()}</td>
                            <td>\${sale.employee_name}</td>
                            <td>\${sale.customer_name}</td>
                            <td>\${sale.product_name}</td>
                            <td>₹\${sale.total_amount.toLocaleString()}</td>
                            <td>\${getPaymentBadge(sale.payment_type)}</td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading current month sales:', error);
                }
            }

            // Load All Sales
            async function loadAllSales() {
                try {
                    const response = await axios.get('/api/sales');
                    const sales = response.data.data;
                    
                    const tbody = document.getElementById('allSalesTableBody');
                    tbody.innerHTML = sales.map(sale => \`
                        <tr>
                            <td><strong>\${sale.order_id}</strong></td>
                            <td>\${new Date(sale.sale_date).toLocaleDateString()}</td>
                            <td>\${sale.employee_name}</td>
                            <td>\${sale.customer_name}</td>
                            <td>\${sale.product_name}</td>
                            <td>\${sale.quantity}</td>
                            <td>₹\${sale.total_amount.toLocaleString()}</td>
                            <td>\${getPaymentBadge(sale.payment_type)}</td>
                            <td>₹\${sale.balance_amount.toLocaleString()}</td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading all sales:', error);
                }
            }

            // Load Balance Payments
            async function loadBalancePayments() {
                try {
                    const response = await axios.get('/api/sales/balance-payments');
                    const sales = response.data.data;
                    
                    const tbody = document.getElementById('balancePaymentTableBody');
                    tbody.innerHTML = sales.map(sale => \`
                        <tr>
                            <td><strong>\${sale.order_id}</strong></td>
                            <td>\${new Date(sale.sale_date).toLocaleDateString()}</td>
                            <td>\${sale.employee_name}</td>
                            <td>\${sale.customer_name}</td>
                            <td>\${sale.customer_phone || 'N/A'}</td>
                            <td>₹\${sale.total_amount.toLocaleString()}</td>
                            <td>₹\${sale.paid_amount.toLocaleString()}</td>
                            <td style="color: #dc2626; font-weight: 600;">₹\${sale.balance_amount.toLocaleString()}</td>
                            <td>\${getPaymentBadge(sale.payment_type)}</td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading balance payments:', error);
                }
            }

            // Search Order
            async function searchOrder() {
                const orderId = document.getElementById('searchOrderId').value.trim();
                if (!orderId) {
                    alert('Please enter an Order ID');
                    return;
                }
                
                try {
                    const response = await axios.get(\`/api/sales/order/\${orderId}\`);
                    const sale = response.data.data;
                    
                    document.getElementById('orderResult').innerHTML = \`
                        <div class="card" style="background: #f9fafb;">
                            <h3 style="margin-bottom: 15px; color: #1f2937;">Order Details</h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                <div><strong>Order ID:</strong> \${sale.order_id}</div>
                                <div><strong>Date:</strong> \${new Date(sale.sale_date).toLocaleDateString()}</div>
                                <div><strong>Employee:</strong> \${sale.employee_name}</div>
                                <div><strong>Customer:</strong> \${sale.customer_name}</div>
                                <div><strong>Phone:</strong> \${sale.customer_phone || 'N/A'}</div>
                                <div><strong>Email:</strong> \${sale.customer_email || 'N/A'}</div>
                                <div><strong>Product:</strong> \${sale.product_name}</div>
                                <div><strong>Quantity:</strong> \${sale.quantity}</div>
                                <div><strong>Unit Price:</strong> ₹\${sale.unit_price.toLocaleString()}</div>
                                <div><strong>Total Amount:</strong> ₹\${sale.total_amount.toLocaleString()}</div>
                                <div><strong>Paid Amount:</strong> ₹\${sale.paid_amount.toLocaleString()}</div>
                                <div><strong>Balance:</strong> ₹\${sale.balance_amount.toLocaleString()}</div>
                                <div><strong>Payment Type:</strong> \${getPaymentBadge(sale.payment_type)}</div>
                                <div><strong>Courier:</strong> \${sale.courier_details || 'N/A'}</div>
                            </div>
                        </div>
                    \`;
                } catch (error) {
                    document.getElementById('orderResult').innerHTML = \`
                        <div class="card" style="background: #fee2e2; color: #991b1b;">
                            <strong>Error:</strong> Order not found
                        </div>
                    \`;
                }
            }

            // Modal Functions
            function openAddSaleModal() {
                document.getElementById('addSaleModal').classList.add('show');
            }

            function closeAddSaleModal() {
                document.getElementById('addSaleModal').classList.remove('show');
                document.getElementById('addSaleForm').reset();
            }

            // Calculate Total
            function calculateTotal() {
                const form = document.getElementById('addSaleForm');
                const quantity = parseFloat(form.quantity.value) || 0;
                const unitPrice = parseFloat(form.unit_price.value) || 0;
                form.total_amount.value = (quantity * unitPrice).toFixed(2);
            }

            // Update Paid Amount based on payment type
            function updatePaidAmount() {
                const form = document.getElementById('addSaleForm');
                const paymentType = form.payment_type.value;
                const totalAmount = parseFloat(form.total_amount.value) || 0;
                
                if (paymentType === 'payment_done') {
                    form.paid_amount.value = totalAmount.toFixed(2);
                } else if (paymentType === 'credit') {
                    form.paid_amount.value = '0';
                }
            }

            // Submit Sale
            async function submitSale(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
                
                // Convert numeric fields
                data.quantity = parseInt(data.quantity);
                data.unit_price = parseFloat(data.unit_price);
                data.paid_amount = parseFloat(data.paid_amount);
                
                try {
                    const response = await axios.post('/api/sales', data);
                    
                    if (response.data.success) {
                        alert(\`Sale added successfully! Order ID: \${response.data.data.order_id}\`);
                        closeAddSaleModal();
                        loadDashboard();
                    }
                } catch (error) {
                    alert('Error adding sale: ' + (error.response?.data?.error || error.message));
                }
            }

            // Initialize
            document.addEventListener('DOMContentLoaded', () => {
                loadDashboard();
            });

            // Close modal on outside click
            window.onclick = function(event) {
                const modal = document.getElementById('addSaleModal');
                if (event.target === modal) {
                    closeAddSaleModal();
                }
            }
        </script>
    </body>
    </html>
  `)
})

export default app
