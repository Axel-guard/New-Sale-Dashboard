const fs = require('fs');
const axios = require('axios');

async function importInventory() {
  console.log('=== Importing Inventory Data ===\n');
  
  // Load processed inventory data
  const inventoryData = JSON.parse(fs.readFileSync('/home/user/webapp/inventory_processed.json', 'utf8'));
  console.log(`Total records to import: ${inventoryData.length}`);
  
  // Batch size for API calls
  const BATCH_SIZE = 100;
  const batches = [];
  
  for (let i = 0; i < inventoryData.length; i += BATCH_SIZE) {
    batches.push(inventoryData.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Split into ${batches.length} batches of ${BATCH_SIZE} records each\n`);
  
  let totalSuccess = 0;
  let totalFailed = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} records)...`);
    
    try {
      // Transform data to match API format (must match API's column name expectations)
      const apiPayload = {
        items: batch.map(record => ({
          device_serial_no: record.device_serial_no,
          model_name: record.model_name,
          'In_Date': record.in_date,
          'Dispatch Date': record.dispatch_date,
          'Sale Date': record.sale_date,
          'Customer Name': record.customer_name,
          'Cust Code': record.cust_code,
          'Cust City': record.cust_city,
          'Cust Mobile': record.cust_mobile,
          'Dispatch Reason': record.dispatch_reason,
          'Warranty Provide': record.warranty_provide,
          'Order Id': record.order_id
        }))
      };
      
      const response = await axios.post('http://localhost:3000/api/inventory/upload', apiPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      });
      
      if (response.data.success) {
        const stats = response.data.stats;
        const inserted = stats.inserted || 0;
        const updated = stats.updated || 0;
        const errors = stats.errors || 0;
        totalSuccess += (inserted + updated);
        totalFailed += errors;
        console.log(`  ✓ Batch ${i + 1}: Inserted=${inserted}, Updated=${updated}, Errors=${errors}`);
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
  
  console.log('\n=== INVENTORY IMPORT SUMMARY ===');
  console.log(`Total Successful: ${totalSuccess}`);
  console.log(`Total Failed: ${totalFailed}`);
  console.log(`Success Rate: ${((totalSuccess / inventoryData.length) * 100).toFixed(2)}%`);
}

importInventory().catch(error => {
  console.error('Import failed:', error);
  process.exit(1);
});
