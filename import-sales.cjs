// Import sales data from CSV to production database
const fs = require('fs');
const readline = require('readline');

// Parse Indian currency format
function parseAmount(value) {
  if (!value) return 0;
  // Remove ₹, spaces, commas, and parentheses
  const cleaned = value.replace(/[₹,\s()]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Parse date from format 25/10/04 23:05 to ISO format
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  // Format: YY/MM/DD HH:MM
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  if (match) {
    const [_, year, month, day, hour, minute] = match;
    // Convert YY to 20YY
    const fullYear = `20${year}`;
    // Return ISO format: 2025-10-04 23:05:00
    return `${fullYear}-${month}-${day} ${hour}:${minute}:00`;
  }
  
  return null;
}

// Map employee names
function mapEmployeeName(name) {
  if (!name) return 'Unknown';
  const lower = name.toLowerCase();
  if (lower.includes('akash')) return 'Akash Parashar';
  if (lower.includes('mandeep')) return 'Mandeep Samal';
  if (lower.includes('smruti')) return 'Smruti Ranjan Nayak';
  return name;
}

async function main() {
  const fileStream = fs.createReadStream('/tmp/sales.csv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let isFirstLine = true;
  const salesData = [];

  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    // Skip empty lines or lines with no Order ID
    const columns = line.split(',');
    if (columns.length < 10 || !columns[2] || columns[2].trim() === '') {
      continue;
    }

    // Parse CSV line (handle quoted values with commas)
    const values = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());

    // Extract sale data
    const orderId = values[2];
    const saleDate = parseDate(values[3]);
    const customerCode = values[4];
    const saleBy = mapEmployeeName(values[5]);
    const companyName = values[6];
    const customerName = values[7];
    const mobileNumber = values[8];
    const billAmount = parseAmount(values[9]);
    const amountReceived = parseAmount(values[10]);
    const balancePayment = parseAmount(values[11]);
    const roundOff = parseAmount(values[12]);
    const withBill = values[14] === 'With Bill' ? 1 : 0;
    const courier = parseAmount(values[59]);
    const totalSaleAmount = parseAmount(values[60]);
    const remarks = values[62];

    // Skip if no valid date or order ID
    if (!saleDate || !orderId) {
      continue;
    }

    // Collect products
    const products = [];
    
    // Product 1: columns 17-20 (P1 Code, 1st Product, P1 Qtty, P1 Rate)
    if (values[18] && values[19] && values[20]) {
      const qty = parseInt(values[19]) || 0;
      const rate = parseAmount(values[20]);
      if (qty > 0 && rate > 0) {
        products.push({
          code: values[17] || '',
          name: values[18],
          quantity: qty,
          rate: rate,
          subtotal: qty * rate
        });
      }
    }

    // Product 2: columns 22-25
    if (values[23] && values[24] && values[25]) {
      const qty = parseInt(values[24]) || 0;
      const rate = parseAmount(values[25]);
      if (qty > 0 && rate > 0) {
        products.push({
          code: values[22] || '',
          name: values[23],
          quantity: qty,
          rate: rate,
          subtotal: qty * rate
        });
      }
    }

    // Product 3: columns 27-30
    if (values[28] && values[29] && values[30]) {
      const qty = parseInt(values[29]) || 0;
      const rate = parseAmount(values[30]);
      if (qty > 0 && rate > 0) {
        products.push({
          code: values[27] || '',
          name: values[28],
          quantity: qty,
          rate: rate,
          subtotal: qty * rate
        });
      }
    }

    // Product 4: columns 32-35
    if (values[33] && values[34] && values[35]) {
      const qty = parseInt(values[34]) || 0;
      const rate = parseAmount(values[35]);
      if (qty > 0 && rate > 0) {
        products.push({
          code: values[32] || '',
          name: values[33],
          quantity: qty,
          rate: rate,
          subtotal: qty * rate
        });
      }
    }

    // Product 5: columns 37-40
    if (values[38] && values[39] && values[40]) {
      const qty = parseInt(values[39]) || 0;
      const rate = parseAmount(values[40]);
      if (qty > 0 && rate > 0) {
        products.push({
          code: values[37] || '',
          name: values[38],
          quantity: qty,
          rate: rate,
          subtotal: qty * rate
        });
      }
    }

    // Product 6: columns 42-45
    if (values[43] && values[44] && values[45]) {
      const qty = parseInt(values[44]) || 0;
      const rate = parseAmount(values[45]);
      if (qty > 0 && rate > 0) {
        products.push({
          code: values[42] || '',
          name: values[43],
          quantity: qty,
          rate: rate,
          subtotal: qty * rate
        });
      }
    }

    // Product 7: columns 46-48 (no code column)
    if (values[46] && values[47] && values[48]) {
      const qty = parseInt(values[47]) || 0;
      const rate = parseAmount(values[48]);
      if (qty > 0 && rate > 0) {
        products.push({
          code: '',
          name: values[46],
          quantity: qty,
          rate: rate,
          subtotal: qty * rate
        });
      }
    }

    // Calculate subtotal from products
    const productsSubtotal = products.reduce((sum, p) => sum + p.subtotal, 0);
    const subtotal = productsSubtotal > 0 ? productsSubtotal : totalSaleAmount;

    // Calculate total_amount (subtotal + courier + round_off)
    const totalAmount = subtotal + courier + roundOff;

    // Create sale entry
    const sale = {
      orderId,
      saleDate,
      customerCode: customerCode || '',
      customerName: customerName || '',
      companyName: companyName || '',
      customerContact: mobileNumber || '',
      saleBy,
      subtotal,
      courier,
      roundOff,
      totalAmount: billAmount || totalAmount, // Use billAmount if available
      amountReceived,
      balancePayment,
      withBill,
      remarks: remarks || '',
      products
    };

    salesData.push(sale);
  }

  console.log(`Parsed ${salesData.length} sales records`);

  // Generate SQL statements
  const sqlStatements = [];
  
  for (const sale of salesData) {
    // Calculate GST (18%)
    const gstAmount = sale.subtotal * 0.18;
    
    // Insert sale
    const saleSQL = `INSERT INTO sales (
      order_id, sale_date, customer_code, customer_name, company_name, 
      customer_contact, employee_name, subtotal, courier_cost, 
      total_amount, amount_received, balance_amount, sale_type, remarks, 
      gst_amount, created_at, updated_at
    ) VALUES (
      '${sale.orderId}',
      '${sale.saleDate}',
      '${sale.customerCode.replace(/'/g, "''")}',
      '${sale.customerName.replace(/'/g, "''")}',
      '${sale.companyName.replace(/'/g, "''")}',
      '${sale.customerContact.replace(/'/g, "''")}',
      '${sale.saleBy.replace(/'/g, "''")}',
      ${sale.subtotal},
      ${sale.courier},
      ${sale.totalAmount},
      ${sale.amountReceived},
      ${sale.balancePayment},
      '${sale.withBill ? 'With' : 'Without'}',
      '${sale.remarks.replace(/'/g, "''")}',
      ${gstAmount},
      '${sale.saleDate}',
      '${sale.saleDate}'
    );`;
    sqlStatements.push(saleSQL);

    // Insert sale items
    for (const product of sale.products) {
      const itemSQL = `INSERT INTO sale_items (
        order_id, product_name, quantity, unit_price
      ) VALUES (
        '${sale.orderId}',
        '${product.name.replace(/'/g, "''")}',
        ${product.quantity},
        ${product.rate}
      );`;
      sqlStatements.push(itemSQL);
    }

    // Insert payment history if amount received
    if (sale.amountReceived > 0) {
      const paymentSQL = `INSERT INTO payment_history (
        order_id, payment_date, amount, account_received
      ) VALUES (
        '${sale.orderId}',
        '${sale.saleDate}',
        ${sale.amountReceived},
        'Cash/Transfer'
      );`;
      sqlStatements.push(paymentSQL);
    }
  }

  // Write SQL to file
  fs.writeFileSync('/tmp/import-sales.sql', sqlStatements.join('\n'));
  console.log('SQL statements written to /tmp/import-sales.sql');
  console.log(`Total SQL statements: ${sqlStatements.length}`);
}

main().catch(console.error);
