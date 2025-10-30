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

// Authentication endpoints
app.post('/api/auth/login', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { username, password } = body;
    
    // Simple base64 encoding for demo (in production, use proper hashing)
    const encodedPassword = btoa(password);
    
    const user = await env.DB.prepare(`
      SELECT id, username, full_name, role, employee_name, is_active 
      FROM users 
      WHERE username = ? AND password = ? AND is_active = 1
    `).bind(username, encodedPassword).first();
    
    if (!user) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }
    
    return c.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        employeeName: user.employee_name
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Login failed' }, 500);
  }
});

app.get('/api/auth/verify', async (c) => {
  // This would verify a session token in production
  // For now, we'll rely on client-side session storage
  return c.json({ success: true });
});

// Get dashboard summary data
app.get('/api/dashboard/summary', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Employee-wise sales for current month
    const employeeSales = await env.DB.prepare(`
      SELECT 
        employee_name,
        COUNT(*) as total_sales,
        SUM(total_amount) as total_revenue,
        SUM(amount_received) as total_received,
        SUM(balance_amount) as total_balance
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      GROUP BY employee_name
      ORDER BY total_revenue DESC
    `).bind(firstDay.toISOString()).all();
    
    // Payment status distribution
    const paymentStatusData = await env.DB.prepare(`
      SELECT 
        CASE 
          WHEN balance_amount = 0 THEN 'Paid'
          WHEN balance_amount > 0 AND amount_received > 0 THEN 'Partial'
          ELSE 'Pending'
        END as status,
        COUNT(*) as count,
        SUM(total_amount) as total_amount
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      GROUP BY status
    `).bind(firstDay.toISOString()).all();
    
    // Current month sales count and revenue
    const monthlySummary = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_sales,
        SUM(total_amount) as total_revenue,
        SUM(amount_received) as total_received,
        SUM(balance_amount) as total_balance
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
    `).bind(firstDay.toISOString()).first();
    
    return c.json({
      success: true,
      data: {
        employeeSales: employeeSales.results,
        paymentStatusData: paymentStatusData.results,
        monthlySummary
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch dashboard data' }, 500);
  }
});

// Get all sales with items and payments
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
    
    // Get items and payments for each sale
    const salesWithDetails = await Promise.all(sales.results.map(async (sale: any) => {
      const items = await env.DB.prepare(`
        SELECT * FROM sale_items WHERE order_id = ?
      `).bind(sale.order_id).all();
      
      const payments = await env.DB.prepare(`
        SELECT * FROM payment_history WHERE order_id = ? ORDER BY payment_date DESC
      `).bind(sale.order_id).all();
      
      return {
        ...sale,
        items: items.results,
        payments: payments.results
      };
    }));
    
    return c.json({ success: true, data: salesWithDetails });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch sales' }, 500);
  }
});

// Get monthly sales totals
app.get('/api/sales/monthly-total', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const result = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_sales,
        SUM(total_amount) as total_revenue,
        SUM(subtotal) as total_without_tax,
        SUM(amount_received) as total_received,
        SUM(balance_amount) as total_balance
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
    `).bind(firstDay.toISOString()).first();
    
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch monthly total' }, 500);
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

// Get sale by order ID with full details
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
    
    const items = await env.DB.prepare(`
      SELECT * FROM sale_items WHERE sale_id = ?
    `).bind(sale.id).all();
    
    const payments = await env.DB.prepare(`
      SELECT * FROM payment_history WHERE sale_id = ? ORDER BY payment_date DESC
    `).bind(sale.id).all();
    
    return c.json({ 
      success: true, 
      data: {
        ...sale,
        items: items.results,
        payments: payments.results
      }
    });
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
      customer_code,
      customer_contact,
      sale_date,
      employee_name,
      sale_type,
      courier_cost,
      amount_received,
      account_received,
      payment_reference,
      remarks,
      items
    } = body;
    
    // Calculate totals
    let subtotal = 0;
    items.forEach((item: any) => {
      subtotal += item.quantity * item.unit_price;
    });
    
    const gst_amount = sale_type === 'With' ? (subtotal + courier_cost) * 0.18 : 0;
    const total_amount = subtotal + courier_cost + gst_amount;
    const balance_amount = total_amount - amount_received;
    
    // Generate order ID
    const timestamp = Date.now();
    const order_id = `ORD${timestamp.toString().slice(-8)}`;
    
    // Insert sale
    const saleResult = await env.DB.prepare(`
      INSERT INTO sales (
        order_id, customer_code, customer_contact, sale_date, employee_name,
        sale_type, courier_cost, amount_received, account_received,
        payment_reference, remarks, subtotal, gst_amount, total_amount, balance_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      order_id, customer_code, customer_contact, sale_date, employee_name,
      sale_type, courier_cost, amount_received, account_received,
      payment_reference, remarks, subtotal, gst_amount, total_amount, balance_amount
    ).run();
    
    const sale_id = saleResult.meta.last_row_id;
    
    // Insert sale items
    for (const item of items) {
      if (item.product_name && item.quantity > 0 && item.unit_price > 0) {
        const item_total = item.quantity * item.unit_price;
        await env.DB.prepare(`
          INSERT INTO sale_items (sale_id, order_id, product_name, quantity, unit_price, total_price)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(sale_id, order_id, item.product_name, item.quantity, item.unit_price, item_total).run();
      }
    }
    
    // Insert initial payment if amount received
    if (amount_received > 0) {
      await env.DB.prepare(`
        INSERT INTO payment_history (sale_id, order_id, payment_date, amount, account_received, payment_reference)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(sale_id, order_id, sale_date, amount_received, account_received, payment_reference).run();
    }
    
    return c.json({
      success: true,
      data: {
        id: sale_id,
        order_id,
        total_amount,
        balance_amount
      }
    }, 201);
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create sale: ' + error }, 500);
  }
});

// Update balance payment
app.post('/api/sales/balance-payment', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { order_id, payment_date, amount, account_received, payment_reference } = body;
    
    // Get sale
    const sale = await env.DB.prepare(`
      SELECT * FROM sales WHERE order_id = ?
    `).bind(order_id).first();
    
    if (!sale) {
      return c.json({ success: false, error: 'Order not found' }, 404);
    }
    
    // Update sale
    const new_amount_received = sale.amount_received + amount;
    const new_balance = sale.total_amount - new_amount_received;
    
    await env.DB.prepare(`
      UPDATE sales 
      SET amount_received = ?, balance_amount = ?, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `).bind(new_amount_received, new_balance, order_id).run();
    
    // Insert payment history
    await env.DB.prepare(`
      INSERT INTO payment_history (sale_id, order_id, payment_date, amount, account_received, payment_reference)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(sale.id, order_id, payment_date, amount, account_received, payment_reference).run();
    
    return c.json({ success: true, message: 'Payment updated successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update payment' }, 500);
  }
});

// Get all leads
app.get('/api/leads', async (c) => {
  const { env } = c;
  
  try {
    const leads = await env.DB.prepare(`
      SELECT * FROM leads ORDER BY created_at DESC
    `).all();
    
    return c.json({ success: true, data: leads.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch leads' }, 500);
  }
});

// Add new lead
app.post('/api/leads', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const {
      customer_code,
      customer_name,
      mobile_number,
      alternate_mobile,
      location,
      company_name,
      gst_number,
      email,
      complete_address
    } = body;
    
    const result = await env.DB.prepare(`
      INSERT INTO leads (
        customer_code, customer_name, mobile_number, alternate_mobile, location,
        company_name, gst_number, email, complete_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      customer_code || null, customer_name, mobile_number, alternate_mobile || null, location || null,
      company_name || null, gst_number || null, email || null, complete_address || null
    ).run();
    
    return c.json({
      success: true,
      data: { id: result.meta.last_row_id }
    }, 201);
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create lead' }, 500);
  }
});

// Get single lead by ID
app.get('/api/leads/:leadId', async (c) => {
  const { env } = c;
  const leadId = c.req.param('leadId');
  
  try {
    const lead = await env.DB.prepare(`
      SELECT * FROM leads WHERE id = ?
    `).bind(leadId).first();
    
    if (!lead) {
      return c.json({ success: false, error: 'Lead not found' }, 404);
    }
    
    return c.json({ success: true, data: lead });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch lead' }, 500);
  }
});

// Update lead
app.put('/api/leads/:leadId', async (c) => {
  const { env } = c;
  const leadId = c.req.param('leadId');
  
  try {
    const body = await c.req.json();
    const {
      customer_code,
      customer_name,
      mobile_number,
      alternate_mobile,
      location,
      company_name,
      gst_number,
      email,
      complete_address,
      status
    } = body;
    
    await env.DB.prepare(`
      UPDATE leads SET
        customer_code = ?,
        customer_name = ?,
        mobile_number = ?,
        alternate_mobile = ?,
        location = ?,
        company_name = ?,
        gst_number = ?,
        email = ?,
        complete_address = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      customer_code || null,
      customer_name,
      mobile_number,
      alternate_mobile || null,
      location || null,
      company_name || null,
      gst_number || null,
      email || null,
      complete_address || null,
      status || 'New',
      leadId
    ).run();
    
    return c.json({ success: true, message: 'Lead updated successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update lead' }, 500);
  }
});

// Get single sale by ID
app.get('/api/sales/:orderId', async (c) => {
  const { env } = c;
  const orderId = c.req.param('orderId');
  
  try {
    const sale = await env.DB.prepare(`
      SELECT * FROM sales WHERE order_id = ?
    `).bind(orderId).first();
    
    if (!sale) {
      return c.json({ success: false, error: 'Sale not found' }, 404);
    }
    
    return c.json({ success: true, data: sale });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch sale' }, 500);
  }
});

