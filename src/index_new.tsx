import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// API Routes

app.get('/api/dashboard/summary', async (c) => {
  const { env } = c;
  
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
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
    
    const salesWithDetails = await Promise.all(sales.results.map(async (sale: any) => {
      const items = await env.DB.prepare(`
        SELECT * FROM sale_items WHERE sale_id = ?
      `).bind(sale.id).all();
      
      const payments = await env.DB.prepare(`
        SELECT * FROM payment_history WHERE sale_id = ? ORDER BY payment_date DESC
      `).bind(sale.id).all();
      
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

app.get('/api/sales', async (c) => {
  const { env } = c;
  
  try {
    const sales = await env.DB.prepare(`
      SELECT * FROM sales
      ORDER BY sale_date DESC
      LIMIT 1000
    `).all();
    
    const salesWithDetails = await Promise.all(sales.results.map(async (sale: any) => {
      const items = await env.DB.prepare(`
        SELECT * FROM sale_items WHERE sale_id = ?
      `).bind(sale.id).all();
      
      return {
        ...sale,
        items: items.results
      };
    }));
    
    return c.json({ success: true, data: salesWithDetails });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch sales' }, 500);
  }
});

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
    
    let subtotal = 0;
    items.forEach((item: any) => {
      subtotal += item.quantity * item.unit_price;
    });
    
    const gst_amount = sale_type === 'With' ? (subtotal + courier_cost) * 0.18 : 0;
    const total_amount = subtotal + courier_cost + gst_amount;
    const balance_amount = total_amount - amount_received;
    
    const timestamp = Date.now();
    const order_id = `ORD${timestamp.toString().slice(-8)}`;
    
    const saleResult = await env.DB.prepare(`
      INSERT INTO sales (
        order_id, customer_code, customer_name, company_name, customer_contact, sale_date, employee_name,
        sale_type, courier_cost, amount_received, account_received,
        payment_reference, remarks, subtotal, gst_amount, total_amount, balance_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      order_id, customer_code, customer_name, company_name, customer_contact, sale_date, employee_name,
      sale_type, courier_cost, amount_received, account_received,
      payment_reference, remarks, subtotal, gst_amount, total_amount, balance_amount
    ).run();
    
    const sale_id = saleResult.meta.last_row_id;
    
    for (const item of items) {
      if (item.product_name && item.quantity > 0 && item.unit_price > 0) {
        const item_total = item.quantity * item.unit_price;
        await env.DB.prepare(`
          INSERT INTO sale_items (sale_id, product_name, quantity, unit_price, total_price)
          VALUES (?, ?, ?, ?, ?)
        `).bind(sale_id, item.product_name, item.quantity, item.unit_price, item_total).run();
      }
    }
    
    if (amount_received > 0) {
      await env.DB.prepare(`
        INSERT INTO payment_history (sale_id, order_id, payment_date, amount, payment_reference, account_received)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(sale_id, order_id, sale_date, amount_received, payment_reference, account_received).run();
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

app.post('/api/sales/balance-payment', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { order_id, payment_date, amount, payment_reference, account_received } = body;
    
    const sale = await env.DB.prepare(`
      SELECT * FROM sales WHERE order_id = ?
    `).bind(order_id).first();
    
    if (!sale) {
      return c.json({ success: false, error: 'Order not found' }, 404);
    }
    
    const new_amount_received = sale.amount_received + amount;
    const new_balance = sale.total_amount - new_amount_received;
    
    await env.DB.prepare(`
      UPDATE sales 
      SET amount_received = ?, balance_amount = ?, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `).bind(new_amount_received, new_balance, order_id).run();
    
    await env.DB.prepare(`
      INSERT INTO payment_history (sale_id, order_id, payment_date, amount, payment_reference, account_received)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(sale.id, order_id, payment_date, amount, payment_reference, account_received).run();
    
    return c.json({ success: true, message: 'Payment updated successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update payment' }, 500);
  }
});

app.get('/api/customers/search', async (c) => {
  const { env } = c;
  const query = c.req.query('q');
  
  if (!query) {
    return c.json({ success: false, error: 'Search query required' }, 400);
  }
  
  try {
    const sales = await env.DB.prepare(`
      SELECT DISTINCT customer_code, customer_name, company_name, customer_contact
      FROM sales
      WHERE customer_code LIKE ? OR customer_contact LIKE ?
      LIMIT 10
    `).bind(`%${query}%`, `%${query}%`).all();
    
    return c.json({ success: true, data: sales.results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to search customers' }, 500);
  }
});

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

app.post('/api/leads', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const {
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
        customer_name, mobile_number, alternate_mobile, location,
        company_name, gst_number, email, complete_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      customer_name, mobile_number, alternate_mobile || null, location || null,
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

export default app
