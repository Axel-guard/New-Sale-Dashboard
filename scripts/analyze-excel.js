// Script to analyze Dispatch.xlsx and compare with database
import XLSX from 'xlsx';
import { readFileSync } from 'fs';

const excelPath = '/home/user/uploaded_files/Dispatch.xlsx';

console.log('📊 Reading Excel file:', excelPath);
const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log(`\n✅ Found ${data.length} rows in Excel\n`);

// Analyze first few rows to understand structure
console.log('📋 Sample data (first 3 rows):');
data.slice(0, 3).forEach((row, idx) => {
  console.log(`\nRow ${idx + 1}:`);
  console.log(JSON.stringify(row, null, 2));
});

// Analyze column names
console.log('\n📝 Column names found:');
const columns = Object.keys(data[0] || {});
columns.forEach(col => console.log(`  - ${col}`));

// Analyze missing order_ids
const withOrderId = data.filter(row => row.order_id || row.ORDER_ID || row['Order ID'] || row['order id']);
const withoutOrderId = data.filter(row => !(row.order_id || row.ORDER_ID || row['Order ID'] || row['order id']));

console.log(`\n📊 Statistics:`);
console.log(`  Total rows: ${data.length}`);
console.log(`  Rows with Order ID: ${withOrderId.length}`);
console.log(`  Rows without Order ID: ${withoutOrderId.length}`);

// Analyze date columns
const dateColumns = columns.filter(col => 
  col.toLowerCase().includes('date') || 
  col.toLowerCase().includes('dispatch')
);
console.log(`\n📅 Date-related columns:`);
dateColumns.forEach(col => console.log(`  - ${col}`));

// Analyze customer name columns
const customerColumns = columns.filter(col => 
  col.toLowerCase().includes('customer') || 
  col.toLowerCase().includes('name')
);
console.log(`\n👤 Customer-related columns:`);
customerColumns.forEach(col => console.log(`  - ${col}`));

// Analyze serial number columns
const serialColumns = columns.filter(col => 
  col.toLowerCase().includes('serial') || 
  col.toLowerCase().includes('device') ||
  col.toLowerCase().includes('imei')
);
console.log(`\n🔢 Serial/Device-related columns:`);
serialColumns.forEach(col => console.log(`  - ${col}`));

// Show sample of rows without order_id
if (withoutOrderId.length > 0) {
  console.log(`\n⚠️  Sample rows WITHOUT order_id (first 3):`);
  withoutOrderId.slice(0, 3).forEach((row, idx) => {
    console.log(`\nRow ${idx + 1}:`);
    console.log(JSON.stringify(row, null, 2));
  });
}

// Save full data to JSON for analysis
import { writeFileSync } from 'fs';
writeFileSync('/tmp/dispatch_excel_data.json', JSON.stringify(data, null, 2));
console.log('\n💾 Full data saved to: /tmp/dispatch_excel_data.json');

console.log('\n✅ Analysis complete!');
