const XLSX = require('./node_modules/xlsx');
const sqlite3 = require('better-sqlite3');

const db = new sqlite3('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a4cbf95b06cc05ac18912e42ea1dd3c229ea877895f964b2fcd2b1a46ff17dbc.sqlite');

console.log('Populating orders from dispatch data...\n');

// Read dispatch data
const disp = XLSX.readFile('/home/user/uploaded_files/dispatchXL.xlsx');
const dispData = XLSX.utils.sheet_to_json(disp.Sheets[disp.SheetNames[0]]);

function excelDateToISO(excelDate) {
  if (!excelDate || isNaN(excelDate)) return new Date().toISOString().split('T')[0];
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

// Group by Order ID
const orderMap = {};
for (const row of dispData) {
  const orderId = String(row['Order Id'] || '');
  if (!orderId) continue;
  
  if (!orderMap[orderId]) {
    orderMap[orderId] = {
      order_id: orderId,
      customer_code: row['Cust Code'] || null,
      customer_name: row['Customer Name'] || '',
      company_name: row['Company Name'] || '',
      order_date: excelDateToISO(row['Dispatch Date']),
      items: []
    };
  }
  
  orderMap[orderId].items.push({
    device_name: row['Device Name'] || '',
    serial_number: String(row['Device Serial Number'] || ''),
    qc_status: row['QC Status'] || 'Pending'
  });
}

console.log(`Found ${Object.keys(orderMap).length} unique orders`);

// Insert orders
const orderStmt = db.prepare(`
  INSERT OR REPLACE INTO orders (
    order_id, customer_code, customer_name, company_name, order_date, total_items, dispatch_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const itemStmt = db.prepare(`
  INSERT OR REPLACE INTO order_items (
    order_id, product_name, product_category, quantity, serial_numbers
  ) VALUES (?, ?, ?, ?, ?)
`);

let orderCount = 0;
let itemCount = 0;

for (const order of Object.values(orderMap)) {
  // Insert order
  orderStmt.run(
    order.order_id,
    order.customer_code,
    order.customer_name,
    order.company_name,
    order.order_date,
    order.items.length,
    'Pending'
  );
  orderCount++;
  
  // Group items by product name
  const productMap = {};
  for (const item of order.items) {
    if (!productMap[item.device_name]) {
      productMap[item.device_name] = {
        serials: [],
        category: item.device_name.includes('MDVR') ? 'MDVR' : 
                  item.device_name.includes('Camera') ? 'Camera' : 'Other'
      };
    }
    productMap[item.device_name].serials.push(item.serial_number);
  }
  
  // Insert order items
  for (const [productName, data] of Object.entries(productMap)) {
    itemStmt.run(
      order.order_id,
      productName,
      data.category,
      data.serials.length,
      JSON.stringify(data.serials)
    );
    itemCount++;
  }
}

console.log(`✓ Created ${orderCount} orders`);
console.log(`✓ Created ${itemCount} order items`);

// Update dispatch_records with order_id and qc_status from notes
const updateDispatchStmt = db.prepare(`
  UPDATE dispatch_records 
  SET order_id = ?, qc_status = ?
  WHERE device_serial_no = ?
`);

for (const row of dispData) {
  const serialNo = String(row['Device Serial Number'] || '');
  const orderId = String(row['Order Id'] || '');
  const qcStatus = row['QC Status'] || 'Pending';
  
  updateDispatchStmt.run(orderId, qcStatus, serialNo);
}

console.log(`✓ Updated dispatch records with order IDs and QC status`);

db.close();
console.log('\nDone!');
