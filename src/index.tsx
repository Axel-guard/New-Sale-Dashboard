import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import * as XLSX from 'xlsx'

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

// Change password endpoint
app.post('/api/auth/change-password', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { userId, currentPassword, newPassword } = body;
    
    const encodedCurrentPassword = btoa(currentPassword);
    const encodedNewPassword = btoa(newPassword);
    
    // Verify current password
    const user = await env.DB.prepare(`
      SELECT id FROM users WHERE id = ? AND password = ?
    `).bind(userId, encodedCurrentPassword).first();
    
    if (!user) {
      return c.json({ success: false, error: 'Current password is incorrect' }, 401);
    }
    
    // Update password
    await env.DB.prepare(`
      UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(encodedNewPassword, userId).run();
    
    return c.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to change password' }, 500);
  }
});

// User Management endpoints (Admin only)
app.get('/api/users', async (c) => {
  const { env } = c;
  
  try {
    const users = await env.DB.prepare(`
      SELECT id, username, full_name, role, employee_name, is_active, created_at
      FROM users
      ORDER BY created_at DESC
    `).all();
    
    return c.json({ success: true, data: users.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch users' }, 500);
  }
});

app.post('/api/users', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { username, full_name, password, role, employee_name } = body;
    
    // Check if username already exists
    const existing = await env.DB.prepare(`
      SELECT id FROM users WHERE username = ?
    `).bind(username).first();
    
    if (existing) {
      return c.json({ success: false, error: 'Username already exists' }, 400);
    }
    
    const encodedPassword = btoa(password);
    
    const result = await env.DB.prepare(`
      INSERT INTO users (username, password, full_name, role, employee_name, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).bind(username, encodedPassword, full_name, role, employee_name || null).run();
    
    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: 'User created successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create user' }, 500);
  }
});

app.put('/api/users/:id', async (c) => {
  const { env } = c;
  
  try {
    const userId = c.req.param('id');
    const body = await c.req.json();
    const { full_name, role, employee_name, is_active, new_password } = body;
    
    // Update user information
    if (new_password && new_password.length > 0) {
      const encodedPassword = btoa(new_password);
      await env.DB.prepare(`
        UPDATE users 
        SET full_name = ?, role = ?, employee_name = ?, is_active = ?, password = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(full_name, role, employee_name || null, is_active, encodedPassword, userId).run();
    } else {
      await env.DB.prepare(`
        UPDATE users 
        SET full_name = ?, role = ?, employee_name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(full_name, role, employee_name || null, is_active, userId).run();
    }
    
    return c.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update user' }, 500);
  }
});

// Reports & Analytics endpoints
app.get('/api/reports/summary', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Get current quarter
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const quarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
    
    // Get year start
    const yearStart = new Date(now.getFullYear(), 0, 1);
    
    // Current month sales
    const currentMonth = await env.DB.prepare(`
      SELECT SUM(total_amount) as total
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
    `).bind(currentMonthStart.toISOString()).first();
    
    // Previous month sales
    const previousMonth = await env.DB.prepare(`
      SELECT SUM(total_amount) as total
      FROM sales
      WHERE DATE(sale_date) >= DATE(?) AND DATE(sale_date) <= DATE(?)
    `).bind(previousMonthStart.toISOString(), previousMonthEnd.toISOString()).first();
    
    // Quarterly sales
    const quarterly = await env.DB.prepare(`
      SELECT SUM(total_amount) as total
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
    `).bind(quarterStart.toISOString()).first();
    
    // YTD sales
    const ytd = await env.DB.prepare(`
      SELECT SUM(total_amount) as total
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
    `).bind(yearStart.toISOString()).first();
    
    return c.json({
      success: true,
      data: {
        currentMonth: currentMonth.total || 0,
        previousMonth: previousMonth.total || 0,
        quarterly: quarterly.total || 0,
        ytd: ytd.total || 0
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch report summary' }, 500);
  }
});

app.get('/api/reports/employee-comparison', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Get current month employee sales
    const currentMonth = await env.DB.prepare(`
      SELECT 
        employee_name,
        COUNT(*) as total_sales,
        SUM(total_amount) as total_revenue,
        ROUND(AVG(total_amount), 2) as avg_sale_value
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      GROUP BY employee_name
    `).bind(currentMonthStart.toISOString()).all();
    
    // Get previous month employee sales
    const previousMonth = await env.DB.prepare(`
      SELECT 
        employee_name,
        SUM(total_amount) as total_revenue
      FROM sales
      WHERE DATE(sale_date) >= DATE(?) AND DATE(sale_date) <= DATE(?)
      GROUP BY employee_name
    `).bind(previousMonthStart.toISOString(), previousMonthEnd.toISOString()).all();
    
    // Merge and calculate growth
    const employeeData = currentMonth.results.map(current => {
      const previous = previousMonth.results.find(p => p.employee_name === current.employee_name);
      const previousRevenue = previous ? previous.total_revenue : 0;
      const growth = previousRevenue > 0 
        ? ((current.total_revenue - previousRevenue) / previousRevenue * 100).toFixed(2)
        : current.total_revenue > 0 ? 100 : 0;
      
      return {
        employee_name: current.employee_name,
        current_month_sales: current.total_revenue || 0,
        previous_month_sales: previousRevenue,
        growth_percentage: parseFloat(growth),
        total_sales_count: current.total_sales,
        avg_sale_value: current.avg_sale_value || 0
      };
    });
    
    return c.json({ success: true, data: employeeData });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch employee comparison' }, 500);
  }
});

// Get employee monthly sales for current year
app.get('/api/reports/employee-monthly-sales', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    
    // Get all employees
    const employees = await env.DB.prepare(`
      SELECT DISTINCT employee_name FROM sales
      WHERE strftime('%Y', sale_date) = ?
      ORDER BY employee_name
    `).bind(currentYear.toString()).all();
    
    // For each employee, get monthly totals (Jan to current month)
    const employeeMonthlyData = {};
    
    for (const emp of employees.results) {
      const monthlySales = await env.DB.prepare(`
        SELECT 
          CAST(strftime('%m', sale_date) AS INTEGER) as month,
          SUM(total_amount) as total_sales
        FROM sales
        WHERE employee_name = ?
          AND strftime('%Y', sale_date) = ?
        GROUP BY strftime('%m', sale_date)
        ORDER BY month
      `).bind(emp.employee_name, currentYear.toString()).all();
      
      // Create array for all 12 months (0 for months with no sales)
      const monthlyValues = Array(12).fill(0);
      monthlySales.results.forEach(row => {
        monthlyValues[row.month - 1] = row.total_sales || 0;
      });
      
      employeeMonthlyData[emp.employee_name] = monthlyValues;
    }
    
    return c.json({ 
      success: true, 
      data: {
        employees: employees.results.map(e => e.employee_name),
        monthlyData: employeeMonthlyData,
        currentMonth: currentMonth
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch monthly employee sales' }, 500);
  }
});

app.get('/api/reports/incentives', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const targetAmount = 550000;
    const incentivePercentage = 0.01;
    
    // Get employee sales without tax
    const employeeSales = await env.DB.prepare(`
      SELECT 
        employee_name,
        SUM(subtotal) as total_without_tax
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      GROUP BY employee_name
    `).bind(currentMonthStart.toISOString()).all();
    
    const incentiveData = employeeSales.results.map(emp => {
      const salesWithoutTax = emp.total_without_tax || 0;
      const achievementPct = (salesWithoutTax / targetAmount * 100).toFixed(2);
      const exceedingAmount = salesWithoutTax > targetAmount ? (salesWithoutTax - targetAmount) : 0;
      const incentiveEarned = exceedingAmount > 0
        ? (exceedingAmount * incentivePercentage).toFixed(2)
        : 0;
      
      return {
        employee_name: emp.employee_name,
        sales_without_tax: salesWithoutTax,
        target_amount: targetAmount,
        achievement_percentage: parseFloat(achievementPct),
        status: salesWithoutTax >= targetAmount ? 'Target Achieved' : 'In Progress',
        incentive_earned: parseFloat(incentiveEarned)
      };
    });
    
    return c.json({ success: true, data: incentiveData });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch incentives' }, 500);
  }
});

// Get incentive history (past 12 months)
app.get('/api/reports/incentive-history', async (c) => {
  const { env } = c;
  
  try {
    const incentiveHistory = await env.DB.prepare(`
      SELECT 
        employee_name,
        month,
        year,
        total_sales_without_tax,
        target_amount,
        incentive_earned,
        incentive_percentage,
        created_at
      FROM incentives
      ORDER BY year DESC, month DESC, employee_name ASC
      LIMIT 100
    `).all();
    
    const formattedHistory = incentiveHistory.results.map(inc => {
      const achievement = inc.target_amount > 0 
        ? (inc.total_sales_without_tax / inc.target_amount * 100).toFixed(2)
        : 0;
      
      return {
        employee_name: inc.employee_name,
        month: inc.month,
        year: inc.year,
        sales_without_tax: inc.total_sales_without_tax,
        target_amount: inc.target_amount,
        achievement_percentage: parseFloat(achievement),
        incentive_earned: inc.incentive_earned,
        status: inc.incentive_earned > 0 ? 'Paid' : 'Not Achieved',
        created_at: inc.created_at
      };
    });
    
    return c.json({ success: true, data: formattedHistory });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch incentive history' }, 500);
  }
});

// Save incentive record (for month-end processing)
app.post('/api/reports/save-incentive', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { employee_name, month, year, total_sales_without_tax, target_amount, incentive_earned } = body;
    
    // Check if record already exists for this employee/month/year
    const existing = await env.DB.prepare(`
      SELECT id FROM incentives 
      WHERE employee_name = ? AND month = ? AND year = ?
    `).bind(employee_name, month, year).first();
    
    if (existing) {
      // Update existing record
      await env.DB.prepare(`
        UPDATE incentives 
        SET total_sales_without_tax = ?, target_amount = ?, incentive_earned = ?
        WHERE id = ?
      `).bind(total_sales_without_tax, target_amount, incentive_earned, existing.id).run();
    } else {
      // Insert new record
      await env.DB.prepare(`
        INSERT INTO incentives (employee_name, month, year, total_sales_without_tax, target_amount, incentive_earned, incentive_percentage)
        VALUES (?, ?, ?, ?, ?, ?, 1.0)
      `).bind(employee_name, month, year, total_sales_without_tax, target_amount, incentive_earned).run();
    }
    
    return c.json({ success: true, message: 'Incentive record saved' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to save incentive' }, 500);
  }
});

// Get product-wise sales analysis
app.get('/api/reports/product-analysis', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const productAnalysis = await env.DB.prepare(`
      SELECT 
        si.product_name,
        SUM(si.quantity) as total_quantity,
        SUM(si.quantity * si.unit_price) as total_revenue,
        ROUND(AVG(si.unit_price), 2) as average_price,
        COUNT(DISTINCT s.order_id) as order_count
      FROM sale_items si
      JOIN sales s ON si.order_id = s.order_id
      WHERE DATE(s.sale_date) >= DATE(?)
      GROUP BY si.product_name
      ORDER BY total_revenue DESC
      LIMIT 50
    `).bind(currentMonthStart.toISOString()).all();
    
    return c.json({ success: true, data: productAnalysis.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch product analysis' }, 500);
  }
});

// Get customer-wise sales analysis
app.get('/api/reports/customer-analysis', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const customerAnalysis = await env.DB.prepare(`
      SELECT 
        customer_name,
        company_name,
        SUM(total_amount) as total_purchases,
        COUNT(*) as order_count,
        ROUND(AVG(total_amount), 2) as avg_order_value,
        SUM(balance_amount) as balance_pending
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      GROUP BY customer_name, company_name
      ORDER BY total_purchases DESC
      LIMIT 50
    `).bind(currentMonthStart.toISOString()).all();
    
    return c.json({ success: true, data: customerAnalysis.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch customer analysis' }, 500);
  }
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
    
    // Get items for each sale
    const salesWithItems = await Promise.all(sales.results.map(async (sale: any) => {
      const items = await env.DB.prepare(`
        SELECT * FROM sale_items WHERE order_id = ?
      `).bind(sale.order_id).all();
      
      return {
        ...sale,
        items: items.results
      };
    }));
    
    return c.json({ success: true, data: salesWithItems });
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
      SELECT * FROM sale_items WHERE order_id = ?
    `).bind(orderId).all();
    
    const payments = await env.DB.prepare(`
      SELECT * FROM payment_history WHERE order_id = ? ORDER BY payment_date DESC
    `).bind(orderId).all();
    
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
      customer_name,
      company_name,
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
    
    // Generate order ID from last order + 1
    const lastOrderResult = await env.DB.prepare(`
      SELECT order_id FROM sales ORDER BY order_id DESC LIMIT 1
    `).first();
    
    let order_id = '2019899'; // Default if no sales exist
    if (lastOrderResult && lastOrderResult.order_id) {
      const lastOrderNum = parseInt(lastOrderResult.order_id);
      if (!isNaN(lastOrderNum)) {
        order_id = String(lastOrderNum + 1);
      }
    }
    
    // Insert sale
    const saleResult = await env.DB.prepare(`
      INSERT INTO sales (
        order_id, customer_code, customer_name, company_name, customer_contact, sale_date, employee_name,
        sale_type, courier_cost, amount_received, account_received,
        payment_reference, remarks, subtotal, gst_amount, total_amount, balance_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      order_id, customer_code, customer_name || '', company_name || '', customer_contact, sale_date, employee_name,
      sale_type, courier_cost, amount_received, account_received,
      payment_reference, remarks, subtotal, gst_amount, total_amount, balance_amount
    ).run();
    
    const sale_id = saleResult.meta.last_row_id;
    
    // Insert sale items
    for (const item of items) {
      if (item.product_name && item.quantity > 0 && item.unit_price > 0) {
        const total_price = item.quantity * item.unit_price;
        await env.DB.prepare(`
          INSERT INTO sale_items (sale_id, order_id, product_name, quantity, unit_price, total_price)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(sale_id, order_id, item.product_name, item.quantity, item.unit_price, total_price).run();
      }
    }
    
    // Insert initial payment if amount received
    if (amount_received > 0) {
      await env.DB.prepare(`
        INSERT INTO payment_history (sale_id, order_id, payment_date, amount, account_received, payment_reference)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(sale_id, order_id, sale_date, amount_received, account_received || 'Not Specified', payment_reference).run();
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
    `).bind(sale.id, order_id, payment_date, amount, account_received || 'Not Specified', payment_reference).run();
    
    return c.json({ success: true, message: 'Payment updated successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update payment' }, 500);
  }
});

// Get balance payment history for current month
app.get('/api/sales/balance-payment-history', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const paymentHistory = await env.DB.prepare(`
      SELECT 
        p.id,
        p.order_id,
        p.payment_date,
        p.amount,
        p.account_received,
        p.payment_reference,
        s.customer_name,
        s.company_name
      FROM payment_history p
      JOIN sales s ON p.order_id = s.order_id
      WHERE DATE(p.payment_date) >= DATE(?)
      ORDER BY p.payment_date DESC
    `).bind(currentMonthStart.toISOString()).all();
    
    return c.json({ success: true, data: paymentHistory.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch payment history' }, 500);
  }
});

// Merge duplicate sales by order_id
app.post('/api/sales/merge-duplicates', async (c) => {
  const { env } = c;
  
  try {
    // Find duplicate order_ids
    const duplicates = await env.DB.prepare(`
      SELECT order_id, COUNT(*) as count
      FROM sales
      GROUP BY order_id
      HAVING count > 1
    `).all();
    
    if (duplicates.results.length === 0) {
      return c.json({ success: true, message: 'No duplicates found', merged: 0 });
    }
    
    let mergedCount = 0;
    
    for (const dup of duplicates.results) {
      const orderId = dup.order_id;
      
      // Get all sales with this order_id, ordered by created_at
      const salesWithSameId = await env.DB.prepare(`
        SELECT * FROM sales WHERE order_id = ? ORDER BY created_at ASC
      `).bind(orderId).all();
      
      if (salesWithSameId.results.length > 1) {
        // Keep the first one (oldest), delete the rest
        const keepSale = salesWithSameId.results[0];
        const duplicateIds = salesWithSameId.results.slice(1).map((s: any) => s.id);
        
        // Delete duplicate sales
        for (const dupId of duplicateIds) {
          await env.DB.prepare(`DELETE FROM sales WHERE id = ?`).bind(dupId).run();
        }
        
        mergedCount += duplicateIds.length;
      }
    }
    
    return c.json({ 
      success: true, 
      message: `Merged ${mergedCount} duplicate sales`,
      merged: mergedCount 
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to merge duplicates: ' + error }, 500);
  }
});

// Get all leads
app.get('/api/leads', async (c) => {
  const { env } = c;
  
  try {
    const search = c.req.query('search') || '';
    
    let query = `SELECT * FROM leads`;
    let params = [];
    
    if (search) {
      // Smart search logic:
      // 1-4 digits = customer code (exact match)
      // 5+ digits = mobile number (partial match)
      // Text = name or company (partial match)
      
      const isNumeric = /^\d+$/.test(search);
      
      if (isNumeric && search.length <= 4) {
        // Customer code: exact match
        query += ` WHERE customer_code = ?`;
        params = [search];
      } else if (isNumeric && search.length >= 5) {
        // Mobile number: partial match
        query += ` WHERE mobile_number LIKE ? OR alternate_mobile LIKE ?`;
        const searchTerm = `%${search}%`;
        params = [searchTerm, searchTerm];
      } else {
        // Name or company: partial match in name, company, email, location
        query += ` WHERE customer_name LIKE ? OR company_name LIKE ? OR email LIKE ? OR location LIKE ?`;
        const searchTerm = `%${search}%`;
        params = [searchTerm, searchTerm, searchTerm, searchTerm];
      }
    }
    
    query += ` ORDER BY CAST(customer_code AS INTEGER) ASC`;
    
    const leads = await env.DB.prepare(query).bind(...params).all();
    
    return c.json({ success: true, data: leads.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch leads' }, 500);
  }
});

// Get next customer code
app.get('/api/leads/next-code', async (c) => {
  const { env } = c;
  
  try {
    const lastLead = await env.DB.prepare(`
      SELECT customer_code FROM leads 
      ORDER BY CAST(customer_code AS INTEGER) DESC 
      LIMIT 1
    `).first();
    
    let nextCode = '1'; // Default if no leads exist
    if (lastLead && lastLead.customer_code) {
      const lastCode = parseInt(lastLead.customer_code);
      if (!isNaN(lastCode)) {
        nextCode = String(lastCode + 1);
      }
    }
    
    return c.json({ success: true, next_code: nextCode });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to get next code' }, 500);
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
      complete_address
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
      leadId
    ).run();
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update lead' }, 500);
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

// Delete lead
app.delete('/api/leads/:leadId', async (c) => {
  const { env } = c;
  const leadId = c.req.param('leadId');
  
  try {
    await env.DB.prepare(`DELETE FROM leads WHERE id = ?`).bind(leadId).run();
    
    return c.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to delete lead' }, 500);
  }
});

// Get customer details by customer code
app.get('/api/leads/by-code/:customerCode', async (c) => {
  const { env } = c;
  const customerCode = c.req.param('customerCode');
  
  try {
    const customer = await env.DB.prepare(`
      SELECT * FROM leads WHERE customer_code = ? LIMIT 1
    `).bind(customerCode).first();
    
    if (!customer) {
      return c.json({ success: false, error: 'Customer not found' }, 404);
    }
    
    return c.json({ success: true, data: customer });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch customer' }, 500);
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

// Delete sale
app.delete('/api/sales/:orderId', async (c) => {
  const { env } = c;
  const orderId = c.req.param('orderId');
  
  try {
    // Delete sale items first (foreign key constraint)
    await env.DB.prepare(`DELETE FROM sale_items WHERE order_id = ?`).bind(orderId).run();
    
    // Delete payment history
    await env.DB.prepare(`DELETE FROM payment_history WHERE order_id = ?`).bind(orderId).run();
    
    // Delete sale
    await env.DB.prepare(`DELETE FROM sales WHERE order_id = ?`).bind(orderId).run();
    
    return c.json({ success: true, message: 'Sale deleted successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to delete sale' }, 500);
  }
});

// Helper function to parse Excel or CSV file
async function parseFileToRows(file: File): Promise<any[][]> {
  const fileName = file.name.toLowerCase();
  
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    // Parse Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
    return data as any[][];
  } else {
    // Parse CSV file
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => {
      // Handle CSV with proper quote escaping
      const values = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    });
  }
}

// Upload CSV/Excel data for sales - matches Google Sheets format
app.post('/api/sales/upload-csv', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.parseBody();
    const file = body['salesFile'];
    
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'No file uploaded' }, 400);
    }
    
    const rows = await parseFileToRows(file as File);
    
    if (rows.length < 2) {
      return c.json({ success: false, error: 'File is empty or invalid' }, 400);
    }
    
    // Skip header row
    const dataRows = rows.slice(1);
    let imported = 0;
    let errors = [];
    
    for (let i = 0; i < dataRows.length; i++) {
      try {
        const values = dataRows[i].map(v => String(v || '').trim());
        
        // Google Sheets format columns (0-indexed):
        // 0:S.No, 1:Month, 2:Order Id, 3:Sale Date, 4:Cust Code, 5:Sale Done By,
        // 6:Company Name, 7:Customer Name, 8:Mobile Number, 9:Bill Amount,
        // 10:Amount Rcd, 11:Balnc Payment, 12:Round Off, 13:With Bill, 14:Billing Status...
        
        if (values.length < 10) {
          errors.push(`Row ${i + 2}: Insufficient columns (need at least 10, got ${values.length})`);
          continue;
        }
        
        const order_id = values[2] || `ORD${Date.now()}-${imported}`;
        
        // Skip empty rows (no order ID)
        if (!order_id || order_id.trim() === '') {
          continue;
        }
        
        // Parse date from YY/MM/DD HH:MM to YYYY-MM-DD HH:MM:SS
        let sale_date = values[3] || new Date().toISOString();
        if (sale_date && sale_date.match(/^\d{2}\/\d{2}\/\d{2}/)) {
          const parts = sale_date.split(' ');
          const dateParts = parts[0].split('/');
          const year = '20' + dateParts[0];
          const month = dateParts[1];
          const day = dateParts[2];
          const time = parts[1] || '00:00';
          sale_date = `${year}-${month}-${day} ${time}:00`;
        }
        
        const cust_code = values[4] || '';
        const employee_name = values[5] || 'Unknown';
        const company_name = values[6] || '';
        const customer_name = values[7] || '';
        const customer_contact = values[8] || ''; // This is the mobile number
        
        // Parse amounts - remove currency symbols, commas, and spaces
        const bill_amount = parseFloat(values[9].replace(/[₹,\s]/g, '')) || 0;
        const amount_received = parseFloat(values[10].replace(/[₹,\s]/g, '')) || 0;
        const balance_payment = parseFloat(values[11].replace(/[₹,\s\(\)]/g, '')) || 0;
        const with_bill = values[13];
        
        // Determine sale type: Check "With Bill" column (index 13)
        // Normalize to 'With' or 'Without'
        let sale_type = 'With'; // default
        if (with_bill) {
          const normalized = with_bill.toLowerCase().trim();
          if (normalized.includes('without') || normalized === 'no' || normalized === 'n') {
            sale_type = 'Without';
          }
        }
        
        // Calculate GST
        const gst_rate = 0.18;
        let subtotal = bill_amount;
        let gst_amount = 0;
        let total_amount = bill_amount;
        
        if (sale_type === 'With') {
          // If bill amount includes GST, calculate backwards
          subtotal = bill_amount / (1 + gst_rate);
          gst_amount = bill_amount - subtotal;
        } else {
          gst_amount = 0;
          subtotal = bill_amount;
        }
        
        // Insert sale - NOTE: Using customer_contact NOT mobile_number
        // Use INSERT OR IGNORE to skip duplicates
        const saleResult = await env.DB.prepare(`
          INSERT OR IGNORE INTO sales (order_id, customer_code, customer_name, company_name, customer_contact,
                            sale_date, employee_name, sale_type, 
                            subtotal, gst_amount, total_amount, amount_received, balance_amount, account_received)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          order_id, cust_code, customer_name, company_name, customer_contact, 
          sale_date, employee_name, sale_type,
          subtotal, gst_amount, total_amount, amount_received, balance_payment, 'IDFC'
        ).run();
        
        // Skip if duplicate (changes = 0)
        if (saleResult.meta.changes === 0) {
          continue;
        }
        
        // Parse products (up to 10 products starting from column 17)
        // P1: columns 17-20 (Code, Name, Qty, Rate)
        // P2: columns 22-25, P3: columns 27-30, etc.
        const productIndexes = [
          [17, 18, 19, 20], // P1
          [22, 23, 24, 25], // P2
          [27, 28, 29, 30], // P3
          [32, 33, 34, 35], // P4
          [37, 38, 39, 40], // P5
          [42, 43, 44, 45], // P6
          [46, 47, 48],     // P7
          [49, 50, 51],     // P8
          [52, 53, 54],     // P9
          [55, 56, 57]      // P10
        ];
        
        for (const [codeIdx, nameIdx, qtyIdx, rateIdx] of productIndexes) {
          if (values[nameIdx] && values[nameIdx].trim() !== '') {
            const product_name = values[nameIdx];
            const quantity = parseFloat(values[qtyIdx]) || 0;
            const unit_price = parseFloat(values[rateIdx]) || 0;
            
            if (quantity > 0 && unit_price > 0) {
              await env.DB.prepare(`
                INSERT INTO sale_items (order_id, product_name, quantity, unit_price)
                VALUES (?, ?, ?, ?)
              `).bind(
                order_id, 
                product_name, 
                quantity, 
                unit_price
              ).run();
            }
          }
        }
        
        imported++;
      } catch (rowError) {
        errors.push(`Row ${i + 2}: ${rowError.message}`);
      }
    }
    
    if (errors.length > 0 && imported === 0) {
      return c.json({ success: false, error: 'No records imported. Errors: ' + errors.join('; ') }, 400);
    }
    
    return c.json({ 
      success: true, 
      data: { 
        imported, 
        errors: errors.length > 0 ? errors : undefined 
      } 
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to import file: ' + error.message }, 500);
  }
});

// Upload CSV/Excel data for leads
app.post('/api/leads/upload-csv', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.parseBody();
    const file = body['leadsFile'];
    
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'No file uploaded' }, 400);
    }
    
    const rows = await parseFileToRows(file as File);
    
    if (rows.length < 2) {
      return c.json({ success: false, error: 'File is empty or invalid' }, 400);
    }
    
    // Skip header row
    const dataRows = rows.slice(1);
    let imported = 0;
    let errors = [];
    
    for (let i = 0; i < dataRows.length; i++) {
      try {
        const values = dataRows[i].map(v => String(v || '').trim());
        
        // Expected format: customer_code, customer_name, mobile_number, alternate_mobile, 
        // location, company_name, gst_number, email, complete_address, status
        if (values.length < 3) {
          errors.push(`Row ${i + 2}: Insufficient columns (need at least customer_code, customer_name, mobile_number)`);
          continue;
        }
        
        const customer_code = values[0] || null;
        const customer_name = values[1];
        const mobile_number = values[2];
        const alternate_mobile = values[3] || null;
        const location = values[4] || null;
        const company_name = values[5] || null;
        const gst_number = values[6] || null;
        const email = values[7] || null;
        const complete_address = values[8] || null;
        const status = values[9] || 'New';
        
        if (!customer_name || !mobile_number) {
          errors.push(`Row ${i + 2}: Missing required fields (customer_name or mobile_number)`);
          continue;
        }
        
        await env.DB.prepare(`
          INSERT INTO leads (customer_code, customer_name, mobile_number, alternate_mobile, 
                            location, company_name, gst_number, email, complete_address, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          customer_code, customer_name, mobile_number, alternate_mobile, 
          location, company_name, gst_number, email, complete_address, status
        ).run();
        
        imported++;
      } catch (rowError) {
        errors.push(`Row ${i + 2}: ${rowError.message}`);
      }
    }
    
    if (errors.length > 0 && imported === 0) {
      return c.json({ success: false, error: 'No records imported. Errors: ' + errors.join('; ') }, 400);
    }
    
    return c.json({ 
      success: true, 
      data: { 
        imported, 
        errors: errors.length > 0 ? errors : undefined 
      } 
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to import file: ' + error.message }, 500);
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

// ===== QUOTATION API ENDPOINTS =====

// Search customer by code or phone from LEADS table
app.get('/api/customers/search/:query', async (c) => {
  const { env } = c;
  const query = c.req.param('query');
  
  try {
    let customer;
    
    // Logic: 1-4 digits = customer_code, 5+ digits = mobile number
    if (query.length <= 4) {
      // Search by customer_code
      customer = await env.DB.prepare(`
        SELECT * FROM leads WHERE customer_code = ? LIMIT 1
      `).bind(query).first();
    } else {
      // Search by mobile number
      customer = await env.DB.prepare(`
        SELECT * FROM leads WHERE mobile_number = ? LIMIT 1
      `).bind(query).first();
      
      // If not found by mobile, try alternate_mobile
      if (!customer) {
        customer = await env.DB.prepare(`
          SELECT * FROM leads WHERE alternate_mobile = ? LIMIT 1
        `).bind(query).first();
      }
      
      // If still not found, try customer_code as fallback
      if (!customer) {
        customer = await env.DB.prepare(`
          SELECT * FROM leads WHERE customer_code = ? LIMIT 1
        `).bind(query).first();
      }
    }
    
    if (!customer) {
      return c.json({ success: false, error: 'Customer not found' }, 404);
    }
    
    return c.json({ success: true, data: customer });
  } catch (error) {
    console.error('Customer search error:', error);
    return c.json({ success: false, error: 'Failed to search customer' }, 500);
  }
});

// Create new quotation
app.post('/api/quotations', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const {
      quotation_number,
      customer_code,
      customer_name,
      customer_contact,
      customer_email,
      company_name,
      gst_number,
      gst_registered_address,
      customer_address,
      concern_person_name,
      concern_person_contact,
      items,
      subtotal,
      courier_cost,
      courier_partner,
      delivery_method,
      bill_type,
      gst_amount,
      total_amount,
      theme,
      currency,
      notes,
      terms_conditions,
      created_by
    } = body;
    
    // Check if quotation already exists
    const existingQuotation = await env.DB.prepare(`
      SELECT quotation_number FROM quotations WHERE quotation_number = ?
    `).bind(quotation_number).first();
    
    if (existingQuotation) {
      // Update existing quotation
      await env.DB.prepare(`
        UPDATE quotations SET
          customer_code = ?, customer_name = ?, customer_contact = ?, customer_email = ?,
          company_name = ?, gst_number = ?, gst_registered_address = ?, customer_address = ?,
          concern_person_name = ?, concern_person_contact = ?,
          items = ?, subtotal = ?, courier_cost = ?, courier_partner = ?, delivery_method = ?,
          bill_type = ?, gst_amount = ?, total_amount = ?, theme = ?, currency = ?,
          notes = ?, terms_conditions = ?
        WHERE quotation_number = ?
      `).bind(
        customer_code || null,
        customer_name,
        customer_contact || null,
        customer_email || null,
        company_name || null,
        gst_number || null,
        gst_registered_address || null,
        customer_address || null,
        concern_person_name || null,
        concern_person_contact || null,
        JSON.stringify(items),
        subtotal,
        courier_cost || 0,
        courier_partner || null,
        delivery_method || null,
        bill_type || 'with',
        gst_amount,
        total_amount,
        theme || 'blue',
        currency || 'INR',
        notes || null,
        terms_conditions || null,
        quotation_number
      ).run();
      
      // Delete old quotation items
      await env.DB.prepare(`
        DELETE FROM quotation_items WHERE quotation_number = ?
      `).bind(quotation_number).run();
      
      // Insert new quotation items
      for (const item of items) {
        await env.DB.prepare(`
          INSERT INTO quotation_items (quotation_number, product_name, model, quantity, unit_price, amount)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          quotation_number, item.product_name, null, item.quantity, item.unit_price, item.amount
        ).run();
      }
    } else {
      // Insert new quotation
      await env.DB.prepare(`
        INSERT INTO quotations (
          quotation_number, customer_code, customer_name, customer_contact, customer_email,
          company_name, gst_number, gst_registered_address, customer_address, concern_person_name, concern_person_contact,
          items, subtotal, courier_cost, courier_partner, delivery_method, bill_type, gst_amount, total_amount, theme, currency, notes, terms_conditions, 
          created_by, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        quotation_number, 
        customer_code || null, 
        customer_name, 
        customer_contact || null, 
        customer_email || null,
        company_name || null,
        gst_number || null,
        gst_registered_address || null,
        customer_address || null, 
        concern_person_name || null, 
        concern_person_contact || null,
        JSON.stringify(items), 
        subtotal, 
        courier_cost || 0, 
        courier_partner || null,
        delivery_method || null,
        bill_type || 'with', 
        gst_amount, 
        total_amount,
        theme || 'blue',
        currency || 'INR', 
        notes || null, 
        terms_conditions || null,
        created_by || null,
        'draft'
      ).run();
      
      // Insert quotation items
      for (const item of items) {
        await env.DB.prepare(`
          INSERT INTO quotation_items (quotation_number, product_name, model, quantity, unit_price, amount)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          quotation_number, item.product_name, null, item.quantity, item.unit_price, item.amount
        ).run();
      }
    }
    
    return c.json({ success: true, quotation_number });
  } catch (error) {
    console.error('❌ Error creating quotation:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    return c.json({ success: false, error: 'Failed to create quotation', details: error.message }, 500);
  }
});

