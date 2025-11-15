const fs = require('fs');
const Database = require('better-sqlite3');

console.log('=== Direct Database Import ===\n');

// Open local D1 database (the correct one with data)
const dbPath = '/home/user/webapp/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a4cbf95b06cc05ac18912e42ea1dd3c229ea877895f964b2fcd2b1a46ff17dbc.sqlite';
const db = new Database(dbPath);

// Load processed data
const inventoryData = JSON.parse(fs.readFileSync('/home/user/webapp/inventory_processed.json', 'utf8'));
const qcData = JSON.parse(fs.readFileSync('/home/user/webapp/qc_processed.json', 'utf8'));

console.log(`Loaded ${inventoryData.length} inventory records`);
console.log(`Loaded ${qcData.length} QC records\n`);

// Prepare statements
const insertInventory = db.prepare(`
  INSERT OR REPLACE INTO inventory (
    device_serial_no, model_name, in_date, dispatch_date, sale_date,
    customer_name, cust_code, cust_city, cust_mobile, dispatch_reason,
    warranty_provide, status, order_id, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

const updateQC = db.prepare(`
  UPDATE quality_check SET
    sd_connect = ?, all_ch_status = ?, network = ?, gps = ?,
    sim_slot = ?, online = ?, camera_quality = ?, monitor = ?,
    final_status = ?, ip_address = ?, pass_fail = ?, notes = ?
  WHERE device_serial_no = ?
`);

// Import inventory in transaction
console.log('=== Importing Inventory ===');
const invStart = Date.now();
db.exec('BEGIN TRANSACTION');

let invInserted = 0;
for (const record of inventoryData) {
  try {
    insertInventory.run(
      record.device_serial_no, record.model_name, record.in_date,
      record.dispatch_date, record.sale_date, record.customer_name,
      record.cust_code, record.cust_city, record.cust_mobile,
      record.dispatch_reason, record.warranty_provide, record.status,
      record.order_id
    );
    invInserted++;
    if (invInserted % 1000 === 0) {
      console.log(`  Progress: ${invInserted}/${inventoryData.length}`);
    }
  } catch (err) {
    console.error(`Error inserting ${record.device_serial_no}:`, err.message);
  }
}

db.exec('COMMIT');
const invTime = ((Date.now() - invStart) / 1000).toFixed(2);
console.log(`✓ Inventory import complete: ${invInserted} records in ${invTime}s\n`);

// Import QC updates in transaction
console.log('=== Updating QC Records ===');
const qcStart = Date.now();
db.exec('BEGIN TRANSACTION');

let qcUpdated = 0;
for (const record of qcData) {
  try {
    const result = updateQC.run(
      record.sd_connect, record.all_ch_status, record.network, record.gps,
      record.sim_slot, record.online, record.camera_quality, record.monitor,
      record.final_status, record.ip_address, record.pass_fail, record.notes,
      record.device_serial_no
    );
    if (result.changes > 0) {
      qcUpdated++;
    }
    if (qcUpdated % 500 === 0) {
      console.log(`  Progress: ${qcUpdated}/${qcData.length}`);
    }
  } catch (err) {
    console.error(`Error updating QC for ${record.device_serial_no}:`, err.message);
  }
}

db.exec('COMMIT');
const qcTime = ((Date.now() - qcStart) / 1000).toFixed(2);
console.log(`✓ QC update complete: ${qcUpdated} records updated in ${qcTime}s\n`);

// Verify counts
const invCount = db.prepare('SELECT COUNT(*) as count FROM inventory').get();
const qcCount = db.prepare('SELECT COUNT(*) as count FROM quality_check').get();
const qcWithData = db.prepare(`
  SELECT COUNT(*) as count FROM quality_check 
  WHERE sd_connect IS NOT NULL AND sd_connect != 'null'
`).get();

console.log('=== VERIFICATION ===');
console.log(`Total Inventory Records: ${invCount.count}`);
console.log(`Total QC Records: ${qcCount.count}`);
console.log(`QC Records with Data: ${qcWithData.count}`);

// Sample data
console.log('\n=== SAMPLE INVENTORY ===');
const sampleInv = db.prepare(`
  SELECT device_serial_no, model_name, in_date, order_id, customer_name 
  FROM inventory LIMIT 3
`).all();
console.log(JSON.stringify(sampleInv, null, 2));

console.log('\n=== SAMPLE QC ===');
const sampleQC = db.prepare(`
  SELECT device_serial_no, check_date, sd_connect, all_ch_status, network, gps, final_status 
  FROM quality_check 
  WHERE sd_connect IS NOT NULL AND sd_connect != 'null'
  LIMIT 3
`).all();
console.log(JSON.stringify(sampleQC, null, 2));

db.close();
console.log('\n✓ Database import complete!');
