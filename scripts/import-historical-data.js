// Import historical inventory and dispatch data from Excel
import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';

// Excel date conversion (days since 1900-01-01)
function excelDateToJS(excelDate) {
  if (!excelDate || typeof excelDate !== 'number') return null;
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Read Excel data
const excelPath = '/home/user/uploaded_files/Dispatch.xlsx';
console.log('📊 Reading Excel file:', excelPath);
const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const excelData = XLSX.utils.sheet_to_json(worksheet);

console.log(`✅ Loaded ${excelData.length} rows from Excel\n`);

// Convert dates and normalize data
const normalizedData = excelData.map(row => {
  const saleDate = excelDateToJS(row['Sale Date']);
  const dispatchDate = excelDateToJS(row['Dispatch Date']);
  const inDate = excelDateToJS(row['In_Date']);
  
  return {
    serial_no: String(row['Device Serial_No'] || '').trim(),
    model_name: String(row['Model_Name'] || '').trim(),
    customer_name: String(row['Customer Name'] || '').trim(),
    customer_code: row['Cust Code'] || null,
    customer_mobile: row['Cust Mobile'] ? String(row['Cust Mobile']).trim() : null,
    customer_city: String(row['Cust City'] || '').trim(),
    // Use dispatch_date as fallback if sale_date is null
    sale_date: saleDate || dispatchDate,
    dispatch_date: dispatchDate,
    in_date: inDate,
    dispatch_reason: String(row['Dispatch Reason'] || 'New Sale').trim(),
    warranty: String(row['Warranty Provide'] || '').trim()
  };
}).filter(row => row.serial_no && row.customer_name && row.sale_date);

console.log(`✅ Normalized ${normalizedData.length} valid rows\n`);

// Sample normalized data
console.log('📋 Sample normalized data (first 2 rows):');
console.log(JSON.stringify(normalizedData.slice(0, 2), null, 2));

// Group by customer name + sale date to identify orders
const orderGroups = {};
normalizedData.forEach(row => {
  const key = `${row.customer_name.toLowerCase()}|${row.sale_date}`;
  if (!orderGroups[key]) {
    orderGroups[key] = {
      customer_name: row.customer_name,
      sale_date: row.sale_date,
      customer_code: row.customer_code,
      customer_mobile: row.customer_mobile,
      customer_city: row.customer_city,
      devices: []
    };
  }
  orderGroups[key].devices.push(row);
});

console.log(`\n📦 Grouped into ${Object.keys(orderGroups).length} unique customer+date combinations\n`);

// Show sample groupings
console.log('📋 Sample order groupings:');
Object.values(orderGroups).slice(0, 3).forEach((group, idx) => {
  console.log(`\n${idx + 1}. ${group.customer_name} - ${group.sale_date}`);
  console.log(`   Devices: ${group.devices.length}`);
  console.log(`   Serial Numbers: ${group.devices.map(d => d.serial_no).slice(0, 3).join(', ')}${group.devices.length > 3 ? '...' : ''}`);
});

// Statistics
const totalDevices = normalizedData.length;
const uniqueCustomers = new Set(normalizedData.map(r => r.customer_name.toLowerCase())).size;
const uniqueSerialNos = new Set(normalizedData.map(r => r.serial_no)).size;
const dateRange = {
  earliest: normalizedData.reduce((min, r) => !min || r.sale_date < min ? r.sale_date : min, null),
  latest: normalizedData.reduce((max, r) => !max || r.sale_date > max ? r.sale_date : max, null)
};

console.log('\n📊 Summary Statistics:');
console.log(`  Total devices: ${totalDevices}`);
console.log(`  Unique serial numbers: ${uniqueSerialNos}`);
console.log(`  Unique customers: ${uniqueCustomers}`);
console.log(`  Order groups: ${Object.keys(orderGroups).length}`);
console.log(`  Date range: ${dateRange.earliest} to ${dateRange.latest}`);

// Save processed data
writeFileSync('/tmp/normalized_excel_data.json', JSON.stringify(normalizedData, null, 2));
writeFileSync('/tmp/order_groups.json', JSON.stringify(orderGroups, null, 2));

console.log('\n💾 Processed data saved to:');
console.log('  - /tmp/normalized_excel_data.json');
console.log('  - /tmp/order_groups.json');

console.log('\n✅ Analysis complete! Ready for database comparison.');
console.log('\n⚠️  Note: This Excel file has NO order_id column.');
console.log('   We will need to match with existing sales by customer_name + sale_date');
console.log('   or create new sales for unmatched entries.');
