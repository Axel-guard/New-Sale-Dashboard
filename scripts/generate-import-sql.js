// Generate SQL import statements for historical data
import { readFileSync, writeFileSync } from 'fs';

// Helper to escape SQL strings
function sqlEscape(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

// Read data
const excelData = JSON.parse(readFileSync('/tmp/normalized_excel_data.json', 'utf8'));
const orderGroups = JSON.parse(readFileSync('/tmp/order_groups_without_match.json', 'utf8'));

console.log('📊 Generating import SQL...\n');

// Generate order_id for each order group (format: 20XXXXX)
// Start from 2000000 to avoid conflicts with existing IDs
let orderIdCounter = 2000000;
const orderGroupsWithIds = orderGroups.map(({ key, group }) => {
  const orderId = String(orderIdCounter++);
  return { ...group, order_id: orderId };
});

console.log(`Generated ${orderGroupsWithIds.length} order IDs (2000000 - ${orderIdCounter - 1})\n`);

// PART 1: Generate Sales INSERT statements
console.log('📝 Part 1: Generating sales INSERT statements...');
const salesInserts = [];
const salesBatchSize = 50;

for (let i = 0; i < orderGroupsWithIds.length; i += salesBatchSize) {
  const batch = orderGroupsWithIds.slice(i, i + salesBatchSize);
  const values = batch.map(order => {
    // Count quantities by product
    const productCounts = {};
    order.devices.forEach(device => {
      productCounts[device.model_name] = (productCounts[device.model_name] || 0) + 1;
    });
    
    // Calculate totals (we don't have prices, use 0)
    const subtotal = 0;
    const gst = 0;
    const total = 0;
    
    return `(
      ${sqlEscape(order.order_id)},
      ${sqlEscape(order.customer_code || '')},
      ${sqlEscape(order.customer_mobile)},
      ${sqlEscape(order.sale_date)},
      'System Import',
      'With',
      0,
      0,
      NULL,
      NULL,
      ${sqlEscape('Imported from historical data')},
      ${subtotal},
      ${gst},
      ${total},
      0,
      ${sqlEscape(order.customer_name)},
      NULL
    )`;
  }).join(',\n    ');
  
  salesInserts.push(`INSERT INTO sales (
    order_id, customer_code, customer_contact, sale_date, employee_name,
    sale_type, courier_cost, amount_received, account_received,
    payment_reference, remarks, subtotal, gst_amount,
    total_amount, balance_amount, customer_name, company_name
  ) VALUES
    ${values};`);
}

console.log(`✅ Generated ${salesInserts.length} sales INSERT batches\n`);

// PART 2: Generate Sale Items INSERT statements
console.log('📝 Part 2: Generating sale_items INSERT statements...');
const saleItemsInserts = [];
const saleItemsBatchSize = 100;

// Create sale items from device groupings
const allSaleItems = [];
orderGroupsWithIds.forEach(order => {
  // Group devices by model
  const productGroups = {};
  order.devices.forEach(device => {
    if (!productGroups[device.model_name]) {
      productGroups[device.model_name] = {
        model_name: device.model_name,
        devices: []
      };
    }
    productGroups[device.model_name].devices.push(device);
  });
  
  // Create sale item for each product
  Object.values(productGroups).forEach(group => {
    allSaleItems.push({
      order_id: order.order_id,
      product_name: group.model_name,
      product_category: 'Imported',
      quantity: group.devices.length,
      unit_price: 0,
      total_price: 0
    });
  });
});

for (let i = 0; i < allSaleItems.length; i += saleItemsBatchSize) {
  const batch = allSaleItems.slice(i, i + saleItemsBatchSize);
  const values = batch.map(item => 
    `((SELECT id FROM sales WHERE order_id = ${sqlEscape(item.order_id)}), ${sqlEscape(item.product_name)}, ${item.quantity}, ${item.unit_price}, ${item.total_price}, ${sqlEscape(item.order_id)})`
  ).join(',\n    ');
  
  saleItemsInserts.push(`INSERT INTO sale_items (
    sale_id, product_name, quantity, unit_price, total_price, order_id
  ) VALUES
    ${values};`);
}

console.log(`✅ Generated ${saleItemsInserts.length} sale_items INSERT batches\n`);

// Create mapping of customer+date to order_id (used by inventory and dispatch inserts)
const customerDateToOrderId = new Map();
orderGroupsWithIds.forEach(order => {
  const key = `${order.customer_name.toLowerCase()}|${order.sale_date}`;
  customerDateToOrderId.set(key, order.order_id);
});

// PART 3: Generate Inventory INSERT statements
console.log('📝 Part 3: Generating inventory INSERT statements...');
const inventoryInserts = [];
const inventoryBatchSize = 100;

for (let i = 0; i < excelData.length; i += inventoryBatchSize) {
  const batch = excelData.slice(i, i + inventoryBatchSize);
  const values = batch.map(device => {
    // Find the order_id for this device
    const key = `${device.customer_name.toLowerCase()}|${device.sale_date}`;
    const order_id = customerDateToOrderId.get(key);
    
    return `(
      ${sqlEscape(device.in_date)},
      ${sqlEscape(device.model_name)},
      ${sqlEscape(device.serial_no)},
      ${sqlEscape(device.dispatch_date)},
      ${sqlEscape(device.customer_code || '')},
      ${sqlEscape(device.sale_date)},
      ${sqlEscape(device.customer_name)},
      ${sqlEscape(device.customer_city)},
      ${sqlEscape(device.customer_mobile)},
      ${sqlEscape(device.dispatch_reason)},
      ${sqlEscape(device.warranty)},
      ${sqlEscape(order_id)},
      'Dispatched'
    )`;
  }).join(',\n    ');
  
  inventoryInserts.push(`INSERT OR IGNORE INTO inventory (
    in_date, model_name, device_serial_no, dispatch_date, cust_code,
    sale_date, customer_name, cust_city, cust_mobile, dispatch_reason,
    warranty_provide, order_id, status
  ) VALUES
    ${values};`);
}

console.log(`✅ Generated ${inventoryInserts.length} inventory INSERT batches\n`);

// PART 4: Generate Dispatch Records INSERT statements
console.log('📝 Part 4: Generating dispatch_records INSERT statements...');
const dispatchInserts = [];
const dispatchBatchSize = 100;

// Prepare dispatch records
const dispatchRecords = excelData.map(device => {
  const key = `${device.customer_name.toLowerCase()}|${device.sale_date}`;
  const order_id = customerDateToOrderId.get(key);
  
  return {
    device_serial_no: device.serial_no,
    order_id: order_id,
    dispatch_date: device.dispatch_date,
    customer_name: device.customer_name,
    customer_code: String(device.customer_code || ''),
    customer_mobile: device.customer_mobile,
    customer_city: device.customer_city,
    dispatch_reason: device.dispatch_reason,
    dispatched_by: 'System Import',
    qc_status: 'Imported'
  };
});

for (let i = 0; i < dispatchRecords.length; i += dispatchBatchSize) {
  const batch = dispatchRecords.slice(i, i + dispatchBatchSize);
  const values = batch.map(d => {
    return `(
      (SELECT id FROM inventory WHERE device_serial_no = ${sqlEscape(d.device_serial_no)}),
      ${sqlEscape(d.device_serial_no)},
      ${sqlEscape(d.dispatch_date)},
      ${sqlEscape(d.customer_name)},
      ${sqlEscape(d.customer_code)},
      ${sqlEscape(d.customer_mobile)},
      ${sqlEscape(d.customer_city)},
      ${sqlEscape(d.dispatch_reason)},
      NULL,
      NULL,
      ${sqlEscape(d.dispatched_by)},
      '',
      ${sqlEscape(d.order_id)},
      ${sqlEscape(d.qc_status)}
    )`;
  }).join(',\n    ');
  
  dispatchInserts.push(`INSERT OR IGNORE INTO dispatch_records (
    inventory_id, device_serial_no, dispatch_date, customer_name,
    customer_code, customer_mobile, customer_city, dispatch_reason,
    courier_name, tracking_number, dispatched_by, notes, order_id, qc_status
  ) VALUES
    ${values};`);
}

console.log(`✅ Generated ${dispatchInserts.length} dispatch_records INSERT batches\n`);

// Combine all SQL
const fullSQL = `
-- ═══════════════════════════════════════════════════════════════════════════
-- HISTORICAL DATA IMPORT - Generated on ${new Date().toISOString()}
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- This script imports historical data from Excel file
-- - ${orderGroupsWithIds.length} Sales Orders (IDs: 2000000 - ${orderIdCounter - 1})
-- - ${allSaleItems.length} Sale Items
-- - ${excelData.length} Inventory Devices
-- - ${dispatchRecords.length} Dispatch Records
--
-- IMPORTANT: This operation is IDEMPOTENT using INSERT OR IGNORE
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN TRANSACTION;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: Import Sales (${salesInserts.length} batches)
-- ═══════════════════════════════════════════════════════════════════════════

${salesInserts.join('\n\n')}

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: Import Sale Items (${saleItemsInserts.length} batches)
-- ═══════════════════════════════════════════════════════════════════════════

${saleItemsInserts.join('\n\n')}

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: Import Inventory (${inventoryInserts.length} batches)
-- ═══════════════════════════════════════════════════════════════════════════

${inventoryInserts.join('\n\n')}

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4: Import Dispatch Records (${dispatchInserts.length} batches)
-- ═══════════════════════════════════════════════════════════════════════════

${dispatchInserts.join('\n\n')}

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Import Complete!
-- ═══════════════════════════════════════════════════════════════════════════
`;

// Save SQL file
writeFileSync('/tmp/historical_import.sql', fullSQL);

// Save mapping file for reference
writeFileSync('/tmp/customer_order_mapping.json', JSON.stringify(
  orderGroupsWithIds.map(o => ({
    order_id: o.order_id,
    customer_name: o.customer_name,
    sale_date: o.sale_date,
    device_count: o.devices.length
  })),
  null,
  2
));

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('                       SQL GENERATION COMPLETE');
console.log('═══════════════════════════════════════════════════════════════════════════\n');
console.log('📊 Generated SQL with:');
console.log(`  - ${salesInserts.length} sales INSERT batches (${orderGroupsWithIds.length} orders)`);
console.log(`  - ${saleItemsInserts.length} sale_items INSERT batches (${allSaleItems.length} items)`);
console.log(`  - ${inventoryInserts.length} inventory INSERT batches (${excelData.length} devices)`);
console.log(`  - ${dispatchInserts.length} dispatch INSERT batches (${dispatchRecords.length} records)`);
console.log('');
console.log('💾 Files saved:');
console.log('  - /tmp/historical_import.sql (MAIN IMPORT FILE)');
console.log('  - /tmp/customer_order_mapping.json (Reference mapping)');
console.log('');
console.log('⚠️  IMPORTANT: Review the SQL file before executing!');
console.log('   File size:', (fullSQL.length / 1024 / 1024).toFixed(2), 'MB');
console.log('');
console.log('To execute:');
console.log('  npx wrangler d1 execute webapp-production --local --file=/tmp/historical_import.sql');
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════\n');
