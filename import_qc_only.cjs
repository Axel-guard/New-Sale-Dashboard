const XLSX = require('./node_modules/xlsx');
const sqlite3 = require('better-sqlite3');

const db = new sqlite3('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a4cbf95b06cc05ac18912e42ea1dd3c229ea877895f964b2fcd2b1a46ff17dbc.sqlite');

console.log('Importing QC records...\n');

function excelDateToISO(excelDate) {
  if (!excelDate || isNaN(excelDate)) return null;
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

// Read QC data
const qc = XLSX.readFile('/home/user/uploaded_files/QC Sheet.xlsx');
const qcData = XLSX.utils.sheet_to_json(qc.Sheets[qc.SheetNames[0]]);
console.log(`Total QC rows: ${qcData.length}`);

const qcStmt = db.prepare(`
  INSERT INTO quality_check (
    inventory_id, device_serial_no, check_date, checked_by, test_results, pass_fail, notes, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

const findInvStmt = db.prepare(`SELECT id FROM inventory WHERE device_serial_no = ? LIMIT 1`);

let qcCount = 0;
let matched = 0;
let notMatched = 0;
const notMatchedList = [];

for (const row of qcData) {
  try {
    const serialNo = String(row['Serial Number'] || '');
    if (!serialNo) continue;
    
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
      invRecord ? invRecord.id : null,  // Now NULL is allowed
      serialNo,
      excelDateToISO(row['QC Date']),
      'Excel Import',
      JSON.stringify(testResults),
      row['Final QC Status'] || 'Pending',
      `Device: ${row['Device Type'] || ''}`
    );
    
    qcCount++;
    if (invRecord) {
      matched++;
    } else {
      notMatched++;
      if (notMatchedList.length < 20) {
        notMatchedList.push(serialNo);
      }
    }
  } catch (err) {
    console.error(`Error inserting QC row: ${err.message}`);
  }
}

console.log(`✓ Imported ${qcCount} QC records`);
console.log(`  - Matched with inventory: ${matched}`);
console.log(`  - Not matched (no inventory_id): ${notMatched}`);

if (notMatchedList.length > 0) {
  console.log(`\nFirst ${notMatchedList.length} unmatched serial numbers:`);
  notMatchedList.forEach(sn => console.log(`  - ${sn}`));
}

// Verify
const total = db.prepare(`SELECT COUNT(*) as count FROM quality_check`).get();
console.log(`\n✅ Total QC records in database: ${total.count}`);

db.close();
console.log('\nDone!');
