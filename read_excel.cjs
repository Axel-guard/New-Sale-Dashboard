const XLSX = require('xlsx');
const fs = require('fs');

// Read QC Sheet
console.log('=== Reading QC Sheet.xlsx ===');
const qcWorkbook = XLSX.readFile('/home/user/uploaded_files/QC Sheet.xlsx');
const qcSheetName = qcWorkbook.SheetNames[0];
const qcSheet = qcWorkbook.Sheets[qcSheetName];
const qcData = XLSX.utils.sheet_to_json(qcSheet);

console.log(`\nQC Sheet: ${qcSheetName}`);
console.log(`Total Records: ${qcData.length}`);
console.log('\nFirst Record Sample:');
console.log(JSON.stringify(qcData[0], null, 2));
console.log('\nColumn Names:');
console.log(Object.keys(qcData[0] || {}));

// Save QC data to JSON
fs.writeFileSync('/home/user/webapp/qc_data.json', JSON.stringify(qcData, null, 2));
console.log('\n✓ QC data saved to qc_data.json');

// Read Inventory Sheet
console.log('\n\n=== Reading Inventory.xlsx ===');
const invWorkbook = XLSX.readFile('/home/user/uploaded_files/Inventory.xlsx');
const invSheetName = invWorkbook.SheetNames[0];
const invSheet = invWorkbook.Sheets[invSheetName];
const invData = XLSX.utils.sheet_to_json(invSheet);

console.log(`\nInventory Sheet: ${invSheetName}`);
console.log(`Total Records: ${invData.length}`);
console.log('\nFirst Record Sample:');
console.log(JSON.stringify(invData[0], null, 2));
console.log('\nColumn Names:');
console.log(Object.keys(invData[0] || {}));

// Save Inventory data to JSON
fs.writeFileSync('/home/user/webapp/inventory_data.json', JSON.stringify(invData, null, 2));
console.log('\n✓ Inventory data saved to inventory_data.json');

// Statistics
console.log('\n\n=== SUMMARY ===');
console.log(`QC Records: ${qcData.length}`);
console.log(`Inventory Records: ${invData.length}`);
console.log('\nFiles saved:');
console.log('- /home/user/webapp/qc_data.json');
console.log('- /home/user/webapp/inventory_data.json');
