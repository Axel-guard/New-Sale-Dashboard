const fs = require('fs');
const axios = require('axios');

async function importQC() {
  console.log('=== Importing QC Data ===\n');
  
  // Load processed QC data
  const qcData = JSON.parse(fs.readFileSync('/home/user/webapp/qc_processed.json', 'utf8'));
  console.log(`Total records to import: ${qcData.length}`);
  
  // Batch size for API calls
  const BATCH_SIZE = 100;
  const batches = [];
  
  for (let i = 0; i < qcData.length; i += BATCH_SIZE) {
    batches.push(qcData.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Split into ${batches.length} batches of ${BATCH_SIZE} records each\n`);
  
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalNotFound = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} records)...`);
    
    try {
      // Transform data to match API format
      const apiPayload = {
        items: batch.map(record => ({
          'Device Serial Number': record.device_serial_no,
          'QC Date': record.check_date,
          'Checked By': record.checked_by,
          'SD Connect': record.sd_connect,
          'All Ch Status': record.all_ch_status,
          'Network': record.network,
          'GPS': record.gps,
          'SIM Slot': record.sim_slot,
          'Online': record.online,
          'Camera Quality': record.camera_quality,
          'Monitor': record.monitor,
          'Final Status': record.final_status,
          'IP Address': record.ip_address,
          'Notes': record.notes
        }))
      };
      
      const response = await axios.post('http://localhost:3000/api/inventory/upload-qc', apiPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      });
      
      if (response.data.success) {
        const { matched, qcCreated, notFound } = response.data.data;
        totalSuccess += qcCreated;
        totalNotFound += notFound;
        console.log(`  ✓ Batch ${i + 1}: Matched=${matched}, Created=${qcCreated}, NotFound=${notFound}`);
      } else {
        console.error(`  ✗ Batch ${i + 1} failed:`, response.data.error);
        totalFailed += batch.length;
      }
    } catch (error) {
      console.error(`  ✗ Batch ${i + 1} error:`, error.message);
      totalFailed += batch.length;
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n=== QC IMPORT SUMMARY ===');
  console.log(`Total QC Created: ${totalSuccess}`);
  console.log(`Total Not Found: ${totalNotFound}`);
  console.log(`Total Failed: ${totalFailed}`);
  console.log(`Success Rate: ${((totalSuccess / qcData.length) * 100).toFixed(2)}%`);
}

importQC().catch(error => {
  console.error('Import failed:', error);
  process.exit(1);
});
