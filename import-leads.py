#!/usr/bin/env python3
"""Import leads data from Excel to production database"""

import openpyxl
import sys

def clean_value(val):
    """Clean cell value - convert to string and escape quotes"""
    if val is None:
        return ''
    val_str = str(val).strip()
    # Escape single quotes for SQL
    return val_str.replace("'", "''")

def main():
    # Open Excel file
    wb = openpyxl.load_workbook('/tmp/leads.xlsx', read_only=True, data_only=True)
    ws = wb.active
    
    # Get all rows
    rows = list(ws.iter_rows(values_only=True))
    
    if len(rows) < 2:
        print("No data found in Excel file")
        return
    
    # First row is header
    header = rows[0]
    print(f"Found {len(rows)-1} lead records")
    print(f"Columns: {header}")
    
    # Expected columns based on schema:
    # customer_code, customer_name, mobile_number, alternate_mobile, location, 
    # company_name, gst_number, email, complete_address, status
    
    sql_statements = []
    count = 0
    
    for row in rows[1:]:  # Skip header
        if not row or not row[0]:  # Skip empty rows
            continue
            
        # Map columns to database fields based on actual Excel structure:
        # 0: Cust Code
        # 1: Date
        # 2: Customer Name
        # 3: Location
        # 4: Mobile Number
        # 5: Follow Up Person
        # 6: Remarks
        # 7: Cust Email id
        # 8: Company Name
        # 9: GST Number
        # 10: Company Address
        customer_code = clean_value(row[0]) if len(row) > 0 else ''
        customer_name = clean_value(row[2]) if len(row) > 2 else ''
        mobile_number = clean_value(row[4]) if len(row) > 4 else ''
        alternate_mobile = ''  # Not in Excel
        location = clean_value(row[3]) if len(row) > 3 else ''
        company_name = clean_value(row[8]) if len(row) > 8 else ''
        gst_number = clean_value(row[9]) if len(row) > 9 else ''
        email = clean_value(row[7]) if len(row) > 7 else ''
        complete_address = clean_value(row[10]) if len(row) > 10 else ''
        status = 'New'  # Default status
        
        # Skip if no customer code or name
        if not customer_code and not customer_name:
            continue
        
        # Generate customer code if missing
        if not customer_code:
            count += 1
            customer_code = f'LEAD{count:04d}'
        
        # Build SQL statement
        sql = f"""INSERT OR IGNORE INTO leads (
  customer_code, customer_name, mobile_number, alternate_mobile, location,
  company_name, gst_number, email, complete_address, status
) VALUES (
  '{customer_code}',
  '{customer_name}',
  '{mobile_number}',
  '{alternate_mobile}',
  '{location}',
  '{company_name}',
  '{gst_number}',
  '{email}',
  '{complete_address}',
  '{status if status else 'New'}'
);"""
        sql_statements.append(sql)
        count += 1
    
    # Write SQL to file
    with open('/tmp/import-leads.sql', 'w', encoding='utf-8') as f:
        f.write('\n'.join(sql_statements))
    
    print(f'Parsed {count} lead records')
    print(f'SQL statements written to /tmp/import-leads.sql')
    print(f'Total SQL statements: {len(sql_statements)}')

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'Error: {e}', file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
