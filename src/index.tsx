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

// Serve static files from public/static
app.use('/static/*', serveStatic({ root: './' }))

// API Routes

// Authentication endpoints
app.post('/api/auth/login', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { username, password } = body;
    
    console.log('[LOGIN] Attempt:', { username, passwordLength: password?.length });
    
    // Simple base64 encoding for demo (in production, use proper hashing)
    const encodedPassword = btoa(password);
    console.log('[LOGIN] Encoded password:', encodedPassword);
    
    const user = await env.DB.prepare(`
      SELECT id, username, full_name, role, employee_name, is_active, 
             can_edit, can_delete, can_view,
             sales_view, sales_edit, sales_delete,
             inventory_view, inventory_edit, inventory_delete,
             leads_view, leads_edit, leads_delete,
             reports_view, reports_edit
      FROM users 
      WHERE username = ? AND password = ? AND is_active = 1
    `).bind(username, encodedPassword).first();
    
    console.log('[LOGIN] User found:', !!user);
    
    if (!user) {
      console.log('[LOGIN] Failed - Invalid credentials');
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }
    
    console.log('[LOGIN] Success for user:', username);
    return c.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        employeeName: user.employee_name,
        permissions: {
          canEdit: user.can_edit === 1,
          canDelete: user.can_delete === 1,
          canView: user.can_view === 1,
          modules: {
            sales: {
              view: user.sales_view === 1,
              edit: user.sales_edit === 1,
              delete: user.sales_delete === 1
            },
            inventory: {
              view: user.inventory_view === 1,
              edit: user.inventory_edit === 1,
              delete: user.inventory_delete === 1
            },
            leads: {
              view: user.leads_view === 1,
              edit: user.leads_edit === 1,
              delete: user.leads_delete === 1
            },
            reports: {
              view: user.reports_view === 1,
              edit: user.reports_edit === 1
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('[LOGIN] Error:', error);
    return c.json({ success: false, error: 'Login failed: ' + error.message }, 500);
  }
});

app.get('/api/auth/verify', async (c) => {
  // This would verify a session token in production
  // For now, we'll rely on client-side session storage
  return c.json({ success: true });
});

// Magic Link - Send magic link email
app.post('/api/auth/magic-link/send', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { email } = body;
    
    console.log('[MAGIC LINK] Send request for email:', email);
    
    // Check if user exists and is active
    const user = await env.DB.prepare(`
      SELECT id, username, full_name, role, is_active 
      FROM users 
      WHERE username = ? AND is_active = 1
    `).bind(email).first();
    
    if (!user) {
      console.log('[MAGIC LINK] User not found or inactive:', email);
      // For security, don't reveal if user exists or not
      return c.json({ 
        success: true, 
        message: 'If this email is registered, you will receive a magic link shortly.' 
      });
    }
    
    // Generate magic link token (simple version - in production use crypto)
    const token = btoa(`${email}:${Date.now()}:${Math.random().toString(36)}`);
    const expiresAt = Date.now() + (15 * 60 * 1000); // 15 minutes from now
    
    // Store magic link token in database
    await env.DB.prepare(`
      INSERT OR REPLACE INTO magic_links (email, token, expires_at, used)
      VALUES (?, ?, ?, 0)
    `).bind(email, token, expiresAt).run();
    
    // In production, send actual email here using SendGrid, Mailgun, etc.
    // For demo, we'll just return the magic link
    const magicLink = `${new URL(c.req.url).origin}?magic_token=${token}`;
    
    console.log('[MAGIC LINK] Generated link:', magicLink);
    console.log('[MAGIC LINK] ⚠️  In production, this would be sent via email');
    
    // For demo purposes, show the link in console (in production, send via email service)
    return c.json({ 
      success: true, 
      message: 'Magic link sent to your email!',
      // Remove this in production - only for demo
      demo_link: magicLink 
    });
    
  } catch (error) {
    console.error('[MAGIC LINK] Send error:', error);
    return c.json({ success: false, error: 'Failed to send magic link: ' + error.message }, 500);
  }
});

// Magic Link - Verify and login
app.post('/api/auth/magic-link/verify', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { token } = body;
    
    console.log('[MAGIC LINK] Verify request');
    
    // Find magic link in database
    const magicLink = await env.DB.prepare(`
      SELECT email, token, expires_at, used 
      FROM magic_links 
      WHERE token = ?
    `).bind(token).first();
    
    if (!magicLink) {
      console.log('[MAGIC LINK] Token not found');
      return c.json({ success: false, error: 'Invalid magic link' }, 401);
    }
    
    // Check if already used
    if (magicLink.used === 1) {
      console.log('[MAGIC LINK] Token already used');
      return c.json({ success: false, error: 'This magic link has already been used' }, 401);
    }
    
    // Check if expired
    if (Date.now() > magicLink.expires_at) {
      console.log('[MAGIC LINK] Token expired');
      return c.json({ success: false, error: 'Magic link has expired. Please request a new one.' }, 401);
    }
    
    // Mark token as used
    await env.DB.prepare(`
      UPDATE magic_links SET used = 1 WHERE token = ?
    `).bind(token).run();
    
    // Get user details
    const user = await env.DB.prepare(`
      SELECT id, username, full_name, role, employee_name, is_active,
             can_edit, can_delete, can_view,
             sales_view, sales_edit, sales_delete,
             inventory_view, inventory_edit, inventory_delete,
             leads_view, leads_edit, leads_delete,
             reports_view, reports_edit
      FROM users 
      WHERE username = ? AND is_active = 1
    `).bind(magicLink.email).first();
    
    if (!user) {
      console.log('[MAGIC LINK] User not found or inactive');
      return c.json({ success: false, error: 'User account not found or inactive' }, 401);
    }
    
    console.log('[MAGIC LINK] Success for user:', magicLink.email);
    return c.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        employeeName: user.employee_name,
        permissions: {
          canEdit: user.can_edit === 1,
          canDelete: user.can_delete === 1,
          canView: user.can_view === 1,
          sales: {
            view: user.sales_view === 1,
            edit: user.sales_edit === 1,
            delete: user.sales_delete === 1
          },
          inventory: {
            view: user.inventory_view === 1,
            edit: user.inventory_edit === 1,
            delete: user.inventory_delete === 1
          },
          leads: {
            view: user.leads_view === 1,
            edit: user.leads_edit === 1,
            delete: user.leads_delete === 1
          },
          reports: {
            view: user.reports_view === 1,
            edit: user.reports_edit === 1
          }
        }
      }
    });
    
  } catch (error) {
    console.error('[MAGIC LINK] Verify error:', error);
    return c.json({ success: false, error: 'Failed to verify magic link: ' + error.message }, 500);
  }
});

// Change password endpoint (Admin can change without current password)
app.post('/api/auth/change-password', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { userId, newPassword } = body;
    
    const encodedNewPassword = btoa(newPassword);
    
    // Update password (no current password check - admin privilege)
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
      SELECT id, username, full_name, role, employee_name, is_active, 
             can_edit, can_delete, can_view,
             sales_view, sales_edit, sales_delete,
             inventory_view, inventory_edit, inventory_delete,
             leads_view, leads_edit, leads_delete,
             reports_view, reports_edit,
             created_at
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
    
    // Set default permissions based on role
    const can_edit = role === 'admin' ? 1 : 0;
    const can_delete = role === 'admin' ? 1 : 0;
    const can_view = 1;
    
    const result = await env.DB.prepare(`
      INSERT INTO users (username, password, full_name, role, employee_name, is_active, can_edit, can_delete, can_view)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).bind(username, encodedPassword, full_name, role, employee_name || null, can_edit, can_delete, can_view).run();
    
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
    const { full_name, role, employee_name, is_active, can_edit, can_delete, can_view, 
            sales_view, sales_edit, sales_delete,
            inventory_view, inventory_edit, inventory_delete,
            leads_view, leads_edit, leads_delete,
            reports_view, reports_edit,
            new_password } = body;
    
    // Update user information including module permissions
    if (new_password && new_password.length > 0) {
      const encodedPassword = btoa(new_password);
      await env.DB.prepare(`
        UPDATE users 
        SET full_name = ?, role = ?, employee_name = ?, is_active = ?, 
            can_edit = ?, can_delete = ?, can_view = ?,
            sales_view = ?, sales_edit = ?, sales_delete = ?,
            inventory_view = ?, inventory_edit = ?, inventory_delete = ?,
            leads_view = ?, leads_edit = ?, leads_delete = ?,
            reports_view = ?, reports_edit = ?,
            password = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(full_name, role, employee_name || null, is_active, 
              can_edit || 0, can_delete || 0, can_view || 1,
              sales_view || 1, sales_edit || 0, sales_delete || 0,
              inventory_view || 1, inventory_edit || 0, inventory_delete || 0,
              leads_view || 1, leads_edit || 0, leads_delete || 0,
              reports_view || 1, reports_edit || 0,
              encodedPassword, userId).run();
    } else {
      await env.DB.prepare(`
        UPDATE users 
        SET full_name = ?, role = ?, employee_name = ?, is_active = ?, 
            can_edit = ?, can_delete = ?, can_view = ?,
            sales_view = ?, sales_edit = ?, sales_delete = ?,
            inventory_view = ?, inventory_edit = ?, inventory_delete = ?,
            leads_view = ?, leads_edit = ?, leads_delete = ?,
            reports_view = ?, reports_edit = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(full_name, role, employee_name || null, is_active, 
              can_edit || 0, can_delete || 0, can_view || 1,
              sales_view || 1, sales_edit || 0, sales_delete || 0,
              inventory_view || 1, inventory_edit || 0, inventory_delete || 0,
              leads_view || 1, leads_edit || 0, leads_delete || 0,
              reports_view || 1, reports_edit || 0,
              userId).run();
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

// Balance Payment Reports
app.get('/api/reports/balance-payment-summary', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    
    // Current Month Balance
    const currentMonth = await env.DB.prepare(`
      SELECT 
        SUM(balance_amount) as total_balance,
        COUNT(*) as pending_count
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      AND balance_amount > 0
    `).bind(currentMonthStart.toISOString()).first();
    
    // Quarterly Balance
    const quarterly = await env.DB.prepare(`
      SELECT 
        SUM(balance_amount) as total_balance,
        COUNT(*) as pending_count
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      AND balance_amount > 0
    `).bind(quarterStart.toISOString()).first();
    
    // YTD Balance
    const ytd = await env.DB.prepare(`
      SELECT 
        SUM(balance_amount) as total_balance,
        COUNT(*) as pending_count
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      AND balance_amount > 0
    `).bind(yearStart.toISOString()).first();
    
    return c.json({
      success: true,
      data: {
        currentMonth: {
          balance: currentMonth?.total_balance || 0,
          count: currentMonth?.pending_count || 0
        },
        quarterly: {
          balance: quarterly?.total_balance || 0,
          count: quarterly?.pending_count || 0
        },
        ytd: {
          balance: ytd?.total_balance || 0,
          count: ytd?.pending_count || 0
        }
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch balance payment summary' }, 500);
  }
});

// Balance Payment by Employee
app.get('/api/reports/balance-payment-employee', async (c) => {
  const { env } = c;
  
  try {
    const { period } = c.req.query();
    const now = new Date();
    let startDate;
    
    switch(period) {
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default: // current month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const employeeBalances = await env.DB.prepare(`
      SELECT 
        employee_name,
        COUNT(*) as pending_orders,
        SUM(balance_amount) as total_balance,
        SUM(total_amount) as total_sales,
        SUM(amount_received) as total_received
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      AND balance_amount > 0
      GROUP BY employee_name
      ORDER BY total_balance DESC
    `).bind(startDate.toISOString()).all();
    
    return c.json({ success: true, data: employeeBalances.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch employee balance data' }, 500);
  }
});

// Balance Payment Details (for pie chart click)
app.get('/api/reports/balance-payment-details', async (c) => {
  const { env } = c;
  
  try {
    const { period } = c.req.query();
    const now = new Date();
    let startDate;
    
    switch(period) {
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default: // current month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const details = await env.DB.prepare(`
      SELECT 
        order_id,
        customer_name,
        company_name,
        employee_name,
        sale_date,
        total_amount,
        amount_received,
        balance_amount,
        customer_contact
      FROM sales
      WHERE DATE(sale_date) >= DATE(?)
      AND balance_amount > 0
      ORDER BY balance_amount DESC
    `).bind(startDate.toISOString()).all();
    
    return c.json({ success: true, data: details.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch balance payment details' }, 500);
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
    
    // Validate input
    if (!order_id || !payment_date || !amount || amount <= 0) {
      return c.json({ success: false, error: 'Missing required fields or invalid amount' }, 400);
    }
    
    // Get sale
    const sale = await env.DB.prepare(`
      SELECT * FROM sales WHERE order_id = ?
    `).bind(order_id).first();
    
    if (!sale) {
      return c.json({ success: false, error: 'Order not found' }, 404);
    }
    
    // Check if payment amount is valid
    if (amount > sale.balance_amount) {
      return c.json({ success: false, error: 'Payment amount exceeds balance amount' }, 400);
    }
    
    // Update sale
    const new_amount_received = parseFloat(sale.amount_received) + parseFloat(amount);
    const new_balance = parseFloat(sale.total_amount) - new_amount_received;
    
    await env.DB.prepare(`
      UPDATE sales 
      SET amount_received = ?, balance_amount = ?, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `).bind(new_amount_received, new_balance, order_id).run();
    
    // Insert payment history
    await env.DB.prepare(`
      INSERT INTO payment_history (sale_id, order_id, payment_date, amount, account_received, payment_reference)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(sale.id, order_id, payment_date, amount, account_received || 'Not Specified', payment_reference || '').run();
    
    return c.json({ 
      success: true, 
      message: 'Payment updated successfully',
      data: {
        new_amount_received,
        new_balance
      }
    });
  } catch (error) {
    console.error('Balance payment error:', error);
    return c.json({ success: false, error: 'Failed to update payment: ' + error.message }, 500);
  }
});

// Get balance payment history for current month
app.get('/api/sales/balance-payment-history', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // Format as YYYY-MM-DD for SQLite DATE comparison
    const monthStartStr = currentMonthStart.toISOString().split('T')[0];
    
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
    `).bind(monthStartStr).all();
    
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
      query += ` WHERE customer_code LIKE ? OR customer_name LIKE ? OR mobile_number LIKE ?`;
      const searchTerm = `%${search}%`;
      params = [searchTerm, searchTerm, searchTerm];
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

// ===== CUSTOMER DETAILS API ENDPOINTS =====

// Get customer basic info from leads table (fallback to sales table if not in leads)
app.get('/api/customer-details/basic/:query', async (c) => {
  const { env } = c;
  const query = c.req.param('query');
  
  try {
    // Search by mobile_number in leads table first
    let customer = await env.DB.prepare(`
      SELECT 
        id,
        customer_name,
        mobile_number,
        alternate_mobile,
        location,
        company_name,
        gst_number,
        email,
        complete_address,
        status,
        created_at,
        mobile_number as customer_code
      FROM leads 
      WHERE mobile_number = ? OR alternate_mobile = ?
      LIMIT 1
    `).bind(query, query).first();
    
    // If not found in leads, try sales table with customer_code
    if (!customer) {
      const sale = await env.DB.prepare(`
        SELECT DISTINCT 
          customer_code,
          customer_name,
          customer_contact as mobile_number,
          company_name,
          created_at,
          NULL as alternate_mobile,
          NULL as location,
          NULL as gst_number,
          NULL as email,
          NULL as complete_address,
          'Existing Customer' as status
        FROM sales 
        WHERE customer_code = ? OR customer_contact = ?
        LIMIT 1
      `).bind(query, query).first();
      
      if (sale) {
        customer = sale;
      }
    }
    
    if (!customer) {
      return c.json({ success: false, error: 'Customer not found' }, 404);
    }
    
    return c.json({ success: true, data: customer });
  } catch (error) {
    console.error('Error in customer-details/basic:', error);
    return c.json({ success: false, error: 'Failed to fetch customer basic info' }, 500);
  }
});

// Get customer full history (leads + sales + payments + quotations)
app.get('/api/customer-details/history/:query', async (c) => {
  const { env } = c;
  const query = c.req.param('query');
  
  try {
    // Get customer info from leads first by mobile number
    let customer = await env.DB.prepare(`
      SELECT 
        id,
        customer_name,
        mobile_number,
        mobile_number as customer_code,
        alternate_mobile,
        location,
        company_name,
        gst_number,
        email,
        complete_address,
        status,
        created_at
      FROM leads 
      WHERE mobile_number = ? OR alternate_mobile = ?
      LIMIT 1
    `).bind(query, query).first();
    
    // Fallback to sales table if not in leads
    if (!customer) {
      const sale = await env.DB.prepare(`
        SELECT DISTINCT 
          customer_code,
          customer_name,
          customer_contact as mobile_number,
          company_name,
          created_at,
          NULL as alternate_mobile,
          NULL as location,
          NULL as gst_number,
          NULL as email,
          NULL as complete_address,
          'Existing Customer' as status
        FROM sales 
        WHERE customer_code = ? OR customer_contact = ?
        LIMIT 1
      `).bind(query, query).first();
      
      if (sale) {
        customer = sale;
      }
    }
    
    if (!customer) {
      return c.json({ success: false, error: 'Customer not found' }, 404);
    }
    
    // Get search params - use customer_code if available, otherwise mobile_number
    const searchCode = customer.customer_code || customer.mobile_number;
    const searchMobile = customer.mobile_number;
    
    // Get all sales for this customer
    const sales = await env.DB.prepare(`
      SELECT s.*, 
        (SELECT GROUP_CONCAT(si.product_name || ' (x' || si.quantity || ')', ', ')
         FROM sale_items si WHERE si.sale_id = s.id) as products
      FROM sales s
      WHERE s.customer_code = ? OR s.customer_contact = ?
      ORDER BY s.sale_date DESC
    `).bind(searchCode, searchMobile).all();
    
    // Get all payments for this customer
    const payments = await env.DB.prepare(`
      SELECT ph.*, s.customer_name, s.company_name
      FROM payment_history ph
      LEFT JOIN sales s ON ph.order_id = s.order_id
      WHERE s.customer_code = ? OR s.customer_contact = ?
      ORDER BY ph.payment_date DESC
    `).bind(searchCode, searchMobile).all();
    
    // Get all quotations for this customer
    const quotations = await env.DB.prepare(`
      SELECT q.*,
        (SELECT GROUP_CONCAT(qi.item_name || ' (x' || qi.quantity || ')', ', ')
         FROM quotation_items qi WHERE qi.quotation_number = q.quotation_number) as products
      FROM quotations q
      WHERE q.customer_code = ?
      ORDER BY q.created_at DESC
    `).bind(customer.customer_code).all();
    
    return c.json({
      success: true,
      data: {
        customer,
        sales: sales.results || [],
        payments: payments.results || [],
        quotations: quotations.results || [],
        summary: {
          total_sales: sales.results?.length || 0,
          total_payments: payments.results?.length || 0,
          total_quotations: quotations.results?.length || 0,
          total_sale_amount: sales.results?.reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0,
          total_balance: sales.results?.reduce((sum, s) => sum + (s.balance_amount || 0), 0) || 0,
          total_paid: payments.results?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching customer history:', error);
    return c.json({ success: false, error: 'Failed to fetch customer history' }, 500);
  }
});

// Get customer orders from sales table
app.get('/api/customer-details/orders/:query', async (c) => {
  const { env } = c;
  const query = c.req.param('query');
  
  try {
    // Get customer info first from leads
    let customer = await env.DB.prepare(`
      SELECT customer_code, mobile_number FROM leads WHERE customer_code = ? LIMIT 1
    `).bind(query).first();
    
    if (!customer) {
      customer = await env.DB.prepare(`
        SELECT customer_code, mobile_number FROM leads WHERE mobile_number = ? LIMIT 1
      `).bind(query).first();
    }
    
    // Fallback to sales table if not in leads
    if (!customer) {
      const sale = await env.DB.prepare(`
        SELECT DISTINCT customer_code, customer_contact as mobile_number 
        FROM sales 
        WHERE customer_code = ? OR customer_contact = ?
        LIMIT 1
      `).bind(query, query).first();
      
      if (sale) {
        customer = sale;
      }
    }
    
    if (!customer) {
      return c.json({ success: false, error: 'Customer not found' }, 404);
    }
    
    // Get all sales with items
    const sales = await env.DB.prepare(`
      SELECT * FROM sales 
      WHERE customer_code = ? OR customer_contact = ?
      ORDER BY sale_date DESC
    `).bind(customer.customer_code, customer.mobile_number).all();
    
    // Get items for each sale
    const salesWithItems = [];
    for (const sale of (sales.results || [])) {
      const items = await env.DB.prepare(`
        SELECT * FROM sale_items WHERE sale_id = ?
      `).bind(sale.id).all();
      
      salesWithItems.push({
        ...sale,
        items: items.results || []
      });
    }
    
    return c.json({ success: true, data: salesWithItems });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch customer orders' }, 500);
  }
});

// Get customer account ledger (payment in/out from payment_history)
app.get('/api/customer-details/ledger/:query', async (c) => {
  const { env } = c;
  const query = c.req.param('query');
  
  try {
    // Get customer info first from leads table
    // IMPORTANT: leads table uses mobile_number as primary identifier, NOT customer_code
    let customer = await env.DB.prepare(`
      SELECT 
        mobile_number, 
        customer_name,
        mobile_number as customer_code
      FROM leads 
      WHERE mobile_number = ? OR alternate_mobile = ?
      LIMIT 1
    `).bind(query, query).first();
    
    // Fallback to sales table if not in leads
    if (!customer) {
      const sale = await env.DB.prepare(`
        SELECT DISTINCT 
          customer_code, 
          customer_contact as mobile_number, 
          customer_name 
        FROM sales 
        WHERE customer_code = ? OR customer_contact = ?
        LIMIT 1
      `).bind(query, query).first();
      
      if (sale) {
        customer = sale;
      }
    }
    
    if (!customer) {
      return c.json({ success: false, error: 'Customer not found' }, 404);
    }
    
    // Use both customer_code and mobile_number for searching
    const searchCode = customer.customer_code || customer.mobile_number;
    const searchMobile = customer.mobile_number;
    
    // Get all sales for this customer to calculate total due
    const sales = await env.DB.prepare(`
      SELECT order_id, sale_date, total_amount, balance_amount, amount_received
      FROM sales 
      WHERE customer_code = ? OR customer_contact = ?
      ORDER BY sale_date ASC
    `).bind(searchCode, searchMobile).all();
    
    // Get all payments
    const payments = await env.DB.prepare(`
      SELECT ph.*, s.customer_name
      FROM payment_history ph
      LEFT JOIN sales s ON ph.order_id = s.order_id
      WHERE s.customer_code = ? OR s.customer_contact = ?
      ORDER BY ph.payment_date ASC
    `).bind(searchCode, searchMobile).all();
    
    // Build ledger entries (combination of sales and payments)
    const ledgerEntries = [];
    let runningBalance = 0;
    
    // Combine and sort by date
    const allTransactions = [];
    
    (sales.results || []).forEach(sale => {
      allTransactions.push({
        date: sale.sale_date,
        type: 'sale',
        order_id: sale.order_id,
        description: 'Sale - ' + sale.order_id,
        debit: sale.total_amount,
        credit: sale.amount_received || 0,
        balance: sale.balance_amount
      });
    });
    
    (payments.results || []).forEach(payment => {
      allTransactions.push({
        date: payment.payment_date,
        type: 'payment',
        order_id: payment.order_id,
        description: 'Payment - ' + payment.order_id + (payment.payment_reference ? ' (' + payment.payment_reference + ')' : ''),
        debit: 0,
        credit: payment.amount,
        balance: 0,
        account: payment.account_received
      });
    });
    
    // Sort by date
    allTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate running balance
    allTransactions.forEach(txn => {
      runningBalance += txn.debit - txn.credit;
      ledgerEntries.push({
        ...txn,
        running_balance: runningBalance
      });
    });
    
    // Calculate summary
    const totalDebit = allTransactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = allTransactions.reduce((sum, t) => sum + t.credit, 0);
    const calculatedBalance = totalDebit - totalCredit;
    
    // For product selling business:
    // - If customer owes money (Debit > Credit), show positive balance
    // - If customer overpaid (Credit > Debit), show 0 or track as advance
    const finalBalance = calculatedBalance > 0 ? calculatedBalance : 0;
    const advancePayment = calculatedBalance < 0 ? Math.abs(calculatedBalance) : 0;
    
    return c.json({
      success: true,
      data: {
        customer,
        ledger: ledgerEntries,
        summary: {
          total_debit: totalDebit,
          total_credit: totalCredit,
          final_balance: finalBalance,
          advance_payment: advancePayment
        }
      }
    });
  } catch (error) {
    console.error('Error fetching account ledger:', error);
    return c.json({ success: false, error: 'Failed to fetch account ledger' }, 500);
  }
});

// Get customer tickets (placeholder - will show message if no tickets table exists)
app.get('/api/customer-details/tickets/:query', async (c) => {
  const { env } = c;
  const query = c.req.param('query');
  
  try {
    // Get customer info first from leads
    let customer = await env.DB.prepare(`
      SELECT customer_code, mobile_number, customer_name FROM leads WHERE customer_code = ? LIMIT 1
    `).bind(query).first();
    
    if (!customer) {
      customer = await env.DB.prepare(`
        SELECT customer_code, mobile_number, customer_name FROM leads WHERE mobile_number = ? LIMIT 1
      `).bind(query).first();
    }
    
    // Fallback to sales table if not in leads
    if (!customer) {
      const sale = await env.DB.prepare(`
        SELECT DISTINCT customer_code, customer_contact as mobile_number, customer_name 
        FROM sales 
        WHERE customer_code = ? OR customer_contact = ?
        LIMIT 1
      `).bind(query, query).first();
      
      if (sale) {
        customer = sale;
      }
    }
    
    if (!customer) {
      return c.json({ success: false, error: 'Customer not found' }, 404);
    }
    
    // For now, return empty tickets array (tickets table doesn't exist yet)
    // When tickets table is created, this endpoint can be updated
    return c.json({
      success: true,
      data: {
        customer,
        tickets: [],
        message: 'Tickets feature coming soon'
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch tickets' }, 500);
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
        
        // Get the sale_id for this order
        const sale = await env.DB.prepare('SELECT id FROM sales WHERE order_id = ?').bind(order_id).first();
        const sale_id = sale ? sale.id : null;
        
        if (!sale_id) {
          errors.push(`Row ${i + 2}: Failed to get sale_id for order ${order_id}`);
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
            const total_price = quantity * unit_price;
            
            if (quantity > 0 && unit_price > 0) {
              await env.DB.prepare(`
                INSERT INTO sale_items (sale_id, order_id, product_name, quantity, unit_price, total_price)
                VALUES (?, ?, ?, ?, ?, ?)
              `).bind(
                sale_id,
                order_id, 
                product_name, 
                quantity, 
                unit_price,
                total_price
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

// Search customer by code or phone
app.get('/api/customers/search/:query', async (c) => {
  const { env } = c;
  const query = c.req.param('query');
  
  try {
    // Try to find by customer_code first, then by phone
    let customer = await env.DB.prepare(`
      SELECT * FROM customers WHERE customer_code = ? LIMIT 1
    `).bind(query).first();
    
    if (!customer) {
      // Try by phone if not found by customer_code
      customer = await env.DB.prepare(`
        SELECT * FROM customers WHERE phone = ? LIMIT 1
      `).bind(query).first();
    }
    
    if (!customer) {
      return c.json({ success: false, error: 'Customer not found' }, 404);
    }
    
    return c.json({ success: true, data: customer });
  } catch (error) {
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
      notes,
      terms_conditions,
      created_by
    } = body;
    
    // Insert quotation - Convert undefined to null for optional fields
    await env.DB.prepare(`
      INSERT INTO quotations (
        quotation_number, customer_code, customer_name, customer_contact, customer_email,
        company_name, gst_number, gst_registered_address, customer_address, concern_person_name, concern_person_contact,
        items, subtotal, courier_cost, courier_partner, delivery_method, bill_type, gst_amount, total_amount, theme, notes, terms_conditions, 
        created_by, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
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
      notes || null, 
      terms_conditions || null,
      created_by || null
    ).run();
    
    // Insert quotation items
    for (const item of items) {
      await env.DB.prepare(`
        INSERT INTO quotation_items (quotation_number, item_name, hsn_sac, quantity, unit_price, amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        quotation_number, item.product_name, item.hsn_sac || null, item.quantity, item.unit_price, item.amount
      ).run();
    }
    
    return c.json({ success: true, quotation_number });
  } catch (error) {
    console.error('Error creating quotation:', error);
    return c.json({ success: false, error: 'Failed to create quotation' }, 500);
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
        INSERT INTO quotation_items (quotation_number, item_name, hsn_sac, quantity, unit_price, amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        quotation_number, item.product_name, item.hsn_sac, item.quantity, item.unit_price, item.amount
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

// ===================================================================
// INVENTORY MANAGEMENT API ENDPOINTS
// ===================================================================

// Get all inventory with search and filters
app.get('/api/inventory', async (c) => {
  const { env } = c;
  
  try {
    const search = c.req.query('search') || '';
    const status = c.req.query('status') || '';
    
    let query = `
      SELECT i.*,
             qc.pass_fail as qc_result,
             qc.check_date as qc_date
      FROM inventory i
      LEFT JOIN (
        SELECT device_serial_no, pass_fail, check_date
        FROM quality_check
        WHERE id IN (
          SELECT MAX(id)
          FROM quality_check
          GROUP BY device_serial_no
        )
      ) qc ON i.device_serial_no = qc.device_serial_no
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      query += ' AND (i.device_serial_no LIKE ? OR i.model_name LIKE ? OR i.customer_name LIKE ? OR i.cust_code LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }
    
    if (status) {
      query += ' AND i.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY i.id ASC';
    
    const inventory = await env.DB.prepare(query).bind(...params).all();
    
    return c.json({ success: true, data: inventory.results || [] });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch inventory' }, 500);
  }
});

// Add new inventory item
app.post('/api/inventory/add', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { device_serial_no, model_name, category, status, in_date, location, notes, added_by } = body;
    
    // Check if serial number already exists
    const existing = await env.DB.prepare(`
      SELECT id FROM inventory WHERE device_serial_no = ?
    `).bind(device_serial_no).first();
    
    if (existing) {
      return c.json({ success: false, error: 'Serial number already exists in inventory' }, 400);
    }
    
    // Insert new inventory record
    await env.DB.prepare(`
      INSERT INTO inventory (
        device_serial_no, model_name, status, in_date, location, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      device_serial_no, model_name, status || 'In Stock', in_date, location, notes
    ).run();
    
    return c.json({ 
      success: true, 
      message: 'Inventory added successfully',
      data: { device_serial_no, model_name, added_by }
    });
  } catch (error) {
    console.error('Add inventory error:', error);
    return c.json({ success: false, error: 'Failed to add inventory: ' + error.message }, 500);
  }
});

// Add bulk inventory
app.post('/api/inventory/add-bulk', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { devices } = body;
    
    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return c.json({ success: false, error: 'No devices provided' }, 400);
    }
    
    let added = 0;
    let duplicates = 0;
    const errors = [];
    
    for (const device of devices) {
      try {
        const { device_serial_no, model_name, category, status, in_date, added_by } = device;
        
        // Check if serial number already exists
        const existing = await env.DB.prepare(`
          SELECT id FROM inventory WHERE device_serial_no = ?
        `).bind(device_serial_no).first();
        
        if (existing) {
          duplicates++;
          continue;
        }
        
        // Insert new inventory record
        await env.DB.prepare(`
          INSERT INTO inventory (
            device_serial_no, model_name, status, in_date, created_at
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          device_serial_no, model_name, status || 'In Stock', in_date
        ).run();
        
        added++;
      } catch (err) {
        errors.push(`${device.device_serial_no}: ${err.message}`);
      }
    }
    
    return c.json({ 
      success: true, 
      message: `Added ${added} devices, ${duplicates} duplicates skipped`,
      data: { added, duplicates, errors: errors.length > 0 ? errors : null }
    });
  } catch (error) {
    console.error('Bulk add inventory error:', error);
    return c.json({ success: false, error: 'Failed to add bulk inventory: ' + error.message }, 500);
  }
});

// Upload inventory from Excel
app.post('/api/inventory/upload', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { items } = body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return c.json({ success: false, error: 'No items provided' }, 400);
    }
    
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    
    for (const item of items) {
      try {
        const serialNo = item.device_serial_no || item['Device Serial Number'] || item['device_serial_no'];
        const modelName = item.model_name || item['Model Name'] || item['model_name'];
        
        if (!serialNo || !modelName) {
          errors++;
          continue;
        }
        
        // Check if device exists
        const existing = await env.DB.prepare(`
          SELECT id FROM inventory WHERE device_serial_no = ?
        `).bind(serialNo).first();
        
        if (existing) {
          // Update existing device
          await env.DB.prepare(`
            UPDATE inventory SET
              model_name = ?, in_date = ?, dispatch_date = ?,
              cust_code = ?, sale_date = ?, customer_name = ?,
              cust_city = ?, cust_mobile = ?, dispatch_reason = ?,
              warranty_provide = ?, old_serial_no = ?, license_renew_time = ?,
              user_id = ?, password = ?, account_activation_date = ?,
              account_expiry_date = ?, order_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE device_serial_no = ?
          `).bind(
            modelName,
            item['In_Date'] || item.In_Date || item['In Date'] || null,
            item['Dispatch Date'] || item.dispatch_date || null,
            item['Cust Code'] || item.cust_code || null,
            item['Sale Date'] || item.sale_date || null,
            item['Customer Name'] || item.customer_name || null,
            item['Cust City'] || item.cust_city || null,
            item['Cust Mobile'] || item.cust_mobile || null,
            item['Dispatch Reason'] || item.dispatch_reason || null,
            item['Warranty Provide'] || item.warranty_provide || null,
            item['If Replace Old S. No.'] || item.old_serial_no || null,
            item['License Renew Time'] || item.license_renew_time || null,
            item['User id'] || item.user_id || null,
            item['Password'] || item.password || null,
            item['Account Activation date'] || item.account_activation_date || null,
            item['Account Expiry Date'] || item.account_expiry_date || null,
            item['Order Id'] || item.order_id || null,
            serialNo
          ).run();
          updated++;
        } else {
          // Insert new device
          await env.DB.prepare(`
            INSERT INTO inventory (
              device_serial_no, model_name, in_date, dispatch_date,
              cust_code, sale_date, customer_name, cust_city, cust_mobile,
              dispatch_reason, warranty_provide, old_serial_no, license_renew_time,
              user_id, password, account_activation_date, account_expiry_date,
              order_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Stock')
          `).bind(
            serialNo, modelName,
            item.in_date || item['In Date'] || null,
            item.dispatch_date || item['Dispatch Date'] || null,
            item.cust_code || item['Cust Code'] || null,
            item.sale_date || item['Sale Date'] || null,
            item.customer_name || item['Customer Name'] || null,
            item.cust_city || item['Cust City'] || null,
            item.cust_mobile || item['Cust Mobile'] || null,
            item.dispatch_reason || item['Dispatch Reason'] || null,
            item.warranty_provide || item['Warranty Provide'] || null,
            item.old_serial_no || item['Old Serial No'] || null,
            item.license_renew_time || item['License Renew Time'] || null,
            item.user_id || item['User ID'] || null,
            item.password || item['Password'] || null,
            item.account_activation_date || item['Account Activation Date'] || null,
            item.account_expiry_date || item['Account Expiry Date'] || null,
            item.order_id || item['Order Id'] || null
          ).run();
          inserted++;
        }
      } catch (err) {
        errors++;
        console.error('Error processing item:', err);
      }
    }
    
    return c.json({ 
      success: true, 
      message: `Processed ${items.length} items: ${inserted} inserted, ${updated} updated, ${errors} errors`,
      stats: { inserted, updated, errors }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to upload inventory' }, 500);
  }
});

// Dispatch device
app.post('/api/inventory/dispatch', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { 
      device_serial_no, dispatch_date, customer_name, customer_code,
      customer_mobile, customer_city, dispatch_reason, courier_name,
      tracking_number, dispatched_by, notes
    } = body;
    
    // Find device
    const device = await env.DB.prepare(`
      SELECT id FROM inventory WHERE device_serial_no = ?
    `).bind(device_serial_no).first();
    
    if (!device) {
      return c.json({ success: false, error: 'Device not found' }, 404);
    }
    
    // Insert dispatch record
    await env.DB.prepare(`
      INSERT INTO dispatch_records (
        inventory_id, device_serial_no, dispatch_date, customer_name,
        customer_code, customer_mobile, customer_city, dispatch_reason,
        courier_name, tracking_number, dispatched_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      device.id, device_serial_no, dispatch_date, customer_name,
      customer_code, customer_mobile, customer_city, dispatch_reason,
      courier_name, tracking_number, dispatched_by, notes
    ).run();
    
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
    `).bind(
      dispatch_date, customer_name, customer_code,
      customer_mobile, customer_city, dispatch_reason, device.id
    ).run();
    
    // Add to history
    await env.DB.prepare(`
      INSERT INTO inventory_status_history (
        inventory_id, device_serial_no, old_status, new_status,
        changed_by, change_reason
      ) VALUES (?, ?, ?, 'Dispatched', ?, ?)
    `).bind(device.id, device_serial_no, 'In Stock', dispatched_by, dispatch_reason).run();
    
    return c.json({ success: true, message: 'Device dispatched successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to dispatch device' }, 500);
  }
});

// Device replacement - replace old device with new device
app.post('/api/inventory/replacement', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { old_device_serial_no, new_device_serial_no, replacement_reason, replaced_by } = body;
    
    if (!old_device_serial_no || !new_device_serial_no) {
      return c.json({ success: false, error: 'Both old and new device serial numbers are required' }, 400);
    }
    
    // Find old device
    const oldDevice = await env.DB.prepare(`
      SELECT * FROM inventory WHERE device_serial_no LIKE ?
    `).bind(`%${old_device_serial_no}%`).first();
    
    if (!oldDevice) {
      return c.json({ success: false, error: 'Old device not found' }, 404);
    }
    
    // Find new device
    const newDevice = await env.DB.prepare(`
      SELECT * FROM inventory WHERE device_serial_no LIKE ?
    `).bind(`%${new_device_serial_no}%`).first();
    
    if (!newDevice) {
      return c.json({ success: false, error: 'New device not found' }, 404);
    }
    
    // Check if new device is available
    if (newDevice.status !== 'In Stock') {
      return c.json({ success: false, error: `New device is not available (Status: ${newDevice.status})` }, 400);
    }
    
    // Update old device - mark as Returned
    await env.DB.prepare(`
      UPDATE inventory SET
        status = 'Returned',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(oldDevice.id).run();
    
    // Add history for old device
    await env.DB.prepare(`
      INSERT INTO inventory_status_history (
        inventory_id, device_serial_no, old_status, new_status,
        changed_by, change_reason
      ) VALUES (?, ?, ?, 'Returned', ?, ?)
    `).bind(oldDevice.id, oldDevice.device_serial_no, oldDevice.status, replaced_by, `Replaced with ${new_device_serial_no}: ${replacement_reason}`).run();
    
    // Update new device - copy customer details from old device and mark as Dispatched
    await env.DB.prepare(`
      UPDATE inventory SET
        status = 'Dispatched',
        dispatch_date = date('now'),
        customer_name = ?,
        cust_code = ?,
        cust_mobile = ?,
        cust_city = ?,
        order_id = ?,
        dispatch_reason = ?,
        old_serial_no = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      oldDevice.customer_name,
      oldDevice.cust_code,
      oldDevice.cust_mobile,
      oldDevice.cust_city,
      oldDevice.order_id,
      `Replacement for ${old_device_serial_no}: ${replacement_reason}`,
      old_device_serial_no,
      newDevice.id
    ).run();
    
    // Add history for new device
    await env.DB.prepare(`
      INSERT INTO inventory_status_history (
        inventory_id, device_serial_no, old_status, new_status,
        changed_by, change_reason
      ) VALUES (?, ?, 'In Stock', 'Dispatched', ?, ?)
    `).bind(newDevice.id, newDevice.device_serial_no, replaced_by, `Replacement for ${old_device_serial_no}: ${replacement_reason}`).run();
    
    // Create dispatch record for the new device
    await env.DB.prepare(`
      INSERT INTO dispatch_records (
        inventory_id, device_serial_no, dispatch_date,
        customer_name, customer_code, customer_mobile, customer_city,
        dispatch_reason, dispatched_by, notes
      ) VALUES (?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newDevice.id,
      newDevice.device_serial_no,
      oldDevice.customer_name,
      oldDevice.cust_code,
      oldDevice.cust_mobile,
      oldDevice.cust_city,
      `Replacement for ${old_device_serial_no}`,
      replaced_by,
      replacement_reason
    ).run();
    
    return c.json({
      success: true,
      message: 'Device replacement completed successfully',
      data: {
        old_device: old_device_serial_no,
        new_device: new_device_serial_no,
        customer: oldDevice.customer_name,
        order_id: oldDevice.order_id
      }
    });
  } catch (error) {
    console.error('Replacement error:', error);
    return c.json({ success: false, error: 'Failed to replace device: ' + error.message }, 500);
  }
});

// Get dispatch records
app.get('/api/inventory/dispatches', async (c) => {
  const { env } = c;
  
  try {
    const dispatches = await env.DB.prepare(`
      SELECT 
        dr.*,
        i.model_name,
        l.mobile_number as lead_phone,
        td.tracking_id
      FROM dispatch_records dr
      LEFT JOIN inventory i ON i.device_serial_no LIKE '%' || dr.device_serial_no || '%'
      LEFT JOIN leads l ON l.customer_name = dr.customer_name OR l.mobile_number = dr.customer_mobile
      LEFT JOIN tracking_details td ON dr.order_id = td.order_id
      ORDER BY dr.serial_number ASC
    `).all();
    
    return c.json({ success: true, data: dispatches.results || [] });
  } catch (error) {
    console.error('Error fetching dispatches:', error);
    return c.json({ success: false, error: 'Failed to fetch dispatches' }, 500);
  }
});

// Get dispatches grouped by order_id (optimized for performance)
app.get('/api/inventory/dispatches/grouped', async (c) => {
  const { env } = c;
  const sortBy = c.req.query('sortBy') || 'date'; // 'date' or 'order'
  const sortOrder = c.req.query('sortOrder') || 'desc'; // 'asc' or 'desc'
  
  try {
    // Get all dispatches with product info
    const dispatches = await env.DB.prepare(`
      SELECT 
        dr.*,
        i.model_name,
        td.tracking_id
      FROM dispatch_records dr
      LEFT JOIN inventory i ON i.device_serial_no LIKE '%' || dr.device_serial_no || '%'
      LEFT JOIN tracking_details td ON dr.order_id = td.order_id
      ORDER BY dr.order_id, dr.dispatch_date DESC
    `).all();
    
    const allDispatches = dispatches.results || [];
    
    // Group by order_id
    const grouped = {};
    
    allDispatches.forEach(dispatch => {
      const orderId = dispatch.order_id || 'No Order ID';
      
      if (!grouped[orderId]) {
        grouped[orderId] = {
          order_id: orderId,
          dispatch_date: dispatch.dispatch_date,
          customer_name: dispatch.customer_name,
          customer_code: dispatch.customer_code,
          customer_contact: dispatch.customer_contact,
          customer_city: dispatch.customer_city,
          courier_name: dispatch.courier_name,
          tracking_number: dispatch.tracking_number,
          tracking_id: dispatch.tracking_id || 'N/A',
          dispatched_by: dispatch.dispatched_by,
          items: [],
          total_items: 0,
          dispatch_status: 'Pending' // Default status
        };
      }
      
      // Add item to order
      grouped[orderId].items.push({
        serial_number: dispatch.serial_number,
        dispatch_date: dispatch.dispatch_date,
        device_serial_no: dispatch.device_serial_no,
        model_name: dispatch.model_name,
        notes: dispatch.notes
      });
      
      grouped[orderId].total_items++;
    });
    
    // Calculate dispatch status by comparing with order items
    for (const orderId in grouped) {
      if (orderId === 'No Order ID') {
        grouped[orderId].dispatch_status = 'Pending';
        continue;
      }
      
      try {
        // Get order items to check if all dispatched
        const orderResult = await env.DB.prepare(`
          SELECT total_items FROM orders WHERE order_id = ?
        `).bind(orderId).first();
        
        if (orderResult && orderResult.total_items) {
          // Compare dispatched items with order total
          if (grouped[orderId].total_items >= orderResult.total_items) {
            grouped[orderId].dispatch_status = 'Completed';
          } else {
            grouped[orderId].dispatch_status = 'Pending';
          }
        } else {
          // If no order found, mark as Completed (standalone dispatch)
          grouped[orderId].dispatch_status = 'Completed';
        }
      } catch (error) {
        console.error('Error checking order status:', error);
        grouped[orderId].dispatch_status = 'Pending';
      }
    }
    
    // Convert to array and sort
    let ordersArray = Object.values(grouped);
    
    if (sortBy === 'date') {
      ordersArray.sort((a, b) => {
        const dateA = new Date(a.dispatch_date || '1900-01-01');
        const dateB = new Date(b.dispatch_date || '1900-01-01');
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      });
    } else if (sortBy === 'order') {
      ordersArray.sort((a, b) => {
        const orderA = String(a.order_id || '').toLowerCase();
        const orderB = String(b.order_id || '').toLowerCase();
        if (sortOrder === 'desc') {
          return orderB.localeCompare(orderA);
        } else {
          return orderA.localeCompare(orderB);
        }
      });
    }
    
    return c.json({ 
      success: true, 
      data: ordersArray,
      total_orders: ordersArray.length,
      total_items: allDispatches.length
    });
  } catch (error) {
    console.error('Error fetching grouped dispatches:', error);
    return c.json({ success: false, error: 'Failed to fetch dispatches' }, 500);
  }
});

// Submit quality check
app.post('/api/inventory/quality-check', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { device_serial_no, check_date, checked_by, test_results, pass_fail, notes } = body;
    
    // Find device using LIKE for partial serial number match
    const device = await env.DB.prepare(`
      SELECT id, status, device_serial_no as full_serial_no FROM inventory 
      WHERE device_serial_no LIKE ?
    `).bind(`%${device_serial_no}%`).first();
    
    if (!device) {
      return c.json({ success: false, error: 'Device not found' }, 404);
    }
    
    // Insert QC record
    await env.DB.prepare(`
      INSERT INTO quality_check (
        inventory_id, device_serial_no, check_date, checked_by,
        test_results, pass_fail, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      device.id, device_serial_no, check_date, checked_by,
      test_results, pass_fail, notes
    ).run();
    
    // Update status based on pass/fail
    const newStatus = pass_fail === 'Fail' ? 'Defective' : 'In Stock';
    
    if (device.status !== newStatus) {
      await env.DB.prepare(`
        UPDATE inventory SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(newStatus, device.id).run();
      
      // Add to history
      await env.DB.prepare(`
        INSERT INTO inventory_status_history (
          inventory_id, device_serial_no, old_status, new_status,
          changed_by, change_reason
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(device.id, device_serial_no, device.status, newStatus, checked_by, `QC ${pass_fail}`).run();
    }
    
    return c.json({ success: true, message: 'Quality check submitted successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to submit quality check' }, 500);
  }
});

// Manual QC Entry - Does NOT require device to exist in inventory
app.post('/api/inventory/quality-check-manual', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { 
      device_serial_no, check_date, checked_by, device_type,
      camera_quality, sd_connectivity, all_ch_status, network_connectivity,
      gps_qc, sim_card_slot, online_qc, monitor_qc_status, final_qc_status,
      ip_address, update_status
    } = body;
    
    // Validate required fields
    if (!device_serial_no || !check_date || !device_type || !final_qc_status) {
      return c.json({ 
        success: false, 
        error: 'Missing required fields: Serial Number, QC Date, Device Type, and Final QC Status are required' 
      }, 400);
    }
    
    // Try to find device (optional - don't fail if not found)
    const device = await env.DB.prepare(`
      SELECT id, status, device_serial_no as full_serial_no FROM inventory 
      WHERE device_serial_no LIKE ?
    `).bind(`%${device_serial_no}%`).first();
    
    // Create comprehensive test results JSON
    const testResults = {
      device_type: device_type,
      camera_quality: camera_quality || 'QC Not Applicable',
      sd_connectivity: sd_connectivity || 'QC Not Applicable',
      all_ch_status: all_ch_status || 'QC Not Applicable',
      network_connectivity: network_connectivity || 'QC Not Applicable',
      gps_qc: gps_qc || 'QC Not Applicable',
      sim_card_slot: sim_card_slot || 'QC Not Applicable',
      online_qc: online_qc || 'QC Not Applicable',
      monitor_qc_status: monitor_qc_status || 'QC Not Applicable',
      final_qc_status: final_qc_status,
      ip_address: ip_address || '',
      update_status: update_status || ''
    };
    
    // Insert QC record (with inventory_id = device.id or NULL if device not found)
    await env.DB.prepare(`
      INSERT INTO quality_check (
        inventory_id, device_serial_no, check_date, checked_by,
        test_results, pass_fail, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      device ? device.id : null,
      device_serial_no,
      check_date,
      checked_by,
      JSON.stringify(testResults),
      final_qc_status,
      `Manual QC Entry - Device Type: ${device_type}`
    ).run();
    
    // Update inventory status if device was found
    if (device) {
      const newStatus = final_qc_status === 'QC Fail' ? 'Defective' : 'In Stock';
      
      if (device.status !== newStatus) {
        await env.DB.prepare(`
          UPDATE inventory SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(newStatus, device.id).run();
        
        // Add to history
        await env.DB.prepare(`
          INSERT INTO inventory_status_history (
            inventory_id, device_serial_no, old_status, new_status,
            changed_by, change_reason
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).bind(device.id, device_serial_no, device.status, newStatus, checked_by, `Manual QC ${final_qc_status}`).run();
      }
    }
    
    const message = device 
      ? `✅ QC report saved and device status updated to ${final_qc_status === 'QC Fail' ? 'Defective' : 'In Stock'}`
      : `✅ QC report saved (device not found in inventory - record created without inventory link)`;
    
    return c.json({ 
      success: true, 
      message: message,
      device_found: !!device
    });
  } catch (error) {
    console.error('Manual QC submission error:', error);
    return c.json({ success: false, error: 'Failed to save QC report: ' + error.message }, 500);
  }
});

// Get quality check records
app.get('/api/inventory/quality-checks', async (c) => {
  const { env } = c;
  
  try {
    const qcRecords = await env.DB.prepare(`
      SELECT 
        qc.*,
        i.model_name,
        i.device_serial_no as full_serial_no
      FROM quality_check qc
      LEFT JOIN inventory i ON i.device_serial_no LIKE '%' || qc.device_serial_no || '%'
      ORDER BY qc.serial_number ASC
    `).all();
    
    return c.json({ success: true, data: qcRecords.results || [] });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch QC records' }, 500);
  }
});

// Delete QC record
app.delete('/api/inventory/quality-check/:id', async (c) => {
  const { env } = c;
  const qcId = c.req.param('id');
  
  try {
    // Check if QC record exists
    const qcRecord = await env.DB.prepare(`
      SELECT * FROM quality_check WHERE id = ?
    `).bind(qcId).first();
    
    if (!qcRecord) {
      return c.json({ success: false, error: 'QC record not found' }, 404);
    }
    
    // Delete the QC record
    await env.DB.prepare(`
      DELETE FROM quality_check WHERE id = ?
    `).bind(qcId).run();
    
    return c.json({ success: true, message: 'QC record deleted successfully' });
  } catch (error) {
    console.error('Error deleting QC record:', error);
    return c.json({ success: false, error: 'Failed to delete QC record: ' + error.message }, 500);
  }
});

// Upload QC Excel - match devices and create QC records with all parameters
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
    let qcCreated = 0;
    const notFoundDevices = [];
    
    for (const item of items) {
      try {
        const serialNo = item['Device Serial Number'] || item['Device Serial_No'] || item.device_serial_no || item['Serial Number'];
        if (!serialNo) {
          notFound++;
          continue;
        }
        
        // Find device in inventory
        const device = await env.DB.prepare(`
          SELECT id, status, model_name FROM inventory WHERE device_serial_no = ?
        `).bind(serialNo).first();
        
        if (device) {
          matched++;
          
          // Extract QC info from sheet - flexible column mapping
          const qcDate = item['QC Date'] || item['Check Date'] || item.qc_date || new Date().toISOString().split('T')[0];
          const checkedBy = item['Checked By'] || item['QC Done By'] || item.checked_by || 'Excel Upload';
          
          // Extract all QC parameter columns
          const sdConnect = item['SD Connect'] || item['SD Card'] || item.sd_connect || '';
          const allChStatus = item['All Ch Status'] || item['Channel Status'] || item.all_ch_status || '';
          const network = item['Network'] || item.network || '';
          const gps = item['GPS'] || item.gps || '';
          const simSlot = item['SIM Slot'] || item['Sim Slot'] || item.sim_slot || '';
          const online = item['Online'] || item.online || '';
          const cameraQuality = item['Camera Quality'] || item.camera_quality || '';
          const monitor = item['Monitor'] || item.monitor || '';
          const finalStatus = item['Final Status'] || item['QC Status'] || item.final_status || item['Pass/Fail'] || '';
          const ipAddress = item['IP Address'] || item.ip_address || '';
          const notes = item['Notes'] || item['Remarks'] || item.notes || '';
          
          // Determine pass_fail from final_status
          let passFail = finalStatus.toLowerCase().includes('pass') ? 'Pass' : 
                        finalStatus.toLowerCase().includes('fail') ? 'Fail' : 'Pass';
          
          // Build test results summary
          const testResults = [
            sdConnect ? `SD Connect: ${sdConnect}` : '',
            allChStatus ? `All Ch: ${allChStatus}` : '',
            network ? `Network: ${network}` : '',
            gps ? `GPS: ${gps}` : '',
            simSlot ? `SIM: ${simSlot}` : '',
            online ? `Online: ${online}` : '',
            cameraQuality ? `Camera: ${cameraQuality}` : '',
            monitor ? `Monitor: ${monitor}` : '',
            ipAddress ? `IP: ${ipAddress}` : ''
          ].filter(Boolean).join(', ');
          
          // Insert QC record with all details
          await env.DB.prepare(`
            INSERT INTO quality_check (
              inventory_id, device_serial_no, check_date, checked_by,
              test_results, pass_fail, notes,
              sd_connect, all_ch_status, network, gps, sim_slot,
              online, camera_quality, monitor, final_status, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            device.id, serialNo, qcDate, checkedBy,
            testResults, passFail, notes,
            sdConnect, allChStatus, network, gps, simSlot,
            online, cameraQuality, monitor, finalStatus, ipAddress
          ).run();
          qcCreated++;
          
          // Update inventory status based on QC result
          const newStatus = passFail === 'Fail' ? 'Defective' : 'In Stock';
          
          if (device.status !== newStatus) {
            await env.DB.prepare(`
              UPDATE inventory SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).bind(newStatus, device.id).run();
            
            // Add to history
            await env.DB.prepare(`
              INSERT INTO inventory_status_history (
                inventory_id, device_serial_no, old_status, new_status,
                changed_by, change_reason
              ) VALUES (?, ?, ?, ?, ?, ?)
            `).bind(device.id, serialNo, device.status, newStatus, checkedBy, `QC ${passFail} - Excel Upload`).run();
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
      message: `QC upload complete. Matched: ${matched}, Created: ${qcCreated}, Not Found: ${notFound}`,
      data: {
        matched,
        qcCreated,
        notFound,
        notFoundDevices: notFoundDevices.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('QC upload error:', error);
    return c.json({ success: false, error: 'Failed to upload QC data: ' + error.message }, 500);
  }
});

// ============================================
// TRACKING DETAILS API ENDPOINTS
// ============================================

// Add tracking details
app.post('/api/tracking-details', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { order_id, courier_partner, courier_mode, tracking_id } = body;
    
    if (!order_id || !courier_partner || !courier_mode || !tracking_id) {
      return c.json({ success: false, error: 'All fields are required' }, 400);
    }
    
    // Check if order_id exists in sales table (optional - for pricing)
    const sale = await env.DB.prepare(`
      SELECT order_id, courier_cost, total_amount FROM sales WHERE order_id = ?
    `).bind(order_id).first();
    
    // Calculate weight from dispatch_records count for this order_id
    const dispatchCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM dispatch_records WHERE order_id = ?
    `).bind(order_id).first();
    
    const weight = dispatchCount ? dispatchCount.count : 0;
    
    // Insert tracking details with auto-calculated weight
    await env.DB.prepare(`
      INSERT INTO tracking_details (
        order_id, courier_partner, courier_mode, tracking_id, weight
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(order_id, courier_partner, courier_mode, tracking_id, weight).run();
    
    return c.json({ 
      success: true, 
      message: 'Tracking details added successfully',
      data: {
        order_id,
        courier_partner,
        courier_mode,
        tracking_id,
        weight,
        actual_price: sale ? (sale.courier_cost || sale.total_amount || 0) : 0
      }
    });
  } catch (error) {
    console.error('Add tracking error:', error);
    return c.json({ success: false, error: 'Failed to add tracking details: ' + error.message }, 500);
  }
});

// Get all tracking details with sales data and recalculate weight
app.get('/api/tracking-details', async (c) => {
  const { env } = c;
  
  try {
    const trackingRecords = await env.DB.prepare(`
      SELECT 
        t.*,
        s.courier_cost,
        s.total_amount,
        (SELECT COUNT(*) FROM dispatch_records WHERE order_id = t.order_id) as calculated_weight
      FROM tracking_details t
      LEFT JOIN sales s ON t.order_id = s.order_id
      ORDER BY t.created_at DESC
    `).all();
    
    // Replace weight with calculated_weight
    const results = (trackingRecords.results || []).map(record => ({
      ...record,
      weight: record.calculated_weight || 0
    }));
    
    return c.json({ success: true, data: results });
  } catch (error) {
    console.error('Get tracking error:', error);
    return c.json({ success: false, error: 'Failed to fetch tracking details' }, 500);
  }
});

// Get tracking details by order ID with sales data
app.get('/api/tracking-details/:orderId', async (c) => {
  const { env } = c;
  const orderId = c.req.param('orderId');
  
  try {
    const tracking = await env.DB.prepare(`
      SELECT 
        t.*,
        s.courier_cost,
        s.total_amount
      FROM tracking_details t
      LEFT JOIN sales s ON t.order_id = s.order_id
      WHERE t.order_id = ?
      ORDER BY t.created_at DESC
      LIMIT 1
    `).bind(orderId).first();
    
    if (!tracking) {
      return c.json({ success: false, error: 'Tracking details not found for this order' }, 404);
    }
    
    return c.json({ success: true, data: tracking });
  } catch (error) {
    console.error('Get tracking by order error:', error);
    return c.json({ success: false, error: 'Failed to fetch tracking details' }, 500);
  }
});

// Update tracking details
app.put('/api/tracking-details/:id', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  
  try {
    const body = await c.req.json();
    const { courier_partner, courier_mode, tracking_id } = body;
    
    await env.DB.prepare(`
      UPDATE tracking_details 
      SET courier_partner = ?, courier_mode = ?, tracking_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(courier_partner, courier_mode, tracking_id, id).run();
    
    return c.json({ success: true, message: 'Tracking details updated successfully' });
  } catch (error) {
    console.error('Update tracking error:', error);
    return c.json({ success: false, error: 'Failed to update tracking details' }, 500);
  }
});

// Delete tracking details
app.delete('/api/tracking-details/:id', async (c) => {
  const { env } = c;
  const id = c.req.param('id');
  
  try {
    await env.DB.prepare(`
      DELETE FROM tracking_details WHERE id = ?
    `).bind(id).run();
    
    return c.json({ success: true, message: 'Tracking details deleted successfully' });
  } catch (error) {
    console.error('Delete tracking error:', error);
    return c.json({ success: false, error: 'Failed to delete tracking details' }, 500);
  }
});

// Upload dispatch Excel - match devices and create dispatch records
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
    let dispatchCreated = 0;
    const notFoundDevices = [];
    
    for (const item of items) {
      try {
        const serialNo = item['Device Serial Number'] || item.device_serial_no || item['Device Serial_No'];
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
          
          // Extract dispatch info from sheet
          const dispatchDate = item['Dispatch Date'] || item.dispatch_date || new Date().toISOString().split('T')[0];
          const customerName = item['Customer Name'] || item.customer_name || '';
          const custCode = item['Cust Code'] || item.cust_code || '';
          const companyName = item['Company Name'] || item.company_name || '';
          const dispatchReason = item['Dispatch Reason'] || item.dispatch_reason || '';
          const courierCompany = item['Courier Company'] || item.courier_company || '';
          const trackingId = item['Tracking ID'] || item.tracking_id || '';
          const orderId = item['Order Id'] || item.order_id || '';
          
          // Insert dispatch record
          await env.DB.prepare(`
            INSERT INTO dispatch_records (
              inventory_id, device_serial_no, dispatch_date, customer_name,
              customer_code, dispatch_reason, courier_name, tracking_number,
              dispatched_by, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            device.id, serialNo, dispatchDate, customerName,
            custCode, dispatchReason, courierCompany, trackingId,
            'Excel Upload', companyName
          ).run();
          dispatchCreated++;
          
          // Update inventory with dispatch info
          await env.DB.prepare(`
            UPDATE inventory SET
              status = 'Dispatched',
              dispatch_date = ?,
              customer_name = ?,
              cust_code = ?,
              dispatch_reason = ?,
              order_id = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            dispatchDate, customerName, custCode, dispatchReason, orderId, device.id
          ).run();
          
          // Add to history
          await env.DB.prepare(`
            INSERT INTO inventory_status_history (
              inventory_id, device_serial_no, old_status, new_status,
              changed_by, change_reason
            ) VALUES (?, ?, ?, 'Dispatched', ?, ?)
          `).bind(device.id, serialNo, device.status, 'Dispatch Excel Upload', dispatchReason).run();
          
        } else {
          notFound++;
          notFoundDevices.push(serialNo);
        }
      } catch (err) {
        notFound++;
        console.error('Error processing dispatch item:', err);
      }
    }
    
    // Check if inventory is empty
    const inventoryCount = await env.DB.prepare(`SELECT COUNT(*) as count FROM inventory`).first();
    const isEmpty = inventoryCount.count === 0;
    
    return c.json({ 
      success: matched > 0 || isEmpty, 
      message: isEmpty 
        ? `⚠️ Inventory database is empty! Please upload inventory Excel first, then upload dispatch Excel.`
        : `Processed ${items.length} dispatch items: ${matched} matched, ${dispatchCreated} dispatches created, ${notFound} not found`,
      stats: { matched, dispatchCreated, notFound, inventoryCount: inventoryCount.count },
      notFoundDevices: notFoundDevices.slice(0, 10),
      warning: isEmpty ? 'Upload inventory first' : (notFound > 0 ? `${notFound} devices not found in inventory` : null)
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to upload dispatch data' }, 500);
  }
});

// Get inventory statistics
app.get('/api/inventory/stats', async (c) => {
  const { env } = c;
  
  try {
    const stats = await env.DB.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM inventory
      GROUP BY status
    `).all();
    
    const total = await env.DB.prepare(`SELECT COUNT(*) as total FROM inventory`).first();
    
    return c.json({ 
      success: true, 
      data: {
        total: total?.total || 0,
        byStatus: stats.results || []
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch statistics' }, 500);
  }
});

// Get activity history
app.get('/api/inventory/activity', async (c) => {
  const { env } = c;
  
  try {
    const activity = await env.DB.prepare(`
      SELECT * FROM inventory_status_history 
      ORDER BY changed_at DESC 
      LIMIT 100
    `).all();
    
    return c.json({ success: true, data: activity.results || [] });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch activity' }, 500);
  }
});

// Get QC Pass/Fail statistics from quality_check table
app.get('/api/quality-check/stats', async (c) => {
  const { env } = c;
  
  try {
    const qcStats = await env.DB.prepare(`
      SELECT 
        pass_fail,
        COUNT(*) as count
      FROM quality_check
      WHERE pass_fail IN ('QC Pass', 'Pass', 'QC Fail', 'Fail')
      GROUP BY pass_fail
    `).all();
    
    let qc_pass = 0;
    let qc_fail = 0;
    
    (qcStats.results || []).forEach(stat => {
      if (stat.pass_fail === 'QC Pass' || stat.pass_fail === 'Pass') {
        qc_pass += stat.count;
      } else if (stat.pass_fail === 'QC Fail' || stat.pass_fail === 'Fail') {
        qc_fail += stat.count;
      }
    });
    
    return c.json({ success: true, qc_pass, qc_fail });
  } catch (error) {
    console.error('QC stats error:', error);
    return c.json({ success: false, error: 'Failed to fetch QC statistics' }, 500);
  }
});

// Get model-wise inventory report (category-based)
app.get('/api/inventory/model-wise', async (c) => {
  const { env } = c;
  
  try {
    // Get all inventory data
    const allDevices = await env.DB.prepare(`
      SELECT 
        model_name,
        status,
        COUNT(*) as count
      FROM inventory
      GROUP BY model_name, status
    `).all();
    
    const devices = allDevices.results || [];
    
    // Get all QC data including Pending
    const allQCData = await env.DB.prepare(`
      SELECT 
        test_results,
        pass_fail
      FROM quality_check
    `).all();
    
    const qcRecords = allQCData.results || [];
    
    // Process QC data to count Pass/Fail/Pending by model
    const qcCounts = {};
    qcRecords.forEach(record => {
      try {
        const testResults = JSON.parse(record.test_results);
        const deviceType = testResults.device_type;
        
        if (deviceType) {
          if (!qcCounts[deviceType]) {
            qcCounts[deviceType] = { pass: 0, fail: 0, pending: 0 };
          }
          
          if (record.pass_fail === 'QC Pass' || record.pass_fail === 'Pass') {
            qcCounts[deviceType].pass += 1;
          } else if (record.pass_fail === 'QC Fail' || record.pass_fail === 'Fail') {
            qcCounts[deviceType].fail += 1;
          } else if (record.pass_fail === 'Pending' || record.pass_fail === 'QC Pending') {
            qcCounts[deviceType].pending += 1;
          }
        }
      } catch (e) {
        // Skip malformed JSON
      }
    });
    
    // Category mapping function
    const getCategory = (modelName) => {
      const name = modelName.toLowerCase();
      
      // Check for specific patterns - ORDER MATTERS!
      // Check dashcam FIRST before camera (dashcam contains "camera" word)
      // Also handle typo: "dahscam" (without 's')
      if (name.includes('dashcam') || name.includes('dash cam') || name.includes('dahscam')) {
        return 'Dashcam';
      }
      
      // Check MDVR BEFORE camera (some MDVRs have "camera" in name like "MDVR IP Camera")
      if (name.includes('mdvr') && !name.includes('cable') && !name.includes('box') && !name.includes('remote') && !name.includes('panic') && !name.includes('server') && !name.includes('maintenance') && !name.includes('adaptor') && !name.includes('sensor') && !name.includes('alcohol') && !name.includes('vga')) {
        return 'MDVR';
      }
      
      // Check camera LAST (after dashcam and MDVR are excluded)
      if (name.includes('camera') || name.includes('ptz')) {
        return 'Cameras';
      }
      
      if (name.includes('monitor')) {
        return 'Monitor & Monitor Kit';
      }
      if (name.includes('rfid') && (name.includes('reader') || name.includes('smart'))) {
        return 'RFID Reader';
      }
      if (name.includes('rfid') && (name.includes('tag') || name.includes('ear'))) {
        return 'RFID Tags';
      }
      if (name.includes('sd card') || name.includes('hdd 1 tb') || name.includes('storage')) {
        return 'Storage';
      }
      if (name.includes('gps') && (name.includes('tracker') || name.includes('vehicle'))) {
        return 'GPS';
      }
      if (name.includes('cable') || name.includes('box') || name.includes('remote') || name.includes('panic') || name.includes('server') || name.includes('maintenance') || name.includes('adaptor') || name.includes('sensor') || name.includes('alcohol') || name.includes('vga') || name.includes('communication')) {
        return 'MDVR Accessories';
      }
      
      return 'Other product';
    };
    
    // Helper function to find matching QC counts for a model
    const getQCCountsForModel = (modelName) => {
      // Try exact match first
      if (qcCounts[modelName]) {
        return qcCounts[modelName];
      }
      
      // Try fuzzy match - find QC device type that closely matches model name
      const modelLower = modelName.toLowerCase();
      for (const [qcDeviceType, counts] of Object.entries(qcCounts)) {
        const qcLower = qcDeviceType.toLowerCase();
        
        // Extract key model identifiers (e.g., "MR9704E", "MT95L")
        const modelMatch = modelName.match(/\(([^)]+)\)/);
        const qcMatch = qcDeviceType.match(/\(([^)]+)\)/);
        
        // If both have model codes in parentheses and they match
        if (modelMatch && qcMatch && modelMatch[1] === qcMatch[1]) {
          return counts;
        }
        
        // Fallback: check if QC device type contains key parts of model name
        if (qcLower.includes(modelLower.slice(0, 20)) || modelLower.includes(qcLower.slice(0, 20))) {
          return counts;
        }
      }
      
      return { pass: 0, fail: 0, pending: 0 };
    };
    
    // Group by category and model
    const categoryData = {};
    
    devices.forEach(device => {
      const category = getCategory(device.model_name);
      
      if (!categoryData[category]) {
        categoryData[category] = {
          category,
          in_stock: 0,
          dispatched: 0,
          qc_pass: 0,
          qc_fail: 0,
          qc_pending: 0,
          total: 0,
          models: {}
        };
      }
      
      // Add to category totals
      const count = device.count;
      categoryData[category].total += count;
      
      if (device.status === 'In Stock') categoryData[category].in_stock += count;
      else if (device.status === 'Dispatched') categoryData[category].dispatched += count;
      
      // Use lowercase key for grouping to handle case variations
      // But preserve the original model_name for display (use first occurrence)
      const modelKey = device.model_name.toLowerCase();
      
      // Track individual models
      if (!categoryData[category].models[modelKey]) {
        categoryData[category].models[modelKey] = {
          model_name: device.model_name, // Use first occurrence as display name
          in_stock: 0,
          dispatched: 0,
          qc_pass: 0,
          qc_fail: 0,
          qc_pending: 0,
          total: 0
        };
      }
      
      categoryData[category].models[modelKey].total += count;
      if (device.status === 'In Stock') categoryData[category].models[modelKey].in_stock += count;
      else if (device.status === 'Dispatched') categoryData[category].models[modelKey].dispatched += count;
    });
    
    // Now add QC counts to each model
    Object.values(categoryData).forEach(category => {
      Object.values(category.models).forEach(model => {
        const qcData = getQCCountsForModel(model.model_name);
        model.qc_pass = qcData.pass;
        model.qc_fail = qcData.fail;
        model.qc_pending = qcData.pending;
        
        // Add to category totals
        category.qc_pass += qcData.pass;
        category.qc_fail += qcData.fail;
        category.qc_pending += qcData.pending;
      });
    });
    
    // Convert to array and sort by category name (ascending, case-insensitive)
    const result = Object.values(categoryData).map(cat => ({
      ...cat,
      // Sort models by in_stock ascending (lowest first), then by name if stock is equal
      models: Object.values(cat.models).sort((a, b) => {
        if (a.in_stock !== b.in_stock) {
          return a.in_stock - b.in_stock; // Lowest stock first
        }
        return a.model_name.toLowerCase().localeCompare(b.model_name.toLowerCase()); // Then alphabetically
      })
    })).sort((a, b) => a.category.toLowerCase().localeCompare(b.category.toLowerCase()));
    
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Model-wise report error:', error);
    return c.json({ success: false, error: 'Failed to fetch model-wise report' }, 500);
  }
});

// Get dispatch summary report (from sales table)
app.get('/api/dispatch/summary', async (c) => {
  const { env } = c;
  
  try {
    // Get all sales/orders with their items and dispatch counts
    const salesQuery = await env.DB.prepare(`
      SELECT 
        s.order_id,
        s.customer_name,
        s.company_name,
        s.sale_date as order_date,
        COUNT(DISTINCT si.id) as total_items
      FROM sales s
      LEFT JOIN sale_items si ON s.order_id = si.order_id
      GROUP BY s.order_id
    `).all();
    
    const salesList = salesQuery.results || [];
    
    // For each sale, get dispatch count
    const ordersWithDispatch = [];
    
    for (const sale of salesList) {
      const dispatchQuery = await env.DB.prepare(`
        SELECT 
          COUNT(*) as dispatched_items,
          MAX(dispatch_date) as last_dispatch_date
        FROM dispatch_records
        WHERE order_id = ?
      `).bind(sale.order_id).first();
      
      const dispatchedItems = dispatchQuery?.dispatched_items || 0;
      const remaining = sale.total_items - dispatchedItems;
      const dispatchStatus = remaining <= 0 ? 'Completed' : 'Pending';
      
      ordersWithDispatch.push({
        order_id: sale.order_id,
        customer_name: sale.customer_name,
        company_name: sale.company_name,
        order_date: sale.order_date,
        total_items: sale.total_items,
        dispatched_items: dispatchedItems,
        dispatch_status: dispatchStatus,
        last_dispatch_date: dispatchQuery?.last_dispatch_date
      });
    }
    
    // Calculate statistics
    const totalOrders = ordersWithDispatch.length;
    const totalDispatched = ordersWithDispatch.reduce((sum, o) => sum + (o.dispatched_items || 0), 0);
    const completedOrders = ordersWithDispatch.filter(o => o.dispatch_status === 'Completed').length;
    const pendingOrders = ordersWithDispatch.filter(o => o.dispatch_status === 'Pending').length;
    
    // Sort by order date descending
    ordersWithDispatch.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
    
    return c.json({ 
      success: true, 
      data: {
        totalOrders,
        totalDispatched,
        completedOrders,
        pendingOrders,
        orders: ordersWithDispatch
      }
    });
  } catch (error) {
    console.error('Dispatch summary error:', error);
    return c.json({ success: false, error: 'Failed to fetch dispatch summary' }, 500);
  }
});

// Get renewal tracking data - customer-wise renewal status for 4G devices
app.get('/api/renewals', async (c) => {
  const { env } = c;
  
  try {
    // Get all dispatched 4G MDVRs and Dashcams
    const devices = await env.DB.prepare(`
      SELECT 
        device_serial_no,
        model_name,
        customer_name,
        cust_code,
        order_id,
        dispatch_date,
        status
      FROM inventory 
      WHERE status = 'Dispatched'
        AND dispatch_date IS NOT NULL
        AND (
          model_name LIKE '%4G%MDVR%' OR 
          model_name LIKE '%4g%mdvr%' OR
          model_name LIKE '%4G%Dashcam%' OR
          model_name LIKE '%4g%dashcam%'
        )
      ORDER BY customer_name, dispatch_date
    `).all();

    if (!devices.results || devices.results.length === 0) {
      return c.json({ success: true, data: [] });
    }

    // Calculate renewal periods for each device
    const today = new Date();
    const deviceList = devices.results;
    
    // Group by customer
    const customerMap = new Map();
    
    deviceList.forEach(device => {
      const custCode = device.cust_code || 'Unknown';
      const customerName = device.customer_name || 'Unknown Customer';
      
      if (!customerMap.has(custCode)) {
        customerMap.set(custCode, {
          cust_code: custCode,
          customer_name: customerName,
          cmr: [],
          c1: [],
          c2: [],
          c3: [],
          total: 0
        });
      }
      
      const customer = customerMap.get(custCode);
      
      // Calculate CMR date (dispatch_date + 12 months)
      const dispatchDate = new Date(device.dispatch_date);
      const cmrDate = new Date(dispatchDate);
      cmrDate.setMonth(cmrDate.getMonth() + 12);
      
      // Calculate difference in months from CMR date to today
      const monthsDiff = (cmrDate.getFullYear() - today.getFullYear()) * 12 + 
                        (cmrDate.getMonth() - today.getMonth());
      
      // Categorize device based on renewal period
      const deviceData = {
        device_serial_no: device.device_serial_no,
        model_name: device.model_name,
        dispatch_date: device.dispatch_date,
        cmr_date: cmrDate.toISOString().split('T')[0],
        order_id: device.order_id
      };
      
      // CMR: Due now or overdue (0 months or less)
      if (monthsDiff <= 0) {
        customer.cmr.push(deviceData);
      }
      // C+1: Due in 1 month (between 0 and 1 month)
      else if (monthsDiff <= 1) {
        customer.c1.push(deviceData);
      }
      // C+2: Due in 2 months (between 1 and 2 months)
      else if (monthsDiff <= 2) {
        customer.c2.push(deviceData);
      }
      // C+3: Due in 3 months (between 2 and 3 months)
      else if (monthsDiff <= 3) {
        customer.c3.push(deviceData);
      }
      
      customer.total++;
    });
    
    // Convert map to array and sort by total devices (descending)
    const customerList = Array.from(customerMap.values())
      .sort((a, b) => b.total - a.total);
    
    return c.json({ success: true, data: customerList });
  } catch (error) {
    console.error('Renewals error:', error);
    return c.json({ success: false, error: 'Failed to fetch renewal data: ' + error.message }, 500);
  }
});

// Get single device by serial number (for barcode scanning) - MUST BE LAST
// Search inventory by serial number (MUST come before /:serialNo route)
app.get('/api/inventory/search', async (c) => {
  const { env } = c;
  
  try {
    const serial = c.req.query('serial');
    
    if (!serial) {
      return c.json({ success: false, error: 'Serial number required' }, 400);
    }
    
    const devices = await env.DB.prepare(`
      SELECT * FROM inventory WHERE device_serial_no LIKE ?
    `).bind(`%${serial}%`).all();
    
    return c.json({ success: true, data: devices.results || [] });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to search inventory' }, 500);
  }
});

// Get single device by exact serial number
app.get('/api/inventory/:serialNo', async (c) => {
  const { env } = c;
  
  try {
    const serialNo = c.req.param('serialNo');
    
    const device = await env.DB.prepare(`
      SELECT * FROM inventory WHERE device_serial_no = ?
    `).bind(serialNo).first();
    
    if (!device) {
      return c.json({ success: false, error: 'Device not found' }, 404);
    }
    
    return c.json({ success: true, data: device });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch device' }, 500);
  }
});

// ===================================================================
// END OF INVENTORY MANAGEMENT API ENDPOINTS
// ===================================================================

// ===================================================================
// ORDER-BASED DISPATCH WORKFLOW API ENDPOINTS
// ===================================================================

// Get all orders for dropdown
app.get('/api/orders', async (c) => {
  const { env } = c;
  
  try {
    // Get orders from sales table with item count and dispatch count
    const orders = await env.DB.prepare(`
      SELECT 
        s.order_id,
        s.customer_name,
        s.company_name,
        s.sale_date as order_date,
        COUNT(DISTINCT si.id) as total_items,
        COUNT(DISTINCT dr.id) as dispatched_items,
        CASE 
          WHEN COUNT(DISTINCT dr.id) >= COUNT(DISTINCT si.id) THEN 'Complete'
          WHEN COUNT(DISTINCT dr.id) > 0 THEN 'Partial'
          ELSE 'Pending'
        END as dispatch_status
      FROM sales s
      LEFT JOIN sale_items si ON s.order_id = si.order_id
      LEFT JOIN dispatch_records dr ON dr.order_id = s.order_id
      GROUP BY s.order_id, s.customer_name, s.company_name, s.sale_date
      ORDER BY s.order_id DESC
    `).all();
    
    return c.json({ success: true, data: orders.results || [] });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return c.json({ success: false, error: 'Failed to fetch orders' }, 500);
  }
});

// Get order details with products
app.get('/api/orders/:orderId', async (c) => {
  const { env } = c;
  const orderId = c.req.param('orderId');
  
  try {
    // Get order header from sales table
    const order = await env.DB.prepare(`
      SELECT 
        order_id,
        customer_name,
        company_name,
        customer_code,
        customer_contact,
        sale_date as order_date,
        total_amount,
        subtotal,
        gst_amount,
        courier_cost,
        sale_type,
        employee_name
      FROM sales 
      WHERE order_id = ?
    `).bind(orderId).first();
    
    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404);
    }
    
    // Get order items (products) from sale_items table
    const items = await env.DB.prepare(`
      SELECT 
        product_name,
        quantity,
        unit_price,
        total_price
      FROM sale_items 
      WHERE order_id = ?
    `).bind(orderId).all();
    
    return c.json({ 
      success: true, 
      data: {
        order,
        items: items.results || []
      }
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    return c.json({ success: false, error: 'Failed to fetch order details' }, 500);
  }
});

// Validate device QC status and get device info
app.get('/api/devices/:serialNo/validate', async (c) => {
  const { env } = c;
  const serialNo = c.req.param('serialNo');
  
  try {
    // Get device from inventory
    const device = await env.DB.prepare(`
      SELECT id, device_serial_no, model_name, status 
      FROM inventory 
      WHERE device_serial_no = ?
    `).bind(serialNo).first();
    
    if (!device) {
      return c.json({ 
        success: false, 
        error: 'Device not found in inventory',
        errorType: 'NOT_FOUND'
      }, 404);
    }
    
    // Check if already dispatched
    if (device.status === 'Dispatched') {
      return c.json({ 
        success: false, 
        error: 'Device already dispatched',
        errorType: 'ALREADY_DISPATCHED',
        device
      }, 400);
    }
    
    // Get QC status
    const qcRecord = await env.DB.prepare(`
      SELECT pass_fail, check_date, test_results 
      FROM quality_check 
      WHERE device_serial_no = ?
      ORDER BY check_date DESC
      LIMIT 1
    `).bind(serialNo).first();
    
    // Determine QC status
    let qcStatus = 'NO_QC';
    let qcPassed = false;
    
    if (qcRecord) {
      qcStatus = qcRecord.pass_fail || 'Pending';
      qcPassed = qcStatus.toLowerCase().includes('pass');
    }
    
    return c.json({ 
      success: true, 
      data: {
        device,
        qc: qcRecord || null,
        qcStatus,
        qcPassed,
        canDispatch: qcPassed
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to validate device' }, 500);
  }
});

// Create dispatch with multiple products
app.post('/api/dispatch/create', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { 
      order_id, 
      customer_name, 
      customer_code,
      company_name,
      dispatch_date, 
      devices, // Array of { serial_no, model_name, qc_status }
      courier_name,
      dispatch_method,
      notes 
    } = body;
    
    if (!devices || devices.length === 0) {
      return c.json({ success: false, error: 'No devices provided' }, 400);
    }
    
    const dispatchResults = [];
    const errors = [];
    
    // Create dispatch record for each device
    for (const dev of devices) {
      try {
        // Find device in inventory
        const device = await env.DB.prepare(`
          SELECT id, status FROM inventory WHERE device_serial_no = ?
        `).bind(dev.serial_no).first();
        
        if (!device) {
          errors.push(`Device ${dev.serial_no} not found`);
          continue;
        }
        
        if (device.status === 'Dispatched') {
          errors.push(`Device ${dev.serial_no} already dispatched`);
          continue;
        }
        
        // Insert dispatch record
        const dispatchResult = await env.DB.prepare(`
          INSERT INTO dispatch_records (
            inventory_id, device_serial_no, order_id, dispatch_date, 
            customer_name, customer_code, company_name, dispatch_reason,
            qc_status, courier_name, dispatch_method, dispatched_by, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          device.id, dev.serial_no, order_id, dispatch_date,
          customer_name, customer_code, company_name, 'New Sale',
          dev.qc_status, courier_name || '', dispatch_method || '', 
          'System', notes || ''
        ).run();
        
        // Update inventory status
        await env.DB.prepare(`
          UPDATE inventory SET
            status = 'Dispatched',
            dispatch_date = ?,
            customer_name = ?,
            cust_code = ?,
            order_id = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(dispatch_date, customer_name, customer_code, order_id, device.id).run();
        
        // Add to status history
        await env.DB.prepare(`
          INSERT INTO inventory_status_history (
            inventory_id, device_serial_no, old_status, new_status,
            changed_by, change_reason
          ) VALUES (?, ?, ?, 'Dispatched', ?, ?)
        `).bind(device.id, dev.serial_no, device.status, 'System', `Order ${order_id}`).run();
        
        dispatchResults.push({
          serial_no: dev.serial_no,
          dispatch_id: dispatchResult.meta.last_row_id
        });
        
      } catch (err) {
        errors.push(`Error dispatching ${dev.serial_no}: ${err.message}`);
      }
    }
    
    // Update order status
    await env.DB.prepare(`
      UPDATE orders SET
        dispatch_status = 'Completed',
        updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `).bind(order_id).run();
    
    return c.json({ 
      success: true, 
      data: {
        dispatched: dispatchResults.length,
        total: devices.length,
        results: dispatchResults,
        errors: errors.length > 0 ? errors : null
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create dispatch: ' + error.message }, 500);
  }
});

// Update dispatch with docket/tracking number
app.put('/api/dispatch/:id/docket', async (c) => {
  const { env } = c;
  const dispatchId = c.req.param('id');
  
  try {
    const body = await c.req.json();
    const { tracking_number, courier_name, dispatch_method } = body;
    
    await env.DB.prepare(`
      UPDATE dispatch_records SET
        tracking_number = ?,
        courier_name = COALESCE(?, courier_name),
        dispatch_method = COALESCE(?, dispatch_method)
      WHERE id = ?
    `).bind(tracking_number, courier_name, dispatch_method, dispatchId).run();
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update docket number' }, 500);
  }
});

// Bulk update dockets for an order
app.put('/api/orders/:orderId/dockets', async (c) => {
  const { env } = c;
  const orderId = c.req.param('orderId');
  
  try {
    const body = await c.req.json();
    const { tracking_number, courier_name, dispatch_method } = body;
    
    await env.DB.prepare(`
      UPDATE dispatch_records SET
        tracking_number = ?,
        courier_name = COALESCE(?, courier_name),
        dispatch_method = COALESCE(?, dispatch_method)
      WHERE order_id = ?
    `).bind(tracking_number, courier_name, dispatch_method, orderId).run();
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update docket numbers' }, 500);
  }
});

// END OF ORDER-BASED DISPATCH WORKFLOW API ENDPOINTS
// ===================================================================

// Home page with dashboard
// Login page route - redirect to static file
app.get('/login', (c) => {
  return c.redirect('/login.html');
});


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
        <title>AxelGuard</title>
        <!-- Tailwind CSS removed to fix console errors -->
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
                display: grid;
                grid-template-columns: 1fr 1fr;
                min-height: 100vh;
                background: linear-gradient(to right, #E8E8E8 0%, #F5F5F5 50%, #FFFFFF 100%);
            }
            
            .left-side {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }
            
            .characters-container {
                position: relative;
                width: 500px;
                height: 420px;
            }
            
            .character {
                position: absolute;
                bottom: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            
            .orange-character {
                width: 200px;
                height: 150px;
                background: linear-gradient(180deg, #FF9F6E 0%, #FF8654 100%);
                border-radius: 250px 250px 0 0;
                left: 0;
                z-index: 3;
            }
            
            .orange-character::after {
                content: '';
                position: absolute;
                bottom: 50px;
                left: 50%;
                transform: translateX(-50%);
                width: 60px;
                height: 30px;
                border: 3px solid #1F2937;
                border-top: none;
                border-radius: 0 0 50px 50px;
            }
            
            .purple-character {
                width: 160px;
                height: 380px;
                background: linear-gradient(180deg, #8B5CF6 0%, #7C3AED 100%);
                border-radius: 30px;
                left: 130px;
                z-index: 1;
            }
            
            .black-character {
                width: 140px;
                height: 260px;
                background: linear-gradient(180deg, #4B5563 0%, #374151 100%);
                border-radius: 28px;
                left: 250px;
                z-index: 2;
            }
            
            .yellow-character {
                width: 100px;
                height: 240px;
                background: linear-gradient(180deg, #F4D03F 0%, #F7C815 100%);
                border-radius: 50px;
                left: 370px;
                z-index: 3;
            }
            
            .yellow-character::after {
                content: '';
                position: absolute;
                bottom: 130px;
                left: 50%;
                transform: translateX(-50%);
                width: 50px;
                height: 3px;
                background: #1F2937;
            }
            
            .eyes {
                position: absolute;
                display: flex;
                gap: 25px;
            }
            
            .orange-character .eyes { top: 40px; gap: 32px; left: 50%; transform: translateX(-50%); }
            .purple-character .eyes { top: 70px; gap: 32px; left: 50%; transform: translateX(-50%); }
            .black-character .eyes { top: 45px; gap: 28px; left: 50%; transform: translateX(-50%); }
            .yellow-character .eyes { top: 65px; gap: 26px; left: 50%; transform: translateX(-50%); }
            
            .eye {
                width: 45px;
                height: 45px;
                background: white;
                border-radius: 50%;
                position: relative;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                border: 3px solid #1F2937;
            }
            
            .orange-character .eye { width: 40px; height: 40px; }
            .black-character .eye { width: 42px; height: 42px; }
            .yellow-character .eye { width: 43px; height: 43px; }
            
            .pupil {
                width: 18px;
                height: 18px;
                background: #1f2937;
                border-radius: 50%;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                transition: transform 0.1s ease;
            }
            
            .orange-character .pupil { width: 16px; height: 16px; }
            .black-character .pupil { width: 16px; height: 16px; }
            .yellow-character .pupil { width: 17px; height: 17px; }
            
            @keyframes blink {
                0%, 90%, 100% { transform: scaleY(1); }
                95% { transform: scaleY(0.1); }
            }
            
            .eye.blink {
                animation: blink 0.3s ease-in-out;
            }
            
            .right-side {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                padding: 40px;
                padding-left: 80px;
            }
            
            .login-box {
                background: white;
                padding: 60px 54px;
                border-radius: 18px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.08);
                width: 100%;
                max-width: 504px;
            }
            
            .login-box input {
                width: 100%;
                padding: 16px 18px !important;
                font-size: 16px !important;
                border: none;
                border-bottom: 2px solid #E5E7EB;
                border-radius: 0;
                box-sizing: border-box;
                transition: all 0.2s;
                background: transparent;
            }
            
            .login-box input:focus {
                outline: none;
                border-bottom-color: #667eea;
            }
            
            .password-input-wrapper {
                position: relative;
                display: flex;
                align-items: center;
            }
            
            .password-toggle {
                position: absolute;
                right: 10px;
                cursor: pointer;
                color: #6B7280;
                font-size: 18px;
                transition: color 0.2s;
                background: none;
                border: none;
                padding: 5px;
            }
            
            .password-toggle:hover {
                color: #374151;
            }
            
            .remember-forgot {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 20px 0;
            }
            
            .remember-me {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                color: #374151;
                cursor: pointer;
            }
            
            .forgot-password {
                font-size: 14px;
                color: #667eea;
                text-decoration: none;
            }
            
            .forgot-password:hover {
                text-decoration: underline;
            }
            
            .google-login-btn {
                width: 100%;
                padding: 12px;
                margin-top: 16px;
                background: white;
                border: 2px solid #E5E7EB;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                color: #374151;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }
            
            .google-login-btn:hover {
                background: #F9FAFB;
                border-color: #D1D5DB;
            }
            
            .signup-link {
                text-align: center;
                margin-top: 24px;
                font-size: 14px;
                color: #6B7280;
            }
            
            .signup-link a {
                color: #667eea;
                text-decoration: none;
                font-weight: 600;
            }
            
            .signup-link a:hover {
                text-decoration: underline;
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
            
            .alert-success {
                background: #d1fae5;
                border: 1px solid #10b981;
                color: #065f46;
                padding: 15px;
                border-radius: 8px;
                margin-top: 15px;
            }
            
            .alert-error {
                background: #fee2e2;
                border: 1px solid #ef4444;
                color: #991b1b;
                padding: 15px;
                border-radius: 8px;
                margin-top: 15px;
            }
            
            .alert-warning {
                background: #fef3c7;
                border: 1px solid #f59e0b;
                color: #92400e;
                padding: 15px;
                border-radius: 8px;
                margin-top: 15px;
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
            
            /* Create Dispatch Modal Styles */
            .modal {
                display: none;
                position: fixed;
                z-index: 10000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: auto;
                background-color: rgba(0, 0, 0, 0.7);
                animation: fadeIn 0.3s;
            }
            
            .modal.show {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .modal-content {
                background-color: white;
                padding: 30px;
                border-radius: 12px;
                width: 100%;
                max-width: 1000px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                animation: slideIn 0.3s;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes slideIn {
                from { transform: translateY(-50px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            
            /* Dropdown Menu Styles */
            .dropdown {
                position: relative;
                display: inline-block;
            }
            
            .dropdown-content {
                display: none;
                position: absolute;
                top: 100%;
                left: 0;
                background-color: white;
                min-width: 220px;
                box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                z-index: 10001;
                margin-top: 8px;
                padding: 8px 0;
                animation: fadeIn 0.2s;
            }
            
            .dropdown-content.show {
                display: block;
            }
            
            .dropdown-item {
                padding: 12px 20px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                color: #1f2937;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
                border-left: 3px solid transparent;
            }
            
            .dropdown-item:hover {
                background: #f3f4f6;
                border-left-color: #667eea;
                padding-left: 23px;
            }
            
            .dropdown-item i {
                width: 18px;
                text-align: center;
            }
            
            .dropdown-divider {
                height: 1px;
                background: #e5e7eb;
                margin: 8px 0;
            }
        </style>
            
            
            
            
            
            
            
            
            
            
            
            
            /* Make sure all inline styles respect theme */
            
            
            
            /* Employee cards and stat cards */
            
            /* Ensure table text is visible */
            
            
            
            /* Status badges in tables */
            
            
            
            /* Loading and empty states */
            
            /* Modal headers and content */
            
            /* Ensure buttons remain visible */
            
            
            
            /* Charts container */
            
            /* Dispatch summary cards */
            
            
            /* Recent Activity section */
            
            /* Ensure all text in cards is visible */
            
            
            /* Special case for white text on gradients (keep white) */
            
            /* Top bar stays with white text */
            
            /* Fix table row hover in dark mode */
            
            
            
            /* Ensure hovered rows with inline styles remain visible */
            
            /* Modal backgrounds in dark mode */
            
            
            
            
            
            
            /* Modal headers and titles */
            
            /* Inventory Report Modal specific fixes */
            
            
            
            /* Fix any tables with white backgrounds */
            
            /* Ensure table cells in modals are visible */
            
            
            
            /* Fix for expandable rows and nested tables */
            
            
            
            
            
            /* Fix modal footers and action buttons in dark mode */
            
            
            /* Fix report modals with specific backgrounds */
            
            
            /* Fix colored table cells in reports */
            
            /* Fix light colored backgrounds in tables */
            
            /* Ensure text remains visible on adjusted backgrounds */
            
            /* Fix percentage badges and growth indicators */
            
            
            /* Fix modal action areas */
            
            /* Fix close buttons in modals */
            
            /* Employee Sales Report specific fixes */
            
            
            
            /* Model-Wise Inventory Report fixes */
            
            
            /* Dispatch Summary Report fixes */
            
            
            
            /* Balance Payment Report fixes */
            
            
            
            /* Fix all report modal tables comprehensively */
            
            /* Ensure all inline background colors in dark mode get adjusted */
    </head>
    <body>
        <!-- Login Screen -->
        <div id="loginScreen" class="login-container">
            <!-- Left Side with Animated Characters -->
            <div class="left-side">
                <div class="characters-container">
                    <!-- Orange Character -->
                    <div class="character orange-character">
                        <div class="eyes">
                            <div class="eye">
                                <div class="pupil"></div>
                            </div>
                            <div class="eye">
                                <div class="pupil"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Purple Character -->
                    <div class="character purple-character">
                        <div class="eyes">
                            <div class="eye">
                                <div class="pupil"></div>
                            </div>
                            <div class="eye">
                                <div class="pupil"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Black Character -->
                    <div class="character black-character">
                        <div class="eyes">
                            <div class="eye">
                                <div class="pupil"></div>
                            </div>
                            <div class="eye">
                                <div class="pupil"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Yellow Character -->
                    <div class="character yellow-character">
                        <div class="eyes">
                            <div class="eye">
                                <div class="pupil"></div>
                            </div>
                            <div class="eye">
                                <div class="pupil"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Right Side with Login Form -->
            <div class="right-side">
                <div class="login-box">
                    <div style="margin-bottom: 45px;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 20px;">
                            <img src="/static/logo-blue.jpg" alt="AxelGuard" style="height: 45px; width: auto;">
                            <h2 style="color: #7c8aed; font-size: 28px; margin: 0; font-weight: 700;">AxelGuard</h2>
                        </div>
                        <h1 style="color: #1F2937; font-size: 42px; margin: 0 0 12px 0; font-weight: 700;">Welcome back!</h1>
                        <p style="color: #9CA3AF; font-size: 16px; margin: 0; font-weight: 400;">Please enter your details</p>
                    </div>
                    <form id="loginForm" onsubmit="handleLogin(event)">
                        <div class="form-group" style="margin-bottom: 28px;">
                            <label>Email</label>
                            <input type="email" id="loginUsername" required placeholder="Enter your email" autocomplete="email">
                        </div>
                        <div class="form-group" style="margin-bottom: 12px;">
                            <label>Password</label>
                            <div class="password-input-wrapper">
                                <input type="password" id="loginPassword" required placeholder="Enter your password" autocomplete="current-password">
                                <button type="button" class="password-toggle" onclick="togglePasswordVisibility()">
                                    <i class="fas fa-eye" id="passwordToggleIcon"></i>
                                </button>
                            </div>
                        </div>
                        <div class="remember-forgot">
                            <label class="remember-me">
                                <input type="checkbox" id="rememberMe" style="width: auto; margin: 0;">
                                <span>Remember for 30 days</span>
                            </label>
                            <a href="#" class="forgot-password">Forgot password</a>
                        </div>
                        <div id="loginError" style="color: #ef4444; font-size: 15px; margin-bottom: 20px; display: none; padding: 14px; background: #fef2f2; border-radius: 7px; border-left: 3px solid #ef4444;"></div>
                        <button type="submit" class="btn-primary" style="width: 100%;">
                            Log in
                        </button>
                    </form>
                    <div class="signup-link">
                        Don't have an account? <a href="#">Sign Up</a>
                    </div>
                </div>
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
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="dropdown">
                        <button onclick="toggleAddNewDropdown()" class="btn-primary" style="padding: 8px 16px; font-size: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                            <i class="fas fa-plus-circle"></i> Add New <i class="fas fa-chevron-down" style="font-size: 11px; margin-left: 5px;"></i>
                        </button>
                        <div id="addNewDropdown" class="dropdown-content">
                            <div class="dropdown-item" onclick="openAddSaleModal(); closeAllDropdowns();">
                                <i class="fas fa-shopping-cart" style="color: #667eea;"></i>
                                <span>New Sale</span>
                            </div>
                            <div class="dropdown-item" onclick="openNewLeadModal(); closeAllDropdowns();">
                                <i class="fas fa-user-plus" style="color: #10b981;"></i>
                                <span>New Lead</span>
                            </div>
                            <div class="dropdown-item" onclick="openBalancePaymentModal(); closeAllDropdowns();">
                                <i class="fas fa-money-bill-wave" style="color: #ec4899;"></i>
                                <span>Balance Payment</span>
                            </div>
                            <div class="dropdown-item" onclick="openQuotationModal(); closeAllDropdowns();">
                                <i class="fas fa-file-invoice" style="color: #f59e0b;"></i>
                                <span>Make Quotation</span>
                            </div>
                            <div class="dropdown-divider"></div>
                            <div class="dropdown-item" onclick="openAddInventoryModal(); closeAllDropdowns();">
                                <i class="fas fa-box" style="color: #10b981;"></i>
                                <span>Add Inventory</span>
                            </div>
                            <div class="dropdown-item" onclick="openDispatchModal(); closeAllDropdowns();">
                                <i class="fas fa-shipping-fast" style="color: #3b82f6;"></i>
                                <span>New Dispatch</span>
                            </div>
                        </div>
                    </div>
                    <button onclick="openBalancePaymentReportModal()" class="btn-primary" style="padding: 8px 16px; font-size: 14px; background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);">
                        <i class="fas fa-chart-pie"></i> Balance Report
                    </button>
                    <span id="userDisplay" style="font-size: 14px; color: white; font-weight: 500; margin-left: 10px;"></span>
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
                <div class="sidebar-child" onclick="showPage('renewal')">
                    <i class="fas fa-sync-alt"></i>
                    <span>Renewal</span>
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
                    <i class="fas fa-warehouse"></i>
                    <span>Inventory</span>
                </div>
                <i class="fas fa-chevron-down chevron"></i>
            </div>
            <div class="sidebar-children" id="inventory-menu">
                <div class="sidebar-child" onclick="showPage('inventory-stock')">
                    <i class="fas fa-boxes"></i>
                    <span>Inventory Stock</span>
                </div>
                <div class="sidebar-child" onclick="showPage('inventory-dispatch')">
                    <i class="fas fa-shipping-fast"></i>
                    <span>Dispatch</span>
                </div>
                <div class="sidebar-child" onclick="showPage('inventory-qc')">
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
                <div class="sidebar-child" onclick="showPage('excel-upload')">
                    <i class="fas fa-file-excel"></i>
                    <span>Upload Excel Data</span>
                </div>
            </div>
        </div>

        <div class="main-content" id="mainContent">
            <div class="page-content active" id="dashboard-page">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="font-size: 24px; font-weight: 600; color: #1f2937;">Dashboard Overview</h2>
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
                    <h2 class="card-title" style="margin-bottom: 20px;">
                        <i class="fas fa-search"></i> Search Order by ID
                    </h2>
                    
                    <!-- Search Bar -->
                    <div style="display: flex; gap: 10px; margin-bottom: 30px;">
                        <div class="form-group" style="flex: 1; margin: 0;">
                            <input 
                                type="text" 
                                id="searchOrderId" 
                                placeholder="Enter Order ID (e.g., 2019908)" 
                                style="width: 100%; padding: 12px 16px; font-size: 16px; border: 2px solid #e5e7eb; border-radius: 8px;"
                                onkeypress="if(event.key==='Enter') searchOrder()"
                            >
                        </div>
                        <button class="btn-primary" onclick="searchOrder()" style="padding: 12px 32px; font-size: 16px; border-radius: 8px;">
                            <i class="fas fa-search"></i> Search
                        </button>
                    </div>
                    
                    <!-- Results Container -->
                    <div id="orderResult"></div>
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
                            placeholder="Search by Customer Name, Mobile Number, or Company..." 
                            style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;"
                            oninput="searchCustomerWithAutocomplete()"
                            onfocus="showCustomerSearchDropdown()"
                        >
                        <div id="customerSearchDropdown" class="autocomplete-dropdown" style="display: none;">
                            <!-- Autocomplete results will appear here -->
                        </div>
                    </div>
                    
                    <!-- 5-Button Dropdown Menu (appears after customer found) -->
                    <div id="customerActionButtons" style="display: none; margin-bottom: 20px;">
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button type="button" class="btn" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: transform 0.2s;" onclick="showCustomerBasicInfo()" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                <i class="fas fa-user"></i> Basic
                            </button>
                            <button type="button" class="btn" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 12px 24px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: transform 0.2s;" onclick="showCustomerHistory()" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                <i class="fas fa-history"></i> History
                            </button>
                            <button type="button" class="btn" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 12px 24px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: transform 0.2s;" onclick="showCustomerOrders()" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                <i class="fas fa-shopping-cart"></i> Orders
                            </button>
                            <button type="button" class="btn" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 12px 24px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: transform 0.2s;" onclick="showCustomerLedger()" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                <i class="fas fa-book"></i> Account Ledger
                            </button>
                            <button type="button" class="btn" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 12px 24px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: transform 0.2s;" onclick="showCustomerTickets()" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                <i class="fas fa-ticket-alt"></i> Tickets
                            </button>
                        </div>
                    </div>
                    
                    <!-- Content Display Area -->
                    <div id="customerDetailsContent" style="display: none;">
                        <!-- Dynamic content will be loaded here based on button clicked -->
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

            <!-- Renewal Page -->
            <div class="page-content" id="renewal-page">
                <div style="margin-bottom: 20px;">
                    <h1 style="font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 5px;">
                        <i class="fas fa-sync-alt" style="color: #3b82f6;"></i> Renewal Tracking
                    </h1>
                    <p style="color: #6b7280; font-size: 14px; margin: 0;">
                        Track device renewal status for 4G MDVRs and 4G Dashcams
                    </p>
                </div>

                <!-- Tabs for renewal periods -->
                <div style="margin-bottom: 20px; border-bottom: 2px solid #e5e7eb;">
                    <div style="display: flex; gap: 0;">
                        <button id="cmrTab" onclick="switchRenewalTab('cmr')" 
                            style="padding: 12px 24px; border: none; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; font-weight: 600; border-radius: 8px 8px 0 0; cursor: pointer; transition: all 0.3s; border-bottom: 3px solid #2563eb;">
                            <i class="fas fa-calendar-check"></i> CMR (Due Now)
                        </button>
                        <button id="c1Tab" onclick="switchRenewalTab('c1')" 
                            style="padding: 12px 24px; border: none; background: #f3f4f6; color: #6b7280; font-weight: 600; border-radius: 8px 8px 0 0; cursor: pointer; transition: all 0.3s;">
                            <i class="fas fa-calendar-plus"></i> C+1 (1 Month)
                        </button>
                        <button id="c2Tab" onclick="switchRenewalTab('c2')" 
                            style="padding: 12px 24px; border: none; background: #f3f4f6; color: #6b7280; font-weight: 600; border-radius: 8px 8px 0 0; cursor: pointer; transition: all 0.3s;">
                            <i class="fas fa-calendar"></i> C+2 (2 Months)
                        </button>
                        <button id="c3Tab" onclick="switchRenewalTab('c3')" 
                            style="padding: 12px 24px; border: none; background: #f3f4f6; color: #6b7280; font-weight: 600; border-radius: 8px 8px 0 0; cursor: pointer; transition: all 0.3s;">
                            <i class="fas fa-calendar-alt"></i> C+3 (3 Months)
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="table-container">
                        <table style="width: 100%;">
                            <thead>
                                <tr>
                                    <th>S. No</th>
                                    <th>Cust Code</th>
                                    <th>Customer Name</th>
                                    <th style="cursor: pointer; background: #dbeafe;">CMR</th>
                                    <th style="cursor: pointer; background: #fef3c7;">C+1</th>
                                    <th style="cursor: pointer; background: #d1fae5;">C+2</th>
                                    <th style="cursor: pointer; background: #e0e7ff;">C+3</th>
                                    <th style="font-weight: 700; background: #f3f4f6;">Total</th>
                                </tr>
                            </thead>
                            <tbody id="renewalTableBody">
                                <tr><td colspan="8" class="loading">Loading renewal data...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="page-content" id="balance-payment-page">
                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 class="card-title" style="margin: 0;">Balance Payments</h2>
                        <button onclick="openBalancePaymentReportModal()" class="btn-primary" style="background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);">
                            <i class="fas fa-chart-pie"></i> View Balance Report
                        </button>
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

            <!-- ============================================ -->
            <!-- INVENTORY MANAGEMENT PAGES -->
            <!-- ============================================ -->
            
            <!-- Inventory Stock Page -->
            <div class="page-content" id="inventory-stock-page">
                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 class="card-title" style="margin: 0;">Inventory Stock</h2>
                        <div style="display: flex; gap: 10px;">
                            <button onclick="openAddInventoryModal()" class="btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                                <i class="fas fa-plus-circle"></i> Add Inventory
                            </button>
                            <button onclick="exportInventoryToExcel()" class="btn-primary" style="background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                                <i class="fas fa-file-excel"></i> Export
                            </button>
                            <input type="text" id="inventorySearch" placeholder="Search serial, model, customer... (Barcode Scanner Ready)" 
                                onkeypress="if(event.key==='Enter') searchInventory()"
                                style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; width: 300px;">
                            <select id="inventoryStatusFilter" onchange="searchInventory()" style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px;">
                                <option value="">All Status</option>
                                <option value="In Stock">In Stock</option>
                                <option value="Dispatched">Dispatched</option>
                                <option value="QC Pending">QC Pending</option>
                                <option value="Defective">Defective</option>
                                <option value="Returned">Returned</option>
                            </select>
                            <button onclick="searchInventory()" class="btn-primary">
                                <i class="fas fa-search"></i> Search
                            </button>
                        </div>
                    </div>
                    
                    <div style="overflow-x: auto; max-height: 600px; overflow-y: auto;">
                        <table class="data-table">
                            <thead style="position: sticky; top: 0; z-index: 10;">
                                <tr>
                                    <th style="position: sticky; left: 0; z-index: 12; background: #f9fafb; box-shadow: 2px 0 4px rgba(0,0,0,0.1);">S. No</th>
                                    <th style="position: sticky; left: 60px; z-index: 12; background: #f9fafb; box-shadow: 2px 0 4px rgba(0,0,0,0.1);">Device Serial No</th>
                                    <th style="background: #f9fafb;">Model Name</th>
                                    <th style="background: #f9fafb;">Status</th>
                                    <th style="background: #f9fafb;">QC Result</th>
                                    <th style="background: #f9fafb;">In Date</th>
                                    <th style="background: #f9fafb;">Customer</th>
                                    <th style="background: #f9fafb;">Dispatch Date</th>
                                    <th style="background: #f9fafb;">Cust Code</th>
                                    <th style="background: #f9fafb;">Order ID</th>
                                    <th style="background: #f9fafb;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="inventoryTableBody">
                                <tr><td colspan="11" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- Dispatch Page -->
            <div class="page-content" id="inventory-dispatch-page">
                <!-- Header -->
                <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h1 style="font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 5px;">Dispatch Management</h1>
                        <p style="color: #6b7280; font-size: 14px; margin: 0;">
                            <span id="totalOrdersCount">0</span> Orders | <span id="totalItemsCount">0</span> Items Dispatched
                        </p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="exportDispatchToExcel()" class="btn-primary" style="background: linear-gradient(135deg, #059669 0%, #047857 100 %); padding: 12px 24px;">
                            <i class="fas fa-file-excel"></i> Export Excel
                        </button>
                        <!-- Dropdown button for Create actions -->
                        <div class="dropdown-container" style="position: relative; display: inline-block;">
                            <button onclick="toggleCreateDropdown()" class="btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 12px 24px;">
                                <i class="fas fa-plus-circle"></i> Create <i class="fas fa-chevron-down" style="margin-left: 8px; font-size: 12px;"></i>
                            </button>
                            <div id="createDropdownMenu" class="dropdown-menu" style="display: none; position: absolute; top: 100%; right: 0; margin-top: 5px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); min-width: 200px; z-index: 1000;">
                                <button onclick="openCreateDispatchModal(); toggleCreateDropdown();" style="width: 100%; padding: 12px 16px; border: none; background: none; text-align: left; cursor: pointer; font-size: 14px; font-weight: 500; color: #374151; transition: background 0.2s; border-radius: 8px 8px 0 0;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
                                    <i class="fas fa-shipping-fast" style="color: #10b981; width: 20px;"></i> Create Dispatch
                                </button>
                                <button onclick="openReplacementModal(); toggleCreateDropdown();" style="width: 100%; padding: 12px 16px; border: none; background: none; text-align: left; cursor: pointer; font-size: 14px; font-weight: 500; color: #374151; transition: background 0.2s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
                                    <i class="fas fa-exchange-alt" style="color: #f59e0b; width: 20px;"></i> Replacement
                                </button>
                                <button onclick="openTrackingModal(); toggleCreateDropdown();" style="width: 100%; padding: 12px 16px; border: none; background: none; text-align: left; cursor: pointer; font-size: 14px; font-weight: 500; color: #374151; transition: background 0.2s; border-radius: 0 0 8px 8px;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
                                    <i class="fas fa-truck" style="color: #8b5cf6; width: 20px;"></i> Add Tracking Details
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Tabs Navigation -->
                <div style="margin-bottom: 20px; border-bottom: 2px solid #e5e7eb;">
                    <div style="display: flex; gap: 0;">
                        <button id="dispatchOrdersTab" onclick="switchDispatchTab('orders')" 
                            style="padding: 12px 24px; border: none; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; font-weight: 600; border-radius: 8px 8px 0 0; cursor: pointer; transition: all 0.3s; border-bottom: 3px solid #2563eb;">
                            <i class="fas fa-box"></i> Dispatch Orders
                        </button>
                        <button id="trackingDetailsTab" onclick="switchDispatchTab('tracking')" 
                            style="padding: 12px 24px; border: none; background: #f3f4f6; color: #6b7280; font-weight: 600; border-radius: 8px 8px 0 0; cursor: pointer; transition: all 0.3s; border-bottom: 3px solid transparent;">
                            <i class="fas fa-shipping-fast"></i> Tracking Details
                        </button>
                    </div>
                </div>
                
                <!-- Dispatch Orders Tab Content -->
                <div id="dispatchOrdersContent" style="display: block;">
                    <!-- Sorting and Search Section -->
                <div class="card" style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                        <div style="display: flex; gap: 10px; flex: 1;">
                            <input type="text" id="dispatchSearchOrder" placeholder="Search by Order ID..." 
                                onkeypress="if(event.key==='Enter') searchDispatchOrders()"
                                style="flex: 1; padding: 10px 15px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px;">
                            <input type="text" id="dispatchSearchCustomer" placeholder="Search by Customer Name/Mobile..." 
                                onkeypress="if(event.key==='Enter') searchDispatchOrders()"
                                style="flex: 1; padding: 10px 15px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px;">
                            <button onclick="searchDispatchOrders()" class="btn-primary" style="padding: 10px 20px;">
                                <i class="fas fa-search"></i> Search
                            </button>
                            <button onclick="clearDispatchSearch()" class="btn-primary" style="background: #6b7280; padding: 10px 20px;">
                                <i class="fas fa-times"></i> Clear
                            </button>
                        </div>
                    </div>
                </div>
                
                    <!-- Grouped Dispatch Orders -->
                    <div class="card">
                        <h2 class="card-title" style="margin-bottom: 20px;">
                            <i class="fas fa-shipping-fast"></i> Dispatch Orders
                        </h2>
                        <div id="groupedDispatchesContainer" style="max-height: 700px; overflow-y: auto;">
                            <div style="text-align: center; padding: 40px; color: #9ca3af;">
                                <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 10px;"></i>
                                <p>Loading dispatch orders...</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Tracking Details Tab Content - Now Full Screen -->
                <div id="trackingDetailsContent" style="display: none;">
                    <!-- Tracking Details Report - Full Screen -->
                    <div class="card">
                        <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 25px; border-radius: 12px; margin-bottom: 25px; box-shadow: 0 8px 20px rgba(5, 150, 105, 0.3);">
                            <h3 style="color: white; margin-bottom: 12px; font-size: 20px; font-weight: 700;">
                                <i class="fas fa-chart-bar"></i> Tracking Records Report
                            </h3>
                            <p style="color: rgba(255,255,255,0.95); font-size: 14px; margin: 0; line-height: 1.5;">
                                All tracking records with invoice pricing
                            </p>
                        </div>

                        <!-- Search Bar and Month Filter -->
                        <div style="margin-bottom: 20px; display: flex; gap: 12px; align-items: center; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                            <div style="flex: 1; position: relative;">
                                <i class="fas fa-search" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 16px;"></i>
                                <input type="text" id="trackingReportSearchTab" 
                                    placeholder="Search by Order ID, Courier, Tracking ID..." 
                                    oninput="filterTrackingReportTab()"
                                    style="width: 100%; padding: 14px 14px 14px 48px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 15px; transition: all 0.3s; outline: none;"
                                    onfocus="this.style.borderColor='#8b5cf6'; this.style.boxShadow='0 0 0 4px rgba(139, 92, 246, 0.1)'"
                                    onblur="this.style.borderColor='#e5e7eb'; this.style.boxShadow='none'">
                            </div>
                            <div style="position: relative; min-width: 220px;">
                                <i class="fas fa-calendar-alt" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #8b5cf6; font-size: 16px; z-index: 1;"></i>
                                <select id="trackingMonthFilterTab" onchange="filterTrackingReportTab()"
                                    style="width: 100%; padding: 14px 14px 14px 48px; border: 2px solid #8b5cf6; border-radius: 10px; font-size: 15px; font-weight: 600; color: #7c3aed; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); cursor: pointer; transition: all 0.3s; outline: none; appearance: none; -webkit-appearance: none; -moz-appearance: none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%228%22 viewBox=%220 0 12 8%22><path fill=%22%237c3aed%22 d=%22M6 8L0 0h12z%22/></svg>'); background-repeat: no-repeat; background-position: right 14px center;"
                                    onmouseover="this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.3)'"
                                    onmouseout="this.style.boxShadow='none'">
                                    <option value="">All Months</option>
                                </select>
                            </div>
                        </div>

                        <!-- Report Table - Full Screen -->
                        <div style="max-height: 700px; overflow-y: auto; overflow-x: auto; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <thead style="position: sticky; top: 0; z-index: 10;">
                                    <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);">
                                        <th style="padding: 16px 14px; text-align: left; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;">📦 Order ID</th>
                                        <th style="padding: 16px 14px; text-align: left; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;">🚚 Courier Partner</th>
                                        <th style="padding: 16px 14px; text-align: left; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;">✈️ Mode</th>
                                        <th style="padding: 16px 14px; text-align: left; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;">🔢 Tracking ID</th>
                                        <th style="padding: 16px 14px; text-align: right; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;">⚖️ Weight</th>
                                        <th style="padding: 16px 14px; text-align: right; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;">💰 Price</th>
                                        <th style="padding: 16px 14px; text-align: center; font-weight: 700; font-size: 13px; letter-spacing: 0.3px;">🔧 Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="trackingReportBodyTab">
                                    <tr><td colspan="7" style="text-align: center; padding: 40px; color: #9ca3af;">Loading tracking records...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Quality Check Page -->
            <div class="page-content" id="inventory-qc-page">
                <!-- Header with Buttons -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div>
                        <h1 style="font-size: 24px; font-weight: 700; color: #1f2937; margin: 0;">Quality Check Reports</h1>
                    </div>
                    <div style="position: relative; display: inline-block;">
                        <button onclick="toggleQCActionsDropdown()" class="btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 14px 28px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3); border: none; border-radius: 10px; display: flex; align-items: center; gap: 10px; transition: all 0.3s; cursor: pointer;">
                            <i class="fas fa-tasks" style="font-size: 16px;"></i> 
                            <span>Actions</span>
                            <i class="fas fa-chevron-down" style="font-size: 12px;"></i>
                        </button>
                        <div id="qcActionsDropdownMenu" class="dropdown-menu" style="display: none; position: absolute; top: 100%; right: 0; margin-top: 8px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15); min-width: 220px; z-index: 1000; overflow: hidden;">
                            <button onclick="exportQCToExcel(); toggleQCActionsDropdown();" style="width: 100%; padding: 14px 20px; border: none; background: none; text-align: left; cursor: pointer; font-size: 14px; font-weight: 500; color: #374151; transition: all 0.2s; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #f3f4f6; border-radius: 12px 12px 0 0;" onmouseover="this.style.background='linear-gradient(90deg, #f0fdf4 0%, #dcfce7 100%)'; this.style.paddingLeft='24px'" onmouseout="this.style.background='none'; this.style.paddingLeft='20px'">
                                <i class="fas fa-file-excel" style="color: #059669; font-size: 16px; width: 22px; text-align: center;"></i>
                                <span>Export Excel</span>
                            </button>
                            <button onclick="openUpdateQCModal(); toggleQCActionsDropdown();" style="width: 100%; padding: 14px 20px; border: none; background: none; text-align: left; cursor: pointer; font-size: 14px; font-weight: 500; color: #374151; transition: all 0.2s; display: flex; align-items: center; gap: 12px; border-radius: 0 0 12px 12px;" onmouseover="this.style.background='linear-gradient(90deg, #fef3c7 0%, #fde68a 100%)'; this.style.paddingLeft='24px'" onmouseout="this.style.background='none'; this.style.paddingLeft='20px'">
                                <i class="fas fa-edit" style="color: #f59e0b; font-size: 16px; width: 22px; text-align: center;"></i>
                                <span>Update QC</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- QC Summary Cards -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 25px;">
                    <!-- QC Pass Card -->
                    <div onclick="filterQCReport('Pass')" 
                        style="background: linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%); 
                               padding: 28px 24px; 
                               border-radius: 16px; 
                               color: white; 
                               cursor: pointer; 
                               transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
                               box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
                               position: relative;
                               overflow: hidden;"
                        onmouseover="this.style.transform='translateY(-8px)'; this.style.boxShadow='0 12px 24px rgba(16, 185, 129, 0.4)'"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 14px rgba(16, 185, 129, 0.3)'">
                        <div style="position: absolute; top: -20px; right: -20px; font-size: 120px; opacity: 0.1;">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div style="position: relative; z-index: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <i class="fas fa-check-circle" style="font-size: 20px;"></i>
                                <span style="font-size: 15px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">QC Pass</span>
                            </div>
                            <div style="font-size: 42px; font-weight: 800; line-height: 1;" id="qcPassCount">0</div>
                            <div style="font-size: 13px; opacity: 0.9; margin-top: 8px;">Devices passed quality check</div>
                        </div>
                    </div>

                    <!-- QC Fail Card -->
                    <div onclick="filterQCReport('Fail')" 
                        style="background: linear-gradient(135deg, #f87171 0%, #ef4444 50%, #dc2626 100%); 
                               padding: 28px 24px; 
                               border-radius: 16px; 
                               color: white; 
                               cursor: pointer; 
                               transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
                               box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3);
                               position: relative;
                               overflow: hidden;"
                        onmouseover="this.style.transform='translateY(-8px)'; this.style.boxShadow='0 12px 24px rgba(239, 68, 68, 0.4)'"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 14px rgba(239, 68, 68, 0.3)'">
                        <div style="position: absolute; top: -20px; right: -20px; font-size: 120px; opacity: 0.1;">
                            <i class="fas fa-times-circle"></i>
                        </div>
                        <div style="position: relative; z-index: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <i class="fas fa-times-circle" style="font-size: 20px;"></i>
                                <span style="font-size: 15px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">QC Fail</span>
                            </div>
                            <div style="font-size: 42px; font-weight: 800; line-height: 1;" id="qcFailCount">0</div>
                            <div style="font-size: 13px; opacity: 0.9; margin-top: 8px;">Devices failed quality check</div>
                        </div>
                    </div>

                    <!-- QC Pending Card -->
                    <div onclick="filterQCReport('Pending')" 
                        style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%); 
                               padding: 28px 24px; 
                               border-radius: 16px; 
                               color: white; 
                               cursor: pointer; 
                               transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
                               box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
                               position: relative;
                               overflow: hidden;"
                        onmouseover="this.style.transform='translateY(-8px)'; this.style.boxShadow='0 12px 24px rgba(245, 158, 11, 0.4)'"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 14px rgba(245, 158, 11, 0.3)'">
                        <div style="position: absolute; top: -20px; right: -20px; font-size: 120px; opacity: 0.1;">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div style="position: relative; z-index: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <i class="fas fa-clock" style="font-size: 20px;"></i>
                                <span style="font-size: 15px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">QC Pending</span>
                            </div>
                            <div style="font-size: 42px; font-weight: 800; line-height: 1;" id="qcPendingCount">0</div>
                            <div style="font-size: 13px; opacity: 0.9; margin-top: 8px;">Devices awaiting quality check</div>
                        </div>
                    </div>
                </div>



                <!-- QC Reports Card -->
                <div class="card" style="box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #1f2937; font-size: 22px; font-weight: 700;">
                            <i class="fas fa-list-alt" style="color: #667eea; margin-right: 10px;"></i> QC Reports
                        </h2>
                        <button onclick="clearQCFilter()" 
                            style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); 
                                   color: white; 
                                   border: none; 
                                   padding: 10px 20px; 
                                   border-radius: 10px; 
                                   cursor: pointer; 
                                   font-weight: 600;
                                   transition: all 0.2s;
                                   box-shadow: 0 2px 8px rgba(107, 114, 128, 0.3);"
                            onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px rgba(107, 114, 128, 0.4)'"
                            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(107, 114, 128, 0.3)'">
                            <i class="fas fa-times"></i> Clear Filter
                        </button>
                    </div>

                    <!-- Search Bar -->
                    <div style="margin-bottom: 20px; position: relative;">
                        <i class="fas fa-search" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 16px;"></i>
                        <input type="text" id="qcSearchInput" 
                            placeholder="Search by Device ID, Serial Number, or Product Name..." 
                            oninput="searchQCReports()"
                            style="width: 100%; 
                                   padding: 14px 14px 14px 48px; 
                                   border: 2px solid #e5e7eb; 
                                   border-radius: 12px; 
                                   font-size: 15px;
                                   transition: all 0.3s;
                                   outline: none;"
                            onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 4px rgba(102, 126, 234, 0.1)'"
                            onblur="this.style.borderColor='#e5e7eb'; this.style.boxShadow='none'">
                    </div>

                    <!-- QC Table -->
                    <div style="overflow-x: auto; overflow-y: auto; max-height: 600px; border-radius: 12px; border: 2px solid #e5e7eb;">
                        <table class="data-table" style="font-size: 13px; width: 100%; border-collapse: collapse;">
                            <thead style="position: sticky; top: 0; z-index: 10; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);">
                                <tr>
                                    <th style="min-width: 60px; padding: 16px 12px; text-align: left; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-hashtag" style="margin-right: 4px; opacity: 0.9;"></i>S.No
                                    </th>
                                    <th style="min-width: 110px; padding: 16px 12px; text-align: left; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-calendar" style="margin-right: 4px; opacity: 0.9;"></i>QC Date
                                    </th>
                                    <th style="min-width: 130px; padding: 16px 12px; text-align: left; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-barcode" style="margin-right: 4px; opacity: 0.9;"></i>Serial No
                                    </th>
                                    <th style="min-width: 160px; padding: 16px 12px; text-align: left; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-tv" style="margin-right: 4px; opacity: 0.9;"></i>Device Type
                                    </th>
                                    <th style="min-width: 110px; padding: 16px 12px; text-align: center; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-sd-card" style="margin-right: 4px; opacity: 0.9;"></i>SD
                                    </th>
                                    <th style="min-width: 110px; padding: 16px 12px; text-align: center; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-video" style="margin-right: 4px; opacity: 0.9;"></i>All Ch
                                    </th>
                                    <th style="min-width: 110px; padding: 16px 12px; text-align: center; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-wifi" style="margin-right: 4px; opacity: 0.9;"></i>Network
                                    </th>
                                    <th style="min-width: 100px; padding: 16px 12px; text-align: center; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-map-marker-alt" style="margin-right: 4px; opacity: 0.9;"></i>GPS
                                    </th>
                                    <th style="min-width: 100px; padding: 16px 12px; text-align: center; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-sim-card" style="margin-right: 4px; opacity: 0.9;"></i>SIM
                                    </th>
                                    <th style="min-width: 100px; padding: 16px 12px; text-align: center; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-globe" style="margin-right: 4px; opacity: 0.9;"></i>Online
                                    </th>
                                    <th style="min-width: 130px; padding: 16px 12px; text-align: center; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-camera" style="margin-right: 4px; opacity: 0.9;"></i>Camera
                                    </th>
                                    <th style="min-width: 110px; padding: 16px 12px; text-align: center; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-desktop" style="margin-right: 4px; opacity: 0.9;"></i>Monitor
                                    </th>
                                    <th style="min-width: 130px; padding: 16px 12px; text-align: center; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-flag-checkered" style="margin-right: 4px; opacity: 0.9;"></i>Status
                                    </th>
                                    <th style="min-width: 130px; padding: 16px 12px; text-align: left; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-network-wired" style="margin-right: 4px; opacity: 0.9;"></i>IP Address
                                    </th>
                                    <th style="min-width: 100px; padding: 16px 12px; text-align: center; color: white; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                                        <i class="fas fa-cog" style="margin-right: 4px; opacity: 0.9;"></i>Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody id="qcReportsBody">
                                <tr><td colspan="15" style="text-align: center; padding: 40px; color: #9ca3af; font-size: 15px;">
                                    <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
                                    Loading QC reports...
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- New QC Modal -->
            <div id="newQCModal" class="modal">
                <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
                        <h2 style="margin: 0; color: #1f2937; font-size: 24px;">
                            <i class="fas fa-clipboard-check"></i> New Quality Check
                        </h2>
                        <button onclick="closeNewQCModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <form id="newQCForm" onsubmit="submitNewQCTest(event)">
                        <!-- Step 1: Device Selection -->
                        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                            <h3 style="color: #374151; margin-bottom: 15px;">
                                <i class="fas fa-barcode"></i> Step 1: Scan Device
                            </h3>
                            
                            <div class="form-group">
                                <label>Device Serial Number *</label>
                                <input type="text" id="newQCScanInput" 
                                    onkeypress="if(event.key==='Enter') { event.preventDefault(); loadDeviceForNewQC(); }"
                                    placeholder="Scan barcode or enter serial number..." 
                                    style="padding: 12px; border: 2px solid #667eea; border-radius: 8px; font-size: 16px;"
                                    required>
                            </div>
                            
                            <button type="button" onclick="loadDeviceForNewQC()" class="btn-primary" style="width: 100%;">
                                <i class="fas fa-search"></i> Load Device
                            </button>

                            <!-- Device Info Display -->
                            <div id="newQCDeviceInfo" style="display: none; background: #ecfdf5; padding: 15px; border-radius: 8px; margin-top: 15px; border: 2px solid #10b981;">
                                <div style="font-weight: 700; color: #065f46; margin-bottom: 10px;">
                                    <i class="fas fa-check-circle"></i> Device Loaded Successfully
                                </div>
                                <div id="newQCDeviceDetails"></div>
                            </div>
                        </div>

                        <!-- Step 2: Product Selection -->
                        <div id="newQCProductSelection" style="display: none; background: #f9fafb; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                            <h3 style="color: #374151; margin-bottom: 15px;">
                                <i class="fas fa-box"></i> Step 2: Select Product
                            </h3>
                            
                            <div class="form-group">
                                <label>Product Category *</label>
                                <select id="newQCCategory" onchange="loadQCProductsByCategory()" style="padding: 10px; border: 2px solid #667eea; border-radius: 6px;" required>
                                    <option value="">-- Select Category --</option>
                                    <option value="MDVR">MDVR</option>
                                    <option value="Camera">Camera</option>
                                    <option value="Monitor">Monitor</option>
                                    <option value="Accessories">Accessories</option>
                                </select>
                            </div>

                            <div class="form-group" id="newQCProductNameGroup" style="display: none;">
                                <label>Product Name *</label>
                                <select id="newQCProductName" onchange="showQCTestFields()" style="padding: 10px; border: 2px solid #667eea; border-radius: 6px;" required>
                                    <option value="">-- Select Product --</option>
                                </select>
                            </div>
                        </div>

                        <!-- Step 3: QC Tests -->
                        <div id="newQCTestSection" style="display: none; background: #f9fafb; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                            <h3 style="color: #374151; margin-bottom: 15px;">
                                <i class="fas fa-tasks"></i> Step 3: Quality Tests
                            </h3>
                            
                            <div id="newQCTestFields"></div>
                            
                            <!-- Final QC Status Display -->
                            <div id="newQCFinalStatus" style="margin-top: 20px;"></div>
                        </div>

                        <!-- Submit Buttons -->
                        <div id="newQCSubmitSection" style="display: none; display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                            <button type="button" onclick="closeNewQCModal()" class="btn-primary" style="background: #6b7280;">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                            <button type="submit" class="btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 12px 30px;">
                                <i class="fas fa-save"></i> Submit QC Report
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            
            <!-- Update QC Modal - Manual Entry -->
            <div id="updateQCModal" class="modal">
                <div class="modal-content" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
                        <h2 style="margin: 0; color: #1f2937; font-size: 24px;">
                            <i class="fas fa-edit"></i> Update QC - Manual Entry
                        </h2>
                        <button onclick="closeUpdateQCModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <form id="updateQCForm" onsubmit="submitUpdateQC(event)">
                        <!-- Row 1: Basic Information -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">QC Date *</label>
                                <input type="date" id="update_qc_date" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;" required>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">Serial Number *</label>
                                <input type="text" id="update_serial_number" placeholder="Enter device serial number" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;" required>
                            </div>
                        </div>
                        
                        <!-- Row 2: Category and Product Name -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">Category *</label>
                                <select id="update_category" onchange="loadUpdateQCProducts()" style="width: 100%; padding: 10px; border: 2px solid #667eea; border-radius: 6px; font-size: 14px;" required>
                                    <option value="">-- Select Category --</option>
                                    <option value="MDVR">MDVR</option>
                                    <option value="Monitor & Monitor Kit">Monitor & Monitor Kit</option>
                                    <option value="Cameras">Cameras</option>
                                    <option value="Dashcam">Dashcam</option>
                                    <option value="Storage">Storage</option>
                                    <option value="RFID Tags">RFID Tags</option>
                                    <option value="RFID Reader">RFID Reader</option>
                                    <option value="MDVR Accessories">MDVR Accessories</option>
                                    <option value="Other product and Accessories">Other product and Accessories</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">Product Name *</label>
                                <select id="update_product_name" style="width: 100%; padding: 10px; border: 2px solid #667eea; border-radius: 6px; font-size: 14px;" required>
                                    <option value="">-- Select Product --</option>
                                </select>
                            </div>
                        </div>

                        <!-- Row 2: QC Parameters (Part 1) -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">Camera Quality (For Camera)</label>
                                <select id="update_camera_quality" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    <option value="">-- Select --</option>
                                    <option value="QC Pass">✅ QC Pass</option>
                                    <option value="QC Fail">❌ QC Fail</option>
                                    <option value="QC Not Applicable">➖ QC Not Applicable</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">SD Connectivity QC</label>
                                <select id="update_sd_connectivity" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    <option value="">-- Select --</option>
                                    <option value="QC Pass">✅ QC Pass</option>
                                    <option value="QC Fail">❌ QC Fail</option>
                                    <option value="QC Not Applicable">➖ QC Not Applicable</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">All Ch QC Status</label>
                                <select id="update_all_ch_status" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    <option value="">-- Select --</option>
                                    <option value="QC Pass">✅ QC Pass</option>
                                    <option value="QC Fail">❌ QC Fail</option>
                                    <option value="QC Not Applicable">➖ QC Not Applicable</option>
                                </select>
                            </div>
                        </div>

                        <!-- Row 3: QC Parameters (Part 2) -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">Network Connectivity QC</label>
                                <select id="update_network_connectivity" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    <option value="">-- Select --</option>
                                    <option value="QC Pass">✅ QC Pass</option>
                                    <option value="QC Fail">❌ QC Fail</option>
                                    <option value="QC Not Applicable">➖ QC Not Applicable</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">GPS QC</label>
                                <select id="update_gps_qc" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    <option value="">-- Select --</option>
                                    <option value="QC Pass">✅ QC Pass</option>
                                    <option value="QC Fail">❌ QC Fail</option>
                                    <option value="QC Not Applicable">➖ QC Not Applicable</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">SIM Card Slot QC</label>
                                <select id="update_sim_card_slot" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    <option value="">-- Select --</option>
                                    <option value="QC Pass">✅ QC Pass</option>
                                    <option value="QC Fail">❌ QC Fail</option>
                                    <option value="QC Not Applicable">➖ QC Not Applicable</option>
                                </select>
                            </div>
                        </div>

                        <!-- Row 4: QC Parameters (Part 3) -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">Online QC</label>
                                <select id="update_online_qc" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    <option value="">-- Select --</option>
                                    <option value="QC Pass">✅ QC Pass</option>
                                    <option value="QC Fail">❌ QC Fail</option>
                                    <option value="QC Not Applicable">➖ QC Not Applicable</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">Monitor QC Status</label>
                                <select id="update_monitor_qc_status" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                                    <option value="">-- Select --</option>
                                    <option value="QC Pass">✅ QC Pass</option>
                                    <option value="QC Fail">❌ QC Fail</option>
                                    <option value="QC Not Applicable">➖ QC Not Applicable</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">Final QC Status *</label>
                                <select id="update_final_qc_status" style="width: 100%; padding: 10px; border: 2px solid #10b981; border-radius: 6px; font-size: 14px; font-weight: 600;" required>
                                    <option value="">-- Select --</option>
                                    <option value="QC Pass">✅ QC Pass</option>
                                    <option value="QC Fail">❌ QC Fail</option>
                                    <option value="QC Not Applicable">➖ QC Not Applicable</option>
                                </select>
                            </div>
                        </div>

                        <!-- Row 5: Additional Information -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">IP Address</label>
                                <input type="text" id="update_ip_address" placeholder="e.g., 192.168.1.100" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; color: #374151; margin-bottom: 8px; display: block;">Update Status</label>
                                <input type="text" id="update_status" placeholder="e.g., Firmware updated" style="width: 100%; padding: 10px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                            </div>
                        </div>

                        <!-- Submit Buttons -->
                        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                            <button type="button" onclick="closeUpdateQCModal()" class="btn-primary" style="background: #6b7280; padding: 12px 24px;">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                            <button type="submit" class="btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 12px 30px;">
                                <i class="fas fa-save"></i> Save QC Report
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            
            <!-- Add Inventory Modal - Bulk Entry -->
            <div id="addInventoryModal" class="modal">
                <div class="modal-content" style="max-width: 1200px; max-height: 90vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
                        <h2 style="margin: 0; color: #1f2937; font-size: 24px;">
                            <i class="fas fa-plus-circle"></i> Add Multiple Inventory Items
                        </h2>
                        <button onclick="closeAddInventoryModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Instructions -->
                    <div style="background: #eff6ff; border: 2px solid #3b82f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <strong style="color: #1e40af;">📋 Quick Guide:</strong>
                        <ul style="margin: 10px 0 0 20px; color: #1e3a8a;">
                            <li>Scan barcode in Serial Number field</li>
                            <li>Select Category → Product Name appears automatically</li>
                            <li>Click "Add Row" or press Enter to add more devices</li>
                            <li>Date is auto-filled with today's date</li>
                            <li>Click "Submit All" to save all devices at once</li>
                        </ul>
                    </div>

                    <!-- Bulk Entry Table -->
                    <div style="overflow-x: auto; margin-bottom: 20px;">
                        <table class="data-table" style="font-size: 13px;">
                            <thead style="background: #f9fafb;">
                                <tr>
                                    <th style="min-width: 180px;">Serial Number *</th>
                                    <th style="min-width: 150px;">Category *</th>
                                    <th style="min-width: 250px;">Product Name *</th>
                                    <th style="min-width: 120px;">Date *</th>
                                    <th style="min-width: 80px;">Action</th>
                                </tr>
                            </thead>
                            <tbody id="bulkInventoryTable">
                                <!-- Rows will be added dynamically -->
                            </tbody>
                        </table>
                    </div>

                    <!-- Add Row Button -->
                    <div style="text-align: center; margin-bottom: 20px;">
                        <button type="button" onclick="addInventoryRow()" class="btn-primary" style="background: #3b82f6;">
                            <i class="fas fa-plus"></i> Add Another Row
                        </button>
                    </div>

                    <!-- Submit Buttons -->
                    <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                        <button type="button" onclick="closeAddInventoryModal()" class="btn-primary" style="background: #6b7280; padding: 12px 24px;">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                        <button type="button" onclick="submitBulkInventory()" class="btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 12px 24px;">
                            <i class="fas fa-save"></i> Submit All Devices
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Inventory Reports Page -->
            <div class="page-content" id="inventory-reports-page">
                <div class="card">
                    <h2 class="card-title">Inventory Reports & Statistics</h2>
                    
                    <!-- Summary Cards -->
                    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; margin-bottom: 35px;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 14px; color: white; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3); transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div style="font-size: 13px; opacity: 0.9; margin-bottom: 8px; font-weight: 500;">📊 Total Devices</div>
                            <div style="font-size: 36px; font-weight: 700;" id="statTotal">0</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px; border-radius: 14px; color: white; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div style="font-size: 13px; opacity: 0.9; margin-bottom: 8px; font-weight: 500;">📦 In Stock</div>
                            <div style="font-size: 36px; font-weight: 700;" id="statInStock">0</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 24px; border-radius: 14px; color: white; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3); transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div style="font-size: 13px; opacity: 0.9; margin-bottom: 8px; font-weight: 500;">🚀 Dispatched</div>
                            <div style="font-size: 36px; font-weight: 700;" id="statDispatched">0</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px; border-radius: 14px; color: white; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div style="font-size: 13px; opacity: 0.9; margin-bottom: 8px; font-weight: 500;">✅ QC Pass</div>
                            <div style="font-size: 36px; font-weight: 700;" id="statQCPass">0</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 24px; border-radius: 14px; color: white; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3); transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div style="font-size: 13px; opacity: 0.9; margin-bottom: 8px; font-weight: 500;">❌ QC Fail</div>
                            <div style="font-size: 36px; font-weight: 700;" id="statQCFail">0</div>
                        </div>
                    </div>
                    

                    
                    <!-- Model-Wise Inventory Report -->
                    <div style="margin-bottom: 35px; padding: 25px; background: white; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.05);">
                        <h3 style="margin-bottom: 20px; font-size: 20px; font-weight: 700; color: #667eea; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-box" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 10px; font-size: 16px;"></i> Model-Wise Inventory Report
                        </h3>
                        <div style="overflow-x: auto;">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th style="background: #e0e7ff; color: #4338ca;">S.No</th>
                                        <th style="background: #e0e7ff; color: #4338ca;">Model Name</th>
                                        <th style="background: #d1fae5; color: #065f46;">In Stock</th>
                                        <th style="background: #dbeafe; color: #1e40af;">Dispatched</th>
                                        <th style="background: #d1fae5; color: #065f46;">QC Pass</th>
                                        <th style="background: #fee2e2; color: #991b1b;">QC Fail</th>
                                        <th style="background: #fef3c7; color: #92400e;">QC Pending</th>
                                        <th style="background: #e0e7ff; color: #4338ca;">Total</th>
                                    </tr>
                                </thead>
                                <tbody id="modelWiseTableBody">
                                    <tr><td colspan="8" class="loading">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <!-- Dispatch Summary Report -->
                    <div style="margin-bottom: 35px; padding: 25px; background: white; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.05);">
                        <h3 style="margin-bottom: 20px; font-size: 20px; font-weight: 700; color: #1f2937; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-shipping-fast" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 10px; border-radius: 10px; font-size: 16px;"></i> Dispatch Summary Report
                        </h3>
                        
                        <!-- Dispatch Stats Cards -->
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-bottom: 25px;">
                            <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 20px; border-radius: 12px; color: white; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3); transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                                <div style="font-size: 13px; opacity: 0.9; margin-bottom: 6px; font-weight: 500;">📋 Total Orders</div>
                                <div style="font-size: 32px; font-weight: 700;" id="statTotalOrders">0</div>
                            </div>
                            <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 20px; border-radius: 12px; color: white; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3); transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                                <div style="font-size: 13px; opacity: 0.9; margin-bottom: 6px; font-weight: 500;">📦 Devices Dispatched</div>
                                <div style="font-size: 32px; font-weight: 700;" id="statTotalDispatched">0</div>
                            </div>
                            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; border-radius: 12px; color: white; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                                <div style="font-size: 13px; opacity: 0.9; margin-bottom: 6px; font-weight: 500;">✅ Dispatch Completed</div>
                                <div style="font-size: 32px; font-weight: 700;" id="statCompletedOrders">0</div>
                            </div>
                            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 20px; border-radius: 12px; color: white; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3); transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                                <div style="font-size: 13px; opacity: 0.9; margin-bottom: 6px; font-weight: 500;">⏳ Dispatch Pending</div>
                                <div style="font-size: 32px; font-weight: 700;" id="statPendingOrders">0</div>
                            </div>
                        </div>
                        

                        
                        <div style="overflow-x: auto;">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Order ID</th>
                                        <th>Customer Name</th>
                                        <th>Order Date</th>
                                        <th>Total Items</th>
                                        <th>Dispatched</th>
                                        <th>Remaining</th>
                                        <th>Status</th>
                                        <th>Last Dispatch</th>
                                    </tr>
                                </thead>
                                <tbody id="dispatchSummaryTableBody">
                                    <tr><td colspan="8" class="loading">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <!-- Activity History -->
                    <div style="padding: 25px; background: white; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.05);">
                        <h3 style="margin-bottom: 20px; font-size: 20px; font-weight: 700; color: #1f2937; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-history" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 10px; border-radius: 10px; font-size: 16px;"></i> Recent Activity
                        </h3>
                        <div style="overflow-x: auto;">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Date/Time</th>
                                        <th>Serial No</th>
                                        <th>Old Status</th>
                                        <th>New Status</th>
                                        <th>Changed By</th>
                                        <th>Reason</th>
                                    </tr>
                                </thead>
                                <tbody id="activityTableBody">
                                    <tr><td colspan="6" class="loading">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- ============================================ -->
            <!-- END OF INVENTORY MANAGEMENT PAGES -->
            <!-- ============================================ -->

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
                        
                        <!-- Inventory Upload Section -->
                        <div style="border: 2px dashed #e5e7eb; border-radius: 8px; padding: 30px; background: #f9fafb;">
                            <div style="text-align: center; margin-bottom: 20px;">
                                <i class="fas fa-warehouse" style="font-size: 48px; color: #8b5cf6; margin-bottom: 15px;"></i>
                                <h3 style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 10px;">Upload Inventory Data</h3>
                                <p style="color: #6b7280; font-size: 14px;">Upload Excel file with device inventory</p>
                            </div>
                            <form id="inventoryExcelForm" onsubmit="uploadInventoryExcel(event)">
                                <div class="form-group">
                                    <label>Select Excel File *</label>
                                    <input type="file" name="inventoryFile" accept=".xlsx,.xls" required style="padding: 8px;">
                                </div>
                                <button type="submit" class="btn-primary" style="width: 100%;">
                                    <i class="fas fa-upload"></i> Upload Inventory
                                </button>
                            </form>
                            <div id="inventoryUploadStatus" style="margin-top: 15px; padding: 10px; border-radius: 6px; display: none;"></div>
                            
                            <div style="margin-top: 25px; padding: 15px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                                <h4 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 10px;">Expected Columns:</h4>
                                <div style="font-size: 12px; color: #6b7280; line-height: 1.6;">
                                    <p><strong>Required:</strong> Device Serial_No, Model_Name</p>
                                    <p><strong>Optional:</strong> In_Date, Dispatch Date, Cust Code, Sale Date, Customer Name, Cust City, Cust Mobile, Dispatch Reason, Warranty Provide, If Replace Old S. No., License Renew Time, User id, Password, Account Activation date, Account Expiry Date, Order Id</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Dispatch Excel Upload Section -->
                        <div style="border: 2px dashed #e5e7eb; border-radius: 8px; padding: 30px; background: #f9fafb;">
                            <div style="text-align: center; margin-bottom: 20px;">
                                <i class="fas fa-shipping-fast" style="font-size: 48px; color: #f59e0b; margin-bottom: 15px;"></i>
                                <h3 style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 10px;">Upload Dispatch Data</h3>
                                <p style="color: #6b7280; font-size: 14px;">Match devices and create dispatch records</p>
                            </div>
                            <form id="dispatchExcelForm" onsubmit="uploadDispatchExcel(event)">
                                <div class="form-group">
                                    <label>Select Excel File *</label>
                                    <input type="file" name="dispatchFile" accept=".xlsx,.xls" required style="padding: 8px;">
                                </div>
                                <button type="submit" class="btn-primary" style="width: 100%;">
                                    <i class="fas fa-upload"></i> Upload Dispatch Data
                                </button>
                            </form>
                            <div id="dispatchUploadStatus" style="margin-top: 15px; padding: 10px; border-radius: 6px; display: none;"></div>
                            
                            <div style="margin-top: 25px; padding: 15px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                                <h4 style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 10px;">Expected Columns:</h4>
                                <div style="font-size: 12px; color: #6b7280; line-height: 1.6;">
                                    <p><strong>Headers:</strong> Device Serial Number, Device Name, QC Status, Dispatch Reason, Order Id, Cust Code, Customer Name, Company Name, Dispatch Date, Courier Company, Dispatch Method, Tracking ID</p>
                                    <p style="margin-top: 8px;"><strong>Note:</strong> System will match devices by Serial Number and create dispatch records automatically</p>
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
                
                <!-- Balance Payment Summary Cards -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
                    <div class="card" style="background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); color: white;">
                        <div style="padding: 10px;">
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                <i class="fas fa-money-bill-wave"></i> Current Month Balance
                            </div>
                            <div style="font-size: 32px; font-weight: 700;" id="reportBalanceCurrentMonth">₹0</div>
                            <div style="font-size: 12px; opacity: 0.8; margin-top: 5px;" id="reportBalanceCurrentMonthCount">0 pending orders</div>
                        </div>
                    </div>
                    
                    <div class="card" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white;">
                        <div style="padding: 10px;">
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                <i class="fas fa-calendar-alt"></i> Quarterly Balance
                            </div>
                            <div style="font-size: 32px; font-weight: 700;" id="reportBalanceQuarterly">₹0</div>
                            <div style="font-size: 12px; opacity: 0.8; margin-top: 5px;" id="reportBalanceQuarterlyCount">0 pending orders</div>
                        </div>
                    </div>
                    
                    <div class="card" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white;">
                        <div style="padding: 10px;">
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">
                                <i class="fas fa-chart-line"></i> YTD Balance
                            </div>
                            <div style="font-size: 32px; font-weight: 700;" id="reportBalanceYTD">₹0</div>
                            <div style="font-size: 12px; opacity: 0.8; margin-top: 5px;" id="reportBalanceYTDCount">0 pending orders</div>
                        </div>
                    </div>
                </div>
                
                <!-- Current Month Balance Payment Pie Chart -->
                <div class="card" style="margin-bottom: 30px; cursor: pointer;" onclick="openBalancePaymentReportModal()">
                    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="card-title">Current Month Balance Payment Status</h3>
                        <span style="color: #6b7280; font-size: 14px;"><i class="fas fa-info-circle"></i> Click chart to view detailed report</span>
                    </div>
                    <div style="max-height: 350px; padding: 20px; display: flex; justify-content: center; align-items: center;">
                        <div style="width: 300px; height: 300px;">
                            <canvas id="balancePaymentPieChart"></canvas>
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
                                    <th>Email</th>
                                    <th>Full Name</th>
                                    <th>Role</th>
                                    <th>Employee Name</th>
                                    <th>Permissions</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="usersTableBody">
                                <tr><td colspan="9" class="loading">Loading...</td></tr>
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

        <!-- Balance Payment Report Modal -->
        <div class="modal" id="balancePaymentReportModal">
            <div class="modal-content" style="max-width: 1200px;">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;"><i class="fas fa-chart-pie"></i> Balance Payment Report</h2>
                    <span class="close" onclick="document.getElementById('balancePaymentReportModal').classList.remove('show')">&times;</span>
                </div>
                
                <!-- Report Tabs -->
                <div class="tabs" style="margin-bottom: 20px; border-bottom: 2px solid #e5e7eb;">
                    <button class="tab-btn active" onclick="switchBalanceReportTab('current-month')" id="report-current-month-tab">
                        <i class="fas fa-calendar-alt"></i> Current Month
                    </button>
                    <button class="tab-btn" onclick="switchBalanceReportTab('quarter')" id="report-quarter-tab">
                        <i class="fas fa-calendar-check"></i> Quarter
                    </button>
                    <button class="tab-btn" onclick="switchBalanceReportTab('ytd')" id="report-ytd-tab">
                        <i class="fas fa-chart-line"></i> YTD
                    </button>
                    <button class="tab-btn" onclick="switchBalanceReportTab('employee')" id="report-employee-tab">
                        <i class="fas fa-users"></i> Employee-wise
                    </button>
                </div>
                
                <!-- Current Month Content -->
                <div id="report-current-month-content" class="tab-content">
                    <div style="margin-bottom: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div style="padding: 15px; background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); color: white; border-radius: 8px;">
                            <div style="font-size: 13px; opacity: 0.9;">Total Balance</div>
                            <div style="font-size: 24px; font-weight: 700;" id="currentMonthBalanceTotal">₹0</div>
                        </div>
                        <div style="padding: 15px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border-radius: 8px;">
                            <div style="font-size: 13px; opacity: 0.9;">Pending Orders</div>
                            <div style="font-size: 24px; font-weight: 700;" id="currentMonthPendingCount">0</div>
                        </div>
                    </div>
                    <div style="overflow-x: auto; max-height: 400px;">
                        <table class="data-table">
                            <thead style="position: sticky; top: 0; background: #f9fafb; z-index: 10;">
                                <tr>
                                    <th>Order ID</th>
                                    <th>Customer Name</th>
                                    <th>Company</th>
                                    <th>Employee</th>
                                    <th>Sale Date</th>
                                    <th>Total Amount</th>
                                    <th>Received</th>
                                    <th>Balance</th>
                                </tr>
                            </thead>
                            <tbody id="currentMonthBalanceTable">
                                <tr><td colspan="8" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Quarter Content -->
                <div id="report-quarter-content" class="tab-content" style="display: none;">
                    <div style="margin-bottom: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div style="padding: 15px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border-radius: 8px;">
                            <div style="font-size: 13px; opacity: 0.9;">Total Balance</div>
                            <div style="font-size: 24px; font-weight: 700;" id="quarterBalanceTotal">₹0</div>
                        </div>
                        <div style="padding: 15px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border-radius: 8px;">
                            <div style="font-size: 13px; opacity: 0.9;">Pending Orders</div>
                            <div style="font-size: 24px; font-weight: 700;" id="quarterPendingCount">0</div>
                        </div>
                    </div>
                    <div style="overflow-x: auto; max-height: 400px;">
                        <table class="data-table">
                            <thead style="position: sticky; top: 0; background: #f9fafb; z-index: 10;">
                                <tr>
                                    <th>Order ID</th>
                                    <th>Customer Name</th>
                                    <th>Company</th>
                                    <th>Employee</th>
                                    <th>Sale Date</th>
                                    <th>Total Amount</th>
                                    <th>Received</th>
                                    <th>Balance</th>
                                </tr>
                            </thead>
                            <tbody id="quarterBalanceTable">
                                <tr><td colspan="8" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- YTD Content -->
                <div id="report-ytd-content" class="tab-content" style="display: none;">
                    <div style="margin-bottom: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div style="padding: 15px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border-radius: 8px;">
                            <div style="font-size: 13px; opacity: 0.9;">Total Balance</div>
                            <div style="font-size: 24px; font-weight: 700;" id="ytdBalanceTotal">₹0</div>
                        </div>
                        <div style="padding: 15px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border-radius: 8px;">
                            <div style="font-size: 13px; opacity: 0.9;">Pending Orders</div>
                            <div style="font-size: 24px; font-weight: 700;" id="ytdPendingCount">0</div>
                        </div>
                    </div>
                    <div style="overflow-x: auto; max-height: 400px;">
                        <table class="data-table">
                            <thead style="position: sticky; top: 0; background: #f9fafb; z-index: 10;">
                                <tr>
                                    <th>Order ID</th>
                                    <th>Customer Name</th>
                                    <th>Company</th>
                                    <th>Employee</th>
                                    <th>Sale Date</th>
                                    <th>Total Amount</th>
                                    <th>Received</th>
                                    <th>Balance</th>
                                </tr>
                            </thead>
                            <tbody id="ytdBalanceTable">
                                <tr><td colspan="8" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Employee-wise Content -->
                <div id="report-employee-content" class="tab-content" style="display: none;">
                    <div class="tabs" style="margin-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
                        <button class="tab-btn active" onclick="loadEmployeeBalanceReport('current-month')" id="employee-current-month-tab">
                            Current Month
                        </button>
                        <button class="tab-btn" onclick="loadEmployeeBalanceReport('quarter')" id="employee-quarter-tab">
                            Quarter
                        </button>
                        <button class="tab-btn" onclick="loadEmployeeBalanceReport('ytd')" id="employee-ytd-tab">
                            YTD
                        </button>
                    </div>
                    <div style="overflow-x: auto; max-height: 400px;">
                        <table class="data-table">
                            <thead style="position: sticky; top: 0; background: #f9fafb; z-index: 10;">
                                <tr>
                                    <th>Employee Name</th>
                                    <th>Pending Orders</th>
                                    <th>Total Balance</th>
                                    <th>Total Sales</th>
                                    <th>Total Received</th>
                                    <th>Collection %</th>
                                </tr>
                            </thead>
                            <tbody id="employeeBalanceTable">
                                <tr><td colspan="6" class="loading">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
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
                            <label id="editAccountLabel">In Account Received</label>
                            <select name="account_received" id="editAccountReceived">
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

        <!-- Order Details Modal (from Dispatch Summary) -->
        <div class="modal" id="orderDetailsModal">
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h2 style="font-size: 20px; font-weight: 600;">Order Details</h2>
                    <span class="close" onclick="document.getElementById('orderDetailsModal').classList.remove('show')">&times;</span>
                </div>
                <div id="orderDetailsContent" style="padding: 20px;">
                    <div class="loading">Loading...</div>
                </div>
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
                        <label>Email *</label>
                        <input type="email" name="username" required placeholder="Enter email address">
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
                        <label>Email *</label>
                        <input type="email" name="username" id="editUserUsername" required readonly style="background: #f3f4f6;">
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
                        <label>Module Permissions *</label>
                        
                        <!-- Sales Module -->
                        <div style="margin-bottom: 15px; padding: 12px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe;">
                            <div style="font-weight: 600; color: #1e40af; margin-bottom: 8px;">
                                <i class="fas fa-shopping-cart"></i> Sales Module
                            </div>
                            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                                <label style="display: flex; align-items: center; gap: 5px; cursor: not-allowed; opacity: 0.6;">
                                    <input type="checkbox" checked disabled style="cursor: not-allowed;">
                                    <span>View</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                    <input type="checkbox" id="editUserSalesEdit" name="sales_edit" value="1">
                                    <span>Edit</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                    <input type="checkbox" id="editUserSalesDelete" name="sales_delete" value="1">
                                    <span>Delete</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Inventory Module -->
                        <div style="margin-bottom: 15px; padding: 12px; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0;">
                            <div style="font-weight: 600; color: #15803d; margin-bottom: 8px;">
                                <i class="fas fa-warehouse"></i> Inventory Module
                            </div>
                            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                                <label style="display: flex; align-items: center; gap: 5px; cursor: not-allowed; opacity: 0.6;">
                                    <input type="checkbox" checked disabled style="cursor: not-allowed;">
                                    <span>View</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                    <input type="checkbox" id="editUserInventoryEdit" name="inventory_edit" value="1">
                                    <span>Edit</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                    <input type="checkbox" id="editUserInventoryDelete" name="inventory_delete" value="1">
                                    <span>Delete</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Leads Module -->
                        <div style="margin-bottom: 15px; padding: 12px; background: #fef3c7; border-radius: 6px; border: 1px solid #fde68a;">
                            <div style="font-weight: 600; color: #92400e; margin-bottom: 8px;">
                                <i class="fas fa-user-plus"></i> Leads Module
                            </div>
                            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                                <label style="display: flex; align-items: center; gap: 5px; cursor: not-allowed; opacity: 0.6;">
                                    <input type="checkbox" checked disabled style="cursor: not-allowed;">
                                    <span>View</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                    <input type="checkbox" id="editUserLeadsEdit" name="leads_edit" value="1">
                                    <span>Edit</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                    <input type="checkbox" id="editUserLeadsDelete" name="leads_delete" value="1">
                                    <span>Delete</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Reports Module -->
                        <div style="margin-bottom: 15px; padding: 12px; background: #fce7f3; border-radius: 6px; border: 1px solid #fbcfe8;">
                            <div style="font-weight: 600; color: #9f1239; margin-bottom: 8px;">
                                <i class="fas fa-chart-bar"></i> Reports Module
                            </div>
                            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                                <label style="display: flex; align-items: center; gap: 5px; cursor: not-allowed; opacity: 0.6;">
                                    <input type="checkbox" checked disabled style="cursor: not-allowed;">
                                    <span>View</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                                    <input type="checkbox" id="editUserReportsEdit" name="reports_edit" value="1">
                                    <span>Edit</span>
                                </label>
                            </div>
                        </div>
                        
                        <small style="color: #6b7280; display: block; margin-top: 5px;">
                            <i class="fas fa-info-circle"></i> View permission is always enabled for all modules. Grant Edit and Delete permissions per module as needed.
                        </small>
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
                    <h2 style="font-size: 20px; font-weight: 600;">Create New Quotation</h2>
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
                                <input type="text" id="quotationCustomerSearch" placeholder="Enter customer code or mobile number" 
                                       onkeypress="if(event.key==='Enter'){event.preventDefault();fetchCustomerForQuotation(this.value);}"
                                       onblur="fetchCustomerForQuotation(this.value)">
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
                    
                    <!-- Courier and Bill Type -->
                    <div class="form-row" style="margin-top: 20px;">
                        <div class="form-group">
                            <label>Courier Partner</label>
                            <select id="quotationCourierPartner" name="courier_partner" onchange="loadDeliveryMethods()">
                                <option value="">Select Courier Partner</option>
                                <option value="DTDC">DTDC</option>
                                <option value="Blue Dart">Blue Dart</option>
                                <option value="Delhivery">Delhivery</option>
                                <option value="Professional Courier">Professional Courier</option>
                                <option value="Self Pickup">Self Pickup</option>
                                <option value="Hand Delivery">Hand Delivery</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Delivery Method</label>
                            <select id="quotationDeliveryMethod" name="delivery_method" onchange="calculateCourierCharges()">
                                <option value="">Select Delivery Method</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Estimated Weight (kg)</label>
                            <input type="number" id="quotationWeight" name="weight" min="0" step="0.1" value="1" onchange="calculateCourierCharges()" placeholder="Package weight">
                        </div>
                        <div class="form-group">
                            <label>Courier Charges (Auto-calculated)</label>
                            <input type="number" id="quotationCourierCost" name="courier_cost" min="0" step="0.01" value="0" readonly style="background: #f3f4f6;">
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

        <!-- Create Dispatch Modal -->
        <div id="createDispatchModal" class="modal">
            <div class="modal-content" style="max-width: 1200px; max-height: 90vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
                    <h2 style="font-size: 24px; font-weight: 700; color: #1f2937;">
                        <i class="fas fa-shipping-fast" style="color: #10b981;"></i> Create Dispatch
                    </h2>
                    <button onclick="closeCreateDispatchModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Step 1: Select Order -->
                <div id="dispatchStep1" class="dispatch-step">
                    <div class="card" style="background: #f0fdf4; border: 2px solid #10b981;">
                        <h3 style="margin-bottom: 15px; color: #065f46;">
                            <i class="fas fa-shopping-cart"></i> Step 1: Select Order
                        </h3>
                        <div class="form-group">
                            <label>Search & Select Order ID *</label>
                            <input type="text" id="orderSearchInput" 
                                placeholder="Type to search order ID, customer name..." 
                                oninput="searchOrders()"
                                style="width: 100%; padding: 12px; border: 2px solid #10b981; border-radius: 8px; font-size: 16px;">
                        </div>
                        <div id="orderSearchResults" style="max-height: 300px; overflow-y: auto; margin-top: 10px;"></div>
                    </div>
                </div>

                <!-- Step 2: Order Details & Scan Products -->
                <div id="dispatchStep2" class="dispatch-step" style="display: none;">
                    <!-- Order Summary -->
                    <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; margin-bottom: 20px;">
                        <h3 style="color: white; margin-bottom: 15px;">
                            <i class="fas fa-info-circle"></i> Order Details
                        </h3>
                        <div id="orderSummary" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;"></div>
                    </div>

                    <!-- Products to Dispatch -->
                    <div class="card" style="margin-bottom: 20px;">
                        <h3 style="margin-bottom: 15px;">
                            <i class="fas fa-boxes"></i> Products to Dispatch
                        </h3>
                        <div id="orderProductsList"></div>
                    </div>

                    <!-- Barcode Scanning Section -->
                    <div class="card" style="border: 3px dashed #10b981; background: #f0fdf4;">
                        <h3 style="margin-bottom: 15px; color: #065f46;">
                            <i class="fas fa-barcode"></i> Scan Products (Barcode Scanner Ready)
                        </h3>
                        <div class="form-group">
                            <label>Scan Device Serial Number</label>
                            <input type="text" id="scanDeviceInput" 
                                placeholder="Scan barcode or type serial number..." 
                                onkeypress="if(event.key==='Enter') scanDevice()"
                                autofocus
                                style="width: 100%; padding: 16px; border: 3px solid #10b981; border-radius: 8px; font-size: 18px; font-weight: 600;">
                        </div>
                        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <button onclick="scanDevice()" class="btn-primary" style="flex: 1; background: #10b981; padding: 12px;">
                                <i class="fas fa-check"></i> Add Device
                            </button>
                            <button onclick="clearScanInput()" class="btn-secondary" style="flex: 1;">
                                <i class="fas fa-times"></i> Clear
                            </button>
                        </div>
                        <div id="scanStatus" style="margin-top: 10px; padding: 12px; border-radius: 6px; display: none;"></div>
                    </div>

                    <!-- Scanned Devices List -->
                    <div class="card" style="margin-top: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h3>
                                <i class="fas fa-check-circle" style="color: #10b981;"></i> Scanned Devices
                            </h3>
                            <div style="background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; font-weight: 700;">
                                <span id="scannedCount">0</span> Scanned
                            </div>
                        </div>
                        <div id="scannedDevicesList" style="max-height: 300px; overflow-y: auto;"></div>
                    </div>

                    <!-- Dispatch Details -->
                    <div class="card" style="margin-top: 20px;">
                        <h3 style="margin-bottom: 15px;">
                            <i class="fas fa-shipping-fast"></i> Dispatch Details
                        </h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="form-group">
                                <label>Dispatch Date *</label>
                                <input type="date" id="newDispatchDate" required>
                            </div>
                            <div class="form-group">
                                <label>Courier Company</label>
                                <select id="newDispatchCourier">
                                    <option value="">Select Courier</option>
                                    <option value="Trackon">Trackon</option>
                                    <option value="DTDC">DTDC</option>
                                    <option value="Porter">Porter</option>
                                    <option value="Self Pick">Self Pick</option>
                                    <option value="We delivered">We delivered</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Dispatch Method</label>
                                <select id="newDispatchMethod">
                                    <option value="">Select Method</option>
                                    <option value="AIR">Air</option>
                                    <option value="Surface">Surface</option>
                                    <option value="Priority">Priority</option>
                                    <option value="Bus">Bus</option>
                                    <option value="Self Pickup">Self Pickup</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Notes</label>
                                <input type="text" id="newDispatchNotes" placeholder="Optional notes">
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div style="display: flex; gap: 15px; margin-top: 25px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                        <button onclick="goBackToOrderSelection()" class="btn-secondary" style="flex: 1;">
                            <i class="fas fa-arrow-left"></i> Back to Order Selection
                        </button>
                        <button onclick="submitCreateDispatch()" id="submitDispatchBtn" class="btn-primary" style="flex: 2; background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 16px; font-size: 16px; font-weight: 700;" disabled>
                            <i class="fas fa-paper-plane"></i> Create Dispatch (<span id="submitCount">0</span> devices)
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Replacement Modal -->
        <div id="replacementModal" class="modal">
            <div class="modal-content" style="max-width: 800px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
                    <h2 style="font-size: 24px; font-weight: 700; color: #1f2937;">
                        <i class="fas fa-exchange-alt" style="color: #f59e0b;"></i> Device Replacement
                    </h2>
                    <button onclick="closeReplacementModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <form onsubmit="submitReplacement(event)">
                    <div class="card" style="background: #fef3c7; border: 2px solid #f59e0b; margin-bottom: 20px;">
                        <p style="margin: 0; color: #92400e; font-size: 14px;">
                            <i class="fas fa-info-circle"></i> <strong>Note:</strong> This will mark the old device as "Returned" and dispatch the new device to the same customer with the same order details.
                        </p>
                    </div>

                    <div class="form-group">
                        <label>Old Device Serial Number *</label>
                        <input type="text" id="oldDeviceSerialNo" required
                            placeholder="Scan or enter old device serial number"
                            onchange="fetchOldDeviceDetails()"
                            style="width: 100%; padding: 12px; border: 2px solid #f59e0b; border-radius: 8px; font-size: 16px;">
                    </div>

                    <div class="form-group">
                        <label>New Device Serial Number *</label>
                        <input type="text" id="newDeviceSerialNo" required
                            placeholder="Scan or enter new device serial number"
                            style="width: 100%; padding: 12px; border: 2px solid #10b981; border-radius: 8px; font-size: 16px;">
                    </div>

                    <!-- Auto-fetched Details -->
                    <div id="oldDeviceDetails" style="display: none; background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-bottom: 15px; color: #374151; font-size: 16px;">
                            <i class="fas fa-info-circle"></i> Customer Details (Auto-fetched)
                        </h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 14px;">
                            <div>
                                <strong>Order ID:</strong><br/>
                                <span id="replacementOrderId" style="color: #6b7280;">-</span>
                            </div>
                            <div>
                                <strong>Customer Name:</strong><br/>
                                <span id="replacementCustomerName" style="color: #6b7280;">-</span>
                            </div>
                            <div>
                                <strong>Mobile Number:</strong><br/>
                                <span id="replacementMobile" style="color: #6b7280;">-</span>
                            </div>
                            <div>
                                <strong>Company:</strong><br/>
                                <span id="replacementCompany" style="color: #6b7280;">-</span>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Replacement Reason *</label>
                        <textarea id="replacementReason" required rows="3"
                            placeholder="Enter reason for replacement (e.g., Defective, Upgrade, Customer Request)"
                            style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px;"></textarea>
                    </div>

                    <div style="display: flex; gap: 15px; margin-top: 25px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                        <button type="button" onclick="closeReplacementModal()" class="btn-secondary" style="flex: 1;">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                        <button type="submit" class="btn-primary" style="flex: 2; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 16px;">
                            <i class="fas fa-exchange-alt"></i> Replace Device
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Tracking Details Modal - Form Only -->
        <div id="trackingDetailsModal" class="modal">
            <div class="modal-content" style="max-width: 550px; max-height: 90vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
                    <h2 style="font-size: 24px; font-weight: 700; color: #1f2937;">
                        <i class="fas fa-truck" style="color: #8b5cf6;"></i> Add Tracking Details
                    </h2>
                    <button onclick="closeTrackingDetailsModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Form Only -->
                <div>
                    <div class="card" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; margin-bottom: 20px;">
                        <h3 style="color: white; margin-bottom: 15px;">
                            <i class="fas fa-plus-circle"></i> Add Tracking Details
                        </h3>
                        <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0;">
                            Enter order tracking information to link with sales data
                        </p>
                    </div>

                    <form onsubmit="submitTrackingDetails(event)" style="margin-top: 20px;">
                        <div class="form-group">
                            <label>Order ID *</label>
                            <input type="text" id="trackingOrderId" 
                                placeholder="Enter Order ID from Sales" 
                                required
                                style="width: 100%; padding: 12px; border: 2px solid #8b5cf6; border-radius: 8px; font-size: 14px;">
                            <small style="color: #6b7280; display: block; margin-top: 5px;">
                                <i class="fas fa-info-circle"></i> Must match an existing Order ID in sales
                            </small>
                        </div>

                        <div class="form-group">
                            <label>Courier Partner *</label>
                            <select id="trackingCourierPartner" required
                                style="width: 100%; padding: 12px; border: 2px solid #8b5cf6; border-radius: 8px; font-size: 14px;">
                                <option value="">-- Select Courier Partner --</option>
                                <option value="Trackon">Trackon</option>
                                <option value="DTDC">DTDC</option>
                                <option value="Porter">Porter</option>
                                <option value="Self Pick">Self Pick</option>
                                <option value="By Bus">By Bus</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Courier Mode *</label>
                            <select id="trackingCourierMode" required
                                style="width: 100%; padding: 12px; border: 2px solid #8b5cf6; border-radius: 8px; font-size: 14px;">
                                <option value="">-- Select Mode --</option>
                                <option value="Air">Air</option>
                                <option value="Surface">Surface</option>
                                <option value="Express">Express</option>
                                <option value="Standard">Standard</option>
                                <option value="Priority">Priority</option>
                                <option value="Economy">Economy</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Tracking ID *</label>
                            <input type="text" id="trackingTrackingId" 
                                placeholder="e.g., TRACK123456789" 
                                required
                                style="width: 100%; padding: 12px; border: 2px solid #8b5cf6; border-radius: 8px; font-size: 14px;">
                        </div>

                        <button type="submit" class="btn-primary" 
                            style="width: 100%; padding: 15px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); font-size: 16px; font-weight: 700; margin-top: 10px;">
                            <i class="fas fa-save"></i> Save Tracking Details
                        </button>
                    </form>

                    <!-- Recent Tracking Info -->
                    <div id="trackingFormStatus" style="margin-top: 15px; padding: 12px; border-radius: 8px; display: none;"></div>
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
            
            // Dropdown menu functions
            function toggleAddNewDropdown() {
                const dropdown = document.getElementById('addNewDropdown');
                const isCurrentlyOpen = dropdown.classList.contains('show');
                
                // Close all dropdowns first
                closeAllDropdowns();
                
                // Toggle the current dropdown (open if it was closed, keep closed if it was open)
                if (!isCurrentlyOpen) {
                    dropdown.classList.add('show');
                }
            }
            
            function closeAllDropdowns() {
                const dropdowns = document.querySelectorAll('.dropdown-content');
                dropdowns.forEach(dropdown => dropdown.classList.remove('show'));
            }
            
            // Close dropdowns when clicking outside
            document.addEventListener('click', function(event) {
                // Check if click is outside dropdown button and dropdown content
                const dropdown = event.target.closest('.dropdown');
                const isDropdownButton = event.target.closest('button[onclick*="toggleAddNewDropdown"]');
                
                if (!dropdown && !isDropdownButton) {
                    closeAllDropdowns();
                }
            });
            
            // Modal opening functions
            function openAddSaleModal() {
                document.getElementById('newSaleModal').classList.add('show');
            }
            
            function openNewLeadModal() {
                document.getElementById('newLeadModal').classList.add('show');
            }
            
            function openBalancePaymentModal() {
                document.getElementById('balancePaymentModal').classList.add('show');
            }
            
            function openQuotationModal() {
                document.getElementById('newQuotationModal').classList.add('show');
            }
            
            function openAddInventoryModal() {
                document.getElementById('addInventoryModal').classList.add('show');
            }
            
            function openDispatchModal() {
                document.getElementById('createDispatchModal').classList.add('show');
            }
            
            function openQCModal() {
                document.getElementById('newQCModal').classList.add('show');
            }
            
            // Product Catalog with Categories
            const productCatalog = {
                'MDVR': [
                    { name: '4ch 1080p SD Card MDVR (MR9504EC)', code: 'AXG01', weight: 1 },
                    { name: '4ch 1080p HDD MDVR (MR9704C)', code: 'AXG02', weight: 2 },
                    { name: '4ch 1080p SD, 4G, GPS MDVR (MR9504E)', code: 'AXG03', weight: 1 },
                    { name: '4ch 1080p SD, 4G, GPS MDVR (MR9504E-A3)', code: 'AXG73', weight: 1 },
                    { name: '4ch 1080p HDD, 4G, GPS MDVR (MR9704E)', code: 'AXG04', weight: 2 },
                    { name: 'TVS 4ch 1080p SD, 4G, GPS MDVR', code: 'TVS43', weight: 1 },
                    { name: '5ch MDVR SD 4g + GPS + LAN + RS232 + RS485', code: 'AXG46', weight: 1 },
                    { name: '5ch MDVR HDD 4g + GPS + LAN + RS232 + RS485', code: 'AXG47', weight: 2.2 },
                    { name: '4ch 1080p SD, 4G, wifi, GPS MDVR (MA9504ED)', code: 'AXG58', weight: 1 },
                    { name: 'AI MDVR with (DSM + ADAS) (SD+ 4g + GPS)', code: 'AXG38', weight: 2 },
                    { name: 'AI MDVR with (DSM + ADAS) (SD+HDD+ 4g + GPS)', code: 'AXG72', weight: 3 }
                ],
                'Monitor & Monitor Kit': [
                    { name: '7 " AV Monitor', code: 'AXGAA', weight: 1 },
                    { name: '7" VGA Monitor', code: 'AXGAB', weight: 1 },
                    { name: '7" HDMI Monitor', code: 'AXGB1', weight: 1 },
                    { name: '7 inch Heavy Duty VGA Monitor', code: 'AXGAC', weight: 1 },
                    { name: '4k Recording monitor kit 2ch', code: 'AXGAH', weight: 2 },
                    { name: '4 inch AV monitor', code: 'AXGAD', weight: 0.6 },
                    { name: '720 2ch Recording Monitor Kit', code: 'AXGAF', weight: 3 },
                    { name: '4k Recording monitor kit 4ch', code: 'AXGAG', weight: 2 }
                ],
                'Dashcam': [
                    { name: '4 Inch 2 Ch Dashcam', code: 'AXGCA', weight: 0.4 },
                    { name: '10 inch 2 Ch Full Touch Dashcam', code: 'AXGCB', weight: 0.75 },
                    { name: '10 inch 2 Ch 4g, GPS, Android Dashcam', code: 'AXGCD', weight: 0.75 },
                    { name: '4k Dashcam 12 inch', code: 'AXGCE', weight: 0.75 },
                    { name: '2k 12 inch Dashcam', code: 'AXGCF', weight: 0.75 },
                    { name: '2ch 4g Dashcam MT95L', code: 'AXGCG', weight: 1 },
                    { name: '3ch AI Dashcam ADAS + DSM (MT95C)', code: 'AXGCJ', weight: 1 },
                    { name: 'wifi Dash Cam', code: 'AXGCK', weight: 0.3 },
                    { name: '4 inch 3 camera Dash Cam', code: 'AXGCL', weight: 0.4 },
                    { name: '4 inch Android Dashcam', code: 'AXGCM', weight: 0.5 },
                    { name: '3ch 4g Dashcam with Rear Camera (MT95L-A3)', code: 'AXGCH', weight: 1 },
                    { name: '3ch AI Dashcam ADAS + DSM (MT95C)', code: 'AXGCJ', weight: 1 }
                ],
                'Cameras': [
                    { name: '2 MP IR indoor Dome Camera', code: 'AXGBA', weight: 0.4 },
                    { name: '2 MP IR Outdoor Bullet Camera', code: 'AXGBB', weight: 0.4 },
                    { name: '2 MP Heavy Duty Bullet Camera', code: 'AXGBC', weight: 0.5 },
                    { name: '2 MP Heavy Duty Dome Camera', code: 'AXGBD', weight: 0.5 },
                    { name: 'PTZ Camera', code: 'AXGBE', weight: 1 },
                    { name: '4k Monitor Camera', code: 'AXGBF', weight: 0.3 },
                    { name: '2 MP IP Camera', code: 'AXGBQ', weight: 0.3 },
                    { name: 'Replacement Bullet Camera 2mp', code: 'AXGBG', weight: 0.3 },
                    { name: 'Replacement Dome Camera 2 mp', code: 'AXGBH', weight: 0.3 },
                    { name: 'Replacement Dome Audio Camera', code: 'AXGBI', weight: 0.3 },
                    { name: 'Reverse Camera', code: 'AXGBJ', weight: 0.3 },
                    { name: '2mp IR Audio Camera', code: 'AXGBK', weight: 0.3 },
                    { name: 'DFMS Camera', code: 'AXGBL', weight: 0.3 },
                    { name: 'ADAS Camera', code: 'AXGBM', weight: 0.3 },
                    { name: 'BSD Camera', code: 'AXGBN', weight: 0.3 },
                    { name: '2mp IP Dome Audio Camera', code: 'AXGBP', weight: 0.3 }
                ],
                'Storage': [
                    { name: 'Surveillance Grade 64GB SD Card', code: 'AXGEA', weight: 0.05 },
                    { name: 'Surveillance Grade 128GB SD Card', code: 'AXGEB', weight: 0.05 },
                    { name: 'Surveillance Grade 256GB SD Card', code: 'AXGEC', weight: 0.05 },
                    { name: 'Surveillance Grade 512GB SD Card', code: 'AXGED', weight: 0.05 },
                    { name: 'HDD 1 TB', code: 'AXGEE', weight: 0.2 }
                ],
                'RFID Tags': [
                    { name: '2.4G RFID Animal Ear Tag', code: 'AXGFA', weight: 0.01 },
                    { name: '2.4G Active Tag (Card Type) HX607', code: 'AXGFB', weight: 0.02 }
                ],
                'RFID Reader': [
                    { name: '2.4 GHZ RFID Active Reader (Bus)', code: 'AXGGA', weight: 2 },
                    { name: '2.4 GHZ RFID Active Reader (Campus)', code: 'AXGGB', weight: 2.5 },
                    { name: '2.4G IOT Smart RFID Reader (ZR7901P)', code: 'AXGGC', weight: 2 }
                ],
                'MDVR Accessories': [
                    { name: 'MDVR Security Box', code: 'AXGHS', weight: 0.8 },
                    { name: '2 way Communication Device', code: 'AXGHB', weight: 0.2 },
                    { name: 'MDVR Maintenance Tool', code: 'AXGHC', weight: 0.1 },
                    { name: 'MDVR Remote', code: 'AXGHD', weight: 0.1 },
                    { name: 'MDVR Panic Button', code: 'AXGHE', weight: 0.1 },
                    { name: 'MDVR Server', code: 'AXGHF', weight: 2 },
                    { name: 'RS 232 Adaptor', code: 'AXGHG', weight: 0.1 },
                    { name: '1mt Cable', code: 'AXGHN', weight: 0.2 },
                    { name: '3mt Cable', code: 'AXGHO', weight: 0.3 },
                    { name: '5mt Cable', code: 'AXGHH', weight: 0.3 },
                    { name: '10mt Cable', code: 'AXGHJ', weight: 0.6 },
                    { name: '15mt Cable', code: 'AXGHI', weight: 0.8 },
                    { name: 'Alcohol Tester', code: 'AXGHL', weight: 1 },
                    { name: 'VGA Cable', code: 'AXGHK', weight: 0.2 },
                    { name: 'Ultra Sonic Fuel Sensor', code: 'AXGHM', weight: 0.5 },
                    { name: 'Rod Type Fuel Sensor', code: 'AXGHQ', weight: 0.5 }
                ],
                'Other product and Accessories': [
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
                    case 'inventory-dispatch':
                        loadRecentDispatches();
                        loadTrackingRecords(); // Load tracking records for the form
                        document.getElementById('dispatchDate').value = new Date().toISOString().split('T')[0];
                        document.getElementById('dispatchedBy').value = currentUser.employeeName || currentUser.fullName;
                        break;
                    case 'inventory-qc':
                        loadQCData();
                        document.getElementById('qcCheckDate').value = new Date().toISOString().split('T')[0];
                        document.getElementById('qcCheckedBy').value = currentUser.employeeName || currentUser.fullName;
                        document.getElementById('qcScanInput').focus();
                        break;
                    case 'inventory-reports':
                        loadInventoryReports();
                        break;
                    case 'renewal':
                        loadRenewalData();
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
                                \${currentUser && currentUser.role === 'admin' ? '<button class="btn-danger" style="margin-left: 5px; padding: 5px 8px;" onclick="deleteSale(\\'' + sale.order_id + '\\')" title="Delete Sale"><i class="fas fa-trash"></i></button>' : ''}
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
                            <option value="MDVR">MDVR</option>
                            <option value="Monitor & Monitor Kit">Monitor & Monitor Kit</option>
                            <option value="Cameras">Cameras</option>
                            <option value="Dashcam">Dashcam</option>
                            <option value="Storage">Storage</option>
                            <option value="RFID Tags">RFID Tags</option>
                            <option value="RFID Reader">RFID Reader</option>
                            <option value="MDVR Accessories">MDVR Accessories</option>
                            <option value="Other product and Accessories">Other product and Accessories</option>
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
                const modal = document.getElementById('saleDetailsModal');
                modal.classList.remove('show');
                // Reset z-index to default
                modal.style.zIndex = '10000';
            }
            
            // Open Update Balance Modal with pre-filled Order ID
            function openUpdateBalanceModal(orderId) {
                openBalancePaymentModal();
                document.querySelector('#balancePaymentForm input[name="order_id"]').value = orderId;
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
                console.log('submitNewSale called');
                event.preventDefault();
                
                const form = event.target;
                const formData = new FormData(form);
                
                // Disable submit button to prevent double submission
                const submitBtn = form.querySelector('button[type="submit"]');
                const originalBtnText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                
                try {
                    // Build items array
                    const items = [];
                    document.querySelectorAll('.product-row').forEach((row) => {
                        const productSelect = row.querySelector('select[name*="product_name"]');
                        if (!productSelect || !productSelect.value) return;
                        
                        const productName = productSelect.options[productSelect.selectedIndex].text;
                        const qtyInput = row.querySelector('input[name*="quantity"]');
                        const priceInput = row.querySelector('input[name*="unit_price"]');
                        
                        const qty = parseFloat(qtyInput?.value) || 0;
                        const price = parseFloat(priceInput?.value) || 0;
                        
                        if (productSelect.value && qty > 0 && price > 0) {
                            items.push({
                                product_name: productName,
                                quantity: qty,
                                unit_price: price
                            });
                        }
                    });
                    
                    console.log('Items collected:', items);
                    
                    // Validate required fields
                    const customerName = formData.get('customer_name');
                    const saleDate = formData.get('sale_date');
                    const employeeName = formData.get('employee_name');
                    const saleType = formData.get('sale_type');
                    
                    if (!customerName) {
                        alert('⚠️ Customer name is required');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnText;
                        return;
                    }
                    
                    if (!saleDate) {
                        alert('⚠️ Sale date is required');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnText;
                        return;
                    }
                    
                    if (!employeeName) {
                        alert('⚠️ Employee name is required');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnText;
                        return;
                    }
                    
                    if (!saleType) {
                        alert('⚠️ Sale type is required (With GST / Without GST)');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnText;
                        return;
                    }
                    
                    const data = {
                        customer_code: formData.get('customer_code'),
                        customer_name: customerName,
                        company_name: formData.get('company_name'),
                        customer_contact: formData.get('mobile_number'),
                        sale_date: saleDate,
                        employee_name: employeeName,
                        sale_type: saleType,
                        courier_cost: parseFloat(formData.get('courier_cost')) || 0,
                        amount_received: parseFloat(formData.get('amount_received')) || 0,
                        account_received: formData.get('account_received'),
                        payment_reference: formData.get('payment_reference'),
                        remarks: formData.get('remarks'),
                        items: items
                    };
                    
                    console.log('Submitting sale data:', data);
                    
                    const response = await axios.post('/api/sales', data);
                    console.log('Sale response:', response.data);
                    
                    if (response.data.success) {
                        alert(\`✅ Sale added successfully!\\n\\nOrder ID: \${response.data.data.order_id}\\nTotal Amount: ₹\${response.data.data.total_amount.toLocaleString()}\`);
                        closeNewSaleModal();
                        loadDashboard();
                        // Reload current month sales if on that page
                        if (currentPage === 'current-month') {
                            loadCurrentMonthSales();
                        }
                    } else {
                        alert('❌ Error: ' + (response.data.error || 'Failed to add sale'));
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnText;
                    }
                } catch (error) {
                    console.error('Error adding sale:', error);
                    console.error('Error details:', error.response?.data);
                    alert('❌ Error adding sale:\\n\\n' + (error.response?.data?.error || error.message || 'Unknown error'));
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
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
                        form.reset();
                        loadBalancePayments();
                        loadBalancePaymentHistory();
                        loadDashboard();
                    } else {
                        alert('Error updating payment: ' + (response.data.error || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Balance payment error:', error);
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
                            <td>
                                \${isAdmin ? \`<button class="btn-primary" style="padding: 5px 12px; font-size: 12px;" onclick="event.stopPropagation(); editSale('\${sale.order_id}')"><i class="fas fa-edit"></i> Edit</button> <button class="btn-danger" style="padding: 5px 12px; font-size: 12px;" onclick="event.stopPropagation(); deleteSale('\${sale.order_id}')"><i class="fas fa-trash"></i></button>\` : '-'}
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
                                \${isAdmin ? \`<button class="btn-primary" style="padding: 5px 12px; font-size: 12px;" onclick="editLead(\${lead.id})"><i class="fas fa-edit"></i> Edit</button> <button class="btn-danger" style="padding: 5px 8px; font-size: 12px;" onclick="deleteLead(\${lead.id})"><i class="fas fa-trash"></i></button>\` : '-'}
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
                const resultContainer = document.getElementById('orderResult');
                
                if (!orderId) {
                    resultContainer.innerHTML = \`
                        <div style="text-align: center; padding: 40px; color: #9ca3af;">
                            <i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                            <p style="font-size: 16px;">Enter an Order ID to search</p>
                        </div>
                    \`;
                    return;
                }
                
                // Show loading state
                resultContainer.innerHTML = \`
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #667eea;"></i>
                        <p style="margin-top: 15px; color: #6b7280;">Searching for order...</p>
                    </div>
                \`;
                
                try {
                    const response = await axios.get(\`/api/sales/order/\${orderId}\`);
                    const sale = response.data.data;
                    
                    // Format customer details
                    const customerName = sale.customer_name || 'N/A';
                    const customerCode = sale.customer_code || 'N/A';
                    const customerContact = sale.customer_contact || 'N/A';
                    const companyName = sale.company_name || 'N/A';
                    
                    // Products table
                    const products = sale.items.map((item, idx) => \`
                        <tr style="background: \${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                            <td style="padding: 12px; font-weight: 600;">\${item.product_name}</td>
                            <td style="padding: 12px; text-align: center;">\${item.quantity}</td>
                            <td style="padding: 12px; text-align: right;">₹\${item.unit_price.toLocaleString()}</td>
                            <td style="padding: 12px; text-align: right; font-weight: 700; color: #059669;">₹\${item.total_price.toLocaleString()}</td>
                        </tr>
                    \`).join('');
                    
                    // Payment history table
                    const payments = sale.payments && sale.payments.length > 0 ? sale.payments.map((p, idx) => \`
                        <tr style="background: \${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                            <td style="padding: 12px;">\${new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                            <td style="padding: 12px; font-weight: 700; color: #059669;">₹\${p.amount.toLocaleString()}</td>
                            <td style="padding: 12px;">\${p.payment_reference || '-'}</td>
                        </tr>
                    \`).join('') : '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #9ca3af;">No payment history</td></tr>';
                    
                    resultContainer.innerHTML = \`
                        <!-- Order Header -->
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 12px 12px 0 0; margin-bottom: 0;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <h2 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">Order Details</h2>
                                    <p style="margin: 0; opacity: 0.9; font-size: 14px;">Complete order information and breakdown</p>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">Order ID</div>
                                    <div style="font-size: 32px; font-weight: 700;">\${sale.order_id}</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Customer Details Card -->
                        <div style="background: white; border: 2px solid #e5e7eb; border-top: none; padding: 25px; margin-bottom: 20px;">
                            <h3 style="margin: 0 0 20px 0; color: #1f2937; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-user" style="color: #667eea;"></i> Customer Details
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                                <div style="padding: 15px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #667eea;">
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;">Customer Name</div>
                                    <div style="font-size: 16px; font-weight: 600; color: #1f2937;">\${customerName}</div>
                                </div>
                                <div style="padding: 15px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #10b981;">
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;">Customer Code</div>
                                    <div style="font-size: 16px; font-weight: 600; color: #1f2937;">\${customerCode}</div>
                                </div>
                                <div style="padding: 15px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #3b82f6;">
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;">Contact Number</div>
                                    <div style="font-size: 16px; font-weight: 600; color: #1f2937;">\${customerContact}</div>
                                </div>
                                <div style="padding: 15px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #f59e0b;">
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;">Company Name</div>
                                    <div style="font-size: 16px; font-weight: 600; color: #1f2937;">\${companyName}</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Order Information -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 25px;">
                            <!-- Order Info Card -->
                            <div class="card" style="border: 2px solid #e5e7eb;">
                                <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-info-circle" style="color: #667eea;"></i> Order Information
                                </h4>
                                <div style="display: flex; flex-direction: column; gap: 10px;">
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                                        <span style="color: #6b7280;">Date:</span>
                                        <span style="font-weight: 600; color: #1f2937;">\${new Date(sale.sale_date).toLocaleDateString('en-IN')}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                                        <span style="color: #6b7280;">Employee:</span>
                                        <span style="font-weight: 600; color: #1f2937;">\${sale.employee_name}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                                        <span style="color: #6b7280;">Sale Type:</span>
                                        <span style="font-weight: 600; color: #1f2937;">\${sale.sale_type}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                                        <span style="color: #6b7280;">Courier Cost:</span>
                                        <span style="font-weight: 600; color: #1f2937;">₹\${sale.courier_cost.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Financial Summary Card -->
                            <div class="card" style="border: 2px solid #e5e7eb;">
                                <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-calculator" style="color: #10b981;"></i> Financial Summary
                                </h4>
                                <div style="display: flex; flex-direction: column; gap: 10px;">
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                                        <span style="color: #6b7280;">Subtotal:</span>
                                        <span style="font-weight: 600; color: #1f2937;">₹\${sale.subtotal.toLocaleString()}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                                        <span style="color: #6b7280;">GST:</span>
                                        <span style="font-weight: 600; color: #1f2937;">₹\${sale.gst_amount.toLocaleString()}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 2px solid #667eea; background: #f0f4ff; margin: 0 -15px; padding-left: 15px; padding-right: 15px;">
                                        <span style="font-weight: 700; color: #1f2937;">Total Amount:</span>
                                        <span style="font-weight: 700; font-size: 18px; color: #667eea;">₹\${sale.total_amount.toLocaleString()}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                                        <span style="color: #6b7280;">Received:</span>
                                        <span style="font-weight: 600; color: #059669;">₹\${sale.amount_received.toLocaleString()}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                                        <span style="font-weight: 600; color: #6b7280;">Balance:</span>
                                        <span style="font-weight: 700; font-size: 18px; color: \${sale.balance_amount > 0 ? '#dc2626' : '#059669'};">₹\${sale.balance_amount.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Products Table -->
                        <div class="card" style="border: 2px solid #e5e7eb; margin-bottom: 20px;">
                            <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-box" style="color: #3b82f6;"></i> Products (\${sale.items.length})
                            </h4>
                            <div style="overflow-x: auto;">
                                <table class="data-table" style="width: 100%; border-collapse: collapse;">
                                    <thead style="background: #f9fafb;">
                                        <tr>
                                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 700; color: #374151;">Product</th>
                                            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb; font-weight: 700; color: #374151;">Quantity</th>
                                            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb; font-weight: 700; color: #374151;">Unit Price</th>
                                            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb; font-weight: 700; color: #374151;">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        \${products}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <!-- Payment History -->
                        <div class="card" style="border: 2px solid #e5e7eb;">
                            <h4 style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-history" style="color: #ec4899;"></i> Payment History
                            </h4>
                            <div style="overflow-x: auto;">
                                <table class="data-table" style="width: 100%; border-collapse: collapse;">
                                    <thead style="background: #f9fafb;">
                                        <tr>
                                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 700; color: #374151;">Date</th>
                                            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb; font-weight: 700; color: #374151;">Amount</th>
                                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 700; color: #374151;">Reference</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        \${payments}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        \${sale.remarks && sale.remarks !== 'N/A' ? \`
                        <!-- Remarks -->
                        <div class="card" style="border: 2px solid #e5e7eb; margin-top: 20px; background: #fffbeb;">
                            <h4 style="margin: 0 0 10px 0; color: #1f2937; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-comment" style="color: #f59e0b;"></i> Remarks
                            </h4>
                            <p style="margin: 0; color: #374151; line-height: 1.6;">\${sale.remarks}</p>
                        </div>
                        \` : ''}
                    \`;
                } catch (error) {
                    resultContainer.innerHTML = \`
                        <div style="text-align: center; padding: 60px 20px; background: #fee2e2; border: 2px solid #fca5a5; border-radius: 12px;">
                            <i class="fas fa-exclamation-circle" style="font-size: 64px; color: #dc2626; margin-bottom: 20px;"></i>
                            <h3 style="margin: 0 0 10px 0; color: #991b1b; font-size: 24px;">Order Not Found</h3>
                            <p style="margin: 0; color: #7f1d1d; font-size: 16px;">No order found with ID: <strong>\${orderId}</strong></p>
                            <p style="margin: 15px 0 0 0; color: #991b1b; font-size: 14px;">Please check the Order ID and try again</p>
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
                    document.getElementById('editAccountReceived').value = sale.account_received || '';
                    document.getElementById('editPaymentReference').value = sale.payment_reference || '';
                    document.getElementById('editRemarks').value = sale.remarks || '';
                    
                    // Set up dynamic validation for account received based on amount
                    toggleEditAccountRequired();
                    document.getElementById('editAmountReceived').addEventListener('input', toggleEditAccountRequired);
                    
                    // Load products
                    const itemsResponse = await axios.get('/api/sales/' + orderId + '/items');
                    const items = itemsResponse.data.data;
                    
                    const productRows = document.getElementById('editProductRows');
                    productRows.innerHTML = '';
                    
                    editProductCount = 0;
                    items.forEach((item, index) => {
                        // Find which category this product belongs to
                        let productCategory = '';
                        let productCode = '';
                        for (const [category, products] of Object.entries(productCatalog)) {
                            const found = products.find(p => p.name === item.product_name);
                            if (found) {
                                productCategory = category;
                                productCode = found.code;
                                break;
                            }
                        }
                        
                        const row = document.createElement('div');
                        row.className = 'product-row';
                        row.id = 'edit-product-' + editProductCount;
                        row.innerHTML = '<div class="form-group" style="margin: 0;">' +
                                '<label>Category</label>' +
                                '<select class="product-category" onchange="updateEditProductOptions(' + editProductCount + ')">' +
                                    '<option value="">Select Category</option>' +
                                    '<option value="MDVR"' + (productCategory === 'MDVR' ? ' selected' : '') + '>MDVR</option>' +
                                    '<option value="Monitor & Monitor Kit"' + (productCategory === 'Monitor & Monitor Kit' ? ' selected' : '') + '>Monitor & Monitor Kit</option>' +
                                    '<option value="Cameras"' + (productCategory === 'Cameras' ? ' selected' : '') + '>Cameras</option>' +
                                    '<option value="Dashcam"' + (productCategory === 'Dashcam' ? ' selected' : '') + '>Dashcam</option>' +
                                    '<option value="Storage"' + (productCategory === 'Storage' ? ' selected' : '') + '>Storage</option>' +
                                    '<option value="RFID Tags"' + (productCategory === 'RFID Tags' ? ' selected' : '') + '>RFID Tags</option>' +
                                    '<option value="RFID Reader"' + (productCategory === 'RFID Reader' ? ' selected' : '') + '>RFID Reader</option>' +
                                    '<option value="MDVR Accessories"' + (productCategory === 'MDVR Accessories' ? ' selected' : '') + '>MDVR Accessories</option>' +
                                    '<option value="Other product and Accessories"' + (productCategory === 'Other product and Accessories' ? ' selected' : '') + '>Other product and Accessories</option>' +
                                '</select>' +
                            '</div>' +
                            '<div class="form-group" style="margin: 0;">' +
                                '<label>Product Name</label>' +
                                '<select class="product-name" name="items[' + editProductCount + '][product_name]" onchange="calculateEditSaleTotal()">' +
                                    '<option value="">Select Product</option>' +
                                '</select>' +
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
                                '<input type="number" class="product-total" readonly style="background: #f3f4f6;" value="' + (item.quantity * item.unit_price).toFixed(2) + '">' +
                            '</div>' +
                            '<button type="button" class="btn-remove" onclick="removeEditProductRow(' + editProductCount + ')">' +
                                '<i class="fas fa-times"></i>' +
                            '</button>';
                        productRows.appendChild(row);
                        
                        // Populate products for this category and select the current product
                        if (productCategory && productCatalog[productCategory]) {
                            const productSelect = row.querySelector('.product-name');
                            productCatalog[productCategory].forEach(product => {
                                const option = document.createElement('option');
                                option.value = product.name;
                                option.textContent = product.name;
                                if (product.name === item.product_name) {
                                    option.selected = true;
                                }
                                productSelect.appendChild(option);
                            });
                        }
                        
                        editProductCount++;
                    });
                    
                    calculateEditSaleTotal();
                    document.getElementById('editSaleModal').classList.add('show');
                } catch (error) {
                    alert('Error loading sale data: ' + (error.response?.data?.error || error.message));
                }
            }
            
            function toggleEditAccountRequired() {
                const amountReceived = parseFloat(document.getElementById('editAmountReceived').value) || 0;
                const accountSelect = document.getElementById('editAccountReceived');
                const accountLabel = document.getElementById('editAccountLabel');
                
                if (amountReceived > 0) {
                    accountSelect.required = true;
                    accountLabel.textContent = 'In Account Received *';
                } else {
                    accountSelect.required = false;
                    accountLabel.textContent = 'In Account Received';
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
            
            function updateEditProductOptions(rowId) {
                const row = document.getElementById('edit-product-' + rowId);
                const categorySelect = row.querySelector('.product-category');
                const productSelect = row.querySelector('.product-name');
                const category = categorySelect.value;
                
                // Clear product selection
                productSelect.innerHTML = '<option value="">Select Product</option>';
                
                if (category && productCatalog[category]) {
                    productCatalog[category].forEach(product => {
                        const option = document.createElement('option');
                        option.value = product.name;
                        option.textContent = product.name;
                        productSelect.appendChild(option);
                    });
                }
                
                calculateEditSaleTotal();
            }
            
            function addEditProductRow() {
                const container = document.getElementById('editProductRows');
                const row = document.createElement('div');
                row.className = 'product-row';
                row.id = 'edit-product-' + editProductCount;
                row.innerHTML = '<div class="form-group" style="margin: 0;">' +
                        '<label>Category</label>' +
                        '<select class="product-category" onchange="updateEditProductOptions(' + editProductCount + ')">' +
                            '<option value="">Select Category</option>' +
                            '<option value="MDVR">MDVR</option>' +
                            '<option value="Monitor & Monitor Kit">Monitor & Monitor Kit</option>' +
                            '<option value="Cameras">Cameras</option>' +
                            '<option value="Dashcam">Dashcam</option>' +
                            '<option value="Storage">Storage</option>' +
                            '<option value="RFID Tags">RFID Tags</option>' +
                            '<option value="RFID Reader">RFID Reader</option>' +
                            '<option value="MDVR Accessories">MDVR Accessories</option>' +
                            '<option value="Other product and Accessories">Other product and Accessories</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin: 0;">' +
                        '<label>Product Name</label>' +
                        '<select class="product-name" name="items[' + editProductCount + '][product_name]" onchange="calculateEditSaleTotal()">' +
                            '<option value="">Select Category First</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin: 0;">' +
                        '<label>Quantity</label>' +
                        '<input type="number" name="items[' + editProductCount + '][quantity]" min="0" value="0" onchange="calculateEditSaleTotal()">' +
                    '</div>' +
                    '<div class="form-group" style="margin: 0;">' +
                        '<label>Unit Price</label>' +
                        '<input type="number" name="items[' + editProductCount + '][unit_price]" min="0" step="0.01" value="0" onchange="calculateEditSaleTotal()">' +
                    '</div>' +
                    '<div class="form-group" style="margin: 0;">' +
                        '<label>Total</label>' +
                        '<input type="number" class="product-total" readonly style="background: #f3f4f6;" value="0">' +
                    '</div>' +
                    '<button type="button" class="btn-remove" onclick="removeEditProductRow(' + editProductCount + ')">' +
                        '<i class="fas fa-times"></i>' +
                    '</button>';
                container.appendChild(row);
                editProductCount++;
            }
            
            function removeEditProductRow(id) {
                const row = document.getElementById('edit-product-' + id);
                if (row) {
                    row.remove();
                    calculateEditSaleTotal();
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
                        // Only search in leads database (single source of truth)
                        const leadsResponse = await axios.get('/api/leads?search=' + encodeURIComponent(searchTerm));
                        const leads = leadsResponse.data.data || [];
                        
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
            
            function displayCustomerAutocomplete(customers) {
                const dropdown = document.getElementById('customerSearchDropdown');
                
                if (!customers || customers.length === 0) {
                    dropdown.innerHTML = '<div class="autocomplete-no-results">No customers found</div>';
                    dropdown.style.display = 'block';
                    return;
                }
                
                allLeadsForSearch = customers;
                dropdown.innerHTML = customers.slice(0, 10).map(customer => {
                    return \`
                        <div class="autocomplete-item" onclick="selectCustomer('\${customer.mobile_number}')">
                            <div class="autocomplete-item-title">
                                \${customer.customer_name}
                            </div>
                            <div class="autocomplete-item-subtitle">
                                Mobile: \${customer.mobile_number} | Company: \${customer.company_name || 'N/A'} | Location: \${customer.location || 'N/A'}
                            </div>
                        </div>
                    \`;
                }).join('');
                dropdown.style.display = 'block';
            }
            
            function selectCustomer(mobileNumber) {
                // Always use mobile number as identifier
                document.getElementById('customerSearchInput').value = mobileNumber;
                document.getElementById('customerSearchDropdown').style.display = 'none';
                searchCustomerByCode(mobileNumber);
            }
            
            // Store currently selected customer
            let currentCustomerQuery = '';
            
            async function searchCustomerByCode(mobileNumber) {
                try {
                    // Only search in leads database using mobile number
                    let response = await axios.get('/api/leads?search=' + encodeURIComponent(mobileNumber));
                    let leads = response.data.data;
                    
                    if (!leads || leads.length === 0) {
                        alert('No customer found');
                        document.getElementById('customerActionButtons').style.display = 'none';
                        document.getElementById('customerDetailsContent').style.display = 'none';
                        return;
                    }
                    
                    // Store the mobile number as the customer identifier
                    currentCustomerQuery = leads[0].mobile_number;
                    
                    // Show the 5-button menu
                    document.getElementById('customerActionButtons').style.display = 'block';
                    document.getElementById('customerDetailsContent').style.display = 'none';
                    
                } catch (error) {
                    console.error('Error loading customer:', error);
                    alert('Error loading customer');
                }
            }
            
            // Button 1: Basic Info
            async function showCustomerBasicInfo() {
                if (!currentCustomerQuery) {
                    alert('Please search for a customer first');
                    return;
                }
                
                try {
                    console.log('Fetching basic info for:', currentCustomerQuery);
                    const response = await axios.get('/api/customer-details/basic/' + encodeURIComponent(currentCustomerQuery));
                    console.log('Basic info response:', response);
                    
                    if (!response.data.success) {
                        alert('Customer not found');
                        return;
                    }
                    
                    const customer = response.data.data;
                    
                    const content = '<div style="background: #f9fafb; padding: 20px; border-radius: 8px;">' +
                        '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #1f2937; border-bottom: 2px solid #667eea; padding-bottom: 10px;">' +
                            '<i class="fas fa-user" style="color: #667eea; margin-right: 10px;"></i>Customer Basic Information' +
                        '</h3>' +
                        '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">Customer Code</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.customer_code || 'N/A') + '</div>' +
                            '</div>' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">Customer Name</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.customer_name || 'N/A') + '</div>' +
                            '</div>' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">Mobile Number</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.mobile_number || 'N/A') + '</div>' +
                            '</div>' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">Alternate Mobile</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.alternate_mobile || 'N/A') + '</div>' +
                            '</div>' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">Company Name</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.company_name || 'N/A') + '</div>' +
                            '</div>' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">Email</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.email || 'N/A') + '</div>' +
                            '</div>' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">Location</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.location || 'N/A') + '</div>' +
                            '</div>' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">GST Number</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.gst_number || 'N/A') + '</div>' +
                            '</div>' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); grid-column: 1 / -1;">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">Complete Address</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.complete_address || 'N/A') + '</div>' +
                            '</div>' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">Status</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.status || 'N/A') + '</div>' +
                            '</div>' +
                            '<div style="background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">Created At</div>' +
                                '<div style="font-size: 16px; font-weight: 600; color: #1f2937;">' + (customer.created_at ? new Date(customer.created_at).toLocaleDateString() : 'N/A') + '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                    
                    document.getElementById('customerDetailsContent').innerHTML = content;
                    document.getElementById('customerDetailsContent').style.display = 'block';
                } catch (error) {
                    console.error('Error fetching basic info:', error);
                    console.error('Error details:', error.response ? error.response.data : error.message);
                    alert('Error loading basic information: ' + (error.response ? JSON.stringify(error.response.data) : error.message));
                }
            }
            
            // Button 2: Full History - Complete Timeline
            async function showCustomerHistory() {
                if (!currentCustomerQuery) {
                    alert('Please search for a customer first');
                    return;
                }
                
                try {
                    console.log('Fetching history for:', currentCustomerQuery);
                    const response = await axios.get('/api/customer-details/history/' + encodeURIComponent(currentCustomerQuery));
                    console.log('History response:', response);
                    
                    if (!response.data.success) {
                        alert('Customer not found');
                        return;
                    }
                    
                    const data = response.data.data;
                    const customer = data.customer;
                    const sales = data.sales;
                    const payments = data.payments;
                    const quotations = data.quotations;
                    const summary = data.summary;
                    
                    // Create timeline array with all events
                    const timeline = [];
                    
                    // Add customer info as first event
                    timeline.push({
                        date: new Date(customer.created_at || '2020-01-01'),
                        type: 'customer',
                        title: 'Customer Created',
                        icon: 'fa-user-plus',
                        color: '#667eea',
                        data: customer
                    });
                    
                    // Add all sales
                    sales.forEach(sale => {
                        timeline.push({
                            date: new Date(sale.sale_date),
                            type: 'sale',
                            title: 'Sale / Order',
                            icon: 'fa-shopping-cart',
                            color: '#3b82f6',
                            data: sale
                        });
                    });
                    
                    // Add all payments
                    payments.forEach(payment => {
                        timeline.push({
                            date: new Date(payment.payment_date),
                            type: 'payment',
                            title: 'Payment Received',
                            icon: 'fa-money-bill-wave',
                            color: '#10b981',
                            data: payment
                        });
                    });
                    
                    // Add all quotations
                    quotations.forEach(quot => {
                        timeline.push({
                            date: new Date(quot.created_at),
                            type: 'quotation',
                            title: 'Quotation',
                            icon: 'fa-file-invoice',
                            color: '#f59e0b',
                            data: quot
                        });
                    });
                    
                    // Sort by date descending (most recent first)
                    timeline.sort((a, b) => b.date - a.date);
                    
                    let content = '<div style="background: #f9fafb; padding: 20px; border-radius: 8px;">' +
                        '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #1f2937; border-bottom: 2px solid #10b981; padding-bottom: 10px;">' +
                            '<i class="fas fa-history" style="color: #10b981; margin-right: 10px;"></i>Customer Complete History Timeline' +
                        '</h3>' +
                        
                        // Customer Info Card
                        '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 25px;">' +
                            '<div style="font-size: 16px; font-weight: 700; margin-bottom: 10px;"><i class="fas fa-user"></i> ' + (customer.customer_name || 'N/A') + '</div>' +
                            '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 13px; opacity: 0.95;">' +
                                '<div><strong>Code:</strong> ' + (customer.customer_code || 'N/A') + '</div>' +
                                '<div><strong>Mobile:</strong> ' + (customer.mobile_number || customer.customer_contact || 'N/A') + '</div>' +
                                '<div><strong>Company:</strong> ' + (customer.company_name || 'N/A') + '</div>' +
                            '</div>' +
                        '</div>' +
                        
                        // Summary Cards
                        '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px;">' +
                            '<div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 15px; border-radius: 10px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Total Sales</div>' +
                                '<div style="font-size: 24px; font-weight: 700;">' + summary.total_sales + '</div>' +
                                '<div style="font-size: 11px; opacity: 0.8; margin-top: 5px;">₹' + (summary.total_sale_amount || 0).toLocaleString() + '</div>' +
                            '</div>' +
                            '<div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 15px; border-radius: 10px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Payments</div>' +
                                '<div style="font-size: 24px; font-weight: 700;">' + summary.total_payments + '</div>' +
                                '<div style="font-size: 11px; opacity: 0.8; margin-top: 5px;">₹' + (summary.total_paid || 0).toLocaleString() + '</div>' +
                            '</div>' +
                            '<div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 15px; border-radius: 10px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Quotations</div>' +
                                '<div style="font-size: 24px; font-weight: 700;">' + summary.total_quotations + '</div>' +
                            '</div>' +
                            '<div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 15px; border-radius: 10px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Balance Due</div>' +
                                '<div style="font-size: 24px; font-weight: 700;">₹' + (summary.total_balance || 0).toLocaleString() + '</div>' +
                            '</div>' +
                        '</div>' +
                        
                        // Complete Timeline
                        '<div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                            '<h4 style="font-size: 16px; font-weight: 600; margin-bottom: 20px; color: #1f2937;"><i class="fas fa-stream"></i> Complete Activity Timeline</h4>';
                    
                    if (timeline.length === 0) {
                        content += '<p style="color: #6b7280; text-align: center; padding: 40px;">No activity found</p>';
                    } else {
                        // Timeline items
                        timeline.forEach((event, idx) => {
                            const dateStr = event.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                            const timeStr = event.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                            
                            content += '<div style="display: flex; gap: 15px; margin-bottom: ' + (idx === timeline.length - 1 ? '0' : '20px') + '; border-left: 3px solid ' + event.color + '; padding-left: 15px;">' +
                                '<div style="flex-shrink: 0; width: 40px; height: 40px; background: ' + event.color + '; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; margin-left: -22px;">' +
                                    '<i class="fas ' + event.icon + '"></i>' +
                                '</div>' +
                                '<div style="flex-grow: 1;">' +
                                    '<div style="font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 5px;">' + event.title + '</div>' +
                                    '<div style="font-size: 12px; color: #6b7280; margin-bottom: 10px;">' + dateStr + ' at ' + timeStr + '</div>';
                            
                            // Event-specific details
                            if (event.type === 'customer') {
                                content += '<div style="background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 13px;">' +
                                    '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">' +
                                        '<div><strong>Mobile:</strong> ' + (event.data.mobile_number || event.data.customer_contact || 'N/A') + '</div>' +
                                        '<div><strong>Email:</strong> ' + (event.data.email || 'N/A') + '</div>' +
                                        '<div><strong>Location:</strong> ' + (event.data.location || 'N/A') + '</div>' +
                                        '<div><strong>GST:</strong> ' + (event.data.gst_number || 'N/A') + '</div>' +
                                    '</div>' +
                                '</div>';
                            } else if (event.type === 'sale') {
                                content += '<div style="background: #eff6ff; padding: 12px; border-radius: 6px; font-size: 13px;">' +
                                    '<div style="font-weight: 600; margin-bottom: 8px; color: #1e40af;">Order ID: ' + event.data.order_id + '</div>' +
                                    '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">' +
                                        '<div><strong>Total Amount:</strong> ₹' + (event.data.total_amount || 0).toLocaleString() + '</div>' +
                                        '<div><strong>Amount Paid:</strong> ₹' + (event.data.amount_received || 0).toLocaleString() + '</div>' +
                                        '<div><strong>Balance:</strong> <span style="color: ' + (event.data.balance_amount > 0 ? '#dc2626' : '#10b981') + ';">₹' + (event.data.balance_amount || 0).toLocaleString() + '</span></div>' +
                                        '<div><strong>Sale Type:</strong> ' + (event.data.sale_type || 'N/A') + '</div>' +
                                    '</div>' +
                                    (event.data.products ? '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #dbeafe;"><strong>Products:</strong> ' + event.data.products + '</div>' : '') +
                                '</div>';
                            } else if (event.type === 'payment') {
                                content += '<div style="background: #f0fdf4; padding: 12px; border-radius: 6px; font-size: 13px;">' +
                                    '<div style="font-weight: 600; margin-bottom: 8px; color: #065f46;">Payment for Order: ' + event.data.order_id + '</div>' +
                                    '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">' +
                                        '<div><strong>Amount:</strong> <span style="color: #10b981; font-weight: 600;">₹' + (event.data.amount || 0).toLocaleString() + '</span></div>' +
                                        '<div><strong>Account:</strong> ' + (event.data.account_received || 'N/A') + '</div>' +
                                        '<div style="grid-column: 1 / -1;"><strong>Reference:</strong> ' + (event.data.payment_reference || 'N/A') + '</div>' +
                                    '</div>' +
                                '</div>';
                            } else if (event.type === 'quotation') {
                                content += '<div style="background: #fffbeb; padding: 12px; border-radius: 6px; font-size: 13px;">' +
                                    '<div style="font-weight: 600; margin-bottom: 8px; color: #92400e;">Quotation #' + event.data.quotation_number + '</div>' +
                                    '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">' +
                                        '<div><strong>Total Amount:</strong> ₹' + (event.data.total_amount || 0).toLocaleString() + '</div>' +
                                        '<div><strong>Status:</strong> ' + (event.data.status || 'N/A') + '</div>' +
                                    '</div>' +
                                    (event.data.products ? '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #fef3c7;"><strong>Products:</strong> ' + event.data.products + '</div>' : '') +
                                '</div>';
                            }
                            
                            content += '</div></div>';
                        });
                    }
                    
                    content += '</div></div>';
                    
                    document.getElementById('customerDetailsContent').innerHTML = content;
                    document.getElementById('customerDetailsContent').style.display = 'block';
                } catch (error) {
                    console.error('Error fetching history:', error);
                    console.error('Error details:', error.response ? error.response.data : error.message);
                    alert('Error loading customer history: ' + (error.response ? JSON.stringify(error.response.data) : error.message));
                }
            }
            
            // Button 3: Orders
            async function showCustomerOrders() {
                if (!currentCustomerQuery) {
                    alert('Please search for a customer first');
                    return;
                }
                
                try {
                    const response = await axios.get('/api/customer-details/orders/' + encodeURIComponent(currentCustomerQuery));
                    if (!response.data.success) {
                        alert('Customer not found');
                        return;
                    }
                    
                    const orders = response.data.data;
                    
                    let content = '<div style="background: #f9fafb; padding: 20px; border-radius: 8px;">' +
                        '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">' +
                            '<i class="fas fa-shopping-cart" style="color: #3b82f6; margin-right: 10px;"></i>Complete Order Details' +
                        '</h3>';
                    
                    if (orders.length === 0) {
                        content += '<p style="color: #6b7280; text-align: center; padding: 40px;">No orders found for this customer</p>';
                    } else {
                        orders.forEach((order, idx) => {
                            const items = order.items || [];
                            
                            content += '<div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">' +
                                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px;">' +
                                    '<div>' +
                                        '<div style="font-size: 18px; font-weight: 700; color: #1f2937;">Order #' + order.order_id + '</div>' +
                                        '<div style="font-size: 13px; color: #6b7280; margin-top: 3px;">Date: ' + new Date(order.sale_date).toLocaleDateString() + '</div>' +
                                    '</div>' +
                                    '<div style="text-align: right;">' +
                                        '<div style="font-size: 13px; color: #6b7280;">Employee</div>' +
                                        '<div style="font-size: 14px; font-weight: 600; color: #1f2937;">' + order.employee_name + '</div>' +
                                    '</div>' +
                                '</div>' +
                                
                                '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px;">' +
                                    '<div>' +
                                        '<div style="font-size: 12px; color: #6b7280;">Customer</div>' +
                                        '<div style="font-size: 14px; font-weight: 600; color: #1f2937;">' + order.customer_name + '</div>' +
                                    '</div>' +
                                    '<div>' +
                                        '<div style="font-size: 12px; color: #6b7280;">Company</div>' +
                                        '<div style="font-size: 14px; font-weight: 600; color: #1f2937;">' + (order.company_name || 'N/A') + '</div>' +
                                    '</div>' +
                                    '<div>' +
                                        '<div style="font-size: 12px; color: #6b7280;">Sale Type</div>' +
                                        '<div style="font-size: 14px; font-weight: 600; color: #1f2937;">' + order.sale_type + '</div>' +
                                    '</div>' +
                                    '<div>' +
                                        '<div style="font-size: 12px; color: #6b7280;">Courier Cost</div>' +
                                        '<div style="font-size: 14px; font-weight: 600; color: #1f2937;">₹' + (order.courier_cost || 0).toLocaleString() + '</div>' +
                                    '</div>' +
                                '</div>' +
                                
                                '<div style="background: #f9fafb; padding: 12px; border-radius: 6px; margin-bottom: 15px;">' +
                                    '<div style="font-size: 13px; font-weight: 600; color: #1f2937; margin-bottom: 10px;">Products:</div>' +
                                    '<div class="table-container"><table style="font-size: 13px;">' +
                                        '<thead><tr>' +
                                            '<th style="padding: 8px;">Product</th>' +
                                            '<th style="padding: 8px;">Quantity</th>' +
                                            '<th style="padding: 8px;">Unit Price</th>' +
                                            '<th style="padding: 8px;">Total</th>' +
                                        '</tr></thead><tbody>';
                            
                            items.forEach(item => {
                                content += '<tr>' +
                                    '<td style="padding: 8px;">' + item.product_name + '</td>' +
                                    '<td style="padding: 8px;">' + item.quantity + '</td>' +
                                    '<td style="padding: 8px;">₹' + (item.unit_price || 0).toLocaleString() + '</td>' +
                                    '<td style="padding: 8px; font-weight: 600;">₹' + (item.total_price || 0).toLocaleString() + '</td>' +
                                '</tr>';
                            });
                            
                            content += '</tbody></table></div>' +
                                '</div>' +
                                
                                '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; background: #f3f4f6; padding: 15px; border-radius: 6px;">' +
                                    '<div style="text-align: right; font-size: 14px; color: #6b7280;">Subtotal:</div>' +
                                    '<div style="font-size: 14px; font-weight: 600; color: #1f2937;">₹' + (order.subtotal || 0).toLocaleString() + '</div>' +
                                    
                                    '<div style="text-align: right; font-size: 14px; color: #6b7280;">GST:</div>' +
                                    '<div style="font-size: 14px; font-weight: 600; color: #1f2937;">₹' + (order.gst_amount || 0).toLocaleString() + '</div>' +
                                    
                                    '<div style="text-align: right; font-size: 16px; font-weight: 600; color: #1f2937; border-top: 2px solid #d1d5db; padding-top: 10px;">Total:</div>' +
                                    '<div style="font-size: 16px; font-weight: 700; color: #1f2937; border-top: 2px solid #d1d5db; padding-top: 10px;">₹' + (order.total_amount || 0).toLocaleString() + '</div>' +
                                    
                                    '<div style="text-align: right; font-size: 14px; color: #10b981;">Received:</div>' +
                                    '<div style="font-size: 14px; font-weight: 600; color: #10b981;">₹' + (order.amount_received || 0).toLocaleString() + '</div>' +
                                    
                                    '<div style="text-align: right; font-size: 14px; ' + (order.balance_amount > 0 ? 'color: #dc2626;' : 'color: #10b981;') + '">Balance:</div>' +
                                    '<div style="font-size: 14px; font-weight: 600; ' + (order.balance_amount > 0 ? 'color: #dc2626;' : 'color: #10b981;') + '">₹' + (order.balance_amount || 0).toLocaleString() + '</div>' +
                                '</div>' +
                                
                                (order.remarks ? '<div style="margin-top: 10px; padding: 10px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px;"><strong>Remarks:</strong> ' + order.remarks + '</div>' : '') +
                                
                            '</div>';
                        });
                    }
                    
                    content += '</div>';
                    
                    document.getElementById('customerDetailsContent').innerHTML = content;
                    document.getElementById('customerDetailsContent').style.display = 'block';
                } catch (error) {
                    console.error('Error fetching orders:', error);
                    alert('Error loading customer orders');
                }
            }
            
            // Button 4: Account Ledger
            async function showCustomerLedger() {
                if (!currentCustomerQuery) {
                    alert('Please search for a customer first');
                    return;
                }
                
                try {
                    const response = await axios.get('/api/customer-details/ledger/' + encodeURIComponent(currentCustomerQuery));
                    if (!response.data.success) {
                        alert('Customer not found');
                        return;
                    }
                    
                    const data = response.data.data;
                    const customer = data.customer;
                    const ledger = data.ledger;
                    const summary = data.summary;
                    
                    let content = '<div style="background: #f9fafb; padding: 20px; border-radius: 8px;">' +
                        '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #1f2937; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">' +
                            '<i class="fas fa-book" style="color: #f59e0b; margin-right: 10px;"></i>Account Ledger - ' + customer.customer_name +
                        '</h3>' +
                        
                        // Summary Cards
                        '<div style="display: grid; grid-template-columns: repeat(' + (summary.advance_payment > 0 ? '4' : '3') + ', 1fr); gap: 15px; margin-bottom: 25px;">' +
                            '<div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 20px; border-radius: 10px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 13px; opacity: 0.9; margin-bottom: 5px;">Total Sales</div>' +
                                '<div style="font-size: 28px; font-weight: 700;">₹' + (summary.total_debit || 0).toLocaleString() + '</div>' +
                            '</div>' +
                            '<div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; border-radius: 10px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 13px; opacity: 0.9; margin-bottom: 5px;">Total Payments</div>' +
                                '<div style="font-size: 28px; font-weight: 700;">₹' + (summary.total_credit || 0).toLocaleString() + '</div>' +
                            '</div>' +
                            '<div style="background: linear-gradient(135deg, ' + (summary.final_balance > 0 ? '#f59e0b 0%, #d97706 100%' : '#10b981 0%, #059669 100%') + '); padding: 20px; border-radius: 10px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
                                '<div style="font-size: 13px; opacity: 0.9; margin-bottom: 5px;">' + (summary.final_balance > 0 ? 'Outstanding Balance' : 'Balance Paid') + '</div>' +
                                '<div style="font-size: 28px; font-weight: 700;">₹' + (summary.final_balance || 0).toLocaleString() + '</div>' +
                            '</div>' +
                            (summary.advance_payment > 0 ? 
                                '<div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 20px; border-radius: 10px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
                                    '<div style="font-size: 13px; opacity: 0.9; margin-bottom: 5px;">Advance Payment</div>' +
                                    '<div style="font-size: 28px; font-weight: 700;">₹' + summary.advance_payment.toLocaleString() + '</div>' +
                                '</div>' 
                            : '') +
                        '</div>' +
                        
                        // Ledger Table
                        '<div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                            '<h4 style="font-size: 16px; font-weight: 600; margin-bottom: 15px; color: #1f2937;">Transaction History</h4>';
                    
                    if (ledger.length === 0) {
                        content += '<p style="color: #6b7280; text-align: center; padding: 40px;">No transactions found</p>';
                    } else {
                        content += '<div class="table-container"><table>' +
                            '<thead><tr>' +
                                '<th>Date</th>' +
                                '<th>Order ID</th>' +
                                '<th>Description</th>' +
                                '<th>Debit (Dr.)</th>' +
                                '<th>Credit (Cr.)</th>' +
                                '<th>Balance</th>' +
                            '</tr></thead><tbody>';
                        
                        ledger.forEach(entry => {
                            const displayBalance = entry.running_balance >= 0 ? entry.running_balance : 0;
                            const isAdvance = entry.running_balance < 0;
                            const advanceAmount = isAdvance ? Math.abs(entry.running_balance) : 0;
                            
                            content += '<tr style="' + (entry.type === 'sale' ? 'background: #fef2f2;' : 'background: #f0fdf4;') + '">' +
                                '<td>' + new Date(entry.date).toLocaleDateString() + '</td>' +
                                '<td><strong>' + entry.order_id + '</strong></td>' +
                                '<td>' + entry.description + (entry.account ? '<br><small style="color: #6b7280;">' + entry.account + '</small>' : '') + '</td>' +
                                '<td>' + (entry.debit > 0 ? '<span style="color: #dc2626; font-weight: 600;">₹' + entry.debit.toLocaleString() + '</span>' : '-') + '</td>' +
                                '<td>' + (entry.credit > 0 ? '<span style="color: #10b981; font-weight: 600;">₹' + entry.credit.toLocaleString() + '</span>' : '-') + '</td>' +
                                '<td style="font-weight: 600; ' + (displayBalance > 0 ? 'color: #f59e0b;' : 'color: #10b981;') + '">' +
                                    (isAdvance ? 
                                        '<span style="color: #3b82f6;">Advance: ₹' + advanceAmount.toLocaleString() + '</span>' : 
                                        '₹' + displayBalance.toLocaleString()) +
                                '</td>' +
                            '</tr>';
                        });
                        
                        content += '</tbody></table></div>';
                    }
                    
                    content += '</div></div>';
                    
                    document.getElementById('customerDetailsContent').innerHTML = content;
                    document.getElementById('customerDetailsContent').style.display = 'block';
                } catch (error) {
                    console.error('Error fetching ledger:', error);
                    alert('Error loading account ledger');
                }
            }
            
            // Button 5: Tickets
            async function showCustomerTickets() {
                if (!currentCustomerQuery) {
                    alert('Please search for a customer first');
                    return;
                }
                
                try {
                    const response = await axios.get('/api/customer-details/tickets/' + encodeURIComponent(currentCustomerQuery));
                    if (!response.data.success) {
                        alert('Customer not found');
                        return;
                    }
                    
                    const data = response.data.data;
                    const customer = data.customer;
                    const tickets = data.tickets;
                    const message = data.message;
                    
                    let content = '<div style="background: #f9fafb; padding: 20px; border-radius: 8px;">' +
                        '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #1f2937; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">' +
                            '<i class="fas fa-ticket-alt" style="color: #ef4444; margin-right: 10px;"></i>Customer Tickets - ' + customer.customer_name +
                        '</h3>';
                    
                    if (tickets.length === 0) {
                        content += '<div style="background: white; padding: 40px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
                            '<i class="fas fa-ticket-alt" style="font-size: 48px; color: #d1d5db; margin-bottom: 15px;"></i>' +
                            '<p style="color: #6b7280; font-size: 16px;">' + (message || 'No tickets found for this customer') + '</p>' +
                        '</div>';
                    } else {
                        // When tickets table exists, this will display ticket data
                        content += '<div class="table-container"><table>' +
                            '<thead><tr>' +
                                '<th>Ticket ID</th>' +
                                '<th>Date</th>' +
                                '<th>Subject</th>' +
                                '<th>Status</th>' +
                                '<th>Priority</th>' +
                            '</tr></thead><tbody>';
                        
                        tickets.forEach(ticket => {
                            content += '<tr>' +
                                '<td><strong>' + ticket.id + '</strong></td>' +
                                '<td>' + new Date(ticket.created_at).toLocaleDateString() + '</td>' +
                                '<td>' + ticket.subject + '</td>' +
                                '<td>' + ticket.status + '</td>' +
                                '<td>' + ticket.priority + '</td>' +
                            '</tr>';
                        });
                        
                        content += '</tbody></table></div>';
                    }
                    
                    content += '</div>';
                    
                    document.getElementById('customerDetailsContent').innerHTML = content;
                    document.getElementById('customerDetailsContent').style.display = 'block';
                } catch (error) {
                    console.error('Error fetching tickets:', error);
                    alert('Error loading customer tickets');
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
                    
                    // Fetch sales for this customer
                    const salesResponse = await axios.get('/api/sales/current-month?page=1&limit=1000');
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

            // Fetch Customer Details for Quotation
            async function fetchCustomerForQuotation(searchTerm) {
                if (!searchTerm || searchTerm.trim() === '') return;
                
                const statusEl = document.getElementById('quotationCustomerFetchStatus');
                statusEl.style.display = 'block';
                statusEl.style.color = '#667eea';
                statusEl.textContent = 'Searching customer...';
                
                try {
                    const response = await axios.get('/api/customers/search/' + encodeURIComponent(searchTerm));
                    
                    if (response.data.success) {
                        const customer = response.data.data;
                        
                        // Fill in customer details from customers table
                        document.getElementById('quotationCustomerCode').value = customer.customer_code || '';
                        document.getElementById('quotationCustomerName').value = customer.name || '';
                        document.getElementById('quotationCustomerContact').value = customer.phone || '';
                        document.getElementById('quotationCustomerEmail').value = customer.email || '';
                        document.getElementById('quotationCompanyName').value = customer.company_name || '';
                        document.getElementById('quotationGSTNumber').value = customer.gst_number || '';
                        document.getElementById('quotationGSTAddress').value = customer.gst_registered_address || '';
                        document.getElementById('quotationCustomerAddress').value = customer.address || '';
                        document.getElementById('quotationConcernPerson').value = customer.concern_person_name || '';
                        document.getElementById('quotationConcernContact').value = customer.concern_person_contact || '';
                        
                        statusEl.style.color = '#10b981';
                        statusEl.textContent = '✓ Customer found and details filled!';
                        
                        setTimeout(() => {
                            statusEl.style.display = 'none';
                        }, 3000);
                    } else {
                        statusEl.style.color = '#f59e0b';
                        statusEl.textContent = 'Customer not found. Please enter details manually.';
                        
                        setTimeout(() => {
                            statusEl.style.display = 'none';
                        }, 3000);
                    }
                } catch (error) {
                    console.error('Error fetching customer:', error);
                    statusEl.style.color = '#f59e0b';
                    statusEl.textContent = 'Customer not found. Please enter details manually.';
                    
                    setTimeout(() => {
                        statusEl.style.display = 'none';
                    }, 3000);
                }
            }

            // Add Quotation Item Row
            async function addQuotationItem() {
                quotationItemCounter++;
                const tbody = document.getElementById('quotationItemsRows');
                const row = document.createElement('tr');
                row.setAttribute('data-item-id', quotationItemCounter);
                
                // Fetch categories for dropdown
                let categoriesOptions = '<option value="">Select Category</option>';
                try {
                    const catResponse = await axios.get('/api/categories');
                    if (catResponse.data.success) {
                        categoriesOptions += catResponse.data.data.map(cat => 
                            '<option value="' + cat.id + '">' + cat.category_name + '</option>'
                        ).join('');
                    }
                } catch (error) {
                    console.error('Error loading categories:', error);
                }
                
                row.innerHTML = '<td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">' + quotationItemCounter + '</td>' +
                    '<td style="padding: 8px; border: 1px solid #e5e7eb;">' +
                        '<select class="quotation-item-category" onchange="loadProductsByCategory(this)" ' +
                               'style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;" required>' +
                            categoriesOptions +
                        '</select>' +
                    '</td>' +
                    '<td style="padding: 8px; border: 1px solid #e5e7eb;">' +
                        '<select class="quotation-item-product" onchange="fillProductPrice(this)" ' +
                               'style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;" required>' +
                            '<option value="">Select Product</option>' +
                        '</select>' +
                    '</td>' +
                    '<td style="padding: 8px; border: 1px solid #e5e7eb;">' +
                        '<input type="number" class="quotation-item-quantity" value="1" min="1" ' +
                               'style="width: 80px; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;" ' +
                               'onchange="calculateQuotationItemTotal(this)" required>' +
                    '</td>' +
                    '<td style="padding: 8px; border: 1px solid #e5e7eb;">' +
                        '<input type="number" class="quotation-item-price" value="0" min="0" step="0.01" ' +
                               'style="width: 120px; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;" ' +
                               'onchange="calculateQuotationItemTotal(this)" required>' +
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
            
            // Load products by category
            async function loadProductsByCategory(selectElement) {
                const categoryId = selectElement.value;
                const row = selectElement.closest('tr');
                const productSelect = row.querySelector('.quotation-item-product');
                
                productSelect.innerHTML = '<option value="">Select Product</option>';
                
                if (!categoryId) return;
                
                try {
                    const response = await axios.get('/api/products/category/' + categoryId);
                    if (response.data.success) {
                        const products = response.data.data;
                        products.forEach(product => {
                            const option = document.createElement('option');
                            option.value = product.id;
                            option.textContent = product.product_name;
                            option.dataset.price = product.unit_price;
                            productSelect.appendChild(option);
                        });
                    }
                } catch (error) {
                    console.error('Error loading products:', error);
                }
            }
            
            // Fill product price when product selected
            function fillProductPrice(selectElement) {
                const selectedOption = selectElement.options[selectElement.selectedIndex];
                const price = selectedOption.dataset.price || 0;
                const row = selectElement.closest('tr');
                const priceInput = row.querySelector('.quotation-item-price');
                priceInput.value = price;
                calculateQuotationItemTotal(priceInput);
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

            // Calculate Quotation Item Total
            function calculateQuotationItemTotal(input) {
                const row = input.closest('tr');
                const quantity = parseFloat(row.querySelector('.quotation-item-quantity').value) || 0;
                const price = parseFloat(row.querySelector('.quotation-item-price').value) || 0;
                const amount = quantity * price;
                
                row.querySelector('.quotation-item-amount').textContent = '₹' + amount.toFixed(2);
                
                calculateQuotationTotal();
            }
            
            // Load delivery methods based on courier partner
            function loadDeliveryMethods() {
                const partner = document.getElementById('quotationCourierPartner').value;
                const methodSelect = document.getElementById('quotationDeliveryMethod');
                
                methodSelect.innerHTML = '<option value="">Select Delivery Method</option>';
                
                if (!partner) {
                    document.getElementById('quotationCourierCost').value = 0;
                    calculateQuotationTotal();
                    return;
                }
                
                // Load delivery methods based on partner
                if (partner === 'Self Pickup') {
                    methodSelect.innerHTML += '<option value="Self Pickup">Self Pickup</option>';
                } else if (partner === 'Hand Delivery') {
                    methodSelect.innerHTML += '<option value="Hand Delivery">Hand Delivery</option>';
                } else {
                    methodSelect.innerHTML += '<option value="Surface">Surface</option>';
                    methodSelect.innerHTML += '<option value="Express">Express</option>';
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

            // Calculate Quotation Total
            function calculateQuotationTotal() {
                const rows = document.querySelectorAll('#quotationItemsRows tr');
                let subtotal = 0;
                
                rows.forEach(row => {
                    const quantity = parseFloat(row.querySelector('.quotation-item-quantity').value) || 0;
                    const price = parseFloat(row.querySelector('.quotation-item-price').value) || 0;
                    subtotal += quantity * price;
                });
                
                const courierCost = parseFloat(document.getElementById('quotationCourierCost').value) || 0;
                const billType = document.getElementById('quotationBillType').value;
                const gst = billType === 'with' ? (subtotal + courierCost) * 0.18 : 0;
                const total = subtotal + courierCost + gst;
                
                document.getElementById('quotationSubtotal').textContent = '₹' + subtotal.toFixed(2);
                document.getElementById('quotationCourierDisplay').textContent = '₹' + courierCost.toFixed(2);
                document.getElementById('quotationGST').textContent = '₹' + gst.toFixed(2);
                document.getElementById('quotationTotal').textContent = '₹' + total.toFixed(2);
                
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
                    const productName = productSelect.options[productSelect.selectedIndex].text;
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
                    notes: formData.get('notes'),
                    terms_conditions: formData.get('terms_conditions'),
                    created_by: currentUser.fullName
                };
                
                try {
                    const response = await axios.post('/api/quotations', quotationData);
                    
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
                        alert('Error creating quotation: ' + response.data.error);
                    }
                } catch (error) {
                    console.error('Error:', error);
                    alert('Failed to create quotation. Please try again.');
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
                    
                    // Build items table rows
                    const itemsTable = items.map((item, index) => 
                        '<tr>' +
                            '<td style="border: 1px solid #000; padding: 8px 4px; text-align: center; font-size: 13px;">' + (index + 1) + '</td>' +
                            '<td style="border: 1px solid #000; padding: 8px; text-align: left; font-size: 13px;">' + item.product_name + '</td>' +
                            '<td style="border: 1px solid #000; padding: 8px 4px; text-align: center; font-size: 13px;">85219090</td>' +
                            '<td style="border: 1px solid #000; padding: 8px; text-align: center; font-size: 13px;">' + item.quantity + '</td>' +
                            '<td style="border: 1px solid #000; padding: 8px; text-align: right; font-size: 13px;">₹' + item.unit_price.toLocaleString() + '</td>' +
                            '<td style="border: 1px solid #000; padding: 8px; text-align: right; font-size: 13px; font-weight: 600;">₹' + item.amount.toLocaleString() + '</td>' +
                        '</tr>'
                    ).join('');
                    
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
                    
                    const amountInWords = numberToWords(Math.floor(quotation.total_amount)) + ' Rupees only';
                    
                    // Get theme color
                    const theme = quotation.theme || 'blue';
                    const themeColors = {
                        blue: { primary: '#3B82F6', secondary: '#1E40AF', light: '#EFF6FF' },
                        green: { primary: '#10B981', secondary: '#047857', light: '#ECFDF5' },
                        purple: { primary: '#8B5CF6', secondary: '#6D28D9', light: '#F5F3FF' },
                        orange: { primary: '#F97316', secondary: '#C2410C', light: '#FFF7ED' },
                        red: { primary: '#EF4444', secondary: '#B91C1C', light: '#FEF2F2' }
                    };
                    const themeColor = themeColors[theme];
                    
                    // Professional Quotation Template matching reference PDF
                    content.innerHTML = '<div id="quotation-printable" style="padding: 30px; background: white; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">' +
                        // Logo and Company Header Section
                        '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 3px solid ' + themeColor.primary + ';">' +
                            '<div>' +
                                '<img src="/static/axelguard-logo.png" alt="AxelGuard" style="height: 60px; width: auto;">' +
                            '</div>' +
                            '<div style="text-align: right;">' +
                                '<p style="margin: 3px 0; font-size: 12px; font-weight: 600;"><i class="fas fa-phone"></i> +91 8755311835</p>' +
                                '<p style="margin: 3px 0; font-size: 12px;"><i class="fas fa-envelope"></i> info@axel-guard.com</p>' +
                            '</div>' +
                        '</div>' +
                        
                        '<div style="text-align: center; margin-bottom: 25px; padding: 15px; background: ' + themeColor.light + '; border-radius: 8px;">' +
                            '<h1 style="color: ' + themeColor.primary + '; font-size: 24px; font-weight: bold; margin: 5px 0;">AxelGuard</h1>' +
                            '<p style="margin: 3px 0; font-size: 12px; color: #6b7280;">Office No 210, PC Chamber, Sector 66, Noida, Uttar Pradesh, 201301</p>' +
                            '<p style="margin: 3px 0; font-size: 13px; font-weight: 600; color: ' + themeColor.secondary + ';">GSTIN: 09FSEPP6050C1ZQ</p>' +
                            '<p style="margin: 3px 0; font-size: 13px; font-weight: 600; color: ' + themeColor.secondary + ';">State: 09 - Uttar Pradesh</p>' +
                        '</div>' +
                        
                        // Customer Details Section
                        '<div style="margin-bottom: 25px;">' +
                            '<h3 style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #000;">Estimate For:</h3>' +
                            '<p style="margin: 3px 0; font-size: 13px; font-weight: 600;">' + (quotation.company_name || quotation.customer_name) + '</p>' +
                            '<p style="margin: 3px 0; font-size: 13px;">' + (quotation.customer_address || '') + '</p>' +
                            (quotation.gst_registered_address ? '<p style="margin: 3px 0; font-size: 13px;"><strong>GST Address:</strong> ' + quotation.gst_registered_address + '</p>' : '') +
                        '</div>' +
                        
                        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">' +
                            '<div>' +
                                '<p style="margin: 3px 0; font-size: 13px;"><strong>Contact No.:</strong> ' + (quotation.customer_contact || '') + '</p>' +
                                (quotation.gst_number ? '<p style="margin: 3px 0; font-size: 13px;"><strong>GST No.:</strong> ' + quotation.gst_number + '</p>' : '') +
                            '</div>' +
                            '<div>' +
                                '<p style="margin: 3px 0; font-size: 13px;"><strong>Concern Person Name:</strong> ' + (quotation.concern_person_name || '') + '</p>' +
                                '<p style="margin: 3px 0; font-size: 13px;"><strong>Concern Person Mobile:</strong> ' + (quotation.concern_person_contact || '') + '</p>' +
                            '</div>' +
                        '</div>' +
                        
                        // Items Table
                        '<table style="width: 100%; border-collapse: collapse; margin: 25px 0; font-size: 13px;">' +
                            '<thead>' +
                                '<tr style="background: #f3f4f6;">' +
                                    '<th style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">#</th>' +
                                    '<th style="border: 1px solid #000; padding: 8px; text-align: left; font-weight: bold;">Item name</th>' +
                                    '<th style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">HSN/ SAC</th>' +
                                    '<th style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">Qty</th>' +
                                    '<th style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold;">Rate</th>' +
                                    '<th style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold;">Amount</th>' +
                                '</tr>' +
                            '</thead>' +
                            '<tbody>' + itemsTable + '</tbody>' +
                            '<tr>' +
                                '<td colspan="5" style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: 600;">Subtotal</td>' +
                                '<td style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: 600;">₹' + quotation.subtotal.toLocaleString() + '</td>' +
                            '</tr>' +
                            (quotation.courier_cost > 0 ? 
                                '<tr>' +
                                    '<td colspan="5" style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: 600;">Courier Charges (' + (quotation.courier_partner || 'Standard') + ')</td>' +
                                    '<td style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: 600;">₹' + quotation.courier_cost.toLocaleString() + '</td>' +
                                '</tr>' : '') +
                            (quotation.gst_amount > 0 ? 
                                '<tr>' +
                                    '<td colspan="5" style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: 600;">GST (18%)</td>' +
                                    '<td style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: 600;">₹' + quotation.gst_amount.toLocaleString() + '</td>' +
                                '</tr>' : '') +
                            '<tr style="background: ' + themeColor.light + ';">' +
                                '<td colspan="5" style="border: 1px solid #000; padding: 10px; text-align: right; font-weight: bold; font-size: 15px; color: ' + themeColor.primary + ';">Total Amount</td>' +
                                '<td style="border: 1px solid #000; padding: 10px; text-align: right; font-weight: bold; font-size: 15px; color: ' + themeColor.primary + ';">₹' + quotation.total_amount.toLocaleString() + '</td>' +
                            '</tr>' +
                        '</table>' +
                        
                        // Bank Details Section
                        '<div style="margin: 30px 0; padding: 15px; border: 1px solid #ddd; background: #fafafa;">' +
                            '<h3 style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">Pay To:</h3>' +
                            '<p style="margin: 3px 0; font-size: 13px;"><strong>Bank Name:</strong> IDFC FIRST BANK LTD, NOIDA-SIXTEEN BRANCH</p>' +
                            '<p style="margin: 3px 0; font-size: 13px;"><strong>Bank Account No.:</strong> 10188344828</p>' +
                            '<p style="margin: 3px 0; font-size: 13px;"><strong>Bank IFSC code:</strong> IDFB0020158</p>' +
                            '<p style="margin: 3px 0; font-size: 13px;"><strong>Account holder\\'s name:</strong> RealTrack Technology</p>' +
                        '</div>' +
                        
                        // Amount in Words
                        '<div style="margin: 20px 0; padding: 10px; background: #f9fafb; border-left: 4px solid #667eea;">' +
                            '<p style="margin: 0; font-size: 13px; font-weight: 600;">Estimate Amount In Words</p>' +
                            '<p style="margin: 5px 0; font-size: 14px; font-weight: bold; color: #667eea;">' + amountInWords + '</p>' +
                        '</div>' +
                        
                        // Terms & Conditions
                        '<div style="margin-top: 30px; padding: 15px; border: 1px solid #ddd;">' +
                            '<h3 style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">Terms And Conditions:</h3>' +
                            '<p style="margin: 0; font-size: 12px; white-space: pre-line;">' + (quotation.terms_conditions || 'This quotation is valid for 30 days from the date of issue.\\nPayment terms: 100% advance or as mutually agreed.\\nPrices are subject to change without prior notice.') + '</p>' +
                        '</div>' +
                        
                        // Footer
                        '<div style="margin-top: 40px; text-align: center; color: #6b7280; font-size: 11px; border-top: 1px solid #ddd; padding-top: 15px;">' +
                            '<p style="margin: 3px 0;">Thank you for your business!</p>' +
                            '<p style="margin: 3px 0;">RealTrack Technology | Email: info.realtrack@gmail.com | Phone: +91 8755311835</p>' +
                        '</div>' +
                    '</div>';
                } catch (error) {
                    console.error('Error loading quotation:', error);
                    content.innerHTML = '<div class="card" style="background: #fee2e2; color: #991b1b;">Error loading quotation details</div>';
                }
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
                    
                    // Set theme
                    const themeRadios = document.getElementsByName('quotation_theme');
                    for (let radio of themeRadios) {
                        if (radio.value === (quotation.theme || 'blue')) {
                            radio.checked = true;
                        }
                    }
                    
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
                    
                    for (const item of items) {
                        await addQuotationItem();
                        const row = itemsRows.lastElementChild;
                        
                        // Note: We can't perfectly restore category/product selections
                        // So we'll just set the product name and values
                        const productSelect = row.querySelector('.quotation-item-product');
                        const option = document.createElement('option');
                        option.value = 'custom';
                        option.textContent = item.product_name;
                        option.selected = true;
                        productSelect.appendChild(option);
                        
                        row.querySelector('.quotation-item-quantity').value = item.quantity;
                        row.querySelector('.quotation-item-price').value = item.unit_price;
                        row.querySelector('.quotation-item-amount').textContent = '₹' + item.amount.toFixed(2);
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
            
            // ============================================
            // DATABASE-BASED LOGIN SYSTEM
            // Uses API endpoint to authenticate against users table
            // ============================================
            let currentUser = null;
            
            // Eye-tracking animation for login characters
            document.addEventListener('mousemove', (e) => {
                const characters = document.querySelectorAll('.character');
                
                characters.forEach(character => {
                    const pupils = character.querySelectorAll('.pupil');
                    const eyes = character.querySelectorAll('.eye');
                    
                    eyes.forEach((eye, index) => {
                        const eyeRect = eye.getBoundingClientRect();
                        const eyeCenterX = eyeRect.left + eyeRect.width / 2;
                        const eyeCenterY = eyeRect.top + eyeRect.height / 2;
                        
                        const angle = Math.atan2(e.clientY - eyeCenterY, e.clientX - eyeCenterX);
                        const distance = Math.min(8, Math.sqrt(Math.pow(e.clientX - eyeCenterX, 2) + Math.pow(e.clientY - eyeCenterY, 2)) / 20);
                        
                        const pupilX = Math.cos(angle) * distance;
                        const pupilY = Math.sin(angle) * distance;
                        
                        pupils[index].style.transform = 'translate(calc(-50% + ' + pupilX + 'px), calc(-50% + ' + pupilY + 'px))';
                    });
                });
            });
            
            // Blinking animation for characters
            function addBlinkAnimation() {
                const eyes = document.querySelectorAll('.eye');
                
                setInterval(() => {
                    eyes.forEach(eye => {
                        if (Math.random() > 0.7) {
                            eye.classList.add('blink');
                            setTimeout(() => {
                                eye.classList.remove('blink');
                            }, 300);
                        }
                    });
                }, 3000);
            }
            
            // Start blinking when page loads
            window.addEventListener('load', addBlinkAnimation);
            
            // Toggle password visibility
            function togglePasswordVisibility() {
                const passwordInput = document.getElementById('loginPassword');
                const toggleIcon = document.getElementById('passwordToggleIcon');
                
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    toggleIcon.classList.remove('fa-eye');
                    toggleIcon.classList.add('fa-eye-slash');
                } else {
                    passwordInput.type = 'password';
                    toggleIcon.classList.remove('fa-eye-slash');
                    toggleIcon.classList.add('fa-eye');
                }
            }
            
            // Database-based login using API
            async function handleLogin(event) {
                event.preventDefault();
                console.log('🔵 [FRONTEND] handleLogin called');
                
                const username = document.getElementById('loginUsername').value.trim();
                const password = document.getElementById('loginPassword').value;
                const errorDiv = document.getElementById('loginError');
                const submitBtn = event.target.querySelector('button[type="submit"]');
                
                console.log('🔵 [FRONTEND] Username:', username);
                console.log('🔵 [FRONTEND] Password length:', password.length);
                console.log('🔵 [FRONTEND] Axios available:', typeof axios);
                
                // Hide previous errors
                errorDiv.style.display = 'none';
                errorDiv.textContent = '';
                
                // Show loading
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
                }
                
                try {
                    console.log('🔵 [FRONTEND] Sending POST request to /api/auth/login...');
                    const response = await axios.post('/api/auth/login', {
                        username: username,
                        password: password
                    });
                    
                    console.log('🔵 [FRONTEND] Response received:', response.data);
                    
                    if (response.data.success) {
                        console.log('🟢 [FRONTEND] Login successful!');
                        currentUser = response.data.data;
                        sessionStorage.setItem('user', JSON.stringify(currentUser));
                        console.log('🟢 [FRONTEND] User saved to sessionStorage');
                        showDashboard();
                    } else {
                        console.log('🔴 [FRONTEND] Login failed - success=false');
                        throw new Error(response.data.error || 'Login failed');
                    }
                } catch (error) {
                    console.error('🔴 [FRONTEND] Login error:', error);
                    console.error('🔴 [FRONTEND] Error details:', {
                        message: error.message,
                        response: error.response?.data,
                        status: error.response?.status
                    });
                    
                    errorDiv.textContent = error.response?.data?.error || error.message || 'Login failed. Please try again.';
                    errorDiv.style.display = 'block';
                    
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                    }
                }
                
                return false;
            }
            
            function handleLogout() {
                console.log('Logging out...');
                currentUser = null;
                sessionStorage.removeItem('user');
                document.getElementById('loginScreen').style.display = 'grid';
                document.getElementById('mainDashboard').style.display = 'none';
                document.getElementById('loginUsername').value = '';
                document.getElementById('loginPassword').value = '';
                
                // Reset login button
                const submitBtn = document.querySelector('#loginForm button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Log in';
                }
                
                // Clear any error messages
                const errorDiv = document.getElementById('loginError');
                if (errorDiv) {
                    errorDiv.style.display = 'none';
                    errorDiv.textContent = '';
                }
            }
            
            function showDashboard() {
                console.log('showDashboard() called');
                console.log('Current user:', currentUser);
                
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('mainDashboard').style.display = 'block';
                
                const displayName = currentUser.employeeName || currentUser.fullName || currentUser.username;
                document.getElementById('userDisplay').textContent = 'Hi ' + displayName;
                
                console.log('Dashboard should be visible now');
                
                // Update UI based on role
                updateUIForRole();
                loadDashboard();
            }
            
            function updateUIForRole() {
                const isAdmin = currentUser.role === 'admin';
                const hasEditPermission = isAdmin || (currentUser.permissions && currentUser.permissions.canEdit);
                const hasDeletePermission = isAdmin || (currentUser.permissions && currentUser.permissions.canDelete);
                
                console.log('📊 Permissions:', {
                    role: currentUser.role,
                    isAdmin: isAdmin,
                    hasEditPermission: hasEditPermission,
                    hasDeletePermission: hasDeletePermission,
                    permissions: currentUser.permissions
                });
                
                // Hide/show Edit buttons in Sale Database
                document.querySelectorAll('.btn-edit-sale').forEach(btn => {
                    btn.style.display = hasEditPermission ? 'inline-block' : 'none';
                });
                
                // Hide/show Delete buttons in Sale Database
                document.querySelectorAll('.btn-delete-sale').forEach(btn => {
                    btn.style.display = hasDeletePermission ? 'inline-block' : 'none';
                });
                
                // Hide/show Edit buttons in Leads Database
                document.querySelectorAll('.btn-edit-lead').forEach(btn => {
                    btn.style.display = hasEditPermission ? 'inline-block' : 'none';
                });
                
                // Hide/show Delete buttons in Leads Database
                document.querySelectorAll('.btn-delete-lead').forEach(btn => {
                    btn.style.display = hasDeletePermission ? 'inline-block' : 'none';
                });
                
                // Hide/show all generic edit/delete buttons
                document.querySelectorAll('.btn-edit').forEach(btn => {
                    btn.style.display = hasEditPermission ? 'inline-block' : 'none';
                });
                document.querySelectorAll('.btn-delete').forEach(btn => {
                    btn.style.display = hasDeletePermission ? 'inline-block' : 'none';
                });
                
                // Hide/show Excel Upload sidebar item (admin only)
                const uploadItem = document.querySelector('[onclick="showPage(\\'excel-upload\\')"]');
                if (uploadItem) {
                    uploadItem.style.display = isAdmin ? 'block' : 'none';
                }
                
                // Hide/show User Management sidebar item (admin only)
                const userManagementItem = document.getElementById('userManagementMenuItem');
                if (userManagementItem) {
                    userManagementItem.style.display = isAdmin ? 'block' : 'none';
                }
                
                // If no edit permission, show view-only message
                if (!hasEditPermission) {
                    console.log('⚠️ User has VIEW-ONLY access');
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
                    
                    // Load incentives
                    const incentiveResponse = await axios.get('/api/reports/incentives');
                    const incentives = incentiveResponse.data.data;
                    
                    renderIncentiveTable(incentives);
                    
                    // Load incentive history
                    loadIncentiveHistory();
                    
                    // Load product and customer analysis
                    loadProductAnalysis();
                    loadCustomerAnalysis();
                    
                    // Load balance payment summary
                    loadBalancePaymentSummary();
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
            
            // Balance Payment Report Functions
            let balancePaymentPieChart = null;
            
            async function loadBalancePaymentSummary() {
                try {
                    const response = await axios.get('/api/reports/balance-payment-summary');
                    const data = response.data.data;
                    
                    // Update summary cards
                    document.getElementById('reportBalanceCurrentMonth').textContent = '₹' + data.currentMonth.balance.toLocaleString();
                    document.getElementById('reportBalanceCurrentMonthCount').textContent = data.currentMonth.count + ' pending orders';
                    
                    document.getElementById('reportBalanceQuarterly').textContent = '₹' + data.quarterly.balance.toLocaleString();
                    document.getElementById('reportBalanceQuarterlyCount').textContent = data.quarterly.count + ' pending orders';
                    
                    document.getElementById('reportBalanceYTD').textContent = '₹' + data.ytd.balance.toLocaleString();
                    document.getElementById('reportBalanceYTDCount').textContent = data.ytd.count + ' pending orders';
                    
                    // Render pie chart
                    renderBalancePaymentPieChart(data.currentMonth.balance, data.currentMonth.count);
                } catch (error) {
                    console.error('Error loading balance payment summary:', error);
                }
            }
            
            function renderBalancePaymentPieChart(balance, count) {
                const ctx = document.getElementById('balancePaymentPieChart');
                if (!ctx) return;
                
                const context = ctx.getContext('2d');
                
                if (balancePaymentPieChart) {
                    balancePaymentPieChart.destroy();
                }
                
                // Create simple visual representation
                const totalBalance = balance;
                const pending = totalBalance;
                
                balancePaymentPieChart = new Chart(context, {
                    type: 'doughnut',
                    data: {
                        labels: ['Pending Balance', 'Collected'],
                        datasets: [{
                            data: [pending, 0], // We only show pending in this chart
                            backgroundColor: [
                                'rgba(236, 72, 153, 0.8)',
                                'rgba(16, 185, 129, 0.8)'
                            ],
                            borderColor: [
                                'rgba(236, 72, 153, 1)',
                                'rgba(16, 185, 129, 1)'
                            ],
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: {
                                position: 'bottom'
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        if (context.dataIndex === 0) {
                                            return 'Pending: ₹' + pending.toLocaleString() + ' (' + count + ' orders)';
                                        }
                                        return 'Collected';
                                    }
                                }
                            }
                        }
                    }
                });
            }
            
            function openBalancePaymentReportModal() {
                document.getElementById('balancePaymentReportModal').classList.add('show');
                switchBalanceReportTab('current-month');
            }
            
            function switchBalanceReportTab(tab) {
                // Update tab buttons
                ['current-month', 'quarter', 'ytd', 'employee'].forEach(t => {
                    const btn = document.getElementById('report-' + t + '-tab');
                    const content = document.getElementById('report-' + t + '-content');
                    if (t === tab) {
                        btn.classList.add('active');
                        content.style.display = 'block';
                    } else {
                        btn.classList.remove('active');
                        content.style.display = 'none';
                    }
                });
                
                // Load data based on tab
                if (tab === 'current-month') {
                    loadBalancePaymentDetails('current-month');
                } else if (tab === 'quarter') {
                    loadBalancePaymentDetails('quarter');
                } else if (tab === 'ytd') {
                    loadBalancePaymentDetails('ytd');
                } else if (tab === 'employee') {
                    loadEmployeeBalanceReport('current-month');
                }
            }
            
            async function loadBalancePaymentDetails(period) {
                try {
                    const response = await axios.get(\`/api/reports/balance-payment-details?period=\${period}\`);
                    const details = response.data.data;
                    
                    let tableId, totalId, countId;
                    if (period === 'current-month') {
                        tableId = 'currentMonthBalanceTable';
                        totalId = 'currentMonthBalanceTotal';
                        countId = 'currentMonthPendingCount';
                    } else if (period === 'quarter') {
                        tableId = 'quarterBalanceTable';
                        totalId = 'quarterBalanceTotal';
                        countId = 'quarterPendingCount';
                    } else {
                        tableId = 'ytdBalanceTable';
                        totalId = 'ytdBalanceTotal';
                        countId = 'ytdPendingCount';
                    }
                    
                    const tbody = document.getElementById(tableId);
                    
                    if (!details || details.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #6b7280;">No pending balance payments</td></tr>';
                        document.getElementById(totalId).textContent = '₹0';
                        document.getElementById(countId).textContent = '0';
                        return;
                    }
                    
                    // Calculate totals
                    const totalBalance = details.reduce((sum, d) => sum + d.balance_amount, 0);
                    document.getElementById(totalId).textContent = '₹' + totalBalance.toLocaleString();
                    document.getElementById(countId).textContent = details.length;
                    
                    tbody.innerHTML = details.map(d => \`
                        <tr>
                            <td><strong>\${d.order_id}</strong></td>
                            <td>\${d.customer_name}</td>
                            <td>\${d.company_name || '-'}</td>
                            <td>\${d.employee_name}</td>
                            <td>\${new Date(d.sale_date).toLocaleDateString()}</td>
                            <td>₹\${d.total_amount.toLocaleString()}</td>
                            <td>₹\${d.amount_received.toLocaleString()}</td>
                            <td style="color: #dc2626; font-weight: 600;">₹\${d.balance_amount.toLocaleString()}</td>
                        </tr>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading balance payment details:', error);
                }
            }
            
            let currentEmployeePeriod = 'current-month';
            
            async function loadEmployeeBalanceReport(period) {
                currentEmployeePeriod = period;
                
                // Update employee tab buttons
                ['current-month', 'quarter', 'ytd'].forEach(p => {
                    const btn = document.getElementById('employee-' + p + '-tab');
                    if (p === period) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                
                try {
                    const response = await axios.get(\`/api/reports/balance-payment-employee?period=\${period}\`);
                    const employees = response.data.data;
                    
                    const tbody = document.getElementById('employeeBalanceTable');
                    
                    if (!employees || employees.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No data available</td></tr>';
                        return;
                    }
                    
                    // Calculate totals
                    const totalPending = employees.reduce((sum, e) => sum + e.pending_orders, 0);
                    const totalBalance = employees.reduce((sum, e) => sum + e.total_balance, 0);
                    const totalSales = employees.reduce((sum, e) => sum + e.total_sales, 0);
                    const totalReceived = employees.reduce((sum, e) => sum + e.total_received, 0);
                    const overallCollection = totalSales > 0 ? ((totalReceived / totalSales) * 100).toFixed(1) : 0;
                    
                    tbody.innerHTML = employees.map(emp => {
                        const collectionPct = emp.total_sales > 0 ? ((emp.total_received / emp.total_sales) * 100).toFixed(1) : 0;
                        return \`
                        <tr>
                            <td><strong>\${emp.employee_name}</strong></td>
                            <td>\${emp.pending_orders}</td>
                            <td style="color: #dc2626; font-weight: 600;">₹\${emp.total_balance.toLocaleString()}</td>
                            <td>₹\${emp.total_sales.toLocaleString()}</td>
                            <td>₹\${emp.total_received.toLocaleString()}</td>
                            <td>
                                <div style="position: relative; width: 100%; background: #e5e7eb; border-radius: 4px; height: 24px; overflow: hidden;">
                                    <div style="position: absolute; left: 0; top: 0; height: 100%; background: \${collectionPct >= 80 ? '#10b981' : collectionPct >= 50 ? '#f59e0b' : '#ef4444'}; width: \${collectionPct}%; transition: width 0.3s;"></div>
                                    <span style="position: absolute; left: 0; right: 0; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; color: #1f2937;">
                                        \${collectionPct}%
                                    </span>
                                </div>
                            </td>
                        </tr>
                    \`;
                    }).join('') + \`
                        <tr style="background: #f3f4f6; font-weight: 700; border-top: 2px solid #ec4899;">
                            <td><strong>TOTAL</strong></td>
                            <td>\${totalPending}</td>
                            <td style="color: #dc2626;">₹\${totalBalance.toLocaleString()}</td>
                            <td>₹\${totalSales.toLocaleString()}</td>
                            <td>₹\${totalReceived.toLocaleString()}</td>
                            <td>
                                <div style="position: relative; width: 100%; background: #e5e7eb; border-radius: 4px; height: 24px; overflow: hidden;">
                                    <div style="position: absolute; left: 0; top: 0; height: 100%; background: \${overallCollection >= 80 ? '#10b981' : overallCollection >= 50 ? '#f59e0b' : '#ef4444'}; width: \${overallCollection}%; transition: width 0.3s;"></div>
                                    <span style="position: absolute; left: 0; right: 0; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; color: #1f2937;">
                                        \${overallCollection}%
                                    </span>
                                </div>
                            </td>
                        </tr>
                    \`;
                } catch (error) {
                    console.error('Error loading employee balance report:', error);
                    const tbody = document.getElementById('employeeBalanceTable');
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #dc2626;">Error loading data</td></tr>';
                }
            }
            
            // ============================================
            // CHANGE PASSWORD - API-BASED (NO CURRENT PASSWORD REQUIRED)
            // ============================================
            async function changePassword(event) {
                event.preventDefault();
                
                console.log('=== CHANGE PASSWORD STARTED ===');
                
                const newPassword = document.getElementById('newPassword').value;
                const confirmPassword = document.getElementById('confirmPassword').value;
                const statusDiv = document.getElementById('passwordChangeStatus');
                
                // Validate new passwords match
                if (newPassword !== confirmPassword) {
                    console.log('❌ New passwords do not match');
                    statusDiv.className = 'alert-error';
                    statusDiv.textContent = 'New passwords do not match!';
                    statusDiv.style.display = 'block';
                    return;
                }
                
                // Validate new password length
                if (newPassword.length < 6) {
                    console.log('❌ Password too short');
                    statusDiv.className = 'alert-error';
                    statusDiv.textContent = 'New password must be at least 6 characters long!';
                    statusDiv.style.display = 'block';
                    return;
                }
                
                // Get current user from session
                const user = JSON.parse(sessionStorage.getItem('user') || '{}');
                if (!user.id) {
                    statusDiv.className = 'alert-error';
                    statusDiv.textContent = 'User session not found. Please login again.';
                    statusDiv.style.display = 'block';
                    return;
                }
                
                try {
                    const response = await axios.post('/api/auth/change-password', {
                        userId: user.id,
                        newPassword: newPassword
                    });
                    
                    if (response.data.success) {
                        console.log('✅ Password changed successfully');
                        statusDiv.className = 'alert-success';
                        statusDiv.textContent = 'Password changed successfully!';
                        statusDiv.style.display = 'block';
                        document.getElementById('changePasswordForm').reset();
                    } else {
                        statusDiv.className = 'alert-error';
                        statusDiv.textContent = response.data.error || 'Failed to change password';
                        statusDiv.style.display = 'block';
                    }
                } catch (error) {
                    console.error('Error changing password:', error);
                    statusDiv.className = 'alert-error';
                    statusDiv.textContent = 'Failed to change password: ' + (error.response?.data?.error || error.message);
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
                        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #6b7280;">No users found</td></tr>';
                        return;
                    }
                    
                    tbody.innerHTML = users.map(user => \`
                        <tr>
                            <td>\${user.id}</td>
                            <td><strong>\${user.username}</strong></td>
                            <td>\${user.full_name}</td>
                            <td><span class="badge \${user.role === 'admin' ? 'badge-error' : 'badge-success'}">\${user.role}</span></td>
                            <td>\${user.employee_name || '-'}</td>
                            <td>
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    <div style="display: flex; gap: 3px; flex-wrap: wrap; align-items: center;">
                                        <span style="font-size: 10px; font-weight: 600; color: #1e40af;">Sales:</span>
                                        \${user.sales_edit ? '<span class="badge badge-success" style="font-size: 9px; padding: 2px 4px;">Edit</span>' : ''}
                                        \${user.sales_delete ? '<span class="badge badge-error" style="font-size: 9px; padding: 2px 4px;">Del</span>' : ''}
                                        \${(!user.sales_edit && !user.sales_delete) ? '<span class="badge badge-warning" style="font-size: 9px; padding: 2px 4px;">View</span>' : ''}
                                    </div>
                                    <div style="display: flex; gap: 3px; flex-wrap: wrap; align-items: center;">
                                        <span style="font-size: 10px; font-weight: 600; color: #15803d;">Inv:</span>
                                        \${user.inventory_edit ? '<span class="badge badge-success" style="font-size: 9px; padding: 2px 4px;">Edit</span>' : ''}
                                        \${user.inventory_delete ? '<span class="badge badge-error" style="font-size: 9px; padding: 2px 4px;">Del</span>' : ''}
                                        \${(!user.inventory_edit && !user.inventory_delete) ? '<span class="badge badge-warning" style="font-size: 9px; padding: 2px 4px;">View</span>' : ''}
                                    </div>
                                    <div style="display: flex; gap: 3px; flex-wrap: wrap; align-items: center;">
                                        <span style="font-size: 10px; font-weight: 600; color: #92400e;">Leads:</span>
                                        \${user.leads_edit ? '<span class="badge badge-success" style="font-size: 9px; padding: 2px 4px;">Edit</span>' : ''}
                                        \${user.leads_delete ? '<span class="badge badge-error" style="font-size: 9px; padding: 2px 4px;">Del</span>' : ''}
                                        \${(!user.leads_edit && !user.leads_delete) ? '<span class="badge badge-warning" style="font-size: 9px; padding: 2px 4px;">View</span>' : ''}
                                    </div>
                                </div>
                            </td>
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
                    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #dc2626;">Error loading users</td></tr>';
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
                    
                    // Set module permission checkboxes
                    document.getElementById('editUserSalesEdit').checked = user.sales_edit === 1;
                    document.getElementById('editUserSalesDelete').checked = user.sales_delete === 1;
                    document.getElementById('editUserInventoryEdit').checked = user.inventory_edit === 1;
                    document.getElementById('editUserInventoryDelete').checked = user.inventory_delete === 1;
                    document.getElementById('editUserLeadsEdit').checked = user.leads_edit === 1;
                    document.getElementById('editUserLeadsDelete').checked = user.leads_delete === 1;
                    document.getElementById('editUserReportsEdit').checked = user.reports_edit === 1;
                    
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
                    can_edit: 1,  // Legacy - always 1 for backward compatibility
                    can_delete: 1,  // Legacy - always 1 for backward compatibility
                    can_view: 1,  // Always 1
                    sales_view: 1,
                    sales_edit: document.getElementById('editUserSalesEdit').checked ? 1 : 0,
                    sales_delete: document.getElementById('editUserSalesDelete').checked ? 1 : 0,
                    inventory_view: 1,
                    inventory_edit: document.getElementById('editUserInventoryEdit').checked ? 1 : 0,
                    inventory_delete: document.getElementById('editUserInventoryDelete').checked ? 1 : 0,
                    leads_view: 1,
                    leads_edit: document.getElementById('editUserLeadsEdit').checked ? 1 : 0,
                    leads_delete: document.getElementById('editUserLeadsDelete').checked ? 1 : 0,
                    reports_view: 1,
                    reports_edit: document.getElementById('editUserReportsEdit').checked ? 1 : 0,
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
            
            // ===================================================================
            // INVENTORY MANAGEMENT FUNCTIONS
            // ===================================================================
            
            let inventoryChart = null;
            let dispatchChart = null;
            
            // Load inventory stock
            async function loadInventory() {
                try {
                    const search = document.getElementById('inventorySearch').value;
                    const status = document.getElementById('inventoryStatusFilter').value;
                    
                    let url = '/api/inventory?';
                    if (search) url += 'search=' + encodeURIComponent(search) + '&';
                    if (status) url += 'status=' + encodeURIComponent(status);
                    
                    const response = await axios.get(url);
                    const tbody = document.getElementById('inventoryTableBody');
                    
                    if (!response.data.success || response.data.data.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: #9ca3af;">No devices found</td></tr>';
                        return;
                    }
                    
                    // Helper function to format date as DD/MMM/YY (e.g., 18/Nov/25)
                    const formatDate = (dateStr) => {
                        if (!dateStr || dateStr === '-' || dateStr === 'null') return '-';
                        const date = new Date(dateStr);
                        if (isNaN(date.getTime())) return '-';
                        
                        const day = String(date.getDate()).padStart(2, '0');
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const month = monthNames[date.getMonth()];
                        const year = String(date.getFullYear()).slice(-2);
                        
                        return \`\${day}/\${month}/\${year}\`;
                    };
                    
                    tbody.innerHTML = response.data.data.map((item, index) => {
                        const statusColors = {
                            'In Stock': 'background: #d1fae5; color: #065f46;',
                            'Dispatched': 'background: #dbeafe; color: #1e40af;',
                            'Quality Check': 'background: #fef3c7; color: #92400e;',
                            'QC Pending': 'background: #fef3c7; color: #92400e;',
                            'Defective': 'background: #fee2e2; color: #991b1b;',
                            'Returned': 'background: #e5e7eb; color: #374151;'
                        };
                        
                        // Display status - rename Quality Check to QC Pending
                        let displayStatus = item.status;
                        if (displayStatus === 'Quality Check') displayStatus = 'QC Pending';
                        
                        // QC Result badge styling (teal for Pass, red for Fail)
                        let qcBadge = '-';
                        if (item.qc_result) {
                            // Keep full text "QC Pass" or "QC Fail"
                            const displayQC = item.qc_result;
                            const qcStyles = {
                                'QC Pass': 'background: #14b8a6; color: white;',
                                'QC Fail': 'background: #ef4444; color: white;'
                            };
                            qcBadge = \`<span style="padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; \${qcStyles[displayQC] || 'background: #14b8a6; color: white;'}">\${displayQC}</span>\`;
                        }
                        
                        return \`
                            <tr>
                                <td style="position: sticky; left: 0; z-index: 10; background: white; box-shadow: 2px 0 4px rgba(0,0,0,0.1);">\${index + 1}</td>
                                <td style="position: sticky; left: 60px; z-index: 10; background: white; box-shadow: 2px 0 4px rgba(0,0,0,0.1);"><strong>\${item.device_serial_no}</strong></td>
                                <td>\${item.model_name}</td>
                                <td><span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; \${statusColors[item.status] || statusColors['QC Pending'] || ''}">\${displayStatus}</span></td>
                                <td>\${qcBadge}</td>
                                <td>\${formatDate(item.in_date)}</td>
                                <td>\${item.customer_name || '-'}</td>
                                <td>\${formatDate(item.dispatch_date)}</td>
                                <td>\${item.cust_code || '-'}</td>
                                <td>\${item.order_id || '-'}</td>
                                <td>
                                    <button class="btn-primary" style="padding: 4px 8px; font-size: 12px;" onclick="viewDevice('\${item.device_serial_no}')">
                                        <i class="fas fa-eye"></i> View
                                    </button>
                                </td>
                            </tr>
                        \`;
                    }).join('');
                } catch (error) {
                    document.getElementById('inventoryTableBody').innerHTML = 
                        '<tr><td colspan="11" style="text-align: center; color: #ef4444;">Error loading inventory</td></tr>';
                }
            }
            
            // Search inventory
            function searchInventory() {
                loadInventory();
            }
            
            // View device details - Complete device journey
            window.viewDevice = async function(serialNo) {
                try {
                    console.log('ViewDevice called with serial:', serialNo);
                    
                    // Fetch device details from inventory
                    const invResponse = await axios.get(\`/api/inventory/search?serial=\${serialNo}\`);
                    console.log('Inventory response:', invResponse.data);
                    
                    if (!invResponse.data.success) {
                        alert('❌ Error: ' + (invResponse.data.error || 'Failed to fetch device'));
                        return;
                    }
                    
                    if (!invResponse.data.data || invResponse.data.data.length === 0) {
                        alert('❌ Device not found with serial: ' + serialNo);
                        return;
                    }
                    
                    const device = invResponse.data.data[0];
                    console.log('Device found:', device);
                    
                    // Calculate business logic fields
                    let customerMobile = 'N/A';
                    let warranty = 'One Year';
                    let saleDate = device.dispatch_date || 'N/A';
                    let licenseRenewTime = 'N/A';
                    let dispatchReason = 'N/A';
                    
                    // Determine dispatch reason
                    if (device.order_id) {
                        dispatchReason = 'Sale';
                    } else if (device.old_serial_no) {
                        dispatchReason = 'Replacement';
                    }
                    
                    // Fetch customer mobile from orders if order_id exists
                    if (device.order_id) {
                        try {
                            const orderResponse = await axios.get('/api/orders/' + device.order_id);
                            if (orderResponse.data.success && orderResponse.data.data) {
                                customerMobile = orderResponse.data.data.customer_contact || 'N/A';
                            }
                        } catch (e) {
                            console.error('Error fetching order details:', e);
                        }
                    }
                    
                    // Calculate license renew time for 4G MDVR models only
                    if (device.product_name && device.product_name.includes('4G MDVR') && saleDate !== 'N/A') {
                        try {
                            const saleDateObj = new Date(saleDate);
                            saleDateObj.setFullYear(saleDateObj.getFullYear() + 1);
                            licenseRenewTime = saleDateObj.toISOString().split('T')[0];
                        } catch (e) {
                            console.error('Error calculating license renew time:', e);
                        }
                    }
                    
                    // Check if this device is a replacement (has old_serial_no)
                    let replacementInfo = '';
                    if (device.old_serial_no) {
                        replacementInfo = \`
                            <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 15px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
                                <h3 style="color: #92400e; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-exchange-alt"></i> Replacement Device
                                </h3>
                                <div style="color: #78350f;">
                                    <strong>This device replaced:</strong> \${device.old_serial_no}<br/>
                                    <strong>Reason:</strong> \${device.dispatch_reason || 'N/A'}
                                </div>
                            </div>
                        \`;
                    }
                    
                    // Check if this device was replaced by another device
                    try {
                        const allInventoryResponse = await axios.get('/api/inventory');
                        if (allInventoryResponse.data.success) {
                            const replacedBy = allInventoryResponse.data.data.find(item => item.old_serial_no === serialNo);
                            if (replacedBy) {
                                replacementInfo += \`
                                    <div style="background: linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 100%); padding: 15px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #8b5cf6;">
                                        <h3 style="color: #5b21b6; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                                            <i class="fas fa-undo-alt"></i> Device Was Replaced
                                        </h3>
                                        <div style="color: #4c1d95;">
                                            <strong>Replaced by:</strong> \${replacedBy.device_serial_no}<br/>
                                            <strong>Reason:</strong> \${replacedBy.dispatch_reason || 'N/A'}<br/>
                                            <strong>Date:</strong> \${replacedBy.dispatch_date || 'N/A'}
                                        </div>
                                    </div>
                                \`;
                            }
                        }
                    } catch (e) {
                        console.error('Error checking replacement:', e);
                    }
                    
                    // Create modal HTML
                    const modalHTML = \`
                        <div class="modal show" id="deviceJourneyModal" style="display: flex !important;">
                            <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
                                    <h2 style="font-size: 24px; font-weight: 700; color: #1f2937;">
                                        <i class="fas fa-info-circle" style="color: #8b5cf6;"></i> Device Details
                                    </h2>
                                    <button onclick="closeDeviceJourneyModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; transition: color 0.2s;">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                                
                                <!-- Basic Device Info -->
                                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px; color: white; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);">
                                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
                                        <div style="background: rgba(255,255,255,0.15); padding: 14px; border-radius: 8px;">
                                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Serial Number</div>
                                            <div style="font-weight: 700; font-size: 16px; font-family: monospace;">\${device.device_serial_no}</div>
                                        </div>
                                        <div style="background: rgba(255,255,255,0.15); padding: 14px; border-radius: 8px;">
                                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Model</div>
                                            <div style="font-weight: 700; font-size: 16px;">\${device.model_name || 'N/A'}</div>
                                        </div>
                                        <div style="background: rgba(255,255,255,0.15); padding: 14px; border-radius: 8px;">
                                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Status</div>
                                            <div style="font-weight: 700; font-size: 16px;">\${device.status || 'N/A'}</div>
                                        </div>
                                        <div style="background: rgba(255,255,255,0.15); padding: 14px; border-radius: 8px;">
                                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Order ID</div>
                                            <div style="font-weight: 700; font-size: 16px;">\${device.order_id || 'N/A'}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Replacement Info -->
                                \${replacementInfo}
                                
                                <!-- IN, OUT, and Replacement Information -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                                    <!-- Device IN -->
                                    <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); padding: 20px; border-radius: 12px; border-left: 4px solid #10b981;">
                                        <h3 style="color: #065f46; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; font-size: 16px;">
                                            <i class="fas fa-sign-in-alt"></i> IN Date
                                        </h3>
                                        <div style="color: #064e3b;">
                                            <div style="font-weight: 700; font-size: 18px;">\${device.in_date || 'N/A'}</div>
                                        </div>
                                    </div>
                                    
                                    <!-- Device OUT -->
                                    <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); padding: 20px; border-radius: 12px; border-left: 4px solid #3b82f6;">
                                        <h3 style="color: #1e40af; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; font-size: 16px;">
                                            <i class="fas fa-sign-out-alt"></i> OUT Date
                                        </h3>
                                        <div style="color: #1e3a8a;">
                                            <div style="font-weight: 700; font-size: 18px; margin-bottom: 10px;">\${device.dispatch_date || 'N/A'}</div>
                                            <div style="font-size: 13px; opacity: 0.9;">\${device.customer_name || 'N/A'}</div>
                                        </div>
                                    </div>
                                    
                                    <!-- Replacement Date -->
                                    <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 20px; border-radius: 12px; border-left: 4px solid #f59e0b;">
                                        <h3 style="color: #92400e; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; font-size: 16px;">
                                            <i class="fas fa-exchange-alt"></i> Replacement
                                        </h3>
                                        <div style="color: #78350f;">
                                            <div style="font-weight: 700; font-size: 18px;">
                                                \${(() => {
                                                    if (device.old_serial_no) {
                                                        return device.dispatch_date || 'N/A';
                                                    }
                                                    return 'N/A';
                                                })()}
                                            </div>
                                            \${device.old_serial_no ? '<div style="font-size: 12px; margin-top: 8px; opacity: 0.9;">Replaced: ' + device.old_serial_no + '</div>' : ''}
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Additional Details -->
                                <div style="background: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb;">
                                    <h3 style="color: #1f2937; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; font-size: 18px;">
                                        <i class="fas fa-list-ul"></i> Additional Information
                                    </h3>
                                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; color: #374151;">
                                        <div>
                                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Customer Code</div>
                                            <div style="font-weight: 600;">\${device.cust_code || 'N/A'}</div>
                                        </div>
                                        <div>
                                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Customer Mobile</div>
                                            <div style="font-weight: 600;">\${customerMobile}</div>
                                        </div>
                                        <div>
                                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Warranty</div>
                                            <div style="font-weight: 600;">\${warranty}</div>
                                        </div>
                                        <div>
                                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">License Renew Time</div>
                                            <div style="font-weight: 600;">\${licenseRenewTime}</div>
                                        </div>
                                        <div>
                                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Sale Date</div>
                                            <div style="font-weight: 600;">\${saleDate}</div>
                                        </div>
                                        <div>
                                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Dispatch Reason</div>
                                            <div style="font-weight: 600;">\${dispatchReason}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    \`;
                    
                    // Remove existing modal if any
                    const existingModal = document.getElementById('deviceJourneyModal');
                    if (existingModal) {
                        existingModal.remove();
                    }
                    
                    // Add modal to body
                    document.body.insertAdjacentHTML('beforeend', modalHTML);
                    
                } catch (error) {
                    console.error('Error viewing device:', error);
                    alert('Error loading device details: ' + (error.response?.data?.error || error.message));
                }
            }
            
            // Close device journey modal
            window.closeDeviceJourneyModal = function() {
                const modal = document.getElementById('deviceJourneyModal');
                if (modal) {
                    modal.remove();
                }
            }
            
            // Upload inventory Excel
            async function uploadInventoryExcel(event) {
                event.preventDefault();
                
                const form = event.target;
                const fileInput = form.querySelector('input[type="file"]');
                const statusDiv = document.getElementById('inventoryUploadStatus');
                const submitBtn = form.querySelector('button[type="submit"]');
                
                if (!fileInput.files[0]) {
                    alert('Please select a file');
                    return;
                }
                
                statusDiv.style.display = 'block';
                statusDiv.className = '';
                statusDiv.textContent = 'Reading file...';
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                
                try {
                    const file = fileInput.files[0];
                    const reader = new FileReader();
                    
                    reader.onload = async function(e) {
                        try {
                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                            
                            if (jsonData.length === 0) {
                                throw new Error('Excel file is empty');
                            }
                            
                            statusDiv.textContent = 'Uploading ' + jsonData.length + ' items...';
                            
                            const response = await axios.post('/api/inventory/upload', { items: jsonData });
                            
                            if (response.data.success) {
                                statusDiv.className = 'alert-success';
                                statusDiv.textContent = response.data.message;
                                form.reset();
                                loadInventory();
                            } else {
                                throw new Error(response.data.error || 'Upload failed');
                            }
                        } catch (error) {
                            statusDiv.className = 'alert-error';
                            statusDiv.textContent = 'Error: ' + (error.response?.data?.error || error.message || 'Upload failed');
                        } finally {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Inventory';
                        }
                    };
                    
                    reader.readAsArrayBuffer(file);
                } catch (error) {
                    statusDiv.className = 'alert-error';
                    statusDiv.textContent = 'Error: ' + error.message;
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Inventory';
                }
            }
            
            // Dispatch device - lookup serial number
            document.getElementById('dispatchSerialNo')?.addEventListener('change', async function() {
                const serialNo = this.value.trim();
                if (!serialNo) return;
                
                try {
                    const response = await axios.get('/api/inventory/' + encodeURIComponent(serialNo));
                    if (response.data.success) {
                        document.getElementById('dispatchModel').value = response.data.data.model_name;
                    }
                } catch (error) {
                    alert('Device not found: ' + serialNo);
                    this.value = '';
                    document.getElementById('dispatchModel').value = '';
                }
            });
            
            // Submit dispatch
            async function submitDispatch(event) {
                event.preventDefault();
                
                const form = event.target;
                const data = {
                    device_serial_no: document.getElementById('dispatchSerialNo').value,
                    dispatch_date: document.getElementById('dispatchDate').value,
                    customer_name: document.getElementById('dispatchCustomerName').value,
                    customer_code: document.getElementById('dispatchCustomerCode').value,
                    customer_mobile: document.getElementById('dispatchCustomerMobile').value,
                    customer_city: document.getElementById('dispatchCustomerCity').value,
                    dispatch_reason: document.getElementById('dispatchReason').value,
                    courier_name: document.getElementById('dispatchCourier').value,
                    tracking_number: document.getElementById('dispatchTracking').value,
                    dispatched_by: document.getElementById('dispatchedBy').value,
                    notes: document.getElementById('dispatchNotes').value
                };
                
                try {
                    const response = await axios.post('/api/inventory/dispatch', data);
                    
                    if (response.data.success) {
                        alert('Device dispatched successfully!');
                        form.reset();
                        document.getElementById('dispatchSerialNo').focus();
                        loadRecentDispatches();
                    }
                } catch (error) {
                    alert('Error: ' + (error.response?.data?.error || error.message));
                }
            }
            
            // Load recent dispatches (legacy function - now calls grouped view)
            async function loadRecentDispatches() {
                await loadGroupedDispatches();
            }
            
            // Switch Dispatch Tab
            function switchDispatchTab(tab) {
                const ordersTab = document.getElementById('dispatchOrdersTab');
                const trackingTab = document.getElementById('trackingDetailsTab');
                const ordersContent = document.getElementById('dispatchOrdersContent');
                const trackingContent = document.getElementById('trackingDetailsContent');
                
                if (tab === 'orders') {
                    // Activate orders tab
                    ordersTab.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
                    ordersTab.style.color = 'white';
                    ordersTab.style.borderBottom = '3px solid #2563eb';
                    
                    trackingTab.style.background = '#f3f4f6';
                    trackingTab.style.color = '#6b7280';
                    trackingTab.style.borderBottom = '3px solid transparent';
                    
                    ordersContent.style.display = 'block';
                    trackingContent.style.display = 'none';
                } else if (tab === 'tracking') {
                    // Activate tracking tab
                    trackingTab.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                    trackingTab.style.color = 'white';
                    trackingTab.style.borderBottom = '3px solid #7c3aed';
                    
                    ordersTab.style.background = '#f3f4f6';
                    ordersTab.style.color = '#6b7280';
                    ordersTab.style.borderBottom = '3px solid transparent';
                    
                    ordersContent.style.display = 'none';
                    trackingContent.style.display = 'block';
                    
                    // Load tracking records when switching to this tab
                    loadTrackingRecordsTab();
                }
            }
            
            // Submit tracking details from tab
            async function submitTrackingDetailsTab(event) {
                event.preventDefault();
                
                console.log('Submit tracking details TAB called');
                
                const orderId = document.getElementById('trackingOrderIdTab').value.trim();
                const courierPartner = document.getElementById('trackingCourierPartnerTab').value;
                const courierMode = document.getElementById('trackingCourierModeTab').value;
                const trackingId = document.getElementById('trackingTrackingIdTab').value.trim();
                
                console.log('Tab form values:', { orderId, courierPartner, courierMode, trackingId });
                
                if (!orderId || !courierPartner || !courierMode || !trackingId) {
                    showTrackingStatusTab('❌ Please fill all required fields', 'error');
                    return;
                }
                
                // Show loading status
                showTrackingStatusTab('⏳ Saving tracking details...', 'info');
                
                try {
                    console.log('Sending POST request from TAB to /api/tracking-details');
                    
                    const response = await axios.post('/api/tracking-details', {
                        order_id: orderId,
                        courier_partner: courierPartner,
                        courier_mode: courierMode,
                        tracking_id: trackingId
                    });
                    
                    console.log('Response received (TAB):', response.data);
                    
                    if (response.data.success) {
                        showTrackingStatusTab('✅ Tracking details added successfully! Weight: ' + response.data.data.weight + ' items', 'success');
                        
                        // Clear form
                        document.getElementById('trackingOrderIdTab').value = '';
                        document.getElementById('trackingCourierPartnerTab').value = '';
                        document.getElementById('trackingCourierModeTab').value = '';
                        document.getElementById('trackingTrackingIdTab').value = '';
                        
                        // Reload tracking records
                        await loadTrackingRecordsTab();
                        
                        // Focus back to Order ID field
                        document.getElementById('trackingOrderIdTab').focus();
                    } else {
                        showTrackingStatusTab('❌ ' + response.data.error, 'error');
                    }
                } catch (error) {
                    console.error('Error submitting tracking (TAB):', error);
                    console.error('Error details (TAB):', error.response);
                    showTrackingStatusTab('❌ Error: ' + (error.response?.data?.error || error.message || 'Failed to save tracking details'), 'error');
                }
            }
            
            // Show tracking status message in tab
            function showTrackingStatusTab(message, type) {
                const statusDiv = document.getElementById('trackingFormStatusTab');
                if (!statusDiv) {
                    console.error('trackingFormStatusTab element not found');
                    return;
                }
                
                statusDiv.style.display = 'block';
                statusDiv.style.padding = '12px';
                statusDiv.style.borderRadius = '8px';
                statusDiv.style.fontWeight = '600';
                statusDiv.textContent = message;
                
                if (type === 'success') {
                    statusDiv.style.background = '#d1fae5';
                    statusDiv.style.color = '#065f46';
                    statusDiv.style.border = '2px solid #10b981';
                } else if (type === 'info') {
                    statusDiv.style.background = '#dbeafe';
                    statusDiv.style.color = '#1e40af';
                    statusDiv.style.border = '2px solid #3b82f6';
                } else {
                    statusDiv.style.background = '#fee2e2';
                    statusDiv.style.color = '#991b1b';
                    statusDiv.style.border = '2px solid #ef4444';
                }
                
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                }, 5000);
            }
            
            // Load tracking records for tab
            let allTrackingRecordsTab = [];
            async function loadTrackingRecordsTab() {
                try {
                    const response = await axios.get('/api/tracking-details');
                    
                    if (response.data.success) {
                        allTrackingRecordsTab = response.data.data || [];
                        populateMonthDropdownTab(allTrackingRecordsTab);
                        displayTrackingRecordsTab(allTrackingRecordsTab);
                    }
                } catch (error) {
                    console.error('Error loading tracking records:', error);
                }
            }
            
            // Populate month dropdown for tab
            function populateMonthDropdownTab(records) {
                const monthFilter = document.getElementById('trackingMonthFilterTab');
                const months = new Set();
                
                records.forEach(record => {
                    if (record.created_at) {
                        const date = new Date(record.created_at);
                        const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                        months.add(monthYear);
                    }
                });
                
                monthFilter.innerHTML = '<option value="">All Months</option>';
                Array.from(months).sort().reverse().forEach(month => {
                    monthFilter.innerHTML += '<option value="' + month + '">' + month + '</option>';
                });
            }
            
            // Display tracking records in tab
            async function displayTrackingRecordsTab(records) {
                const tbody = document.getElementById('trackingReportBodyTab');
                
                if (records.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #9ca3af;">No tracking records found</td></tr>';
                    return;
                }
                
                // Fetch weights for all records
                const recordsWithWeights = await Promise.all(records.map(async (record) => {
                    let totalWeight = 0;
                    
                    try {
                        // Fetch sale items for this order
                        const response = await axios.get('/api/sales/' + record.order_id + '/items');
                        if (response.data.success && response.data.data) {
                            const items = response.data.data;
                            
                            // Calculate total weight from product catalog
                            totalWeight = items.reduce((sum, item) => {
                                let itemWeight = 0;
                                
                                // Search for product in catalog
                                for (const category in productCatalog) {
                                    const product = productCatalog[category].find(p => 
                                        p.name === item.product_name
                                    );
                                    if (product) {
                                        itemWeight = product.weight * item.quantity;
                                        break;
                                    }
                                }
                                
                                return sum + itemWeight;
                            }, 0);
                        }
                    } catch (error) {
                        console.error('Error fetching weight for order:', record.order_id, error);
                    }
                    
                    return { ...record, totalWeight };
                }));
                
                tbody.innerHTML = recordsWithWeights.map(record => {
                    const actualPrice = record.courier_cost || record.total_amount || 0;
                    const weight = record.totalWeight ? record.totalWeight.toFixed(2) : '0.00';
                    
                    return '<tr style="border-bottom: 1px solid #e5e7eb;">' +
                        '<td style="padding: 12px; font-weight: 600; color: #1f2937;">' + record.order_id + '</td>' +
                        '<td style="padding: 12px; color: #4b5563;">' + record.courier_partner + '</td>' +
                        '<td style="padding: 12px; color: #4b5563;">' + record.courier_mode + '</td>' +
                        '<td style="padding: 12px; font-family: monospace; color: #7c3aed; font-weight: 600;">' + record.tracking_id + '</td>' +
                        '<td style="padding: 12px; text-align: right; font-weight: 600; color: #f59e0b;">' + weight + ' Kg</td>' +
                        '<td style="padding: 12px; text-align: right; font-weight: 600; color: #059669;">₹' + actualPrice.toLocaleString() + '</td>' +
                        '<td style="padding: 12px; text-align: center;"><button onclick="deleteTrackingRecordTab(' + record.id + ')" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.2s;" onmouseover="this.style.background=&#39;#dc2626&#39;" onmouseout="this.style.background=&#39;#ef4444&#39;"><i class="fas fa-trash"></i></button></td>' +
                    '</tr>';
                }).join('');
            }
            
            // Filter tracking report in tab
            function filterTrackingReportTab() {
                const searchTerm = document.getElementById('trackingReportSearchTab').value.toLowerCase();
                const selectedMonth = document.getElementById('trackingMonthFilterTab').value;
                
                let filtered = allTrackingRecordsTab;
                
                if (searchTerm) {
                    filtered = filtered.filter(record =>
                        record.order_id.toLowerCase().includes(searchTerm) ||
                        record.courier_partner.toLowerCase().includes(searchTerm) ||
                        record.tracking_id.toLowerCase().includes(searchTerm)
                    );
                }
                
                if (selectedMonth) {
                    filtered = filtered.filter(record => {
                        if (!record.created_at) return false;
                        const date = new Date(record.created_at);
                        const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                        return monthYear === selectedMonth;
                    });
                }
                
                displayTrackingRecordsTab(filtered);
            }
            
            // Delete tracking record from tab
            async function deleteTrackingRecordTab(id) {
                if (!confirm('Are you sure you want to delete this tracking record?')) {
                    return;
                }
                
                try {
                    const response = await axios.delete('/api/tracking-details/' + id);
                    if (response.data.success) {
                        showTrackingStatusTab('✅ Tracking record deleted successfully!', 'success');
                        await loadTrackingRecordsTab();
                    } else {
                        showTrackingStatusTab('❌ ' + response.data.error, 'error');
                    }
                } catch (error) {
                    console.error('Error deleting tracking:', error);
                    showTrackingStatusTab('❌ Error: ' + (error.response?.data?.error || error.message), 'error');
                }
            }
            
            // Load grouped dispatches by order
            // Helper function to format date as DD/MM/YYYY
            function formatDispatchDate(dateStr) {
                if (!dateStr) return 'N/A';
                try {
                    const date = new Date(dateStr);
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    return day + '/' + month + '/' + year;
                } catch (e) {
                    return dateStr;
                }
            }
            
            async function loadGroupedDispatches() {
                try {
                    const sortBy = document.getElementById('sortBySelect')?.value || 'date';
                    const sortOrder = document.getElementById('sortOrderSelect')?.value || 'desc';
                    
                    const response = await axios.get(\`/api/inventory/dispatches?sortBy=\${sortBy}&sortOrder=\${sortOrder}\`);
                    const container = document.getElementById('groupedDispatchesContainer');
                    
                    if (!response.data.success || response.data.data.length === 0) {
                        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;"><i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 15px;"></i><p style="font-size: 16px;">No dispatch orders found</p></div>';
                        document.getElementById('totalOrdersCount').textContent = '0';
                        document.getElementById('totalItemsCount').textContent = '0';
                        return;
                    }
                    
                    const dispatches = response.data.data;
                    
                    // Group by serial_number (which represents order batches)
                    const serialNumbers = new Set(dispatches.map(d => d.serial_number).filter(id => id));
                    document.getElementById('totalOrdersCount').textContent = serialNumbers.size;
                    document.getElementById('totalItemsCount').textContent = dispatches.length;
                    
                    // Group dispatches by order_id (so same order shows in one row)
                    const grouped = {};
                    dispatches.forEach(dispatch => {
                        const orderKey = dispatch.order_id || 'N/A';
                        if (!grouped[orderKey]) {
                            grouped[orderKey] = {
                                order_id: dispatch.order_id || 'N/A',
                                dispatch_date: dispatch.dispatch_date,
                                customer_name: dispatch.customer_name,
                                customer_mobile: dispatch.lead_phone || dispatch.customer_mobile,
                                courier_name: dispatch.courier_name,
                                tracking_number: dispatch.tracking_number,
                                tracking_id: dispatch.tracking_id || 'N/A',
                                items: []
                            };
                        }
                        grouped[orderKey].items.push(dispatch);
                    });
                    
                    // Render as expandable table with grouped orders
                    container.innerHTML = \`
                        <div style="overflow-x: auto; max-height: 600px; overflow-y: auto;">
                            <table class="data-table" style="width: 100%;">
                                <thead style="position: sticky; top: 0; z-index: 10; background: #f9fafb;">
                                    <tr>
                                        <th style="position: sticky; left: 0; z-index: 12; background: #f9fafb; width: 60px;">S.No</th>
                                        <th style="background: #f9fafb;">Dispatch Date</th>
                                        <th style="background: #f9fafb;">Customer</th>
                                        <th style="background: #f9fafb;">Mobile</th>
                                        <th style="background: #f9fafb;">Items</th>
                                        <th style="background: #f9fafb;">Order ID</th>
                                        <th style="background: #f9fafb;">Courier</th>
                                        <th style="background: #f9fafb;">Tracking ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${Object.values(grouped).map((order, index) => {
                                        const rowId = 'details_' + index;
                                        return \`
                                            <tr onclick="toggleDispatchDetails('\${rowId}')" style="cursor: pointer; background: white;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                                                <td style="position: sticky; left: 0; background: inherit; font-weight: 600;">
                                                    <i class="fas fa-chevron-down" id="icon_\${rowId}" style="color: #10b981; margin-right: 5px;"></i>
                                                    \${index + 1}
                                                </td>
                                                <td>\${formatDispatchDate(order.dispatch_date)}</td>
                                                <td>\${order.customer_name || 'N/A'}</td>
                                                <td>\${order.customer_mobile || '-'}</td>
                                                <td style="font-weight: 600; color: #10b981;">\${order.items.length} Item(s)</td>
                                                <td style="font-weight: 600;">\${order.order_id}</td>
                                                <td>\${order.courier_name || '-'}\${order.tracking_number && order.tracking_number !== '-' ? '<br><small style="color: #6b7280;">' + order.tracking_number + '</small>' : ''}</td>
                                                <td style="font-family: monospace; color: #6b7280;">\${order.tracking_id || 'N/A'}</td>
                                            </tr>
                                            <tr id="\${rowId}" style="display: none;">
                                                <td colspan="8" style="padding: 0; background: #f9fafb;">
                                                    <div style="padding: 15px 20px; margin: 0;">
                                                        <h4 style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px;">
                                                            <i class="fas fa-box"></i> Dispatched Items (\${order.items.length})
                                                        </h4>
                                                        <table style="width: 100%; border-collapse: collapse;">
                                                            <thead>
                                                                <tr style="background: #e5e7eb;">
                                                                    <th style="padding: 8px; text-align: left; font-size: 12px; border: 1px solid #d1d5db;">Serial No</th>
                                                                    <th style="padding: 8px; text-align: left; font-size: 12px; border: 1px solid #d1d5db;">Device Serial Number</th>
                                                                    <th style="padding: 8px; text-align: left; font-size: 12px; border: 1px solid #d1d5db;">Product Name</th>
                                                                    <th style="padding: 8px; text-align: left; font-size: 12px; border: 1px solid #d1d5db;">Dispatch Date</th>
                                                                    <th style="padding: 8px; text-align: left; font-size: 12px; border: 1px solid #d1d5db;">Tracking ID</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                \${order.items.map((item, idx) => \`
                                                                    <tr style="background: white;">
                                                                        <td style="padding: 8px; font-size: 12px; border: 1px solid #d1d5db;">\${idx + 1}</td>
                                                                        <td style="padding: 8px; font-size: 12px; border: 1px solid #d1d5db; font-weight: 600;">\${item.device_serial_no}</td>
                                                                        <td style="padding: 8px; font-size: 12px; border: 1px solid #d1d5db;">\${item.model_name || 'N/A'}</td>
                                                                        <td style="padding: 8px; font-size: 12px; border: 1px solid #d1d5db;">\${formatDispatchDate(item.dispatch_date)}</td>
                                                                        <td style="padding: 8px; font-size: 12px; font-family: monospace; border: 1px solid #d1d5db; color: #6b7280;">\${order.tracking_id || 'N/A'}</td>
                                                                    </tr>
                                                                \`).join('')}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        \`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    \`;
                } catch (error) {
                    console.error('Error loading grouped dispatches:', error);
                    document.getElementById('groupedDispatchesContainer').innerHTML = 
                        '<div style="text-align: center; padding: 40px; color: #ef4444;"><i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i><p style="font-size: 16px;">Error loading dispatch orders</p></div>';
                }
            }
            
            // Toggle dispatch details expansion
            function toggleDispatchDetails(rowId) {
                const detailsRow = document.getElementById(rowId);
                if (detailsRow) {
                    detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
                }
            }
            
            // Search dispatch orders (grouped view)
            async function searchDispatchOrders() {
                try {
                    const orderSearch = document.getElementById('dispatchSearchOrder').value.trim().toLowerCase();
                    const customerSearch = document.getElementById('dispatchSearchCustomer').value.trim().toLowerCase();
                    
                    const sortBy = document.getElementById('sortBySelect')?.value || 'date';
                    const sortOrder = document.getElementById('sortOrderSelect')?.value || 'desc';
                    
                    const response = await axios.get(\`/api/inventory/dispatches?sortBy=\${sortBy}&sortOrder=\${sortOrder}\`);
                    const container = document.getElementById('groupedDispatchesContainer');
                    
                    if (!response.data.success || response.data.data.length === 0) {
                        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;"><i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 15px;"></i><p style="font-size: 16px;">No dispatch orders found</p></div>';
                        return;
                    }
                    
                    const dispatches = response.data.data;
                    
                    // Group dispatches by order_id (same as loadGroupedDispatches)
                    const grouped = {};
                    dispatches.forEach(dispatch => {
                        const orderKey = dispatch.order_id || 'N/A';
                        if (!grouped[orderKey]) {
                            grouped[orderKey] = {
                                order_id: dispatch.order_id || 'N/A',
                                dispatch_date: dispatch.dispatch_date,
                                customer_name: dispatch.customer_name,
                                customer_mobile: dispatch.lead_phone || dispatch.customer_mobile,
                                courier_name: dispatch.courier_name,
                                tracking_number: dispatch.tracking_number,
                                tracking_id: dispatch.tracking_id || 'N/A',
                                items: []
                            };
                        }
                        grouped[orderKey].items.push(dispatch);
                    });
                    
                    // Filter grouped orders
                    let filteredOrders = Object.values(grouped);
                    
                    if (orderSearch) {
                        filteredOrders = filteredOrders.filter(order => 
                            order.order_id && order.order_id.toString().toLowerCase().includes(orderSearch)
                        );
                    }
                    
                    if (customerSearch) {
                        filteredOrders = filteredOrders.filter(order => 
                            (order.customer_name && order.customer_name.toLowerCase().includes(customerSearch)) ||
                            (order.customer_mobile && order.customer_mobile.toLowerCase().includes(customerSearch))
                        );
                    }
                    
                    if (filteredOrders.length === 0) {
                        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;"><i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px;"></i><p style="font-size: 16px;">No orders match your search</p></div>';
                        document.getElementById('totalOrdersCount').textContent = '0';
                        document.getElementById('totalItemsCount').textContent = '0';
                        return;
                    }
                    
                    // Update totals with filtered results
                    const serialNumbers = new Set();
                    filteredOrders.forEach(order => {
                        order.items.forEach(item => {
                            if (item.serial_number) serialNumbers.add(item.serial_number);
                        });
                    });
                    const totalItems = filteredOrders.reduce((sum, order) => sum + order.items.length, 0);
                    document.getElementById('totalOrdersCount').textContent = serialNumbers.size || filteredOrders.length;
                    document.getElementById('totalItemsCount').textContent = totalItems;
                    
                    // Render filtered orders in same format as loadGroupedDispatches
                    container.innerHTML = \`
                        <div style="overflow-x: auto; max-height: 600px; overflow-y: auto;">
                            <table class="data-table" style="width: 100%;">
                                <thead style="position: sticky; top: 0; z-index: 10; background: #f9fafb;">
                                    <tr>
                                        <th style="position: sticky; left: 0; z-index: 12; background: #f9fafb; width: 60px;">S.No</th>
                                        <th style="background: #f9fafb;">Dispatch Date</th>
                                        <th style="background: #f9fafb;">Customer</th>
                                        <th style="background: #f9fafb;">Mobile</th>
                                        <th style="background: #f9fafb;">Items</th>
                                        <th style="background: #f9fafb;">Order ID</th>
                                        <th style="background: #f9fafb;">Courier</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${filteredOrders.map((order, index) => {
                                        const rowId = 'search_' + index;
                                        return \`
                                            <tr onclick="toggleDispatchDetails('\${rowId}')" style="cursor: pointer; background: white;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                                                <td style="position: sticky; left: 0; background: inherit; font-weight: 600;">
                                                    <i class="fas fa-chevron-down" id="icon_\${rowId}" style="color: #10b981; margin-right: 5px;"></i>
                                                    \${index + 1}
                                                </td>
                                                <td>\${formatDispatchDate(order.dispatch_date)}</td>
                                                <td>\${order.customer_name || 'N/A'}</td>
                                                <td>\${order.customer_mobile || '-'}</td>
                                                <td style="font-weight: 600; color: #10b981;">\${order.items.length} Item(s)</td>
                                                <td style="font-weight: 600;">\${order.order_id}</td>
                                                <td>\${order.courier_name || '-'}\${order.tracking_number && order.tracking_number !== '-' ? '<br><small style="color: #6b7280;">' + order.tracking_number + '</small>' : ''}</td>
                                                <td style="font-family: monospace; color: #6b7280;">\${order.tracking_id || 'N/A'}</td>
                                            </tr>
                                            <tr id="\${rowId}" style="display: none;">
                                                <td colspan="8" style="padding: 0; background: #f9fafb;">
                                                    <div style="padding: 15px 20px; margin: 0;">
                                                        <h4 style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px;">
                                                            <i class="fas fa-box"></i> Dispatched Items (\${order.items.length})
                                                        </h4>
                                                        <table style="width: 100%; border-collapse: collapse;">
                                                            <thead>
                                                                <tr style="background: #e5e7eb;">
                                                                    <th style="padding: 8px; text-align: left; font-size: 12px; border: 1px solid #d1d5db;">Serial No</th>
                                                                    <th style="padding: 8px; text-align: left; font-size: 12px; border: 1px solid #d1d5db;">Device Serial Number</th>
                                                                    <th style="padding: 8px; text-align: left; font-size: 12px; border: 1px solid #d1d5db;">Product Name</th>
                                                                    <th style="padding: 8px; text-align: left; font-size: 12px; border: 1px solid #d1d5db;">Dispatch Date</th>
                                                                    <th style="padding: 8px; text-align: left; font-size: 12px; border: 1px solid #d1d5db;">Tracking ID</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                \${order.items.map((item, idx) => \`
                                                                    <tr style="background: white;">
                                                                        <td style="padding: 8px; font-size: 12px; border: 1px solid #d1d5db;">\${idx + 1}</td>
                                                                        <td style="padding: 8px; font-size: 12px; border: 1px solid #d1d5db; font-weight: 600;">\${item.device_serial_no}</td>
                                                                        <td style="padding: 8px; font-size: 12px; border: 1px solid #d1d5db;">\${item.model_name || 'N/A'}</td>
                                                                        <td style="padding: 8px; font-size: 12px; border: 1px solid #d1d5db;">\${formatDispatchDate(item.dispatch_date)}</td>
                                                                        <td style="padding: 8px; font-size: 12px; font-family: monospace; border: 1px solid #d1d5db; color: #6b7280;">\${order.tracking_id || 'N/A'}</td>
                                                                    </tr>
                                                                \`).join('')}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        \`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    \`;
                } catch (error) {
                    console.error('Error searching dispatch orders:', error);
                    document.getElementById('groupedDispatchesContainer').innerHTML = 
                        '<div style="text-align: center; padding: 40px; color: #ef4444;"><i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i><p style="font-size: 16px;">Error searching dispatch orders</p></div>';
                }
            }
            
            // Legacy function for backward compatibility
            async function searchDispatchRecords() {
                await searchDispatchOrders();
            }
            
            // Clear dispatch search
            function clearDispatchSearch() {
                document.getElementById('dispatchSearchOrder').value = '';
                document.getElementById('dispatchSearchCustomer').value = '';
                loadRecentDispatches();
            }
            
            // Upload dispatch Excel
            async function uploadDispatchExcel(event) {
                event.preventDefault();
                
                const form = event.target;
                const fileInput = form.querySelector('input[type="file"]');
                const statusDiv = document.getElementById('dispatchUploadStatus');
                const submitBtn = form.querySelector('button[type="submit"]');
                
                if (!fileInput.files[0]) {
                    alert('Please select a file');
                    return;
                }
                
                statusDiv.style.display = 'block';
                statusDiv.className = '';
                statusDiv.textContent = 'Reading file...';
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                
                try {
                    const file = fileInput.files[0];
                    const reader = new FileReader();
                    
                    reader.onload = async function(e) {
                        try {
                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                            
                            if (jsonData.length === 0) {
                                throw new Error('Excel file is empty');
                            }
                            
                            statusDiv.textContent = 'Uploading ' + jsonData.length + ' dispatch records...';
                            
                            const response = await axios.post('/api/inventory/upload-dispatch', { items: jsonData });
                            
                            if (response.data.success) {
                                statusDiv.className = 'alert-success';
                                let message = response.data.message;
                                if (response.data.notFoundDevices && response.data.notFoundDevices.length) {
                                    message += '\\n\\nDevices not found (first 10): ' + response.data.notFoundDevices.join(', ');
                                }
                                statusDiv.textContent = message;
                                form.reset();
                                loadRecentDispatches();
                                loadInventory(); // Refresh inventory to show updated statuses
                            } else {
                                throw new Error(response.data.error || 'Upload failed');
                            }
                        } catch (error) {
                            statusDiv.className = 'alert-error';
                            statusDiv.textContent = 'Error: ' + (error.response?.data?.error || error.message || 'Upload failed');
                        } finally {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Dispatch Data';
                        }
                    };
                    
                    reader.readAsArrayBuffer(file);
                } catch (error) {
                    statusDiv.className = 'alert-error';
                    statusDiv.textContent = 'Error: ' + error.message;
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Dispatch Data';
                }
            }
            
            // QC - lookup serial number
            document.getElementById('qcSerialNo')?.addEventListener('change', async function() {
                const serialNo = this.value.trim();
                if (!serialNo) return;
                
                try {
                    const response = await axios.get('/api/inventory/' + encodeURIComponent(serialNo));
                    if (response.data.success) {
                        document.getElementById('qcModel').value = response.data.data.model_name;
                    }
                } catch (error) {
                    alert('Device not found: ' + serialNo);
                    this.value = '';
                    document.getElementById('qcModel').value = '';
                }
            });
            
            // Submit QC
            async function submitQC(event) {
                event.preventDefault();
                
                const form = event.target;
                const data = {
                    device_serial_no: document.getElementById('qcSerialNo').value,
                    check_date: document.getElementById('qcCheckDate').value,
                    checked_by: document.getElementById('qcCheckedBy').value,
                    test_results: document.getElementById('qcTestResults').value,
                    pass_fail: document.getElementById('qcPassFail').value,
                    notes: document.getElementById('qcNotes').value
                };
                
                try {
                    const response = await axios.post('/api/inventory/quality-check', data);
                    
                    if (response.data.success) {
                        alert('Quality check submitted successfully!');
                        form.reset();
                        document.getElementById('qcSerialNo').focus();
                        loadRecentQC();
                    }
                } catch (error) {
                    alert('Error: ' + (error.response?.data?.error || error.message));
                }
            }
            
            // Load recent QC records
            async function loadRecentQC() {
                try {
                    const response = await axios.get('/api/inventory/quality-checks');
                    const tbody = document.getElementById('recentQCBody');
                    
                    if (!response.data.success || response.data.data.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #9ca3af;">No QC records</td></tr>';
                        return;
                    }
                    
                    // Helper function to format date as DD-MMM-YY
                    const formatQCDate = (dateStr) => {
                        if (!dateStr || dateStr === '-') return '-';
                        const date = new Date(dateStr);
                        if (isNaN(date.getTime())) return dateStr;
                        
                        const day = String(date.getDate()).padStart(2, '0');
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const month = monthNames[date.getMonth()];
                        const year = String(date.getFullYear()).slice(-2);
                        
                        return \`\${day}-\${month}-\${year}\`;
                    };
                    
                    tbody.innerHTML = response.data.data.map(item => {
                        const resultColor = item.pass_fail === 'Pass' ? '#10b981' : '#ef4444';
                        return \`
                            <tr>
                                <td>\${item.serial_number || item.id}</td>
                                <td><strong>\${item.device_serial_no}</strong></td>
                                <td>\${formatQCDate(item.check_date)}</td>
                                <td><span style="color: \${resultColor}; font-weight: 600;">\${item.pass_fail}</span></td>
                                <td>\${item.checked_by}</td>
                            </tr>
                        \`;
                    }).join('');
                } catch (error) {
                    console.error('Error loading QC records:', error);
                }
            }
            
            // Toggle category models visibility
            function toggleCategoryModels(category) {
                // Create safe class name by removing all special characters
                const categoryClass = category.replace(/[^a-zA-Z0-9]/g, '-');
                const modelRows = document.querySelectorAll('.model-' + categoryClass);
                const icon = document.getElementById('icon-' + categoryClass);
                
                if (modelRows.length === 0) {
                    console.log('No model rows found for category:', category, 'class:', categoryClass);
                    return;
                }
                
                modelRows.forEach(row => {
                    if (row.style.display === 'none' || row.style.display === '') {
                        row.style.display = 'table-row';
                        if (icon) icon.style.transform = 'rotate(90deg)';
                    } else {
                        row.style.display = 'none';
                        if (icon) icon.style.transform = 'rotate(0deg)';
                    }
                });
            }
            
            // Load inventory reports
            async function loadInventoryReports() {
                try {
                    // Load stats
                    const statsResponse = await axios.get('/api/inventory/stats');
                    if (statsResponse.data.success) {
                        const stats = statsResponse.data.data;
                        document.getElementById('statTotal').textContent = stats.total;
                        
                        const statusCounts = {};
                        stats.byStatus.forEach(s => {
                            statusCounts[s.status] = s.count;
                        });
                        
                        document.getElementById('statInStock').textContent = statusCounts['In Stock'] || 0;
                        document.getElementById('statDispatched').textContent = statusCounts['Dispatched'] || 0;
                        
                        // Fetch QC data from quality_check table
                        const qcResponse = await axios.get('/api/quality-check/stats');
                        if (qcResponse.data.success) {
                            document.getElementById('statQCPass').textContent = qcResponse.data.qc_pass || 0;
                            document.getElementById('statQCFail').textContent = qcResponse.data.qc_fail || 0;
                        } else {
                            document.getElementById('statQCPass').textContent = 0;
                            document.getElementById('statQCFail').textContent = 0;
                        }
                        
                        // Draw chart
                        const ctx = document.getElementById('inventoryChart');
                        if (inventoryChart) {
                            inventoryChart.destroy();
                        }
                        
                        // Match colors with stat cards: In Stock (green), Dispatched (blue), Quality Check (orange), Defective (red)
                        const colorMap = {
                            'In Stock': '#10b981',
                            'Dispatched': '#3b82f6',
                            'Quality Check': '#f59e0b',
                            'Defective': '#ef4444'
                        };
                        
                        const chartColors = stats.byStatus.map(s => colorMap[s.status] || '#6b7280');
                        
                        inventoryChart = new Chart(ctx, {
                            type: 'doughnut',
                            data: {
                                labels: stats.byStatus.map(s => s.status),
                                datasets: [{
                                    data: stats.byStatus.map(s => s.count),
                                    backgroundColor: chartColors,
                                    borderWidth: 3,
                                    borderColor: 'white'
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        position: 'bottom',
                                        labels: {
                                            padding: 15,
                                            font: {
                                                size: 13,
                                                weight: '600'
                                            }
                                        }
                                    },
                                    tooltip: {
                                        callbacks: {
                                            label: function(context) {
                                                const label = context.label || '';
                                                const value = context.parsed || 0;
                                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                                const percentage = ((value / total) * 100).toFixed(1);
                                                return label + ': ' + value + ' (' + percentage + '%)';
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    }
                    
                    // Load model-wise report (category-based with expandable rows)
                    const modelResponse = await axios.get('/api/inventory/model-wise');
                    if (modelResponse.data.success) {
                        const tbody = document.getElementById('modelWiseTableBody');
                        const categoryData = modelResponse.data.data;
                        
                        if (categoryData.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #9ca3af;">No inventory data available</td></tr>';
                        } else {
                            let html = '';
                            let sno = 1;
                            
                            // Sort categories in ascending order by category name (case-insensitive)
                            categoryData.sort((a, b) => a.category.toLowerCase().localeCompare(b.category.toLowerCase()));
                            
                            categoryData.forEach(category => {
                                // Sort models by in_stock ascending (lowest first), then by name if stock is equal
                                category.models.sort((a, b) => {
                                    if (a.in_stock !== b.in_stock) {
                                        return a.in_stock - b.in_stock; // Lowest stock first
                                    }
                                    return a.model_name.toLowerCase().localeCompare(b.model_name.toLowerCase()); // Then alphabetically
                                });
                                
                                // Create safe class name by removing all special characters
                                const safeCategoryClass = category.category.replace(/[^a-zA-Z0-9]/g, '-');
                                const escapedCategory = category.category.replace(/'/g, "\\'");
                                
                                // Check if category has low inventory (threshold: 15)
                                const categoryLowStock = category.in_stock < 15;
                                const categoryStockStyle = categoryLowStock 
                                    ? 'background: #fee2e2; padding: 15px 12px; color: #dc2626; font-weight: 700;' 
                                    : 'background: #ecfdf5; padding: 15px 12px; color: #047857;';
                                
                                // Category row (clickable to expand/collapse)
                                html += \`
                                    <tr onclick="toggleCategoryModels('\${escapedCategory}')" 
                                        style="cursor: pointer; background: #f3f4f6; font-weight: 700; font-size: 14px;"
                                        class="category-row">
                                        <td style="padding: 15px 12px;">
                                            <i class="fas fa-chevron-right" id="icon-\${safeCategoryClass}" 
                                               style="margin-right: 8px; transition: transform 0.3s;"></i>
                                            <span style="color: #1f2937;">\${sno++}</span>
                                        </td>
                                        <td style="padding: 15px 12px; color: #374151; background: #f5f3ff;">
                                            <i class="fas fa-box" style="margin-right: 8px; color: #667eea;"></i>
                                            \${category.category}
                                        </td>
                                        <td style="\${categoryStockStyle}">
                                            \${category.in_stock || 0}
                                            \${categoryLowStock ? '<span style="margin-left: 5px; font-size: 11px;">⚠️ LOW</span>' : ''}
                                        </td>
                                        <td style="background: #eff6ff; padding: 15px 12px; color: #1d4ed8;">\${category.dispatched || 0}</td>
                                        <td style="background: #ecfdf5; padding: 15px 12px; color: #047857;">\${category.qc_pass || 0}</td>
                                        <td style="background: #fef2f2; padding: 15px 12px; color: #dc2626;">\${category.qc_fail || 0}</td>
                                        <td style="background: #fef3c7; padding: 15px 12px; color: #92400e;">\${category.qc_pending || 0}</td>
                                        <td style="padding: 15px 12px; font-size: 16px; color: #1f2937;">\${category.total}</td>
                                    </tr>
                                \`;
                                
                                // Model rows (hidden by default)
                                category.models.forEach((model, modelIndex) => {
                                    // Check if model has low inventory (threshold: 15)
                                    const modelLowStock = model.in_stock < 15;
                                    const modelStockStyle = modelLowStock 
                                        ? 'background: #fee2e2; padding: 10px 12px; font-weight: 700; color: #dc2626; font-size: 13px;' 
                                        : 'background: #f0fdf4; padding: 10px 12px; font-weight: 600; color: #15803d; font-size: 13px;';
                                    
                                    html += \`
                                        <tr class="model-row model-\${safeCategoryClass}" 
                                            style="display: none; background: #fefefe; border-left: 4px solid #667eea;">
                                            <td style="padding: 10px 12px 10px 40px; color: #9ca3af; font-size: 12px;"></td>
                                            <td style="padding: 10px 12px; font-size: 13px; color: #6b7280; background: #faf5ff;">
                                                <i class="fas fa-minus" style="margin-right: 8px; font-size: 8px; color: #d1d5db;"></i>
                                                \${model.model_name}
                                            </td>
                                            <td style="\${modelStockStyle}">
                                                \${model.in_stock || 0}
                                                \${modelLowStock ? '<span style="margin-left: 5px; font-size: 10px;">⚠️ LOW STOCK</span>' : ''}
                                            </td>
                                            <td style="background: #f0f9ff; padding: 10px 12px; font-weight: 600; color: #0369a1; font-size: 13px;">\${model.dispatched || 0}</td>
                                            <td style="background: #f0fdf4; padding: 10px 12px; font-weight: 600; color: #15803d; font-size: 13px;">\${model.qc_pass || 0}</td>
                                            <td style="background: #fef8f8; padding: 10px 12px; font-weight: 600; color: #dc2626; font-size: 13px;">\${model.qc_fail || 0}</td>
                                            <td style="background: #fffbeb; padding: 10px 12px; font-weight: 600; color: #d97706; font-size: 13px;">\${model.qc_pending || 0}</td>
                                            <td style="padding: 10px 12px; font-weight: 600; font-size: 14px; color: #374151;">\${model.total}</td>
                                        </tr>
                                    \`;
                                });
                            });
                            
                            tbody.innerHTML = html;
                        }
                    }
                    
                    // Load dispatch summary
                    const dispatchResponse = await axios.get('/api/dispatch/summary');
                    if (dispatchResponse.data.success) {
                        const dispatchData = dispatchResponse.data.data;
                        const tbody = document.getElementById('dispatchSummaryTableBody');
                        
                        // Update dispatch stats cards
                        const completedCount = dispatchData.completedOrders || 0;
                        const pendingCount = dispatchData.pendingOrders || 0;
                        
                        document.getElementById('statTotalOrders').textContent = dispatchData.totalOrders || 0;
                        document.getElementById('statTotalDispatched').textContent = dispatchData.totalDispatched || 0;
                        document.getElementById('statCompletedOrders').textContent = completedCount;
                        document.getElementById('statPendingOrders').textContent = pendingCount;
                        
                        // Draw dispatch pie chart (if canvas exists)
                        const dispatchCtx = document.getElementById('dispatchChart');
                        if (dispatchCtx) {
                            if (dispatchChart) {
                                dispatchChart.destroy();
                            }
                            
                            dispatchChart = new Chart(dispatchCtx, {
                                type: 'pie',
                                data: {
                                    labels: ['Completed Dispatch', 'Pending Dispatch'],
                                    datasets: [{
                                        data: [completedCount, pendingCount],
                                        backgroundColor: ['#10b981', '#f59e0b'],
                                        borderWidth: 3,
                                        borderColor: 'white'
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: {
                                            position: 'bottom',
                                            labels: {
                                                padding: 12,
                                                font: {
                                                    size: 13,
                                                    weight: '600'
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
                                                    return label + ': ' + value + ' (' + percentage + '%)';
                                                }
                                            }
                                        }
                                    }
                                }
                            });
                        }
                        
                        const orders = dispatchData.orders || [];
                        if (orders.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #9ca3af;">No dispatch records found</td></tr>';
                        } else {
                            tbody.innerHTML = orders.map(order => {
                                const remaining = order.total_items - order.dispatched_items;
                                const statusColor = order.dispatch_status === 'Completed' ? '#10b981' : '#f59e0b';
                                const statusBg = order.dispatch_status === 'Completed' ? '#d1fae5' : '#fef3c7';
                                
                                return \`
                                    <tr>
                                        <td>
                                            <a href="javascript:void(0)" onclick="viewOrderDetailsFromDispatch('\${order.order_id}')" 
                                               style="font-weight: 600; color: #667eea; text-decoration: none; cursor: pointer;">
                                                \${order.order_id}
                                            </a>
                                        </td>
                                        <td>\${order.customer_name || 'N/A'}</td>
                                        <td>\${new Date(order.order_date).toLocaleDateString('en-IN')}</td>
                                        <td style="font-weight: 700; font-size: 15px;">\${order.total_items}</td>
                                        <td style="font-weight: 700; color: #3b82f6;">\${order.dispatched_items}</td>
                                        <td style="font-weight: 700; color: \${remaining === 0 ? '#10b981' : '#ef4444'};">\${remaining}</td>
                                        <td>
                                            <span style="background: \${statusBg}; color: \${statusColor}; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 13px;">
                                                \${order.dispatch_status}
                                            </span>
                                        </td>
                                        <td style="color: #6b7280;">\${order.last_dispatch_date ? new Date(order.last_dispatch_date).toLocaleDateString('en-IN') : '-'}</td>
                                    </tr>
                                \`;
                            }).join('');
                        }
                    }
                    
                    // Load activity
                    const activityResponse = await axios.get('/api/inventory/activity');
                    if (activityResponse.data.success) {
                        const tbody = document.getElementById('activityTableBody');
                        const activities = activityResponse.data.data;
                        
                        if (activities.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #9ca3af;">No activity yet</td></tr>';
                        } else {
                            tbody.innerHTML = activities.map(a => \`
                                <tr>
                                    <td>\${new Date(a.changed_at).toLocaleString()}</td>
                                    <td><strong>\${a.device_serial_no}</strong></td>
                                    <td>\${a.old_status}</td>
                                    <td>\${a.new_status}</td>
                                    <td>\${a.changed_by}</td>
                                    <td>\${a.change_reason}</td>
                                </tr>
                            \`).join('');
                        }
                    }
                } catch (error) {
                    console.error('Error loading inventory reports:', error);
                }
            }
            
            // View Order Details from Dispatch Summary
            async function viewOrderDetailsFromDispatch(orderId) {
                try {
                    // Show modal with loading state
                    document.getElementById('orderDetailsModal').classList.add('show');
                    document.getElementById('orderDetailsContent').innerHTML = '<div class="loading">Loading order details...</div>';
                    
                    // Fetch sale details
                    const response = await axios.get('/api/sales/' + orderId);
                    if (!response.data.success) {
                        document.getElementById('orderDetailsContent').innerHTML = '<div style="color: #ef4444;">Error loading order details</div>';
                        return;
                    }
                    
                    const sale = response.data.data;
                    
                    // Create detailed view with split layout
                    const modalHTML = \`
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <!-- Left Panel: Customer Details -->
                            <div style="background: #f9fafb; padding: 20px; border-radius: 10px; border: 2px solid #e5e7eb;">
                                <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 15px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
                                    <i class="fas fa-user"></i> Customer Information
                                </h3>
                                <div style="display: grid; gap: 12px;">
                                    <div>
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Customer Name</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${sale.customer_name || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Company Name</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${sale.company_name || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Customer Code</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${sale.customer_code || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Contact Number</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${sale.customer_contact || 'N/A'}</div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Right Panel: Sale Details -->
                            <div style="background: #f0f9ff; padding: 20px; border-radius: 10px; border: 2px solid #bfdbfe;">
                                <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 15px; color: #1f2937; border-bottom: 2px solid #bfdbfe; padding-bottom: 10px;">
                                    <i class="fas fa-file-invoice"></i> Sale Information
                                </h3>
                                <div style="display: grid; gap: 12px;">
                                    <div>
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Order ID</div>
                                        <div style="font-weight: 700; color: #667eea; font-size: 16px;">\${sale.order_id}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Sale Date</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${new Date(sale.sale_date).toLocaleDateString('en-IN')}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Employee</div>
                                        <div style="font-weight: 600; color: #1f2937;">\${sale.employee_name}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Sale Type</div>
                                        <div>
                                            <span style="background: \${sale.sale_type === 'With' ? '#d1fae5' : '#fef3c7'}; color: \${sale.sale_type === 'With' ? '#065f46' : '#92400e'}; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 12px;">
                                                \${sale.sale_type === 'With' ? 'With GST' : 'Without GST'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Products Section -->
                        <div style="margin-top: 20px; background: white; padding: 20px; border-radius: 10px; border: 2px solid #e5e7eb;">
                            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 15px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
                                <i class="fas fa-boxes"></i> Products Ordered
                            </h3>
                            <div id="orderProducts" style="display: flex; flex-direction: column; gap: 10px;">
                                <div class="loading">Loading products...</div>
                            </div>
                        </div>
                        
                        <!-- Payment Details -->
                        <div style="margin-top: 20px; background: #fef3c7; padding: 20px; border-radius: 10px; border: 2px solid #fbbf24;">
                            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 15px; color: #1f2937; border-bottom: 2px solid #fbbf24; padding-bottom: 10px;">
                                <i class="fas fa-money-bill-wave"></i> Payment Summary
                            </h3>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div>
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Subtotal</div>
                                    <div style="font-weight: 700; font-size: 18px; color: #1f2937;">₹\${parseFloat(sale.subtotal || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Courier Cost</div>
                                    <div style="font-weight: 700; font-size: 18px; color: #1f2937;">₹\${parseFloat(sale.courier_cost || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">GST (18%)</div>
                                    <div style="font-weight: 700; font-size: 18px; color: #1f2937;">₹\${parseFloat(sale.gst_amount || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Total Amount</div>
                                    <div style="font-weight: 700; font-size: 20px; color: #667eea;">₹\${parseFloat(sale.total_amount || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Amount Received</div>
                                    <div style="font-weight: 700; font-size: 18px; color: #10b981;">₹\${parseFloat(sale.amount_received || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Balance Amount</div>
                                    <div style="font-weight: 700; font-size: 18px; color: \${parseFloat(sale.balance_amount) > 0 ? '#ef4444' : '#10b981'};">
                                        ₹\${parseFloat(sale.balance_amount || 0).toFixed(2)}
                                    </div>
                                </div>
                            </div>
                            \${sale.remarks ? \`
                                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #fbbf24;">
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Remarks</div>
                                    <div style="color: #1f2937;">\${sale.remarks}</div>
                                </div>
                            \` : ''}
                        </div>
                    \`;
                    
                    document.getElementById('orderDetailsContent').innerHTML = modalHTML;
                    
                    // Load products
                    const itemsResponse = await axios.get('/api/sales/' + orderId + '/items');
                    if (itemsResponse.data.success) {
                        const items = itemsResponse.data.data;
                        const productsHTML = items.map((item, index) => \`
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">\${index + 1}. \${item.product_name}</div>
                                    <div style="font-size: 12px; color: #6b7280;">
                                        Quantity: <span style="font-weight: 600; color: #3b82f6;">\${item.quantity}</span> × 
                                        ₹\${parseFloat(item.unit_price).toFixed(2)}
                                    </div>
                                </div>
                                <div style="font-weight: 700; font-size: 16px; color: #667eea;">
                                    ₹\${(item.quantity * item.unit_price).toFixed(2)}
                                </div>
                            </div>
                        \`).join('');
                        
                        document.getElementById('orderProducts').innerHTML = productsHTML || '<div style="color: #9ca3af;">No products found</div>';
                    }
                } catch (error) {
                    console.error('Error loading order details:', error);
                    document.getElementById('orderDetailsContent').innerHTML = \`
                        <div style="color: #ef4444; padding: 20px; text-align: center;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 10px;"></i>
                            <div style="font-weight: 600; margin-bottom: 5px;">Error Loading Order Details</div>
                            <div style="font-size: 14px;">\${error.message}</div>
                        </div>
                    \`;
                }
            }
            
            // ===================================================================
            // ORDER-BASED DISPATCH WORKFLOW FUNCTIONS
            // ===================================================================
            
            let selectedOrder = null;
            let scannedDevices = [];
            let allOrders = [];
            
            // Open Create Dispatch Modal
            async function openCreateDispatchModal() {
                document.getElementById('createDispatchModal').classList.add('show');
                document.getElementById('dispatchStep1').style.display = 'block';
                document.getElementById('dispatchStep2').style.display = 'none';
                document.getElementById('orderSearchInput').value = '';
                document.getElementById('orderSearchInput').focus();
                
                // Load orders
                try {
                    const response = await axios.get('/api/orders');
                    if (response.data.success) {
                        allOrders = response.data.data;
                        searchOrders(); // Show all orders initially
                    }
                } catch (error) {
                    console.error('Error loading orders:', error);
                }
            }
            
            // Close Modal
            function closeCreateDispatchModal() {
                document.getElementById('createDispatchModal').classList.remove('show');
                selectedOrder = null;
                scannedDevices = [];
            }
            
            // Toggle dropdown menu
            function toggleCreateDropdown() {
                const dropdown = document.getElementById('createDropdownMenu');
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            }
            
            // Toggle QC Actions Dropdown
            function toggleQCActionsDropdown() {
                const dropdown = document.getElementById('qcActionsDropdownMenu');
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            }
            
            // Close dropdowns when clicking outside
            document.addEventListener('click', function(event) {
                // Close Create Dispatch dropdown
                const dropdownContainer = document.querySelector('.dropdown-container');
                const dropdown = document.getElementById('createDropdownMenu');
                if (dropdown && dropdownContainer && !dropdownContainer.contains(event.target)) {
                    dropdown.style.display = 'none';
                }
                
                // Close QC Actions dropdown
                const qcDropdown = document.getElementById('qcActionsDropdownMenu');
                if (qcDropdown && !event.target.closest('#qcActionsDropdownMenu') && !event.target.closest('button[onclick*="toggleQCActionsDropdown"]')) {
                    qcDropdown.style.display = 'none';
                }
            });
            
            // Open Replacement Modal
            function openReplacementModal() {
                document.getElementById('replacementModal').classList.add('show');
                // Reset form
                document.getElementById('oldDeviceSerialNo').value = '';
                document.getElementById('newDeviceSerialNo').value = '';
                document.getElementById('replacementReason').value = '';
                document.getElementById('oldDeviceDetails').style.display = 'none';
            }
            
            // Close Replacement Modal
            function closeReplacementModal() {
                document.getElementById('replacementModal').classList.remove('show');
            }
            
            // Fetch old device details when user enters old device serial number
            async function fetchOldDeviceDetails() {
                const serialNo = document.getElementById('oldDeviceSerialNo').value.trim();
                if (!serialNo) return;
                
                try {
                    const response = await axios.get(\`/api/inventory/search?serial=\${serialNo}\`);
                    if (response.data.success && response.data.data.length > 0) {
                        const device = response.data.data[0];
                        
                        // Show details section
                        document.getElementById('oldDeviceDetails').style.display = 'block';
                        
                        // Populate details
                        document.getElementById('replacementOrderId').textContent = device.order_id || '-';
                        document.getElementById('replacementCustomerName').textContent = device.customer_name || '-';
                        document.getElementById('replacementMobile').textContent = device.cust_mobile || '-';
                        document.getElementById('replacementCompany').textContent = device.cust_code || '-';
                    } else {
                        alert('❌ Old device not found. Please check the serial number.');
                        document.getElementById('oldDeviceDetails').style.display = 'none';
                    }
                } catch (error) {
                    console.error('Error fetching device details:', error);
                    alert('Error fetching device details');
                    document.getElementById('oldDeviceDetails').style.display = 'none';
                }
            }
            
            // Submit Replacement
            async function submitReplacement(event) {
                event.preventDefault();
                
                const oldSerialNo = document.getElementById('oldDeviceSerialNo').value.trim();
                const newSerialNo = document.getElementById('newDeviceSerialNo').value.trim();
                const reason = document.getElementById('replacementReason').value.trim();
                
                if (!oldSerialNo || !newSerialNo || !reason) {
                    alert('❌ Please fill in all required fields');
                    return;
                }
                
                if (confirm(\`Are you sure you want to replace device \\n\${oldSerialNo}\\nwith\\n\${newSerialNo}?\`)) {
                    try {
                        const response = await axios.post('/api/inventory/replacement', {
                            old_device_serial_no: oldSerialNo,
                            new_device_serial_no: newSerialNo,
                            replacement_reason: reason,
                            replaced_by: currentUser.employeeName || currentUser.fullName
                        });
                        
                        if (response.data.success) {
                            alert('✅ ' + response.data.message);
                            closeReplacementModal();
                            
                            // Reload dispatch and inventory data
                            if (currentPage === 'inventory-dispatch') {
                                loadDispatchData();
                            } else if (currentPage === 'inventory-stock') {
                                loadInventory();
                            }
                        }
                    } catch (error) {
                        alert('❌ Error: ' + (error.response?.data?.error || error.message));
                    }
                }
            }
            
            // Search Orders
            function searchOrders() {
                const searchTerm = document.getElementById('orderSearchInput').value.toLowerCase();
                const resultsDiv = document.getElementById('orderSearchResults');
                
                // Filter out completed orders and apply search
                const filtered = allOrders.filter(order => {
                    // Hide completed orders
                    if (order.dispatch_status === 'Complete') return false;
                    
                    // Apply search filter
                    return order.order_id.toString().includes(searchTerm) ||
                           (order.customer_name && order.customer_name.toLowerCase().includes(searchTerm)) ||
                           (order.company_name && order.company_name.toLowerCase().includes(searchTerm));
                });
                
                if (filtered.length === 0) {
                    resultsDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #9ca3af;">No pending orders found</div>';
                    return;
                }
                
                resultsDiv.innerHTML = filtered.map(order => {
                    const remainingItems = order.total_items - (order.dispatched_items || 0);
                    const statusColor = order.dispatch_status === 'Partial' ? '#f59e0b' : '#10b981';
                    const statusBg = order.dispatch_status === 'Partial' ? '#fef3c7' : '#d1fae5';
                    
                    return \`
                        <div onclick="selectOrder('\${order.order_id}')" 
                            style="padding: 15px; margin-bottom: 10px; border: 2px solid #e5e7eb; border-radius: 8px; cursor: pointer; transition: all 0.2s;"
                            onmouseover="this.style.borderColor='#10b981'; this.style.background='#f0fdf4';"
                            onmouseout="this.style.borderColor='#e5e7eb'; this.style.background='white';">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: 700; font-size: 16px; color: #1f2937;">
                                        <i class="fas fa-shopping-cart" style="color: #10b981;"></i> Order #\${order.order_id}
                                    </div>
                                    <div style="color: #6b7280; margin-top: 5px;">
                                        <i class="fas fa-user"></i> \${order.customer_name}
                                        \${order.company_name ? \` - \${order.company_name}\` : ''}
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="background: \${statusBg}; color: \${statusColor}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-bottom: 5px;">
                                        \${remainingItems} Remaining
                                    </div>
                                    <div style="font-size: 12px; color: #6b7280;">\${order.order_date}</div>
                                </div>
                            </div>
                        </div>
                    \`;
                }).join('');
            }
            
            // Select Order
            async function selectOrder(orderId) {
                try {
                    const response = await axios.get(\`/api/orders/\${orderId}\`);
                    if (!response.data.success) {
                        alert('Failed to load order details');
                        return;
                    }
                    
                    selectedOrder = response.data.data;
                    scannedDevices = [];
                    
                    // Show Step 2
                    document.getElementById('dispatchStep1').style.display = 'none';
                    document.getElementById('dispatchStep2').style.display = 'block';
                    
                    // Display order summary
                    document.getElementById('orderSummary').innerHTML = \`
                        <div>
                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Order ID</div>
                            <div style="font-size: 20px; font-weight: 700;">\${selectedOrder.order.order_id}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Customer</div>
                            <div style="font-size: 16px; font-weight: 600;">\${selectedOrder.order.customer_name}</div>
                            <div style="font-size: 12px; opacity: 0.8;">\${selectedOrder.order.company_name || ''}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">Order Date</div>
                            <div style="font-size: 16px; font-weight: 600;">\${selectedOrder.order.order_date}</div>
                        </div>
                    \`;
                    
                    // Display products to dispatch
                    displayOrderProducts();
                    
                    // Set dispatch date to today
                    document.getElementById('newDispatchDate').valueAsDate = new Date();
                    
                    // Focus on scan input
                    setTimeout(() => document.getElementById('scanDeviceInput').focus(), 100);
                    
                } catch (error) {
                    alert('Error loading order: ' + error.message);
                }
            }
            
            // Display Order Products
            function displayOrderProducts() {
                const products = selectedOrder.items;
                
                document.getElementById('orderProductsList').innerHTML = products.map(item => {
                    // Match scanned devices by product name (model_name)
                    const scannedForThisProduct = scannedDevices.filter(d => 
                        d.model_name === item.product_name || 
                        d.product_name === item.product_name
                    ).length;
                    const remainingToScan = item.quantity - scannedForThisProduct;
                    const isComplete = remainingToScan === 0;
                    
                    return \`
                        <div style="padding: 15px; margin-bottom: 10px; border: 2px solid #e5e7eb; border-radius: 8px; background: #f9fafb;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; font-size: 14px; color: #1f2937;">\${item.product_name}</div>
                                    <div style="font-size: 12px; color: #6b7280; margin-top: 3px;">
                                        Category: \${item.product_category || 'N/A'}
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="display: flex; flex-direction: column; gap: 5px;">
                                        <div style="font-size: 24px; font-weight: 700; color: \${isComplete ? '#10b981' : '#f59e0b'};">
                                            \${scannedForThisProduct} / \${item.quantity}
                                        </div>
                                        <div style="font-size: 14px; font-weight: 600; color: \${isComplete ? '#10b981' : '#dc2626'}; background: \${isComplete ? '#d1fae5' : '#fee2e2'}; padding: 4px 8px; border-radius: 6px;">
                                            \${isComplete ? '✅ Complete' : remainingToScan + ' Remaining'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    \`;
                }).join('');
            }
            
            // Clear Scan Input
            function clearScanInput() {
                document.getElementById('scanDeviceInput').value = '';
                document.getElementById('scanDeviceInput').focus();
                document.getElementById('scanStatus').style.display = 'none';
            }
            
            // Scan Device
            async function scanDevice() {
                const serialNo = document.getElementById('scanDeviceInput').value.trim();
                const statusDiv = document.getElementById('scanStatus');
                
                if (!serialNo) {
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#fee2e2';
                    statusDiv.style.color = '#991b1b';
                    statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Please enter a serial number';
                    return;
                }
                
                // Check if already scanned
                if (scannedDevices.find(d => d.serial_no === serialNo)) {
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#fef3c7';
                    statusDiv.style.color = '#92400e';
                    statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Device already scanned!';
                    setTimeout(() => clearScanInput(), 2000);
                    return;
                }
                
                statusDiv.style.display = 'block';
                statusDiv.style.background = '#dbeafe';
                statusDiv.style.color = '#1e40af';
                statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validating device...';
                
                try {
                    // Validate device and check QC
                    const response = await axios.get(\`/api/devices/\${serialNo}/validate\`);
                    
                    if (!response.data.success) {
                        statusDiv.style.background = '#fee2e2';
                        statusDiv.style.color = '#991b1b';
                        statusDiv.innerHTML = \`<i class="fas fa-times-circle"></i> \${response.data.error}\`;
                        setTimeout(() => clearScanInput(), 3000);
                        return;
                    }
                    
                    const deviceData = response.data.data;
                    
                    // Check QC status
                    if (!deviceData.qcPassed) {
                        const qcStatus = deviceData.qcStatus;
                        statusDiv.style.background = '#fef3c7';
                        statusDiv.style.color = '#92400e';
                        statusDiv.innerHTML = \`
                            <div style="font-weight: 700; margin-bottom: 5px;">
                                <i class="fas fa-exclamation-triangle"></i> QC Status: \${qcStatus}
                            </div>
                            <div style="font-size: 13px;">
                                \${qcStatus === 'NO_QC' ? 'This device has not been QC tested yet.' : 'This device failed QC or is pending approval.'}
                                Device added but dispatch may need manager approval.
                            </div>
                        \`;
                    } else {
                        statusDiv.style.background = '#d1fae5';
                        statusDiv.style.color = '#065f46';
                        statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Device validated successfully! QC Status: Pass';
                    }
                    
                    // Check if this device matches any product in the order
                    const matchingProduct = selectedOrder.items.find(item => 
                        item.product_name === deviceData.device.model_name
                    );
                    
                    if (!matchingProduct) {
                        statusDiv.style.background = '#fef3c7';
                        statusDiv.style.color = '#92400e';
                        statusDiv.innerHTML = \`
                            <div style="font-weight: 700; margin-bottom: 5px;">
                                <i class="fas fa-exclamation-triangle"></i> Warning: Product Not in Order
                            </div>
                            <div style="font-size: 13px;">
                                This device (\${deviceData.device.model_name}) is not in the current order.
                                Device added but may need verification.
                            </div>
                        \`;
                    }
                    
                    // Add to scanned devices
                    scannedDevices.push({
                        serial_no: serialNo,
                        model_name: deviceData.device.model_name,
                        product_name: deviceData.device.model_name,
                        qc_status: deviceData.qcStatus,
                        qc_passed: deviceData.qcPassed
                    });
                    
                    // Update UI
                    displayScannedDevices();
                    displayOrderProducts();
                    updateSubmitButton();
                    
                    // Clear input after 1 second
                    setTimeout(() => clearScanInput(), 1000);
                    
                } catch (error) {
                    statusDiv.style.background = '#fee2e2';
                    statusDiv.style.color = '#991b1b';
                    statusDiv.innerHTML = \`<i class="fas fa-times-circle"></i> Error: \${error.response?.data?.error || error.message}\`;
                    setTimeout(() => clearScanInput(), 3000);
                }
            }
            
            // Display Scanned Devices
            function displayScannedDevices() {
                const listDiv = document.getElementById('scannedDevicesList');
                document.getElementById('scannedCount').textContent = scannedDevices.length;
                
                if (scannedDevices.length === 0) {
                    listDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #9ca3af;">No devices scanned yet. Start scanning barcodes...</div>';
                    return;
                }
                
                listDiv.innerHTML = scannedDevices.map((device, index) => {
                    const qcColor = device.qc_passed ? '#10b981' : '#f59e0b';
                    const qcBg = device.qc_passed ? '#d1fae5' : '#fef3c7';
                    
                    return \`
                        <div style="padding: 12px; margin-bottom: 8px; border: 2px solid #e5e7eb; border-radius: 8px; background: white; display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <div style="font-weight: 700; color: #1f2937;">
                                    <i class="fas fa-barcode" style="color: #667eea;"></i> \${device.serial_no}
                                </div>
                                <div style="font-size: 12px; color: #6b7280; margin-top: 3px;">\${device.model_name}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="background: \${qcBg}; color: \${qcColor}; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600;">
                                    QC: \${device.qc_status}
                                </div>
                                <button onclick="removeScannedDevice(\${index})" style="background: #fee2e2; color: #991b1b; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    \`;
                }).join('');
            }
            
            // Remove Scanned Device
            function removeScannedDevice(index) {
                scannedDevices.splice(index, 1);
                displayScannedDevices();
                displayOrderProducts();
                updateSubmitButton();
            }
            
            // Update Submit Button
            function updateSubmitButton() {
                const submitBtn = document.getElementById('submitDispatchBtn');
                const count = scannedDevices.length;
                document.getElementById('submitCount').textContent = count;
                
                if (count > 0) {
                    submitBtn.disabled = false;
                    submitBtn.style.opacity = '1';
                    submitBtn.style.cursor = 'pointer';
                } else {
                    submitBtn.disabled = true;
                    submitBtn.style.opacity = '0.5';
                    submitBtn.style.cursor = 'not-allowed';
                }
            }
            
            // Go Back to Order Selection
            function goBackToOrderSelection() {
                document.getElementById('dispatchStep1').style.display = 'block';
                document.getElementById('dispatchStep2').style.display = 'none';
                scannedDevices = [];
                selectedOrder = null;
            }
            
            // Submit Create Dispatch
            async function submitCreateDispatch() {
                if (scannedDevices.length === 0) {
                    alert('Please scan at least one device');
                    return;
                }
                
                const dispatchDate = document.getElementById('newDispatchDate').value;
                if (!dispatchDate) {
                    alert('Please select dispatch date');
                    return;
                }
                
                const submitBtn = document.getElementById('submitDispatchBtn');
                const originalText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Dispatch...';
                
                try {
                    const response = await axios.post('/api/dispatch/create', {
                        order_id: selectedOrder.order.order_id,
                        customer_name: selectedOrder.order.customer_name,
                        customer_code: selectedOrder.order.customer_code,
                        company_name: selectedOrder.order.company_name,
                        dispatch_date: dispatchDate,
                        devices: scannedDevices,
                        courier_name: document.getElementById('newDispatchCourier').value,
                        dispatch_method: document.getElementById('newDispatchMethod').value,
                        notes: document.getElementById('newDispatchNotes').value
                    });
                    
                    if (response.data.success) {
                        alert(\`✅ Dispatch Created Successfully!\\n\\nDispatched: \${response.data.data.dispatched} devices\\nTotal Scanned: \${response.data.data.total} devices\`);
                        closeCreateDispatchModal();
                        loadRecentDispatches();
                        loadInventory();
                    } else {
                        alert('Failed to create dispatch: ' + response.data.error);
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalText;
                    }
                } catch (error) {
                    alert('Error creating dispatch: ' + (error.response?.data?.error || error.message));
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            }
            
            // ===================================================================
            // END OF ORDER-BASED DISPATCH WORKFLOW FUNCTIONS
            // ===================================================================
            
            // ===================================================================
            // TRACKING DETAILS FUNCTIONS
            // ===================================================================
            
            let allTrackingRecords = [];
            
            // Open Tracking Details Modal
            async function openTrackingDetailsModal() {
                document.getElementById('trackingDetailsModal').classList.add('show');
                document.getElementById('trackingOrderId').value = '';
                document.getElementById('trackingCourierPartner').value = '';
                document.getElementById('trackingCourierMode').value = '';
                document.getElementById('trackingTrackingId').value = '';
                document.getElementById('trackingFormStatus').style.display = 'none';
                document.getElementById('trackingOrderId').focus();
                
                // Load tracking records
                await loadTrackingRecords();
            }
            
            // Close Tracking Details Modal
            function openTrackingModal() {
                document.getElementById('trackingDetailsModal').classList.add('show');
                // No need to load report - form only modal
            }
            
            function closeTrackingDetailsModal() {
                document.getElementById('trackingDetailsModal').classList.remove('show');
            }
            
            // Submit Tracking Details
            async function submitTrackingDetails(event) {
                event.preventDefault();
                
                console.log('Submit tracking details called');
                
                const orderId = document.getElementById('trackingOrderId').value.trim();
                const courierPartner = document.getElementById('trackingCourierPartner').value.trim();
                const courierMode = document.getElementById('trackingCourierMode').value;
                const trackingId = document.getElementById('trackingTrackingId').value.trim();
                
                console.log('Form values:', { orderId, courierPartner, courierMode, trackingId });
                
                if (!orderId || !courierPartner || !courierMode || !trackingId) {
                    showTrackingStatus('❌ Please fill all required fields', 'error');
                    return;
                }
                
                // Show loading status
                showTrackingStatus('⏳ Saving tracking details...', 'info');
                
                try {
                    console.log('Sending POST request to /api/tracking-details');
                    
                    const response = await axios.post('/api/tracking-details', {
                        order_id: orderId,
                        courier_partner: courierPartner,
                        courier_mode: courierMode,
                        tracking_id: trackingId
                    });
                    
                    console.log('Response received:', response.data);
                    
                    if (response.data.success) {
                        showTrackingStatus('✅ Tracking details added successfully!', 'success');
                        
                        // Clear form
                        document.getElementById('trackingOrderId').value = '';
                        document.getElementById('trackingCourierPartner').value = '';
                        document.getElementById('trackingCourierMode').value = '';
                        document.getElementById('trackingTrackingId').value = '';
                        
                        // Reload tracking records
                        await loadTrackingRecords();
                        
                        // Focus back to Order ID field
                        document.getElementById('trackingOrderId').focus();
                    } else {
                        showTrackingStatus('❌ ' + response.data.error, 'error');
                    }
                } catch (error) {
                    console.error('Error submitting tracking:', error);
                    console.error('Error details:', error.response);
                    showTrackingStatus('❌ Error: ' + (error.response?.data?.error || error.message || 'Failed to save tracking details'), 'error');
                }
            }
            
            // Load Tracking Records
            async function loadTrackingRecords() {
                try {
                    const response = await axios.get('/api/tracking-details');
                    
                    if (response.data.success) {
                        allTrackingRecords = response.data.data || [];
                        populateMonthDropdown(allTrackingRecords);
                        displayTrackingRecords(allTrackingRecords);
                        updateTrackingStats(allTrackingRecords);
                    }
                } catch (error) {
                    console.error('Error loading tracking records:', error);
                }
            }
            
            // Populate Month Dropdown
            function populateMonthDropdown(records) {
                const monthSelect = document.getElementById('trackingMonthFilter');
                const months = new Set();
                
                // Extract unique year-months from records
                records.forEach(record => {
                    if (record.created_at) {
                        const date = new Date(record.created_at);
                        const yearMonth = \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}\`;
                        months.add(yearMonth);
                    }
                });
                
                // Convert to array and sort in descending order (newest first)
                const sortedMonths = Array.from(months).sort().reverse();
                
                // Clear existing options except "All Months"
                monthSelect.innerHTML = '<option value="">All Months</option>';
                
                // Add month options
                sortedMonths.forEach(yearMonth => {
                    const [year, month] = yearMonth.split('-');
                    const date = new Date(year, month - 1, 1);
                    const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    
                    const option = document.createElement('option');
                    option.value = yearMonth;
                    option.textContent = monthName;
                    monthSelect.appendChild(option);
                });
            }
            
            // Display Tracking Records
            async function displayTrackingRecords(records) {
                const tbody = document.getElementById('trackingReportTableBody');
                
                if (records.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #9ca3af; font-size: 15px;"><i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 10px; display: block; opacity: 0.5;"></i>No tracking records found</td></tr>';
                    return;
                }
                
                // Fetch weights for all records
                const recordsWithWeights = await Promise.all(records.map(async (record) => {
                    let totalWeight = 0;
                    
                    try {
                        // Fetch sale items for this order
                        const response = await axios.get(\`/api/sales/\${record.order_id}/items\`);
                        if (response.data.success && response.data.data) {
                            const items = response.data.data;
                            
                            // Calculate total weight from product catalog
                            totalWeight = items.reduce((sum, item) => {
                                let itemWeight = 0;
                                
                                // Search for product in catalog
                                for (const category in productCatalog) {
                                    const product = productCatalog[category].find(p => 
                                        p.name === item.product_name
                                    );
                                    if (product) {
                                        itemWeight = product.weight * item.quantity;
                                        break;
                                    }
                                }
                                
                                return sum + itemWeight;
                            }, 0);
                        }
                    } catch (error) {
                        console.error('Error fetching weight for order:', record.order_id, error);
                    }
                    
                    return { ...record, totalWeight };
                }));
                
                tbody.innerHTML = recordsWithWeights.map((record, index) => {
                    const actualPrice = record.courier_cost || record.total_amount || 0;
                    const dateAdded = new Date(record.created_at).toLocaleDateString('en-IN');
                    const weight = record.totalWeight ? record.totalWeight.toFixed(2) : '0.00';
                    const rowBg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
                    
                    return \`
                        <tr style="background: \${rowBg}; transition: all 0.2s; border-bottom: 1px solid #f3f4f6;" 
                            onmouseover="this.style.background='#f3e8ff'; this.style.transform='scale(1.01)'" 
                            onmouseout="this.style.background='\${rowBg}'; this.style.transform='scale(1)'">
                            <td style="padding: 14px; border-right: 1px solid #f3f4f6;">
                                <a href="javascript:void(0)" 
                                   onclick="viewTrackingSaleDetails('\${record.order_id}')" 
                                   style="font-weight: 700; color: #667eea; text-decoration: none; cursor: pointer; font-size: 14px;"
                                   title="Click to view sale details"
                                   onmouseover="this.style.textDecoration='underline'"
                                   onmouseout="this.style.textDecoration='none'">
                                    #\${record.order_id}
                                </a>
                            </td>
                            <td style="padding: 14px; border-right: 1px solid #f3f4f6;">
                                <span style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); color: #92400e; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 13px; display: inline-block;">
                                    \${weight} Kg
                                </span>
                            </td>
                            <td style="padding: 14px; border-right: 1px solid #f3f4f6;">
                                <span style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); color: #065f46; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 13px; display: inline-block;">
                                    ₹\${actualPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </td>
                            <td style="padding: 14px; font-weight: 600; color: #374151; font-size: 13px; border-right: 1px solid #f3f4f6;">
                                \${record.courier_partner}
                            </td>
                            <td style="padding: 14px; border-right: 1px solid #f3f4f6;">
                                <span style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); color: #1e40af; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; display: inline-block;">
                                    \${record.courier_mode}
                                </span>
                            </td>
                            <td style="padding: 14px; font-family: 'Courier New', monospace; font-size: 13px; color: #7c3aed; font-weight: 600; border-right: 1px solid #f3f4f6;">
                                \${record.tracking_id}
                            </td>
                            <td style="padding: 14px; color: #6b7280; font-size: 13px; border-right: 1px solid #f3f4f6;">
                                \${dateAdded}
                            </td>
                            <td style="padding: 14px; text-align: center;">
                                <button onclick="deleteTrackingRecord(\${record.id})" 
                                    style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);"
                                    title="Delete"
                                    onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 8px rgba(239, 68, 68, 0.5)'"
                                    onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 4px rgba(239, 68, 68, 0.3)'">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    \`;
                }).join('');
            }
            
            // Filter Tracking Report
            function filterTrackingReport() {
                const searchTerm = document.getElementById('trackingReportSearch').value.toLowerCase();
                const selectedMonth = document.getElementById('trackingMonthFilter').value;
                
                const filtered = allTrackingRecords.filter(record => {
                    // Text search filter
                    const matchesSearch = !searchTerm || (
                        record.order_id.toLowerCase().includes(searchTerm) ||
                        record.courier_partner.toLowerCase().includes(searchTerm) ||
                        record.courier_mode.toLowerCase().includes(searchTerm) ||
                        record.tracking_id.toLowerCase().includes(searchTerm)
                    );
                    
                    // Month filter
                    let matchesMonth = true;
                    if (selectedMonth) {
                        const recordDate = new Date(record.created_at);
                        const recordYearMonth = \`\${recordDate.getFullYear()}-\${String(recordDate.getMonth() + 1).padStart(2, '0')}\`;
                        matchesMonth = recordYearMonth === selectedMonth;
                    }
                    
                    return matchesSearch && matchesMonth;
                });
                
                displayTrackingRecords(filtered);
                updateTrackingStats(filtered);
            }
            
            // Update Tracking Stats
            function updateTrackingStats(records) {
                const totalCount = records.length;
                const totalCost = records.reduce((sum, record) => {
                    return sum + (parseFloat(record.courier_cost) || parseFloat(record.total_amount) || 0);
                }, 0);
                const avgCost = totalCount > 0 ? totalCost / totalCount : 0;
                
                document.getElementById('trackingTotalCount').textContent = totalCount;
                document.getElementById('trackingTotalCost').textContent = '₹' + totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                document.getElementById('trackingAvgCost').textContent = '₹' + avgCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            
            // Delete Tracking Record
            async function deleteTrackingRecord(id) {
                if (!confirm('Are you sure you want to delete this tracking record?')) {
                    return;
                }
                
                try {
                    const response = await axios.delete(\`/api/tracking-details/\${id}\`);
                    
                    if (response.data.success) {
                        showTrackingStatus('✅ Tracking record deleted successfully', 'success');
                        await loadTrackingRecords();
                    } else {
                        showTrackingStatus('❌ Failed to delete: ' + response.data.error, 'error');
                    }
                } catch (error) {
                    console.error('Error deleting tracking:', error);
                    showTrackingStatus('❌ Error: ' + (error.response?.data?.error || error.message), 'error');
                }
            }
            
            // Show Tracking Status Message
            function showTrackingStatus(message, type) {
                const statusDiv = document.getElementById('trackingFormStatus');
                if (!statusDiv) {
                    console.error('trackingFormStatus element not found');
                    return;
                }
                
                statusDiv.style.display = 'block';
                statusDiv.textContent = message;
                
                if (type === 'success') {
                    statusDiv.style.background = '#d1fae5';
                    statusDiv.style.color = '#065f46';
                    statusDiv.style.border = '2px solid #10b981';
                } else if (type === 'info') {
                    statusDiv.style.background = '#dbeafe';
                    statusDiv.style.color = '#1e40af';
                    statusDiv.style.border = '2px solid #3b82f6';
                } else {
                    statusDiv.style.background = '#fee2e2';
                    statusDiv.style.color = '#991b1b';
                    statusDiv.style.border = '2px solid #ef4444';
                }
                
                // Auto-hide after 5 seconds (except for info messages)
                if (type !== 'info') {
                    setTimeout(() => {
                        statusDiv.style.display = 'none';
                    }, 5000);
                }
            }
            
            // View Sale Details from Tracking (without edit button)
            async function viewTrackingSaleDetails(orderId) {
                try {
                    const modal = document.getElementById('saleDetailsModal');
                    const content = document.getElementById('saleDetailsContent');
                    
                    // Set higher z-index to appear above tracking modal
                    modal.style.zIndex = '10001';
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
                    \`;
                } catch (error) {
                    console.error('Error loading sale details:', error);
                    alert('Error loading sale details');
                }
            }
            
            // ===================================================================
            // END OF TRACKING DETAILS FUNCTIONS
            // ===================================================================
            
            // ===================================================================
            // NEW QC SYSTEM FUNCTIONS
            // ===================================================================
            
            let currentQCDevice = null;
            let currentQCFilter = null;
            let qcProducts = {
                'MDVR': [
                    '4ch 1080p SD Card MDVR (MR9504EC)',
                    '4ch 1080p HDD MDVR (MR9704C)',
                    '4ch 1080p SD, 4G, GPS MDVR (MR9504E)',
                    '4ch 1080p SD, 4G, GPS MDVR (MR9504E-A3)',
                    '4ch 1080p HDD, 4G, GPS MDVR (MR9704E)',
                    'TVS 4ch 1080p SD, 4G, GPS MDVR',
                    '5ch MDVR SD 4g + GPS + LAN + RS232 + RS485',
                    '5ch MDVR HDD 4g + GPS + LAN + RS232 + RS485',
                    '4ch 1080p SD, 4G, wifi, GPS MDVR (MA9504ED)',
                    'AI MDVR with (DSM + ADAS) (SD+ 4g + GPS)',
                    'AI MDVR with (DSM + ADAS) (SD+HDD+ 4g + GPS)'
                ],
                'Monitor & Monitor Kit': [
                    '7 " AV Monitor',
                    '7" VGA Monitor',
                    '7" HDMI Monitor',
                    '7 inch Heavy Duty VGA Monitor',
                    '4k Recording monitor kit 2ch',
                    '4 inch AV monitor',
                    '720 2ch Recording Monitor Kit',
                    '4k Recording monitor kit 4ch'
                ],
                'Cameras': [
                    '2 MP IR indoor Dome Camera',
                    '2 MP IR Outdoor Bullet Camera',
                    '2 MP Heavy Duty Bullet Camera',
                    '2 MP Heavy Duty Dome Camera',
                    'PTZ Camera',
                    '4k Monitor Camera',
                    '2 MP IP Camera',
                    'Replacement Bullet Camera 2mp',
                    'Replacement Dome Camera 2 mp',
                    'Replacement Dome Audio Camera',
                    'Reverse Camera',
                    '2mp IR Audio Camera',
                    'DFMS Camera',
                    'ADAS Camera',
                    'BSD Camera',
                    '2mp IP Dome Audio Camera'
                ],
                'Dashcam': [
                    '4 Inch 2 Ch Dashcam',
                    '10 inch 2 Ch Full Touch Dashcam',
                    '10 inch 2 Ch 4g, GPS, Android Dashcam',
                    '4k Dashcam 12 inch',
                    '2k 12 inch Dashcam',
                    '2ch 4g Dashcam MT95L',
                    '3ch AI Dashcam ADAS + DSM (MT95C)',
                    'wifi Dash Cam',
                    '4 inch 3 camera Dash Cam',
                    '4 inch Android Dashcam',
                    '3ch 4g Dashcam with Rear Camera (MT95L-A3)',
                    '3ch AI Dashcam ADAS + DSM (MT95C)'
                ],
                'Storage': [
                    'Surveillance Grade 64GB SD Card',
                    'Surveillance Grade 128GB SD Card',
                    'Surveillance Grade 256GB SD Card',
                    'Surveillance Grade 512GB SD Card',
                    'HDD 1 TB'
                ],
                'RFID Tags': [
                    '2.4G RFID Animal Ear Tag',
                    '2.4G Active Tag (Card Type) HX607'
                ],
                'RFID Reader': [
                    '2.4 GHZ RFID Active Reader (Bus)',
                    '2.4 GHZ RFID Active Reader (Campus)',
                    '2.4G IOT Smart RFID Reader (ZR7901P)'
                ],
                'MDVR Accessories': [
                    'MDVR Security Box',
                    '2 way Communication Device',
                    'MDVR Maintenance Tool',
                    'MDVR Remote',
                    'MDVR Panic Button',
                    'MDVR Server',
                    'RS 232 Adaptor',
                    '1mt Cable',
                    '3mt Cable',
                    '5mt Cable',
                    '10mt Cable',
                    '15mt Cable',
                    'Alcohol Tester',
                    'VGA Cable',
                    'Ultra Sonic Fuel Sensor',
                    'Rod Type Fuel Sensor'
                ],
                'Other product and Accessories': [
                    'Leaser Printer',
                    'D link Wire Bundle',
                    'Wireless Receiver Transmitter',
                    'Parking Sensor',
                    'MDVR Installation',
                    'GPS Installation',
                    'Annual Maintenance Charges'
                ]
            };
            
            // Open New QC Modal
            function openNewQCModal() {
                document.getElementById('newQCModal').classList.add('show');
                document.getElementById('newQCScanInput').value = '';
                document.getElementById('newQCDeviceInfo').style.display = 'none';
                document.getElementById('newQCProductSelection').style.display = 'none';
                document.getElementById('newQCTestSection').style.display = 'none';
                document.getElementById('newQCSubmitSection').style.display = 'none';
                document.getElementById('newQCScanInput').focus();
                currentQCDevice = null;
            }
            
            // Close New QC Modal
            function closeNewQCModal() {
                document.getElementById('newQCModal').classList.remove('show');
                document.getElementById('newQCForm').reset();
                currentQCDevice = null;
            }
            
            // Load Device for New QC
            async function loadDeviceForNewQC() {
                const serialNo = document.getElementById('newQCScanInput').value.trim();
                
                if (!serialNo) {
                    alert('⚠️ Please enter a device serial number');
                    return;
                }
                
                try {
                    // Get device from inventory
                    const response = await axios.get(\`/api/inventory/search?serial=\${serialNo}\`);
                    
                    if (!response.data.success) {
                        alert('❌ Error: ' + (response.data.error || 'Failed to search inventory'));
                        return;
                    }
                    
                    if (response.data.data.length === 0) {
                        alert(\`❌ Device not found in inventory\\n\\nSerial Number: \${serialNo}\\n\\nPlease verify the serial number and try again.\\n\\nNote: Serial number search is partial match enabled.\`);
                        return;
                    }
                    
                    const device = response.data.data[0];
                    currentQCDevice = device;
                    
                    // Display device info with success message
                    document.getElementById('newQCDeviceDetails').innerHTML = \`
                        <div style="background: #d1fae5; padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 2px solid #10b981;">
                            <div style="color: #065f46; font-weight: 600; margin-bottom: 5px;">
                                ✅ Device Found Successfully
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
                            <div><strong>Serial No:</strong> \${device.device_serial_no}</div>
                            <div><strong>Model:</strong> \${device.model_name || 'N/A'}</div>
                            <div><strong>Status:</strong> \${device.status || 'N/A'}</div>
                            <div><strong>In Date:</strong> \${device.in_date || 'N/A'}</div>
                        </div>
                    \`;
                    
                    document.getElementById('newQCDeviceInfo').style.display = 'block';
                    document.getElementById('newQCProductSelection').style.display = 'block';
                    
                    // Auto-focus to category selector
                    document.getElementById('newQCCategory').focus();
                    
                } catch (error) {
                    console.error('Error loading device:', error);
                    const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
                    alert(\`❌ Error loading device\\n\\nSerial: \${serialNo}\\nError: \${errorMsg}\\n\\nPlease check the serial number and try again.\`);
                }
            }
            
            // Load Products by Category
            function loadQCProductsByCategory() {
                const category = document.getElementById('newQCCategory').value;
                const productNameSelect = document.getElementById('newQCProductName');
                const productNameGroup = document.getElementById('newQCProductNameGroup');
                
                if (!category) {
                    productNameGroup.style.display = 'none';
                    document.getElementById('newQCTestSection').style.display = 'none';
                    document.getElementById('newQCSubmitSection').style.display = 'none';
                    return;
                }
                
                // Clear and populate products
                productNameSelect.innerHTML = '<option value="">-- Select Product --</option>';
                
                if (qcProducts[category]) {
                    qcProducts[category].forEach(product => {
                        const option = document.createElement('option');
                        option.value = product;
                        option.textContent = product;
                        productNameSelect.appendChild(option);
                    });
                }
                
                productNameGroup.style.display = 'block';
                document.getElementById('newQCTestSection').style.display = 'none';
                document.getElementById('newQCSubmitSection').style.display = 'none';
            }
            
            // Show QC Test Fields based on Product
            function showQCTestFields() {
                const productName = document.getElementById('newQCProductName').value;
                const category = document.getElementById('newQCCategory').value;
                const testFieldsContainer = document.getElementById('newQCTestFields');
                
                if (!productName) {
                    document.getElementById('newQCTestSection').style.display = 'none';
                    document.getElementById('newQCSubmitSection').style.display = 'none';
                    return;
                }
                
                let fieldsHTML = '';
                
                // Determine test fields based on category and product
                if (category === 'MDVR') {
                    const has4G = productName.includes('4G');
                    
                    fieldsHTML = \`
                        <div class="form-group">
                            <label>SD Connectivity *</label>
                            <select class="qc-test-field" id="test_sd_connectivity" onchange="calculateNewQCStatus()" required>
                                <option value="">-- Select --</option>
                                <option value="Pass">✅ Pass</option>
                                <option value="Fail">❌ Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>All Channels Working *</label>
                            <select class="qc-test-field" id="test_all_channels" onchange="calculateNewQCStatus()" required>
                                <option value="">-- Select --</option>
                                <option value="Pass">✅ Pass</option>
                                <option value="Fail">❌ Fail</option>
                            </select>
                        </div>
                    \`;
                    
                    if (has4G) {
                        fieldsHTML += \`
                            <div class="form-group">
                                <label>Network Connectivity *</label>
                                <select class="qc-test-field" id="test_network_connectivity" onchange="calculateNewQCStatus()" required>
                                    <option value="">-- Select --</option>
                                    <option value="Pass">✅ Pass</option>
                                    <option value="Fail">❌ Fail</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>GPS Connectivity *</label>
                                <select class="qc-test-field" id="test_gps_connectivity" onchange="calculateNewQCStatus()" required>
                                    <option value="">-- Select --</option>
                                    <option value="Pass">✅ Pass</option>
                                    <option value="Fail">❌ Fail</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>SIM Card Slot *</label>
                                <select class="qc-test-field" id="test_sim_card_slot" onchange="calculateNewQCStatus()" required>
                                    <option value="">-- Select --</option>
                                    <option value="Pass">✅ Pass</option>
                                    <option value="Fail">❌ Fail</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Online Status *</label>
                                <select class="qc-test-field" id="test_online_status" onchange="calculateNewQCStatus()" required>
                                    <option value="">-- Select --</option>
                                    <option value="Pass">✅ Pass</option>
                                    <option value="Fail">❌ Fail</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>IP Address (Optional)</label>
                                <input type="text" id="test_ip_address" placeholder="e.g., 192.168.1.100">
                            </div>
                        \`;
                    }
                } else if (category === 'Camera') {
                    fieldsHTML = \`
                        <div class="form-group">
                            <label>Camera Quality *</label>
                            <select class="qc-test-field" id="test_camera_quality" onchange="calculateNewQCStatus()" required>
                                <option value="">-- Select --</option>
                                <option value="Pass">✅ Pass - Clear Image</option>
                                <option value="Fail">❌ Fail - Poor Quality</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Focus Test *</label>
                            <select class="qc-test-field" id="test_focus" onchange="calculateNewQCStatus()" required>
                                <option value="">-- Select --</option>
                                <option value="Pass">✅ Pass</option>
                                <option value="Fail">❌ Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Night Vision (If Applicable)</label>
                            <select class="qc-test-field" id="test_night_vision" onchange="calculateNewQCStatus()">
                                <option value="">-- N/A --</option>
                                <option value="Pass">✅ Pass</option>
                                <option value="Fail">❌ Fail</option>
                            </select>
                        </div>
                    \`;
                } else if (category === 'Monitor') {
                    fieldsHTML = \`
                        <div class="form-group">
                            <label>Display Quality *</label>
                            <select class="qc-test-field" id="test_display_quality" onchange="calculateNewQCStatus()" required>
                                <option value="">-- Select --</option>
                                <option value="Pass">✅ Pass - Clear Display</option>
                                <option value="Fail">❌ Fail - Dead Pixels/Lines</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>All Buttons Working *</label>
                            <select class="qc-test-field" id="test_all_buttons" onchange="calculateNewQCStatus()" required>
                                <option value="">-- Select --</option>
                                <option value="Pass">✅ Pass</option>
                                <option value="Fail">❌ Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Touch Screen (If Applicable)</label>
                            <select class="qc-test-field" id="test_touch_screen" onchange="calculateNewQCStatus()">
                                <option value="">-- N/A --</option>
                                <option value="Pass">✅ Pass</option>
                                <option value="Fail">❌ Fail</option>
                            </select>
                        </div>
                    \`;
                } else if (category === 'Accessories') {
                    fieldsHTML = \`
                        <div class="form-group">
                            <label>Physical Condition *</label>
                            <select class="qc-test-field" id="test_physical_condition" onchange="calculateNewQCStatus()" required>
                                <option value="">-- Select --</option>
                                <option value="Pass">✅ Pass - No Damage</option>
                                <option value="Fail">❌ Fail - Damaged</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Functionality Test *</label>
                            <select class="qc-test-field" id="test_functionality" onchange="calculateNewQCStatus()" required>
                                <option value="">-- Select --</option>
                                <option value="Pass">✅ Pass - Works Properly</option>
                                <option value="Fail">❌ Fail - Not Working</option>
                            </select>
                        </div>
                    \`;
                }
                
                testFieldsContainer.innerHTML = fieldsHTML;
                document.getElementById('newQCTestSection').style.display = 'block';
                document.getElementById('newQCSubmitSection').style.display = 'flex';
                document.getElementById('newQCFinalStatus').innerHTML = '';
            }
            
            // Calculate New QC Status
            function calculateNewQCStatus() {
                const testFields = document.querySelectorAll('.qc-test-field');
                
                if (testFields.length === 0) {
                    document.getElementById('newQCFinalStatus').innerHTML = '';
                    return;
                }
                
                let allPass = true;
                let anyFail = false;
                let allFilled = true;
                
                testFields.forEach(field => {
                    const value = field.value;
                    // Skip optional fields (those without required attribute)
                    if (!field.hasAttribute('required') && !value) {
                        return;
                    }
                    
                    if (!value && field.hasAttribute('required')) {
                        allFilled = false;
                    } else if (value === 'Fail') {
                        anyFail = true;
                        allPass = false;
                    } else if (value !== 'Pass' && field.hasAttribute('required')) {
                        allPass = false;
                    }
                });
                
                if (!allFilled) {
                    document.getElementById('newQCFinalStatus').innerHTML = \`
                        <div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 15px; border-radius: 8px;">
                            <strong style="color: #d97706; font-size: 16px;">⏳ Status: PENDING</strong>
                            <p style="margin: 8px 0 0 0; color: #92400e;">Please complete all required test fields</p>
                        </div>
                    \`;
                    return;
                }
                
                let statusHTML = '';
                if (anyFail) {
                    statusHTML = \`
                        <div style="background: #fee2e2; border: 2px solid #ef4444; padding: 15px; border-radius: 8px;">
                            <strong style="color: #dc2626; font-size: 18px;">❌ Final QC Status: FAIL</strong>
                            <p style="margin: 8px 0 0 0; color: #991b1b;">One or more parameters failed quality check</p>
                        </div>
                    \`;
                } else if (allPass) {
                    statusHTML = \`
                        <div style="background: #d1fae5; border: 2px solid #10b981; padding: 15px; border-radius: 8px;">
                            <strong style="color: #059669; font-size: 18px;">✅ Final QC Status: PASS</strong>
                            <p style="margin: 8px 0 0 0; color: #065f46;">All parameters passed quality check</p>
                        </div>
                    \`;
                }
                
                document.getElementById('newQCFinalStatus').innerHTML = statusHTML;
            }
            
            // Submit New QC Test
            async function submitNewQCTest(event) {
                event.preventDefault();
                
                if (!currentQCDevice) {
                    alert('Please load a device first');
                    return;
                }
                
                const category = document.getElementById('newQCCategory').value;
                const productName = document.getElementById('newQCProductName').value;
                
                if (!category || !productName) {
                    alert('Please select product category and name');
                    return;
                }
                
                // Collect all test results
                const testResults = {
                    product_category: category,
                    product_name: productName
                };
                
                const testFields = document.querySelectorAll('.qc-test-field');
                let allRequiredFilled = true;
                let anyFail = false;
                
                testFields.forEach(field => {
                    const fieldName = field.id.replace('test_', '');
                    const value = field.value;
                    
                    if (field.hasAttribute('required') && !value) {
                        allRequiredFilled = false;
                    }
                    
                    if (value) {
                        testResults[fieldName] = value;
                        if (value === 'Fail') {
                            anyFail = true;
                        }
                    }
                });
                
                // Get IP address if exists
                const ipField = document.getElementById('test_ip_address');
                if (ipField && ipField.value) {
                    testResults.ip_address = ipField.value;
                }
                
                if (!allRequiredFilled) {
                    alert('Please complete all required test fields');
                    return;
                }
                
                // Calculate final status
                const finalStatus = anyFail ? 'QC Fail' : 'QC Pass';
                
                const submitBtn = event.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
                
                try {
                    const response = await axios.post('/api/inventory/quality-check', {
                        device_serial_no: currentQCDevice.device_serial_no,
                        pass_fail: finalStatus,
                        checked_by: currentUser.employeeName || currentUser.fullName,
                        test_results: JSON.stringify(testResults),
                        remarks: \`Product: \${category} - \${productName}\`
                    });
                    
                    if (response.data.success) {
                        alert(\`✅ QC Report Submitted Successfully!\\n\\nDevice: \${currentQCDevice.device_serial_no}\\nProduct: \${productName}\\nFinal Status: \${finalStatus}\`);
                        closeNewQCModal();
                        loadQCData();
                    } else {
                        throw new Error(response.data.error || 'Submission failed');
                    }
                    
                } catch (error) {
                    console.error('Error submitting QC:', error);
                    alert('Error submitting QC: ' + (error.response?.data?.error || error.message));
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            }
            
            // Open Update QC Modal (Manual Entry)
            function openUpdateQCModal() {
                document.getElementById('updateQCModal').classList.add('show');
                // Set today's date as default
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('update_qc_date').value = today;
                // Focus on serial number input
                setTimeout(() => {
                    document.getElementById('update_serial_number').focus();
                }, 100);
            }
            
            // Close Update QC Modal
            function closeUpdateQCModal() {
                document.getElementById('updateQCModal').classList.remove('show');
                document.getElementById('updateQCForm').reset();
            }
            
            // Load Products for Update QC based on Category
            function loadUpdateQCProducts() {
                const category = document.getElementById('update_category').value;
                const productSelect = document.getElementById('update_product_name');
                
                // Clear product dropdown
                productSelect.innerHTML = '<option value="">-- Select Product --</option>';
                
                if (!category) {
                    return;
                }
                
                // Populate products based on category
                if (qcProducts[category]) {
                    qcProducts[category].forEach(product => {
                        const option = document.createElement('option');
                        option.value = product;
                        option.textContent = product;
                        productSelect.appendChild(option);
                    });
                }
            }
            
            // Submit Update QC (Manual Entry)
            async function submitUpdateQC(event) {
                event.preventDefault();
                
                // Collect all form data
                const category = document.getElementById('update_category').value;
                const productName = document.getElementById('update_product_name').value;
                
                const qcData = {
                    device_serial_no: document.getElementById('update_serial_number').value.trim(),
                    check_date: document.getElementById('update_qc_date').value,
                    checked_by: currentUser.employeeName || currentUser.fullName,
                    category: category,
                    product_name: productName,
                    device_type: category, // Use category as device type
                    camera_quality: document.getElementById('update_camera_quality').value || 'QC Not Applicable',
                    sd_connectivity: document.getElementById('update_sd_connectivity').value || 'QC Not Applicable',
                    all_ch_status: document.getElementById('update_all_ch_status').value || 'QC Not Applicable',
                    network_connectivity: document.getElementById('update_network_connectivity').value || 'QC Not Applicable',
                    gps_qc: document.getElementById('update_gps_qc').value || 'QC Not Applicable',
                    sim_card_slot: document.getElementById('update_sim_card_slot').value || 'QC Not Applicable',
                    online_qc: document.getElementById('update_online_qc').value || 'QC Not Applicable',
                    monitor_qc_status: document.getElementById('update_monitor_qc_status').value || 'QC Not Applicable',
                    final_qc_status: document.getElementById('update_final_qc_status').value,
                    ip_address: document.getElementById('update_ip_address').value.trim() || '',
                    update_status: document.getElementById('update_status').value.trim() || ''
                };
                
                // Validate required fields
                if (!qcData.device_serial_no || !qcData.check_date || !category || !productName || !qcData.final_qc_status) {
                    alert('❌ Please fill all required fields:\\n- QC Date\\n- Serial Number\\n- Category\\n- Product Name\\n- Final QC Status');
                    return;
                }
                
                const submitBtn = event.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                
                try {
                    const response = await axios.post('/api/inventory/quality-check-manual', qcData);
                    
                    if (response.data.success) {
                        alert(\`✅ QC Report Saved Successfully!\\n\\nSerial Number: \${qcData.device_serial_no}\\nCategory: \${category}\\nProduct: \${productName}\\nFinal Status: \${qcData.final_qc_status}\`);
                        closeUpdateQCModal();
                        loadQCData();
                    } else {
                        throw new Error(response.data.error || 'Submission failed');
                    }
                    
                } catch (error) {
                    console.error('Error submitting QC:', error);
                    alert('❌ Error saving QC report:\\n\\n' + (error.response?.data?.error || error.message));
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            }
            
            // Load QC summary counts and reports
            async function loadQCData() {
                try {
                    // Load all QC records
                    const response = await axios.get('/api/inventory/quality-checks');
                    if (!response.data.success) {
                        console.error('Failed to load QC data');
                        return;
                    }
                    
                    const qcRecords = response.data.data;
                    
                    // Calculate summary counts
                    let passCount = 0;
                    let failCount = 0;
                    let pendingCount = 0;
                    
                    qcRecords.forEach(record => {
                        const status = (record.pass_fail || '').toLowerCase();
                        if (status.includes('pass')) {
                            passCount++;
                        } else if (status.includes('fail')) {
                            failCount++;
                        } else {
                            pendingCount++;
                        }
                    });
                    
                    // Update summary cards
                    document.getElementById('qcPassCount').textContent = passCount;
                    document.getElementById('qcFailCount').textContent = failCount;
                    document.getElementById('qcPendingCount').textContent = pendingCount;
                    
                    // Display QC reports table
                    displayQCReports(qcRecords);
                    
                } catch (error) {
                    console.error('Error loading QC data:', error);
                }
            }
            
            // Display QC reports in table
            function displayQCReports(records) {
                const tbody = document.getElementById('qcReportsBody');
                
                if (!records || records.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="15" style="text-align: center; color: #9ca3af;">No QC records found</td></tr>';
                    return;
                }
                
                // Helper function to format date as DD-MMM-YY
                const formatQCDate = (dateStr) => {
                    if (!dateStr || dateStr === 'N/A' || dateStr === '-') return 'N/A';
                    const date = new Date(dateStr);
                    if (isNaN(date.getTime())) return dateStr;
                    
                    const day = String(date.getDate()).padStart(2, '0');
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const month = monthNames[date.getMonth()];
                    const year = String(date.getFullYear()).slice(-2);
                    
                    return \`\${day}-\${month}-\${year}\`;
                };
                
                // Apply current filter if set
                let filteredRecords = records;
                if (currentQCFilter) {
                    filteredRecords = records.filter(record => {
                        const status = (record.pass_fail || '').toLowerCase();
                        if (currentQCFilter === 'Pass') return status.includes('pass');
                        if (currentQCFilter === 'Fail') return status.includes('fail');
                        if (currentQCFilter === 'Pending') return !status.includes('pass') && !status.includes('fail');
                        return true;
                    });
                }
                
                tbody.innerHTML = filteredRecords.map((record, index) => {
                    // Parse test_results JSON if it exists
                    let testResults = {};
                    try {
                        if (record.test_results) {
                            testResults = typeof record.test_results === 'string' 
                                ? JSON.parse(record.test_results) 
                                : record.test_results;
                        }
                    } catch (e) {
                        console.error('Error parsing test_results:', e);
                    }
                    
                    // Display model_name from inventory JOIN or device_type from test_results
                    const deviceType = record.model_name || testResults.device_type || 'N/A';
                    
                    // Get QC parameter values - prioritize test_results JSON, then fall back to direct columns
                    const getQCValue = (jsonKey, columnKey) => {
                        const value = testResults[jsonKey] || record[columnKey] || '';
                        
                        if (!value || value === '' || value === null) return '-';
                        
                        // Display the actual status with styling
                        const valueLower = value.toLowerCase();
                        if (valueLower.includes('not applicable') || valueLower === 'n/a') {
                            return '<span style="color: #9ca3af; font-style: italic;">➖ N/A</span>';
                        }
                        if (valueLower.includes('pass') || valueLower === 'ok') {
                            return '<span style="color: #10b981; font-weight: 600;">✅ QC Pass</span>';
                        }
                        if (valueLower.includes('fail')) {
                            return '<span style="color: #ef4444; font-weight: 600;">❌ QC Fail</span>';
                        }
                        return value;
                    };
                    
                    // Determine final status badge color
                    const finalStatus = testResults.final_qc_status || record.final_status || record.pass_fail || 'Pending';
                    let statusColor = '#f59e0b'; // Pending/Unknown - yellow
                    if (finalStatus.toLowerCase().includes('pass')) statusColor = '#10b981'; // Pass - green
                    if (finalStatus.toLowerCase().includes('fail')) statusColor = '#ef4444'; // Fail - red
                    
                    // Get IP address and update status from test_results
                    const ipAddress = testResults.ip_address || record.ip_address || '-';
                    
                    return \`
                        <tr>
                            <td>\${index + 1}</td>
                            <td>\${formatQCDate(record.check_date)}</td>
                            <td><strong>\${record.device_serial_no}</strong></td>
                            <td>\${deviceType}</td>
                            <td>\${getQCValue('sd_connectivity', 'sd_connect')}</td>
                            <td>\${getQCValue('all_ch_status', 'all_ch_status')}</td>
                            <td>\${getQCValue('network_connectivity', 'network')}</td>
                            <td>\${getQCValue('gps_qc', 'gps')}</td>
                            <td>\${getQCValue('sim_card_slot', 'sim_slot')}</td>
                            <td>\${getQCValue('online_qc', 'online')}</td>
                            <td>\${getQCValue('camera_quality', 'camera_quality')}</td>
                            <td>\${getQCValue('monitor_qc_status', 'monitor')}</td>
                            <td><span style="background: \${statusColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600;">\${finalStatus}</span></td>
                            <td>\${ipAddress}</td>
                            <td>
                                <button onclick="deleteQCRecord(\${record.id})" class="btn-primary" style="background: #ef4444; padding: 4px 8px; font-size: 11px;" title="Delete QC Record">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    \`;
                }).join('');
            }
            
            // Filter QC report by status (called when clicking summary cards)
            function filterQCReport(status) {
                currentQCFilter = status;
                
                // Update card highlighting
                document.querySelectorAll('[onclick*="filterQCReport"]').forEach(card => {
                    card.style.opacity = '0.7';
                    card.style.transform = 'scale(1)';
                });
                
                const clickedCard = event.currentTarget;
                clickedCard.style.opacity = '1';
                clickedCard.style.transform = 'scale(1.05)';
                
                // Reload with filter
                loadQCData();
            }
            
            // Clear QC filter
            function clearQCFilter() {
                currentQCFilter = null;
                
                // Reset card highlighting
                document.querySelectorAll('[onclick*="filterQCReport"]').forEach(card => {
                    card.style.opacity = '1';
                    card.style.transform = 'scale(1)';
                });
                
                loadQCData();
            }
            
            // Delete QC Record
            async function deleteQCRecord(qcId) {
                if (!confirm('⚠️ Are you sure you want to delete this QC record?\\n\\nThis action cannot be undone.')) {
                    return;
                }
                
                try {
                    const response = await axios.delete(\`/api/inventory/quality-check/\${qcId}\`);
                    
                    if (response.data.success) {
                        alert('✅ QC record deleted successfully!');
                        loadQCData(); // Reload the table
                    } else {
                        throw new Error(response.data.error || 'Delete failed');
                    }
                } catch (error) {
                    console.error('Error deleting QC record:', error);
                    alert('❌ Error deleting QC record:\\n\\n' + (error.response?.data?.error || error.message));
                }
            }
            
            // Search QC reports
            async function searchQCReports() {
                const searchTerm = document.getElementById('qcSearchInput').value.toLowerCase();
                
                try {
                    const response = await axios.get('/api/inventory/quality-checks');
                    if (!response.data.success) return;
                    
                    let records = response.data.data;
                    
                    if (searchTerm) {
                        records = records.filter(record => {
                            const serialNo = (record.device_serial_no || '').toLowerCase();
                            const deviceType = (record.model_name || '').toLowerCase();
                            
                            let testResults = {};
                            try {
                                if (record.test_results) {
                                    testResults = JSON.parse(record.test_results);
                                }
                            } catch (e) {}
                            
                            const productName = (testResults.product_type || '').toLowerCase();
                            
                            return serialNo.includes(searchTerm) || 
                                   deviceType.includes(searchTerm) ||
                                   productName.includes(searchTerm);
                        });
                    }
                    
                    displayQCReports(records);
                    
                } catch (error) {
                    console.error('Error searching QC reports:', error);
                }
            }
            
            // Load device information when scanned
            async function loadDeviceForQC() {
                const serialNo = document.getElementById('qcScanInput').value.trim();
                
                if (!serialNo) {
                    alert('Please enter a device serial number');
                    return;
                }
                
                try {
                    // Get device from inventory
                    const response = await axios.get(\`/api/inventory/search?serial=\${serialNo}\`);
                    
                    if (!response.data.success || response.data.data.length === 0) {
                        alert('Device not found in inventory: ' + serialNo);
                        document.getElementById('qcScanInput').value = '';
                        return;
                    }
                    
                    const device = response.data.data[0];
                    currentQCDevice = device;
                    
                    // Auto-populate device info
                    document.getElementById('qcDeviceSerial').value = device.device_serial_no;
                    document.getElementById('qcDeviceType').value = device.model_name || 'N/A';
                    
                    // Clear scan input and focus on product type
                    document.getElementById('qcScanInput').value = '';
                    document.getElementById('qcProductType').focus();
                    
                    alert(\`Device loaded: \${device.model_name} - \${device.device_serial_no}\`);
                    
                } catch (error) {
                    console.error('Error loading device:', error);
                    alert('Error loading device: ' + (error.response?.data?.error || error.message));
                }
            }
            
            // Show QC form based on product type
            function showQCForm() {
                const productType = document.getElementById('qcProductType').value;
                const fieldsContainer = document.getElementById('qcTestFields');
                
                if (!productType) {
                    fieldsContainer.innerHTML = '';
                    document.getElementById('finalQCStatus').innerHTML = '';
                    return;
                }
                
                let formHTML = '';
                
                if (productType === 'mdvr_without_4g') {
                    formHTML = \`
                        <div class="form-group">
                            <label>SD Connectivity *</label>
                            <select id="qc_sd_connectivity" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>All Channels Working *</label>
                            <select id="qc_all_channels" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                    \`;
                } else if (productType === 'mdvr_with_4g') {
                    formHTML = \`
                        <div class="form-group">
                            <label>SD Connectivity *</label>
                            <select id="qc_sd_connectivity" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>All Channels Working *</label>
                            <select id="qc_all_channels" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Network Connectivity *</label>
                            <select id="qc_network_connectivity" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>GPS Connectivity *</label>
                            <select id="qc_gps_connectivity" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>SIM Card Slot Read *</label>
                            <select id="qc_sim_card_slot" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Online Status *</label>
                            <select id="qc_online_status" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>IP Address (Optional)</label>
                            <input type="text" id="qc_ip_address" placeholder="e.g., 192.168.1.100">
                        </div>
                    \`;
                } else if (productType === 'camera') {
                    formHTML = \`
                        <div class="form-group">
                            <label>Camera Quality *</label>
                            <select id="qc_camera_quality" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                    \`;
                } else if (productType === 'monitor') {
                    formHTML = \`
                        <div class="form-group">
                            <label>Colour Resolution *</label>
                            <select id="qc_colour_resolution" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>All Buttons Working *</label>
                            <select id="qc_all_buttons" class="qc-test-field" onchange="calculateFinalQCStatus()">
                                <option value="">Select</option>
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                            </select>
                        </div>
                    \`;
                }
                
                fieldsContainer.innerHTML = formHTML;
                document.getElementById('finalQCStatus').innerHTML = '';
            }
            
            // Calculate final QC status automatically
            function calculateFinalQCStatus() {
                const testFields = document.querySelectorAll('.qc-test-field');
                
                if (testFields.length === 0) {
                    document.getElementById('finalQCStatus').innerHTML = '';
                    return;
                }
                
                let allPass = true;
                let anyFail = false;
                let allFilled = true;
                
                testFields.forEach(field => {
                    const value = field.value;
                    if (!value) {
                        allFilled = false;
                    } else if (value === 'Fail') {
                        anyFail = true;
                        allPass = false;
                    } else if (value !== 'Pass') {
                        allPass = false;
                    }
                });
                
                if (!allFilled) {
                    document.getElementById('finalQCStatus').innerHTML = \`
                        <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; margin-top: 20px;">
                            <strong style="color: #d97706;">⏳ Pending:</strong> Please complete all test fields
                        </div>
                    \`;
                    return;
                }
                
                let statusHTML = '';
                if (anyFail) {
                    statusHTML = \`
                        <div style="background: #fee2e2; border: 1px solid #ef4444; padding: 15px; border-radius: 8px; margin-top: 20px;">
                            <strong style="color: #dc2626; font-size: 16px;">❌ Final QC Status: FAIL</strong>
                            <p style="margin: 8px 0 0 0; color: #991b1b;">One or more parameters failed quality check</p>
                        </div>
                    \`;
                } else if (allPass) {
                    statusHTML = \`
                        <div style="background: #d1fae5; border: 1px solid #10b981; padding: 15px; border-radius: 8px; margin-top: 20px;">
                            <strong style="color: #059669; font-size: 16px;">✅ Final QC Status: PASS</strong>
                            <p style="margin: 8px 0 0 0; color: #065f46;">All parameters passed quality check</p>
                        </div>
                    \`;
                }
                
                document.getElementById('finalQCStatus').innerHTML = statusHTML;
            }
            
            // Submit new QC record
            async function submitNewQC(event) {
                event.preventDefault();
                
                const deviceSerial = document.getElementById('qcDeviceSerial').value.trim();
                const productType = document.getElementById('qcProductType').value;
                const checkedBy = document.getElementById('qcCheckedBy').value.trim();
                
                if (!deviceSerial || !productType || !checkedBy) {
                    alert('Please fill in all required fields');
                    return;
                }
                
                // Collect test results based on product type
                const testResults = {
                    product_type: productType
                };
                
                // Get all test field values
                const testFields = document.querySelectorAll('.qc-test-field');
                let allFieldsFilled = true;
                
                testFields.forEach(field => {
                    const fieldName = field.id.replace('qc_', '');
                    const value = field.value;
                    
                    if (!value) {
                        allFieldsFilled = false;
                    }
                    
                    testResults[fieldName] = value;
                });
                
                if (!allFieldsFilled) {
                    alert('Please complete all test fields before submitting');
                    return;
                }
                
                // Get IP address if provided
                const ipAddress = document.getElementById('qc_ip_address');
                if (ipAddress && ipAddress.value) {
                    testResults.ip_address = ipAddress.value;
                }
                
                // Calculate final status
                let finalStatus = 'QC Pass';
                testFields.forEach(field => {
                    if (field.value === 'Fail') {
                        finalStatus = 'QC Fail';
                    }
                });
                
                const submitBtn = event.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
                
                try {
                    const response = await axios.post('/api/inventory/quality-check', {
                        device_serial_no: deviceSerial,
                        pass_fail: finalStatus,
                        checked_by: checkedBy,
                        test_results: JSON.stringify(testResults),
                        remarks: \`Product Type: \${productType}\`
                    });
                    
                    if (response.data.success) {
                        alert('QC record submitted successfully!');
                        
                        // Reset form
                        event.target.reset();
                        currentQCDevice = null;
                        document.getElementById('qcTestFields').innerHTML = '';
                        document.getElementById('finalQCStatus').innerHTML = '';
                        
                        // Reload QC data
                        loadQCData();
                        
                        // Focus back on scan input
                        document.getElementById('qcScanInput').focus();
                    } else {
                        throw new Error(response.data.error || 'Submission failed');
                    }
                    
                } catch (error) {
                    console.error('Error submitting QC:', error);
                    alert('Error submitting QC: ' + (error.response?.data?.error || error.message));
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            }
            
            // ===================================================================
            // END OF NEW QC SYSTEM FUNCTIONS
            // ===================================================================
            
            // ===================================================================
            // ADD INVENTORY MODAL FUNCTIONS - BULK ENTRY
            // ===================================================================
            
            // Complete product catalog from sale form
            const inventoryProductCatalog = {
                'MDVR': [
                    '4ch 1080p SD Card MDVR (MR9504EC)',
                    '4ch 1080p HDD MDVR (MR9704C)',
                    '4ch 1080p SD, 4G, GPS MDVR (MR9504E)',
                    '4ch 1080p SD, 4G, GPS MDVR (MR9504E-A3)',
                    '4ch 1080p HDD, 4G, GPS MDVR (MR9704E)',
                    'TVS 4ch 1080p SD, 4G, GPS MDVR',
                    '5ch MDVR SD 4g + GPS + LAN + RS232 + RS485',
                    '5ch MDVR HDD 4g + GPS + LAN + RS232 + RS485',
                    '4ch 1080p SD, 4G, wifi, GPS MDVR (MA9504ED)',
                    'AI MDVR with (DSM + ADAS) (SD+ 4g + GPS)',
                    'AI MDVR with (DSM + ADAS) (SD+HDD+ 4g + GPS)'
                ],
                'Monitor & Monitor Kit': [
                    '7 " AV Monitor',
                    '7" VGA Monitor',
                    '7" HDMI Monitor',
                    '7 inch Heavy Duty VGA Monitor',
                    '4k Recording monitor kit 2ch',
                    '4 inch AV monitor',
                    '720 2ch Recording Monitor Kit',
                    '4k Recording monitor kit 4ch'
                ],
                'Dashcam': [
                    '4 Inch 2 Ch Dashcam',
                    '10 inch 2 Ch Full Touch Dashcam',
                    '10 inch 2 Ch 4g, GPS, Android Dashcam',
                    '4k Dashcam 12 inch',
                    '2k 12 inch Dashcam',
                    '2ch 4g Dashcam MT95L',
                    '3ch AI Dashcam ADAS + DSM (MT95C)',
                    'wifi Dash Cam',
                    '4 inch 3 camera Dash Cam',
                    '4 inch Android Dashcam',
                    '3ch 4g Dashcam with Rear Camera (MT95L-A3)',
                    '3ch AI Dashcam ADAS + DSM (MT95C)'
                ],
                'Cameras': [
                    '2 MP IR indoor Dome Camera',
                    '2 MP IR Outdoor Bullet Camera',
                    '2 MP Heavy Duty Bullet Camera',
                    '2 MP Heavy Duty Dome Camera',
                    'PTZ Camera',
                    '4k Monitor Camera',
                    '2 MP IP Camera',
                    'Replacement Bullet Camera 2mp',
                    'Replacement Dome Camera 2 mp',
                    'Replacement Dome Audio Camera',
                    'Reverse Camera',
                    '2mp IR Audio Camera',
                    'DFMS Camera',
                    'ADAS Camera',
                    'BSD Camera',
                    '2mp IP Dome Audio Camera'
                ],
                'Storage': [
                    'Surveillance Grade 64GB SD Card',
                    'Surveillance Grade 128GB SD Card',
                    'Surveillance Grade 256GB SD Card',
                    'Surveillance Grade 512GB SD Card',
                    'HDD 1 TB'
                ],
                'RFID Tags': [
                    '2.4G RFID Animal Ear Tag',
                    '2.4G Active Tag (Card Type) HX607'
                ],
                'RFID Reader': [
                    '2.4 GHZ RFID Active Reader (Bus)',
                    '2.4 GHZ RFID Active Reader (Campus)',
                    '2.4G IOT Smart RFID Reader (ZR7901P)'
                ],
                'MDVR Accessories': [
                    'MDVR Security Box',
                    '2 way Communication Device',
                    'MDVR Maintenance Tool',
                    'MDVR Remote',
                    'MDVR Panic Button',
                    'MDVR Server',
                    'RS 232 Adaptor',
                    '1mt Cable',
                    '3mt Cable',
                    '5mt Cable',
                    '10mt Cable',
                    '15mt Cable',
                    'Alcohol Tester',
                    'VGA Cable',
                    'Ultra Sonic Fuel Sensor',
                    'Rod Type Fuel Sensor'
                ],
                'Other product and Accessories': [
                    'Leaser Printer',
                    'D link Wire Bundle',
                    'Wireless Receiver Transmitter',
                    'Parking Sensor',
                    'MDVR Installation',
                    'GPS Installation',
                    'Annual Maintenance Charges'
                ]
            };
            
            let bulkInventoryRows = [];
            let rowCounter = 0;
            
            // Open Add Inventory Modal - Bulk Entry
            function openAddInventoryModal() {
                document.getElementById('addInventoryModal').classList.add('show');
                bulkInventoryRows = [];
                rowCounter = 0;
                
                // Add first row
                addInventoryRow();
            }
            
            // Close Add Inventory Modal
            function closeAddInventoryModal() {
                document.getElementById('addInventoryModal').classList.remove('show');
                bulkInventoryRows = [];
                document.getElementById('bulkInventoryTable').innerHTML = '';
            }
            
            // Add a new inventory row
            function addInventoryRow() {
                rowCounter++;
                const today = new Date().toISOString().split('T')[0];
                const rowId = 'invRow_' + rowCounter;
                
                const tbody = document.getElementById('bulkInventoryTable');
                const row = document.createElement('tr');
                row.id = rowId;
                row.innerHTML = \`
                    <td>
                        <input type="text" id="\${rowId}_serial" 
                            placeholder="Scan barcode..." 
                            onkeypress="if(event.key==='Enter'){event.preventDefault(); document.getElementById('\${rowId}_category').focus();}"
                            style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 4px;">
                    </td>
                    <td>
                        <select id="\${rowId}_category" onchange="loadRowProducts('\${rowId}')" 
                            style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 4px;">
                            <option value="">-- Select --</option>
                            <option value="MDVR">MDVR</option>
                            <option value="Monitor & Monitor Kit">Monitor & Monitor Kit</option>
                            <option value="Dashcam">Dashcam</option>
                            <option value="Cameras">Cameras</option>
                            <option value="Storage">Storage</option>
                            <option value="RFID Tags">RFID Tags</option>
                            <option value="RFID Reader">RFID Reader</option>
                            <option value="MDVR Accessories">MDVR Accessories</option>
                            <option value="Other product and Accessories">Other product and Accessories</option>
                        </select>
                    </td>
                    <td>
                        <select id="\${rowId}_product" 
                            onkeypress="if(event.key==='Enter'){event.preventDefault(); addInventoryRow();}"
                            style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 4px;">
                            <option value="">-- Select Category First --</option>
                        </select>
                    </td>
                    <td>
                        <input type="date" id="\${rowId}_date" value="\${today}" 
                            style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 4px;">
                    </td>
                    <td style="text-align: center;">
                        <button type="button" onclick="removeInventoryRow('\${rowId}')" 
                            class="btn-danger" style="padding: 6px 10px; font-size: 12px;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                \`;
                
                tbody.appendChild(row);
                
                // Focus on serial number field of new row
                document.getElementById(\`\${rowId}_serial\`).focus();
            }
            
            // Load products for a specific row based on category
            function loadRowProducts(rowId) {
                const categorySelect = document.getElementById(\`\${rowId}_category\`);
                const productSelect = document.getElementById(\`\${rowId}_product\`);
                const category = categorySelect.value;
                
                productSelect.innerHTML = '<option value="">-- Select Product --</option>';
                
                if (category && inventoryProductCatalog[category]) {
                    inventoryProductCatalog[category].forEach(product => {
                        const option = document.createElement('option');
                        option.value = product;
                        option.textContent = product;
                        productSelect.appendChild(option);
                    });
                    
                    // Focus on product select after loading
                    productSelect.focus();
                }
            }
            
            // Remove inventory row
            function removeInventoryRow(rowId) {
                const row = document.getElementById(rowId);
                if (row) {
                    row.remove();
                }
                
                // If no rows left, add one
                const tbody = document.getElementById('bulkInventoryTable');
                if (tbody.children.length === 0) {
                    addInventoryRow();
                }
            }
            
            // Submit Bulk Inventory
            async function submitBulkInventory() {
                const tbody = document.getElementById('bulkInventoryTable');
                const rows = tbody.querySelectorAll('tr');
                
                if (rows.length === 0) {
                    alert('Please add at least one device');
                    return;
                }
                
                // Collect all row data
                const devices = [];
                let hasErrors = false;
                
                rows.forEach((row, index) => {
                    const rowId = row.id;
                    const serial = document.getElementById(\`\${rowId}_serial\`).value.trim();
                    const category = document.getElementById(\`\${rowId}_category\`).value;
                    const product = document.getElementById(\`\${rowId}_product\`).value;
                    const date = document.getElementById(\`\${rowId}_date\`).value;
                    
                    if (!serial || !category || !product || !date) {
                        hasErrors = true;
                        row.style.background = '#fee2e2';
                        return;
                    }
                    
                    row.style.background = '';
                    devices.push({
                        device_serial_no: serial,
                        model_name: product,
                        category: category,
                        status: 'In Stock',
                        in_date: date,
                        added_by: currentUser.employeeName || currentUser.fullName
                    });
                });
                
                if (hasErrors) {
                    alert('❌ Please fill in all required fields (highlighted in red)');
                    return;
                }
                
                if (devices.length === 0) {
                    alert('No valid devices to add');
                    return;
                }
                
                // Confirm submission
                if (!confirm(\`Are you sure you want to add \${devices.length} device(s) to inventory?\`)) {
                    return;
                }
                
                // Disable submit button
                const submitBtn = event.target;
                const originalText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding ' + devices.length + ' devices...';
                
                try {
                    const response = await axios.post('/api/inventory/add-bulk', {
                        devices: devices
                    });
                    
                    if (response.data.success) {
                        alert(\`✅ Successfully Added!\\n\\n\${response.data.data.added} devices added to inventory\\n\${response.data.data.duplicates} duplicates skipped\`);
                        closeAddInventoryModal();
                        loadInventory();
                    } else {
                        throw new Error(response.data.error || 'Failed to add inventory');
                    }
                    
                } catch (error) {
                    console.error('Error adding bulk inventory:', error);
                    alert('Error: ' + (error.response?.data?.error || error.message));
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            }
            
            // ===================================================================
            // EXCEL EXPORT FUNCTIONS
            // ===================================================================
            
            // Export Inventory to Excel
            async function exportInventoryToExcel() {
                try {
                    const response = await axios.get('/api/inventory');
                    if (!response.data.success || !response.data.data) {
                        alert('No data to export');
                        return;
                    }
                    
                    const data = response.data.data;
                    
                    // Prepare data for Excel
                    const excelData = data.map((item, index) => ({
                        'S. No': index + 1,
                        'Serial Number': item.device_serial_no,
                        'Model Name': item.model_name || 'N/A',
                        'Status': item.status,
                        'In Date': item.in_date || 'N/A',
                        'Customer': item.customer_name || '-',
                        'Dispatch Date': item.dispatch_date || '-',
                        'Location': item.location || '-',
                        'Order ID': item.notes || '-'
                    }));
                    
                    // Create worksheet
                    const ws = XLSX.utils.json_to_sheet(excelData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
                    
                    // Download
                    const timestamp = new Date().toISOString().split('T')[0];
                    XLSX.writeFile(wb, \`Inventory_\${timestamp}.xlsx\`);
                    
                } catch (error) {
                    console.error('Export error:', error);
                    alert('Failed to export: ' + error.message);
                }
            }
            
            // Export Dispatch to Excel
            async function exportDispatchToExcel() {
                try {
                    const response = await axios.get('/api/inventory/dispatches');
                    if (!response.data.success || !response.data.data) {
                        alert('No data to export');
                        return;
                    }
                    
                    const data = response.data.data;
                    
                    // Prepare data for Excel
                    const excelData = data.map((item, index) => ({
                        'S. No': index + 1,
                        'Date': item.dispatch_date || 'N/A',
                        'Serial Number': item.device_serial_no,
                        'Model': item.model_name || 'N/A',
                        'Customer': item.customer_name || 'N/A',
                        'Code': item.customer_code || '-',
                        'Mobile': item.customer_contact || '-',
                        'City': item.customer_city || '-',
                        'Courier': item.courier_name || '-',
                        'Tracking': item.tracking_number || '-',
                        'Order ID': item.order_id || '-',
                        'Dispatched By': item.dispatched_by || 'N/A',
                        'Notes': item.notes || '-'
                    }));
                    
                    // Create worksheet
                    const ws = XLSX.utils.json_to_sheet(excelData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Dispatch Records');
                    
                    // Download
                    const timestamp = new Date().toISOString().split('T')[0];
                    XLSX.writeFile(wb, \`Dispatch_Records_\${timestamp}.xlsx\`);
                    
                } catch (error) {
                    console.error('Export error:', error);
                    alert('Failed to export: ' + error.message);
                }
            }
            
            // Export QC to Excel
            async function exportQCToExcel() {
                try {
                    const response = await axios.get('/api/inventory/quality-checks');
                    if (!response.data.success || !response.data.data) {
                        alert('No data to export');
                        return;
                    }
                    
                    const data = response.data.data;
                    
                    // Prepare data for Excel
                    const excelData = data.map((item, index) => {
                        let testResults = {};
                        try {
                            if (item.test_results) {
                                testResults = JSON.parse(item.test_results);
                            }
                        } catch (e) {}
                        
                        return {
                            'S. No': index + 1,
                            'QC Date': item.check_date || 'N/A',
                            'Serial Number': item.device_serial_no,
                            'Device Type': item.model_name || testResults.product_name || testResults.product_type || 'N/A',
                            'SD Connect': testResults.sd_connectivity || '-',
                            'All Channels': testResults.all_channels || '-',
                            'Network': testResults.network_connectivity || '-',
                            'GPS': testResults.gps_connectivity || '-',
                            'SIM Slot': testResults.sim_card_slot || '-',
                            'Online': testResults.online_status || '-',
                            'Camera Quality': testResults.camera_quality || '-',
                            'Monitor': testResults.monitor_status || '-',
                            'Final Status': item.pass_fail || 'Pending',
                            'IP Address': testResults.ip_address || '-',
                            'Checked By': item.checked_by || 'N/A'
                        };
                    });
                    
                    // Create worksheet
                    const ws = XLSX.utils.json_to_sheet(excelData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'QC Reports');
                    
                    // Download
                    const timestamp = new Date().toISOString().split('T')[0];
                    XLSX.writeFile(wb, \`QC_Reports_\${timestamp}.xlsx\`);
                    
                } catch (error) {
                    console.error('Export error:', error);
                    alert('Failed to export: ' + error.message);
                }
            }
            
            // ===================================================================
            // END OF EXPORT FUNCTIONS
            // ===================================================================
            
            // ===================================================================
            // RENEWAL TRACKING FUNCTIONS
            // ===================================================================
            
            let currentRenewalTab = 'cmr';
            let renewalData = [];
            
            // Switch renewal tab
            function switchRenewalTab(tab) {
                currentRenewalTab = tab;
                
                // Update tab styles
                const tabs = ['cmr', 'c1', 'c2', 'c3'];
                tabs.forEach(t => {
                    const btn = document.getElementById(t + 'Tab');
                    if (t === tab) {
                        btn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
                        btn.style.color = 'white';
                        btn.style.borderBottom = '3px solid #2563eb';
                    } else {
                        btn.style.background = '#f3f4f6';
                        btn.style.color = '#6b7280';
                        btn.style.borderBottom = 'none';
                    }
                });
                
                // Reload data
                displayRenewalData();
            }
            
            // Load renewal data
            async function loadRenewalData() {
                try {
                    const response = await axios.get('/api/renewals');
                    
                    if (!response.data.success) {
                        throw new Error(response.data.error || 'Failed to load renewal data');
                    }
                    
                    renewalData = response.data.data;
                    displayRenewalData();
                } catch (error) {
                    console.error('Load renewal error:', error);
                    document.getElementById('renewalTableBody').innerHTML = 
                        '<tr><td colspan="8" style="text-align: center; color: #ef4444;">Error loading renewal data: ' + error.message + '</td></tr>';
                }
            }
            
            // Display renewal data
            function displayRenewalData() {
                const tbody = document.getElementById('renewalTableBody');
                
                if (!renewalData || renewalData.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #9ca3af;">No renewal data available</td></tr>';
                    return;
                }
                
                tbody.innerHTML = renewalData.map((customer, index) => {
                    const cmrCount = customer.cmr.length;
                    const c1Count = customer.c1.length;
                    const c2Count = customer.c2.length;
                    const c3Count = customer.c3.length;
                    const total = customer.total;
                    
                    return \`
                        <tr>
                            <td>\${index + 1}</td>
                            <td><strong>\${customer.cust_code}</strong></td>
                            <td>\${customer.customer_name}</td>
                            <td style="text-align: center; cursor: pointer; background: #dbeafe;" 
                                onclick="showRenewalDevices('\${customer.cust_code}', 'cmr', '\${customer.customer_name}')">
                                <span style="font-weight: 700; color: #1e40af; font-size: 16px;">
                                    \${cmrCount > 0 ? cmrCount : '-'}
                                </span>
                            </td>
                            <td style="text-align: center; cursor: pointer; background: #fef3c7;" 
                                onclick="showRenewalDevices('\${customer.cust_code}', 'c1', '\${customer.customer_name}')">
                                <span style="font-weight: 700; color: #92400e; font-size: 16px;">
                                    \${c1Count > 0 ? c1Count : '-'}
                                </span>
                            </td>
                            <td style="text-align: center; cursor: pointer; background: #d1fae5;" 
                                onclick="showRenewalDevices('\${customer.cust_code}', 'c2', '\${customer.customer_name}')">
                                <span style="font-weight: 700; color: #065f46; font-size: 16px;">
                                    \${c2Count > 0 ? c2Count : '-'}
                                </span>
                            </td>
                            <td style="text-align: center; cursor: pointer; background: #e0e7ff;" 
                                onclick="showRenewalDevices('\${customer.cust_code}', 'c3', '\${customer.customer_name}')">
                                <span style="font-weight: 700; color: #3730a3; font-size: 16px;">
                                    \${c3Count > 0 ? c3Count : '-'}
                                </span>
                            </td>
                            <td style="text-align: center; background: #f3f4f6;">
                                <strong style="font-size: 16px;">\${total}</strong>
                            </td>
                        </tr>
                    \`;
                }).join('');
            }
            
            // Show device details modal for renewal period
            function showRenewalDevices(custCode, period, customerName) {
                const customer = renewalData.find(c => c.cust_code === custCode);
                if (!customer) return;
                
                const devices = customer[period];
                if (!devices || devices.length === 0) {
                    alert('No devices in this period');
                    return;
                }
                
                const periodNames = {
                    cmr: 'CMR (Due Now)',
                    c1: 'C+1 (1 Month Away)',
                    c2: 'C+2 (2 Months Away)',
                    c3: 'C+3 (3 Months Away)'
                };
                
                const modalHTML = \`
                    <div id="renewalDevicesModal" class="modal" style="display: flex;">
                        <div class="modal-content" style="max-width: 900px; max-height: 80vh; overflow-y: auto;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <div>
                                    <h2 style="font-size: 20px; font-weight: 700; color: #1f2937; margin-bottom: 5px;">
                                        <i class="fas fa-list"></i> Renewal Devices - \${periodNames[period]}
                                    </h2>
                                    <p style="color: #6b7280; font-size: 14px; margin: 0;">
                                        Customer: <strong>\${customerName}</strong> (Code: \${custCode})
                                    </p>
                                </div>
                                <button onclick="closeRenewalDevicesModal()" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
                                    <i class="fas fa-times"></i> Close
                                </button>
                            </div>
                            
                            <div class="table-container">
                                <table style="width: 100%;">
                                    <thead>
                                        <tr>
                                            <th>S. No</th>
                                            <th>Device Serial No</th>
                                            <th>Model Name</th>
                                            <th>Dispatch Date</th>
                                            <th>CMR Date</th>
                                            <th>Order ID</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        \${devices.map((device, index) => \`
                                            <tr>
                                                <td>\${index + 1}</td>
                                                <td><strong>\${device.device_serial_no}</strong></td>
                                                <td>\${device.model_name}</td>
                                                <td>\${device.dispatch_date}</td>
                                                <td style="font-weight: 600; color: #ef4444;">\${device.cmr_date}</td>
                                                <td>\${device.order_id || '-'}</td>
                                            </tr>
                                        \`).join('')}
                                    </tbody>
                                </table>
                            </div>
                            
                            <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px;">
                                <strong>Total Devices: \${devices.length}</strong>
                            </div>
                        </div>
                    </div>
                \`;
                
                // Remove existing modal if any
                const existingModal = document.getElementById('renewalDevicesModal');
                if (existingModal) existingModal.remove();
                
                // Add modal to body
                document.body.insertAdjacentHTML('beforeend', modalHTML);
            }
            
            // Close renewal devices modal
            function closeRenewalDevicesModal() {
                const modal = document.getElementById('renewalDevicesModal');
                if (modal) modal.remove();
            }
            
            // ===================================================================
            // END OF RENEWAL TRACKING FUNCTIONS
            // ===================================================================
            

            // ===================================================================
            // END OF INVENTORY MANAGEMENT FUNCTIONS
            // ===================================================================
        </script>
        </div>
    </body>
    </html>
  `)
})

export default app
