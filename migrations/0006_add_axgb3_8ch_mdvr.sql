-- Migration: Add AXGB3 8CH HDD MDVR product
-- Product code: AXGB3
-- Product name: 8CH HDD MDVR
-- Category: MDVR

INSERT OR IGNORE INTO products (product_code, product_name, category, weight, created_at, updated_at) 
VALUES ('AXGB3', '8CH HDD MDVR', 'MDVR', 3.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
