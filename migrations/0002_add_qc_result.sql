-- Add qc_result column to inventory table
-- Migration: 0002_add_qc_result
-- Date: 2026-01-23
-- Purpose: Enable QC Pass/Fail tracking in inventory

ALTER TABLE inventory ADD COLUMN qc_result TEXT CHECK(qc_result IN ('QC Pass', 'QC Fail', NULL));
