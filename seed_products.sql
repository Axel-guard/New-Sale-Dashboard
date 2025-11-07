-- Insert Categories
INSERT INTO product_categories (id, category_name) VALUES
(1, 'A-MDVR'),
(2, 'B-Monitors & Monitor Kit'),
(3, 'C-Cameras'),
(4, 'D-Dashcam'),
(5, 'E-GPS'),
(6, 'F-Storage'),
(7, 'G-RFID Tags'),
(8, 'H-RFID Reader'),
(9, 'I-MDVR Accessories'),
(10, 'J-Other Products');

-- Insert A-MDVR Products
INSERT INTO products (product_name, category_id, unit_price) VALUES
('4ch 1080p SD Card MDVR (MR9504EC)', 1, 0),
('4ch 1080p HDD MDVR (MR9704C)', 1, 0),
('4ch 1080p SD, 4G, GPS MDVR (MR9504E)', 1, 0),
('4ch 1080p SD, 4G, GPS MDVR (MR9504E-A3)', 1, 0),
('4ch 1080p HDD, 4G, GPS MDVR (MR9704E)', 1, 0),
('4ch 1080p SD, 4G, wifi, GPS MDVR (MA9504ED)', 1, 0),
('TVS 4ch 1080p SD, 4G, GPS MDVR', 1, 0),
('5ch MDVR SD 4g + GPS + LAN + RS232 + RS485', 1, 0),
('5ch MDVR HDD 4g + GPS + LAN + RS232 + RS485', 1, 0),
('8ch HDD 4g+GPS MDVR (MR9708C)', 1, 0),
('AI MDVR with (DSM + ADAS) (SD+ 4g + GPS)', 1, 0),
('AI MDVR with (DSM + ADAS) (SD+HDD+ 4g + GPS)', 1, 0);

-- Insert B-Monitors & Monitor Kit Products
INSERT INTO products (product_name, category_id, unit_price) VALUES
('7" AV Monitor', 2, 0),
('7" VGA Monitor', 2, 0),
('7" HDMI Monitor', 2, 0),
('7inch Heavy Duty VGA Monitor', 2, 0),
('4inch AV monitor', 2, 0),
('4k Recording monitor kit', 2, 0),
('720 2ch Recording Monitor Kit', 2, 0),
('4k Recording monitor kit 4ch', 2, 0),
('4k Recording monitor kit 2ch', 2, 0);

-- Insert C-Cameras Products
INSERT INTO products (product_name, category_id, unit_price) VALUES
('2 MP IR indoor Dome Camera', 3, 0),
('2 MP IR Outdoor Bullet Camera', 3, 0),
('2 MP Heavy Duty Bullet Camera', 3, 0),
('2 MP Heavy Duty Dome Camera', 3, 0),
('PTZ Camera', 3, 0),
('4k Monitor Camera', 3, 0),
('Replacement Bullet Camera 2mp', 3, 0),
('Replacement Dome Camera 2 mp', 3, 0),
('Replacement Dome Audio Camera', 3, 0),
('Reverse Camera', 3, 0),
('2mp IR Audio Camera', 3, 0),
('DFMS Camera', 3, 0),
('ADAS Camera', 3, 0),
('BSD Camera', 3, 0),
('MDVR IP Camera 2mp', 3, 0),
('2mp IP Dome Audio Camera', 3, 0),
('2 MP IP Camera', 3, 0),
('2mp Heavy Duty Dome Camera (Waterproof)', 3, 0);

-- Insert D-Dashcam Products
INSERT INTO products (product_name, category_id, unit_price) VALUES
('4 Inch 2 Ch Dashcam', 4, 0),
('10 inch 2 Ch Full Touch Dashcam', 4, 0),
('10 inch 2 Ch 4g, GPS, Android Dashcam', 4, 0),
('4k Dashcam 12 inch', 4, 0),
('2k 12 inch Dashcam', 4, 0),
('2ch 4g Dashcam MT95L', 4, 0),
('3ch 4g Dahscam with Rear Camera (MT95L-A3)', 4, 0),
('3ch AI Dashcam ADAS + DSM (MT95L-A3)', 4, 0),
('3ch AI Dashcam ADAS + DSM (MT95C)', 4, 0),
('2CH AI Dashcam ADAS+ DSM (C6 Lite)', 4, 0),
('Wifi Dash Cam', 4, 0),
('4 inch 3 camera Dash Cam', 4, 0),
('4inch Android Dashcam', 4, 0);

-- Insert E-GPS Products
INSERT INTO products (product_name, category_id, unit_price) VALUES
('RealTrack GPS', 5, 0),
('GPS Renewal', 5, 0);

-- Insert F-Storage Products
INSERT INTO products (product_name, category_id, unit_price) VALUES
('Surveillance Grade 64GB SD Card', 6, 0),
('Surveillance Grade 128GB SD Card', 6, 0),
('Surveillance Grade 256GB SD Card', 6, 0),
('Surveillance Grade 512GB SD Card', 6, 0),
('HDD 1 TB', 6, 0);

-- Insert G-RFID Tags Products
INSERT INTO products (product_name, category_id, unit_price) VALUES
('2.4G RFID Animal Ear Tag', 7, 0),
('2.4G Active Tag (Card Type) HX607', 7, 0),
('MR 6700A UHF Passive Electronic tag', 7, 0),
('UHF Windshield Tag MR6740A', 7, 0);

-- Insert H-RFID Reader Products
INSERT INTO products (product_name, category_id, unit_price) VALUES
('2.4 GHZ RFID Active Reader (Bus)', 8, 0),
('2.4 GHZ RFID Active Reader (Campus)', 8, 0),
('2.4G IOT Smart RFID Reader (ZR7901P)', 8, 0),
('2.4 G-Hz Omni-directional RFID Reader (MR3102E)', 8, 0),
('RFID UHF Long Range Integrated Reader (MR6211E)', 8, 0);

-- Insert I-MDVR Accessories Products
INSERT INTO products (product_name, category_id, unit_price) VALUES
('MDVR Loud Audio Speaker', 9, 0),
('2 way Communication Device', 9, 0),
('MDVR Maintenance Tool', 9, 0),
('MDVR Remote', 9, 0),
('MDVR Panic Button', 9, 0),
('MDVR Server', 9, 0),
('RS 232 Adaptor', 9, 0),
('5mt Cable', 9, 0),
('15mt Cable', 9, 0),
('10mt Cable', 9, 0),
('VGA Cable', 9, 0),
('Alcohol Tester', 9, 0),
('Ultra Sonic Fuel Sensor', 9, 0),
('Rod Type Fuel Sensor', 9, 0),
('1mt Cable', 9, 0),
('3mt Cable', 9, 0),
('Panic Button', 9, 0),
('Male Connector', 9, 0);

-- Insert J-Other Products
INSERT INTO products (product_name, category_id, unit_price) VALUES
('Courier', 10, 0),
('Leaser Printer', 10, 0),
('D link Wire Bundle', 10, 0),
('Wireless Receiver Transmitter', 10, 0),
('Parking Sensor', 10, 0),
('MDVR Installation', 10, 0),
('GPS Installation', 10, 0),
('Annual Maintenance Charges', 10, 0);
