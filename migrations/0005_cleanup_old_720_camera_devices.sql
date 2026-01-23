-- Migration: Clean up old/historical 720 Heavy Duty Bullet Camera devices
-- Keep only the new AXGBZ devices added on 2026-01-23
-- Change old AXGBR devices back to their original model name (to hide from reports)

-- Update old AXGBR devices back to original model name (so they don't appear in 720 camera reports)
UPDATE inventory 
SET model_name = '2mp Heavy Duty Dome Camera (Waterproof)',
    updated_at = CURRENT_TIMESTAMP
WHERE model_name = '720 Heavy Duty Bullet Camera'
  AND device_serial_no LIKE 'AXGBR%'
  AND created_at < '2026-01-23';

-- Delete the typo device AXGZ1
DELETE FROM inventory 
WHERE device_serial_no = 'AXGZ1';

-- Note: This will leave only AXGBZ1-AXGBZ20 (20 devices) showing in 720 camera reports
