#!/usr/bin/env python3
"""Analyze the sales Excel file structure"""

import openpyxl
import sys

def main():
    wb = openpyxl.load_workbook('/tmp/saledatabase.xlsx', read_only=True, data_only=True)
    ws = wb.active
    
    rows = list(ws.iter_rows(values_only=True))
    
    if len(rows) < 2:
        print("No data found")
        return
    
    # First row is header
    header = rows[0]
    print(f"Total rows: {len(rows)-1}")
    print(f"\nColumns ({len(header)}):")
    for i, col in enumerate(header):
        print(f"  {i}: {col}")
    
    print(f"\n\nFirst 3 data rows:")
    for i, row in enumerate(rows[1:4]):
        print(f"\nRow {i+2}:")
        for j, val in enumerate(row[:20]):  # Show first 20 columns
            if val:
                print(f"  {j} ({header[j]}): {val}")

if __name__ == '__main__':
    main()
