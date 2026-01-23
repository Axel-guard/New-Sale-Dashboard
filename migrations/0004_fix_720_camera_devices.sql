-- Migration: Fix 720 Heavy Duty Bullet Camera devices
-- Step 1: Update model name for all AXGBR devices
-- Step 2: Keep AXGBR serial numbers as-is (since changing them would require complex mapping)
-- 
-- Current state:
--   - AXGBZ2-AXGBZ20: 19 devices with correct model name "720 Heavy Duty Bullet Camera"
--   - AXGBR1-AXGBR275: 275 devices with wrong model name "2mp Heavy Duty Dome Camera (Waterproof)"
--
-- After this migration:
--   - All AXGBR devices will show "720 Heavy Duty Bullet Camera" in reports
--   - Serial numbers remain AXGBR (to avoid conflicts and preserve history)

UPDATE inventory 
SET model_name = '720 Heavy Duty Bullet Camera',
    updated_at = CURRENT_TIMESTAMP
WHERE device_serial_no LIKE 'AXGBR%'
  AND model_name = '2mp Heavy Duty Dome Camera (Waterproof)';
