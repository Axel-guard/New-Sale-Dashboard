# 🚀 Order-Based Dispatch Workflow - Complete Guide

**Date:** November 12, 2025  
**Status:** ✅ **FULLY IMPLEMENTED & READY**

---

## 🎉 **What's New**

A complete order-based dispatch system that allows you to:
1. Select an order
2. See customer details and product list
3. Scan barcodes for each product
4. Validate QC status automatically
5. Create dispatch for multiple devices in one go
6. Update docket numbers later

---

## 📋 **Complete Workflow**

### **Step 1: Open Create Dispatch Modal**

1. Go to **Dispatch** page
2. Click the green **"Create Dispatch"** button (top right)
3. A modal will open with order selection

### **Step 2: Select Order**

**Search & Select:**
- Type in the search box to filter orders by:
  - Order ID (e.g., 2019905)
  - Customer Name (e.g., "Jitendra")
  - Company Name
- Click on any order card to select it

**Order Card Shows:**
- Order ID
- Customer Name & Company
- Number of items
- Order Date

### **Step 3: View Order Details**

Once you select an order, you'll see:

**Order Summary (Purple Box):**
- Order ID
- Customer Name & Company
- Order Date

**Products to Dispatch:**
- List of products in this order
- Quantity required for each product
- Category (MDVR, Camera, etc.)
- Real-time scan progress (e.g., "2 / 5 scanned")

### **Step 4: Scan Products**

**Barcode Scanning:**
1. Focus is automatically on the scan input
2. Use your barcode scanner to scan device serial number
3. Press Enter (scanner sends Enter automatically)
4. System validates:
   - ✅ Device exists in inventory
   - ✅ Device not already dispatched
   - ✅ QC status check

**QC Validation:**
- **QC Pass:** ✅ Green message "Device validated successfully!"
- **QC Fail/Pending:** ⚠️ Yellow warning but still allows adding
- **No QC:** ⚠️ Yellow warning "Device has not been QC tested"

**After Each Scan:**
- Device added to "Scanned Devices" list
- Product progress updates (e.g., "3 / 5 scanned")
- Input auto-clears after 1 second
- Ready for next scan

**Features:**
- **Duplicate Check:** Can't scan same device twice
- **Already Dispatched Check:** Shows error if device is already dispatched
- **Remove Device:** Click trash icon to remove from list

### **Step 5: Fill Dispatch Details**

Fill in optional details:
- **Dispatch Date** (required)
- **Courier Company** (e.g., Trackon, Blue Dart)
- **Dispatch Method** (Air, Surface, Priority, Bus, Self Pickup)
- **Notes** (optional)

### **Step 6: Submit Dispatch**

1. Review scanned devices list
2. Verify all details
3. Click **"Create Dispatch (X devices)"** button
4. System will:
   - Create dispatch records for all devices
   - Update inventory status to "Dispatched"
   - Link all devices to Order ID
   - Add to status history
   - Update order status

**Success Message:**
```
✅ Dispatch Created Successfully!

Dispatched: 5 devices
Total Scanned: 5 devices
```

---

## 🔧 **Features Explained**

### **1. QC Validation**

**Automatic Check:**
- When you scan a device, system checks QC records
- Shows QC status in real-time

**QC Status Types:**
- **Pass** (Green) - Device passed all QC tests
- **Fail** (Yellow Warning) - Device failed some tests
- **Pending** (Yellow Warning) - QC not completed
- **NO_QC** (Yellow Warning) - No QC record found

**Behavior:**
- ✅ QC Pass devices can be dispatched normally
- ⚠️ Failed/Pending devices show warning but can still be added (manager approval may be needed)

### **2. Product Category Matching**

**How It Works:**
- Each order has product items (e.g., "5x 4G MDVR")
- When you scan devices, system tracks which product category
- Progress shown: "3 / 5 scanned"

**Visual Indicators:**
- **Orange Number:** Not all devices scanned yet
- **Green Number:** All devices for this product scanned

### **3. Duplicate Prevention**

**Protections:**
- Can't scan same device twice in one dispatch
- Can't scan already-dispatched devices
- Clear error messages for each case

### **4. Docket Number Update**

**Two Ways to Update:**

**Method 1: Single Dispatch**
```
PUT /api/dispatch/:id/docket
{
  "tracking_number": "500515880534",
  "courier_name": "Trackon",
  "dispatch_method": "AIR"
}
```

