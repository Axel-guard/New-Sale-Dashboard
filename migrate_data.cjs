const fs = require('fs');

console.log('=== Data Migration Script ===\n');

// Load parsed data
const qcData = JSON.parse(fs.readFileSync('/home/user/webapp/qc_data.json', 'utf8'));
const invData = JSON.parse(fs.readFileSync('/home/user/webapp/inventory_data.json', 'utf8'));

console.log(`Loaded ${qcData.length} QC records`);
console.log(`Loaded ${invData.length} Inventory records\n`);

// Helper function to convert Excel date serial number to YYYY-MM-DD
function excelDateToString(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel dates are days since 1900-01-01 (with 1900 leap year bug)
  const excelEpoch = new Date(1900, 0, 1);
  const daysOffset = serial - 2; // Account for Excel's 1900 leap year bug
  const date = new Date(excelEpoch.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

// Helper function to normalize QC values
function normalizeQCValue(value) {
  if (!value || value === '') return null;
  return String(value).trim();
}

// Process Inventory Data
console.log('=== Processing Inventory Data ===');
const inventoryRecords = invData.map((row, index) => {
  // Extract and clean data
  const deviceSerialNo = row['Device Serial_No'] ? String(row['Device Serial_No']).trim() : null;
  const modelName = row['Model_Name'] ? String(row['Model_Name']).trim() : null;
  const inDate = excelDateToString(row['In_Date']);
  const dispatchDate = excelDateToString(row['Dispatch Date']);
  const saleDate = excelDateToString(row['Sale Date']);
  const customerName = row['Customer Name'] ? String(row['Customer Name']).trim() : null;
  const custCode = row['Cust Code'] ? String(row['Cust Code']).trim() : null;
  const custCity = row['Cust City'] ? String(row['Cust City']).trim() : null;
  const custMobile = row['Cust Mobile'] ? String(row['Cust Mobile']).trim() : null;
  const dispatchReason = row['Dispatch Reason'] ? String(row['Dispatch Reason']).trim() : null;
  const warrantyProvide = row['Warranty Provide'] ? String(row['Warranty Provide']).trim() : null;
  
  if (!deviceSerialNo) {
    console.warn(`Row ${index + 1}: Missing device serial number, skipping`);
    return null;
  }
  
  // Determine status based on dispatch date
  let status = 'In Stock';
  if (dispatchDate) {
    status = 'Dispatched';
  }
  
  return {
    device_serial_no: deviceSerialNo,
    model_name: modelName,
    in_date: inDate,
    dispatch_date: dispatchDate,
    sale_date: saleDate,
    customer_name: customerName,
    cust_code: custCode,
    cust_city: custCity,
    cust_mobile: custMobile,
    dispatch_reason: dispatchReason,
    warranty_provide: warrantyProvide,
    status: status,
    order_id: custCode // Use customer code as order_id
  };
}).filter(record => record !== null);

console.log(`✓ Processed ${inventoryRecords.length} valid inventory records`);
fs.writeFileSync('/home/user/webapp/inventory_processed.json', JSON.stringify(inventoryRecords, null, 2));
console.log('✓ Saved to inventory_processed.json\n');

// Process QC Data
console.log('=== Processing QC Data ===');
const qcRecords = qcData.map((row, index) => {
  // Extract and clean data
  const serialNumber = row['Serial Number'] ? String(row['Serial Number']).trim() : null;
  const qcDate = excelDateToString(row['QC Date']);
  const deviceType = row['Device Type'] ? String(row['Device Type']).trim() : null;
  
  // Extract all QC parameters
  const sdConnect = normalizeQCValue(row['SD Connectivity QC']);
  const allChStatus = normalizeQCValue(row['All Ch QC Status']);
  const network = normalizeQCValue(row['Network Connectivity QC']);
  const gps = normalizeQCValue(row['GPS QC']);
  const simSlot = normalizeQCValue(row['SIM card Slot QC']);
  const online = normalizeQCValue(row['Online QC']);
  const cameraQuality = normalizeQCValue(row['Camera Quality (For Camera)']);
  const monitor = normalizeQCValue(row['For Monitor QC Stauts']);
  const finalStatus = normalizeQCValue(row['Final QC Status']);
  const ipAddress = normalizeQCValue(row['IP Address Update Status']);
  
  if (!serialNumber) {
    console.warn(`Row ${index + 1}: Missing serial number, skipping`);
    return null;
  }
  
  // Determine pass/fail from final status
  let passFail = 'Pending';
  if (finalStatus) {
    if (finalStatus.toLowerCase().includes('pass')) passFail = 'Pass';
    else if (finalStatus.toLowerCase().includes('fail')) passFail = 'Fail';
  }
  
  return {
    device_serial_no: serialNumber,
    check_date: qcDate || '2025-05-15',
    checked_by: 'Excel Import',
    device_type: deviceType,
    sd_connect: sdConnect,
    all_ch_status: allChStatus,
    network: network,
    gps: gps,
    sim_slot: simSlot,
    online: online,
    camera_quality: cameraQuality,
    monitor: monitor,
    final_status: finalStatus,
    ip_address: ipAddress,
    pass_fail: passFail,
    test_results: `SD:${sdConnect}, Ch:${allChStatus}, Net:${network}, GPS:${gps}`,
    notes: `Device Type: ${deviceType}`
  };
}).filter(record => record !== null);

console.log(`✓ Processed ${qcRecords.length} valid QC records`);
fs.writeFileSync('/home/user/webapp/qc_processed.json', JSON.stringify(qcRecords, null, 2));
console.log('✓ Saved to qc_processed.json\n');

// Statistics
console.log('=== MIGRATION SUMMARY ===');
console.log(`Inventory Records Ready: ${inventoryRecords.length}`);
console.log(`QC Records Ready: ${qcRecords.length}`);
console.log('\nSample Inventory Record:');
console.log(JSON.stringify(inventoryRecords[0], null, 2));
console.log('\nSample QC Record:');
console.log(JSON.stringify(qcRecords[0], null, 2));
console.log('\n✓ Data processing complete. Ready for import.');