// Get all quotations
app.get('/api/quotations', async (c) => {
  const { env } = c;
  
  try {
    const quotations = await env.DB.prepare(`
      SELECT * FROM quotations ORDER BY created_at DESC
    `).all();
    
    return c.json({ success: true, data: quotations.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch quotations' }, 500);
  }
});

// Generate quotation number (must be before :id route)
app.get('/api/quotations/generate-number', async (c) => {
  const { env } = c;
  
  try {
    const latest = await env.DB.prepare(`
      SELECT quotation_number FROM quotations ORDER BY created_at DESC LIMIT 1
    `).first();
    
    let nextNumber = 1;
    if (latest && latest.quotation_number) {
      const match = latest.quotation_number.match(/Q(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }
    
    const quotationNumber = `Q${nextNumber.toString().padStart(4, '0')}`;
    return c.json({ success: true, quotation_number: quotationNumber });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to generate quotation number' }, 500);
  }
});

// Get single quotation
app.get('/api/quotations/:id', async (c) => {
  const { env } = c;
  const quotation_number = c.req.param('id');
  
  try {
    const quotation = await env.DB.prepare(`
      SELECT * FROM quotations WHERE quotation_number = ?
    `).bind(quotation_number).first();
    
    if (!quotation) {
      return c.json({ success: false, error: 'Quotation not found' }, 404);
    }
    
    // Parse items from JSON field (items are stored as JSON string in quotations.items)
    let items = [];
    try {
      items = JSON.parse(quotation.items || '[]');
    } catch (e) {
      console.error('Error parsing items:', e);
    }
    
    return c.json({
      success: true,
      data: {
        ...quotation,
        items: items
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch quotation' }, 500);
  }
});

// Update quotation
app.put('/api/quotations/:id', async (c) => {
  const { env } = c;
  const quotation_number = c.req.param('id');
  
  try {
    const body = await c.req.json();
    const {
      customer_code,
      customer_name,
      customer_contact,
      customer_email,
      company_name,
      customer_address,
      concern_person_name,
      concern_person_contact,
      items,
      subtotal,
      gst_amount,
      total_amount,
      notes,
      terms_conditions,
      status
    } = body;
    
    await env.DB.prepare(`
      UPDATE quotations 
      SET customer_code = ?, customer_name = ?, customer_contact = ?, customer_email = ?,
          company_name = ?, customer_address = ?, concern_person_name = ?, concern_person_contact = ?,
          items = ?, subtotal = ?, gst_amount = ?, total_amount = ?, 
          notes = ?, terms_conditions = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE quotation_number = ?
    `).bind(
      customer_code, customer_name, customer_contact, customer_email,
      company_name, customer_address, concern_person_name, concern_person_contact,
      JSON.stringify(items), subtotal, gst_amount, total_amount, 
      notes, terms_conditions, status, quotation_number
    ).run();
    
    // Delete old items and insert new ones
    await env.DB.prepare(`DELETE FROM quotation_items WHERE quotation_number = ?`).bind(quotation_number).run();
    
    for (const item of items) {
      await env.DB.prepare(`
        INSERT INTO quotation_items (quotation_number, product_name, model, quantity, unit_price, amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        quotation_number, item.product_name, null, item.quantity, item.unit_price, item.amount
      ).run();
    }
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update quotation' }, 500);
  }
});

// Delete quotation
app.delete('/api/quotations/:id', async (c) => {
  const { env } = c;
  const quotation_number = c.req.param('id');
  
  try {
    await env.DB.prepare(`DELETE FROM quotation_items WHERE quotation_number = ?`).bind(quotation_number).run();
    await env.DB.prepare(`DELETE FROM quotations WHERE quotation_number = ?`).bind(quotation_number).run();
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to delete quotation' }, 500);
  }
});

// Send quotation via email
app.post('/api/quotations/send-email', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { quotation_number, recipient_email, pdf_data } = body;
    
    if (!quotation_number || !recipient_email || !pdf_data) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }
    
    // Get quotation details
    const quotation = await env.DB.prepare(`
      SELECT * FROM quotations WHERE quotation_number = ?
    `).bind(quotation_number).first();
    
    if (!quotation) {
      return c.json({ success: false, error: 'Quotation not found' }, 404);
    }
    
    // Note: Email sending requires external service (SendGrid, Mailgun, etc.)
    // For now, we'll log the email and return success
    // In production, integrate with your preferred email service
    
    console.log('Email would be sent to:', recipient_email);
    console.log('Quotation:', quotation_number);
    console.log('PDF size:', pdf_data.length);
    
    // Log email in database
    await env.DB.prepare(`
      INSERT INTO email_log (quotation_number, recipient_email, sender_email, subject, status)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      quotation_number,
      recipient_email,
      'info.realtrack@gmail.com',
      'Quotation ' + quotation_number + ' from RealTrack Technology',
      'pending'
    ).run();
    
    // TODO: Integrate with email service
    // Example with SendGrid:
    // const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': 'Bearer ' + env.SENDGRID_API_KEY,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     personalizations: [{ to: [{ email: recipient_email }] }],
    //     from: { email: 'info.realtrack@gmail.com', name: 'RealTrack Technology' },
    //     subject: 'Quotation ' + quotation_number + ' from RealTrack Technology',
    //     content: [{
    //       type: 'text/html',
    //       value: '<p>Please find attached quotation.</p>'
    //     }],
    //     attachments: [{
    //       content: pdf_data,
    //       filename: 'Quotation_' + quotation_number + '.pdf',
    //       type: 'application/pdf',
    //       disposition: 'attachment'
    //     }]
    //   })
    // });
    
    return c.json({ 
      success: true, 
      message: 'Email feature is configured. Please contact administrator to set up email service (SendGrid, Mailgun, etc.)' 
    });
  } catch (error) {
    console.error('Error sending email:', error);
    return c.json({ success: false, error: 'Failed to send email' }, 500);
  }
});

// ===== PRODUCT CATEGORIES API ENDPOINTS =====

// Get all categories
app.get('/api/categories', async (c) => {
  const { env } = c;
  try {
    const categories = await env.DB.prepare(`SELECT * FROM product_categories ORDER BY category_name ASC`).all();
    return c.json({ success: true, data: categories.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch categories' }, 500);
  }
});

// Get products by category
app.get('/api/products/category/:categoryId', async (c) => {
  const { env } = c;
  const categoryId = c.req.param('categoryId');
  
  try {
    const products = await env.DB.prepare(`
      SELECT * FROM products WHERE category_id = ? ORDER BY product_name ASC
    `).bind(categoryId).all();
    return c.json({ success: true, data: products.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch products' }, 500);
  }
});

// Get all products
app.get('/api/products', async (c) => {
  const { env } = c;
  try {
    const products = await env.DB.prepare(`
      SELECT p.*, pc.category_name 
      FROM products p 
      LEFT JOIN product_categories pc ON p.category_id = pc.id 
      ORDER BY p.product_name ASC
    `).all();
    return c.json({ success: true, data: products.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch products' }, 500);
  }
});

// Get all courier rates
app.get('/api/courier-rates', async (c) => {
  const { env } = c;
  try {
    const rates = await env.DB.prepare(`
      SELECT * FROM courier_rates ORDER BY courier_partner ASC, delivery_method ASC
    `).all();
    return c.json({ success: true, data: rates.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch courier rates' }, 500);
  }
});

// Get courier rate by partner and method
app.get('/api/courier-rates/:partner/:method', async (c) => {
  const { env } = c;
  const partner = decodeURIComponent(c.req.param('partner'));
  const method = decodeURIComponent(c.req.param('method'));
  
  try {
    const rate = await env.DB.prepare(`
      SELECT * FROM courier_rates WHERE courier_partner = ? AND delivery_method = ?
    `).bind(partner, method).first();
    
    if (!rate) {
      return c.json({ success: false, error: 'Rate not found' }, 404);
    }
    
    return c.json({ success: true, data: rate });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch courier rate' }, 500);
  }
});

// Add new product
app.post('/api/products', async (c) => {
  const { env } = c;
  try {
    const body = await c.req.json();
    const { product_name, category_id, unit_price } = body;
    
    await env.DB.prepare(`
      INSERT INTO products (product_name, category_id, unit_price)
      VALUES (?, ?, ?)
    `).bind(product_name, category_id || null, unit_price || 0).run();
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to add product' }, 500);
  }
});

// ===== INVENTORY MANAGEMENT API ENDPOINTS =====

// Get all inventory
app.get('/api/inventory', async (c) => {
  const { env } = c;
  const status = c.req.query('status');
  const search = c.req.query('search');
  
  try {
    let query = 'SELECT * FROM inventory';
    const params = [];
    const conditions = [];
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (search) {
      conditions.push('(device_serial_no LIKE ? OR model_name LIKE ? OR customer_name LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY created_at DESC LIMIT 1000';
    
    const inventory = await env.DB.prepare(query).bind(...params).all();
    return c.json({ success: true, data: inventory.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch inventory' }, 500);
  }
});

// Get single inventory item by serial number
// Upload inventory from Excel
app.post('/api/inventory/upload', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { items } = body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return c.json({ success: false, error: 'No inventory items provided' }, 400);
    }
    
    let inserted = 0;
    let updated = 0;
    let failed = 0;
    
    for (const item of items) {
      try {
        // Check if device already exists
        const existing = await env.DB.prepare(`
          SELECT id FROM inventory WHERE device_serial_no = ?
        `).bind(item.device_serial_no).first();
        
        if (existing) {
          // Update existing
          await env.DB.prepare(`
            UPDATE inventory SET
              model_name = ?,
              in_date = ?,
              dispatch_date = ?,
              cust_code = ?,
              sale_date = ?,
              customer_name = ?,
              cust_city = ?,
              cust_mobile = ?,
              dispatch_reason = ?,
              warranty_provide = ?,
              old_serial_no = ?,
              license_renew_time = ?,
              user_id = ?,
              password = ?,
              account_activation_date = ?,
              account_expiry_date = ?,
              order_id = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE device_serial_no = ?
          `).bind(
            item.model_name,
            item.in_date || null,
            item.dispatch_date || null,
            item.cust_code || null,
            item.sale_date || null,
            item.customer_name || null,
            item.cust_city || null,
            item.cust_mobile || null,
            item.dispatch_reason || null,
            item.warranty_provide || null,
            item.old_serial_no || null,
            item.license_renew_time || null,
            item.user_id || null,
            item.password || null,
            item.account_activation_date || null,
            item.account_expiry_date || null,
            item.order_id || null,
            item.device_serial_no
          ).run();
          updated++;
        } else {
          // Insert new
          await env.DB.prepare(`
            INSERT INTO inventory (
              model_name, device_serial_no, in_date, dispatch_date, cust_code,
              sale_date, customer_name, cust_city, cust_mobile, dispatch_reason,
              warranty_provide, old_serial_no, license_renew_time, user_id, password,
              account_activation_date, account_expiry_date, order_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            item.model_name,
            item.device_serial_no,
            item.in_date || null,
            item.dispatch_date || null,
            item.cust_code || null,
            item.sale_date || null,
            item.customer_name || null,
            item.cust_city || null,
            item.cust_mobile || null,
            item.dispatch_reason || null,
            item.warranty_provide || null,
            item.old_serial_no || null,
            item.license_renew_time || null,
            item.user_id || null,
            item.password || null,
            item.account_activation_date || null,
            item.account_expiry_date || null,
            item.order_id || null,
            item.dispatch_date ? 'Dispatched' : 'In Stock'
          ).run();
          inserted++;
        }
      } catch (err) {
        failed++;
        console.error('Error processing item:', err);
      }
    }
    
    return c.json({ 
      success: true, 
      message: `Processed ${items.length} items: ${inserted} inserted, ${updated} updated, ${failed} failed`,
      stats: { inserted, updated, failed }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to upload inventory' }, 500);
  }
});

// Upload QC data and match with inventory
app.post('/api/inventory/upload-qc', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { items } = body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return c.json({ success: false, error: 'No QC items provided' }, 400);
    }
    
    let matched = 0;
    let notFound = 0;
    let qcInserted = 0;
    const notFoundDevices = [];
    
    for (const item of items) {
      try {
        const serialNo = item.device_serial_no || item['Device Serial Number'];
        if (!serialNo) {
          notFound++;
          continue;
        }
        
        // Find device in inventory
        const device = await env.DB.prepare(`
          SELECT id FROM inventory WHERE device_serial_no = ?
        `).bind(serialNo).first();
        
        if (device) {
          matched++;
          
          // Determine pass/fail from QC Status
          const qcStatus = item.qc_status || item['QC Status'] || '';
          const passFail = qcStatus.toLowerCase().includes('pass') ? 'Pass' : 
                          qcStatus.toLowerCase().includes('fail') ? 'Fail' : null;
          
          // Insert QC record
          await env.DB.prepare(`
            INSERT INTO quality_check (
              inventory_id, device_serial_no, check_date, checked_by,
              test_results, pass_fail, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            device.id,
            serialNo,
            item.dispatch_date || item['Dispatch Date'] || new Date().toISOString().split('T')[0],
            'Excel Upload',
            qcStatus,
            passFail,
            `Dispatch Reason: ${item.dispatch_reason || item['Dispatch Reason'] || 'N/A'}, Order: ${item.order_id || item['Order Id'] || 'N/A'}`
          ).run();
          qcInserted++;
          
          // Update inventory status if fail
          if (passFail === 'Fail') {
            await env.DB.prepare(`
              UPDATE inventory SET status = 'Defective', updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).bind(device.id).run();
            
            // Add to history
            await env.DB.prepare(`
              INSERT INTO inventory_status_history (
                inventory_id, device_serial_no, old_status, new_status,
                changed_by, change_reason
              ) VALUES (?, ?, ?, ?, ?, ?)
            `).bind(
              device.id, serialNo, 'Unknown', 'Defective',
              'QC Excel Upload', 'QC Failed'
            ).run();
          }
        } else {
          notFound++;
          notFoundDevices.push(serialNo);
        }
      } catch (err) {
        notFound++;
        console.error('Error processing QC item:', err);
      }
    }
    
    return c.json({ 
      success: true, 
      message: `Processed ${items.length} QC items: ${matched} matched, ${qcInserted} QC records inserted, ${notFound} not found`,
      stats: { matched, qcInserted, notFound },
      notFoundDevices: notFoundDevices.slice(0, 10) // Return first 10 not found
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to upload QC data' }, 500);
  }
});

// Upload Dispatch data and match with inventory
app.post('/api/inventory/upload-dispatch', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { items } = body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return c.json({ success: false, error: 'No dispatch items provided' }, 400);
    }
    
    let matched = 0;
    let notFound = 0;
    let dispatchInserted = 0;
    const notFoundDevices = [];
    
    for (const item of items) {
      try {
        const serialNo = item.device_serial_no || item['Device Serial Number'];
        if (!serialNo) {
          notFound++;
          continue;
        }
        
        // Find device in inventory
        const device = await env.DB.prepare(`
          SELECT id, status FROM inventory WHERE device_serial_no = ?
        `).bind(serialNo).first();
        
        if (device) {
          matched++;
          
          // Insert dispatch record
          await env.DB.prepare(`
            INSERT INTO dispatch_records (
              inventory_id, device_serial_no, dispatch_date, customer_name,
              customer_code, customer_mobile, customer_city, dispatch_reason,
              courier_name, tracking_number, dispatched_by, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            device.id,
            serialNo,
            item.dispatch_date || item['Dispatch Date'] || new Date().toISOString().split('T')[0],
            item.customer_name || item['Customer Name'] || null,
            item.cust_code || item['Cust Code'] || null,
            null, // customer_mobile not in your sheet
            null, // customer_city not in your sheet
            item.dispatch_reason || item['Dispatch Reason'] || null,
            item.courier_company || item['Courier Company'] || null,
            item.tracking_id || item['Tracking ID'] || null,
            'Excel Upload',
            `Order: ${item.order_id || item['Order Id'] || 'N/A'}, Company: ${item.company_name || item['Company Name'] || 'N/A'}`
          ).run();
          dispatchInserted++;
          
          // Update inventory status to Dispatched
          await env.DB.prepare(`
            UPDATE inventory 
            SET status = 'Dispatched', 
                dispatch_date = ?,
                customer_name = ?,
                cust_code = ?,
                dispatch_reason = ?,
                order_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            item.dispatch_date || item['Dispatch Date'] || null,
            item.customer_name || item['Customer Name'] || null,
            item.cust_code || item['Cust Code'] || null,
            item.dispatch_reason || item['Dispatch Reason'] || null,
            item.order_id || item['Order Id'] || null,
            device.id
          ).run();
          
          // Add to history
          await env.DB.prepare(`
            INSERT INTO inventory_status_history (
              inventory_id, device_serial_no, old_status, new_status,
              changed_by, change_reason
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            device.id, serialNo, device.status, 'Dispatched',
            'Dispatch Excel Upload', `Dispatched to ${item.customer_name || 'customer'}`
          ).run();
        } else {
          notFound++;
          notFoundDevices.push(serialNo);
        }
      } catch (err) {
        notFound++;
        console.error('Error processing dispatch item:', err);
      }
    }
    
    return c.json({ 
      success: true, 
      message: `Processed ${items.length} dispatch items: ${matched} matched, ${dispatchInserted} dispatch records inserted, ${notFound} not found`,
      stats: { matched, dispatchInserted, notFound },
      notFoundDevices: notFoundDevices.slice(0, 10) // Return first 10 not found
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to upload dispatch data' }, 500);
  }
});

// Dispatch device
app.post('/api/inventory/dispatch', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const {
      inventory_id,
      device_serial_no,
      dispatch_date,
      customer_name,
      customer_code,
      customer_mobile,
      customer_city,
      dispatch_reason,
      courier_name,
      tracking_number,
      notes
    } = body;
    
    // Get current user
    const username = c.req.header('X-User') || 'system';
    
    // Update inventory status
    await env.DB.prepare(`
      UPDATE inventory SET
        status = 'Dispatched',
        dispatch_date = ?,
        customer_name = ?,
        cust_code = ?,
        cust_mobile = ?,
        cust_city = ?,
        dispatch_reason = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(dispatch_date, customer_name, customer_code, customer_mobile, customer_city, dispatch_reason, inventory_id).run();
    
    // Create dispatch record
    await env.DB.prepare(`
      INSERT INTO dispatch_records (
        inventory_id, device_serial_no, dispatch_date, customer_name, customer_code,
        customer_mobile, customer_city, dispatch_reason, courier_name, tracking_number,
        dispatched_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      inventory_id, device_serial_no, dispatch_date, customer_name, customer_code,
      customer_mobile, customer_city, dispatch_reason, courier_name, tracking_number,
      username, notes
    ).run();
    
    // Log status change
    await env.DB.prepare(`
      INSERT INTO inventory_status_history (
        inventory_id, device_serial_no, old_status, new_status, changed_by, change_reason
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(inventory_id, device_serial_no, 'In Stock', 'Dispatched', username, dispatch_reason).run();
    
    return c.json({ success: true, message: 'Device dispatched successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to dispatch device' }, 500);
  }
});

// Get recent dispatches
app.get('/api/inventory/dispatches', async (c) => {
  const { env } = c;
  
  try {
    const dispatches = await env.DB.prepare(`
      SELECT 
        dr.*,
        i.model_name
      FROM dispatch_records dr
      LEFT JOIN inventory i ON dr.inventory_id = i.id
      ORDER BY dr.dispatch_date DESC
      LIMIT 50
    `).all();
    
    return c.json({ success: true, data: dispatches.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch dispatches' }, 500);
  }
});

// Submit quality check
app.post('/api/inventory/quality-check', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const {
      inventory_id,
      device_serial_no,
      check_date,
      pass_fail,
      test_results,
      notes
    } = body;
    
    // Get current user
    const username = c.req.header('X-User') || 'system';
    
    // Create quality check record
    await env.DB.prepare(`
      INSERT INTO quality_check (
        inventory_id, device_serial_no, check_date, checked_by,
        test_results, pass_fail, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      inventory_id, device_serial_no, check_date, username,
      test_results, pass_fail, notes
    ).run();
    
    // Update inventory status based on result
    const newStatus = pass_fail === 'Pass' ? 'In Stock' : 'Defective';
    await env.DB.prepare(`
      UPDATE inventory SET
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(newStatus, inventory_id).run();
    
    // Log status change
    await env.DB.prepare(`
      INSERT INTO inventory_status_history (
        inventory_id, device_serial_no, old_status, new_status, changed_by, change_reason
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(inventory_id, device_serial_no, 'Quality Check', newStatus, username, `QC Result: ${pass_fail}`).run();
    
    return c.json({ success: true, message: 'Quality check submitted successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to submit quality check' }, 500);
  }
});

// Get recent quality checks
app.get('/api/inventory/quality-checks', async (c) => {
  const { env } = c;
  
  try {
    const checks = await env.DB.prepare(`
      SELECT 
        qc.*,
        i.model_name
      FROM quality_check qc
      LEFT JOIN inventory i ON qc.inventory_id = i.id
      ORDER BY qc.check_date DESC
      LIMIT 50
    `).all();
    
    return c.json({ success: true, data: checks.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch quality checks' }, 500);
  }
});

// Get inventory reports/stats
app.get('/api/inventory/stats', async (c) => {
  const { env } = c;
  
  try {
    const stats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'In Stock' THEN 1 ELSE 0 END) as in_stock,
        SUM(CASE WHEN status = 'Dispatched' THEN 1 ELSE 0 END) as dispatched,
        SUM(CASE WHEN status = 'Quality Check' THEN 1 ELSE 0 END) as quality_check,
        SUM(CASE WHEN status = 'Defective' THEN 1 ELSE 0 END) as defective,
        SUM(CASE WHEN status = 'Returned' THEN 1 ELSE 0 END) as returned
      FROM inventory
    `).first();
    
    return c.json({ success: true, data: stats });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch stats' }, 500);
  }
});

// Get inventory activity history
app.get('/api/inventory/activity', async (c) => {
  const { env } = c;
  
  try {
    const activity = await env.DB.prepare(`
      SELECT * FROM inventory_status_history
      ORDER BY changed_at DESC
      LIMIT 100
    `).all();
    
    return c.json({ success: true, data: activity.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch activity' }, 500);
  }
});

// Get single device by serial number (MUST be after specific routes)
app.get('/api/inventory/:serialNo', async (c) => {
  const { env } = c;
  const serialNo = c.req.param('serialNo');
  
  try {
    const item = await env.DB.prepare(`
      SELECT * FROM inventory WHERE device_serial_no = ?
    `).bind(serialNo).first();
    
    if (!item) {
      return c.json({ success: false, error: 'Device not found' }, 404);
    }
    
    return c.json({ success: true, data: item });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch device' }, 500);
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
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
        <meta http-equiv="Pragma" content="no-cache">
        <meta http-equiv="Expires" content="0">
        <title>AxelGuard v3.1</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
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
            
            /* Collapsible Menu Styles */
            .sidebar-parent {
                padding: 15px 20px;
                border-bottom: 1px solid #e5e7eb;
                cursor: pointer;
                transition: all 0.3s;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-weight: 600;
                color: #374151;
            }
            
            .sidebar-parent:hover {
                background: #f3f4f6;
            }
            
            .sidebar-parent .chevron {
                transition: transform 0.3s;
                font-size: 12px;
            }
            
            .sidebar-parent.expanded .chevron {
                transform: rotate(180deg);
            }
            
            .sidebar-children {
                display: none;
                background: #f9fafb;
            }
            
            .sidebar-children.show {
                display: block;
            }
            
            .sidebar-child {
                padding: 12px 20px 12px 45px;
                border-bottom: 1px solid #e5e7eb;
                cursor: pointer;
                transition: all 0.3s;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 14px;
                color: #6b7280;
            }
            
            .sidebar-child:hover {
                background: #e5e7eb;
                padding-left: 50px;
                color: #374151;
            }
            
            .sidebar-child.active {
                background: #eef2ff;
                border-left: 4px solid #667eea;
                color: #667eea;
                font-weight: 500;
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
                overflow-y: visible;
                position: relative;
            }
            
            /* Make horizontal scrollbar always visible and sticky at bottom of viewport */
            .table-container::-webkit-scrollbar {
                height: 12px;
            }
            
            .table-container::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 6px;
            }
            
            .table-container::-webkit-scrollbar-thumb {
                background: #888;
                border-radius: 6px;
            }
            
            .table-container::-webkit-scrollbar-thumb:hover {
                background: #555;
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
            
            .alert-success {
                background-color: #d1fae5;
                color: #065f46;
                padding: 12px;
                border-radius: 6px;
                border: 1px solid #10b981;
            }
            
            .alert-error {
                background-color: #fee2e2;
                color: #991b1b;
                padding: 12px;
                border-radius: 6px;
                border: 1px solid #ef4444;
            }
            
            /* Tabs Styling */
            .tabs {
                display: flex;
                gap: 5px;
                margin-bottom: 20px;
            }
            
            .tab-btn {
                padding: 12px 24px;
                background: white;
                border: none;
                border-bottom: 3px solid transparent;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                color: #6b7280;
                transition: all 0.3s;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .tab-btn:hover {
                background: #f9fafb;
                color: #374151;
            }
            
            .tab-btn.active {
                color: #667eea;
                border-bottom-color: #667eea;
                background: #f9fafb;
            }
            
            .tab-content {
                animation: fadeIn 0.3s;
            }
            
            /* Autocomplete Dropdown Styling */
            .autocomplete-dropdown {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: white;
                border: 1px solid #d1d5db;
                border-top: none;
                border-radius: 0 0 6px 6px;
                max-height: 300px;
                overflow-y: auto;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                z-index: 1000;
                margin-top: -1px;
            }
            
            .autocomplete-item {
                padding: 12px 15px;
                cursor: pointer;
                border-bottom: 1px solid #f3f4f6;
                transition: background 0.2s;
            }
            
            .autocomplete-item:hover {
                background: #f3f4f6;
            }
            
            .autocomplete-item:last-child {
                border-bottom: none;
            }
            
            .autocomplete-item-title {
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 4px;
            }
            
            .autocomplete-item-subtitle {
                font-size: 12px;
                color: #6b7280;
            }
            
            .autocomplete-no-results {
                padding: 20px;
                text-align: center;
                color: #9ca3af;
                font-style: italic;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @media (max-width: 768px) {
                .chart-container {
                    grid-template-columns: 1fr;
                }
                
                .product-row {
                    grid-template-columns: 1fr;
                }
                
                .tabs {
                    flex-wrap: wrap;
                }
                
                .tab-btn {
                    padding: 10px 16px;
                    font-size: 13px;
                }
            }
            
            /* 3-Dot Dropdown Menu */
            .action-menu-container {
                position: relative;
                display: inline-block;
            }
            
            .action-dots-btn {
                background: none;
                border: none;
                cursor: pointer;
                padding: 8px 12px;
                font-size: 18px;
                color: #6b7280;
                transition: all 0.2s;
                border-radius: 4px;
                pointer-events: auto;
                position: relative;
                z-index: 10;
            }
            
            .action-dots-btn:hover {
                background: #f3f4f6;
                color: #1f2937;
            }
            
            .action-dropdown {
                display: none;
                position: absolute;
                right: 0;
                top: 100%;
                background: white;
                min-width: 160px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                border-radius: 8px;
                z-index: 9999;
                border: 1px solid #e5e7eb;
                overflow: hidden;
                margin-top: 4px;
                pointer-events: auto;
            }
            
            .action-dropdown.show {
                display: block;
            }
            
            .action-dropdown-item {
                padding: 10px 16px;
                cursor: pointer;
                transition: background 0.2s;
                color: #1f2937;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 10px;
                border: none;
                background: none;
                width: 100%;
                text-align: left;
            }
            
            .action-dropdown-item:hover {
                background: #f3f4f6;
            }
            
            .action-dropdown-item i {
                width: 16px;
                text-align: center;
            }
            
            .action-dropdown-item.delete {
                color: #dc2626;
            }
            
            .action-dropdown-item.delete:hover {
                background: #fee2e2;
            }
        </style>
    </head>
    <body>
        <!-- Login Screen -->
        <div id="loginScreen" class="login-container">
            <div class="login-box">
                <div style="text-align: center; margin-bottom: 30px;">
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                        <img src="/static/logo-blue.jpg" alt="AxelGuard" style="height: 50px; width: auto;">
                        <h1 style="color: #667eea; font-size: 32px;">AxelGuard</h1>
                    </div>
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
            </div>
        </div>

        <!-- Main Dashboard (hidden until logged in) -->
        <div id="mainDashboard" style="display: none;">
            <div class="top-bar">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="menu-toggle" onclick="toggleSidebar()">
                        <i class="fas fa-bars"></i>
                    </div>
                    <img src="/static/logo-white.jpg" alt="AxelGuard" onclick="showPage('dashboard')" style="height: 40px; width: auto; cursor: pointer;">
                    <h1 onclick="showPage('dashboard')" style="cursor: pointer; margin: 0;">
                        AxelGuard
                    </h1>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span id="userDisplay" style="font-size: 14px; color: white; font-weight: 500;"></span>
                    <button onclick="handleLogout()" class="btn-primary" style="padding: 8px 16px; font-size: 14px;">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>
            </div>

        <div class="sidebar" id="sidebar">
            <!-- Dashboard -->
            <div class="sidebar-item active" onclick="showPage('dashboard')">
                <i class="fas fa-chart-line"></i>
                <span>Dashboard</span>
            </div>
            
            <!-- Reports & Analytics -->
            <div class="sidebar-parent" onclick="toggleSubmenu('reports-menu')">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-chart-bar"></i>
                    <span>Reports & Analytics</span>
                </div>
                <i class="fas fa-chevron-down chevron"></i>
            </div>
            <div class="sidebar-children" id="reports-menu">
                <div class="sidebar-child" onclick="showPage('reports')">
                    <i class="fas fa-chart-pie"></i>
                    <span>Sales Reports</span>
                </div>
            </div>
            
            <!-- Search -->
            <div class="sidebar-parent" onclick="toggleSubmenu('search-menu')">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-search"></i>
                    <span>Search</span>
                </div>
                <i class="fas fa-chevron-down chevron"></i>
            </div>
            <div class="sidebar-children" id="search-menu">
                <div class="sidebar-child" onclick="showPage('customer-details')">
                    <i class="fas fa-users"></i>
                    <span>Customer Details</span>
                </div>
                <div class="sidebar-child" onclick="showPage('order-details')">
                    <i class="fas fa-search"></i>
                    <span>Order Details by Order ID</span>
                </div>
                <div class="sidebar-child" onclick="showPage('courier-calculation')">
                    <i class="fas fa-shipping-fast"></i>
                    <span>Courier Charges Calculator</span>
                </div>
            </div>
            
            <!-- Sale -->
            <div class="sidebar-parent" onclick="toggleSubmenu('sale-menu')">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-shopping-cart"></i>
                    <span>Sale</span>
                </div>
                <i class="fas fa-chevron-down chevron"></i>
            </div>
            <div class="sidebar-children" id="sale-menu">
                <div class="sidebar-child" onclick="showPage('current-month-sale')">
                    <i class="fas fa-calendar-alt"></i>
                    <span>Current Month Sale</span>
                </div>
                <div class="sidebar-child" onclick="showPage('balance-payment')">
                    <i class="fas fa-money-bill-wave"></i>
                    <span>Balance Payment</span>
                </div>
                <div class="sidebar-child" onclick="showPage('sale-database')">
                    <i class="fas fa-database"></i>
                    <span>Sale Database</span>
                </div>
                <div class="sidebar-child" onclick="showPage('quotations')">
                    <i class="fas fa-file-invoice"></i>
                    <span>Quotations</span>
                </div>
            </div>
            
            <!-- Leads Database (standalone) -->
            <div class="sidebar-item" onclick="showPage('leads')">
                <i class="fas fa-user-plus"></i>
                <span>Leads Database</span>
            </div>
            
            <!-- Inventory Management -->
            <div class="sidebar-parent" onclick="toggleSubmenu('inventory-menu')">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-boxes"></i>
                    <span>Inventory</span>
                </div>
                <i class="fas fa-chevron-down chevron"></i>
            </div>
            <div class="sidebar-children" id="inventory-menu">
                <div class="sidebar-child" onclick="showPage('inventory-stock')">
                    <i class="fas fa-warehouse"></i>
                    <span>Inventory Stock</span>
                </div>
                <div class="sidebar-child" onclick="showPage('dispatch')">
                    <i class="fas fa-shipping-fast"></i>
                    <span>Dispatch</span>
                </div>
                <div class="sidebar-child" onclick="showPage('quality-check')">
                    <i class="fas fa-clipboard-check"></i>
                    <span>Quality Check</span>
                </div>
                <div class="sidebar-child" onclick="showPage('inventory-reports')">
                    <i class="fas fa-chart-bar"></i>
                    <span>Reports</span>
                </div>
            </div>
            
            <!-- Settings -->
            <div class="sidebar-parent" onclick="toggleSubmenu('settings-menu')">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-cog"></i>
                    <span>Settings</span>
                </div>
                <i class="fas fa-chevron-down chevron"></i>
            </div>
            <div class="sidebar-children" id="settings-menu">
                <div class="sidebar-child" id="userManagementMenuItem" onclick="showPage('user-management')" style="display: none;">
                    <i class="fas fa-users-cog"></i>
                    <span>User Management</span>
                </div>
                <div class="sidebar-child" onclick="showPage('change-password')">
                    <i class="fas fa-key"></i>
                    <span>Change Password</span>
                </div>
                <div class="sidebar-child" id="excelUploadMenuItem" onclick="showPage('excel-upload')">
                    <i class="fas fa-file-excel"></i>
                    <span>Upload Excel Data</span>
                </div>
            </div>
        </div>

        <div class="main-content" id="mainContent">
            <div class="page-content active" id="dashboard-page">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="font-size: 24px; font-weight: 600; color: #1f2937;">Dashboard Overview</h2>
                    <div style="position: relative;">
                        <button class="btn-primary" onclick="toggleAddMenu()">
                            <i class="fas fa-plus"></i> Add New <i class="fas fa-chevron-down" style="margin-left: 5px; font-size: 12px;"></i>
                        </button>
                        <div class="action-menu" id="actionMenu">
                            <div class="action-menu-item" onclick="openNewSaleModal()">
                                <i class="fas fa-shopping-cart"></i> New Sale
                            </div>
                            <div class="action-menu-item" onclick="openNewQuotationModal()">
                                <i class="fas fa-file-invoice"></i> New Quotation
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
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; padding: 10px 0;">
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
                        <label>Enter Order ID (7 digits, e.g., 2019899)</label>
                        <input type="text" id="searchOrderId" placeholder="Enter 7-digit Order ID (e.g., 2019899)" onkeypress="if(event.key === 'Enter') searchOrder()">
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
                    
                    <!-- Search Box with Autocomplete -->
                    <div style="margin-bottom: 20px; position: relative;">
                        <input 
                            type="text" 
                            id="customerSearchInput" 
                            placeholder="Search by Customer Code or Mobile Number..." 
                            style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;"
                            oninput="searchCustomerWithAutocomplete()"
                            onfocus="showCustomerSearchDropdown()"
                        >
                        <div id="customerSearchDropdown" class="autocomplete-dropdown" style="display: none;">
                            <!-- Autocomplete results will appear here -->
                        </div>
                    </div>
                    
                    <div id="customerDetailsResult" style="display: none;">
                        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Customer Information</h3>
                            <div id="customerInfo"></div>
                        </div>
                        
                        <div>
                            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Sales History</h3>
                            <div class="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Order ID</th>
                                            <th>Date</th>
                                            <th>Products</th>
                                            <th>Total Amount</th>
                                            <th>Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody id="customerSalesTableBody">
                                    </tbody>
                                </table>
                            </div>
                        </div>
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
                    
                    <!-- Search Box with Autocomplete -->
                    <div style="margin-bottom: 20px; position: relative;">
                        <input 
                            type="text" 
                            id="saleSearchInput" 
                            placeholder="Search by Customer Name, Company, Order ID, or Mobile Number..." 
                            style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;"
                            oninput="searchSalesWithAutocomplete()"
                            onfocus="showSaleSearchDropdown()"
                        >
                        <div id="saleSearchDropdown" class="autocomplete-dropdown" style="display: none;">
                            <!-- Autocomplete results will appear here -->
                        </div>
                    </div>
                    
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

            <div class="page-content" id="quotations-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Quotations</h2>
                    
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Quotation #</th>
                                    <th>Date</th>
                                    <th>Customer Name</th>
                                    <th>Company</th>
                                    <th>Total Amount</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="quotationsTableBody">
                                <tr><td colspan="7" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="page-content" id="balance-payment-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Balance Payments</h2>
                    
                    <!-- Search Bar -->
                    <div style="margin-bottom: 20px;">
                        <input 
                            type="text" 
                            id="balancePaymentSearch" 
                            placeholder="Search by Customer Name, Company, Order ID (7 digits), or Mobile Number..." 
                            style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;"
                            oninput="filterBalancePayments()"
                        >
                    </div>
                    
                    <!-- Tabs -->
                    <div class="tabs" style="margin-bottom: 20px; border-bottom: 2px solid #e5e7eb;">
                        <button class="tab-btn active" onclick="switchBalancePaymentTab('pending')" id="pending-balance-tab">
                            <i class="fas fa-clock"></i> Pending Payments
                        </button>
                        <button class="tab-btn" onclick="switchBalancePaymentTab('history')" id="history-balance-tab">
                            <i class="fas fa-history"></i> Payment History
                        </button>
                    </div>
                    
                    <!-- Pending Payments Tab -->
                    <div id="pending-balance-content" class="tab-content">
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Order ID</th>
                                        <th>Date</th>
                                        <th>Customer Name</th>
                                        <th>Company Name</th>
                                        <th>Employee</th>
                                        <th>Contact</th>
                                        <th>Total Amount</th>
                                        <th>Received</th>
                                        <th>Balance</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody id="balancePaymentTableBody">
                                    <tr><td colspan="10" class="loading">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <!-- Payment History Tab -->
                    <div id="history-balance-content" class="tab-content" style="display: none;">
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Order ID</th>
                                        <th>Customer Name</th>
                                        <th>Company Name</th>
                                        <th>Payment Date</th>
                                        <th>Amount</th>
                                        <th>Account</th>
                                        <th>Payment Reference</th>
                                    </tr>
                                </thead>
                                <tbody id="balancePaymentHistoryTableBody">
                                    <tr><td colspan="7" class="loading">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-content" id="leads-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">Leads Database</h2>
                    
                    <!-- Search Box -->
                    <div style="margin-bottom: 20px;">
                        <input 
                            type="text" 
                            id="leadSearchInput" 
                            placeholder="Search by Customer Code, Name, or Mobile Number..." 
                            style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;"
                            oninput="searchLeads()"
                        >
                    </div>
                    
                    <div class="table-container">
                        <table>
                            <thead style="position: sticky; top: 0; background: white; z-index: 10;">
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

            <!-- Inventory Stock Page -->
            <div class="page-content" id="inventory-stock-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">
                        <i class="fas fa-warehouse"></i> Inventory Stock Management
                    </h2>
                    
                    <!-- Upload Excel Sections -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                        
                        <!-- 1. Inventory Data Upload -->
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; color: white;">
                            <h3 style="margin-bottom: 10px; font-size: 18px;">
                                <i class="fas fa-warehouse"></i> Inventory Data
                            </h3>
                            <p style="margin-bottom: 15px; opacity: 0.9; font-size: 13px;">Upload device inventory with 19 columns</p>
                            <form id="inventoryUploadForm" onsubmit="uploadInventoryExcel(event)">
                                <input type="file" name="inventoryFile" accept=".xlsx,.xls,.csv" required 
                                       style="width: 100%; padding: 8px; border: 2px solid rgba(255,255,255,0.3); border-radius: 6px; background: rgba(255,255,255,0.15); color: white; margin-bottom: 10px; font-size: 12px;">
                                <button type="submit" class="btn-primary" style="width: 100%; background: white; color: #667eea; padding: 8px 16px; font-size: 13px;">
                                    <i class="fas fa-upload"></i> Upload Inventory
                                </button>
                            </form>
                        </div>
                        
                        <!-- 2. QC Data Upload -->
                        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; border-radius: 12px; color: white;">
                            <h3 style="margin-bottom: 10px; font-size: 18px;">
                                <i class="fas fa-clipboard-check"></i> QC Data
                            </h3>
                            <p style="margin-bottom: 15px; opacity: 0.9; font-size: 13px;">Upload quality check results and match devices</p>
                            <form id="qcUploadForm" onsubmit="uploadQCExcel(event)">
                                <input type="file" name="qcFile" accept=".xlsx,.xls,.csv" required 
                                       style="width: 100%; padding: 8px; border: 2px solid rgba(255,255,255,0.3); border-radius: 6px; background: rgba(255,255,255,0.15); color: white; margin-bottom: 10px; font-size: 12px;">
                                <button type="submit" class="btn-primary" style="width: 100%; background: white; color: #10b981; padding: 8px 16px; font-size: 13px;">
                                    <i class="fas fa-upload"></i> Upload QC Data
                                </button>
                            </form>
                        </div>
                        
                        <!-- 3. Dispatch Data Upload -->
                        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 20px; border-radius: 12px; color: white;">
                            <h3 style="margin-bottom: 10px; font-size: 18px;">
                                <i class="fas fa-shipping-fast"></i> Dispatch Data
                            </h3>
                            <p style="margin-bottom: 15px; opacity: 0.9; font-size: 13px;">Upload dispatch records and match devices</p>
                            <form id="dispatchUploadForm" onsubmit="uploadDispatchExcel(event)">
                                <input type="file" name="dispatchFile" accept=".xlsx,.xls,.csv" required 
                                       style="width: 100%; padding: 8px; border: 2px solid rgba(255,255,255,0.3); border-radius: 6px; background: rgba(255,255,255,0.15); color: white; margin-bottom: 10px; font-size: 12px;">
                                <button type="submit" class="btn-primary" style="width: 100%; background: white; color: #3b82f6; padding: 8px 16px; font-size: 13px;">
                                    <i class="fas fa-upload"></i> Upload Dispatch Data
                                </button>
                            </form>
                        </div>
                        
                    </div>
                    
                    <!-- Expected Columns Info -->
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 12px;">
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                            <div>
                                <strong style="color: #667eea;">Inventory Columns:</strong>
                                <div style="color: #6b7280; margin-top: 5px;">Device Serial Number, Model Name, In Date, Customer Name, Order Id, etc.</div>
                            </div>
                            <div>
                                <strong style="color: #10b981;">QC Columns:</strong>
                                <div style="color: #6b7280; margin-top: 5px;">Device Serial Number, Device Name, QC Status, Dispatch Reason, Order Id</div>
                            </div>
                            <div>
                                <strong style="color: #3b82f6;">Dispatch Columns:</strong>
                                <div style="color: #6b7280; margin-top: 5px;">Device Serial Number, Customer Name, Dispatch Date, Courier Company, Tracking ID</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Search and Filter -->
                    <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                        <input type="text" id="inventorySearchInput" placeholder="Search by Serial No, Model, Customer..." 
                               oninput="searchInventory()"
                               style="flex: 1; min-width: 300px; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px;">
                        <select id="inventoryStatusFilter" onchange="filterInventoryByStatus()"
                                style="padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; min-width: 150px;">
                            <option value="">All Status</option>
                            <option value="In Stock">In Stock</option>
                            <option value="Dispatched">Dispatched</option>
                            <option value="Quality Check">Quality Check</option>
                            <option value="Defective">Defective</option>
                            <option value="Returned">Returned</option>
                        </select>
                    </div>
                    
                    <!-- Inventory Table -->
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>S.No</th>
                                    <th>Serial No</th>
                                    <th>Model</th>
                                    <th>In Date</th>
                                    <th>Status</th>
                                    <th>Customer</th>
                                    <th>Dispatch Date</th>
                                    <th>Order ID</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="inventoryTableBody">
                                <tr><td colspan="9" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Dispatch Page -->
            <div class="page-content" id="dispatch-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">
                        <i class="fas fa-shipping-fast"></i> Dispatch Management
                    </h2>
                    
                    <!-- Barcode Scanner Section -->
                    <div style="background: #f0f9ff; padding: 25px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
                        <h3 style="margin-bottom: 15px; font-size: 18px; color: #1f2937;">
                            <i class="fas fa-barcode"></i> Scan Device Serial Number
                        </h3>
                        <form onsubmit="scanDeviceForDispatch(event)" style="display: flex; gap: 10px;">
                            <input type="text" id="dispatchScanInput" placeholder="Scan or enter device serial number..." 
                                   style="flex: 1; padding: 12px; border: 2px solid #3b82f6; border-radius: 6px; font-size: 16px;"
                                   autofocus>
                            <button type="submit" class="btn-primary" style="padding: 12px 24px;">
                                <i class="fas fa-search"></i> Find Device
                            </button>
                        </form>
                    </div>
                    
                    <!-- Device Info & Dispatch Form -->
                    <div id="dispatchFormSection" style="display: none;">
                        <div class="card" style="background: #f9fafb; margin-bottom: 20px;">
                            <h4 style="margin-bottom: 15px; color: #1f2937;">Device Information</h4>
                            <div id="deviceInfoDisplay"></div>
                        </div>
                        
                        <form id="dispatchForm" onsubmit="submitDispatch(event)">
                            <input type="hidden" id="dispatchInventoryId" name="inventory_id">
                            <input type="hidden" id="dispatchSerialNo" name="device_serial_no">
                            
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                                <div class="form-group">
                                    <label>Dispatch Date *</label>
                                    <input type="date" name="dispatch_date" required>
                                </div>
                                <div class="form-group">
                                    <label>Customer Name *</label>
                                    <input type="text" name="customer_name" required>
                                </div>
                                <div class="form-group">
                                    <label>Customer Code</label>
                                    <input type="text" name="customer_code">
                                </div>
                                <div class="form-group">
                                    <label>Customer Mobile *</label>
                                    <input type="tel" name="customer_mobile" required>
                                </div>
                                <div class="form-group">
                                    <label>Customer City</label>
                                    <input type="text" name="customer_city">
                                </div>
                                <div class="form-group">
                                    <label>Dispatch Reason</label>
                                    <select name="dispatch_reason">
                                        <option value="New Sale">New Sale</option>
                                        <option value="Replacement">Replacement</option>
                                        <option value="Repair">Repair</option>
                                        <option value="Demo">Demo</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Courier Name</label>
                                    <input type="text" name="courier_name">
                                </div>
                                <div class="form-group">
                                    <label>Tracking Number</label>
                                    <input type="text" name="tracking_number">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Notes</label>
                                <textarea name="notes" rows="3"></textarea>
                            </div>
                            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                                <button type="button" class="btn-secondary" onclick="cancelDispatch()">Cancel</button>
                                <button type="submit" class="btn-primary">
                                    <i class="fas fa-check"></i> Confirm Dispatch
                                </button>
                            </div>
                        </form>
                    </div>
                    
                    <!-- Recent Dispatches -->
                    <div style="margin-top: 30px;">
                        <h3 style="margin-bottom: 15px; color: #1f2937;">
                            <i class="fas fa-history"></i> Recent Dispatches
                        </h3>
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Dispatch Date</th>
                                        <th>Serial No</th>
                                        <th>Model</th>
                                        <th>Customer</th>
                                        <th>City</th>
                                        <th>Reason</th>
                                        <th>Courier</th>
                                    </tr>
                                </thead>
                                <tbody id="recentDispatchesBody">
                                    <tr><td colspan="7" class="loading">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quality Check Page -->
            <div class="page-content" id="quality-check-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">
                        <i class="fas fa-clipboard-check"></i> Quality Check
                    </h2>
                    
                    <!-- Barcode Scanner Section -->
                    <div style="background: #f0fdf4; padding: 25px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid #10b981;">
                        <h3 style="margin-bottom: 15px; font-size: 18px; color: #1f2937;">
                            <i class="fas fa-barcode"></i> Scan Device for Quality Check
                        </h3>
                        <form onsubmit="scanDeviceForQC(event)" style="display: flex; gap: 10px;">
                            <input type="text" id="qcScanInput" placeholder="Scan or enter device serial number..." 
                                   style="flex: 1; padding: 12px; border: 2px solid #10b981; border-radius: 6px; font-size: 16px;"
                                   autofocus>
                            <button type="submit" class="btn-primary" style="background: #10b981;">
                                <i class="fas fa-search"></i> Find Device
                            </button>
                        </form>
                    </div>
                    
                    <!-- QC Form -->
                    <div id="qcFormSection" style="display: none;">
                        <div class="card" style="background: #f9fafb; margin-bottom: 20px;">
                            <h4 style="margin-bottom: 15px; color: #1f2937;">Device Information</h4>
                            <div id="qcDeviceInfoDisplay"></div>
                        </div>
                        
                        <form id="qcForm" onsubmit="submitQualityCheck(event)">
                            <input type="hidden" id="qcInventoryId" name="inventory_id">
                            <input type="hidden" id="qcSerialNo" name="device_serial_no">
                            
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                                <div class="form-group">
                                    <label>Check Date *</label>
                                    <input type="date" name="check_date" required>
                                </div>
                                <div class="form-group">
                                    <label>Result *</label>
                                    <select name="pass_fail" required>
                                        <option value="">Select Result</option>
                                        <option value="Pass">Pass</option>
                                        <option value="Fail">Fail</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Test Results</label>
                                <textarea name="test_results" rows="3" placeholder="Enter test results..."></textarea>
                            </div>
                            <div class="form-group">
                                <label>Notes</label>
                                <textarea name="notes" rows="3" placeholder="Additional notes..."></textarea>
                            </div>
                            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                                <button type="button" class="btn-secondary" onclick="cancelQC()">Cancel</button>
                                <button type="submit" class="btn-primary" style="background: #10b981;">
                                    <i class="fas fa-check"></i> Submit Quality Check
                                </button>
                            </div>
                        </form>
                    </div>
                    
                    <!-- Recent QC Records -->
                    <div style="margin-top: 30px;">
                        <h3 style="margin-bottom: 15px; color: #1f2937;">
                            <i class="fas fa-history"></i> Recent Quality Checks
                        </h3>
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Check Date</th>
                                        <th>Serial No</th>
                                        <th>Model</th>
                                        <th>Result</th>
                                        <th>Checked By</th>
                                        <th>Notes</th>
                                    </tr>
                                </thead>
                                <tbody id="recentQCBody">
                                    <tr><td colspan="6" class="loading">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Inventory Reports Page -->
            <div class="page-content" id="inventory-reports-page">
                <div class="card">
                    <h2 class="card-title" style="margin-bottom: 20px;">
                        <i class="fas fa-chart-bar"></i> Inventory Reports
                    </h2>
                    
                    <!-- Summary Cards -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
                        <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <div style="padding: 10px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                    <i class="fas fa-boxes"></i> Total Inventory
                                </div>
                                <div style="font-size: 32px; font-weight: 700;" id="reportTotalInventory">0</div>
                            </div>
                        </div>
                        <div class="card" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;">
                            <div style="padding: 10px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                    <i class="fas fa-warehouse"></i> In Stock
                                </div>
                                <div style="font-size: 32px; font-weight: 700;" id="reportInStock">0</div>
                            </div>
                        </div>
                        <div class="card" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white;">
                            <div style="padding: 10px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                    <i class="fas fa-shipping-fast"></i> Dispatched
                                </div>
                                <div style="font-size: 32px; font-weight: 700;" id="reportDispatched">0</div>
                            </div>
                        </div>
                        <div class="card" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white;">
                            <div style="padding: 10px;">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                    <i class="fas fa-clipboard-check"></i> Quality Check
                                </div>
                                <div style="font-size: 32px; font-weight: 700;" id="reportQualityCheck">0</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Status Distribution Chart -->
                    <div class="card" style="margin-bottom: 30px;">
                        <div class="card-header">
                            <h3 class="card-title">Inventory Status Distribution</h3>
                        </div>
                        <div style="height: 350px; padding: 20px;">
                            <canvas id="inventoryStatusChart"></canvas>
                        </div>
                    </div>
                    
                    <!-- Recent Activity -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Recent Activity</h3>
                        </div>
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Serial No</th>
                                        <th>Action</th>
                                        <th>Old Status</th>
                                        <th>New Status</th>
                                        <th>Changed By</th>
                                    </tr>
                                </thead>
                                <tbody id="inventoryActivityBody">
                                    <tr><td colspan="6" class="loading">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
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
                                <p style="color: #6b7280; font-size: 14px;">Upload CSV or Excel file containing sales records</p>
                            </div>
                            <form id="salesCSVForm" onsubmit="uploadSalesCSV(event)">
                                <div class="form-group">
                                    <label>Select CSV or Excel File *</label>
                                    <input type="file" name="salesFile" accept=".csv,.xlsx,.xls" required style="padding: 8px;">
                                </div>
                                <button type="submit" class="btn-primary" style="width: 100%;">
                                    <i class="fas fa-upload"></i> Upload Sales Data
                                </button>
                            </form>
                            <div id="salesUploadStatus" style="margin-top: 15px; padding: 10px; border-radius: 6px; display: none;"></div>
                            
                            <div style="margin-top: 25px; padding: 15px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                                <h4 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 10px;">Expected CSV Format (Column Order):</h4>
                                <div style="font-size: 12px; color: #6b7280; line-height: 1.6;">
                                    <p><strong>Headers:</strong> S.No, Month, Order Id, Sale Date, Cust Code, Sale Done By, Company Name, Customer Name, Mobile Number, Bill Amount, Amount Rcd, Balnc Payment, Round Off, With Bill, Billing Status, Yes or no, Blank1, P1 Code, 1st Product, P1 Qtty, P1 Rate, Blank2, P2 Code, 2nd Product, P2 Qtty, P2 Rate, Blank3, P3 Code, 3rd Product, P3 Qtty, P3 Rate, Blank5, P4 Code, 4rth Product, P4 Qtty, P4 Rate, Blank6, P5 Code, 5th Product, P5 Qtty, P5 Rate, Blank7, P6 Code, 6th Product, P6 Qtty, P6 Rate, 7th Product, P7 Quantity, P7 Rate, 8th Product, P8 Quantity, P8 Rate, 9th Product, P9 Quantity, P9 Rate, 10th Product, P10 Quantity, P10 Rate, Courier, Total Sale Amount, Transaction Reference Number, Remarks, Payment 1 received, Payment 2 received, Payment 3 received, Payment 4 received, Payment 5 received, Payment 6 received</p>
                                    <p style="margin-top: 10px;"><strong>Key Columns:</strong> Cust Code, Sale Date, Sale Done By, Customer Name, Mobile, Company Name, Bill Amount, Amount Rcd, Balance Payment, Products (up to 10 with Code/Name/Quantity/Rate)</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Leads Upload Section -->
                        <div style="border: 2px dashed #e5e7eb; border-radius: 8px; padding: 30px; background: #f9fafb;">
                            <div style="text-align: center; margin-bottom: 20px;">
                                <i class="fas fa-file-csv" style="font-size: 48px; color: #3b82f6; margin-bottom: 15px;"></i>
                                <h3 style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 10px;">Upload Leads Data</h3>
                                <p style="color: #6b7280; font-size: 14px;">Upload CSV or Excel file containing lead records</p>
                            </div>
                            <form id="leadsCSVForm" onsubmit="uploadLeadsCSV(event)">
                                <div class="form-group">
                                    <label>Select CSV or Excel File *</label>
                                    <input type="file" name="leadsFile" accept=".csv,.xlsx,.xls" required style="padding: 8px;">
                                </div>
                                <button type="submit" class="btn-primary" style="width: 100%;">
                                    <i class="fas fa-upload"></i> Upload Leads Data
                                </button>
                            </form>
                            <div id="leadsUploadStatus" style="margin-top: 15px; padding: 10px; border-radius: 6px; display: none;"></div>
                            
                            <div style="margin-top: 25px; padding: 15px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                                <h4 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 10px;">Expected CSV Format (Column Order):</h4>
                                <div style="font-size: 12px; color: #6b7280; line-height: 1.6;">
                                    <p><strong>Headers:</strong> Cust Code, Date, Customer Name, Location, Mobile Number, Follow Up Person, Remarks, Cust Email id, Company Name, GST Number, Company Address</p>
                                    <p style="margin-top: 10px;"><strong>All columns are required</strong> as per your Google Sheets format</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Reports & Analytics Page -->
            <div class="page-content" id="reports-page">
                <h2 style="font-size: 24px; font-weight: 600; color: #1f2937; margin-bottom: 20px;">
                    <i class="fas fa-chart-bar"></i> Reports & Analytics
                </h2>
                
                <!-- Summary Cards -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
                    <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                        <div style="padding: 10px;">
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                <i class="fas fa-calendar-alt"></i> Current Month Sales
                            </div>
                            <div style="font-size: 32px; font-weight: 700;" id="reportCurrentMonth">₹0</div>
                        </div>
                    </div>
                    
                    <div class="card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white;">
                        <div style="padding: 10px;">
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                <i class="fas fa-arrow-left"></i> Previous Month Sales
                            </div>
                            <div style="font-size: 32px; font-weight: 700;" id="reportPreviousMonth">₹0</div>
                        </div>
                    </div>
                    
                    <div class="card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white;">
                        <div style="padding: 10px;">
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                <i class="fas fa-calendar-check"></i> Quarterly Sales
                            </div>
                            <div style="font-size: 32px; font-weight: 700;" id="reportQuarterly">₹0</div>
                        </div>
                    </div>
                    
                    <div class="card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white;">
                        <div style="padding: 10px;">
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                <i class="fas fa-chart-line"></i> YTD Sales
                            </div>
                            <div style="font-size: 32px; font-weight: 700;" id="reportYTD">₹0</div>
                        </div>
                    </div>
                </div>
                
                <!-- Month Comparison Chart -->
                <div class="card" style="margin-bottom: 30px;">
                    <div class="card-header">
                        <h3 class="card-title">Current vs Previous Month Comparison</h3>
                    </div>
                    <div style="max-height: 350px; padding: 20px;">
                        <canvas id="monthComparisonChart"></canvas>
                    </div>
                </div>
                
                <!-- Employee-wise Sales Report -->
                <div class="card" style="margin-bottom: 30px;">
                    <div class="card-header">
                        <h3 class="card-title">Employee-wise Sales Report</h3>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Employee Name</th>
                                    <th>Current Month Sales</th>
                                    <th>Previous Month Sales</th>
                                    <th>Growth %</th>
                                    <th>Total Sales Count</th>
                                    <th>Average Sale Value</th>
                                </tr>
                            </thead>
                            <tbody id="employeeReportTableBody">
                                <tr><td colspan="6" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Employee Month-on-Month Sales Chart (Current Year) -->
                <div class="card" style="margin-bottom: 30px;">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-chart-line"></i> Employee Monthly Sales Trend (Current Year)</h3>
                    </div>
                    <div style="height: 400px; padding: 20px;">
                        <canvas id="employeeMonthlyChart"></canvas>
                    </div>
                </div>
                
                <!-- Product-wise Sales Analysis -->
                <div class="card" style="margin-bottom: 30px;">
                    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="card-title">
                            <i class="fas fa-box"></i> Product-wise Sales Analysis (Current Month)
                        </h3>
                        <button onclick="downloadProductAnalysisExcel()" class="btn-primary" style="padding: 8px 16px; font-size: 14px;">
                            <i class="fas fa-file-excel"></i> Download Excel
                        </button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Product Name</th>
                                    <th>Total Quantity Sold</th>
                                    <th>Total Revenue</th>
                                    <th>Average Price</th>
                                    <th>Number of Orders</th>
                                </tr>
                            </thead>
                            <tbody id="productReportTableBody">
                                <tr><td colspan="5" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Customer-wise Sales Analysis -->
                <div class="card" style="margin-bottom: 30px;">
                    <div class="card-header">
                        <h3 class="card-title">
                            <i class="fas fa-users"></i> Top Customers (Current Month)
                        </h3>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Customer Name</th>
                                    <th>Company</th>
                                    <th>Total Purchases</th>
                                    <th>Number of Orders</th>
                                    <th>Average Order Value</th>
                                    <th>Balance Pending</th>
                                </tr>
                            </thead>
                            <tbody id="customerReportTableBody">
                                <tr><td colspan="6" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Incentive Calculation -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">
                            <i class="fas fa-gift"></i> Incentive Calculation (Current Month)
                        </h3>
                        <p style="color: #6b7280; font-size: 14px; margin-top: 5px;">
                            Target: ₹5,50,000 per employee | Incentive: 1% of sales without tax (if target exceeded)
                        </p>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Employee Name</th>
                                    <th>Sales without Tax</th>
                                    <th>Target Amount</th>
                                    <th>Achievement %</th>
                                    <th>Status</th>
                                    <th>Incentive Earned</th>
                                </tr>
                            </thead>
                            <tbody id="incentiveTableBody">
                                <tr><td colspan="6" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Incentive History -->
                <div class="card" style="margin-top: 30px;">
                    <div class="card-header">
                        <h3 class="card-title">
                            <i class="fas fa-history"></i> Previous Incentive History
                        </h3>
                        <p style="color: #6b7280; font-size: 14px; margin-top: 5px;">
                            Historical incentive records for all employees (past 12 months)
                        </p>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Month & Year</th>
                                    <th>Employee Name</th>
                                    <th>Sales without Tax</th>
                                    <th>Target Amount</th>
                                    <th>Achievement %</th>
                                    <th>Incentive Earned</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="incentiveHistoryTableBody">
                                <tr><td colspan="7" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Change Password Page -->
            <div class="page-content" id="change-password-page">
                <div class="card" style="max-width: 600px; margin: 0 auto;">
                    <h2 class="card-title" style="margin-bottom: 20px;">
                        <i class="fas fa-key"></i> Change Password
                    </h2>
                    
                    <form id="changePasswordForm" onsubmit="changePassword(event)">
                        <div class="form-group">
                            <label>Current Password *</label>
                            <input type="password" id="currentPassword" required placeholder="Enter current password">
                        </div>
                        
                        <div class="form-group">
                            <label>New Password *</label>
                            <input type="password" id="newPassword" required minlength="6" placeholder="Enter new password (min 6 characters)">
                        </div>
                        
                        <div class="form-group">
                            <label>Confirm New Password *</label>
                            <input type="password" id="confirmPassword" required minlength="6" placeholder="Re-enter new password">
                        </div>
                        
                        <div id="passwordChangeStatus" style="display: none; margin-bottom: 15px; padding: 10px; border-radius: 6px;"></div>
                        
                        <button type="submit" class="btn-primary">
                            <i class="fas fa-save"></i> Change Password
                        </button>
                    </form>
                </div>
            </div>

            <!-- User Management Page (Admin Only) -->
            <div class="page-content" id="user-management-page">
                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 class="card-title" style="margin: 0;">
                            <i class="fas fa-users-cog"></i> User Management
                        </h2>
                        <button class="btn-primary" onclick="openCreateUserModal()">
                            <i class="fas fa-user-plus"></i> Create New User
                        </button>
                    </div>
                    
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Username</th>
                                    <th>Full Name</th>
                                    <th>Role</th>
                                    <th>Employee Name</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="usersTableBody">
                                <tr><td colspan="8" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
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
                            <label>Customer Code *</label>
                            <input type="text" id="newSaleCustomerCode" name="customer_code" required placeholder="Enter customer code" onblur="fetchCustomerDetails(this.value)">
                            <small id="customerFetchStatus" style="display: none; font-size: 11px;"></small>
                        </div>
                        <div class="form-group">
                            <label>Customer Name <span style="color: #10b981; font-size: 11px;">(Auto-filled or enter manually)</span></label>
                            <input type="text" id="newSaleCustomerName" name="customer_name" placeholder="Will be auto-filled or enter manually">
                        </div>
                        <div class="form-group">
                            <label>Mobile Number <span style="color: #10b981; font-size: 11px;">(Auto-filled or enter manually)</span></label>
                            <input type="text" id="newSaleMobileNumber" name="mobile_number" placeholder="Will be auto-filled or enter manually">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Company Name <span style="color: #10b981; font-size: 11px;">(Auto-filled or enter manually)</span></label>
                            <input type="text" id="newSaleCompanyName" name="company_name" placeholder="Will be auto-filled or enter manually">
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
                            <input type="number" name="amount_received" id="amountReceived" min="0" step="0.01" value="0" placeholder="0.00" onchange="toggleAccountRequired()">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label id="accountLabel">In Account Received</label>
                            <select name="account_received" id="accountReceived">
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

                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="submit" class="btn-primary" style="flex: 1;">
                            <i class="fas fa-save"></i> Update Sale
                        </button>
                        <button type="button" class="btn-danger" style="flex: 0 0 auto; padding: 10px 20px;" onclick="deleteSaleFromModal()">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
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

        <!-- Create User Modal (Admin Only) -->
        <div class="modal" id="createUserModal">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Create New User</h2>
                    <span class="close" onclick="closeCreateUserModal()">&times;</span>
                </div>
                <form id="createUserForm" onsubmit="submitCreateUser(event)">
                    <div class="form-group">
                        <label>Username *</label>
                        <input type="text" name="username" required minlength="3" placeholder="Enter username (min 3 characters)">
                    </div>
                    
                    <div class="form-group">
                        <label>Full Name *</label>
                        <input type="text" name="full_name" required placeholder="Enter full name">
                    </div>
                    
                    <div class="form-group">
                        <label>Password *</label>
                        <input type="password" name="password" required minlength="6" placeholder="Enter password (min 6 characters)">
                    </div>
                    
                    <div class="form-group">
                        <label>Role *</label>
                        <select name="role" required onchange="toggleEmployeeNameField(this)">
                            <option value="">Select Role</option>
                            <option value="admin">Admin</option>
                            <option value="employee">Employee</option>
                        </select>
                    </div>
                    
                    <div class="form-group" id="employeeNameGroup" style="display: none;">
                        <label>Employee Name (for sales tracking)</label>
                        <input type="text" name="employee_name" placeholder="Enter employee name">
                    </div>
                    
                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-user-plus"></i> Create User
                    </button>
                </form>
            </div>
        </div>

        <!-- Edit User Modal (Admin Only) -->
        <div class="modal" id="editUserModal">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Edit User</h2>
                    <span class="close" onclick="closeEditUserModal()">&times;</span>
                </div>
                <form id="editUserForm" onsubmit="submitEditUser(event)">
                    <input type="hidden" name="user_id" id="editUserId">
                    
                    <div class="form-group">
                        <label>Username *</label>
                        <input type="text" name="username" id="editUserUsername" required minlength="3" readonly style="background: #f3f4f6;">
                    </div>
                    
                    <div class="form-group">
                        <label>Full Name *</label>
                        <input type="text" name="full_name" id="editUserFullName" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Role *</label>
                        <select name="role" id="editUserRole" required onchange="toggleEmployeeNameFieldEdit(this)">
                            <option value="admin">Admin</option>
                            <option value="employee">Employee</option>
                        </select>
                    </div>
                    
                    <div class="form-group" id="editEmployeeNameGroup">
                        <label>Employee Name (for sales tracking)</label>
                        <input type="text" name="employee_name" id="editUserEmployeeName" placeholder="Enter employee name">
                    </div>
                    
                    <div class="form-group">
                        <label>Status *</label>
                        <select name="is_active" id="editUserStatus" required>
                            <option value="1">Active</option>
                            <option value="0">Inactive</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Reset Password (leave blank to keep current)</label>
                        <input type="password" name="new_password" id="editUserPassword" minlength="6" placeholder="Enter new password (optional)">
                    </div>
                    
                    <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-save"></i> Update User
                    </button>
                </form>
            </div>
        </div>

        <!-- New Quotation Modal -->
        <div class="modal" id="newQuotationModal">
            <div class="modal-content" style="max-width: 1200px;">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">
                        Create New Quotation 
                        <span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 10px;">v3.0</span>
                    </h2>
                    <span class="close" onclick="document.getElementById('newQuotationModal').classList.remove('show')">&times;</span>
                </div>
                <form id="newQuotationForm" onsubmit="submitNewQuotation(event)">
                    <input type="hidden" name="quotation_number" id="quotationNumber">
                    
                    <!-- Theme and Currency Selector -->
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 15px; color: white;">
                            <i class="fas fa-palette"></i> Quotation Settings
                        </h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label style="color: white; font-weight: 500;">Theme Color</label>
                                <select id="quotationTheme" name="quotation_theme" style="padding: 8px; border-radius: 4px; border: 1px solid #d1d5db; width: 100%;">
                                    <option value="blue" selected>🔵 Blue Theme</option>
                                    <option value="green">🟢 Green Theme</option>
                                    <option value="purple">🟣 Purple Theme</option>
                                    <option value="orange">🟠 Orange Theme</option>
                                    <option value="red">🔴 Red Theme</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="color: white; font-weight: 500;">Currency</label>
                                <select id="quotationCurrency" name="currency" style="padding: 8px; border-radius: 4px; border: 1px solid #d1d5db; width: 100%;" onchange="updateCurrencyDisplay()">
                                    <option value="INR" selected>₹ Indian Rupee (INR)</option>
                                    <option value="USD">$ US Dollar (USD)</option>
                                    <option value="EUR">€ Euro (EUR)</option>
                                    <option value="GBP">£ British Pound (GBP)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Customer Search Section -->
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 15px; color: #374151;">
                            <i class="fas fa-user"></i> Customer Details
                        </h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Search Customer (Code or Mobile) *</label>
                                <input type="text" id="quotationCustomerSearch" placeholder="Enter customer code or mobile number" onblur="fetchCustomerForQuotation(this.value)">
                                <small id="quotationCustomerFetchStatus" style="display: none; font-size: 11px;"></small>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Customer Information (Mandatory Fields Only) -->
                    <div class="form-row">
                        <div class="form-group">
                            <label>Customer Code</label>
                            <input type="text" id="quotationCustomerCode" name="customer_code" placeholder="Auto-filled or enter manually">
                        </div>
                        <div class="form-group">
                            <label>Customer Name *</label>
                            <input type="text" id="quotationCustomerName" name="customer_name" required placeholder="Auto-filled or enter manually">
                        </div>
                        <div class="form-group">
                            <label>Mobile Number *</label>
                            <input type="tel" id="quotationCustomerContact" name="customer_contact" required placeholder="Auto-filled or enter manually">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Company Name *</label>
                            <input type="text" id="quotationCompanyName" name="company_name" required placeholder="Auto-filled or enter manually">
                        </div>
                        <div class="form-group">
                            <label>GST Number</label>
                            <input type="text" id="quotationGSTNumber" name="gst_number" placeholder="Enter GST number (if available)">
                        </div>
                        <div class="form-group">
                            <label>Customer Email</label>
                            <input type="email" id="quotationCustomerEmail" name="customer_email" placeholder="Enter email address">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>GST Registered Address</label>
                            <textarea id="quotationGSTAddress" name="gst_registered_address" rows="2" placeholder="Enter GST registered address (if GST available)"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Customer Address *</label>
                            <textarea id="quotationCustomerAddress" name="customer_address" rows="2" required placeholder="Auto-filled or enter manually"></textarea>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Concern Person Name *</label>
                            <input type="text" id="quotationConcernPerson" name="concern_person_name" required placeholder="Enter concern person name">
                        </div>
                        <div class="form-group">
                            <label>Concern Person Mobile *</label>
                            <input type="tel" id="quotationConcernContact" name="concern_person_contact" required placeholder="Enter concern person contact">
                        </div>
                    </div>

                    <!-- Items Section -->
                    <h3 style="margin: 20px 0 15px 0; font-size: 16px; font-weight: 600; color: #374151;">
                        <i class="fas fa-box"></i> Items
                    </h3>
                    <div id="quotationItemsTable" style="margin-bottom: 15px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f9fafb;">
                                <tr>
                                    <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">#</th>
                                    <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Category</th>
                                    <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Item Name</th>
                                    <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Quantity</th>
                                    <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Unit Price</th>
                                    <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Amount</th>
                                    <th style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">Action</th>
                                </tr>
                            </thead>
                            <tbody id="quotationItemsRows">
                                <!-- Items will be added here -->
                            </tbody>
                        </table>
                    </div>
                    <button type="button" class="btn-add" onclick="addQuotationItem()">
                        <i class="fas fa-plus"></i> Add Item
                    </button>
                    
                    <!-- Courier Option Checkbox -->
                    <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-top: 20px;">
                        <label style="display: flex; align-items: center; font-size: 15px; font-weight: 500; cursor: pointer;">
                            <input type="checkbox" id="includeCourierCheckbox" checked onchange="toggleCourierSection()" style="width: 18px; height: 18px; margin-right: 10px; cursor: pointer;">
                            <span>Include Courier Charges</span>
                        </label>
                    </div>
                    
                    <!-- Courier Section -->
                    <div id="courierSection" style="margin-top: 15px;">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Courier Company</label>
                                <select id="quotationCourierPartner" name="courier_partner" onchange="loadQuotationDeliveryMethods()">
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
                                <label>Courier Mode</label>
                                <select id="quotationDeliveryMethod" name="delivery_method" onchange="calculateQuotationCourierCharges()">
                                    <option value="">Select Mode</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Total Weight (Auto-calculated from products)</label>
                                <input type="number" id="quotationWeight" name="weight" min="0" step="0.1" value="0" readonly style="background: #f3f4f6;" placeholder="Auto-calculated">
                            </div>
                            <div class="form-group">
                                <label>Courier Charges (Auto-calculated)</label>
                                <input type="number" id="quotationCourierCost" name="courier_cost" min="0" step="0.01" value="0" readonly style="background: #f3f4f6;">
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Bill Type</label>
                            <select id="quotationBillType" name="bill_type" onchange="calculateQuotationTotal()">
                                <option value="with">With GST (18%)</option>
                                <option value="without">Without GST</option>
                            </select>
                        </div>
                    </div>

                    <!-- Totals Section -->
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-width: 400px; margin-left: auto;">
                            <div style="font-weight: 600;">Subtotal:</div>
                            <div style="text-align: right;" id="quotationSubtotal">₹0.00</div>
                            
                            <div style="font-weight: 600;">Courier Charges:</div>
                            <div style="text-align: right;" id="quotationCourierDisplay">₹0.00</div>
                            
                            <div style="font-weight: 600;" id="quotationGSTLabel">GST (18%):</div>
                            <div style="text-align: right;" id="quotationGST">₹0.00</div>
                            
                            <div style="font-weight: 700; font-size: 18px; padding-top: 10px; border-top: 2px solid #667eea; color: #667eea;">Total Amount:</div>
                            <div style="text-align: right; font-weight: 700; font-size: 18px; padding-top: 10px; border-top: 2px solid #667eea; color: #667eea;" id="quotationTotal">₹0.00</div>
                        </div>
                    </div>

                    <!-- Additional Information -->
                    <div class="form-row">
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea name="notes" rows="3" placeholder="Add any additional notes"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Terms & Conditions</label>
                            <textarea name="terms_conditions" rows="3" placeholder="Quotation validity, payment terms, etc.">This quotation is valid for 30 days from the date of issue.
Payment terms: 100% advance or as mutually agreed.
Prices are subject to change without prior notice.</textarea>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="submit" class="btn-primary" style="flex: 1;">
                            <i class="fas fa-save"></i> Save Quotation
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Quotation Preview Modal -->
        <div class="modal" id="quotationPreviewModal">
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Quotation Preview</h2>
                    <span class="close" onclick="document.getElementById('quotationPreviewModal').classList.remove('show')">&times;</span>
                </div>
                
                <!-- Theme Selector for Preview -->
                <div style="padding: 15px; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                    <label style="font-weight: 600; margin-right: 10px;">Select Theme:</label>
                    <select id="previewThemeSelector" onchange="changePreviewTheme(this.value)" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
                        <option value="blue">🔵 Blue Theme</option>
                        <option value="green">🟢 Green Theme</option>
                        <option value="purple">🟣 Purple Theme</option>
                        <option value="orange">🟠 Orange Theme</option>
                        <option value="red">🔴 Red Theme</option>
                    </select>
                </div>
                
                <div id="quotationPreviewContent">
                    <div class="loading">Loading...</div>
                </div>
                <div id="emailSectionQuotation" style="margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 8px; display: none;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600;">Send via Email</h4>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="email" id="quotationEmailInput" placeholder="Enter recipient email address" style="flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px;" />
                        <button class="btn-primary" onclick="sendQuotationEmail()" style="white-space: nowrap;">
                            <i class="fas fa-paper-plane"></i> Send Email
                        </button>
                        <button class="btn-secondary" onclick="document.getElementById('emailSectionQuotation').style.display='none'">
                            Cancel
                        </button>
                    </div>
                    <p id="emailStatusMessage" style="margin: 10px 0 0 0; font-size: 12px; display: none;"></p>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                    <button class="btn-primary" style="flex: 1;" onclick="downloadQuotationPDF()">
                        <i class="fas fa-download"></i> Download PDF
                    </button>
                    <button class="btn-primary" style="flex: 1;" onclick="showEmailSection()">
                        <i class="fas fa-envelope"></i> Send Email
                    </button>
                    <button class="btn-primary" style="flex: 1; background: #25D366;" onclick="shareOnWhatsApp()">
                        <i class="fab fa-whatsapp"></i> WhatsApp
                    </button>
                    <button class="btn-primary" style="flex: 1;" onclick="editCurrentQuotation()">
                        <i class="fas fa-edit"></i> Edit Quotation
                    </button>
                    <button class="btn-secondary" style="flex: 1;" onclick="document.getElementById('quotationPreviewModal').classList.remove('show')">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            let currentPage = 'dashboard'; // Track current page
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
            
            // Toggle Submenu
            function toggleSubmenu(menuId) {
                const menu = document.getElementById(menuId);
                const parent = event.target.closest('.sidebar-parent');
                
                // Toggle the clicked menu
                menu.classList.toggle('show');
                parent.classList.toggle('expanded');
                
                // Prevent event bubbling
                event.stopPropagation();
            }

            // Action Menu Functions
            window.toggleActionMenu = function(event, menuId) {
                if (event) {
                    event.stopPropagation();
                    event.preventDefault();
                }
                
                console.log('Toggle menu:', menuId); // Debug log
                
                // Close all other menus
                document.querySelectorAll('.action-dropdown').forEach(menu => {
                    if (menu.id !== 'action-' + menuId) {
                        menu.classList.remove('show');
                    }
                });
                
                // Toggle current menu
                const menu = document.getElementById('action-' + menuId);
                console.log('Menu element:', menu); // Debug log
                if (menu) {
                    menu.classList.toggle('show');
                    console.log('Menu classes:', menu.className); // Debug log
                }
            }
            
            window.closeAllActionMenus = function() {
                document.querySelectorAll('.action-dropdown').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
            
            // Close dropdowns when clicking outside
            setTimeout(function() {
                document.addEventListener('click', function(event) {
                    if (!event.target.closest('.action-menu-container')) {
                        window.closeAllActionMenus();
                    }
                });
            }, 100);

            // Show Page
            function showPage(pageName) {
                // Update current page
                currentPage = pageName;
                
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
                
                // Update sidebar active state - remove from all items and children
                document.querySelectorAll('.sidebar-item, .sidebar-child').forEach(item => {
                    item.classList.remove('active');
                });
                
                // Add active class to clicked item
                if (event && event.target) {
                    const clickedItem = event.target.closest('.sidebar-item') || event.target.closest('.sidebar-child');
                    if (clickedItem) {
                        clickedItem.classList.add('active');
                    }
                }
                
                // Load page data
                loadPageData(pageName);
            }

            // Toggle Header Add Menu
            function toggleAddMenu() {
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
                    case 'quotations':
                        loadQuotations();
                        break;
                    case 'balance-payment':
                        loadBalancePayments();
                        break;
                    case 'leads':
                        loadLeads();
                        break;
                    case 'user-management':
                        loadUsers();
                        break;
                    case 'reports':
                        loadReports();
                        break;
                    case 'inventory-stock':
                        loadInventory();
                        break;
                    case 'dispatch':
                        loadRecentDispatches();
                        break;
                    case 'quality-check':
                        loadRecentQC();
                        break;
                    case 'inventory-reports':
                        loadInventoryReports();
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
                
                const amounts = data.map(d => d.total_amount || 0);
                
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
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const label = context.label || '';
                                        const value = context.parsed || 0;
                                        const amount = amounts[context.dataIndex] || 0;
                                        return label + ': ' + value + ' sales (₹' + amount.toLocaleString() + ')';
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Utility to preserve scroll position during reload
            function preserveScrollPosition(callback) {
                const scrollY = window.scrollY;
                const scrollX = window.scrollX;
                
                // Execute callback (reload function)
                const result = callback();
                
                // Restore scroll position after a short delay
                setTimeout(() => {
                    window.scrollTo(scrollX, scrollY);
                }, 100);
                
                return result;
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
                                <div class="action-menu-container">
                                    <button class="action-dots-btn" onclick="toggleActionMenu(event, 'current-sale-\${sale.order_id}')">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <div class="action-dropdown" id="action-current-sale-\${sale.order_id}">
                                        \${sale.balance_amount > 0 ? \`
                                            <button class="action-dropdown-item" onclick="openUpdateBalanceModal('\${sale.order_id}'); closeAllActionMenus();">
                                                <i class="fas fa-money-bill-wave"></i> Update Payment
                                            </button>
                                        \` : ''}
                                        \${currentUser && currentUser.role === 'admin' ? \`
                                            <button class="action-dropdown-item delete" onclick="deleteSale('\${sale.order_id}'); closeAllActionMenus();">
                                                <i class="fas fa-trash"></i> Delete
                                            </button>
                                        \` : ''}
                                    </div>
                                </div>
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
            
            // Toggle account required based on amount received
            function toggleAccountRequired() {
                const amountReceived = parseFloat(document.getElementById('amountReceived').value) || 0;
                const accountSelect = document.getElementById('accountReceived');
                const accountLabel = document.getElementById('accountLabel');
                
                if (amountReceived > 0) {
                    accountSelect.setAttribute('required', 'required');
                    accountLabel.innerHTML = 'In Account Received *';
                } else {
                    accountSelect.removeAttribute('required');
                    accountLabel.innerHTML = 'In Account Received';
                }
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

            async function openNewLeadModal() {
                document.getElementById('newLeadModal').classList.add('show');
                document.getElementById('actionMenu').classList.remove('show');
                
                // Auto-fill next customer code
                try {
                    const response = await axios.get('/api/leads/next-code');
                    if (response.data.success) {
                        const customerCodeInput = document.querySelector('#newLeadForm input[name="customer_code"]');
                        if (customerCodeInput) {
                            customerCodeInput.value = response.data.next_code;
                        }
                    }
                } catch (error) {
                    console.error('Error fetching next customer code:', error);
                }
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
                    
                    const productsTable = sale.items && sale.items.length > 0
                        ? sale.items.map(item => \`
                            <tr>
                                <td>\${item.product_name}</td>
                                <td>\${item.product_code || '-'}</td>
                                <td>\${item.quantity}</td>
                                <td>₹\${item.unit_price.toLocaleString()}</td>
                                <td>₹\${(item.quantity * item.unit_price).toLocaleString()}</td>
                            </tr>
                        \`).join('')
                        : '<tr><td colspan="5" style="text-align: center; color: #9ca3af; padding: 20px;">No products added to this sale</td></tr>';
                    
                    const paymentsTable = sale.payments && sale.payments.length > 0
                        ? sale.payments.map(payment => \`
                            <tr>
                                <td>\${new Date(payment.payment_date).toLocaleDateString()}</td>
                                <td>₹\${payment.amount.toLocaleString()}</td>
                                <td>\${payment.payment_reference || '-'}</td>
                                <td>\${payment.account_received || '-'}</td>
                            </tr>
                        \`).join('')
                        : '<tr><td colspan="4" style="text-align: center; color: #9ca3af; padding: 20px;">No payments recorded</td></tr>';
                    
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
                        
                        <h3 style="font-size: 16px; font-weight: 600; margin: 20px 0 10px; color: #1f2937;">Payment History (\${sale.payments ? sale.payments.length : 0} payment(s))</h3>
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
                        
                        \${currentUser && currentUser.role === 'admin' ? '<div style="display: flex; gap: 10px; margin-top: 25px; padding-top: 20px; border-top: 2px solid #e5e7eb;"><button class="btn-primary" style="flex: 1;" onclick="closeSaleDetailsModal(); editSale(\\'' + sale.order_id + '\\');"><i class="fas fa-edit"></i> Edit Sale</button><button class="btn-danger" style="flex: 1;" onclick="if(confirm(\\'Are you sure you want to delete this sale?\\')) { closeSaleDetailsModal(); deleteSale(\\'' + sale.order_id + '\\'); }"><i class="fas fa-trash"></i> Delete Sale</button></div>' : ''}
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
            async function fetchCustomerDetails(customerCode) {
                if (!customerCode || customerCode.trim() === '') {
                    return;
                }
                
                const statusDiv = document.getElementById('customerFetchStatus');
                statusDiv.style.display = 'block';
                statusDiv.style.color = '#667eea';
                statusDiv.textContent = 'Fetching customer details...';
                
                try {
                    const response = await axios.get('/api/leads/by-code/' + encodeURIComponent(customerCode));
                    
                    if (response.data.success) {
                        const customer = response.data.data;
                        
                        // Auto-fill customer details
                        document.getElementById('newSaleCustomerName').value = customer.customer_name || '';
                        document.getElementById('newSaleMobileNumber').value = customer.mobile_number || '';
                        document.getElementById('newSaleCompanyName').value = customer.company_name || '';
                        
                        statusDiv.style.color = '#10b981';
                        statusDiv.textContent = '✓ Customer details loaded';
                        
                        setTimeout(() => {
                            statusDiv.style.display = 'none';
                        }, 3000);
                    }
                } catch (error) {
                    if (error.response?.status === 404) {
                        statusDiv.style.color = '#dc2626';
                        statusDiv.textContent = '⚠ Customer not found in database';
                        
                        // Clear fields
                        document.getElementById('newSaleCustomerName').value = '';
                        document.getElementById('newSaleMobileNumber').value = '';
                        document.getElementById('newSaleCompanyName').value = '';
                    } else {
                        statusDiv.style.color = '#dc2626';
                        statusDiv.textContent = '⚠ Error fetching customer';
                    }
                }
            }
            
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
                
                // Allow sale without products (items can be empty)
                
                const data = {
                    customer_code: formData.get('customer_code'),
                    customer_name: formData.get('customer_name'),
                    company_name: formData.get('company_name'),
                    customer_contact: formData.get('mobile_number'),
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
                    } else {
                        alert('Error: ' + (response.data.error || 'Failed to add sale'));
                    }
                } catch (error) {
                    console.error('Error adding sale:', error);
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
                        document.getElementById('balancePaymentModal').classList.remove('show');
                        
                        // Save scroll position
                        const scrollY = window.scrollY;
                        const scrollX = window.scrollX;
                        
                        // Reload data
                        await loadBalancePayments();
                        await loadDashboard();
                        
                        // Restore scroll position
                        setTimeout(() => {
                            window.scrollTo(scrollX, scrollY);
                        }, 100);
                        
                        alert('Payment updated successfully!');
                    } else {
                        alert('Error: ' + (response.data.error || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Balance payment error:', error);
                    console.error('Error response:', error.response?.data);
                    // Don't show error if payment actually succeeded
                    if (error.response?.status !== 200) {
                        alert('Error updating payment: ' + (error.response?.data?.error || error.message));
                    }
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
                                <div style="font-weight: 600;">\${sale.customer_name || sale.customer_code}</div>
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
                    allSalesForSearch = sales; // Store for search autocomplete
                    
                    const tbody = document.getElementById('allSalesTableBody');
                    const isAdmin = currentUser && currentUser.role === 'admin';
                    tbody.innerHTML = sales.map(sale => {
                        const items = sale.items || [];
                        const products = items.length > 0 
                            ? items.map(item => \`\${item.product_name} (x\${item.quantity})\`).join(', ')
                            : 'No products';
                        
                        return \`
                        <tr style="cursor: pointer;" onclick="viewSaleDetails('\${sale.order_id}')" title="Click to view sale details">
                            <td><strong>\${sale.order_id}</strong></td>
                            <td>\${new Date(sale.sale_date).toLocaleDateString()}</td>
                            <td>\${sale.customer_name || sale.customer_code}</td>
                            <td>\${sale.employee_name}</td>
                            <td><small>\${products}</small></td>
                            <td><span class="badge \${sale.sale_type === 'With' ? 'badge-success' : 'badge-warning'}">\${sale.sale_type} GST</span></td>
                            <td>₹\${sale.total_amount.toLocaleString()}</td>
                            <td>₹\${sale.balance_amount.toLocaleString()}</td>
                            <td onclick="event.stopPropagation()">
                                \${isAdmin ? \`
                                    <div class="action-menu-container">
                                        <button class="action-dots-btn" onclick="toggleActionMenu(event, 'sale-\${sale.order_id}')">
                                            <i class="fas fa-ellipsis-v"></i>
                                        </button>
                                        <div class="action-dropdown" id="action-sale-\${sale.order_id}">
                                            <button class="action-dropdown-item" onclick="editSale('\${sale.order_id}'); closeAllActionMenus();">
                                                <i class="fas fa-edit"></i> Edit
                                            </button>
                                            <button class="action-dropdown-item delete" onclick="deleteSale('\${sale.order_id}'); closeAllActionMenus();">
                                                <i class="fas fa-trash"></i> Delete
                                            </button>
                                        </div>
                                    </div>
                                \` : '-'}
                            </td>
                        </tr>
                        \`;
                    }).join('');
                } catch (error) {
                    console.error('Error loading all sales:', error);
                }
            }

            async function loadQuotations() {
                try {
                    const response = await axios.get('/api/quotations');
                    const quotations = response.data.data;
                    
                    const tbody = document.getElementById('quotationsTableBody');
                    const isAdmin = currentUser && currentUser.role === 'admin';
                    
                    if (!quotations || quotations.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #6b7280;">No quotations found</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = quotations.map(quotation => {
                        return '<tr style="cursor: pointer;" onclick="viewQuotationDetails(\\'' + quotation.quotation_number + '\\')" title="Click to view quotation details">' +
                            '<td><strong>' + quotation.quotation_number + '</strong></td>' +
                            '<td>' + new Date(quotation.created_at).toLocaleDateString() + '</td>' +
                            '<td>' + quotation.customer_name + '</td>' +
                            '<td>' + (quotation.company_name || 'N/A') + '</td>' +
                            '<td>\u20b9' + quotation.total_amount.toLocaleString() + '</td>' +
                            '<td><span class="badge ' + (quotation.status === 'sent' ? 'badge-success' : 'badge-warning') + '">' + quotation.status + '</span></td>' +
                            '<td>' +
                                (isAdmin ? '<button class="btn-primary" style="padding: 5px 12px; font-size: 12px; margin-right: 5px;" onclick="event.stopPropagation(); editQuotation(\\'' + quotation.quotation_number + '\\')"><i class="fas fa-edit"></i> Edit</button> <button class="btn-danger" style="padding: 5px 12px; font-size: 12px;" onclick="event.stopPropagation(); deleteQuotation(\\'' + quotation.quotation_number + '\\')"><i class="fas fa-trash"></i></button>' : '-') +
                            '</td>' +
                        '</tr>';
                    }).join('');
                } catch (error) {
                    console.error('Error loading quotations:', error);
                }
            }

            async function loadBalancePayments() {
                try {
                    const response = await axios.get('/api/sales/balance-payments');
                    const sales = response.data.data;
                    
                    const tbody = document.getElementById('balancePaymentTableBody');
                    if (!sales || sales.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #6b7280;">No pending balance payments</td></tr>';
                        return;
                    }
                    tbody.innerHTML = sales.map(sale => {
                        // Fix date display - handle various date formats
                        let saleDate = 'N/A';
                        try {
                            if (sale.sale_date) {
                                const date = new Date(sale.sale_date);
                                if (!isNaN(date.getTime())) {
                                    saleDate = date.toLocaleDateString('en-IN', { 
                                        day: '2-digit', 
                                        month: 'short', 
                                        year: 'numeric' 
                                    });
                                }
                            }
                        } catch (e) {
                            saleDate = 'Invalid Date';
                        }
                        
                        return \`
                        <tr style="cursor: pointer;" onclick="viewSaleDetails('\${sale.order_id}')" title="Click to view sale details">
                            <td><strong>\${sale.order_id}</strong></td>
                            <td>\${saleDate}</td>
                            <td>\${sale.customer_name || sale.customer_code}</td>
                            <td>\${sale.company_name || 'N/A'}</td>
                            <td>\${sale.employee_name}</td>
                            <td>\${sale.customer_contact || 'N/A'}</td>
                            <td>₹\${sale.total_amount.toLocaleString()}</td>
                            <td>₹\${sale.amount_received.toLocaleString()}</td>
                            <td style="color: #dc2626; font-weight: 600;">₹\${sale.balance_amount.toLocaleString()}</td>
                            <td><button class="btn-primary" style="padding: 5px 10px; font-size: 12px;" onclick="event.stopPropagation(); updatePaymentFor('\${sale.order_id}')">Update</button></td>
                        </tr>
                        \`;
                    }).join('');
                } catch (error) {
                    console.error('Error loading balance payments:', error);
                }
            }

            function updatePaymentFor(orderId) {
                openBalancePaymentModal();
                document.querySelector('#balancePaymentForm input[name="order_id"]').value = orderId;
            }
            
            // Filter Balance Payments
            function filterBalancePayments() {
                const searchTerm = document.getElementById('balancePaymentSearch').value.toLowerCase().trim();
                const tbody = document.getElementById('balancePaymentTableBody');
                const rows = tbody.getElementsByTagName('tr');
                
                // If no search term, show all rows
                if (!searchTerm) {
                    Array.from(rows).forEach(row => row.style.display = '');
                    return;
                }
                
                // Determine search type
                const isNumeric = /^\d+$/.test(searchTerm);
                const isOrderId = isNumeric && searchTerm.length === 7;
                const isMobile = isNumeric && searchTerm.length >= 5;
                
                Array.from(rows).forEach(row => {
                    const cells = row.getElementsByTagName('td');
                    if (cells.length === 0) return; // Skip empty rows
                    
                    const orderId = cells[0].textContent.toLowerCase();
                    const customerName = cells[2].textContent.toLowerCase();
                    const companyName = cells[3].textContent.toLowerCase();
                    const mobile = cells[5].textContent.toLowerCase();
                    
                    let matches = false;
                    
                    if (isOrderId) {
                        // 7 digits = Order ID (exact match)
                        matches = orderId === searchTerm;
                    } else if (isMobile) {
                        // 5+ digits = Mobile number (partial match)
                        matches = mobile.includes(searchTerm);
                    } else {
                        // Text = Customer name or company (partial match)
                        matches = customerName.includes(searchTerm) || companyName.includes(searchTerm);
                    }
                    
                    row.style.display = matches ? '' : 'none';
                });
            }

            // Switch Balance Payment Tabs
            function switchBalancePaymentTab(tab) {
                // Update tab buttons
                document.getElementById('pending-balance-tab').classList.remove('active');
                document.getElementById('history-balance-tab').classList.remove('active');
                
                // Update content visibility
                document.getElementById('pending-balance-content').style.display = 'none';
                document.getElementById('history-balance-content').style.display = 'none';
                
                if (tab === 'pending') {
                    document.getElementById('pending-balance-tab').classList.add('active');
                    document.getElementById('pending-balance-content').style.display = 'block';
                    loadBalancePayments();
                } else if (tab === 'history') {
                    document.getElementById('history-balance-tab').classList.add('active');
                    document.getElementById('history-balance-content').style.display = 'block';
                    loadBalancePaymentHistory();
                }
            }

            // Load Balance Payment History
            async function loadBalancePaymentHistory() {
                try {
                    const response = await axios.get('/api/sales/balance-payment-history');
                    const payments = response.data.data;
                    
                    const tbody = document.getElementById('balancePaymentHistoryTableBody');
                    if (!payments || payments.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #6b7280;">No balance payments recorded this month</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = payments.map(payment => {
                        let paymentDate = 'N/A';
                        try {
                            if (payment.payment_date) {
                                const date = new Date(payment.payment_date);
                                if (!isNaN(date.getTime())) {
                                    paymentDate = date.toLocaleDateString('en-IN', { 
                                        day: '2-digit', 
                                        month: 'short', 
                                        year: 'numeric' 
                                    });
                                }
                            }
                        } catch (e) {
                            paymentDate = 'Invalid Date';
                        }
                        
                        return \`
                        <tr>
                            <td><strong>\${payment.order_id}</strong></td>
                            <td>\${payment.customer_name || 'N/A'}</td>
                            <td>\${payment.company_name || 'N/A'}</td>
                            <td>\${paymentDate}</td>
                            <td style="color: #10b981; font-weight: 600;">₹\${payment.amount.toLocaleString()}</td>
                            <td>\${payment.account_received || 'N/A'}</td>
                            <td>\${payment.payment_reference || 'N/A'}</td>
                        </tr>
                        \`;
                    }).join('');
                } catch (error) {
                    console.error('Error loading balance payment history:', error);
                    const tbody = document.getElementById('balancePaymentHistoryTableBody');
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #dc2626;">Error loading payment history</td></tr>';
                }
            }

            async function loadLeads(search = '') {
                try {
                    const url = search ? '/api/leads?search=' + encodeURIComponent(search) : '/api/leads';
                    const response = await axios.get(url);
                    const leads = response.data.data;
                    
                    const tbody = document.getElementById('leadsTableBody');
                    const isAdmin = currentUser && currentUser.role === 'admin';
                    
                    if (!leads || leads.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: #6b7280;">No leads found</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = leads.map(lead => \`
                        <tr>
                            <td><strong>\${lead.customer_code || 'N/A'}</strong></td>
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
                                \${isAdmin ? \`
                                    <div class="action-menu-container">
                                        <button class="action-dots-btn" onclick="toggleActionMenu(event, 'lead-\${lead.id}')">
                                            <i class="fas fa-ellipsis-v"></i>
                                        </button>
                                        <div class="action-dropdown" id="action-lead-\${lead.id}">
                                            <button class="action-dropdown-item" onclick="editLead(\${lead.id}); closeAllActionMenus();">
                                                <i class="fas fa-edit"></i> Edit
                                            </button>
                                            <button class="action-dropdown-item delete" onclick="deleteLead(\${lead.id}); closeAllActionMenus();">
                                                <i class="fas fa-trash"></i> Delete
                                            </button>
                                        </div>
                                    </div>
                                \` : '-'}
                            </td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading leads:', error);
                    const tbody = document.getElementById('leadsTableBody');
                    tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: #dc2626;">Error loading leads</td></tr>';
                }
            }
            
            // Search leads function
            let searchLeadsTimeout;
            function searchLeads() {
                clearTimeout(searchLeadsTimeout);
                searchLeadsTimeout = setTimeout(() => {
                    const searchTerm = document.getElementById('leadSearchInput').value.trim();
                    loadLeads(searchTerm);
                }, 300); // Debounce 300ms
            }

            async function searchOrder() {
                const orderId = document.getElementById('searchOrderId').value.trim();
                if (!orderId) {
                    alert('Please enter an Order ID');
                    return;
                }
                
                // Show loading state
                document.getElementById('orderResult').innerHTML = \`
                    <div class="card" style="background: #f0f9ff; color: #0369a1;">
                        <i class="fas fa-spinner fa-spin"></i> Searching for order \${orderId}...
                    </div>
                \`;
                
                try {
                    const response = await axios.get(\`/api/sales/order/\${orderId}\`);
                    
                    if (!response.data.success) {
                        throw new Error(response.data.error || 'Order not found');
                    }
                    
                    const sale = response.data.data;
                    
                    // Handle empty or missing items
                    const products = (sale.items && sale.items.length > 0) ? sale.items.map(item => \`
                        <tr style="border-bottom: 1px solid #e5e7eb;">
                            <td style="padding: 12px; text-align: left;"><strong>\${item.product_name || 'N/A'}</strong></td>
                            <td style="padding: 12px; text-align: center;">\${item.quantity || 0}</td>
                            <td style="padding: 12px; text-align: right;">₹\${(item.unit_price || 0).toLocaleString()}</td>
                            <td style="padding: 12px; text-align: right; font-weight: 600;">₹\${(item.total_price || 0).toLocaleString()}</td>
                        </tr>
                    \`).join('') : '<tr><td colspan="4" style="text-align: center; padding: 30px; color: #6b7280;"><i class="fas fa-box-open"></i><br>No products found</td></tr>';
                    
                    // Handle empty or missing payments
                    const payments = (sale.payments && sale.payments.length > 0) ? sale.payments.map(p => \`
                        <tr style="border-bottom: 1px solid #e5e7eb;">
                            <td style="padding: 12px; text-align: left;">\${new Date(p.payment_date).toLocaleDateString()}</td>
                            <td style="padding: 12px; text-align: right; font-weight: 600; color: #10b981;">₹\${(p.amount || 0).toLocaleString()}</td>
                            <td style="padding: 12px; text-align: left;">\${p.payment_reference || 'N/A'}</td>
                        </tr>
                    \`).join('') : '<tr><td colspan="3" style="text-align: center; padding: 30px; color: #6b7280;"><i class="fas fa-history"></i><br>No payment history</td></tr>';
                    
                    document.getElementById('orderResult').innerHTML = \`
                        <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 12px; margin-bottom: 20px;">
                            <h3 style="margin-bottom: 10px; font-size: 28px; font-weight: 700;">
                                <i class="fas fa-receipt"></i> Order #\${sale.order_id || 'N/A'}
                            </h3>
                            <p style="opacity: 0.9; font-size: 14px;">Order placed on \${sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</p>
                        </div>
                        
                        <!-- Customer Information -->
                        <div class="card" style="margin-bottom: 20px;">
                            <div style="background: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #667eea; margin-bottom: 15px;">
                                <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
                                    <i class="fas fa-user-circle"></i> Customer Information
                                </h4>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                                    <div style="padding: 10px; background: white; border-radius: 6px;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 3px;">Customer Code</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${sale.customer_code || 'N/A'}</div>
                                    </div>
                                    <div style="padding: 10px; background: white; border-radius: 6px;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 3px;">Customer Name</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${sale.customer_name || 'N/A'}</div>
                                    </div>
                                    <div style="padding: 10px; background: white; border-radius: 6px;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 3px;">Company Name</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${sale.company_name || 'N/A'}</div>
                                    </div>
                                    <div style="padding: 10px; background: white; border-radius: 6px;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 3px;">Contact Number</div>
                                        <div style="font-weight: 600; color: #1f2937;">
                                            <i class="fas fa-phone"></i> \${sale.customer_contact || 'N/A'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Sale Information -->
                            <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                                <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
                                    <i class="fas fa-info-circle"></i> Sale Details
                                </h4>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                    <div style="padding: 10px; background: white; border-radius: 6px;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 3px;">Employee</div>
                                        <div style="font-weight: 600; color: #1f2937;">
                                            <i class="fas fa-user-tie"></i> \${sale.employee_name || 'N/A'}
                                        </div>
                                    </div>
                                    <div style="padding: 10px; background: white; border-radius: 6px;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 3px;">Sale Type</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${sale.sale_type || 'N/A'} GST</div>
                                    </div>
                                    <div style="padding: 10px; background: white; border-radius: 6px;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 3px;">Account</div>
                                        <div style="font-weight: 600; color: #1f2937;">
                                            <i class="fas fa-wallet"></i> \${sale.account_received || 'N/A'}
                                        </div>
                                    </div>
                                    <div style="padding: 10px; background: white; border-radius: 6px;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 3px;">Remarks</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${sale.remarks || 'N/A'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Products Table -->
                        <div class="card" style="margin-bottom: 20px;">
                            <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
                                <i class="fas fa-box"></i> Products
                            </h4>
                            <div class="table-container">
                                <table style="width: 100%;">
                                    <thead style="background: #f9fafb;">
                                        <tr>
                                            <th style="text-align: left; padding: 12px;">Product</th>
                                            <th style="text-align: center; padding: 12px;">Quantity</th>
                                            <th style="text-align: right; padding: 12px;">Unit Price</th>
                                            <th style="text-align: right; padding: 12px;">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>\${products}</tbody>
                                </table>
                            </div>
                        </div>
                        
                        <!-- Payment Summary -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                            <div class="card" style="background: #f0fdf4; border-left: 4px solid #10b981;">
                                <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                                    <i class="fas fa-calculator"></i> Amount Breakdown
                                </h4>
                                <div style="display: flex; flex-direction: column; gap: 10px;">
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                                        <span style="color: #6b7280;">Subtotal:</span>
                                        <span style="font-weight: 600;">₹\${(sale.subtotal || 0).toLocaleString()}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                                        <span style="color: #6b7280;">Courier Charges:</span>
                                        <span style="font-weight: 600;">₹\${(sale.courier_cost || 0).toLocaleString()}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                                        <span style="color: #6b7280;">GST (18%):</span>
                                        <span style="font-weight: 600;">₹\${(sale.gst_amount || 0).toLocaleString()}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 12px 0; background: #10b981; color: white; margin: 0 -20px; padding-left: 20px; padding-right: 20px; border-radius: 6px;">
                                        <span style="font-size: 16px; font-weight: 600;">Total Amount:</span>
                                        <span style="font-size: 20px; font-weight: 700;">₹\${(sale.total_amount || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="card" style="background: \${(sale.balance_amount || 0) > 0 ? '#fef2f2' : '#f0fdf4'}; border-left: 4px solid \${(sale.balance_amount || 0) > 0 ? '#ef4444' : '#10b981'};">
                                <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                                    <i class="fas fa-money-bill-wave"></i> Payment Status
                                </h4>
                                <div style="display: flex; flex-direction: column; gap: 10px;">
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                                        <span style="color: #6b7280;">Amount Received:</span>
                                        <span style="font-weight: 600; color: #10b981;">₹\${(sale.amount_received || 0).toLocaleString()}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                                        <span style="color: #6b7280;">Balance Due:</span>
                                        <span style="font-weight: 600; color: \${(sale.balance_amount || 0) > 0 ? '#ef4444' : '#10b981'};">
                                            ₹\${(sale.balance_amount || 0).toLocaleString()}
                                        </span>
                                    </div>
                                    <div style="padding: 12px; background: \${(sale.balance_amount || 0) > 0 ? '#ef4444' : '#10b981'}; color: white; text-align: center; border-radius: 6px; margin-top: 8px;">
                                        <span style="font-size: 16px; font-weight: 600;">
                                            \${(sale.balance_amount || 0) > 0 ? '<i class="fas fa-exclamation-circle"></i> PAYMENT PENDING' : '<i class="fas fa-check-circle"></i> FULLY PAID'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Payment History -->
                        <div class="card">
                            <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
                                <i class="fas fa-history"></i> Payment History
                            </h4>
                            <div class="table-container">
                                <table style="width: 100%;">
                                    <thead style="background: #f9fafb;">
                                        <tr>
                                            <th style="text-align: left; padding: 12px;">Date</th>
                                            <th style="text-align: right; padding: 12px;">Amount</th>
                                            <th style="text-align: left; padding: 12px;">Reference</th>
                                        </tr>
                                    </thead>
                                    <tbody>\${payments}</tbody>
                                </table>
                            </div>
                        </div>
                    \`;
                } catch (error) {
                    console.error('Order search error:', error);
                    document.getElementById('orderResult').innerHTML = \`
                        <div class="card" style="background: #fee2e2; color: #991b1b; padding: 20px;">
                            <h4 style="margin-bottom: 10px;"><i class="fas fa-exclamation-circle"></i> Order Not Found</h4>
                            <p>Could not find order with ID: <strong>\${orderId}</strong></p>
                            <p style="margin-top: 10px; font-size: 14px;">Please ensure you entered a valid 7-digit order ID.</p>
                            <p style="margin-top: 5px; font-size: 14px; color: #7f1d1d;">Error: \${error.message || 'Unknown error'}</p>
                        </div>
                    \`;
                }
            }

            // Edit Sale Functions
            async function editSale(orderId) {
                try {
                    const response = await axios.get('/api/sales/' + orderId);
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
                    const itemsResponse = await axios.get('/api/sales/' + orderId + '/items');
                    const items = itemsResponse.data.data;
                    
                    const productRows = document.getElementById('editProductRows');
                    productRows.innerHTML = '';
                    
                    editProductCount = 0;
                    items.forEach((item, index) => {
                        const row = document.createElement('div');
                        row.className = 'product-row';
                        row.dataset.id = editProductCount;
                        row.innerHTML = '<div class="form-group" style="margin: 0;">' +
                                '<label>Product Name</label>' +
                                '<input type="text" name="items[' + editProductCount + '][product_name]" value="' + item.product_name + '" required>' +
                            '</div>' +
                            '<div class="form-group" style="margin: 0;">' +
                                '<label>Quantity</label>' +
                                '<input type="number" name="items[' + editProductCount + '][quantity]" value="' + item.quantity + '" min="0" required onchange="calculateEditSaleTotal()">' +
                            '</div>' +
                            '<div class="form-group" style="margin: 0;">' +
                                '<label>Unit Price</label>' +
                                '<input type="number" name="items[' + editProductCount + '][unit_price]" value="' + item.unit_price + '" min="0" step="0.01" required onchange="calculateEditSaleTotal()">' +
                            '</div>' +
                            '<div class="form-group" style="margin: 0;">' +
                                '<label>Total</label>' +
                                '<input type="number" class="product-total" readonly style="background: #f3f4f6;" value="' + (item.quantity * item.unit_price) + '">' +
                            '</div>' +
                            '<button type="button" class="btn-remove" onclick="removeEditProductRow(' + editProductCount + ')">' +
                                '<i class="fas fa-times"></i>' +
                            '</button>';
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
            
            // Delete sale function
            async function deleteSale(orderId) {
                if (!confirm('Are you sure you want to delete sale ' + orderId + '? This action cannot be undone.')) {
                    return;
                }
                
                try {
                    await axios.delete('/api/sales/' + orderId);
                    alert('Sale deleted successfully');
                    // Reload the current page
                    if (currentPage === 'all-sales') {
                        loadAllSales();
                    } else {
                        loadDashboard();
                    }
                } catch (error) {
                    alert('Error deleting sale: ' + (error.response?.data?.error || error.message));
                }
            }
            
            // Delete sale from edit modal
            async function deleteSaleFromModal() {
                const orderId = document.getElementById('editOrderId').value;
                document.getElementById('editSaleModal').classList.remove('show');
                await deleteSale(orderId);
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
            
            // Delete lead function
            async function deleteLead(leadId) {
                if (!confirm('Are you sure you want to delete this lead? This action cannot be undone.')) {
                    return;
                }
                
                try {
                    await axios.delete('/api/leads/' + leadId);
                    alert('Lead deleted successfully');
                    loadLeads();
                } catch (error) {
                    alert('Error deleting lead: ' + (error.response?.data?.error || error.message));
                }
            }
            
            // Search customer function
            // Autocomplete for Customer Search
            let customerSearchTimeout;
            let allLeadsForSearch = [];
            
            async function searchCustomerWithAutocomplete() {
                clearTimeout(customerSearchTimeout);
                const searchTerm = document.getElementById('customerSearchInput').value.trim();
                
                if (!searchTerm || searchTerm.length < 2) {
                    document.getElementById('customerSearchDropdown').style.display = 'none';
                    return;
                }
                
                customerSearchTimeout = setTimeout(async () => {
                    try {
                        const response = await axios.get('/api/leads?search=' + encodeURIComponent(searchTerm));
                        const leads = response.data.data;
                        displayCustomerAutocomplete(leads);
                    } catch (error) {
                        console.error('Error searching customers:', error);
                    }
                }, 300);
            }
            
            function showCustomerSearchDropdown() {
                if (allLeadsForSearch.length > 0) {
                    displayCustomerAutocomplete(allLeadsForSearch);
                }
            }
            
            function displayCustomerAutocomplete(leads) {
                const dropdown = document.getElementById('customerSearchDropdown');
                
                if (!leads || leads.length === 0) {
                    dropdown.innerHTML = '<div class="autocomplete-no-results">No customers found</div>';
                    dropdown.style.display = 'block';
                    return;
                }
                
                allLeadsForSearch = leads;
                dropdown.innerHTML = leads.slice(0, 10).map(lead => \`
                    <div class="autocomplete-item" onclick="selectCustomer('\${lead.customer_code}', '\${lead.mobile_number}')">
                        <div class="autocomplete-item-title">\${lead.customer_name}</div>
                        <div class="autocomplete-item-subtitle">
                            Code: \${lead.customer_code} | Mobile: \${lead.mobile_number} | Company: \${lead.company_name || 'N/A'}
                        </div>
                    </div>
                \`).join('');
                dropdown.style.display = 'block';
            }
            
            function selectCustomer(customerCode, mobileNumber) {
                document.getElementById('customerSearchInput').value = customerCode;
                document.getElementById('customerSearchDropdown').style.display = 'none';
                searchCustomerByCode(customerCode);
            }
            
            async function searchCustomerByCode(customerCode) {
                try {
                    const response = await axios.get('/api/leads?search=' + encodeURIComponent(customerCode));
                    const leads = response.data.data;
                    
                    if (!leads || leads.length === 0) {
                        alert('No customer found');
                        return;
                    }
                    
                    const customer = leads[0];
                    
                    // Display customer info
                    document.getElementById('customerInfo').innerHTML = 
                        '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">' +
                            '<div><strong>Customer Code:</strong> ' + (customer.customer_code || 'N/A') + '</div>' +
                            '<div><strong>Name:</strong> ' + customer.customer_name + '</div>' +
                            '<div><strong>Mobile:</strong> ' + customer.mobile_number + '</div>' +
                            '<div><strong>Alternate Mobile:</strong> ' + (customer.alternate_mobile || 'N/A') + '</div>' +
                            '<div><strong>Company:</strong> ' + (customer.company_name || 'N/A') + '</div>' +
                            '<div><strong>Email:</strong> ' + (customer.email || 'N/A') + '</div>' +
                            '<div><strong>Location:</strong> ' + (customer.location || 'N/A') + '</div>' +
                            '<div><strong>GST:</strong> ' + (customer.gst_number || 'N/A') + '</div>' +
                        '</div>';
                    
                    // Fetch ALL sales for this customer (not just current month)
                    const salesResponse = await axios.get('/api/sales?page=1&limit=1000');
                    const allSales = salesResponse.data.data;
                    
                    // Filter sales by customer code or mobile
                    const customerSales = allSales.filter(sale => 
                        sale.customer_code === customer.customer_code || 
                        sale.customer_contact === customer.mobile_number
                    );
                    
                    // Display sales
                    const tbody = document.getElementById('customerSalesTableBody');
                    if (customerSales.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No sales found for this customer</td></tr>';
                    } else {
                        tbody.innerHTML = customerSales.map(sale => {
                            const items = sale.items || [];
                            const products = items.length > 0 
                                ? items.map(item => item.product_name + ' (x' + item.quantity + ')').join(', ')
                                : 'No products';
                            
                            return '<tr>' +
                                '<td><strong>' + sale.order_id + '</strong></td>' +
                                '<td>' + new Date(sale.sale_date).toLocaleDateString() + '</td>' +
                                '<td><small>' + products + '</small></td>' +
                                '<td>₹' + sale.total_amount.toLocaleString() + '</td>' +
                                '<td>' + (sale.balance_amount > 0 ? '<span style="color: #dc2626;">₹' + sale.balance_amount.toLocaleString() + '</span>' : '<span class="badge badge-success">Paid</span>') + '</td>' +
                            '</tr>';
                        }).join('');
                    }
                    
                    document.getElementById('customerDetailsResult').style.display = 'block';
                } catch (error) {
                    console.error('Error loading customer:', error);
                }
            }
            
            // Autocomplete for Sale Database Search
            let saleSearchTimeout;
            let allSalesForSearch = [];
            
            async function searchSalesWithAutocomplete() {
                clearTimeout(saleSearchTimeout);
                const searchTerm = document.getElementById('saleSearchInput').value.trim().toLowerCase();
                
                if (!searchTerm || searchTerm.length < 2) {
                    document.getElementById('saleSearchDropdown').style.display = 'none';
                    loadAllSales(); // Show all sales
                    return;
                }
                
                saleSearchTimeout = setTimeout(async () => {
                    if (allSalesForSearch.length === 0) {
                        const response = await axios.get('/api/sales');
                        allSalesForSearch = response.data.data;
                    }
                    
                    const filtered = allSalesForSearch.filter(sale => 
                        (sale.customer_name && sale.customer_name.toLowerCase().includes(searchTerm)) ||
                        (sale.company_name && sale.company_name.toLowerCase().includes(searchTerm)) ||
                        (sale.order_id && sale.order_id.toLowerCase().includes(searchTerm)) ||
                        (sale.customer_contact && sale.customer_contact.includes(searchTerm))
                    );
                    
                    displaySaleAutocomplete(filtered);
                    filterSalesTable(filtered);
                }, 300);
            }
            
            function showSaleSearchDropdown() {
                const searchTerm = document.getElementById('saleSearchInput').value.trim();
                if (searchTerm.length >= 2 && allSalesForSearch.length > 0) {
                    searchSalesWithAutocomplete();
                }
            }
            
            function displaySaleAutocomplete(sales) {
                const dropdown = document.getElementById('saleSearchDropdown');
                
                if (!sales || sales.length === 0) {
                    dropdown.innerHTML = '<div class="autocomplete-no-results">No sales found</div>';
                    dropdown.style.display = 'block';
                    return;
                }
                
                dropdown.innerHTML = sales.slice(0, 10).map(sale => \`
                    <div class="autocomplete-item" onclick="selectSale('\${sale.order_id}')">
                        <div class="autocomplete-item-title">Order #\${sale.order_id} - \${sale.customer_name || 'N/A'}</div>
                        <div class="autocomplete-item-subtitle">
                            Company: \${sale.company_name || 'N/A'} | Date: \${new Date(sale.sale_date).toLocaleDateString()} | Amount: ₹\${sale.total_amount.toLocaleString()}
                        </div>
                    </div>
                \`).join('');
                dropdown.style.display = 'block';
            }
            
            function selectSale(orderId) {
                document.getElementById('saleSearchInput').value = orderId;
                document.getElementById('saleSearchDropdown').style.display = 'none';
                viewSaleDetails(orderId);
            }
            
            function filterSalesTable(filteredSales) {
                const tbody = document.getElementById('allSalesTableBody');
                
                if (!filteredSales || filteredSales.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #6b7280;">No sales found matching your search</td></tr>';
                    return;
                }
                
                tbody.innerHTML = filteredSales.map(sale => {
                    let saleDate = 'N/A';
                    try {
                        if (sale.sale_date) {
                            const date = new Date(sale.sale_date);
                            if (!isNaN(date.getTime())) {
                                saleDate = date.toLocaleDateString('en-IN', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    year: 'numeric' 
                                });
                            }
                        }
                    } catch (e) {
                        saleDate = 'Invalid Date';
                    }
                    
                    return \`
                    <tr style="cursor: pointer;" onclick="viewSaleDetails('\${sale.order_id}')" title="Click to view sale details">
                        <td><strong>\${sale.order_id}</strong></td>
                        <td>\${saleDate}</td>
                        <td>\${sale.customer_name || sale.customer_code}</td>
                        <td>\${sale.employee_name}</td>
                        <td><span class="badge \${sale.sale_type === 'With' ? 'badge-success' : 'badge-warning'}">\${sale.sale_type} GST</span></td>
                        <td>₹\${sale.total_amount.toLocaleString()}</td>
                        <td>\${sale.balance_amount > 0 ? '<span style="color: #dc2626; font-weight: 600;">₹' + sale.balance_amount.toLocaleString() + '</span>' : '<span class="badge badge-success">Paid</span>'}</td>
                        <td>
                            \${currentUser && currentUser.role === 'admin' ? '<button class="btn-primary" style="padding: 5px 12px; font-size: 12px; margin-right: 5px;" onclick="event.stopPropagation(); editSale(\\'' + sale.order_id + '\\')" title="Edit Sale"><i class="fas fa-edit"></i> Edit</button> <button class="btn-danger" style="padding: 5px 8px;" onclick="event.stopPropagation(); deleteSale(\\'' + sale.order_id + '\\')" title="Delete Sale"><i class="fas fa-trash"></i></button>' : '-'}
                        </td>
                    </tr>
                    \`;
                }).join('');
            }
            
            // Close dropdowns when clicking outside
            document.addEventListener('click', function(event) {
                if (!event.target.closest('#customerSearchInput') && !event.target.closest('#customerSearchDropdown')) {
                    document.getElementById('customerSearchDropdown').style.display = 'none';
                }
                if (!event.target.closest('#saleSearchInput') && !event.target.closest('#saleSearchDropdown')) {
                    document.getElementById('saleSearchDropdown').style.display = 'none';
                }
            });

            async function searchCustomer() {
                const searchTerm = document.getElementById('customerSearchInput').value.trim();
                
                if (!searchTerm) {
                    alert('Please enter a Customer Code or Mobile Number');
                    return;
                }
                
                try {
                    // Search for lead by customer_code or mobile_number
                    const response = await axios.get('/api/leads?search=' + encodeURIComponent(searchTerm));
                    const leads = response.data.data;
                    
                    if (!leads || leads.length === 0) {
                        alert('No customer found with that code or mobile number');
                        document.getElementById('customerDetailsResult').style.display = 'none';
                        return;
                    }
                    
                    const customer = leads[0]; // Take first match
                    
                    // Display customer info
                    document.getElementById('customerInfo').innerHTML = 
                        '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">' +
                            '<div><strong>Customer Code:</strong> ' + (customer.customer_code || 'N/A') + '</div>' +
                            '<div><strong>Name:</strong> ' + customer.customer_name + '</div>' +
                            '<div><strong>Mobile:</strong> ' + customer.mobile_number + '</div>' +
                            '<div><strong>Alternate Mobile:</strong> ' + (customer.alternate_mobile || 'N/A') + '</div>' +
                            '<div><strong>Company:</strong> ' + (customer.company_name || 'N/A') + '</div>' +
                            '<div><strong>Email:</strong> ' + (customer.email || 'N/A') + '</div>' +
                            '<div><strong>Location:</strong> ' + (customer.location || 'N/A') + '</div>' +
                            '<div><strong>GST:</strong> ' + (customer.gst_number || 'N/A') + '</div>' +
                        '</div>';
                    
                    // Fetch ALL sales for this customer (not just current month)
                    const salesResponse = await axios.get('/api/sales?page=1&limit=1000');
                    const allSales = salesResponse.data.data;
                    
                    // Filter sales by customer code or mobile
                    const customerSales = allSales.filter(sale => 
                        sale.customer_code === customer.customer_code || 
                        sale.customer_contact === customer.mobile_number
                    );
                    
                    // Display sales
                    const tbody = document.getElementById('customerSalesTableBody');
                    if (customerSales.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No sales found for this customer</td></tr>';
                    } else {
                        tbody.innerHTML = customerSales.map(sale => {
                            const items = sale.items || [];
                            const products = items.length > 0 
                                ? items.map(item => item.product_name + ' (x' + item.quantity + ')').join(', ')
                                : 'No products';
                            
                            return '<tr>' +
                                '<td><strong>' + sale.order_id + '</strong></td>' +
                                '<td>' + new Date(sale.sale_date).toLocaleDateString() + '</td>' +
                                '<td><small>' + products + '</small></td>' +
                                '<td>₹' + sale.total_amount.toLocaleString() + '</td>' +
                                '<td>' + (sale.balance_amount > 0 ? '<span style="color: #dc2626;">₹' + sale.balance_amount.toLocaleString() + '</span>' : '<span class="badge badge-success">Paid</span>') + '</td>' +
                            '</tr>';
                        }).join('');
                    }
                    
                    // Show results
                    document.getElementById('customerDetailsResult').style.display = 'block';
                    
                } catch (error) {
                    console.error('Error searching customer:', error);
                    alert('Error searching customer: ' + (error.response?.data?.error || error.message));
                }
            }
            
            // ===== QUOTATION FUNCTIONS =====
            let quotationItemCounter = 0;

            // Open New Quotation Modal
            function openNewQuotationModal() {
                document.getElementById('actionMenu').classList.remove('show');
                const modal = document.getElementById('newQuotationModal');
                modal.classList.add('show');
                
                // Generate quotation number
                generateQuotationNumber();
                
                // Don't load courier partners from database - use hardcoded list that matches courier calculator
                // loadCourierPartners(); // REMOVED - hardcoded list in HTML is correct
                
                // Clear form
                document.getElementById('newQuotationForm').reset();
                document.getElementById('quotationItemsRows').innerHTML = '';
                quotationItemCounter = 0;
                
                // Add first item row
                addQuotationItem();
            }

            // Generate Quotation Number
            async function generateQuotationNumber() {
                try {
                    const response = await axios.get('/api/quotations/generate-number');
                    if (response.data.success) {
                        document.getElementById('quotationNumber').value = response.data.quotation_number;
                    }
                } catch (error) {
                    console.error('Error generating quotation number:', error);
                }
            }

            // Store the current lead ID for updating
            let currentLeadId = null;
            
            // Fetch Customer Details for Quotation from LEADS table
            async function fetchCustomerForQuotation(searchTerm) {
                if (!searchTerm || searchTerm.trim() === '') return;
                
                const statusEl = document.getElementById('quotationCustomerFetchStatus');
                statusEl.style.display = 'block';
                statusEl.style.color = '#667eea';
                statusEl.textContent = 'Searching customer...';
                
                try {
                    const response = await axios.get('/api/customers/search/' + encodeURIComponent(searchTerm));
                    
                    if (response.data.success) {
                        const lead = response.data.data;
                        currentLeadId = lead.id; // Store lead ID for updating
                        
                        // Fill in customer details from LEADS table
                        document.getElementById('quotationCustomerCode').value = lead.customer_code || '';
                        document.getElementById('quotationCustomerName').value = lead.customer_name || '';
                        document.getElementById('quotationCustomerContact').value = lead.mobile_number || '';
                        document.getElementById('quotationCustomerEmail').value = lead.email || '';
                        document.getElementById('quotationCompanyName').value = lead.company_name || '';
                        document.getElementById('quotationGSTNumber').value = lead.gst_number || '';
                        document.getElementById('quotationGSTAddress').value = lead.complete_address || '';
                        document.getElementById('quotationCustomerAddress').value = lead.complete_address || '';
                        document.getElementById('quotationConcernPerson').value = lead.customer_name || '';  // Use customer name as concern person
                        document.getElementById('quotationConcernContact').value = lead.alternate_mobile || lead.mobile_number || '';
                        
                        statusEl.style.color = '#10b981';
                        statusEl.textContent = '✓ Customer found and details filled from leads!';
                        
                        setTimeout(() => {
                            statusEl.style.display = 'none';
                        }, 3000);
                    } else {
                        currentLeadId = null; // No lead found
                        statusEl.style.color = '#f59e0b';
                        statusEl.textContent = 'Customer not found. Please enter details manually.';
                        
                        setTimeout(() => {
                            statusEl.style.display = 'none';
                        }, 3000);
                    }
                } catch (error) {
                    console.error('Error fetching customer:', error);
                    currentLeadId = null;
                    statusEl.style.color = '#f59e0b';
                    statusEl.textContent = 'Customer not found. Please enter details manually.';
                    
                    setTimeout(() => {
                        statusEl.style.display = 'none';
                    }, 3000);
                }
            }

            // Add Quotation Item Row
            function addQuotationItem() {
                quotationItemCounter++;
                const tbody = document.getElementById('quotationItemsRows');
                const row = document.createElement('tr');
                row.setAttribute('data-item-id', quotationItemCounter);
                
                // Use SAME productCatalog as sale form
                const categoriesOptions = '<option value="">Select Category</option>' +
                    '<option value="A-MDVR">MDVR</option>' +
                    '<option value="B-Monitors & Monitor Kit">Monitors & Monitor Kit</option>' +
                    '<option value="C-Cameras">Cameras</option>' +
                    '<option value="D-Dashcam">Dashcam</option>' +
                    '<option value="E-GPS">GPS</option>' +
                    '<option value="F-Storage">Storage</option>' +
                    '<option value="G-RFID Tags">RFID Tags</option>' +
                    '<option value="H-RFID Reader">RFID Reader</option>' +
                    '<option value="I-MDVR Accessories">MDVR Accessories</option>' +
                    '<option value="J-Other Products">Other Products</option>';
                
                row.innerHTML = '<td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">' + quotationItemCounter + '</td>' +
                    '<td style="padding: 8px; border: 1px solid #e5e7eb;">' +
                        '<select class="quotation-item-category" onchange="updateQuotationProductOptions(this)" ' +
                               'style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;" required>' +
                            categoriesOptions +
                        '</select>' +
                    '</td>' +
                    '<td style="padding: 8px; border: 1px solid #e5e7eb;">' +
                        '<select class="quotation-item-product" data-weight="0" onchange="handleQuotationProductChange(this)" ' +
                               'style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px; margin-bottom: 4px;" required>' +
                            '<option value="">Select Category First</option>' +
                        '</select>' +
                        '<input type="text" class="custom-product-name" placeholder="Enter custom product name" ' +
                               'style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px; display: none;">' +
                    '</td>' +
                    '<td style="padding: 8px; border: 1px solid #e5e7eb;">' +
                        '<input type="number" class="quotation-item-quantity" value="1" min="1" ' +
                               'style="width: 80px; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;" ' +
                               'onchange="calculateQuotationTotalWeight()" required>' +
                    '</td>' +
                    '<td style="padding: 8px; border: 1px solid #e5e7eb;">' +
                        '<input type="number" class="quotation-item-price" value="0" min="0" step="0.01" ' +
                               'style="width: 120px; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;" ' +
                               'onchange="calculateQuotationTotal()" required>' +
                    '</td>' +
                    '<td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;" class="quotation-item-amount">₹0.00</td>' +
                    '<td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">' +
                        '<button type="button" onclick="removeQuotationItem(this)" ' +
                                'style="background: #dc2626; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">' +
                            '<i class="fas fa-trash"></i>' +
                        '</button>' +
                    '</td>';
                tbody.appendChild(row);
            }
            
            // Update product options when category changes (USE SAME LOGIC AS SALE FORM)
            function updateQuotationProductOptions(selectElement) {
                const category = selectElement.value;
                const row = selectElement.closest('tr');
                const productSelect = row.querySelector('.quotation-item-product');
                const customInput = row.querySelector('.custom-product-name');
                
                productSelect.innerHTML = '<option value="">Select Product</option>';
                
                if (category && productCatalog[category]) {
                    productCatalog[category].forEach(product => {
                        const option = document.createElement('option');
                        option.value = product.name;
                        option.textContent = product.name;
                        option.dataset.weight = product.weight;
                        productSelect.appendChild(option);
                    });
                    
                    // Add "Custom Product" option for Accessories category
                    if (category === 'I-MDVR Accessories') {
                        const customOption = document.createElement('option');
                        customOption.value = 'custom';
                        customOption.textContent = '--- Custom Product ---';
                        customOption.dataset.weight = 0;
                        productSelect.appendChild(customOption);
                    }
                }
                
                // Hide custom input by default
                if (customInput) {
                    customInput.style.display = 'none';
                    customInput.value = '';
                }
            }
            
            // Handle product selection change - show custom input if needed
            function handleQuotationProductChange(selectElement) {
                const row = selectElement.closest('tr');
                const customInput = row.querySelector('.custom-product-name');
                
                if (selectElement.value === 'custom' && customInput) {
                    customInput.style.display = 'block';
                    customInput.focus();
                } else if (customInput) {
                    customInput.style.display = 'none';
                }
                
                calculateQuotationTotalWeight();
            }
            
            // Calculate total weight from selected products (SAME AS SALE FORM)
            function calculateQuotationTotalWeight() {
                const rows = document.querySelectorAll('#quotationItemsRows tr');
                let totalWeight = 0;
                
                rows.forEach(row => {
                    const productSelect = row.querySelector('.quotation-item-product');
                    const quantityInput = row.querySelector('.quotation-item-quantity');
                    
                    if (productSelect && quantityInput) {
                        const selectedOption = productSelect.options[productSelect.selectedIndex];
                        const weight = parseFloat(selectedOption.dataset.weight) || 0;
                        const quantity = parseFloat(quantityInput.value) || 0;
                        totalWeight += weight * quantity;
                    }
                });
                
                // Update weight input
                const weightInput = document.getElementById('quotationWeight');
                if (weightInput) {
                    weightInput.value = totalWeight.toFixed(2);
                }
                
                // Recalculate courier charges
                calculateQuotationCourierCharges();
                
                return totalWeight;
            }

            // Remove Quotation Item
            function removeQuotationItem(button) {
                const row = button.closest('tr');
                row.remove();
                calculateQuotationTotal();
                
                // Renumber items
                const rows = document.querySelectorAll('#quotationItemsRows tr');
                rows.forEach((row, index) => {
                    row.querySelector('td:first-child').textContent = index + 1;
                });
            }
            
            // Load delivery methods for quotation (same as courier calculation page)
            function loadQuotationDeliveryMethods() {
                const company = document.getElementById('quotationCourierPartner').value;
                const methodSelect = document.getElementById('quotationDeliveryMethod');
                
                methodSelect.innerHTML = '<option value="">Select Mode</option>';
                
                if (!company) {
                    document.getElementById('quotationCourierCost').value = 0;
                    calculateQuotationTotal();
                    return;
                }
                
                // For Self Pickup and Self Deliver, no charges
                if (company === 'Self Pickup' || company === 'Self Deliver') {
                    document.getElementById('quotationCourierCost').value = 0;
                    calculateQuotationTotal();
                    return;
                }
                
                // Add standard modes for all other courier partners
                methodSelect.innerHTML += '<option value="Surface">Surface</option>';
                methodSelect.innerHTML += '<option value="Air">Air</option>';
                methodSelect.innerHTML += '<option value="Priority">Priority next day</option>';
                methodSelect.innerHTML += '<option value="Bus">Bus</option>';
            }
            
            // Calculate courier charges for quotation (same logic as courier calculation page)
            function calculateQuotationCourierCharges() {
                const company = document.getElementById('quotationCourierPartner').value;
                const mode = document.getElementById('quotationDeliveryMethod').value;
                const totalWeight = parseFloat(document.getElementById('quotationWeight').value) || 0;
                
                if (!company || !mode || totalWeight === 0) {
                    document.getElementById('quotationCourierCost').value = 0;
                    calculateQuotationTotal();
                    return;
                }
                
                // Calculate rate per kg based on company and mode (same as courier calculation page)
                let ratePerKg = 0;
                
                if (company === 'Trackon') {
                    if (mode === 'Air') {
                        ratePerKg = 110;
                    } else if (mode === 'Surface') {
                        ratePerKg = 90;
                    } else if (mode === 'Priority') {
                        ratePerKg = 130;
                    } else if (mode === 'Bus') {
                        ratePerKg = 80;
                    }
                } else {
                    // Default rates for other couriers
                    if (mode === 'Air') {
                        ratePerKg = 100;
                    } else if (mode === 'Surface') {
                        ratePerKg = 80;
                    } else if (mode === 'Priority') {
                        ratePerKg = 120;
                    } else if (mode === 'Bus') {
                        ratePerKg = 70;
                    }
                }
                
                // Calculate costs (same as courier calculation page)
                const baseCost = totalWeight * ratePerKg;
                const fuelCharge = baseCost * 0.10; // 10% fuel charge
                const totalCost = baseCost + fuelCharge;
                
                // Update courier cost field
                document.getElementById('quotationCourierCost').value = totalCost.toFixed(2);
                calculateQuotationTotal();
            }
            
            // Load delivery methods based on courier partner from database (OLD FUNCTION - KEEP FOR COMPATIBILITY)
            async function loadDeliveryMethods() {
                const partner = document.getElementById('quotationCourierPartner').value;
                const methodSelect = document.getElementById('quotationDeliveryMethod');
                
                methodSelect.innerHTML = '<option value="">Select Delivery Method</option>';
                
                if (!partner) {
                    document.getElementById('quotationCourierCost').value = 0;
                    calculateQuotationTotal();
                    return;
                }
                
                // Special handling for Self Pickup and Hand Delivery
                if (partner === 'Self Pickup' || partner === 'Hand Delivery') {
                    methodSelect.innerHTML += '<option value="' + partner + '">' + partner + '</option>';
                    document.getElementById('quotationCourierCost').value = 0;
                    calculateQuotationTotal();
                    return;
                }
                
                // Load delivery methods from database
                try {
                    const response = await axios.get('/api/courier-rates');
                    if (response.data.success) {
                        const rates = response.data.data.filter(r => r.courier_partner === partner);
                        const methods = [...new Set(rates.map(r => r.delivery_method))];
                        
                        methods.forEach(method => {
                            methodSelect.innerHTML += '<option value="' + method + '">' + method + '</option>';
                        });
                    }
                } catch (error) {
                    console.error('Error loading delivery methods:', error);
                }
            }
            
            // Load courier partners from database
            async function loadCourierPartners() {
                try {
                    const response = await axios.get('/api/courier-rates');
                    if (response.data.success) {
                        const partners = [...new Set(response.data.data.map(r => r.courier_partner))];
                        const partnerSelect = document.getElementById('quotationCourierPartner');
                        
                        // Keep the default option
                        partnerSelect.innerHTML = '<option value="">Select Courier Partner</option>';
                        
                        // Add database partners
                        partners.forEach(partner => {
                            partnerSelect.innerHTML += '<option value="' + partner + '">' + partner + '</option>';
                        });
                        
                        // Add special options
                        partnerSelect.innerHTML += '<option value="Self Pickup">Self Pickup</option>';
                        partnerSelect.innerHTML += '<option value="Hand Delivery">Hand Delivery</option>';
                    }
                } catch (error) {
                    console.error('Error loading courier partners:', error);
                }
            }
            
            // Calculate courier charges based on partner, method and weight
            async function calculateCourierCharges() {
                const partner = document.getElementById('quotationCourierPartner').value;
                const method = document.getElementById('quotationDeliveryMethod').value;
                const weight = parseFloat(document.getElementById('quotationWeight').value) || 1;
                
                if (!partner || !method) {
                    document.getElementById('quotationCourierCost').value = 0;
                    calculateQuotationTotal();
                    return;
                }
                
                try {
                    const response = await axios.get('/api/courier-rates/' + encodeURIComponent(partner) + '/' + encodeURIComponent(method));
                    if (response.data.success) {
                        const rate = response.data.data;
                        const charges = rate.base_rate + (rate.per_kg_rate * weight);
                        document.getElementById('quotationCourierCost').value = charges.toFixed(2);
                        calculateQuotationTotal();
                    }
                } catch (error) {
                    console.error('Error calculating courier charges:', error);
                    document.getElementById('quotationCourierCost').value = 0;
                    calculateQuotationTotal();
                }
            }

            // Toggle Courier Section
            function toggleCourierSection() {
                const checkbox = document.getElementById('includeCourierCheckbox');
                const courierSection = document.getElementById('courierSection');
                
                if (checkbox.checked) {
                    courierSection.style.display = 'block';
                } else {
                    courierSection.style.display = 'none';
                    // Reset courier cost to 0
                    document.getElementById('quotationCourierCost').value = 0;
                    calculateQuotationTotal();
                }
            }
            
            // Calculate Quotation Total
            function updateCurrencyDisplay() {
                const currency = document.getElementById('quotationCurrency').value;
                const currencySymbols = {
                    'INR': '₹',
                    'USD': '$',
                    'EUR': '€',
                    'GBP': '£'
                };
                const symbol = currencySymbols[currency] || '₹';
                
                // Re-calculate to update display
                calculateQuotationTotal();
            }
            
            function calculateQuotationTotal() {
                console.log('🔥 QUOTATION CALC v3.0 RUNNING 🔥');
                const rows = document.querySelectorAll('#quotationItemsRows tr');
                let subtotal = 0;
                
                console.log('calculateQuotationTotal: Found', rows.length, 'rows');
                
                // Calculate subtotal and update row amounts
                rows.forEach(row => {
                    const qtyInput = row.querySelector('.quotation-item-quantity');
                    const priceInput = row.querySelector('.quotation-item-price');
                    
                    console.log('Input elements:', {
                        qtyInput: qtyInput,
                        priceInput: priceInput,
                        qtyValue: qtyInput?.value,
                        priceValue: priceInput?.value
                    });
                    
                    const quantity = parseFloat(qtyInput?.value) || 0;
                    const price = parseFloat(priceInput?.value) || 0;
                    const amount = quantity * price;
                    subtotal += amount;
                    
                    console.log('Row:', 'qty=', quantity, 'price=', price, 'amount=', amount);
                    
                    // Update row amount display
                    const amountCell = row.querySelector('.quotation-item-amount');
                    if (amountCell) {
                        amountCell.textContent = '₹' + amount.toFixed(2);
                    }
                });
                
                console.log('Subtotal:', subtotal);
                
                // Check if courier is included
                const includeCourier = document.getElementById('includeCourierCheckbox') ? document.getElementById('includeCourierCheckbox').checked : true;
                const courierCostInput = document.getElementById('quotationCourierCost');
                const courierCost = includeCourier && courierCostInput ? (parseFloat(courierCostInput.value) || 0) : 0;
                const billTypeSelect = document.getElementById('quotationBillType');
                const billType = billTypeSelect ? billTypeSelect.value : 'with';
                const gst = billType === 'with' ? (subtotal + courierCost) * 0.18 : 0;
                const total = subtotal + courierCost + gst;
                
                console.log('Courier:', courierCost, 'GST:', gst, 'Total:', total);
                
                // Get currency symbol
                const currencySelect = document.getElementById('quotationCurrency');
                const currency = currencySelect ? currencySelect.value : 'INR';
                const currencySymbols = {
                    'INR': '₹',
                    'USD': '$',
                    'EUR': '€',
                    'GBP': '£'
                };
                const symbol = currencySymbols[currency] || '₹';
                
                const subtotalEl = document.getElementById('quotationSubtotal');
                const courierDisplayEl = document.getElementById('quotationCourierDisplay');
                const gstEl = document.getElementById('quotationGST');
                const totalEl = document.getElementById('quotationTotal');
                
                if (subtotalEl) subtotalEl.textContent = symbol + subtotal.toFixed(2);
                if (courierDisplayEl) courierDisplayEl.textContent = symbol + courierCost.toFixed(2);
                if (gstEl) gstEl.textContent = symbol + gst.toFixed(2);
                if (totalEl) totalEl.textContent = symbol + total.toFixed(2);
                
                console.log('Elements found:', {subtotalEl: !!subtotalEl, courierDisplayEl: !!courierDisplayEl, gstEl: !!gstEl, totalEl: !!totalEl});
                
                // Show/hide GST row based on bill type
                const gstLabel = document.getElementById('quotationGSTLabel');
                const gstValue = document.getElementById('quotationGST');
                if (billType === 'without') {
                    gstLabel.style.display = 'none';
                    gstValue.style.display = 'none';
                } else {
                    gstLabel.style.display = 'block';
                    gstValue.style.display = 'block';
                }
            }

            // Update Lead Data from Quotation Form
            async function updateLeadFromQuotationForm(leadId, quotationData) {
                try {
                    const updateData = {
                        customer_code: quotationData.customer_code,
                        customer_name: quotationData.customer_name,
                        mobile_number: quotationData.customer_contact,
                        email: quotationData.customer_email,
                        company_name: quotationData.company_name,
                        gst_number: quotationData.gst_number,
                        complete_address: quotationData.customer_address || quotationData.gst_registered_address,
                        alternate_mobile: quotationData.concern_person_contact
                    };
                    
                    await axios.put('/api/leads/' + leadId, updateData);
                    console.log('Lead data updated successfully');
                } catch (error) {
                    console.error('Error updating lead data:', error);
                    // Don't fail quotation creation if lead update fails
                }
            }
            
            // Submit New Quotation
            async function submitNewQuotation(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                
                // Collect items
                const items = [];
                const rows = document.querySelectorAll('#quotationItemsRows tr');
                rows.forEach(row => {
                    const productSelect = row.querySelector('.quotation-item-product');
                    const customInput = row.querySelector('.custom-product-name');
                    
                    // Use custom product name if "custom" is selected
                    let productName;
                    if (productSelect.value === 'custom' && customInput && customInput.value.trim()) {
                        productName = customInput.value.trim();
                    } else {
                        productName = productSelect.options[productSelect.selectedIndex].text;
                    }
                    
                    const quantity = parseInt(row.querySelector('.quotation-item-quantity').value);
                    const unitPrice = parseFloat(row.querySelector('.quotation-item-price').value);
                    
                    const item = {
                        product_name: productName,
                        quantity: quantity,
                        unit_price: unitPrice,
                        amount: quantity * unitPrice
                    };
                    items.push(item);
                });
                
                if (items.length === 0) {
                    alert('Please add at least one item');
                    return;
                }
                
                // Calculate totals
                const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
                const courierCost = parseFloat(formData.get('courier_cost')) || 0;
                const billType = formData.get('bill_type');
                const gst_amount = billType === 'with' ? (subtotal + courierCost) * 0.18 : 0;
                const total_amount = subtotal + courierCost + gst_amount;
                
                const quotationData = {
                    quotation_number: formData.get('quotation_number'),
                    customer_code: formData.get('customer_code'),
                    customer_name: formData.get('customer_name'),
                    customer_contact: formData.get('customer_contact'),
                    customer_email: formData.get('customer_email'),
                    company_name: formData.get('company_name'),
                    gst_number: formData.get('gst_number'),
                    gst_registered_address: formData.get('gst_registered_address'),
                    customer_address: formData.get('customer_address'),
                    concern_person_name: formData.get('concern_person_name'),
                    concern_person_contact: formData.get('concern_person_contact'),
                    items: items,
                    subtotal: subtotal,
                    courier_cost: courierCost,
                    courier_partner: formData.get('courier_partner'),
                    delivery_method: formData.get('delivery_method'),
                    bill_type: billType,
                    gst_amount: gst_amount,
                    total_amount: total_amount,
                    theme: formData.get('quotation_theme') || 'blue',
                    currency: formData.get('currency') || 'INR',
                    notes: formData.get('notes'),
                    terms_conditions: formData.get('terms_conditions'),
                    created_by: currentUser.fullName
                };
                
                try {
                    console.log('📤 Submitting quotation data:', quotationData);
                    
                    // Update existing lead OR create new lead if data was entered manually
                    if (currentLeadId) {
                        // Update existing lead
                        await updateLeadFromQuotationForm(currentLeadId, quotationData);
                    } else if (quotationData.customer_name && quotationData.customer_contact) {
                        // Create new lead from quotation data
                        try {
                            const newLeadData = {
                                customer_code: quotationData.customer_code || null,
                                customer_name: quotationData.customer_name,
                                mobile_number: quotationData.customer_contact,
                                alternate_mobile: quotationData.concern_person_contact || null,
                                email: quotationData.customer_email || null,
                                company_name: quotationData.company_name || null,
                                gst_number: quotationData.gst_number || null,
                                location: null,
                                complete_address: quotationData.customer_address || quotationData.gst_registered_address || null,
                                lead_status: 'New',
                                lead_source: 'Quotation',
                                assigned_to: currentUser.fullName
                            };
                            
                            const leadResponse = await axios.post('/api/leads', newLeadData);
                            if (leadResponse.data.success) {
                                console.log('✅ New lead created:', leadResponse.data.lead_id);
                            }
                        } catch (error) {
                            console.error('Error creating new lead:', error);
                            // Don't fail quotation creation if lead creation fails
                        }
                    }
                    
                    const response = await axios.post('/api/quotations', quotationData);
                    
                    console.log('📥 Server response:', response.data);
                    
                    if (response.data.success) {
                        // Close new quotation modal
                        document.getElementById('newQuotationModal').classList.remove('show');
                        
                        // Show preview modal
                        viewQuotationPreview(quotationData.quotation_number);
                        
                        // Refresh quotations list if on that page
                        if (currentPage === 'quotations') {
                            loadQuotations();
                        }
                    } else {
                        console.error('❌ Server error:', response.data.error);
                        alert('Error creating quotation: ' + response.data.error);
                    }
                } catch (error) {
                    console.error('❌ Error details:', error);
                    console.error('Error response:', error.response?.data);
                    console.error('Error status:', error.response?.status);
                    alert('Failed to create quotation. Please try again. Check console for details.');
                }
            }
            
            // View Quotation Preview
            let currentQuotationNumber = null;
            let currentQuotationData = null;
            
            async function viewQuotationPreview(quotationNumber) {
                currentQuotationNumber = quotationNumber;
                const modal = document.getElementById('quotationPreviewModal');
                const content = document.getElementById('quotationPreviewContent');
                
                modal.classList.add('show');
                content.innerHTML = '<div class="loading">Loading...</div>';
                
                try {
                    const response = await axios.get('/api/quotations/' + quotationNumber);
                    const quotation = response.data.data;
                    currentQuotationData = quotation;
                    
                    // Items are already parsed by the API, no need to parse again
                    const items = Array.isArray(quotation.items) ? quotation.items : JSON.parse(quotation.items || '[]');
                    const billType = quotation.bill_type || 'with';
                    
                    // Convert number to words for amount
                    function numberToWords(num) {
                        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
                        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
                        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
                        
                        if (num === 0) return 'Zero';
                        if (num < 10) return ones[num];
                        if (num < 20) return teens[num - 10];
                        if (num < 100) return tens[Math.floor(num / 10)] + ' ' + ones[num % 10];
                        if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred ' + numberToWords(num % 100);
                        if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand ' + numberToWords(num % 1000);
                        if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh ' + numberToWords(num % 100000);
                        return numberToWords(Math.floor(num / 10000000)) + ' Crore ' + numberToWords(num % 10000000);
                    }
                    
                    // Get currency symbol
                const currency = quotation.currency || 'INR';
                const currencySymbols = {
                    'INR': '₹',
                    'USD': '$',
                    'EUR': '€',
                    'GBP': '£'
                };
                const currencySymbol = currencySymbols[currency] || '₹';
                const currencyName = currency === 'INR' ? 'Rupees' : (currency === 'USD' ? 'Dollars' : (currency === 'EUR' ? 'Euros' : 'Pounds'));
                
                const amountInWords = numberToWords(Math.floor(quotation.total_amount)) + ' ' + currencyName + ' only';
                    
                    // Get theme color
                    const theme = quotation.theme || 'blue';
                    const themeColors = {
                        blue: { primary: '#DC143C', secondary: '#2C3E50', dark: '#1a252f', light: '#ECF0F1' },
                        green: { primary: '#10B981', secondary: '#047857', dark: '#065F46', light: '#ECFDF5' },
                        purple: { primary: '#8B5CF6', secondary: '#6D28D9', dark: '#5B21B6', light: '#F5F3FF' },
                        orange: { primary: '#F97316', secondary: '#C2410C', dark: '#9A3412', light: '#FFF7ED' },
                        red: { primary: '#DC143C', secondary: '#B91C1C', dark: '#991B1B', light: '#FEF2F2' }
                    };
                    const themeColor = themeColors[theme];
                    
                    const quotationDate = new Date(quotation.created_at).toLocaleDateString('en-GB');
                    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
                    
                    // Invoice-style Quotation Template
                    content.innerHTML = '<div id="quotation-printable" style="padding: 0; background: white; font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; border: 1px solid #ddd;">' +
                        // Header with theme color curved design
                        '<div style="background: ' + themeColor.primary + '; border-radius: 0 0 50% 0; padding: 20px 30px; position: relative;">' +
                            '<div style="display: flex; justify-content: space-between; align-items: flex-start;">' +
                                '<div>' +
                                    '<img src="/static/axelguard-logo.png" alt="AxelGuard" style="height: 50px; width: auto; background: white; padding: 5px; border-radius: 4px;">' +
                                '</div>' +
                                '<div style="text-align: right; color: white;">' +
                                    '<p style="margin: 2px 0; font-size: 11px;"><i class="fas fa-phone"></i> | +91 8755311835</p>' +
                                    '<p style="margin: 2px 0; font-size: 11px;"><i class="fas fa-envelope"></i> | info@axel-guard.com</p>' +
                                    '<p style="margin: 2px 0; font-size: 11px;"><i class="fas fa-map-marker-alt"></i> | Office No.210 Second Floor PC Chamber</p>' +
                                    '<p style="margin: 2px 0; font-size: 11px;">Sector 66 Noida, Uttar Pradesh - 201301</p>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        
                        // Company name and GSTIN banner
                        '<div style="background: ' + themeColor.secondary + '; color: white; padding: 15px 30px;">' +
                            '<h1 style="margin: 0; font-size: 22px; font-weight: bold;">RealTrack Technology</h1>' +
                            '<div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 11px;">' +
                                '<span>GSTIN: 09FSEPP6050C1ZQ</span>' +
                                '<span>State: 09 - Uttar Pradesh</span>' +
                            '</div>' +
                        '</div>' +
                        
                        '<div style="padding: 30px;">' +
                            // Estimate title and details grid
                            '<div style="display: grid; grid-template-columns: 1fr auto; gap: 20px; margin-bottom: 25px;">' +
                                // Estimate For section
                                '<div style="border: 1px solid #ddd; padding: 15px;">' +
                                    '<h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: ' + themeColor.primary + ';">Estimate For:</h3>' +
                                    '<p style="margin: 3px 0; font-size: 13px; font-weight: bold; text-transform: uppercase;">' + (quotation.company_name || quotation.customer_name) + '</p>' +
                                    '<p style="margin: 3px 0; font-size: 12px;">' + (quotation.customer_address || '') + '</p>' +
                                    (quotation.customer_contact ? '<p style="margin: 3px 0; font-size: 12px;"><strong>Contact No.:</strong> ' + quotation.customer_contact + '</p>' : '') +
                                    (quotation.gst_number ? '<p style="margin: 3px 0; font-size: 12px;"><strong>GSTIN Number:</strong> ' + quotation.gst_number + '</p>' : '') +
                                    (quotation.gst_number ? '<p style="margin: 3px 0; font-size: 12px;"><strong>State:</strong> ' + (quotation.gst_registered_address ? quotation.gst_registered_address.split(',').slice(-2).join(',').trim() : 'N/A') + '</p>' : '') +
                                '</div>' +
                                
                                // Estimate details
                                '<div style="min-width: 250px;">' +
                                    '<h2 style="margin: 0 0 15px 0; font-size: 32px; font-weight: bold; color: ' + themeColor.primary + '; text-align: right;">Estimate</h2>' +
                                    '<table style="width: 100%; font-size: 12px; border-collapse: collapse;">' +
                                        '<tr><td style="padding: 4px; background: #f3f4f6; font-weight: bold;">Estimate No.:</td><td style="padding: 4px; text-align: right;">' + quotation.quotation_number + '</td></tr>' +
                                        '<tr><td style="padding: 4px; background: #f3f4f6; font-weight: bold;">Date:</td><td style="padding: 4px; text-align: right;">' + quotationDate + '</td></tr>' +
                                    '</table>' +
                                '</div>' +
                            '</div>' +
                            
                            // Ship To section
                            '<div style="border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; background: #f9fafb;">' +
                                '<h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: ' + themeColor.primary + ';">Ship To :</h3>' +
                                '<p style="margin: 3px 0; font-size: 12px; text-transform: uppercase;">' + (quotation.customer_address || '') + '</p>' +
                            '</div>' +
                        
                            // Items Table with themed header
                            '<table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 12px;">' +
                                '<thead>' +
                                    '<tr style="background: ' + themeColor.primary + '; color: white;">' +
                                        '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: center; font-weight: bold;">#</th>' +
                                        '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: left; font-weight: bold;">Item name</th>' +
                                        '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: center; font-weight: bold;">Quantity</th>' +
                                        '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: center; font-weight: bold;">Unit</th>' +
                                        '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: right; font-weight: bold;">Price/ Unit</th>' +
                                        '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: right; font-weight: bold;">Amount</th>' +
                                    '</tr>' +
                                '</thead>' +
                                '<tbody>' + 
                                items.map((item, index) => 
                                    '<tr style="' + (index % 2 === 0 ? '' : 'background: #f9fafb;') + '">' +
                                        '<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">' + (index + 1) + '</td>' +
                                        '<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">' + item.product_name + '<br><span style="font-size: 10px; color: #666;">Model No.: ' + (item.model || 'N/A') + '</span></td>' +
                                        '<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">' + item.quantity + '</td>' +
                                        '<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">Pcs</td>' +
                                        '<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">' + currencySymbol + ' ' + item.unit_price.toFixed(2) + '</td>' +
                                        '<td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: 600;">' + currencySymbol + ' ' + item.amount.toFixed(2) + '</td>' +
                                    '</tr>'
                                ).join('') +
                                '<tr style="background: ' + themeColor.primary + '; color: white; font-weight: bold;">' +
                                    '<td colspan="5" style="border: 1px solid ' + themeColor.primary + '; padding: 8px; text-align: right;">Total</td>' +
                                    '<td style="border: 1px solid ' + themeColor.primary + '; padding: 8px; text-align: center;">' + totalQuantity + '</td>' +
                                '</tr>' +
                                '</tbody>' +
                            '</table>' +
                        
                            // Summary section with bank details
                            '<div style="display: grid; grid-template-columns: 1fr auto; gap: 20px; margin-top: 20px;">' +
                                // Bank Details
                                '<div style="border: 1px solid #ddd; padding: 15px; background: #f9fafb;">' +
                                    '<h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: bold;">Pay To:</h3>' +
                                    '<p style="margin: 2px 0; font-size: 11px;"><strong>Bank Name :</strong> IDFC FIRST BANK LTD, NOIDA-SIXTEEN BRANCH</p>' +
                                    '<p style="margin: 2px 0; font-size: 11px;"><strong>Bank Account No. :</strong> 10188344828</p>' +
                                    '<p style="margin: 2px 0; font-size: 11px;"><strong>Bank IFSC code :</strong> IDFB0020158</p>' +
                                    '<p style="margin: 2px 0; font-size: 11px;"><strong>Account Holder Name :</strong> RealTrack Technology</p>' +
                                '</div>' +
                                
                                // Amount Summary
                                '<div style="min-width: 300px;">' +
                                    '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">' +
                                        '<tr><td style="padding: 6px; background: #f3f4f6; font-weight: 600;">Sub Total</td><td style="padding: 6px; text-align: right; background: #f3f4f6;">' + currencySymbol + ' ' + quotation.subtotal.toFixed(2) + '</td></tr>' +
                                        (quotation.courier_cost > 0 ? '<tr><td style="padding: 6px;">Courier via ' + (quotation.courier_partner || 'Standard') + '</td><td style="padding: 6px; text-align: right;">' + currencySymbol + ' ' + quotation.courier_cost.toFixed(2) + '</td></tr>' : '') +
                                        (quotation.gst_amount > 0 ? '<tr><td style="padding: 6px;">IGST@18%</td><td style="padding: 6px; text-align: right;">' + currencySymbol + ' ' + quotation.gst_amount.toFixed(2) + '</td></tr>' : '') +
                                        '<tr style="background: ' + themeColor.primary + '; color: white; font-weight: bold; font-size: 14px;"><td style="padding: 10px;">total</td><td style="padding: 10px; text-align: right;">' + currencySymbol + ' ' + quotation.total_amount.toFixed(2) + '</td></tr>' +
                                    '</table>' +
                                '</div>' +
                            '</div>' +
                            
                            // Amount in Words
                            '<div style="margin: 20px 0; padding: 12px; background: #f3f4f6; border-left: 4px solid ' + themeColor.primary + ';">' +
                                '<p style="margin: 0; font-size: 12px; font-weight: 600;">Estimate Amount In Words</p>' +
                                '<p style="margin: 5px 0 0 0; font-size: 13px; font-weight: bold; color: ' + themeColor.primary + ';">' + amountInWords + '</p>' +
                            '</div>' +
                            
                            // Notes (only if provided)
                            (quotation.notes && quotation.notes.trim() ? 
                                '<div style="margin-top: 25px; padding: 15px; border: 1px solid #ddd; background: #fffbeb;">' +
                                    '<h3 style="font-size: 13px; font-weight: bold; margin: 0 0 8px 0; color: ' + themeColor.primary + ';">Notes</h3>' +
                                    '<p style="margin: 0; font-size: 11px; line-height: 1.5; white-space: pre-line;">' + quotation.notes + '</p>' +
                                '</div>' : '') +
                            
                            // Terms & Conditions
                            '<div style="margin-top: 25px; padding: 15px; border: 1px solid #ddd; background: #f9fafb;">' +
                                '<h3 style="font-size: 13px; font-weight: bold; margin: 0 0 8px 0; color: ' + themeColor.primary + ';">Terms And Conditions</h3>' +
                                '<p style="margin: 0; font-size: 11px; line-height: 1.5; white-space: pre-line;">' + (quotation.terms_conditions || 'Thanks for doing business with us!') + '</p>' +
                            '</div>' +
                            
                            // Signature
                            '<div style="margin-top: 30px; text-align: right;">' +
                                '<p style="margin: 0; font-size: 12px; font-weight: 600;">For : RealTrack Technology</p>' +
                                '<div style="height: 60px; margin: 10px 0; display: flex; justify-content: flex-end;">' +
                                    '<img src="https://page.gensparksite.com/v1/base64_upload/1ea85f1279eb3a46af1b1039e04318e5" alt="Signature" style="height: 50px; width: auto;">' +
                                '</div>' +
                                '<p style="margin: 0; font-size: 11px; border-top: 1px solid #000; display: inline-block; padding-top: 5px; min-width: 150px;">Authorized Signatory</p>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                    // Set theme selector to current theme
                    const themeSelector = document.getElementById('previewThemeSelector');
                    if (themeSelector) {
                        themeSelector.value = theme;
                    }
                } catch (error) {
                    console.error('Error loading quotation:', error);
                    content.innerHTML = '<div class="card" style="background: #fee2e2; color: #991b1b;">Error loading quotation details</div>';
                }
            }
            
            // Change preview theme dynamically
            function changePreviewTheme(newTheme) {
                if (!currentQuotationData) return;
                
                // Update current quotation data with new theme
                currentQuotationData.theme = newTheme;
                
                // Directly render with new theme (don't reload from API)
                renderQuotationPreview(newTheme);
            }
            
            // Render quotation preview with current data and specified theme
            function renderQuotationPreview(themeOverride) {
                if (!currentQuotationData) return;
                
                const quotation = currentQuotationData;
                const content = document.getElementById('quotationPreviewContent');
                const items = Array.isArray(quotation.items) ? quotation.items : JSON.parse(quotation.items || '[]');
                
                // Get currency symbol
                const currency = quotation.currency || 'INR';
                const currencySymbols = {'INR': '₹', 'USD': '$', 'EUR': '€', 'GBP': '£'};
                const currencySymbol = currencySymbols[currency] || '₹';
                const currencyName = currency === 'INR' ? 'Rupees' : (currency === 'USD' ? 'Dollars' : (currency === 'EUR' ? 'Euros' : 'Pounds'));
                
                // Convert number to words
                function numberToWords(num) {
                    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
                    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
                    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
                    
                    if (num === 0) return 'Zero';
                    if (num < 10) return ones[num];
                    if (num < 20) return teens[num - 10];
                    if (num < 100) return tens[Math.floor(num / 10)] + ' ' + ones[num % 10];
                    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred ' + numberToWords(num % 100);
                    if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand ' + numberToWords(num % 1000);
                    if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh ' + numberToWords(num % 100000);
                    return numberToWords(Math.floor(num / 10000000)) + ' Crore ' + numberToWords(num % 10000000);
                }
                
                const amountInWords = numberToWords(Math.floor(quotation.total_amount)) + ' ' + currencyName + ' only';
                
                // Get theme color - use override if provided
                const theme = themeOverride || quotation.theme || 'blue';
                const themeColors = {
                    blue: { primary: '#DC143C', secondary: '#2C3E50', dark: '#1a252f', light: '#ECF0F1' },
                    green: { primary: '#10B981', secondary: '#047857', dark: '#065F46', light: '#ECFDF5' },
                    purple: { primary: '#8B5CF6', secondary: '#6D28D9', dark: '#5B21B6', light: '#F5F3FF' },
                    orange: { primary: '#F97316', secondary: '#C2410C', dark: '#9A3412', light: '#FFF7ED' },
                    red: { primary: '#DC143C', secondary: '#B91C1C', dark: '#991B1B', light: '#FEF2F2' }
                };
                const themeColor = themeColors[theme];
                
                const quotationDate = new Date(quotation.created_at).toLocaleDateString('en-GB');
                const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
                
                // Generate the full HTML content with the theme
                content.innerHTML = '<div id="quotation-printable" style="padding: 0; background: white; font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; border: 1px solid #ddd;">' +
                    // Header with theme color curved design
                    '<div style="background: ' + themeColor.primary + '; border-radius: 0 0 50% 0; padding: 20px 30px; position: relative;">' +
                        '<div style="display: flex; justify-content: space-between; align-items: flex-start;">' +
                            '<div>' +
                                '<img src="/static/axelguard-logo.png" alt="AxelGuard" style="height: 50px; width: auto; background: white; padding: 5px; border-radius: 4px;">' +
                            '</div>' +
                            '<div style="text-align: right; color: white;">' +
                                '<p style="margin: 2px 0; font-size: 11px;"><i class="fas fa-phone"></i> | +91 8755311835</p>' +
                                '<p style="margin: 2px 0; font-size: 11px;"><i class="fas fa-envelope"></i> | info@axel-guard.com</p>' +
                                '<p style="margin: 2px 0; font-size: 11px;"><i class="fas fa-map-marker-alt"></i> | Office No.210 Second Floor PC Chamber</p>' +
                                '<p style="margin: 2px 0; font-size: 11px;">Sector 66 Noida, Uttar Pradesh - 201301</p>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    
                    // Company name and GSTIN banner
                    '<div style="background: ' + themeColor.secondary + '; color: white; padding: 15px 30px;">' +
                        '<h1 style="margin: 0; font-size: 22px; font-weight: bold;">RealTrack Technology</h1>' +
                        '<div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 11px;">' +
                            '<span>GSTIN: 09FSEPP6050C1ZQ</span>' +
                            '<span>State: 09 - Uttar Pradesh</span>' +
                        '</div>' +
                    '</div>' +
                    
                    '<div style="padding: 30px;">' +
                        // Estimate title and details grid
                        '<div style="display: grid; grid-template-columns: 1fr auto; gap: 20px; margin-bottom: 25px;">' +
                            // Estimate For section
                            '<div style="border: 1px solid #ddd; padding: 15px;">' +
                                '<h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: ' + themeColor.primary + ';">Estimate For:</h3>' +
                                '<p style="margin: 3px 0; font-size: 13px; font-weight: bold; text-transform: uppercase;">' + (quotation.company_name || quotation.customer_name) + '</p>' +
                                '<p style="margin: 3px 0; font-size: 12px;">' + (quotation.customer_address || '') + '</p>' +
                                (quotation.customer_contact ? '<p style="margin: 3px 0; font-size: 12px;"><strong>Contact No.:</strong> ' + quotation.customer_contact + '</p>' : '') +
                                (quotation.gst_number ? '<p style="margin: 3px 0; font-size: 12px;"><strong>GSTIN Number:</strong> ' + quotation.gst_number + '</p>' : '') +
                                (quotation.gst_number ? '<p style="margin: 3px 0; font-size: 12px;"><strong>State:</strong> ' + (quotation.gst_registered_address ? quotation.gst_registered_address.split(',').slice(-2).join(',').trim() : 'N/A') + '</p>' : '') +
                            '</div>' +
                            
                            // Estimate details
                            '<div style="min-width: 250px;">' +
                                '<h2 style="margin: 0 0 15px 0; font-size: 32px; font-weight: bold; color: ' + themeColor.primary + '; text-align: right;">Estimate</h2>' +
                                '<table style="width: 100%; font-size: 12px; border-collapse: collapse;">' +
                                    '<tr><td style="padding: 4px; background: #f3f4f6; font-weight: bold;">Estimate No.:</td><td style="padding: 4px; text-align: right;">' + quotation.quotation_number + '</td></tr>' +
                                    '<tr><td style="padding: 4px; background: #f3f4f6; font-weight: bold;">Date:</td><td style="padding: 4px; text-align: right;">' + quotationDate + '</td></tr>' +
                                '</table>' +
                            '</div>' +
                        '</div>' +
                        
                        // Ship To section
                        '<div style="border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; background: #f9fafb;">' +
                            '<h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: ' + themeColor.primary + ';">Ship To :</h3>' +
                            '<p style="margin: 3px 0; font-size: 12px; text-transform: uppercase;">' + (quotation.customer_address || '') + '</p>' +
                        '</div>' +
                    
                        // Items Table with themed header
                        '<table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 12px;">' +
                            '<thead>' +
                                '<tr style="background: ' + themeColor.primary + '; color: white;">' +
                                    '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: center; font-weight: bold;">#</th>' +
                                    '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: left; font-weight: bold;">Item name</th>' +
                                    '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: center; font-weight: bold;">Quantity</th>' +
                                    '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: center; font-weight: bold;">Unit</th>' +
                                    '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: right; font-weight: bold;">Price/ Unit</th>' +
                                    '<th style="border: 1px solid ' + themeColor.primary + '; padding: 10px; text-align: right; font-weight: bold;">Amount</th>' +
                                '</tr>' +
                            '</thead>' +
                            '<tbody>' + 
                            items.map((item, index) => 
                                '<tr style="' + (index % 2 === 0 ? '' : 'background: #f9fafb;') + '">' +
                                    '<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">' + (index + 1) + '</td>' +
                                    '<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">' + item.product_name + '<br><span style="font-size: 10px; color: #666;">Model No.: ' + (item.model || 'N/A') + '</span></td>' +
                                    '<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">' + item.quantity + '</td>' +
                                    '<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">Pcs</td>' +
                                    '<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">' + currencySymbol + ' ' + item.unit_price.toFixed(2) + '</td>' +
                                    '<td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: 600;">' + currencySymbol + ' ' + item.amount.toFixed(2) + '</td>' +
                                '</tr>'
                            ).join('') +
                            '<tr style="background: ' + themeColor.primary + '; color: white; font-weight: bold;">' +
                                '<td colspan="5" style="border: 1px solid ' + themeColor.primary + '; padding: 8px; text-align: right;">Total</td>' +
                                '<td style="border: 1px solid ' + themeColor.primary + '; padding: 8px; text-align: center;">' + totalQuantity + '</td>' +
                            '</tr>' +
                            '</tbody>' +
                        '</table>' +
                        
                        // Summary section with bank details
                        '<div style="display: grid; grid-template-columns: 1fr auto; gap: 20px; margin-top: 20px;">' +
                            // Bank Details
                            '<div style="border: 1px solid #ddd; padding: 15px; background: #f9fafb;">' +
                                '<h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: bold;">Pay To:</h3>' +
                                '<p style="margin: 2px 0; font-size: 11px;"><strong>Bank Name :</strong> IDFC FIRST BANK LTD, NOIDA-SIXTEEN BRANCH</p>' +
                                '<p style="margin: 2px 0; font-size: 11px;"><strong>Bank Account No. :</strong> 10188344828</p>' +
                                '<p style="margin: 2px 0; font-size: 11px;"><strong>Bank IFSC code :</strong> IDFB0020158</p>' +
                                '<p style="margin: 2px 0; font-size: 11px;"><strong>Account Holder Name :</strong> RealTrack Technology</p>' +
                            '</div>' +
                            
                            // Amount Summary
                            '<div style="min-width: 300px;">' +
                                '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">' +
                                    '<tr><td style="padding: 6px; background: #f3f4f6; font-weight: 600;">Sub Total</td><td style="padding: 6px; text-align: right; background: #f3f4f6;">' + currencySymbol + ' ' + quotation.subtotal.toFixed(2) + '</td></tr>' +
                                    (quotation.courier_cost > 0 ? '<tr><td style="padding: 6px;">Courier via ' + (quotation.courier_partner || 'Standard') + '</td><td style="padding: 6px; text-align: right;">' + currencySymbol + ' ' + quotation.courier_cost.toFixed(2) + '</td></tr>' : '') +
                                    (quotation.gst_amount > 0 ? '<tr><td style="padding: 6px;">IGST@18%</td><td style="padding: 6px; text-align: right;">' + currencySymbol + ' ' + quotation.gst_amount.toFixed(2) + '</td></tr>' : '') +
                                    '<tr style="background: ' + themeColor.primary + '; color: white; font-weight: bold; font-size: 14px;"><td style="padding: 10px;">total</td><td style="padding: 10px; text-align: right;">' + currencySymbol + ' ' + quotation.total_amount.toFixed(2) + '</td></tr>' +
                                '</table>' +
                            '</div>' +
                        '</div>' +
                        
                        // Amount in Words
                        '<div style="margin: 20px 0; padding: 12px; background: #f3f4f6; border-left: 4px solid ' + themeColor.primary + ';">' +
                            '<p style="margin: 0; font-size: 12px; font-weight: 600;">Estimate Amount In Words</p>' +
                            '<p style="margin: 5px 0 0 0; font-size: 13px; font-weight: bold; color: ' + themeColor.primary + ';">' + amountInWords + '</p>' +
                        '</div>' +
                        
                        // Notes (only if provided)
                        (quotation.notes && quotation.notes.trim() ? 
                            '<div style="margin-top: 25px; padding: 15px; border: 1px solid #ddd; background: #fffbeb;">' +
                                '<h3 style="font-size: 13px; font-weight: bold; margin: 0 0 8px 0; color: ' + themeColor.primary + ';">Notes</h3>' +
                                '<p style="margin: 0; font-size: 11px; line-height: 1.5; white-space: pre-line;">' + quotation.notes + '</p>' +
                            '</div>' : '') +
                        
                        // Terms & Conditions
                        '<div style="margin-top: 25px; padding: 15px; border: 1px solid #ddd; background: #f9fafb;">' +
                            '<h3 style="font-size: 13px; font-weight: bold; margin: 0 0 8px 0; color: ' + themeColor.primary + ';">Terms And Conditions</h3>' +
                            '<p style="margin: 0; font-size: 11px; line-height: 1.5; white-space: pre-line;">' + (quotation.terms_conditions || 'Thanks for doing business with us!') + '</p>' +
                        '</div>' +
                        
                        // Signature
                        '<div style="margin-top: 30px; text-align: right;">' +
                            '<p style="margin: 0; font-size: 12px; font-weight: 600;">For : RealTrack Technology</p>' +
                            '<div style="height: 60px; margin: 10px 0; display: flex; justify-content: flex-end;">' +
                                '<img src="https://page.gensparksite.com/v1/base64_upload/1ea85f1279eb3a46af1b1039e04318e5" alt="Signature" style="height: 50px; width: auto;">' +
                            '</div>' +
                            '<p style="margin: 0; font-size: 11px; border-top: 1px solid #000; display: inline-block; padding-top: 5px; min-width: 150px;">Authorized Signatory</p>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            }
            
            // View quotation details (same as preview, for clicking rows)
            function viewQuotationDetails(quotationNumber) {
                viewQuotationPreview(quotationNumber);
            }
            
            // Download Quotation PDF
            async function downloadQuotationPDF() {
                if (!currentQuotationData) {
                    alert('No quotation data available');
                    return;
                }
                
                try {
                    const element = document.getElementById('quotation-printable');
                    
                    // Use html2canvas to capture the content
                    const canvas = await html2canvas(element, {
                        scale: 2,
                        useCORS: true,
                        logging: false
                    });
                    
                    const imgData = canvas.toDataURL('image/png');
                    
                    // Create PDF with jsPDF
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: 'a4'
                    });
                    
                    const imgWidth = 210; // A4 width in mm
                    const pageHeight = 297; // A4 height in mm
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    let heightLeft = imgHeight;
                    let position = 0;
                    
                    // Add first page
                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                    
                    // Add additional pages if needed
                    while (heightLeft >= 0) {
                        position = heightLeft - imgHeight;
                        pdf.addPage();
                        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                        heightLeft -= pageHeight;
                    }
                    
                    // Save the PDF
                    const fileName = 'Quotation_' + currentQuotationNumber + '_' + (currentQuotationData.company_name || currentQuotationData.customer_name).replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
                    pdf.save(fileName);
                    
                } catch (error) {
                    console.error('Error generating PDF:', error);
                    alert('Failed to generate PDF. Please try using browser Print (Ctrl+P) instead.');
                }
            }
            
            // Show email section
            function showEmailSection() {
                const emailSection = document.getElementById('emailSectionQuotation');
                emailSection.style.display = 'block';
                
                // Pre-fill email if available
                if (currentQuotationData && currentQuotationData.customer_email) {
                    document.getElementById('quotationEmailInput').value = currentQuotationData.customer_email;
                }
            }
            
            // Send quotation via email
            async function sendQuotationEmail() {
                const emailInput = document.getElementById('quotationEmailInput');
                const statusMsg = document.getElementById('emailStatusMessage');
                const recipientEmail = emailInput.value.trim();
                
                if (!recipientEmail) {
                    alert('Please enter recipient email address');
                    return;
                }
                
                if (!currentQuotationData || !currentQuotationNumber) {
                    alert('No quotation data available');
                    return;
                }
                
                statusMsg.style.display = 'block';
                statusMsg.style.color = '#667eea';
                statusMsg.textContent = 'Preparing email...';
                
                try {
                    // Generate PDF as base64
                    const element = document.getElementById('quotation-printable');
                    const canvas = await html2canvas(element, {
                        scale: 2,
                        useCORS: true,
                        logging: false
                    });
                    
                    const imgData = canvas.toDataURL('image/png');
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: 'a4'
                    });
                    
                    const imgWidth = 210;
                    const pageHeight = 297;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    let heightLeft = imgHeight;
                    let position = 0;
                    
                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                    
                    while (heightLeft >= 0) {
                        position = heightLeft - imgHeight;
                        pdf.addPage();
                        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                        heightLeft -= pageHeight;
                    }
                    
                    const pdfBase64 = pdf.output('datauristring').split(',')[1];
                    
                    statusMsg.textContent = 'Sending email...';
                    
                    // Send email via API
                    const response = await axios.post('/api/quotations/send-email', {
                        quotation_number: currentQuotationNumber,
                        recipient_email: recipientEmail,
                        pdf_data: pdfBase64
                    });
                    
                    if (response.data.success) {
                        statusMsg.style.color = '#10b981';
                        statusMsg.textContent = '\u2713 Email sent successfully!';
                        
                        setTimeout(() => {
                            document.getElementById('emailSectionQuotation').style.display = 'none';
                            statusMsg.style.display = 'none';
                        }, 3000);
                    } else {
                        statusMsg.style.color = '#dc2626';
                        statusMsg.textContent = 'Failed to send email: ' + response.data.error;
                    }
                } catch (error) {
                    console.error('Error sending email:', error);
                    statusMsg.style.color = '#dc2626';
                    statusMsg.textContent = 'Error sending email. Please try again.';
                }
            }
            
            // Share quotation on WhatsApp
            async function shareOnWhatsApp() {
                if (!currentQuotationData || !currentQuotationNumber) {
                    alert('No quotation data available');
                    return;
                }
                
                try {
                    // Generate PDF first
                    const element = document.getElementById('quotation-printable');
                    const canvas = await html2canvas(element, {
                        scale: 2,
                        useCORS: true,
                        logging: false
                    });
                    
                    const imgData = canvas.toDataURL('image/png');
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: 'a4'
                    });
                    
                    const imgWidth = 210;
                    const pageHeight = 297;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    let heightLeft = imgHeight;
                    let position = 0;
                    
                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                    
                    while (heightLeft >= 0) {
                        position = heightLeft - imgHeight;
                        pdf.addPage();
                        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                        heightLeft -= pageHeight;
                    }
                    
                    // Download PDF first (WhatsApp web cannot directly upload files)
                    const fileName = 'Quotation_' + currentQuotationNumber + '_' + (currentQuotationData.company_name || currentQuotationData.customer_name).replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
                    pdf.save(fileName);
                    
                    // Create WhatsApp message
                    const customerName = currentQuotationData.company_name || currentQuotationData.customer_name;
                    const message = 'Hello ' + customerName + ',\\n\\n' +
                        'Thank you for your interest in AxelGuard products!\\n\\n' +
                        'Please find attached Quotation ' + currentQuotationNumber + ' for your reference.\\n\\n' +
                        'Quotation Details:\\n' +
                        '📋 Quotation No: ' + currentQuotationNumber + '\\n' +
                        '💰 Total Amount: ₹' + currentQuotationData.total_amount.toLocaleString() + '\\n\\n' +
                        'The PDF has been downloaded to your device. Please upload it manually in WhatsApp.\\n\\n' +
                        'For any queries, feel free to reach out!\\n\\n' +
                        'Best Regards,\\n' +
                        'AxelGuard Team\\n' +
                        '📞 +91 8755311835\\n' +
                        '📧 info@axel-guard.com';
                    
                    // Open WhatsApp Web with pre-filled message
                    const phoneNumber = currentQuotationData.customer_contact ? currentQuotationData.customer_contact.replace(/\\D/g, '') : '';
                    const whatsappUrl = phoneNumber ? 
                        'https://web.whatsapp.com/send?phone=91' + phoneNumber + '&text=' + encodeURIComponent(message) :
                        'https://web.whatsapp.com/send?text=' + encodeURIComponent(message);
                    
                    window.open(whatsappUrl, '_blank');
                    
                } catch (error) {
                    console.error('Error sharing on WhatsApp:', error);
                    alert('Failed to prepare WhatsApp share. Please try again.');
                }
            }
            
            // Edit current quotation
            function editCurrentQuotation() {
                if (currentQuotationNumber) {
                    editQuotation(currentQuotationNumber);
                }
            }
            
            // Edit quotation - Load data and open form
            async function editQuotation(quotationNumber) {
                try {
                    const response = await axios.get('/api/quotations/' + quotationNumber);
                    if (!response.data.success) {
                        alert('Failed to load quotation data');
                        return;
                    }
                    
                    const quotation = response.data.data;
                    const items = Array.isArray(quotation.items) ? quotation.items : JSON.parse(quotation.items || '[]');
                    
                    // Close preview modal
                    document.getElementById('quotationPreviewModal').classList.remove('show');
                    
                    // Open quotation form modal
                    const modal = document.getElementById('newQuotationModal');
                    modal.classList.add('show');
                    
                    // Fill form with quotation data
                    document.getElementById('quotationNumber').value = quotation.quotation_number;
                    document.getElementById('quotationCustomerCode').value = quotation.customer_code || '';
                    document.getElementById('quotationCustomerName').value = quotation.customer_name || '';
                    document.getElementById('quotationCustomerContact').value = quotation.customer_contact || '';
                    document.getElementById('quotationCustomerEmail').value = quotation.customer_email || '';
                    document.getElementById('quotationCompanyName').value = quotation.company_name || '';
                    document.getElementById('quotationGSTNumber').value = quotation.gst_number || '';
                    document.getElementById('quotationGSTAddress').value = quotation.gst_registered_address || '';
                    document.getElementById('quotationCustomerAddress').value = quotation.customer_address || '';
                    document.getElementById('quotationConcernPerson').value = quotation.concern_person_name || '';
                    document.getElementById('quotationConcernContact').value = quotation.concern_person_contact || '';
                    
                    // Set theme (now a dropdown instead of radio buttons)
                    document.getElementById('quotationTheme').value = quotation.theme || 'blue';
                    
                    // Set currency
                    document.getElementById('quotationCurrency').value = quotation.currency || 'INR';
                    
                    // Set courier and bill type
                    document.getElementById('quotationCourierPartner').value = quotation.courier_partner || '';
                    if (quotation.courier_partner) {
                        loadDeliveryMethods();
                        setTimeout(() => {
                            document.getElementById('quotationDeliveryMethod').value = quotation.delivery_method || '';
                        }, 100);
                    }
                    document.getElementById('quotationWeight').value = '1';
                    document.getElementById('quotationCourierCost').value = quotation.courier_cost || 0;
                    document.getElementById('quotationBillType').value = quotation.bill_type || 'with';
                    
                    // Load items
                    const itemsRows = document.getElementById('quotationItemsRows');
                    itemsRows.innerHTML = '';
                    quotationItemCounter = 0;
                    
                    // Load items - find category and product in productCatalog
                    for (const item of items) {
                        await addQuotationItem();
                        const row = itemsRows.lastElementChild;
                        
                        let foundProduct = false;
                        
                        // Search through productCatalog to find matching product
                        for (const [categoryKey, products] of Object.entries(productCatalog)) {
                            const matchingProduct = products.find(p => p.name === item.product_name);
                            
                            if (matchingProduct) {
                                // Found product! Set category first
                                const categorySelect = row.querySelector('.quotation-item-category');
                                categorySelect.value = categoryKey;
                                
                                // Trigger category change to load products
                                updateQuotationProductOptions(categorySelect);
                                
                                // Then set product
                                setTimeout(() => {
                                    const productSelect = row.querySelector('.quotation-item-product');
                                    productSelect.value = matchingProduct.name;
                                }, 50);
                                
                                foundProduct = true;
                                break;
                            }
                        }
                        
                        if (!foundProduct) {
                            // Product not in catalog - must be custom product
                            const categorySelect = row.querySelector('.quotation-item-category');
                            categorySelect.value = 'I-MDVR Accessories'; // Default to Accessories for custom
                            updateQuotationProductOptions(categorySelect);
                            
                            setTimeout(() => {
                                const productSelect = row.querySelector('.quotation-item-product');
                                productSelect.value = 'custom';
                                
                                // Show custom product name input
                                const customInput = row.querySelector('.custom-product-name');
                                if (customInput) {
                                    customInput.style.display = 'block';
                                    customInput.value = item.product_name;
                                }
                            }, 50);
                        }
                        
                        // Set quantity and price
                        row.querySelector('.quotation-item-quantity').value = item.quantity;
                        row.querySelector('.quotation-item-price').value = item.unit_price;
                        
                        // Update amount display with currency symbol
                        const currency = quotation.currency || 'INR';
                        const currencySymbols = {'INR': '₹', 'USD': '$', 'EUR': '€', 'GBP': '£'};
                        const symbol = currencySymbols[currency] || '₹';
                        row.querySelector('.quotation-item-amount').textContent = symbol + item.amount.toFixed(2);
                    }
                    
                    // Set notes and terms
                    const notesField = document.querySelector('[name="notes"]');
                    if (notesField) notesField.value = quotation.notes || '';
                    
                    const termsField = document.querySelector('[name="terms_conditions"]');
                    if (termsField) termsField.value = quotation.terms_conditions || '';
                    
                    // Calculate totals
                    calculateQuotationTotal();
                    
                } catch (error) {
                    console.error('Error loading quotation for edit:', error);
                    alert('Failed to load quotation data. Please try again.');
                }
            }
            
            // Delete quotation
            async function deleteQuotation(quotationNumber) {
                if (!confirm('Are you sure you want to delete quotation ' + quotationNumber + '?')) {
                    return;
                }
                
                try {
                    await axios.delete('/api/quotations/' + quotationNumber);
                    alert('Quotation deleted successfully');
                    loadQuotations();
                } catch (error) {
                    alert('Error deleting quotation: ' + (error.response?.data?.error || error.message));
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
                document.getElementById('userDisplay').textContent = 'Hi ' + (currentUser.employeeName || currentUser.fullName || currentUser.username);
                
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
                const uploadItem = document.getElementById('excelUploadMenuItem');
                if (uploadItem) {
                    uploadItem.style.display = isAdmin ? 'block' : 'none';
                }
                
                // Hide/show User Management sidebar item (admin only)
                const userManagementItem = document.getElementById('userManagementMenuItem');
                if (userManagementItem) {
                    userManagementItem.style.display = isAdmin ? 'block' : 'none';
                }
            }
            
            // Check for existing session on page load
            window.addEventListener('DOMContentLoaded', () => {
                console.log('🚀 AXELGUARD CRM v3.0 LOADED 🚀');
                console.log('Timestamp:', new Date().toISOString());
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
            
            // Reports & Analytics Functions
            let monthComparisonChart = null;
            
            async function loadReports() {
                try {
                    // Load summary data
                    const summaryResponse = await axios.get('/api/reports/summary');
                    const summary = summaryResponse.data.data;
                    
                    document.getElementById('reportCurrentMonth').textContent = '₹' + summary.currentMonth.toLocaleString();
                    document.getElementById('reportPreviousMonth').textContent = '₹' + summary.previousMonth.toLocaleString();
                    document.getElementById('reportQuarterly').textContent = '₹' + summary.quarterly.toLocaleString();
                    document.getElementById('reportYTD').textContent = '₹' + summary.ytd.toLocaleString();
                    
                    // Load employee comparison
                    const employeeResponse = await axios.get('/api/reports/employee-comparison');
                    const employees = employeeResponse.data.data;
                    
                    renderEmployeeReport(employees);
                    renderMonthComparisonChart(summary.currentMonth, summary.previousMonth);
                    
                    // Load employee monthly sales chart
                    renderEmployeeMonthlyChart();
                    
                    // Load incentives
                    const incentiveResponse = await axios.get('/api/reports/incentives');
                    const incentives = incentiveResponse.data.data;
                    
                    renderIncentiveTable(incentives);
                    
                    // Load incentive history
                    loadIncentiveHistory();
                    
                    // Load product and customer analysis
                    loadProductAnalysis();
                    loadCustomerAnalysis();
                } catch (error) {
                    console.error('Error loading reports:', error);
                }
            }
            
            function renderEmployeeReport(employees) {
                const tbody = document.getElementById('employeeReportTableBody');
                
                if (!employees || employees.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No data available</td></tr>';
                    return;
                }
                
                // Calculate totals
                const totalCurrentMonth = employees.reduce((sum, emp) => sum + emp.current_month_sales, 0);
                const totalPreviousMonth = employees.reduce((sum, emp) => sum + emp.previous_month_sales, 0);
                const totalSalesCount = employees.reduce((sum, emp) => sum + emp.total_sales_count, 0);
                const avgGrowth = totalPreviousMonth > 0 ? ((totalCurrentMonth - totalPreviousMonth) / totalPreviousMonth * 100).toFixed(2) : 0;
                const avgSaleValue = totalSalesCount > 0 ? (totalCurrentMonth / totalSalesCount).toFixed(2) : 0;
                
                tbody.innerHTML = employees.map(emp => \`
                    <tr>
                        <td><strong>\${emp.employee_name}</strong></td>
                        <td>₹\${emp.current_month_sales.toLocaleString()}</td>
                        <td>₹\${emp.previous_month_sales.toLocaleString()}</td>
                        <td>
                            <span class="badge \${emp.growth_percentage >= 0 ? 'badge-success' : 'badge-error'}">
                                \${emp.growth_percentage >= 0 ? '+' : ''}\${emp.growth_percentage}%
                            </span>
                        </td>
                        <td>\${emp.total_sales_count}</td>
                        <td>₹\${emp.avg_sale_value.toLocaleString()}</td>
                    </tr>
                \`).join('') + \`
                    <tr style="background: #f3f4f6; font-weight: 700; border-top: 2px solid #667eea;">
                        <td><strong>TOTAL</strong></td>
                        <td>₹\${totalCurrentMonth.toLocaleString()}</td>
                        <td>₹\${totalPreviousMonth.toLocaleString()}</td>
                        <td>
                            <span class="badge \${avgGrowth >= 0 ? 'badge-success' : 'badge-error'}">
                                \${avgGrowth >= 0 ? '+' : ''}\${avgGrowth}%
                            </span>
                        </td>
                        <td>\${totalSalesCount}</td>
                        <td>₹\${parseFloat(avgSaleValue).toLocaleString()}</td>
                    </tr>
                \`;
            }
            
            function renderMonthComparisonChart(current, previous) {
                const ctx = document.getElementById('monthComparisonChart').getContext('2d');
                
                if (monthComparisonChart) {
                    monthComparisonChart.destroy();
                }
                
                monthComparisonChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['Previous Month', 'Current Month'],
                        datasets: [{
                            label: 'Sales (₹)',
                            data: [previous, current],
                            backgroundColor: [
                                'rgba(245, 87, 108, 0.8)',
                                'rgba(102, 126, 234, 0.8)'
                            ],
                            borderColor: [
                                'rgba(245, 87, 108, 1)',
                                'rgba(102, 126, 234, 1)'
                            ],
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return 'Sales: ₹' + context.parsed.y.toLocaleString();
                                    }
                                }
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
            
            let employeeMonthlyChart = null;
            
            async function renderEmployeeMonthlyChart() {
                try {
                    const response = await axios.get('/api/reports/employee-monthly-sales');
                    const data = response.data.data;
                    
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    
                    // Generate colors for each employee
                    const colors = [
                        { bg: 'rgba(102, 126, 234, 0.7)', border: 'rgba(102, 126, 234, 1)' },
                        { bg: 'rgba(245, 87, 108, 0.7)', border: 'rgba(245, 87, 108, 1)' },
                        { bg: 'rgba(16, 185, 129, 0.7)', border: 'rgba(16, 185, 129, 1)' },
                        { bg: 'rgba(251, 191, 36, 0.7)', border: 'rgba(251, 191, 36, 1)' },
                        { bg: 'rgba(139, 92, 246, 0.7)', border: 'rgba(139, 92, 246, 1)' },
                        { bg: 'rgba(236, 72, 153, 0.7)', border: 'rgba(236, 72, 153, 1)' },
                        { bg: 'rgba(14, 165, 233, 0.7)', border: 'rgba(14, 165, 233, 1)' }
                    ];
                    
                    // Create datasets for each employee
                    const datasets = data.employees.map((empName, index) => ({
                        label: empName,
                        data: data.monthlyData[empName],
                        backgroundColor: colors[index % colors.length].bg,
                        borderColor: colors[index % colors.length].border,
                        borderWidth: 2,
                        tension: 0.4,
                        fill: false
                    }));
                    
                    const ctx = document.getElementById('employeeMonthlyChart').getContext('2d');
                    
                    if (employeeMonthlyChart) {
                        employeeMonthlyChart.destroy();
                    }
                    
                    employeeMonthlyChart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: monthNames,
                            datasets: datasets
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: true,
                                    position: 'top',
                                    labels: {
                                        padding: 15,
                                        font: {
                                            size: 12,
                                            weight: '600'
                                        }
                                    }
                                },
                                tooltip: {
                                    mode: 'index',
                                    intersect: false,
                                    callbacks: {
                                        label: function(context) {
                                            return context.dataset.label + ': ₹' + context.parsed.y.toLocaleString();
                                        }
                                    }
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) {
                                            return '₹' + value.toLocaleString();
                                        }
                                    },
                                    grid: {
                                        color: 'rgba(0, 0, 0, 0.05)'
                                    }
                                },
                                x: {
                                    grid: {
                                        display: false
                                    }
                                }
                            },
                            interaction: {
                                mode: 'nearest',
                                axis: 'x',
                                intersect: false
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error loading employee monthly chart:', error);
                }
            }
            
            function renderIncentiveTable(incentives) {
                const tbody = document.getElementById('incentiveTableBody');
                
                if (!incentives || incentives.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No data available</td></tr>';
                    return;
                }
                
                tbody.innerHTML = incentives.map(inc => \`
                    <tr>
                        <td><strong>\${inc.employee_name}</strong></td>
                        <td>₹\${inc.sales_without_tax.toLocaleString()}</td>
                        <td>₹\${inc.target_amount.toLocaleString()}</td>
                        <td>
                            <div style="position: relative; width: 100%; background: #e5e7eb; border-radius: 4px; height: 24px; overflow: hidden;">
                                <div style="position: absolute; left: 0; top: 0; height: 100%; background: \${inc.achievement_percentage >= 100 ? '#10b981' : '#667eea'}; width: \${Math.min(inc.achievement_percentage, 100)}%; transition: width 0.3s;"></div>
                                <span style="position: absolute; left: 0; right: 0; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; color: #1f2937;">
                                    \${inc.achievement_percentage.toFixed(1)}%
                                </span>
                            </div>
                        </td>
                        <td>
                            <span class="badge \${inc.status === 'Target Achieved' ? 'badge-success' : 'badge-warning'}">
                                \${inc.status}
                            </span>
                        </td>
                        <td style="font-weight: 700; color: \${inc.incentive_earned > 0 ? '#10b981' : '#6b7280'};">
                            ₹\${inc.incentive_earned.toLocaleString()}
                        </td>
                    </tr>
                \`).join('');
            }
            
            async function loadIncentiveHistory() {
                try {
                    const response = await axios.get('/api/reports/incentive-history');
                    const history = response.data.data;
                    
                    const tbody = document.getElementById('incentiveHistoryTableBody');
                    
                    if (!history || history.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #6b7280;">No historical data available</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = history.map(inc => {
                        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                          'July', 'August', 'September', 'October', 'November', 'December'];
                        const monthName = monthNames[parseInt(inc.month) - 1];
                        
                        return \`
                        <tr>
                            <td><strong>\${monthName} \${inc.year}</strong></td>
                            <td>\${inc.employee_name}</td>
                            <td>₹\${inc.sales_without_tax.toLocaleString()}</td>
                            <td>₹\${inc.target_amount.toLocaleString()}</td>
                            <td>
                                <span class="badge \${inc.achievement_percentage >= 100 ? 'badge-success' : 'badge-warning'}">
                                    \${inc.achievement_percentage.toFixed(1)}%
                                </span>
                            </td>
                            <td style="font-weight: 700; color: \${inc.incentive_earned > 0 ? '#10b981' : '#6b7280'};">
                                ₹\${inc.incentive_earned.toLocaleString()}
                            </td>
                            <td>
                                <span class="badge \${inc.status === 'Paid' ? 'badge-success' : 'badge-error'}">
                                    \${inc.status}
                                </span>
                            </td>
                        </tr>
                    \`;
                    }).join('');
                } catch (error) {
                    console.error('Error loading incentive history:', error);
                    const tbody = document.getElementById('incentiveHistoryTableBody');
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #dc2626;">Error loading history</td></tr>';
                }
            }
            
            async function loadProductAnalysis() {
                try {
                    const response = await axios.get('/api/reports/product-analysis');
                    const products = response.data.data;
                    
                    const tbody = document.getElementById('productReportTableBody');
                    
                    if (!products || products.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6b7280;">No product data available</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = products.map(prod => \`
                        <tr>
                            <td><strong>\${prod.product_name}</strong></td>
                            <td>\${prod.total_quantity}</td>
                            <td>₹\${prod.total_revenue.toLocaleString()}</td>
                            <td>₹\${prod.average_price.toLocaleString()}</td>
                            <td>\${prod.order_count}</td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading product analysis:', error);
                    const tbody = document.getElementById('productReportTableBody');
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #dc2626;">Error loading data</td></tr>';
                }
            }
            
            async function downloadProductAnalysisExcel() {
                try {
                    const response = await axios.get('/api/reports/product-analysis');
                    const products = response.data.data;
                    
                    if (!products || products.length === 0) {
                        alert('No product data available to download');
                        return;
                    }
                    
                    // Prepare data for Excel
                    const excelData = products.map(prod => ({
                        'Product Name': prod.product_name,
                        'Total Quantity Sold': prod.total_quantity,
                        'Total Revenue': '₹' + prod.total_revenue.toLocaleString(),
                        'Average Price': '₹' + prod.average_price.toLocaleString(),
                        'Number of Orders': prod.order_count
                    }));
                    
                    // Create workbook
                    const ws = XLSX.utils.json_to_sheet(excelData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Product Analysis');
                    
                    // Generate filename with current date
                    const now = new Date();
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                      'July', 'August', 'September', 'October', 'November', 'December'];
                    const filename = 'Product_Analysis_' + monthNames[now.getMonth()] + '_' + now.getFullYear() + '.xlsx';
                    
                    // Download
                    XLSX.writeFile(wb, filename);
                } catch (error) {
                    console.error('Error downloading Excel:', error);
                    alert('Failed to download Excel file');
                }
            }
            
            async function loadCustomerAnalysis() {
                try {
                    const response = await axios.get('/api/reports/customer-analysis');
                    const customers = response.data.data;
                    
                    const tbody = document.getElementById('customerReportTableBody');
                    
                    if (!customers || customers.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No customer data available</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = customers.map(cust => \`
                        <tr>
                            <td><strong>\${cust.customer_name}</strong></td>
                            <td>\${cust.company_name || '-'}</td>
                            <td>₹\${cust.total_purchases.toLocaleString()}</td>
                            <td>\${cust.order_count}</td>
                            <td>₹\${cust.avg_order_value.toLocaleString()}</td>
                            <td style="color: \${cust.balance_pending > 0 ? '#dc2626' : '#10b981'}; font-weight: 600;">
                                ₹\${cust.balance_pending.toLocaleString()}
                            </td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading customer analysis:', error);
                    const tbody = document.getElementById('customerReportTableBody');
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #dc2626;">Error loading data</td></tr>';
                }
            }
            
            // Change Password Functions
            async function changePassword(event) {
                event.preventDefault();
                
                const currentPassword = document.getElementById('currentPassword').value;
                const newPassword = document.getElementById('newPassword').value;
                const confirmPassword = document.getElementById('confirmPassword').value;
                const statusDiv = document.getElementById('passwordChangeStatus');
                
                // Validate new passwords match
                if (newPassword !== confirmPassword) {
                    statusDiv.className = 'alert-error';
                    statusDiv.textContent = 'New passwords do not match!';
                    statusDiv.style.display = 'block';
                    return;
                }
                
                try {
                    const response = await axios.post('/api/auth/change-password', {
                        userId: currentUser.id,
                        currentPassword,
                        newPassword
                    });
                    
                    if (response.data.success) {
                        statusDiv.className = 'alert-success';
                        statusDiv.textContent = response.data.message;
                        statusDiv.style.display = 'block';
                        
                        // Clear form
                        document.getElementById('changePasswordForm').reset();
                        
                        // Hide success message after 3 seconds
                        setTimeout(() => {
                            statusDiv.style.display = 'none';
                        }, 3000);
                    }
                } catch (error) {
                    statusDiv.className = 'alert-error';
                    statusDiv.textContent = error.response?.data?.error || 'Failed to change password';
                    statusDiv.style.display = 'block';
                }
            }
            
            // User Management Functions
            async function loadUsers() {
                try {
                    const response = await axios.get('/api/users');
                    const users = response.data.data;
                    
                    const tbody = document.getElementById('usersTableBody');
                    if (!users || users.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #6b7280;">No users found</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = users.map(user => \`
                        <tr>
                            <td>\${user.id}</td>
                            <td><strong>\${user.username}</strong></td>
                            <td>\${user.full_name}</td>
                            <td><span class="badge \${user.role === 'admin' ? 'badge-error' : 'badge-success'}">\${user.role}</span></td>
                            <td>\${user.employee_name || '-'}</td>
                            <td><span class="badge \${user.is_active ? 'badge-success' : 'badge-warning'}">\${user.is_active ? 'Active' : 'Inactive'}</span></td>
                            <td><small>\${new Date(user.created_at).toLocaleDateString()}</small></td>
                            <td>
                                <button class="btn-edit" onclick="editUser(\${user.id})" title="Edit User">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading users:', error);
                    const tbody = document.getElementById('usersTableBody');
                    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #dc2626;">Error loading users</td></tr>';
                }
            }
            
            function openCreateUserModal() {
                document.getElementById('createUserModal').classList.add('show');
            }
            
            function closeCreateUserModal() {
                document.getElementById('createUserModal').classList.remove('show');
                document.getElementById('createUserForm').reset();
                document.getElementById('employeeNameGroup').style.display = 'none';
            }
            
            function toggleEmployeeNameField(selectElement) {
                const employeeNameGroup = document.getElementById('employeeNameGroup');
                if (selectElement.value === 'employee') {
                    employeeNameGroup.style.display = 'block';
                    employeeNameGroup.querySelector('input').required = true;
                } else {
                    employeeNameGroup.style.display = 'none';
                    employeeNameGroup.querySelector('input').required = false;
                }
            }
            
            async function submitCreateUser(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                
                const data = {
                    username: formData.get('username'),
                    full_name: formData.get('full_name'),
                    password: formData.get('password'),
                    role: formData.get('role'),
                    employee_name: formData.get('employee_name')
                };
                
                try {
                    const response = await axios.post('/api/users', data);
                    
                    if (response.data.success) {
                        alert(response.data.message);
                        closeCreateUserModal();
                        loadUsers();
                    }
                } catch (error) {
                    alert('Error: ' + (error.response?.data?.error || error.message));
                }
            }
            
            async function editUser(userId) {
                try {
                    const response = await axios.get('/api/users');
                    const users = response.data.data;
                    const user = users.find(u => u.id === userId);
                    
                    if (!user) {
                        alert('User not found');
                        return;
                    }
                    
                    // Populate form
                    document.getElementById('editUserId').value = user.id;
                    document.getElementById('editUserUsername').value = user.username;
                    document.getElementById('editUserFullName').value = user.full_name;
                    document.getElementById('editUserRole').value = user.role;
                    document.getElementById('editUserEmployeeName').value = user.employee_name || '';
                    document.getElementById('editUserStatus').value = user.is_active;
                    document.getElementById('editUserPassword').value = '';
                    
                    // Show/hide employee name field
                    const editEmployeeNameGroup = document.getElementById('editEmployeeNameGroup');
                    if (user.role === 'employee') {
                        editEmployeeNameGroup.style.display = 'block';
                    } else {
                        editEmployeeNameGroup.style.display = 'none';
                    }
                    
                    document.getElementById('editUserModal').classList.add('show');
                } catch (error) {
                    alert('Error loading user data: ' + error.message);
                }
            }
            
            function closeEditUserModal() {
                document.getElementById('editUserModal').classList.remove('show');
                document.getElementById('editUserForm').reset();
            }
            
            function toggleEmployeeNameFieldEdit(selectElement) {
                const editEmployeeNameGroup = document.getElementById('editEmployeeNameGroup');
                if (selectElement.value === 'employee') {
                    editEmployeeNameGroup.style.display = 'block';
                } else {
                    editEmployeeNameGroup.style.display = 'none';
                }
            }
            
            async function submitEditUser(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                const userId = formData.get('user_id');
                
                const data = {
                    full_name: formData.get('full_name'),
                    role: formData.get('role'),
                    employee_name: formData.get('employee_name'),
                    is_active: parseInt(formData.get('is_active')),
                    new_password: formData.get('new_password')
                };
                
                try {
                    const response = await axios.put(\`/api/users/\${userId}\`, data);
                    
                    if (response.data.success) {
                        alert(response.data.message);
                        closeEditUserModal();
                        loadUsers();
                    }
                } catch (error) {
                    alert('Error: ' + (error.response?.data?.error || error.message));
                }
            }

            // ==================== INVENTORY MANAGEMENT FUNCTIONS ====================
            
            let inventoryChart = null;
            let allInventoryData = [];

            // Load Inventory Stock
            async function loadInventory() {
                try {
                    const response = await axios.get('/api/inventory');
                    allInventoryData = response.data.data;
                    renderInventoryTable(allInventoryData);
                } catch (error) {
                    console.error('Error loading inventory:', error);
                    document.getElementById('inventoryTableBody').innerHTML = 
                        '<tr><td colspan="9" style="text-align: center; color: #dc2626;">Error loading inventory</td></tr>';
                }
            }

            // Render Inventory Table
            function renderInventoryTable(inventory) {
                const tbody = document.getElementById('inventoryTableBody');
                
                if (!inventory || inventory.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #6b7280;">No inventory items found</td></tr>';
                    return;
                }
                
                tbody.innerHTML = inventory.map((item, index) => {
                    const statusColors = {
                        'In Stock': 'badge-success',
                        'Dispatched': 'badge-primary',
                        'Quality Check': 'badge-warning',
                        'Defective': 'badge-error',
                        'Returned': 'badge-secondary'
                    };
                    
                    return \`
                        <tr>
                            <td>\${index + 1}</td>
                            <td><strong>\${item.device_serial_no}</strong></td>
                            <td>\${item.model_name}</td>
                            <td>\${item.in_date ? new Date(item.in_date).toLocaleDateString() : '-'}</td>
                            <td><span class="badge \${statusColors[item.status] || 'badge-secondary'}">\${item.status}</span></td>
                            <td>\${item.customer_name || '-'}</td>
                            <td>\${item.dispatch_date ? new Date(item.dispatch_date).toLocaleDateString() : '-'}</td>
                            <td>\${item.order_id || '-'}</td>
                            <td>
                                <div class="action-menu-container">
                                    <button class="action-dots-btn" onclick="toggleActionMenu(event, 'inventory-\${item.id}')">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <div class="action-dropdown" id="action-inventory-\${item.id}">
                                        <button class="action-dropdown-item" onclick="viewInventoryDetails('\${item.device_serial_no}'); closeAllActionMenus();">
                                            <i class="fas fa-eye"></i> View Details
                                        </button>
                                        <button class="action-dropdown-item" onclick="updateInventoryStatus(\${item.id}); closeAllActionMenus();">
                                            <i class="fas fa-edit"></i> Update Status
                                        </button>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    \`;
                }).join('');
            }

            // Search Inventory
            function searchInventory() {
                const searchTerm = document.getElementById('inventorySearchInput').value.toLowerCase().trim();
                const statusFilter = document.getElementById('inventoryStatusFilter').value;
                
                let filtered = allInventoryData;
                
                if (searchTerm) {
                    filtered = filtered.filter(item =>
                        item.device_serial_no.toLowerCase().includes(searchTerm) ||
                        item.model_name.toLowerCase().includes(searchTerm) ||
                        (item.customer_name && item.customer_name.toLowerCase().includes(searchTerm))
                    );
                }
                
                if (statusFilter) {
                    filtered = filtered.filter(item => item.status === statusFilter);
                }
                
                renderInventoryTable(filtered);
            }

            // Filter Inventory by Status
            function filterInventoryByStatus() {
                searchInventory(); // Use the same search function
            }

            // Upload Inventory Excel
            async function uploadInventoryExcel(event) {
                event.preventDefault();
                
                const form = event.target;
                const fileInput = form.querySelector('input[type="file"]');
                const file = fileInput.files[0];
                
                if (!file) {
                    alert('Please select a file');
                    return;
                }
                
                try {
                    // Show loading
                    const originalText = form.querySelector('button[type="submit"]').innerHTML;
                    form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
                    form.querySelector('button[type="submit"]').disabled = true;
                    
                    // Read Excel file
                    const data = await readExcelFile(file);
                    
                    if (data.length === 0) {
                        alert('No data found in Excel file');
                        return;
                    }
                    
                    // Upload to server
                    const response = await axios.post('/api/inventory/upload', { items: data });
                    
                    if (response.data.success) {
                        alert(\`Successfully uploaded!\n\${response.data.message}\`);
                        loadInventory(); // Reload table
                        form.reset();
                    } else {
                        alert('Upload failed: ' + response.data.error);
                    }
                    
                    // Restore button
                    form.querySelector('button[type="submit"]').innerHTML = originalText;
                    form.querySelector('button[type="submit"]').disabled = false;
                } catch (error) {
                    console.error('Upload error:', error);
                    alert('Error uploading file: ' + (error.response?.data?.error || error.message));
                    form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-upload"></i> Upload';
                    form.querySelector('button[type="submit"]').disabled = false;
                }
            }

            // Read Excel File
            function readExcelFile(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                            
                            // Map columns to database fields
                            const mappedData = jsonData.map(row => ({
                                model_name: row['Model_Name'] || row['Model Name'] || '',
                                device_serial_no: row['Device Serial_No'] || row['Device Serial No'] || row['Serial No'] || '',
                                in_date: row['In_Date'] || row['In Date'] || null,
                                dispatch_date: row['Dispatch Date'] || row['Dispatch_Date'] || null,
                                cust_code: row['Cust Code'] || row['Cust_Code'] || null,
                                sale_date: row['Sale Date'] || row['Sale_Date'] || null,
                                customer_name: row['Customer Name'] || row['Customer_Name'] || null,
                                cust_city: row['Cust City'] || row['Cust_City'] || null,
                                cust_mobile: row['Cust Mobile'] || row['Cust_Mobile'] || null,
                                dispatch_reason: row['Dispatch Reason'] || row['Dispatch_Reason'] || null,
                                warranty_provide: row['Warranty Provide'] || row['Warranty_Provide'] || null,
                                old_serial_no: row['If Replace Old S. No.'] || row['Old Serial No'] || null,
                                license_renew_time: row['License Renew Time'] || row['License_Renew_Time'] || null,
                                user_id: row['User id'] || row['User_id'] || null,
                                password: row['Password'] || null,
                                account_activation_date: row['Account Activation date'] || row['Account_Activation_date'] || null,
                                account_expiry_date: row['Account Expiry Date'] || row['Account_Expiry_Date'] || null,
                                order_id: row['Order Id'] || row['Order_Id'] || null
                            })).filter(item => item.device_serial_no && item.model_name); // Only include items with required fields
                            
                            resolve(mappedData);
                        } catch (err) {
                            reject(err);
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(file);
                });
            }

            // Upload QC Excel
            async function uploadQCExcel(event) {
                event.preventDefault();
                
                const form = event.target;
                const fileInput = form.querySelector('input[type="file"]');
                const file = fileInput.files[0];
                
                if (!file) {
                    alert('Please select a file');
                    return;
                }
                
                try {
                    // Show loading
                    const originalText = form.querySelector('button[type="submit"]').innerHTML;
                    form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
                    form.querySelector('button[type="submit"]').disabled = true;
                    
                    // Read Excel file with QC column mapping
                    const data = await readQCExcelFile(file);
                    
                    if (data.length === 0) {
                        alert('No QC data found in Excel file');
                        form.querySelector('button[type="submit"]').innerHTML = originalText;
                        form.querySelector('button[type="submit"]').disabled = false;
                        return;
                    }
                    
                    // Upload to server
                    const response = await axios.post('/api/inventory/upload-qc', { items: data });
                    
                    if (response.data.success) {
                        let message = 'Successfully uploaded QC data!\n' + response.data.message;
                        if (response.data.notFoundDevices && response.data.notFoundDevices.length > 0) {
                            message += '\n\nDevices not found in inventory (first 10):\n' + response.data.notFoundDevices.join(', ');
                        }
                        alert(message);
                        loadInventory(); // Reload inventory table
                        loadRecentQC(); // Reload QC table if on that page
                        form.reset();
                    } else {
                        alert('Upload failed: ' + response.data.error);
                    }
                    
                    // Restore button
                    form.querySelector('button[type="submit"]').innerHTML = originalText;
                    form.querySelector('button[type="submit"]').disabled = false;
                } catch (error) {
                    console.error('Upload error:', error);
                    alert('Error uploading QC file: ' + (error.response?.data?.error || error.message));
                    form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-upload"></i> Upload QC Data';
                    form.querySelector('button[type="submit"]').disabled = false;
                }
            }

            // Read QC Excel File
            function readQCExcelFile(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                            
                            // Map QC columns
                            // Expected: Device Serial Number, Device Name, QC Status, Dispatch Reason, Order Id, Cust Code, Customer Name, Company Name, Dispatch Date, Courier Company, Dispatch Method, Tracking ID
                            const mappedData = jsonData.map(row => ({
                                device_serial_no: row['Device Serial Number'] || row['Device Serial_Number'] || row['Serial No'] || '',
                                device_name: row['Device Name'] || row['Model Name'] || null,
                                qc_status: row['QC Status'] || row['QC_Status'] || null,
                                dispatch_reason: row['Dispatch Reason'] || row['Dispatch_Reason'] || null,
                                order_id: row['Order Id'] || row['Order_Id'] || null,
                                cust_code: row['Cust Code'] || row['Cust_Code'] || null,
                                customer_name: row['Customer Name'] || row['Customer_Name'] || null,
                                company_name: row['Company Name'] || row['Company_Name'] || null,
                                dispatch_date: row['Dispatch Date'] || row['Dispatch_Date'] || null,
                                courier_company: row['Courier Company'] || row['Courier_Company'] || null,
                                dispatch_method: row['Dispatch Method'] || row['Dispatch_Method'] || null,
                                tracking_id: row['Tracking ID'] || row['Tracking_ID'] || null
                            })).filter(item => item.device_serial_no); // Only include items with serial number
                            
                            resolve(mappedData);
                        } catch (err) {
                            reject(err);
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(file);
                });
            }

            // Upload Dispatch Excel
            async function uploadDispatchExcel(event) {
                event.preventDefault();
                
                const form = event.target;
                const fileInput = form.querySelector('input[type="file"]');
                const file = fileInput.files[0];
                
                if (!file) {
                    alert('Please select a file');
                    return;
                }
                
                try {
                    // Show loading
                    const originalText = form.querySelector('button[type="submit"]').innerHTML;
                    form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
                    form.querySelector('button[type="submit"]').disabled = true;
                    
                    // Read Excel file with Dispatch column mapping
                    const data = await readDispatchExcelFile(file);
                    
                    if (data.length === 0) {
                        alert('No dispatch data found in Excel file');
                        form.querySelector('button[type="submit"]').innerHTML = originalText;
                        form.querySelector('button[type="submit"]').disabled = false;
                        return;
                    }
                    
                    // Upload to server
                    const response = await axios.post('/api/inventory/upload-dispatch', { items: data });
                    
                    if (response.data.success) {
                        let message = 'Successfully uploaded dispatch data!\n' + response.data.message;
                        if (response.data.notFoundDevices && response.data.notFoundDevices.length > 0) {
                            message += '\n\nDevices not found in inventory (first 10):\n' + response.data.notFoundDevices.join(', ');
                        }
                        alert(message);
                        loadInventory(); // Reload inventory table
                        loadRecentDispatches(); // Reload dispatches table if on that page
                        form.reset();
                    } else {
                        alert('Upload failed: ' + response.data.error);
                    }
                    
                    // Restore button
                    form.querySelector('button[type="submit"]').innerHTML = originalText;
                    form.querySelector('button[type="submit"]').disabled = false;
                } catch (error) {
                    console.error('Upload error:', error);
                    alert('Error uploading dispatch file: ' + (error.response?.data?.error || error.message));
                    form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-upload"></i> Upload Dispatch Data';
                    form.querySelector('button[type="submit"]').disabled = false;
                }
            }

            // Read Dispatch Excel File
            function readDispatchExcelFile(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                            
                            // Map Dispatch columns
                            // Expected: Device Serial Number, Device Name, QC Status, Dispatch Reason, Order Id, Cust Code, Customer Name, Company Name, Dispatch Date, Courier Company, Dispatch Method, Tracking ID
                            const mappedData = jsonData.map(row => ({
                                device_serial_no: row['Device Serial Number'] || row['Device Serial_Number'] || row['Serial No'] || '',
                                device_name: row['Device Name'] || row['Model Name'] || null,
                                dispatch_reason: row['Dispatch Reason'] || row['Dispatch_Reason'] || null,
                                order_id: row['Order Id'] || row['Order_Id'] || null,
                                cust_code: row['Cust Code'] || row['Cust_Code'] || null,
                                customer_name: row['Customer Name'] || row['Customer_Name'] || null,
                                company_name: row['Company Name'] || row['Company_Name'] || null,
                                dispatch_date: row['Dispatch Date'] || row['Dispatch_Date'] || null,
                                courier_company: row['Courier Company'] || row['Courier_Company'] || null,
                                dispatch_method: row['Dispatch Method'] || row['Dispatch_Method'] || null,
                                tracking_id: row['Tracking ID'] || row['Tracking_ID'] || null
                            })).filter(item => item.device_serial_no); // Only include items with serial number
                            
                            resolve(mappedData);
                        } catch (err) {
                            reject(err);
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(file);
                });
            }

            // View Inventory Details
            async function viewInventoryDetails(serialNo) {
                try {
                    const response = await axios.get(\`/api/inventory/\${serialNo}\`);
                    const item = response.data.data;
                    
                    const detailsHtml = \`
                        <div style="background: white; padding: 20px; border-radius: 8px; max-width: 600px; margin: 20px auto;">
                            <h3 style="margin-bottom: 15px; color: #1f2937;">Device Details</h3>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                                <div><strong>Serial No:</strong> \${item.device_serial_no}</div>
                                <div><strong>Model:</strong> \${item.model_name}</div>
                                <div><strong>Status:</strong> \${item.status}</div>
                                <div><strong>In Date:</strong> \${item.in_date || '-'}</div>
                                <div><strong>Customer:</strong> \${item.customer_name || '-'}</div>
                                <div><strong>Customer Code:</strong> \${item.cust_code || '-'}</div>
                                <div><strong>Mobile:</strong> \${item.cust_mobile || '-'}</div>
                                <div><strong>City:</strong> \${item.cust_city || '-'}</div>
                                <div><strong>Dispatch Date:</strong> \${item.dispatch_date || '-'}</div>
                                <div><strong>Order ID:</strong> \${item.order_id || '-'}</div>
                                <div><strong>Warranty:</strong> \${item.warranty_provide || '-'}</div>
                                <div><strong>User ID:</strong> \${item.user_id || '-'}</div>
                            </div>
                            <button onclick="this.parentElement.remove()" class="btn-secondary" style="margin-top: 15px;">Close</button>
                        </div>
                    \`;
                    
                    // Show in a modal or alert
                    alert('View details feature - Check console for full details');
                    console.log('Device Details:', item);
                } catch (error) {
                    alert('Error loading details: ' + error.message);
                }
            }

            // Update Inventory Status
            async function updateInventoryStatus(inventoryId) {
                try {
                    const newStatus = prompt('Enter new status:\n1. In Stock\n2. Dispatched\n3. Quality Check\n4. Defective\n5. Returned');
                    
                    const statusMap = {
                        '1': 'In Stock',
                        '2': 'Dispatched',
                        '3': 'Quality Check',
                        '4': 'Defective',
                        '5': 'Returned'
                    };
                    
                    const status = statusMap[newStatus] || newStatus;
                    
                    if (!status || !['In Stock', 'Dispatched', 'Quality Check', 'Defective', 'Returned'].includes(status)) {
                        alert('Invalid status selection');
                        return;
                    }
                    
                    const reason = prompt('Enter reason for status change:');
                    if (!reason) {
                        alert('Reason is required');
                        return;
                    }
                    
                    // Note: This requires a new API endpoint to update status
                    // For now, just alert that feature is coming
                    alert('Status update feature - API endpoint pending. Selected: ' + status);
                    console.log('Update status:', { inventoryId, status, reason });
                    
                    // TODO: Implement API endpoint for status update
                    // Will need PUT /api/inventory/:id/status endpoint
                } catch (error) {
                    alert('Error updating status: ' + error.message);
                }
            }

            // ==================== DISPATCH FUNCTIONS ====================

            // Scan Device for Dispatch
            async function scanDeviceForDispatch(event) {
                event.preventDefault();
                
                const serialNo = document.getElementById('dispatchScanInput').value.trim();
                if (!serialNo) {
                    alert('Please enter a serial number');
                    return;
                }
                
                try {
                    const response = await axios.get(\`/api/inventory/\${serialNo}\`);
                    const device = response.data.data;
                    
                    if (device.status === 'Dispatched') {
                        if (!confirm('This device is already dispatched. Dispatch again?')) {
                            return;
                        }
                    }
                    
                    // Show device info
                    document.getElementById('deviceInfoDisplay').innerHTML = \`
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                            <div><strong>Serial No:</strong> \${device.device_serial_no}</div>
                            <div><strong>Model:</strong> \${device.model_name}</div>
                            <div><strong>Current Status:</strong> <span class="badge badge-\${device.status === 'In Stock' ? 'success' : 'warning'}">\${device.status}</span></div>
                            <div><strong>In Date:</strong> \${device.in_date ? new Date(device.in_date).toLocaleDateString() : '-'}</div>
                        </div>
                    \`;
                    
                    // Populate hidden fields
                    document.getElementById('dispatchInventoryId').value = device.id;
                    document.getElementById('dispatchSerialNo').value = device.device_serial_no;
                    
                    // Set today's date
                    const today = new Date().toISOString().split('T')[0];
                    document.querySelector('#dispatchForm input[name="dispatch_date"]').value = today;
                    
                    // Show form
                    document.getElementById('dispatchFormSection').style.display = 'block';
                    
                    // Clear scan input
                    document.getElementById('dispatchScanInput').value = '';
                } catch (error) {
                    alert('Device not found: ' + (error.response?.data?.error || error.message));
                }
            }

            // Submit Dispatch
            async function submitDispatch(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                
                const data = {
                    inventory_id: formData.get('inventory_id'),
                    device_serial_no: formData.get('device_serial_no'),
                    dispatch_date: formData.get('dispatch_date'),
                    customer_name: formData.get('customer_name'),
                    customer_code: formData.get('customer_code'),
                    customer_mobile: formData.get('customer_mobile'),
                    customer_city: formData.get('customer_city'),
                    dispatch_reason: formData.get('dispatch_reason'),
                    courier_name: formData.get('courier_name'),
                    tracking_number: formData.get('tracking_number'),
                    notes: formData.get('notes')
                };
                
                try {
                    const response = await axios.post('/api/inventory/dispatch', data);
                    
                    if (response.data.success) {
                        alert('Device dispatched successfully!');
                        cancelDispatch();
                        loadRecentDispatches();
                    }
                } catch (error) {
                    alert('Error dispatching device: ' + (error.response?.data?.error || error.message));
                }
            }

            // Cancel Dispatch
            function cancelDispatch() {
                document.getElementById('dispatchFormSection').style.display = 'none';
                document.getElementById('dispatchForm').reset();
                document.getElementById('dispatchScanInput').value = '';
                document.getElementById('dispatchScanInput').focus();
            }

            // Load Recent Dispatches
            async function loadRecentDispatches() {
                try {
                    const response = await axios.get('/api/inventory/dispatches');
                    const dispatches = response.data.data;
                    
                    const tbody = document.getElementById('recentDispatchesBody');
                    
                    if (!dispatches || dispatches.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #6b7280;">No dispatch records found</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = dispatches.map(d => \`
                        <tr>
                            <td>\${new Date(d.dispatch_date).toLocaleDateString()}</td>
                            <td><strong>\${d.device_serial_no}</strong></td>
                            <td>\${d.model_name || '-'}</td>
                            <td>\${d.customer_name}</td>
                            <td>\${d.customer_city || '-'}</td>
                            <td>\${d.dispatch_reason || '-'}</td>
                            <td>\${d.courier_name || '-'}</td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading dispatches:', error);
                }
            }

            // ==================== QUALITY CHECK FUNCTIONS ====================

            // Scan Device for QC
            async function scanDeviceForQC(event) {
                event.preventDefault();
                
                const serialNo = document.getElementById('qcScanInput').value.trim();
                if (!serialNo) {
                    alert('Please enter a serial number');
                    return;
                }
                
                try {
                    const response = await axios.get(\`/api/inventory/\${serialNo}\`);
                    const device = response.data.data;
                    
                    // Show device info
                    document.getElementById('qcDeviceInfoDisplay').innerHTML = \`
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                            <div><strong>Serial No:</strong> \${device.device_serial_no}</div>
                            <div><strong>Model:</strong> \${device.model_name}</div>
                            <div><strong>Current Status:</strong> <span class="badge">\${device.status}</span></div>
                            <div><strong>In Date:</strong> \${device.in_date ? new Date(device.in_date).toLocaleDateString() : '-'}</div>
                        </div>
                    \`;
                    
                    // Populate hidden fields
                    document.getElementById('qcInventoryId').value = device.id;
                    document.getElementById('qcSerialNo').value = device.device_serial_no;
                    
                    // Set today's date
                    const today = new Date().toISOString().split('T')[0];
                    document.querySelector('#qcForm input[name="check_date"]').value = today;
                    
                    // Show form
                    document.getElementById('qcFormSection').style.display = 'block';
                    
                    // Clear scan input
                    document.getElementById('qcScanInput').value = '';
                } catch (error) {
                    alert('Device not found: ' + (error.response?.data?.error || error.message));
                }
            }

            // Submit Quality Check
            async function submitQualityCheck(event) {
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                
                const data = {
                    inventory_id: formData.get('inventory_id'),
                    device_serial_no: formData.get('device_serial_no'),
                    check_date: formData.get('check_date'),
                    pass_fail: formData.get('pass_fail'),
                    test_results: formData.get('test_results'),
                    notes: formData.get('notes')
                };
                
                try {
                    const response = await axios.post('/api/inventory/quality-check', data);
                    
                    if (response.data.success) {
                        alert('Quality check submitted successfully!');
                        cancelQC();
                        loadRecentQC();
                    }
                } catch (error) {
                    alert('Error submitting QC: ' + (error.response?.data?.error || error.message));
                }
            }

            // Cancel QC
            function cancelQC() {
                document.getElementById('qcFormSection').style.display = 'none';
                document.getElementById('qcForm').reset();
                document.getElementById('qcScanInput').value = '';
                document.getElementById('qcScanInput').focus();
            }

            // Load Recent QC Records
            async function loadRecentQC() {
                try {
                    const response = await axios.get('/api/inventory/quality-checks');
                    const checks = response.data.data;
                    
                    const tbody = document.getElementById('recentQCBody');
                    
                    if (!checks || checks.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No QC records found</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = checks.map(qc => \`
                        <tr>
                            <td>\${new Date(qc.check_date).toLocaleDateString()}</td>
                            <td><strong>\${qc.device_serial_no}</strong></td>
                            <td>\${qc.model_name || '-'}</td>
                            <td><span class="badge badge-\${qc.pass_fail === 'Pass' ? 'success' : 'error'}">\${qc.pass_fail}</span></td>
                            <td>\${qc.checked_by}</td>
                            <td>\${qc.notes || '-'}</td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading QC records:', error);
                }
            }

            // ==================== INVENTORY REPORTS FUNCTIONS ====================

            // Load Inventory Reports
            async function loadInventoryReports() {
                await loadInventoryStats();
                await loadInventoryActivity();
            }

            // Load Inventory Stats
            async function loadInventoryStats() {
                try {
                    const response = await axios.get('/api/inventory/stats');
                    const stats = response.data.data;
                    
                    // Update summary cards
                    document.getElementById('reportTotalInventory').textContent = stats.total || 0;
                    document.getElementById('reportInStock').textContent = stats.in_stock || 0;
                    document.getElementById('reportDispatched').textContent = stats.dispatched || 0;
                    document.getElementById('reportQualityCheck').textContent = stats.quality_check || 0;
                    
                    // Render chart
                    renderInventoryStatusChart(stats);
                } catch (error) {
                    console.error('Error loading inventory stats:', error);
                }
            }

            // Render Inventory Status Chart
            function renderInventoryStatusChart(stats) {
                const ctx = document.getElementById('inventoryStatusChart').getContext('2d');
                
                if (inventoryChart) {
                    inventoryChart.destroy();
                }
                
                inventoryChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['In Stock', 'Dispatched', 'Quality Check', 'Defective', 'Returned'],
                        datasets: [{
                            data: [
                                stats.in_stock || 0,
                                stats.dispatched || 0,
                                stats.quality_check || 0,
                                stats.defective || 0,
                                stats.returned || 0
                            ],
                            backgroundColor: [
                                'rgba(16, 185, 129, 0.8)',
                                'rgba(59, 130, 246, 0.8)',
                                'rgba(251, 191, 36, 0.8)',
                                'rgba(239, 68, 68, 0.8)',
                                'rgba(107, 114, 128, 0.8)'
                            ],
                            borderColor: [
                                'rgba(16, 185, 129, 1)',
                                'rgba(59, 130, 246, 1)',
                                'rgba(251, 191, 36, 1)',
                                'rgba(239, 68, 68, 1)',
                                'rgba(107, 114, 128, 1)'
                            ],
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'right',
                                labels: {
                                    padding: 15,
                                    font: {
                                        size: 12
                                    }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const label = context.label || '';
                                        const value = context.parsed || 0;
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                        return \`\${label}: \${value} (\${percentage}%)\`;
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Load Inventory Activity
            async function loadInventoryActivity() {
                try {
                    const response = await axios.get('/api/inventory/activity');
                    const activity = response.data.data;
                    
                    const tbody = document.getElementById('inventoryActivityBody');
                    
                    if (!activity || activity.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No activity records found</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = activity.map(a => \`
                        <tr>
                            <td>\${new Date(a.changed_at).toLocaleDateString()}</td>
                            <td><strong>\${a.device_serial_no}</strong></td>
                            <td>Status Change</td>
                            <td><span class="badge">\${a.old_status}</span></td>
                            <td><span class="badge">\${a.new_status}</span></td>
                            <td>\${a.changed_by}</td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading activity:', error);
                }
            }
        </script>
        </div>
    </body>
    </html>
  `)
})

export default app
