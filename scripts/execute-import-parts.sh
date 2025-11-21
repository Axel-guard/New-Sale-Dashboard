#!/bin/bash
# Execute historical data import in parts to avoid connection timeouts

cd /home/user/webapp

echo "═══════════════════════════════════════════════════════════════════════════"
echo "              HISTORICAL DATA IMPORT - PART BY PART"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Extract different sections from the main SQL file
SQL_FILE="/tmp/historical_import.sql"

# PART 1: Sales (already done, but include for completeness)
echo "📊 Part 1: Importing Sales Records..."
awk '/BEGIN TRANSACTION/,/PART 2:/' $SQL_FILE | head --bytes=500K > /tmp/import_p1_sales.sql
echo "COMMIT;" >> /tmp/import_p1_sales.sql
npx wrangler d1 execute webapp-production --local --file=/tmp/import_p1_sales.sql > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Sales imported successfully"
else
  echo "❌ Sales import failed"
fi

# PART 2: Sale Items
echo ""
echo "📦 Part 2: Importing Sale Items..."
awk '/PART 2: Import Sale Items/,/PART 3:/' $SQL_FILE > /tmp/import_p2_items.sql
echo "BEGIN TRANSACTION;" > /tmp/import_p2_items_wrapped.sql
cat /tmp/import_p2_items.sql >> /tmp/import_p2_items_wrapped.sql
echo "COMMIT;" >> /tmp/import_p2_items_wrapped.sql
npx wrangler d1 execute webapp-production --local --file=/tmp/import_p2_items_wrapped.sql 2>&1 | tail -3
if [ $? -eq 0 ]; then
  echo "✅ Sale items imported successfully"
else
  echo "❌ Sale items import failed"
fi

# PART 3: Inventory (split into 6 chunks of ~1000 devices each)
echo ""
echo "📦 Part 3: Importing Inventory (in chunks)..."
awk '/PART 3: Import Inventory/,/PART 4:/' $SQL_FILE > /tmp/import_p3_inventory_full.sql

# Split inventory into smaller files
split -l 1500 /tmp/import_p3_inventory_full.sql /tmp/inventory_chunk_

chunk_count=0
for chunk in /tmp/inventory_chunk_*; do
  ((chunk_count++))
  echo "  Processing inventory chunk $chunk_count..."
  
  # Wrap in transaction
  echo "BEGIN TRANSACTION;" > ${chunk}.sql
  cat $chunk >> ${chunk}.sql
  echo "COMMIT;" >> ${chunk}.sql
  
  npx wrangler d1 execute webapp-production --local --file=${chunk}.sql > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "  ✅ Chunk $chunk_count done"
  else
    echo "  ❌ Chunk $chunk_count failed"
  fi
  
  rm ${chunk} ${chunk}.sql
done

echo "✅ All inventory chunks processed"

# PART 4: Dispatch Records (split into chunks)
echo ""
echo "🚚 Part 4: Importing Dispatch Records (in chunks)..."
awk '/PART 4: Import Dispatch Records/,/COMMIT;/' $SQL_FILE > /tmp/import_p4_dispatch_full.sql

# Split dispatch into smaller files
split -l 1500 /tmp/import_p4_dispatch_full.sql /tmp/dispatch_chunk_

chunk_count=0
for chunk in /tmp/dispatch_chunk_*; do
  ((chunk_count++))
  echo "  Processing dispatch chunk $chunk_count..."
  
  # Wrap in transaction
  echo "BEGIN TRANSACTION;" > ${chunk}.sql
  cat $chunk >> ${chunk}.sql
  echo "COMMIT;" >> ${chunk}.sql
  
  npx wrangler d1 execute webapp-production --local --file=${chunk}.sql > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "  ✅ Chunk $chunk_count done"
  else
    echo "  ❌ Chunk $chunk_count failed"
  fi
  
  rm ${chunk} ${chunk}.sql
done

echo "✅ All dispatch chunks processed"

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "                         IMPORT COMPLETE!"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "Verifying import..."
npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as sales FROM sales;" 2>&1 | grep -A 3 "results"
npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as inventory FROM inventory;" 2>&1 | grep -A 3 "results"
npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as dispatches FROM dispatch_records;" 2>&1 | grep -A 3 "results"
