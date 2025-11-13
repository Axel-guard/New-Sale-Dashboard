const XLSX = require('./node_modules/xlsx');
const sqlite3 = require('better-sqlite3');

// Connect to D1 database
const db = new sqlite3('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a4cbf95b06cc05ac18912e42ea1dd3c229ea877895f964b2fcd2b1a46ff17dbc.sqlite');

console.log('Starting data import...\n');

// Helper function to convert Excel date to ISO string
function excelDateToISO(excelDate) {
  if (!excelDate || isNaN(excelDate)) return null;
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

// 1. Import Inventory
console.log('=== IMPORTING INVENTORY ===');
const inv = XLSX.readFile('/home/user/uploaded_files/Inventory.xlsx');
const invData = XLSX.utils.sheet_to_json(inv.Sheets[inv.SheetNames[0]]);
console.log(`Total inventory rows: ${invData.length}`);

const invStmt = db.prepare(`
  INSERT OR IGNORE INTO inventory (
    device_serial_no, model_name, in_date, dispatch_date, sale_date,
    cust_code, customer_name, cust_city, cust_mobile, dispatch_reason,
    warranty_provide, status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

let invCount = 0;
for (const row of invData) {
  try {
    invStmt.run(
      String(row['Device Serial_No'] || row['Device Serial Number'] || ''),
      row['Model_Name'] || '',
      excelDateToISO(row['In_Date']),
      excelDateToISO(row['Dispatch Date']),
      excelDateToISO(row['Sale Date']),
      row['Cust Code'] || null,
      row['Customer Name'] || '',
      row['Cust City'] || '',
      String(row['Cust Mobile'] || ''),
      row['Dispatch Reason'] || '',
      row['Warranty Provide'] || '',
      row['Dispatch Date'] ? 'Dispatched' : 'In Stock'
    );
    invCount++;
  } catch (err) {
    console.error(`Error inserting inventory row: ${err.message}`);
  }
}
console.log(`✓ Imported ${invCount} inventory records\n`);

// 2. Import QC Sheet
console.log('=== IMPORTING QC RECORDS ===');
const qc = XLSX.readFile('/home/user/uploaded_files/QC Sheet.xlsx');
const qcData = XLSX.utils.sheet_to_json(qc.Sheets[qc.SheetNames[0]]);
console.log(`Total QC rows: ${qcData.length}`);

const qcStmt = db.prepare(`
  INSERT OR IGNORE INTO quality_check (
    inventory_id, device_serial_no, check_date, checked_by, test_results, pass_fail, notes, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

const findInvStmt = db.prepare(`SELECT id FROM inventory WHERE device_serial_no = ? LIMIT 1`);

let qcCount = 0;
for (const row of qcData) {
  try {
    const serialNo = String(row['Serial Number'] || '');
    const invRecord = findInvStmt.get(serialNo);
    
    // Build test results JSON
    const testResults = {
      device_type: row['Device Type'] || '',
      camera_quality: row['Camera Quality (For Camera)'] || '',
      sd_connectivity: row['SD Connectivity QC'] || '',
      all_ch_status: row['All Ch QC Status'] || '',
      network_connectivity: row['Network Connectivity QC'] || '',
      gps_qc: row['GPS QC'] || '',
      sim_slot_qc: row['SIM card Slot QC'] || '',
      online_qc: row['Online QC'] || '',
      monitor_qc: row['For Monitor QC Stauts'] || '',
      ip_address: row['IP Address Update Status'] || ''
    };
    
    qcStmt.run(
      invRecord ? invRecord.id : null,
      serialNo,
      excelDateToISO(row['QC Date']),
      'Excel Import',
      JSON.stringify(testResults),
      row['Final QC Status'] || 'Pending',
      `Device: ${row['Device Type'] || ''}`
    );
    qcCount++;
  } catch (err) {
    console.error(`Error inserting QC row: ${err.message}`);
  }
}
console.log(`✓ Imported ${qcCount} QC records\n`);

// 3. Import Dispatch Records
console.log('=== IMPORTING DISPATCH RECORDS ===');
const disp = XLSX.readFile('/home/user/uploaded_files/dispatchXL.xlsx');
const dispData = XLSX.utils.sheet_to_json(disp.Sheets[disp.SheetNames[0]]);
console.log(`Total dispatch rows: ${dispData.length}`);

const dispStmt = db.prepare(`
  INSERT OR IGNORE INTO dispatch_records (
    inventory_id, device_serial_no, dispatch_date, customer_name,
    customer_code, dispatch_reason, courier_name, tracking_number,
    dispatched_by, notes, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

let dispCount = 0;
for (const row of dispData) {
  try {
    const serialNo = String(row['Device Serial Number'] || '');
    const invRecord = findInvStmt.get(serialNo);
    
    // Build notes with additional info
    const notes = JSON.stringify({
      order_id: row['Order Id'] || '',
      company_name: row['Company Name'] || '',
      qc_status: row['QC Status'] || 'Pending',
      device_name: row['Device Name'] || '',
      dispatch_method: row['Dispatch Method'] || ''
    });
    
    dispStmt.run(
      invRecord ? invRecord.id : null,
      serialNo,
      excelDateToISO(row['Dispatch Date']),
      row['Customer Name'] || '',
      row['Cust Code'] || null,
      row['Dispatch Reason'] || '',
      row['Courier Company'] || '',
      String(row['Tracking ID'] || ''),
      'Excel Import',
      notes
    );
    dispCount++;
  } catch (err) {
    console.error(`Error inserting dispatch row: ${err.message}`);
  }
}
console.log(`✓ Imported ${dispCount} dispatch records\n`);

// Show final counts
const invTotal = db.prepare(`SELECT COUNT(*) as count FROM inventory`).get();
const qcTotal = db.prepare(`SELECT COUNT(*) as count FROM quality_check`).get();
const dispTotal = db.prepare(`SELECT COUNT(*) as count FROM dispatch_records`).get();

console.log('=== IMPORT COMPLETE ===');
console.log(`Inventory: ${invTotal.count} records`);
console.log(`QC: ${qcTotal.count} records`);
console.log(`Dispatch: ${dispTotal.count} records`);

db.close();
