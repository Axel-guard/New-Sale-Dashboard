-- Add product_pricing table
-- Migration: 0003_add_product_pricing
-- Date: 2026-01-23
-- Purpose: Enable quantity-based pricing for products

CREATE TABLE IF NOT EXISTS product_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  qty_0_10 REAL DEFAULT 0,
  qty_10_50 REAL DEFAULT 0,
  qty_50_100 REAL DEFAULT 0,
  qty_100_plus REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE(product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_pricing_product_id ON product_pricing(product_id);