**Method 2: Bulk Update for Order**
```
PUT /api/orders/:orderId/dockets
{
  "tracking_number": "500515880534",
  "courier_name": "Trackon",
  "dispatch_method": "AIR"
}
```

---

## 📊 **Database Changes**

### **Tables Used:**

1. **orders** - Order headers
   - order_id, customer details, order date, total items

2. **order_items** - Products per order
   - order_id, product_name, category, quantity, serial_numbers

3. **dispatch_records** - Dispatch entries (Updated)
   - Added: order_id, qc_status, dispatch_method, company_name

4. **inventory** - Device records (Updated)
   - Status changes to "Dispatched"
   - order_id field populated

5. **inventory_status_history** - Audit trail
   - Tracks all status changes

---

## 🔌 **API Endpoints**

### **Order Management:**

**GET /api/orders**
- Returns all orders for selection
- Sorted by order_id DESC

**GET /api/orders/:orderId**
- Get order details with products
- Returns order header + items array

### **Device Validation:**

**GET /api/devices/:serialNo/validate**
- Validates device for dispatch
- Checks inventory, QC status, dispatch status
- Returns:
  - device info
  - qc record
  - qcStatus, qcPassed, canDispatch flags

### **Dispatch Creation:**

**POST /api/dispatch/create**
- Create dispatch for multiple devices
- Body:
  ```json
  {
    "order_id": "2019905",
    "customer_name": "Jitendra Maharana",
    "customer_code": "711",
    "company_name": "Company Ltd",
    "dispatch_date": "2025-11-12",
    "devices": [
      {
        "serial_no": "18270900712",
        "model_name": "4ch MDVR",
        "qc_status": "Pass"
      }
    ],
    "courier_name": "Trackon",
    "dispatch_method": "AIR",
    "notes": "Optional"
  }
  ```

### **Docket Updates:**

**PUT /api/dispatch/:id/docket**
- Update single dispatch tracking number

**PUT /api/orders/:orderId/dockets**
- Bulk update all dispatches for an order

---

## ⚡ **Quick Tips**

1. **Barcode Scanner Setup:**
   - Configure scanner to send Enter key after scan
   - Test scanner in scan input field first

2. **Fast Workflow:**
   - Select order
   - Keep focus on scan input
   - Scan all devices rapidly
   - Scanner auto-clears after each successful scan

3. **Error Handling:**
   - Read error messages carefully
   - Yellow warnings are informational (you can continue)
   - Red errors block adding the device

4. **QC Warnings:**
   - Yellow QC warnings don't block dispatch
   - Manager can review later if needed
   - All QC details are saved in dispatch record

5. **Multiple Orders:**
   - One dispatch session = one order
   - To dispatch multiple orders, create separate dispatches
   - Click "Back to Order Selection" to switch orders

---

## 🎯 **Example Scenario**

**Order #2019905**
- Customer: Jitendra Maharana
- Company: Nplus 1 Technologies
- Products:
  - 3x 4ch 1080p HDD MDVR
  - 2x HD Bullet Camera

**Workflow:**
1. Click "Create Dispatch"
2. Type "2019905" → Select order
3. See: "3x MDVR" and "2x Camera" in products list
4. Scan first MDVR → QC Pass ✅ → Added
5. Scan second MDVR → QC Pass ✅ → Added
6. Scan third MDVR → QC Pending ⚠️ → Added with warning
7. Scan first Camera → QC Pass ✅ → Added
8. Scan second Camera → QC Pass ✅ → Added
9. Products show: "3 / 3 MDVR" (green), "2 / 2 Camera" (green)
10. Fill dispatch date, courier: "Trackon"
11. Click "Create Dispatch (5 devices)"
12. Success! All 5 devices dispatched ✅

---

## 🚀 **You're Ready!**

The complete Order-Based Dispatch Workflow is now live on:

**https://3000-id7zgaopnm7accybu066c-b32ec7bb.sandbox.novita.ai**

**Try it now:**
1. Go to Dispatch page
2. Click green "Create Dispatch" button
3. Follow the workflow!

**All features are working:**
- ✅ Order selection with search
- ✅ Auto-fetch customer details
- ✅ Product list display
- ✅ Barcode scanning
- ✅ QC validation
- ✅ Duplicate prevention
- ✅ Batch dispatch creation
- ✅ Docket number updates

**Happy Dispatching! 🎉**