// Get sale items by order ID
app.get('/api/sales/:orderId/items', async (c) => {
  const { env } = c;
  const orderId = c.req.param('orderId');
  
  try {
    const items = await env.DB.prepare(`
      SELECT * FROM sale_items WHERE order_id = ?
    `).bind(orderId).all();
    
    return c.json({ success: true, data: items.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch sale items' }, 500);
  }
});

// Update sale
app.put('/api/sales/:orderId', async (c) => {
  const { env } = c;
  const orderId = c.req.param('orderId');
  
  try {
    const body = await c.req.json();
    const {
      customer_code,
      sale_date,
      employee_name,
      sale_type,
      courier_cost,
      amount_received,
      account_received,
      payment_reference,
      remarks,
      items
    } = body;
    
    // Calculate totals
    let subtotal = 0;
    items.forEach(item => {
      subtotal += item.quantity * item.unit_price;
    });
    
    const gstAmount = sale_type === 'With' ? subtotal * 0.18 : 0;
    const totalAmount = subtotal + (courier_cost || 0) + gstAmount;
    const balanceAmount = totalAmount - (amount_received || 0);
    
    // Update sale
    await env.DB.prepare(`
      UPDATE sales SET
        customer_code = ?,
        sale_date = ?,
        employee_name = ?,
        sale_type = ?,
        courier_cost = ?,
        amount_received = ?,
        account_received = ?,
        payment_reference = ?,
        remarks = ?,
        subtotal = ?,
        gst_amount = ?,
        total_amount = ?,
        balance_amount = ?
      WHERE order_id = ?
    `).bind(
      customer_code,
      sale_date,
      employee_name,
      sale_type,
      courier_cost || 0,
      amount_received || 0,
      account_received,
      payment_reference || null,
      remarks || null,
      subtotal,
      gstAmount,
      totalAmount,
      balanceAmount,
      orderId
    ).run();
    
    // Get sale_id for the order
    const sale = await env.DB.prepare(`
      SELECT id FROM sales WHERE order_id = ?
    `).bind(orderId).first();
    
    // Delete existing items
    await env.DB.prepare(`DELETE FROM sale_items WHERE order_id = ?`).bind(orderId).run();
    
    // Insert new items
    for (const item of items) {
      await env.DB.prepare(`
        INSERT INTO sale_items (sale_id, order_id, product_name, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        sale.id,
        orderId,
        item.product_name,
        item.quantity,
        item.unit_price,
        item.quantity * item.unit_price
      ).run();
    }
    
    return c.json({ success: true, message: 'Sale updated successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update sale' }, 500);
  }
});

// Upload Excel data for sales (placeholder - Excel parsing needs additional libraries)
app.post('/api/sales/upload-csv', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.parseBody();
    const file = body['salesFile'];
    
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'No file uploaded' }, 400);
    }
    
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return c.json({ success: false, error: 'CSV file is empty or invalid' }, 400);
    }
    
    // Skip header row
    const dataLines = lines.slice(1);
    let imported = 0;
    
    for (const line of dataLines) {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      
      // Expected format: customer_code, sale_date, employee_name, sale_type, product_name, quantity, unit_price, account_received
      if (values.length >= 8) {
        const timestamp = Date.now();
        const order_id = `ORD${timestamp.toString().slice(-8)}-${imported}`;
        const quantity = parseFloat(values[5]) || 0;
        const unit_price = parseFloat(values[6]) || 0;
        const subtotal = quantity * unit_price;
        const gst_amount = values[3] === 'With' ? subtotal * 0.18 : 0;
        const total_amount = subtotal + gst_amount;
        
        const saleResult = await env.DB.prepare(`
          INSERT INTO sales (order_id, customer_code, sale_date, employee_name, sale_type, 
                            subtotal, gst_amount, total_amount, balance_amount, account_received)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(order_id, values[0], values[1], values[2], values[3], 
                subtotal, gst_amount, total_amount, total_amount, values[7]).run();
        
        await env.DB.prepare(`
          INSERT INTO sale_items (sale_id, order_id, product_name, quantity, unit_price, total_price)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(saleResult.meta.last_row_id, order_id, values[4], quantity, unit_price, subtotal).run();
        
        imported++;
      }
    }
    
    return c.json({ success: true, data: { imported } });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to import CSV: ' + error }, 500);
  }
});

app.post('/api/leads/upload-csv', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.parseBody();
    const file = body['leadsFile'];
    
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'No file uploaded' }, 400);
    }
    
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return c.json({ success: false, error: 'CSV file is empty or invalid' }, 400);
    }
    
    // Skip header row
    const dataLines = lines.slice(1);
    let imported = 0;
    
    for (const line of dataLines) {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      
      // Expected format: customer_code, customer_name, mobile_number, alternate_mobile, location, company_name, gst_number, email, status
      if (values.length >= 9) {
        await env.DB.prepare(`
          INSERT INTO leads (customer_code, customer_name, mobile_number, alternate_mobile, 
                            location, company_name, gst_number, email, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(values[0] || null, values[1], values[2], values[3] || null, 
                values[4] || null, values[5] || null, values[6] || null, values[7] || null, values[8] || 'New').run();
        
        imported++;
      }
    }
    
    return c.json({ success: true, data: { imported } });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to import CSV: ' + error }, 500);
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

// Home page with dashboard
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AxelGuard Dashboard</title>
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
            
            .login-container {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            
            .login-box {
                background: white;
                padding: 40px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                width: 100%;
                max-width: 420px;
            }
            
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
            
            .main-content {
                margin-top: 60px;
                padding: 20px;
                transition: margin-left 0.3s ease;
            }
            
            .main-content.shifted {
                margin-left: 280px;
            }
            
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
            
            .btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 500;
                transition: transform 0.2s;
                position: relative;
            }
            
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
            
            .btn-view {
                background: #3b82f6;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            }
            
            .btn-view:hover {
                background: #2563eb;
                transform: scale(1.05);
            }
            
            .btn-update {
                background: #f59e0b;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            }
            
            .btn-update:hover {
                background: #d97706;
                transform: scale(1.05);
            }
            
            .action-menu {
                display: none;
                position: absolute;
                top: 100%;
                right: 0;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                margin-top: 5px;
                min-width: 200px;
                z-index: 1000;
            }
            
            .action-menu.show {
                display: block;
            }
            
            .action-menu-item {
                padding: 12px 20px;
                cursor: pointer;
                transition: background 0.2s;
                color: #374151;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .action-menu-item:hover {
                background: #f3f4f6;
            }
            
            .action-menu-item:first-child {
                border-radius: 8px 8px 0 0;
            }
            
            .action-menu-item:last-child {
                border-radius: 0 0 8px 8px;
            }
            
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
                overflow-y: auto;
                padding: 20px;
            }
            
            .modal.show {
                display: flex;
            }
            
            .modal-content {
                background: white;
                border-radius: 12px;
                padding: 30px;
                width: 90%;
                max-width: 900px;
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
            
            .form-group {
                margin-bottom: 15px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
                color: #374151;
                font-size: 14px;
            }
            
            .form-group input,
            .form-group select,
            .form-group textarea {
                width: 100%;
                padding: 10px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
            }
            
            .form-group input:focus,
            .form-group select:focus,
            .form-group textarea:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            
            .form-row {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
            }
            
            .table-container {
                overflow-x: auto;
            }
            
            table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
            }
            
            thead {
                background: #f9fafb;
            }
            
            th {
                padding: 10px 8px;
                text-align: left;
                font-weight: 600;
                color: #374151;
                border-bottom: 2px solid #e5e7eb;
                font-size: 12px;
            }
            
            td {
                padding: 10px 8px;
                border-bottom: 1px solid #e5e7eb;
            }
            
            tbody tr:hover {
                background: #f9fafb;
            }
            
            .badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 11px;
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
            
            .menu-toggle {
                cursor: pointer;
                font-size: 24px;
            }
            
            .grid-2 {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
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
                font-size: 15px;
                margin-bottom: 10px;
                opacity: 0.9;
            }
            
            .employee-card .value {
                font-size: 24px;
                font-weight: 700;
                margin-bottom: 5px;
            }
            
            .employee-card .sub-value {
                font-size: 13px;
                opacity: 0.8;
            }
            
            .page-content {
                display: none;
            }
            
            .page-content.active {
                display: block;
            }
            
            .loading {
                text-align: center;
                padding: 40px;
                color: #6b7280;
            }
            
            .product-row {
                display: grid;
                grid-template-columns: 1.5fr 2.5fr 1fr 1.5fr 1.5fr auto;
                gap: 10px;
                align-items: end;
                margin-bottom: 10px;
                padding: 10px;
                background: #f9fafb;
                border-radius: 6px;
            }
            
            .btn-remove {
                background: #ef4444;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
            }
            
            .btn-add {
                background: #10b981;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                margin-top: 10px;
            }
            
            .total-summary {
                background: #f3f4f6;
                padding: 20px;
                border-radius: 8px;
                margin-top: 20px;
            }
            
            .total-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                font-size: 15px;
            }
            
            .total-row.final {
                border-top: 2px solid #667eea;
                margin-top: 10px;
                padding-top: 15px;
                font-size: 18px;
                font-weight: 700;
                color: #667eea;
            }
            
            .chart-container {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 20px;
            }
            
            @media (max-width: 768px) {
                .chart-container {
                    grid-template-columns: 1fr;
                }
                
                .product-row {
                    grid-template-columns: 1fr;
                }
            }
        </style>
    </head>
    <body>
        <!-- Login Screen -->
        <div id="loginScreen" class="login-container">
            <div class="login-box">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #667eea; font-size: 32px; margin-bottom: 10px;">AxelGuard Dashboard</h1>
                    <p style="color: #6b7280; font-size: 14px;">Sign in to access your dashboard</p>
                </div>
                <form id="loginForm" onsubmit="handleLogin(event)">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" id="loginUsername" required placeholder="Enter your username" autocomplete="username">
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" id="loginPassword" required placeholder="Enter your password" autocomplete="current-password">
                    </div>
                    <div id="loginError" style="color: #dc2626; font-size: 14px; margin: 10px 0; display: none;"></div>
                    <button type="submit" class="btn-primary" style="width: 100%; padding: 12px;">
                        <i class="fas fa-sign-in-alt"></i> Sign In
                    </button>
                </form>
                <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px; font-size: 13px; color: #6b7280;">
                    <strong>Demo Credentials:</strong><br>
                    Admin: admin / admin123<br>
                    Employee: akash / employee123
                </div>
            </div>
        </div>

        <!-- Main Dashboard (hidden until logged in) -->
        <div id="mainDashboard" style="display: none;">
            <div class="top-bar">
                <div class="menu-toggle" onclick="toggleSidebar()">
                    <i class="fas fa-bars"></i>
                </div>
                <h1>AxelGuard Dashboard</h1>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span id="userDisplay" style="font-size: 14px; color: #374151;"></span>
                    <button onclick="handleLogout()" class="btn-primary" style="padding: 8px 16px; font-size: 14px;">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>
            </div>

        <div class="sidebar" id="sidebar">
            <div class="sidebar-item active" onclick="showPage('dashboard')">
                <i class="fas fa-chart-line"></i>
                <span>Dashboard</span>
            </div>
            <div class="sidebar-item" onclick="showPage('courier-calculation')">
                <i class="fas fa-shipping-fast"></i>
                <span>Courier Charges Calculator</span>
            </div>
            <div class="sidebar-item" onclick="showPage('order-details')">
                <i class="fas fa-search"></i>
                <span>Order Details by Order ID</span>
            </div>
            <div class="sidebar-item" onclick="showPage('customer-details')">
                <i class="fas fa-users"></i>
                <span>Customer Details</span>
            </div>
            <div class="sidebar-item" onclick="showPage('current-month-sale')">
                <i class="fas fa-calendar-alt"></i>
                <span>Current Months Sale</span>
            </div>
            <div class="sidebar-item" onclick="showPage('balance-payment')">
                <i class="fas fa-money-bill-wave"></i>
                <span>Balance Payment</span>
            </div>
            <div class="sidebar-item" onclick="showPage('sale-database')">
                <i class="fas fa-database"></i>
                <span>Sale Database</span>
            </div>
            <div class="sidebar-item" onclick="showPage('leads')">
                <i class="fas fa-user-plus"></i>
                <span>Leads Database</span>
            </div>
            <div class="sidebar-item" onclick="showPage('excel-upload')">
                <i class="fas fa-file-excel"></i>
                <span>Upload Excel Data</span>
            </div>
        </div>

        <div class="main-content" id="mainContent">
            <div class="page-content active" id="dashboard-page">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="font-size: 24px; font-weight: 600; color: #1f2937;">Dashboard Overview</h2>
                    <div style="position: relative;">
                        <button class="btn-primary" onclick="toggleActionMenu()">
                            <i class="fas fa-plus"></i> Add New <i class="fas fa-chevron-down" style="margin-left: 5px; font-size: 12px;"></i>
                        </button>
                        <div class="action-menu" id="actionMenu">
                            <div class="action-menu-item" onclick="openNewSaleModal()">
                                <i class="fas fa-shopping-cart"></i> New Sale
                            </div>
                            <div class="action-menu-item" onclick="openBalancePaymentModal()">
                                <i class="fas fa-money-check-alt"></i> Balance Payment Update
                            </div>
                            <div class="action-menu-item" onclick="openNewLeadModal()">
                                <i class="fas fa-user-plus"></i> Add New Lead
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Monthly Total Sales Card -->
                <div class="card" style="margin-bottom: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <div class="card-header" style="border-bottom-color: rgba(255,255,255,0.2);">
                        <h3 class="card-title" style="color: white;">
                            <i class="fas fa-chart-line"></i> Current Month Sales Summary
                        </h3>
                    </div>
                    <div id="monthlyTotalCard" class="loading" style="color: white;">Loading...</div>
                    <div id="monthlyTotalContent" style="display: none;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; padding: 10px 0;">
                            <div style="text-align: center; padding: 15px; background: rgba(255,255,255,0.15); border-radius: 8px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                    <i class="fas fa-shopping-cart"></i> Total Sales
                                </div>
                                <div style="font-size: 28px; font-weight: 700;" id="totalSalesCount">0</div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: rgba(255,255,255,0.15); border-radius: 8px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                    <i class="fas fa-rupee-sign"></i> Total Revenue
                                </div>
                                <div style="font-size: 28px; font-weight: 700;" id="totalRevenue">₹0</div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: rgba(255,255,255,0.15); border-radius: 8px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                    <i class="fas fa-calculator"></i> Without Tax
                                </div>
                                <div style="font-size: 28px; font-weight: 700;" id="totalWithoutTax">₹0</div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: rgba(255,255,255,0.15); border-radius: 8px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                    <i class="fas fa-check-circle"></i> Received
                                </div>
                                <div style="font-size: 28px; font-weight: 700;" id="totalReceived">₹0</div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: rgba(255,255,255,0.15); border-radius: 8px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                    <i class="fas fa-hourglass-half"></i> Balance
                                </div>
                                <div style="font-size: 28px; font-weight: 700;" id="totalBalance">₹0</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="employeeSalesGrid" class="grid-2">
                    <div class="loading">Loading...</div>
                </div>

                <div class="chart-container">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Employee Sales (Current Month)</h3>
                        </div>
                        <canvas id="employeeChart"></canvas>
                    </div>
                    
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Payment Status</h3>
                        </div>
                        <div style="max-width: 300px; margin: 0 auto;">
                            <canvas id="paymentChart"></canvas>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Complete Sale Details - Current Month</h3>
                    </div>
                    <div class="table-container">
                        <table id="salesTable">
                            <thead>
                                <tr>
                                    <th>Action</th>
                                    <th>Order ID</th>
                                    <th>Date</th>
                                    <th>Customer Name</th>
                                    <th>Company Name</th>
                                    <th>Employee</th>
                                    <th>Products</th>
                                    <th>Sale Type</th>
                                    <th>Subtotal</th>
                                    <th>GST</th>
                                    <th>Total</th>
                                    <th>Received</th>
                                    <th>Balance</th>
                                    <th>Payments</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="salesTableBody">
                                <tr><td colspan="15" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Other Pages -->
            <div class="page-content" id="courier-calculation-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Courier Cost Calculator</h2>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Courier Company *</label>
                            <select id="courierCompany" onchange="calculateCourierCost()">
                                <option value="">Select Courier</option>
                                <option value="Trackon">Trackon</option>
                                <option value="Porter">Porter</option>
                                <option value="SM Express">SM Express</option>
                                <option value="India Post">India Post</option>
                                <option value="Tirupati">Tirupati</option>
                                <option value="Fedex">Fedex</option>
                                <option value="DHL">DHL</option>
                                <option value="Self Pickup">Self Pickup</option>
                                <option value="DTDC">DTDC</option>
                                <option value="Professional Courier">Professional Courier</option>
                                <option value="Self Deliver">Self Deliver</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Courier Mode *</label>
                            <select id="courierMode" onchange="calculateCourierCost()">
                                <option value="">Select Mode</option>
                                <option value="Surface">Surface</option>
                                <option value="Air">Air</option>
                                <option value="Priority">Priority next day</option>
                                <option value="Bus">Bus</option>
                            </select>
                        </div>
                    </div>
                    
                    <h3 style="font-size: 16px; font-weight: 600; margin: 20px 0 10px; color: #1f2937;">Select Products</h3>
                    <div id="courierProductRows"></div>
                    <button type="button" class="btn-add" onclick="addCourierProductRow()">
                        <i class="fas fa-plus"></i> Add Product
                    </button>
                    
                    <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; margin-top: 30px;">
                        <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 15px; color: white;">Courier Cost Summary</h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Total Weight</div>
                                <div style="font-size: 24px; font-weight: 700;" id="courierTotalWeight">0 kg</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Rate per kg</div>
                                <div style="font-size: 24px; font-weight: 700;" id="courierRatePerKg">₹0</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Base Cost</div>
                                <div style="font-size: 24px; font-weight: 700;" id="courierBaseCost">₹0</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Fuel Charge (10%)</div>
                                <div style="font-size: 24px; font-weight: 700;" id="courierFuelCharge">₹0</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Total Cost</div>
                                <div style="font-size: 28px; font-weight: 700; color: #fbbf24;" id="courierTotalCost">₹0</div>
                            </div>
                        </div>
                    </div>
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
                                    <th>Customer</th>
                                    <th>Employee</th>
                                    <th>Products</th>
                                    <th>Total Amount</th>
                                    <th>Balance</th>
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
                                    <th>Customer</th>
                                    <th>Employee</th>
                                    <th>Sale Type</th>
                                    <th>Total Amount</th>
                                    <th>Balance</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="allSalesTableBody">
                                <tr><td colspan="8" class="loading">Loading...</td></tr>
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
                                    <th>Customer</th>
                                    <th>Employee</th>
                                    <th>Contact</th>
                                    <th>Total Amount</th>
                                    <th>Received</th>
                                    <th>Balance</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="balancePaymentTableBody">
                                <tr><td colspan="9" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="page-content" id="leads-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Leads Database</h2>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Customer Code</th>
                                    <th>Customer Name</th>
                                    <th>Mobile</th>
                                    <th>Alternate Mobile</th>
                                    <th>Location</th>
                                    <th>Company</th>
                                    <th>GST Number</th>
                                    <th>Email</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="leadsTableBody">
                                <tr><td colspan="11" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="page-content" id="excel-upload-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Upload CSV Data</h2>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                        <!-- Sales Upload Section -->
                        <div style="border: 2px dashed #e5e7eb; border-radius: 8px; padding: 30px; background: #f9fafb;">
                            <div style="text-align: center; margin-bottom: 20px;">
                                <i class="fas fa-file-csv" style="font-size: 48px; color: #10b981; margin-bottom: 15px;"></i>
                                <h3 style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 10px;">Upload Sales Data</h3>
                                <p style="color: #6b7280; font-size: 14px;">Upload CSV file containing sales records</p>
                            </div>
                            <form id="salesCSVForm" onsubmit="uploadSalesCSV(event)">
                                <div class="form-group">
                                    <label>Select CSV File *</label>
                                    <input type="file" name="salesFile" accept=".csv" required style="padding: 8px;">
                                </div>
                                <button type="submit" class="btn-primary" style="width: 100%;">
                                    <i class="fas fa-upload"></i> Upload Sales Data
                                </button>
                            </form>
                            <div id="salesUploadStatus" style="margin-top: 15px; padding: 10px; border-radius: 6px; display: none;"></div>
                            
                            <div style="margin-top: 25px; padding: 15px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                                <h4 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 10px;">Expected Format:</h4>
                                <ul style="font-size: 13px; color: #6b7280; line-height: 1.8; margin-left: 20px;">
                                    <li>Customer Code/Contact</li>
                                    <li>Date of Sale</li>
                                    <li>Employee Name</li>
                                    <li>Product Name</li>
                                    <li>Quantity</li>
                                    <li>Unit Price</li>
                                    <li>Sale Type (With/Without GST)</li>
                                    <li>Account Received</li>
                                </ul>
                            </div>
                        </div>
                        
                        <!-- Leads Upload Section -->
                        <div style="border: 2px dashed #e5e7eb; border-radius: 8px; padding: 30px; background: #f9fafb;">
                            <div style="text-align: center; margin-bottom: 20px;">
                                <i class="fas fa-file-csv" style="font-size: 48px; color: #3b82f6; margin-bottom: 15px;"></i>
                                <h3 style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 10px;">Upload Leads Data</h3>
                                <p style="color: #6b7280; font-size: 14px;">Upload CSV file containing lead records</p>
                            </div>
                            <form id="leadsCSVForm" onsubmit="uploadLeadsCSV(event)">
                                <div class="form-group">
                                    <label>Select CSV File *</label>
                                    <input type="file" name="leadsFile" accept=".csv" required style="padding: 8px;">
                                </div>
                                <button type="submit" class="btn-primary" style="width: 100%;">
                                    <i class="fas fa-upload"></i> Upload Leads Data
                                </button>
                            </form>
                            <div id="leadsUploadStatus" style="margin-top: 15px; padding: 10px; border-radius: 6px; display: none;"></div>
                            
                            <div style="margin-top: 25px; padding: 15px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                                <h4 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 10px;">Expected Format:</h4>
                                <ul style="font-size: 13px; color: #6b7280; line-height: 1.8; margin-left: 20px;">
                                    <li>Customer Code</li>
                                    <li>Customer Name</li>
                                    <li>Mobile Number</li>
                                    <li>Alternate Mobile</li>
                                    <li>Location</li>
                                    <li>Company Name</li>
                                    <li>GST Number</li>
                                    <li>Email</li>
                                    <li>Status</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sale Details Modal -->
        <div class="modal" id="saleDetailsModal">
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Sale Details</h2>
                    <span class="close" onclick="closeSaleDetailsModal()">&times;</span>
                </div>
                <div id="saleDetailsContent">
                    <div class="loading">Loading...</div>
                </div>
            </div>
        </div>

        <!-- New Sale Modal -->
        <div class="modal" id="newSaleModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Add New Sale</h2>
                    <span class="close" onclick="document.getElementById('newSaleModal').classList.remove('show')">&times;</span>
                </div>
                <form id="newSaleForm" onsubmit="submitNewSale(event)">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Customer Code / Contact Number *</label>
                            <input type="text" name="customer_code" required placeholder="Enter customer code or contact">
                        </div>
                        <div class="form-group">
                            <label>Date of Sale *</label>
                            <input type="date" name="sale_date" required>
                        </div>
                        <div class="form-group">
                            <label>Employee Name *</label>
                            <select name="employee_name" required>
                                <option value="">Select Employee</option>
                                <option value="Akash Parashar">Akash Parashar</option>
                                <option value="Mandeep Samal">Mandeep Samal</option>
                                <option value="Smruti Ranjan Nayak">Smruti Ranjan Nayak</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Sale Type *</label>
                            <select name="sale_type" required onchange="calculateSaleTotal()">
                                <option value="">Select Type</option>
                                <option value="With">With GST</option>
                                <option value="Without">Without GST</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Courier Cost</label>
                            <input type="number" name="courier_cost" min="0" step="0.01" value="0" onchange="calculateSaleTotal()" placeholder="0.00">
                        </div>
                        <div class="form-group">
                            <label>Amount Received</label>
                            <input type="number" name="amount_received" min="0" step="0.01" value="0" placeholder="0.00">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>In Account Received *</label>
                            <select name="account_received" required>
                                <option value="">Select Account</option>
                                <option value="IDFC(4828)">IDFC (4828)</option>
                                <option value="IDFC(7455)">IDFC (7455)</option>
                                <option value="Canara">Canara</option>
                                <option value="Cash">Cash</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Payment Reference Number</label>
                            <input type="text" name="payment_reference" placeholder="Enter reference number">
                        </div>
                        <div class="form-group">
                            <label>Remarks</label>
                            <textarea name="remarks" rows="3" placeholder="Add any additional notes"></textarea>
                        </div>
                    </div>

                    <h3 style="margin: 20px 0 15px 0; font-size: 16px; font-weight: 600; color: #374151;">Product Details</h3>
                    <div id="productRows">
                        <!-- Product rows will be added here -->
                    </div>
                    <button type="button" class="btn-add" onclick="addProductRow()">
                        <i class="fas fa-plus"></i> Add Product
                    </button>

                    <div class="total-summary">
                        <div class="total-row">
                            <span>Subtotal:</span>
                            <span id="subtotalDisplay">₹0.00</span>
                        </div>
                        <div class="total-row">
                            <span>Courier Cost:</span>
                            <span id="courierDisplay">₹0.00</span>
                        </div>
                        <div class="total-row">
                            <span>GST (18%):</span>
                            <span id="gstDisplay">₹0.00</span>
                        </div>
                        <div class="total-row final">
                            <span>Total Amount:</span>
                            <span id="totalDisplay">₹0.00</span>
                        </div>
                    </div>

                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 20px;">
                        <i class="fas fa-save"></i> Save Sale
                    </button>
                </form>
            </div>
        </div>

        <!-- Balance Payment Modal -->
        <div class="modal" id="balancePaymentModal">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Update Balance Payment</h2>
                    <span class="close" onclick="document.getElementById('balancePaymentModal').classList.remove('show')">&times;</span>
                </div>
                <form id="balancePaymentForm" onsubmit="submitBalancePayment(event)">
                    <div class="form-group">
                        <label>Order ID *</label>
                        <input type="text" name="order_id" required placeholder="e.g., ORD001">
                    </div>
                    <div class="form-group">
                        <label>Date of Payment *</label>
                        <input type="date" name="payment_date" required>
                    </div>
                    <div class="form-group">
                        <label>Amount *</label>
                        <input type="number" name="amount" min="0" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>In Account Received *</label>
                        <select name="account_received" required>
                            <option value="">Select Account</option>
                            <option value="IDFC(4828)">IDFC (4828)</option>
                            <option value="IDFC(7455)">IDFC (7455)</option>
                            <option value="Canara">Canara</option>
                            <option value="Cash">Cash</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Payment Reference Number</label>
                        <input type="text" name="payment_reference">
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-save"></i> Update Payment
                    </button>
                </form>
            </div>
        </div>

        <!-- New Lead Modal -->
        <div class="modal" id="newLeadModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Add New Lead</h2>
                    <span class="close" onclick="document.getElementById('newLeadModal').classList.remove('show')">&times;</span>
                </div>
                <form id="newLeadForm" onsubmit="submitNewLead(event)">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Customer Code</label>
                            <input type="text" name="customer_code" placeholder="Optional">
                        </div>
                        <div class="form-group">
                            <label>Customer Name *</label>
                            <input type="text" name="customer_name" required>
                        </div>
                        <div class="form-group">
                            <label>Mobile Number *</label>
                            <input type="tel" name="mobile_number" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Alternate Mobile Number</label>
                            <input type="tel" name="alternate_mobile">
                        </div>
                        <div class="form-group">
                            <label>Location</label>
                            <input type="text" name="location">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Company Name</label>
                            <input type="text" name="company_name">
                        </div>
                        <div class="form-group">
                            <label>GST Number</label>
                            <input type="text" name="gst_number">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Email ID</label>
                        <input type="email" name="email">
                    </div>
                    <div class="form-group">
                        <label>Complete Address</label>
                        <textarea name="complete_address" rows="3"></textarea>
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-save"></i> Save Lead
                    </button>
                </form>
            </div>
        </div>

        <!-- Edit Sale Modal -->
        <div class="modal" id="editSaleModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Edit Sale</h2>
                    <span class="close" onclick="document.getElementById('editSaleModal').classList.remove('show')">&times;</span>
                </div>
                <form id="editSaleForm" onsubmit="submitEditSale(event)">
                    <input type="hidden" name="order_id" id="editOrderId">
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Customer Code / Contact Number *</label>
                            <input type="text" name="customer_code" id="editCustomerCode" required placeholder="Enter customer code or contact">
                        </div>
                        <div class="form-group">
                            <label>Date of Sale *</label>
                            <input type="date" name="sale_date" id="editSaleDate" required>
                        </div>
                        <div class="form-group">
                            <label>Employee Name *</label>
                            <select name="employee_name" id="editEmployeeName" required>
                                <option value="">Select Employee</option>
                                <option value="Akash Parashar">Akash Parashar</option>
                                <option value="Mandeep Samal">Mandeep Samal</option>
                                <option value="Smruti Ranjan Nayak">Smruti Ranjan Nayak</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Sale Type *</label>
                            <select name="sale_type" id="editSaleType" required onchange="calculateEditSaleTotal()">
                                <option value="">Select Type</option>
                                <option value="With">With GST</option>
                                <option value="Without">Without GST</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Courier Cost</label>
                            <input type="number" name="courier_cost" id="editCourierCost" min="0" step="0.01" value="0" onchange="calculateEditSaleTotal()" placeholder="0.00">
                        </div>
                        <div class="form-group">
                            <label>Amount Received</label>
                            <input type="number" name="amount_received" id="editAmountReceived" min="0" step="0.01" value="0" placeholder="0.00">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>In Account Received *</label>
                            <select name="account_received" id="editAccountReceived" required>
                                <option value="">Select Account</option>
                                <option value="IDFC(4828)">IDFC (4828)</option>
                                <option value="IDFC(7455)">IDFC (7455)</option>
                                <option value="Canara">Canara</option>
                                <option value="Cash">Cash</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Payment Reference Number</label>
                            <input type="text" name="payment_reference" id="editPaymentReference" placeholder="Enter reference number">
                        </div>
                        <div class="form-group">
                            <label>Remarks</label>
                            <textarea name="remarks" id="editRemarks" rows="3" placeholder="Add any additional notes"></textarea>
                        </div>
                    </div>

                    <h3 style="margin: 20px 0 15px 0; font-size: 16px; font-weight: 600; color: #374151;">Product Details</h3>
                    <div id="editProductRows">
                        <!-- Product rows will be loaded here -->
                    </div>
                    <button type="button" class="btn-add" onclick="addEditProductRow()">
                        <i class="fas fa-plus"></i> Add Product
                    </button>

                    <div class="total-summary">
                        <div class="total-row">
                            <span>Subtotal:</span>
                            <span id="editSubtotalDisplay">₹0.00</span>
                        </div>
                        <div class="total-row">
                            <span>Courier Cost:</span>
                            <span id="editCourierDisplay">₹0.00</span>
                        </div>
                        <div class="total-row">
                            <span>GST (18%):</span>
                            <span id="editGstDisplay">₹0.00</span>
                        </div>
                        <div class="total-row final">
                            <span>Total Amount:</span>
                            <span id="editTotalDisplay">₹0.00</span>
                        </div>
                    </div>

                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 20px;">
                        <i class="fas fa-save"></i> Update Sale
                    </button>
                </form>
            </div>
        </div>

        <!-- Edit Lead Modal -->
        <div class="modal" id="editLeadModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Edit Lead</h2>
                    <span class="close" onclick="document.getElementById('editLeadModal').classList.remove('show')">&times;</span>
                </div>
                <form id="editLeadForm" onsubmit="submitEditLead(event)">
                    <input type="hidden" name="lead_id" id="editLeadId">
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Customer Code</label>
                            <input type="text" name="customer_code" id="editLeadCustomerCode" placeholder="Optional">
                        </div>
                        <div class="form-group">
                            <label>Customer Name *</label>
                            <input type="text" name="customer_name" id="editLeadCustomerName" required>
                        </div>
                        <div class="form-group">
                            <label>Mobile Number *</label>
                            <input type="tel" name="mobile_number" id="editLeadMobileNumber" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Alternate Mobile Number</label>
                            <input type="tel" name="alternate_mobile" id="editLeadAlternateMobile">
                        </div>
                        <div class="form-group">
                            <label>Location</label>
                            <input type="text" name="location" id="editLeadLocation">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Company Name</label>
                            <input type="text" name="company_name" id="editLeadCompanyName">
                        </div>
                        <div class="form-group">
                            <label>GST Number</label>
                            <input type="text" name="gst_number" id="editLeadGstNumber">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Email ID</label>
                        <input type="email" name="email" id="editLeadEmail">
                    </div>
                    <div class="form-group">
                        <label>Complete Address</label>
                        <textarea name="complete_address" id="editLeadCompleteAddress" rows="3"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select name="status" id="editLeadStatus">
                            <option value="New">New</option>
                            <option value="Contacted">Contacted</option>
                            <option value="Qualified">Qualified</option>
                            <option value="Converted">Converted</option>
                            <option value="Lost">Lost</option>
                        </select>
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-save"></i> Update Lead
                    </button>
                </form>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            let paymentChart = null;
            let employeeChart = null;
            let productCount = 0;
            let editProductCount = 0;
            
            // Product Catalog with Categories
            const productCatalog = {
                'A-MDVR': [
                    { name: '4ch 1080p SD Card MDVR (MR9504EC)', code: 'AXG01', weight: 1 },
                    { name: '4ch 1080p HDD MDVR (MR9704C)', code: 'AXG02', weight: 2 },
                    { name: '4ch 1080p SD, 4G, GPS MDVR (MR9504E)', code: 'AXG03', weight: 1 },
                    { name: '4ch 1080p SD, 4G, GPS MDVR (MR9504E-A3)', code: 'AXG73', weight: 1 },
                    { name: '4ch 1080p HDD, 4G, GPS MDVR (MR9704E)', code: 'AXG04', weight: 2 },
                    { name: '4ch 1080p SD, 4G, wifi, GPS MDVR (MA9504ED)', code: 'AXG58', weight: 1 },
                    { name: 'TVS 4ch 1080p SD, 4G, GPS MDVR', code: 'TVS43', weight: 1 },
                    { name: '5ch MDVR SD 4g + GPS + LAN + RS232 + RS485', code: 'AXG46', weight: 1 },
                    { name: '5ch MDVR HDD 4g + GPS + LAN + RS232 + RS485', code: 'AXG47', weight: 2.2 },
                    { name: '8ch HDD 4g+GPS MDVR (MR9708C)', code: 'AXG74', weight: 3 },
                    { name: 'AI MDVR with (DSM + ADAS) (SD+ 4g + GPS)', code: 'AXG38', weight: 2 },
                    { name: 'AI MDVR with (DSM + ADAS) (SD+HDD+ 4g + GPS)', code: 'AXG72', weight: 3 }
                ],
                'B-Monitors & Monitor Kit': [
                    { name: '7" AV Monitor', code: 'AXGAA', weight: 1 },
                    { name: '7" VGA Monitor', code: 'AXGAB', weight: 1 },
                    { name: '7" HDMI Monitor', code: 'AXGB1', weight: 1 },
                    { name: '7inch Heavy Duty VGA Monitor', code: 'AXGAC', weight: 1 },
                    { name: '4inch AV monitor', code: 'AXGAD', weight: 0.6 },
                    { name: '4k Recording monitor kit', code: 'AXGAE', weight: 3 },
                    { name: '720 2ch Recording Monitor Kit', code: 'AXGAF', weight: 3 },
                    { name: '4k Recording monitor kit 4ch', code: 'AXGAG', weight: 2 },
                    { name: '4k Recording monitor kit 2ch', code: 'AXGAH', weight: 2 }
                ],
                'C-Cameras': [
                    { name: '2 MP IR indoor Dome Camera', code: 'AXGBA', weight: 0.4 },
                    { name: '2 MP IR Outdoor Bullet Camera', code: 'AXGBB', weight: 0.4 },
                    { name: '2 MP Heavy Duty Bullet Camera', code: 'AXGBC', weight: 0.5 },
                    { name: '2 MP Heavy Duty Dome Camera', code: 'AXGBD', weight: 0.5 },
                    { name: 'PTZ Camera', code: 'AXGBE', weight: 1 },
                    { name: '4k Monitor Camera', code: 'AXGBF', weight: 0.3 },
                    { name: 'Replacement Bullet Camera 2mp', code: 'AXGBG', weight: 0.3 },
                    { name: 'Replacement Dome Camera 2 mp', code: 'AXGBH', weight: 0.3 },
                    { name: 'Replacement Dome Audio Camera', code: 'AXGBI', weight: 0.3 },
                    { name: 'Reverse Camera', code: 'AXGBJ', weight: 0.3 },
                    { name: '2mp IR Audio Camera', code: 'AXGBK', weight: 0.3 },
                    { name: 'DFMS Camera', code: 'AXGBL', weight: 0.3 },
                    { name: 'ADAS Camera', code: 'AXGBM', weight: 0.3 },
                    { name: 'BSD Camera', code: 'AXGBN', weight: 0.3 },
                    { name: 'MDVR IP Camera 2mp', code: 'AXGBO', weight: 0.3 },
                    { name: '2mp IP Dome Audio Camera', code: 'AXGBP', weight: 0.3 },
                    { name: '2 MP IP Camera', code: 'AXGBQ', weight: 0.3 },
                    { name: '2mp Heavy Duty Dome Camera (Waterproof)', code: 'AXGBR', weight: 0.3 }
                ],
                'D-Dashcam': [
                    { name: '4 Inch 2 Ch Dashcam', code: 'AXGCA', weight: 0.4 },
                    { name: '10 inch 2 Ch Full Touch Dashcam', code: 'AXGCB', weight: 0.75 },
                    { name: '10 inch 2 Ch 4g, GPS, Android Dashcam', code: 'AXGCD', weight: 0.75 },
                    { name: '4k Dashcam 12 inch', code: 'AXGCE', weight: 0.75 },
                    { name: '2k 12 inch Dashcam', code: 'AXGCF', weight: 0.75 },
                    { name: '2ch 4g Dashcam MT95L', code: 'AXGCG', weight: 1 },
                    { name: '3ch 4g Dahscam with Rear Camera (MT95L-A3)', code: 'AXGCH', weight: 1 },
                    { name: '3ch AI Dashcam ADAS + DSM (MT95L-A3)', code: 'AXGCI', weight: 1 },
                    { name: '3ch AI Dashcam ADAS + DSM (MT95C)', code: 'AXGCJ', weight: 1 },
                    { name: '2CH AI Dashcam ADAS+ DSM (C6 Lite)', code: 'AXGCN', weight: 1.25 },
                    { name: 'Wifi Dash Cam', code: 'AXGCK', weight: 0.3 },
                    { name: '4 inch 3 camera Dash Cam', code: 'AXGCL', weight: 0.4 },
                    { name: '4inch Android Dashcam', code: 'AXGCM', weight: 0.5 }
                ],
                'E-GPS': [
                    { name: 'RealTrack GPS', code: 'AXGDA', weight: 0.2 },
                    { name: 'GPS Renewal', code: 'AXGDB', weight: 0 }
                ],
                'F-Storage': [
                    { name: 'Surveillance Grade 64GB SD Card', code: 'AXGEA', weight: 0.05 },
                    { name: 'Surveillance Grade 128GB SD Card', code: 'AXGEB', weight: 0.05 },
                    { name: 'Surveillance Grade 256GB SD Card', code: 'AXGEC', weight: 0.05 },
                    { name: 'Surveillance Grade 512GB SD Card', code: 'AXGED', weight: 0.05 },
                    { name: 'HDD 1 TB', code: 'AXGEE', weight: 0.2 }
                ],
                'G-RFID Tags': [
                    { name: '2.4G RFID Animal Ear Tag', code: 'AXGFA', weight: 0.01 },
                    { name: '2.4G Active Tag (Card Type) HX607', code: 'AXGFB', weight: 0.02 },
                    { name: 'MR 6700A UHF Passive Electronic tag', code: 'AXGFC', weight: 0.02 },
                    { name: 'UHF Windshield Tag MR6740A', code: 'AXGFD', weight: 0.02 }
                ],
                'H-RFID Reader': [
                    { name: '2.4 GHZ RFID Active Reader (Bus)', code: 'AXGGA', weight: 2 },
                    { name: '2.4 GHZ RFID Active Reader (Campus)', code: 'AXGGB', weight: 2.5 },
                    { name: '2.4G IOT Smart RFID Reader (ZR7901P)', code: 'AXGGC', weight: 2 },
                    { name: '2.4 G-Hz Omni-directional RFID Reader (MR3102E)', code: 'AXGGD', weight: 2 },
                    { name: 'RFID UHF Long Range Integrated Reader (MR6211E)', code: 'AXGGE', weight: 2 }
                ],
                'I-MDVR Accessories': [
                    { name: 'MDVR Loud Audio Speaker', code: 'AXGHA', weight: 0.5 },
                    { name: '2 way Communication Device', code: 'AXGHB', weight: 0.2 },
                    { name: 'MDVR Maintenance Tool', code: 'AXGHC', weight: 0.1 },
                    { name: 'MDVR Remote', code: 'AXGHD', weight: 0.1 },
                    { name: 'MDVR Panic Button', code: 'AXGHE', weight: 0.1 },
                    { name: 'MDVR Server', code: 'AXGHF', weight: 2 },
                    { name: 'RS 232 Adaptor', code: 'AXGHG', weight: 0.1 },
                    { name: '5mt Cable', code: 'AXGHH', weight: 0.3 },
                    { name: '15mt Cable', code: 'AXGHI', weight: 0.8 },
                    { name: '10mt Cable', code: 'AXGHJ', weight: 0.6 },
                    { name: 'VGA Cable', code: 'AXGHK', weight: 0.2 },
                    { name: 'Alcohol Tester', code: 'AXGHL', weight: 1 },
                    { name: 'Ultra Sonic Fuel Sensor', code: 'AXGHM', weight: 0.5 },
                    { name: 'Rod Type Fuel Sensor', code: 'AXGHQ', weight: 0.5 },
                    { name: '1mt Cable', code: 'AXGHN', weight: 0.2 },
                    { name: '3mt Cable', code: 'AXGHO', weight: 0.3 },
                    { name: 'Panic Button', code: 'AXGHP', weight: 0.1 },
                    { name: 'Male Connector', code: 'AXGHR', weight: 0.05 }
                ],
                'J-Other Products': [
                    { name: 'Courier', code: 'AXGIA', weight: 0 },
                    { name: 'Leaser Printer', code: 'AXGIB', weight: 5 },
                    { name: 'D link Wire Bundle', code: 'AXGIC', weight: 1 },
                    { name: 'Wireless Receiver Transmitter', code: 'AXGID', weight: 0.5 },
                    { name: 'Parking Sensor', code: 'AXGIE', weight: 1 },
                    { name: 'MDVR Installation', code: 'AXGIF', weight: 0 },
                    { name: 'GPS Installation', code: 'AXGIG', weight: 0 },
                    { name: 'Annual Maintenance Charges', code: 'AXGIH', weight: 0 }
                ]
            };

            // Set today's date as default
            document.addEventListener('DOMContentLoaded', () => {
                const today = new Date().toISOString().split('T')[0];
                document.querySelectorAll('input[type="date"]').forEach(input => {
                    if (!input.value) input.value = today;
                });
                loadDashboard();
                addProductRow(); // Add first product row
            });

            // Toggle Sidebar
            function toggleSidebar() {
                const sidebar = document.getElementById('sidebar');
                const mainContent = document.getElementById('mainContent');
                sidebar.classList.toggle('open');
                mainContent.classList.toggle('shifted');
            }

            // Show Page
            function showPage(pageName) {
                // Close sidebar
                const sidebar = document.getElementById('sidebar');
                const mainContent = document.getElementById('mainContent');
                sidebar.classList.remove('open');
                mainContent.classList.remove('shifted');
                
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
            }

            // Toggle Action Menu
            function toggleActionMenu() {
                const menu = document.getElementById('actionMenu');
                menu.classList.toggle('show');
            }

            // Close action menu when clicking outside
            document.addEventListener('click', (e) => {
                const menu = document.getElementById('actionMenu');
                const button = e.target.closest('.btn-primary');
                if (!button && !menu.contains(e.target)) {
                    menu.classList.remove('show');
                }
            });

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
                    case 'leads':
                        loadLeads();
                        break;
                }
            }

            // Load Dashboard
            async function loadDashboard() {
                try {
                    // Load monthly totals
                    loadMonthlyTotals();
                    
                    const response = await axios.get('/api/dashboard/summary');
                    const { employeeSales, paymentStatusData, monthlySummary } = response.data.data;
                    
                    // Render employee cards
                    const grid = document.getElementById('employeeSalesGrid');
                    grid.innerHTML = employeeSales.map(emp => \`
                        <div class="employee-card">
                            <h3>\${emp.employee_name}</h3>
                            <div class="value">₹\${emp.total_revenue.toLocaleString()}</div>
                            <div class="sub-value">\${emp.total_sales} sales | Balance: ₹\${emp.total_balance.toLocaleString()}</div>
                        </div>
                    \`).join('');
                    
                    // Render charts
                    renderEmployeeChart(employeeSales);
                    renderPaymentChart(paymentStatusData);
                    
                    // Load sales table
                    loadSalesTable();
                } catch (error) {
                    console.error('Error loading dashboard:', error);
                }
            }
            
            // Load Monthly Totals
            async function loadMonthlyTotals() {
                try {
                    const response = await axios.get('/api/sales/monthly-total');
                    const data = response.data.data;
                    
                    document.getElementById('monthlyTotalCard').style.display = 'none';
                    document.getElementById('monthlyTotalContent').style.display = 'block';
                    
                    document.getElementById('totalSalesCount').textContent = data.total_sales || 0;
                    document.getElementById('totalRevenue').textContent = '₹' + (data.total_revenue || 0).toLocaleString();
                    document.getElementById('totalWithoutTax').textContent = '₹' + (data.total_without_tax || 0).toLocaleString();
                    document.getElementById('totalReceived').textContent = '₹' + (data.total_received || 0).toLocaleString();
                    document.getElementById('totalBalance').textContent = '₹' + (data.total_balance || 0).toLocaleString();
                } catch (error) {
                    console.error('Error loading monthly totals:', error);
                    document.getElementById('monthlyTotalCard').textContent = 'Failed to load monthly totals';
                }
            }

            // Render Employee Chart
            function renderEmployeeChart(data) {
                const ctx = document.getElementById('employeeChart').getContext('2d');
                
                if (employeeChart) {
                    employeeChart.destroy();
                }
                
                const labels = data.map(d => d.employee_name);
                const values = data.map(d => d.total_revenue);
                
                employeeChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Total Revenue (₹)',
                            data: values,
                            backgroundColor: 'rgba(102, 126, 234, 0.8)',
                            borderColor: 'rgba(102, 126, 234, 1)',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        return '₹' + value.toLocaleString();
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Render Payment Chart
            function renderPaymentChart(data) {
                const ctx = document.getElementById('paymentChart').getContext('2d');
                
                if (paymentChart) {
                    paymentChart.destroy();
                }
                
                const labels = data.map(d => d.status);
                const values = data.map(d => d.count);
                const colors = ['#10b981', '#f59e0b', '#ef4444'];
                
                paymentChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: values,
                            backgroundColor: colors,
                            borderWidth: 3,
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
                    if (!sales || sales.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="15" style="text-align: center; color: #6b7280;">No sales found for current month</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = sales.map(sale => {
                        const items = sale.items || [];
                        const products = items.length > 0 
                            ? items.map(item => \`\${item.product_name} (x\${item.quantity})\`).join(', ')
                            : 'No products';
                        const payments = sale.payments ? sale.payments.length : 0;
                        
                        return \`
                        <tr>
                            <td>
                                <button class="btn-view" onclick="viewSaleDetails('\${sale.order_id}')" title="View Full Details">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </td>
                            <td><strong>\${sale.order_id}</strong></td>
                            <td>\${new Date(sale.sale_date).toLocaleDateString()}</td>
                            <td>\${sale.customer_name || sale.customer_code}</td>
                            <td>\${sale.company_name || '-'}</td>
                            <td>\${sale.employee_name}</td>
                            <td><small>\${products}</small></td>
                            <td><span class="badge \${sale.sale_type === 'With' ? 'badge-success' : 'badge-warning'}">\${sale.sale_type} GST</span></td>
                            <td>₹\${sale.subtotal.toLocaleString()}</td>
                            <td>₹\${sale.gst_amount.toLocaleString()}</td>
                            <td>₹\${sale.total_amount.toLocaleString()}</td>
                            <td>₹\${sale.amount_received.toLocaleString()}</td>
                            <td>\${sale.balance_amount > 0 ? '<span style="color: #dc2626; font-weight: 600;">₹' + sale.balance_amount.toLocaleString() + '</span>' : '<span class="badge badge-success">Paid</span>'}</td>
                            <td><small>\${payments} payment(s)</small></td>
                            <td>
                                \${sale.balance_amount > 0 ? '<button class="btn-update" onclick="openUpdateBalanceModal(\\'' + sale.order_id + '\\')" title="Update Balance Payment"><i class="fas fa-money-bill-wave"></i></button>' : '-'}
                            </td>
                        </tr>
                    \`;
                    }).join('');
                } catch (error) {
                    console.error('Error loading sales:', error);
                    const tbody = document.getElementById('salesTableBody');
                    tbody.innerHTML = '<tr><td colspan="15" style="text-align: center; color: #dc2626;">Error loading sales data: ' + error.message + '</td></tr>';
                }
            }

            // Product Row Management
            function addProductRow() {
                if (productCount >= 10) {
                    alert('Maximum 10 products allowed');
                    return;
                }
                
                productCount++;
                const container = document.getElementById('productRows');
                const row = document.createElement('div');
                row.className = 'product-row';
                row.id = \`product-\${productCount}\`;
                row.innerHTML = \`
                    <div class="form-group" style="margin: 0;">
                        <label>Category</label>
                        <select class="product-category" onchange="updateProductOptions(\${productCount})">
                            <option value="">Select Category</option>
                            <option value="A-MDVR">MDVR</option>
                            <option value="B-Monitors & Monitor Kit">Monitors & Monitor Kit</option>
                            <option value="C-Cameras">Cameras</option>
                            <option value="D-Dashcam">Dashcam</option>
                            <option value="E-GPS">GPS</option>
                            <option value="F-Storage">Storage</option>
                            <option value="G-RFID Tags">RFID Tags</option>
                            <option value="H-RFID Reader">RFID Reader</option>
                            <option value="I-MDVR Accessories">MDVR Accessories</option>
                            <option value="J-Other Products">Other Products</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Product Name</label>
                        <select class="product-name" name="items[\${productCount}][product_name]" data-weight="0" onchange="calculateSaleTotal()">
                            <option value="">Select Category First</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Quantity</label>
                        <input type="number" name="items[\${productCount}][quantity]" min="0" value="0" onchange="calculateSaleTotal()">
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Unit Price</label>
                        <input type="number" name="items[\${productCount}][unit_price]" min="0" step="0.01" value="0" onchange="calculateSaleTotal()">
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Total</label>
                        <input type="number" class="product-total" readonly style="background: #f3f4f6;" value="0">
                    </div>
                    <button type="button" class="btn-remove" onclick="removeProductRow(\${productCount})">
                        <i class="fas fa-times"></i>
                    </button>
                \`;
                container.appendChild(row);
            }
            
            function updateProductOptions(rowId) {
                const row = document.getElementById(\`product-\${rowId}\`);
                const categorySelect = row.querySelector('.product-category');
                const productSelect = row.querySelector('.product-name');
                const category = categorySelect.value;
                
                // Clear product selection
                productSelect.innerHTML = '<option value="">Select Product</option>';
                
                if (category && productCatalog[category]) {
                    productCatalog[category].forEach(product => {
                        const option = document.createElement('option');
                        option.value = product.code;
                        option.textContent = product.name;
                        option.dataset.weight = product.weight;
                        productSelect.appendChild(option);
                    });
                }
                
                calculateSaleTotal();
            }

            function removeProductRow(id) {
                const row = document.getElementById(\`product-\${id}\`);
                if (row) {
                    row.remove();
                    productCount--;
                    calculateSaleTotal();
                }
            }

            function calculateSaleTotal() {
                const form = document.getElementById('newSaleForm');
                const saleType = form.sale_type.value;
                const courierCost = parseFloat(form.courier_cost.value) || 0;
                
                let subtotal = 0;
                
                // Calculate from product rows
                document.querySelectorAll('.product-row').forEach((row, index) => {
                    const qty = parseFloat(row.querySelector('input[name*="quantity"]').value) || 0;
                    const price = parseFloat(row.querySelector('input[name*="unit_price"]').value) || 0;
                    const total = qty * price;
                    
                    row.querySelector('.product-total').value = total.toFixed(2);
                    subtotal += total;
                });
                
                const gstAmount = saleType === 'With' ? (subtotal + courierCost) * 0.18 : 0;
                const totalAmount = subtotal + courierCost + gstAmount;
                
                document.getElementById('subtotalDisplay').textContent = '₹' + subtotal.toFixed(2);
                document.getElementById('courierDisplay').textContent = '₹' + courierCost.toFixed(2);
                document.getElementById('gstDisplay').textContent = '₹' + gstAmount.toFixed(2);
                document.getElementById('totalDisplay').textContent = '₹' + totalAmount.toFixed(2);
            }

            // Modal Functions
            function openNewSaleModal() {
                document.getElementById('newSaleModal').classList.add('show');
                document.getElementById('actionMenu').classList.remove('show');
            }

            function closeNewSaleModal() {
                document.getElementById('newSaleModal').classList.remove('show');
                document.getElementById('newSaleForm').reset();
                document.getElementById('productRows').innerHTML = '';
                productCount = 0;
                addProductRow();
            }

            function openBalancePaymentModal() {
                document.getElementById('balancePaymentModal').classList.add('show');
                document.getElementById('actionMenu').classList.remove('show');
            }

            function closeBalancePaymentModal() {
                document.getElementById('balancePaymentModal').classList.remove('show');
                document.getElementById('balancePaymentForm').reset();
            }

            function openNewLeadModal() {
                document.getElementById('newLeadModal').classList.add('show');
                document.getElementById('actionMenu').classList.remove('show');
            }

            function closeNewLeadModal() {
                document.getElementById('newLeadModal').classList.remove('show');
                document.getElementById('newLeadForm').reset();
            }

            // View Sale Details
            async function viewSaleDetails(orderId) {
                try {
                    const modal = document.getElementById('saleDetailsModal');
                    const content = document.getElementById('saleDetailsContent');
                    
                    modal.classList.add('show');
                    content.innerHTML = '<div class="loading">Loading...</div>';
                    
                    const response = await axios.get(\`/api/sales/order/\${orderId}\`);
                    const sale = response.data.data;
                    
                    const productsTable = sale.items.map(item => \`
                        <tr>
                            <td>\${item.product_name}</td>
                            <td>\${item.product_code || '-'}</td>
                            <td>\${item.quantity}</td>
                            <td>₹\${item.unit_price.toLocaleString()}</td>
                            <td>₹\${item.total_price.toLocaleString()}</td>
                        </tr>
                    \`).join('');
                    
                    const paymentsTable = sale.payments.map(payment => \`
                        <tr>
                            <td>\${new Date(payment.payment_date).toLocaleDateString()}</td>
                            <td>₹\${payment.amount.toLocaleString()}</td>
                            <td>\${payment.payment_reference || '-'}</td>
                            <td>\${payment.account_received || '-'}</td>
                        </tr>
                    \`).join('');
                    
                    content.innerHTML = \`
                        <div style="margin-bottom: 20px;">
                            <div class="form-row">
                                <div class="form-group">
                                    <label style="font-weight: 600; color: #6b7280; margin-bottom: 5px;">Order ID</label>
                                    <div style="font-size: 16px; font-weight: 600;">\${sale.order_id}</div>
                                </div>
                                <div class="form-group">
                                    <label style="font-weight: 600; color: #6b7280; margin-bottom: 5px;">Date</label>
                                    <div>\${new Date(sale.sale_date).toLocaleDateString()}</div>
                                </div>
                                <div class="form-group">
                                    <label style="font-weight: 600; color: #6b7280; margin-bottom: 5px;">Customer Name</label>
                                    <div>\${sale.customer_name || sale.customer_code}</div>
                                </div>
                                <div class="form-group">
                                    <label style="font-weight: 600; color: #6b7280; margin-bottom: 5px;">Company Name</label>
                                    <div>\${sale.company_name || '-'}</div>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label style="font-weight: 600; color: #6b7280; margin-bottom: 5px;">Employee</label>
                                    <div>\${sale.employee_name}</div>
                                </div>
                                <div class="form-group">
                                    <label style="font-weight: 600; color: #6b7280; margin-bottom: 5px;">Contact</label>
                                    <div>\${sale.customer_contact || '-'}</div>
                                </div>
                                <div class="form-group">
                                    <label style="font-weight: 600; color: #6b7280; margin-bottom: 5px;">Sale Type</label>
                                    <div><span class="badge \${sale.sale_type === 'With' ? 'badge-success' : 'badge-warning'}">\${sale.sale_type} GST</span></div>
                                </div>
                            </div>
                        </div>
                        
                        <h3 style="font-size: 16px; font-weight: 600; margin: 20px 0 10px; color: #1f2937;">Products</h3>
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product Name</th>
                                        <th>Product Code</th>
                                        <th>Quantity</th>
                                        <th>Unit Price</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${productsTable}
                                </tbody>
                            </table>
                        </div>
                        
                        <h3 style="font-size: 16px; font-weight: 600; margin: 20px 0 10px; color: #1f2937;">Payment Summary</h3>
                        <div class="form-row" style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                            <div class="form-group">
                                <label style="font-weight: 600; color: #6b7280;">Subtotal</label>
                                <div style="font-size: 16px;">₹\${sale.subtotal.toLocaleString()}</div>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #6b7280;">Courier Cost</label>
                                <div style="font-size: 16px;">₹\${sale.courier_cost.toLocaleString()}</div>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #6b7280;">GST (18%)</label>
                                <div style="font-size: 16px;">₹\${sale.gst_amount.toLocaleString()}</div>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #6b7280;">Total Amount</label>
                                <div style="font-size: 18px; font-weight: 600; color: #667eea;">₹\${sale.total_amount.toLocaleString()}</div>
                            </div>
                        </div>
                        
                        <div class="form-row" style="background: \${sale.balance_amount > 0 ? '#fef3c7' : '#d1fae5'}; padding: 15px; border-radius: 8px;">
                            <div class="form-group">
                                <label style="font-weight: 600; color: #6b7280;">Amount Received</label>
                                <div style="font-size: 16px; color: #10b981; font-weight: 600;">₹\${sale.amount_received.toLocaleString()}</div>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #6b7280;">Balance Amount</label>
                                <div style="font-size: 18px; font-weight: 700; color: \${sale.balance_amount > 0 ? '#dc2626' : '#10b981'};">
                                    \${sale.balance_amount > 0 ? '₹' + sale.balance_amount.toLocaleString() : 'PAID'}
                                </div>
                            </div>
                        </div>
                        
                        <h3 style="font-size: 16px; font-weight: 600; margin: 20px 0 10px; color: #1f2937;">Payment History (\${sale.payments.length} payment(s))</h3>
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Amount</th>
                                        <th>Reference</th>
                                        <th>Account</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${paymentsTable || '<tr><td colspan="4" style="text-align: center; color: #9ca3af;">No payments recorded</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                        
                        \${sale.remarks ? '<div style="margin-top: 15px;"><label style="font-weight: 600; color: #6b7280;">Remarks:</label><div style="padding: 10px; background: #f9fafb; border-radius: 6px; margin-top: 5px;">' + sale.remarks + '</div></div>' : ''}
                    \`;
                } catch (error) {
                    console.error('Error loading sale details:', error);
                    alert('Error loading sale details');
                }
            }
            
            function closeSaleDetailsModal() {
                document.getElementById('saleDetailsModal').classList.remove('show');
            }
            
            // Open Update Balance Modal with pre-filled Order ID
            function openUpdateBalanceModal(orderId) {
                openBalancePaymentModal();
                document.getElementById('balancePaymentForm').order_id.value = orderId;
            }

            // Courier Calculation Functions
            let courierProductCount = 0;
            
            function addCourierProductRow() {
                courierProductCount++;
                const container = document.getElementById('courierProductRows');
                const row = document.createElement('div');
                row.className = 'product-row';
                row.id = \`courier-product-\${courierProductCount}\`;
                row.innerHTML = \`
                    <div class="form-group" style="margin: 0;">
                        <label>Category</label>
                        <select class="courier-category" onchange="updateCourierProductOptions(\${courierProductCount})">
                            <option value="">Select Category</option>
                            <option value="A-MDVR">MDVR</option>
                            <option value="B-Monitors & Monitor Kit">Monitors & Monitor Kit</option>
                            <option value="C-Cameras">Cameras</option>
                            <option value="D-Dashcam">Dashcam</option>
                            <option value="E-GPS">GPS</option>
                            <option value="F-Storage">Storage</option>
                            <option value="G-RFID Tags">RFID Tags</option>
                            <option value="H-RFID Reader">RFID Reader</option>
                            <option value="I-MDVR Accessories">MDVR Accessories</option>
                            <option value="J-Other Products">Other Products</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Product</label>
                        <select class="courier-product" onchange="calculateCourierCost()">
                            <option value="">Select Category First</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Quantity</label>
                        <input type="number" class="courier-quantity" min="0" value="1" onchange="calculateCourierCost()">
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Weight (kg)</label>
                        <input type="number" class="courier-weight" readonly style="background: #f9fafb;" value="0" step="0.01">
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Total Weight</label>
                        <input type="number" class="courier-total-weight" readonly style="background: #f3f4f6;" value="0" step="0.01">
                    </div>
                    <button type="button" class="btn-remove" onclick="removeCourierProductRow(\${courierProductCount})">
                        <i class="fas fa-times"></i>
                    </button>
                \`;
                container.appendChild(row);
            }
            
            function updateCourierProductOptions(rowId) {
                const row = document.getElementById(\`courier-product-\${rowId}\`);
                const categorySelect = row.querySelector('.courier-category');
                const productSelect = row.querySelector('.courier-product');
                const category = categorySelect.value;
                
                productSelect.innerHTML = '<option value="">Select Product</option>';
                
                if (category && productCatalog[category]) {
                    productCatalog[category].forEach(product => {
                        const option = document.createElement('option');
                        option.value = product.code;
                        option.textContent = product.name;
                        option.dataset.weight = product.weight;
                        productSelect.appendChild(option);
                    });
                }
                
                calculateCourierCost();
            }
            
            function removeCourierProductRow(id) {
                const row = document.getElementById(\`courier-product-\${id}\`);
                if (row) {
                    row.remove();
                    courierProductCount--;
                    calculateCourierCost();
                }
            }
            
            function calculateCourierCost() {
                const company = document.getElementById('courierCompany').value;
                const mode = document.getElementById('courierMode').value;
                
                let totalWeight = 0;
                
                // Calculate total weight from all product rows
                document.querySelectorAll('#courierProductRows .product-row').forEach(row => {
                    const productSelect = row.querySelector('.courier-product');
                    const quantityInput = row.querySelector('.courier-quantity');
                    const weightInput = row.querySelector('.courier-weight');
                    const totalWeightInput = row.querySelector('.courier-total-weight');
                    
                    const selectedOption = productSelect.options[productSelect.selectedIndex];
                    const unitWeight = parseFloat(selectedOption.dataset.weight) || 0;
                    const quantity = parseFloat(quantityInput.value) || 0;
                    const itemTotalWeight = unitWeight * quantity;
                    
                    weightInput.value = unitWeight.toFixed(2);
                    totalWeightInput.value = itemTotalWeight.toFixed(2);
                    totalWeight += itemTotalWeight;
                });
                
                // Calculate rate per kg based on company and mode
                let ratePerKg = 0;
                
                if (company === 'Trackon') {
                    if (mode === 'Air') {
                        ratePerKg = 110;
                    } else if (mode === 'Surface') {
                        ratePerKg = 90;
                    }
                }
                
                // Calculate costs
                const baseCost = totalWeight * ratePerKg;
                const fuelCharge = baseCost * 0.10; // 10% fuel charge
                const totalCost = baseCost + fuelCharge;
                
                // Update display
                document.getElementById('courierTotalWeight').textContent = totalWeight.toFixed(2) + ' kg';
                document.getElementById('courierRatePerKg').textContent = '₹' + ratePerKg;
                document.getElementById('courierBaseCost').textContent = '₹' + baseCost.toFixed(2);
                document.getElementById('courierFuelCharge').textContent = '₹' + fuelCharge.toFixed(2);
                document.getElementById('courierTotalCost').textContent = '₹' + totalCost.toFixed(2);
            }

            // Submit New Sale
            async function submitNewSale(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                
                // Build items array
                const items = [];
                document.querySelectorAll('.product-row').forEach((row) => {
                    const productSelect = row.querySelector('select[name*="product_name"]');
                    const productName = productSelect.options[productSelect.selectedIndex].text;
                    const qty = parseFloat(row.querySelector('input[name*="quantity"]').value) || 0;
                    const price = parseFloat(row.querySelector('input[name*="unit_price"]').value) || 0;
                    
                    if (productSelect.value && qty > 0 && price > 0) {
                        items.push({
                            product_name: productName,
                            quantity: qty,
                            unit_price: price
                        });
                    }
                });
                
                if (items.length === 0) {
                    alert('Please add at least one product');
                    return;
                }
                
                const data = {
                    customer_code: formData.get('customer_code'),
                    customer_contact: formData.get('customer_contact'),
                    sale_date: formData.get('sale_date'),
                    employee_name: formData.get('employee_name'),
                    sale_type: formData.get('sale_type'),
                    courier_cost: parseFloat(formData.get('courier_cost')) || 0,
                    amount_received: parseFloat(formData.get('amount_received')) || 0,
                    account_received: formData.get('account_received'),
                    payment_reference: formData.get('payment_reference'),
                    remarks: formData.get('remarks'),
                    items: items
                };
                
                try {
                    const response = await axios.post('/api/sales', data);
                    
                    if (response.data.success) {
                        alert(\`Sale added successfully! Order ID: \${response.data.data.order_id}\`);
                        closeNewSaleModal();
                        loadDashboard();
                    }
                } catch (error) {
                    alert('Error adding sale: ' + (error.response?.data?.error || error.message));
                }
            }

            // Submit Balance Payment
            async function submitBalancePayment(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                
                const data = {
                    order_id: formData.get('order_id'),
                    payment_date: formData.get('payment_date'),
                    amount: parseFloat(formData.get('amount')),
                    account_received: formData.get('account_received'),
                    payment_reference: formData.get('payment_reference')
                };
                
                try {
                    const response = await axios.post('/api/sales/balance-payment', data);
                    
                    if (response.data.success) {
                        alert('Payment updated successfully!');
                        document.getElementById('balancePaymentModal').classList.remove('show');
                        loadBalancePayments();
                        loadDashboard();
                    }
                } catch (error) {
                    alert('Error updating payment: ' + (error.response?.data?.error || error.message));
                }
            }

            // Submit New Lead
            async function submitNewLead(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                
                const data = {
                    customer_code: formData.get('customer_code'),
                    customer_name: formData.get('customer_name'),
                    mobile_number: formData.get('mobile_number'),
                    alternate_mobile: formData.get('alternate_mobile'),
                    location: formData.get('location'),
                    company_name: formData.get('company_name'),
                    gst_number: formData.get('gst_number'),
                    email: formData.get('email'),
                    complete_address: formData.get('complete_address')
                };
                
                try {
                    const response = await axios.post('/api/leads', data);
                    
                    if (response.data.success) {
                        alert('Lead added successfully!');
                        document.getElementById('newLeadModal').classList.remove('show');
                        loadLeads();
                    }
                } catch (error) {
                    alert('Error adding lead: ' + (error.response?.data?.error || error.message));
                }
            }

            // Load other pages (simplified versions)
            async function loadCustomers() {
                // Similar implementation
            }

            async function loadCurrentMonthSales() {
                try {
                    const response = await axios.get('/api/sales/current-month');
                    const sales = response.data.data;
                    
                    const tbody = document.getElementById('currentMonthTableBody');
                    tbody.innerHTML = sales.map(sale => {
                        const items = sale.items || [];
                        const itemsDisplay = items.length > 0 
                            ? items.map(item => \`
                                <div style="margin: 2px 0;">
                                    • \${item.product_name} (Qty: \${item.quantity} @ ₹\${item.unit_price})
                                </div>
                            \`).join('')
                            : 'No products';
                        
                        return \`
                        <tr onclick="viewSaleDetails('\${sale.order_id}')" style="cursor: pointer;">
                            <td><strong>\${sale.order_id}</strong></td>
                            <td>\${new Date(sale.sale_date).toLocaleDateString()}</td>
                            <td>
                                <div style="font-weight: 600;">\${sale.customer_code}</div>
                                <div style="font-size: 12px; color: #6b7280;">\${sale.company_name || 'N/A'}</div>
                            </td>
                            <td>\${sale.employee_name}</td>
                            <td>
                                <div style="font-size: 12px; color: #374151;">
                                    \${itemsDisplay}
                                </div>
                            </td>
                            <td style="font-weight: 600;">₹\${sale.total_amount.toLocaleString()}</td>
                            <td style="color: \${sale.balance_amount > 0 ? '#dc2626' : '#10b981'}; font-weight: 600;">
                                ₹\${sale.balance_amount.toLocaleString()}
                            </td>
                        </tr>
                        \`;
                    }).join('');
                } catch (error) {
                    console.error('Error loading current month sales:', error);
                    const tbody = document.getElementById('currentMonthTableBody');
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #dc2626;">Error loading sales</td></tr>';
                }
            }

            async function loadAllSales() {
                try {
                    const response = await axios.get('/api/sales');
                    const sales = response.data.data;
                    
                    const tbody = document.getElementById('allSalesTableBody');
                    tbody.innerHTML = sales.map(sale => \`
                        <tr>
                            <td><strong>\${sale.order_id}</strong></td>
                            <td>\${new Date(sale.sale_date).toLocaleDateString()}</td>
                            <td>\${sale.customer_code}</td>
                            <td>\${sale.employee_name}</td>
                            <td><span class="badge \${sale.sale_type === 'With' ? 'badge-success' : 'badge-warning'}">\${sale.sale_type} GST</span></td>
                            <td>₹\${sale.total_amount.toLocaleString()}</td>
                            <td>₹\${sale.balance_amount.toLocaleString()}</td>
                            <td>
                                <button class="btn-primary" style="padding: 5px 12px; font-size: 12px;" onclick="editSale('\${sale.order_id}')">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                            </td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading all sales:', error);
                }
            }

            async function loadBalancePayments() {
                try {
                    const response = await axios.get('/api/sales/balance-payments');
                    const sales = response.data.data;
                    
                    const tbody = document.getElementById('balancePaymentTableBody');
                    tbody.innerHTML = sales.map(sale => \`
                        <tr>
                            <td><strong>\${sale.order_id}</strong></td>
                            <td>\${new Date(sale.sale_date).toLocaleDateString()}</td>
                            <td>\${sale.customer_code}</td>
                            <td>\${sale.employee_name}</td>
                            <td>\${sale.customer_contact || 'N/A'}</td>
                            <td>₹\${sale.total_amount.toLocaleString()}</td>
                            <td>₹\${sale.amount_received.toLocaleString()}</td>
                            <td style="color: #dc2626; font-weight: 600;">₹\${sale.balance_amount.toLocaleString()}</td>
                            <td><button class="btn-primary" style="padding: 5px 10px; font-size: 12px;" onclick="updatePaymentFor('\${sale.order_id}')">Update</button></td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading balance payments:', error);
                }
            }

            function updatePaymentFor(orderId) {
                openBalancePaymentModal();
                document.querySelector('#balancePaymentForm input[name="order_id"]').value = orderId;
            }

            async function loadLeads() {
                try {
                    const response = await axios.get('/api/leads');
                    const leads = response.data.data;
                    
                    const tbody = document.getElementById('leadsTableBody');
                    tbody.innerHTML = leads.map(lead => \`
                        <tr>
                            <td>\${lead.customer_code || 'N/A'}</td>
                            <td>\${lead.customer_name}</td>
                            <td>\${lead.mobile_number}</td>
                            <td>\${lead.alternate_mobile || 'N/A'}</td>
                            <td>\${lead.location || 'N/A'}</td>
                            <td>\${lead.company_name || 'N/A'}</td>
                            <td>\${lead.gst_number || 'N/A'}</td>
                            <td>\${lead.email || 'N/A'}</td>
                            <td><span class="badge badge-success">\${lead.status}</span></td>
                            <td>\${new Date(lead.created_at).toLocaleDateString()}</td>
                            <td>
                                <button class="btn-primary" style="padding: 5px 12px; font-size: 12px;" onclick="editLead(\${lead.id})">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                            </td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading leads:', error);
                }
            }

            async function searchOrder() {
                const orderId = document.getElementById('searchOrderId').value.trim();
                if (!orderId) {
                    alert('Please enter an Order ID');
                    return;
                }
                
                try {
                    const response = await axios.get(\`/api/sales/order/\${orderId}\`);
                    const sale = response.data.data;
                    
                    const products = sale.items.map(item => \`
                        <tr>
                            <td>\${item.product_name}</td>
                            <td>\${item.quantity}</td>
                            <td>₹\${item.unit_price.toLocaleString()}</td>
                            <td>₹\${item.total_price.toLocaleString()}</td>
                        </tr>
                    \`).join('');
                    
                    const payments = sale.payments.map(p => \`
                        <tr>
                            <td>\${new Date(p.payment_date).toLocaleDateString()}</td>
                            <td>₹\${p.amount.toLocaleString()}</td>
                            <td>\${p.payment_reference || 'N/A'}</td>
                        </tr>
                    \`).join('');
                    
                    document.getElementById('orderResult').innerHTML = \`
                        <div class="card" style="background: #f9fafb;">
                            <h3 style="margin-bottom: 15px; color: #1f2937;">Order Details</h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                                <div><strong>Order ID:</strong> \${sale.order_id}</div>
                                <div><strong>Date:</strong> \${new Date(sale.sale_date).toLocaleDateString()}</div>
                                <div><strong>Customer:</strong> \${sale.customer_code}</div>
                                <div><strong>Contact:</strong> \${sale.customer_contact || 'N/A'}</div>
                                <div><strong>Employee:</strong> \${sale.employee_name}</div>
                                <div><strong>Sale Type:</strong> \${sale.sale_type} GST</div>
                                <div><strong>Subtotal:</strong> ₹\${sale.subtotal.toLocaleString()}</div>
                                <div><strong>Courier:</strong> ₹\${sale.courier_cost.toLocaleString()}</div>
                                <div><strong>GST:</strong> ₹\${sale.gst_amount.toLocaleString()}</div>
                                <div><strong>Total:</strong> ₹\${sale.total_amount.toLocaleString()}</div>
                                <div><strong>Received:</strong> ₹\${sale.amount_received.toLocaleString()}</div>
                                <div><strong>Balance:</strong> ₹\${sale.balance_amount.toLocaleString()}</div>
                                <div><strong>Account:</strong> \${sale.account_received || 'N/A'}</div>
                                <div><strong>Remarks:</strong> \${sale.remarks || 'N/A'}</div>
                            </div>
                            
                            <h4 style="margin: 15px 0 10px; color: #374151;">Products</h4>
                            <table style="width: 100%; margin-bottom: 20px;">
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Quantity</th>
                                        <th>Unit Price</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>\${products}</tbody>
                            </table>
                            
                            <h4 style="margin: 15px 0 10px; color: #374151;">Payment History</h4>
                            <table style="width: 100%;">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Amount</th>
                                        <th>Reference</th>
                                    </tr>
                                </thead>
                                <tbody>\${payments}</tbody>
                            </table>
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

            // Edit Sale Functions
            async function editSale(orderId) {
                try {
                    const response = await axios.get(\`/api/sales/\${orderId}\`);
                    const sale = response.data.data;
                    
                    // Populate form fields
                    document.getElementById('editOrderId').value = sale.order_id;
                    document.getElementById('editCustomerCode').value = sale.customer_code;
                    document.getElementById('editSaleDate').value = sale.sale_date.split('T')[0];
                    document.getElementById('editEmployeeName').value = sale.employee_name;
                    document.getElementById('editSaleType').value = sale.sale_type;
                    document.getElementById('editCourierCost').value = sale.courier_cost || 0;
                    document.getElementById('editAmountReceived').value = sale.amount_received || 0;
                    document.getElementById('editAccountReceived').value = sale.account_received;
                    document.getElementById('editPaymentReference').value = sale.payment_reference || '';
                    document.getElementById('editRemarks').value = sale.remarks || '';
                    
                    // Load products
                    const itemsResponse = await axios.get(\`/api/sales/\${orderId}/items\`);
                    const items = itemsResponse.data.data;
                    
                    const productRows = document.getElementById('editProductRows');
                    productRows.innerHTML = '';
                    
                    editProductCount = 0;
                    items.forEach((item, index) => {
                        const row = document.createElement('div');
                        row.className = 'product-row';
                        row.dataset.id = editProductCount;
                        row.innerHTML = \`
                            <div class="form-group" style="margin: 0;">
                                <label>Product Name</label>
                                <input type="text" name="items[\${editProductCount}][product_name]" value="\${item.product_name}" required>
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label>Quantity</label>
                                <input type="number" name="items[\${editProductCount}][quantity]" value="\${item.quantity}" min="0" required onchange="calculateEditSaleTotal()">
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label>Unit Price</label>
                                <input type="number" name="items[\${editProductCount}][unit_price]" value="\${item.unit_price}" min="0" step="0.01" required onchange="calculateEditSaleTotal()">
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label>Total</label>
                                <input type="number" class="product-total" readonly style="background: #f3f4f6;" value="\${item.quantity * item.unit_price}">
                            </div>
                            <button type="button" class="btn-remove" onclick="removeEditProductRow(\${editProductCount})">
                                <i class="fas fa-times"></i>
                            </button>
                        \`;
                        productRows.appendChild(row);
                        editProductCount++;
                    });
                    
                    calculateEditSaleTotal();
                    document.getElementById('editSaleModal').classList.add('show');
                } catch (error) {
                    alert('Error loading sale data: ' + (error.response?.data?.error || error.message));
                }
            }
            
            function calculateEditSaleTotal() {
                let subtotal = 0;
                
                document.querySelectorAll('#editProductRows .product-row').forEach(row => {
                    const quantity = parseFloat(row.querySelector('input[name*="quantity"]').value) || 0;
                    const unitPrice = parseFloat(row.querySelector('input[name*="unit_price"]').value) || 0;
                    const total = quantity * unitPrice;
                    
                    row.querySelector('.product-total').value = total.toFixed(2);
                    subtotal += total;
                });
                
                const courierCost = parseFloat(document.getElementById('editCourierCost').value) || 0;
                const saleType = document.getElementById('editSaleType').value;
                const gstRate = saleType === 'With' ? 0.18 : 0;
                const gstAmount = subtotal * gstRate;
                const totalAmount = subtotal + courierCost + gstAmount;
                
                document.getElementById('editSubtotalDisplay').textContent = '₹' + subtotal.toFixed(2);
                document.getElementById('editCourierDisplay').textContent = '₹' + courierCost.toFixed(2);
                document.getElementById('editGstDisplay').textContent = '₹' + gstAmount.toFixed(2);
                document.getElementById('editTotalDisplay').textContent = '₹' + totalAmount.toFixed(2);
            }
            
            async function submitEditSale(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                const orderId = formData.get('order_id');
                
                const items = [];
                let index = 0;
                while (formData.has(\`items[\${index}][product_name]\`)) {
                    items.push({
                        product_name: formData.get(\`items[\${index}][product_name]\`),
                        quantity: parseFloat(formData.get(\`items[\${index}][quantity]\`)),
                        unit_price: parseFloat(formData.get(\`items[\${index}][unit_price]\`))
                    });
                    index++;
                }
                
                const data = {
                    customer_code: formData.get('customer_code'),
                    sale_date: formData.get('sale_date'),
                    employee_name: formData.get('employee_name'),
                    sale_type: formData.get('sale_type'),
                    courier_cost: parseFloat(formData.get('courier_cost')) || 0,
                    amount_received: parseFloat(formData.get('amount_received')) || 0,
                    account_received: formData.get('account_received'),
                    payment_reference: formData.get('payment_reference'),
                    remarks: formData.get('remarks'),
                    items: items
                };
                
                try {
                    const response = await axios.put(\`/api/sales/\${orderId}\`, data);
                    
                    if (response.data.success) {
                        alert('Sale updated successfully!');
                        document.getElementById('editSaleModal').classList.remove('show');
                        loadAllSales();
                        loadDashboard();
                    }
                } catch (error) {
                    alert('Error updating sale: ' + (error.response?.data?.error || error.message));
                }
            }
            
            // Add product row in edit sale modal
            function addEditProductRow() {
                const container = document.getElementById('editProductRows');
                const row = document.createElement('div');
                row.className = 'product-row';
                row.dataset.id = editProductCount;
                
                row.innerHTML = \`
                    <div class="form-group" style="margin: 0;">
                        <label>Product Name</label>
                        <input type="text" name="items[\${editProductCount}][product_name]" required placeholder="Enter product name">
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Quantity</label>
                        <input type="number" name="items[\${editProductCount}][quantity]" min="0" value="0" required onchange="calculateEditSaleTotal()">
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Unit Price</label>
                        <input type="number" name="items[\${editProductCount}][unit_price]" min="0" step="0.01" value="0" required onchange="calculateEditSaleTotal()">
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Total</label>
                        <input type="number" class="product-total" readonly style="background: #f3f4f6;" value="0">
                    </div>
                    <button type="button" class="btn-remove" onclick="removeEditProductRow(\${editProductCount})">
                        <i class="fas fa-times"></i>
                    </button>
                \`;
                
                container.appendChild(row);
                editProductCount++;
            }
            
            // Remove product row in edit sale modal
            function removeEditProductRow(rowId) {
                const row = document.querySelector(\`#editProductRows .product-row[data-id="\${rowId}"]\`);
                if (row) {
                    row.remove();
                    calculateEditSaleTotal();
                }
            }
            
            // Edit Lead Functions
            async function editLead(leadId) {
                try {
                    const response = await axios.get(\`/api/leads/\${leadId}\`);
                    const lead = response.data.data;
                    
                    // Populate form fields
                    document.getElementById('editLeadId').value = lead.id;
                    document.getElementById('editLeadCustomerCode').value = lead.customer_code || '';
                    document.getElementById('editLeadCustomerName').value = lead.customer_name;
                    document.getElementById('editLeadMobileNumber').value = lead.mobile_number;
                    document.getElementById('editLeadAlternateMobile').value = lead.alternate_mobile || '';
                    document.getElementById('editLeadLocation').value = lead.location || '';
                    document.getElementById('editLeadCompanyName').value = lead.company_name || '';
                    document.getElementById('editLeadGstNumber').value = lead.gst_number || '';
                    document.getElementById('editLeadEmail').value = lead.email || '';
                    document.getElementById('editLeadCompleteAddress').value = lead.complete_address || '';
                    document.getElementById('editLeadStatus').value = lead.status || 'New';
                    
                    document.getElementById('editLeadModal').classList.add('show');
                } catch (error) {
                    alert('Error loading lead data: ' + (error.response?.data?.error || error.message));
                }
            }
            
            async function submitEditLead(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                const leadId = formData.get('lead_id');
                
                const data = {
                    customer_code: formData.get('customer_code'),
                    customer_name: formData.get('customer_name'),
                    mobile_number: formData.get('mobile_number'),
                    alternate_mobile: formData.get('alternate_mobile'),
                    location: formData.get('location'),
                    company_name: formData.get('company_name'),
                    gst_number: formData.get('gst_number'),
                    email: formData.get('email'),
                    complete_address: formData.get('complete_address'),
                    status: formData.get('status')
                };
                
                try {
                    const response = await axios.put(\`/api/leads/\${leadId}\`, data);
                    
                    if (response.data.success) {
                        alert('Lead updated successfully!');
                        document.getElementById('editLeadModal').classList.remove('show');
                        loadLeads();
                    }
                } catch (error) {
                    alert('Error updating lead: ' + (error.response?.data?.error || error.message));
                }
            }
            
            // Excel Upload Functions
            async function uploadSalesExcel(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                const statusDiv = document.getElementById('salesUploadStatus');
                
                statusDiv.style.display = 'block';
                statusDiv.style.background = '#e0f2fe';
                statusDiv.style.color = '#0369a1';
                statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading and processing...';
                
                try {
                    const response = await axios.post('/api/sales/upload-excel', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    
                    if (response.data.success) {
                        statusDiv.style.background = '#d1fae5';
                        statusDiv.style.color = '#065f46';
                        statusDiv.innerHTML = \`<i class="fas fa-check-circle"></i> Success! \${response.data.data.imported} sales imported.\`;
                        form.reset();
                        setTimeout(() => {
                            statusDiv.style.display = 'none';
                        }, 5000);
                    }
                } catch (error) {
                    statusDiv.style.background = '#fee2e2';
                    statusDiv.style.color = '#991b1b';
                    statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error: ' + (error.response?.data?.error || error.message);
                }
            }
            
            async function uploadLeadsExcel(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                const statusDiv = document.getElementById('leadsUploadStatus');
                
                statusDiv.style.display = 'block';
                statusDiv.style.background = '#e0f2fe';
                statusDiv.style.color = '#0369a1';
                statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading and processing...';
                
                try {
                    const response = await axios.post('/api/leads/upload-excel', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    
                    if (response.data.success) {
                        statusDiv.style.background = '#d1fae5';
                        statusDiv.style.color = '#065f46';
                        statusDiv.innerHTML = \`<i class="fas fa-check-circle"></i> Success! \${response.data.data.imported} leads imported.\`;
                        form.reset();
                        setTimeout(() => {
                            statusDiv.style.display = 'none';
                        }, 5000);
                    }
                } catch (error) {
                    statusDiv.style.background = '#fee2e2';
                    statusDiv.style.color = '#991b1b';
                    statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error: ' + (error.response?.data?.error || error.message);
                }
            }

            // Close modal on outside click
            window.onclick = function(event) {
                const modals = document.querySelectorAll('.modal');
                modals.forEach(modal => {
                    if (event.target === modal) {
                        modal.classList.remove('show');
                    }
                });
            }
            
            // Authentication functions
            let currentUser = null;
            
            function handleLogin(event) {
                event.preventDefault();
                const username = document.getElementById('loginUsername').value;
                const password = document.getElementById('loginPassword').value;
                const errorDiv = document.getElementById('loginError');
                
                axios.post('/api/auth/login', { username, password })
                    .then(response => {
                        if (response.data.success) {
                            currentUser = response.data.data;
                            sessionStorage.setItem('user', JSON.stringify(currentUser));
                            showDashboard();
                        }
                    })
                    .catch(error => {
                        errorDiv.textContent = error.response?.data?.error || 'Login failed';
                        errorDiv.style.display = 'block';
                    });
            }
            
            function handleLogout() {
                currentUser = null;
                sessionStorage.removeItem('user');
                document.getElementById('loginScreen').style.display = 'flex';
                document.getElementById('mainDashboard').style.display = 'none';
                document.getElementById('loginUsername').value = '';
                document.getElementById('loginPassword').value = '';
            }
            
            function showDashboard() {
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('mainDashboard').style.display = 'block';
                document.getElementById('userDisplay').textContent = currentUser.fullName + ' (' + currentUser.role + ')';
                
                // Update UI based on role
                updateUIForRole();
                loadDashboard();
            }
            
            function updateUIForRole() {
                const isAdmin = currentUser.role === 'admin';
                
                // Hide/show Edit buttons in Sale Database
                document.querySelectorAll('.btn-edit-sale').forEach(btn => {
                    btn.style.display = isAdmin ? 'inline-block' : 'none';
                });
                
                // Hide/show Edit buttons in Leads Database
                document.querySelectorAll('.btn-edit-lead').forEach(btn => {
                    btn.style.display = isAdmin ? 'inline-block' : 'none';
                });
                
                // Hide/show Excel Upload sidebar item
                const uploadItem = document.querySelector('[onclick="showPage(\\'excel-upload\\')"]');
                if (uploadItem) {
                    uploadItem.parentElement.style.display = isAdmin ? 'block' : 'none';
                }
            }
            
            // Check for existing session on page load
            window.addEventListener('DOMContentLoaded', () => {
                const storedUser = sessionStorage.getItem('user');
                if (storedUser) {
                    currentUser = JSON.parse(storedUser);
                    showDashboard();
                }
            });
            
            // CSV Upload Functions
            async function uploadSalesCSV(event) {
                event.preventDefault();
                const form = event.target;
                const formData = new FormData(form);
                const statusDiv = document.getElementById('salesUploadStatus');
                const submitBtn = form.querySelector('button[type="submit"]');
                
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
                statusDiv.style.display = 'none';
                
                try {
                    const response = await axios.post('/api/sales/upload-csv', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    
                    if (response.data.success) {
                        statusDiv.className = 'alert-success';
                        statusDiv.textContent = 'Success! Imported ' + response.data.data.imported + ' sales records.';
                        statusDiv.style.display = 'block';
                        form.reset();
                        
                        // Reload dashboard if on dashboard page
                        if (currentPage === 'dashboard') {
                            loadDashboard();
                        }
                    } else {
                        throw new Error(response.data.error || 'Upload failed');
                    }
                } catch (error) {
                    statusDiv.className = 'alert-error';
                    statusDiv.textContent = 'Error: ' + (error.response?.data?.error || error.message || 'Upload failed');
                    statusDiv.style.display = 'block';
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Sales Data';
                }
            }
            
            async function uploadLeadsCSV(event) {
                event.preventDefault();
                const form = event.target;
                const formData = new FormData(form);
                const statusDiv = document.getElementById('leadsUploadStatus');
                const submitBtn = form.querySelector('button[type="submit"]');
                
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
                statusDiv.style.display = 'none';
                
                try {
                    const response = await axios.post('/api/leads/upload-csv', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    
                    if (response.data.success) {
                        statusDiv.className = 'alert-success';
                        statusDiv.textContent = 'Success! Imported ' + response.data.data.imported + ' lead records.';
                        statusDiv.style.display = 'block';
                        form.reset();
                        
                        // Reload leads if on leads page
                        if (currentPage === 'leads') {
                            loadLeads();
                        }
                    } else {
                        throw new Error(response.data.error || 'Upload failed');
                    }
                } catch (error) {
                    statusDiv.className = 'alert-error';
                    statusDiv.textContent = 'Error: ' + (error.response?.data?.error || error.message || 'Upload failed');
                    statusDiv.style.display = 'block';
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Leads Data';
                }
            }
        </script>
        </div>
    </body>
    </html>
  `)
})

export default app
