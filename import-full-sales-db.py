#!/usr/bin/env python3
"""Import full sales database, preserving October 2025 data"""

import openpyxl
import sys
from datetime import datetime

def clean_value(val):
    """Clean cell value"""
    if val is None:
        return ''
    val_str = str(val).strip()
    return val_str.replace("'", "''")

def parse_amount(val):
    """Parse currency amount"""
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        return float(val)
    val_str = str(val).replace('₹', '').replace(',', '').replace(' ', '').strip()
    try:
        return float(val_str)
    except:
        return 0

def parse_date(val):
    """Parse date to ISO format"""
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d %H:%M:%S')
    if val is None or str(val).strip() == '':
        return None
    # Try to parse string dates
    val_str = str(val).strip()
    try:
        dt = datetime.strptime(val_str, '%Y-%m-%d %H:%M:%S')
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except:
        pass
    try:
        dt = datetime.strptime(val_str, '%d/%m/%Y %H:%M:%S')
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except:
        pass
    return None

def map_employee_name(name):
    """Map employee names"""
    if not name:
        return 'Unknown'
    name_str = str(name).strip()
    if 'Akash' in name_str or 'akash' in name_str:
        return 'Akash Parashar'
    if 'Mandeep' in name_str or 'mandeep' in name_str:
        return 'Mandeep Samal'
    if 'Smruti' in name_str or 'smruti' in name_str:
        return 'Smruti Ranjan Nayak'
    if 'Divyanshu' in name_str or 'divyanshu' in name_str:
        return 'Divyanshu Tripathi'
    return name_str

def main():
    wb = openpyxl.load_workbook('/tmp/saledatabase.xlsx', read_only=True, data_only=True)
    ws = wb.active
    
    rows = list(ws.iter_rows(values_only=True))
    
    if len(rows) < 2:
        print("No data found")
        return
    
    header = rows[0]
    print(f"Processing {len(rows)-1} sales records...")
    
    # SQL to delete old sales (before October 2025)
    delete_sql = "DELETE FROM sales WHERE sale_date < '2025-10-01';\n"
    delete_sql += "DELETE FROM sale_items WHERE order_id NOT IN (SELECT order_id FROM sales);\n"
    delete_sql += "DELETE FROM payment_history WHERE order_id NOT IN (SELECT order_id FROM sales);\n\n"
    
    sql_statements = [delete_sql]
    imported = 0
    skipped = 0
    
    for row in rows[1:]:
        if not row or not row[2]:  # Skip if no order_id
            continue
        
        # Parse fields
        order_id = clean_value(row[2])
        if not order_id:
            continue
        
        sale_date = parse_date(row[3])
        if not sale_date:
            skipped += 1
            continue
        
        # Skip October 2025 sales (already in database)
        if sale_date >= '2025-10-01':
            skipped += 1
            continue
        
        customer_code = clean_value(row[4])
        employee_name = map_employee_name(row[5])
        company_name = clean_value(row[6])
        customer_name = clean_value(row[7])
        mobile_number = clean_value(row[8])
        
        bill_amount = parse_amount(row[9])
        amount_received = parse_amount(row[10])
        balance_payment = parse_amount(row[11])
        round_off = parse_amount(row[12])
        
        # Determine sale type
        with_bill = str(row[13] or '').strip().lower()
        if with_bill in ['yes', 'with bill', 'with']:
            sale_type = 'With'
        else:
            sale_type = 'Without'
        
        # Calculate amounts
        courier = parse_amount(row[43])
        total_sale_amount = parse_amount(row[44])
        
        if total_sale_amount > 0:
            subtotal = total_sale_amount
        else:
            subtotal = bill_amount
        
        gst_amount = subtotal * 0.18 if sale_type == 'With' else 0
        total_amount = subtotal + courier + round_off
        
        remarks = clean_value(row[46])
        payment_ref = clean_value(row[45])
        
        # Insert sale
        sale_sql = f"""INSERT OR IGNORE INTO sales (
  order_id, customer_code, customer_name, company_name, customer_contact,
  sale_date, employee_name, sale_type, courier_cost, amount_received, 
  balance_amount, remarks, subtotal, gst_amount, total_amount, 
  account_received, payment_reference
) VALUES (
  '{order_id}', '{customer_code}', '{customer_name}', '{company_name}', '{mobile_number}',
  '{sale_date}', '{employee_name}', '{sale_type}', {courier}, {amount_received},
  {balance_payment}, '{remarks}', {subtotal}, {gst_amount}, {total_amount},
  'IDFC', '{payment_ref}'
);
"""
        sql_statements.append(sale_sql)
        
        # Parse products (P1-P6)
        products = []
        product_configs = [
            (17, 18, 19, 20),  # P1
            (22, 23, 24, 25),  # P2
            (27, 28, 29, 30),  # P3
            (31, 32, 33, 34),  # P4
            (35, 36, 37, 38),  # P5
            (39, 40, 41, 42),  # P6
        ]
        
        for code_idx, name_idx, qty_idx, rate_idx in product_configs:
            if len(row) > name_idx and row[name_idx]:
                product_name = clean_value(row[name_idx])
                quantity = parse_amount(row[qty_idx]) if len(row) > qty_idx else 0
                unit_price = parse_amount(row[rate_idx]) if len(row) > rate_idx else 0
                
                if product_name and quantity > 0 and unit_price > 0:
                    products.append({
                        'name': product_name,
                        'quantity': quantity,
                        'price': unit_price
                    })
        
        # Insert sale items
        for product in products:
            item_sql = f"""INSERT INTO sale_items (order_id, product_name, quantity, unit_price)
VALUES ('{order_id}', '{product['name']}', {product['quantity']}, {product['price']});
"""
            sql_statements.append(item_sql)
        
        # Insert payment history if amount received
        if amount_received > 0:
            payment_sql = f"""INSERT INTO payment_history (order_id, payment_date, amount, account_received, payment_reference)
VALUES ('{order_id}', '{sale_date}', {amount_received}, 'IDFC', '{payment_ref}');
"""
            sql_statements.append(payment_sql)
        
        imported += 1
    
    # Write SQL to file
    with open('/tmp/import-full-sales-db.sql', 'w', encoding='utf-8') as f:
        f.write(''.join(sql_statements))
    
    print(f'\nProcessed: {imported} sales')
    print(f'Skipped: {skipped} (October 2025 or invalid)')
    print(f'SQL written to /tmp/import-full-sales-db.sql')
    print(f'Total SQL statements: {len(sql_statements)}')

if __name__ == '__main__':
    main()
