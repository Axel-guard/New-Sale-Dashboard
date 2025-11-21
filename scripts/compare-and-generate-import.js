// Compare Excel data with production database and generate import statements
import { readFileSync, writeFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Read normalized Excel data
const excelData = JSON.parse(readFileSync('/tmp/normalized_excel_data.json', 'utf8'));
const orderGroups = JSON.parse(readFileSync('/tmp/order_groups.json', 'utf8'));

console.log('📊 Loaded Excel data:');
console.log(`  - ${excelData.length} devices`);
console.log(`  - ${Object.keys(orderGroups).length} order groups\n`);

// Query production database for existing data
async function queryDatabase(sql) {
  try {
    const { stdout } = await execAsync(
      `cd /home/user/webapp && npx wrangler d1 execute webapp-production --local --command="${sql.replace(/"/g, '\\"')}" --json`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const result = JSON.parse(stdout);
    return result[0]?.results || [];
  } catch (error) {
    console.error('Database query error:', error.message);
    return [];
  }
}

// Main comparison logic
async function main() {
  console.log('🔍 Step 1: Fetching existing inventory from database...');
  const existingInventory = await queryDatabase('SELECT device_serial_no, model_name FROM inventory');
  console.log(`✅ Found ${existingInventory.length} devices in inventory database\n`);
  
  console.log('🔍 Step 2: Fetching existing dispatch records...');
  const existingDispatches = await queryDatabase('SELECT device_serial_no, order_id, dispatch_date FROM dispatch_records');
  console.log(`✅ Found ${existingDispatches.length} dispatch records in database\n`);
  
  console.log('🔍 Step 3: Fetching existing sales...');
  const existingSales = await queryDatabase('SELECT order_id, customer_name, sale_date FROM sales');
  console.log(`✅ Found ${existingSales.length} sales in database\n`);
  
  // Create lookup maps
  const inventoryMap = new Map(existingInventory.map(d => [d.device_serial_no, d]));
  const dispatchMap = new Map(existingDispatches.map(d => [d.device_serial_no, d]));
  const salesByCustomerDate = new Map();
  existingSales.forEach(sale => {
    const key = `${sale.customer_name.toLowerCase()}|${sale.sale_date}`;
    if (!salesByCustomerDate.has(key)) {
      salesByCustomerDate.set(key, []);
    }
    salesByCustomerDate.get(key).push(sale);
  });
  
  // Analysis arrays
  const devicesInBoth = [];
  const devicesOnlyInExcel = [];
  const devicesOnlyInDB = [];
  const dispatchesInBoth = [];
  const dispatchesOnlyInExcel = [];
  const orderGroupsWithMatch = [];
  const orderGroupsWithoutMatch = [];
  
  // Compare devices
  console.log('🔍 Step 4: Comparing devices...');
  excelData.forEach(excelRow => {
    const serial = excelRow.serial_no;
    const inDB = inventoryMap.has(serial);
    const dispatched = dispatchMap.has(serial);
    
    if (inDB) {
      devicesInBoth.push({ excel: excelRow, db: inventoryMap.get(serial) });
    } else {
      devicesOnlyInExcel.push(excelRow);
    }
    
    if (dispatched) {
      dispatchesInBoth.push({ excel: excelRow, db: dispatchMap.get(serial) });
    } else if (inDB) {
      // Device exists in inventory but not in dispatch records
      dispatchesOnlyInExcel.push(excelRow);
    }
  });
  
  // Check for devices in DB but not in Excel
  existingInventory.forEach(dbDevice => {
    const serial = dbDevice.device_serial_no;
    const inExcel = excelData.find(row => row.serial_no === serial);
    if (!inExcel) {
      devicesOnlyInDB.push(dbDevice);
    }
  });
  
  // Compare order groups
  console.log('🔍 Step 5: Matching order groups with existing sales...');
  Object.entries(orderGroups).forEach(([key, group]) => {
    const matches = salesByCustomerDate.get(key) || [];
    if (matches.length > 0) {
      orderGroupsWithMatch.push({ key, group, matches });
    } else {
      orderGroupsWithoutMatch.push({ key, group });
    }
  });
  
  // Generate report
  const report = `
═══════════════════════════════════════════════════════════════════════════
                    EXCEL vs DATABASE COMPARISON REPORT
═══════════════════════════════════════════════════════════════════════════

📊 INVENTORY COMPARISON
───────────────────────────────────────────────────────────────────────────
  Devices in both Excel & DB:        ${devicesInBoth.length.toLocaleString()}
  Devices only in Excel (NEW):       ${devicesOnlyInExcel.length.toLocaleString()} ⚠️
  Devices only in DB:                ${devicesOnlyInDB.length.toLocaleString()}
  
  Total in Excel:                    ${excelData.length.toLocaleString()}
  Total in DB:                       ${existingInventory.length.toLocaleString()}

📦 DISPATCH RECORDS COMPARISON
───────────────────────────────────────────────────────────────────────────
  Dispatches in both Excel & DB:     ${dispatchesInBoth.length.toLocaleString()}
  Dispatches only in Excel (NEW):    ${dispatchesOnlyInExcel.length.toLocaleString()} ⚠️
  
  Total dispatch records in DB:      ${existingDispatches.length.toLocaleString()}

🔗 ORDER MATCHING (Customer Name + Sale Date)
───────────────────────────────────────────────────────────────────────────
  Order groups with DB match:        ${orderGroupsWithMatch.length.toLocaleString()}
  Order groups without match:        ${orderGroupsWithoutMatch.length.toLocaleString()} ⚠️
  
  Total order groups in Excel:       ${Object.keys(orderGroups).length.toLocaleString()}
  Total sales in DB:                 ${existingSales.length.toLocaleString()}

═══════════════════════════════════════════════════════════════════════════

⚠️  IMPORT REQUIREMENTS:
───────────────────────────────────────────────────────────────────────────
1. Need to import ${devicesOnlyInExcel.length} NEW devices to inventory
2. Need to import ${dispatchesOnlyInExcel.length} NEW dispatch records
3. Need to create ${orderGroupsWithoutMatch.length} NEW sales for unmatched orders

═══════════════════════════════════════════════════════════════════════════
`;

  console.log(report);
  writeFileSync('/tmp/comparison_report.txt', report);
  
  // Save detailed lists
  writeFileSync('/tmp/devices_only_in_excel.json', JSON.stringify(devicesOnlyInExcel, null, 2));
  writeFileSync('/tmp/devices_in_both.json', JSON.stringify(devicesInBoth, null, 2));
  writeFileSync('/tmp/dispatches_only_in_excel.json', JSON.stringify(dispatchesOnlyInExcel, null, 2));
  writeFileSync('/tmp/order_groups_with_match.json', JSON.stringify(orderGroupsWithMatch, null, 2));
  writeFileSync('/tmp/order_groups_without_match.json', JSON.stringify(orderGroupsWithoutMatch, null, 2));
  
  console.log('\n💾 Detailed reports saved to:');
  console.log('  - /tmp/comparison_report.txt');
  console.log('  - /tmp/devices_only_in_excel.json');
  console.log('  - /tmp/devices_in_both.json');
  console.log('  - /tmp/dispatches_only_in_excel.json');
  console.log('  - /tmp/order_groups_with_match.json');
  console.log('  - /tmp/order_groups_without_match.json');
  
  console.log('\n✅ Comparison complete!');
}

main().catch(console.error);
