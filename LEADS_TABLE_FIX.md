# LEADS Table Fix - Verification Guide

## Problem Solved
✅ Customer search was incorrectly querying `customers` table instead of `leads` table.

## Changes Made

### 1. API Endpoint Updated
**File**: `src/index.tsx` (Line 1521)
- **Old**: `SELECT * FROM customers WHERE customer_code = ?`
- **New**: `SELECT * FROM leads WHERE customer_code = ?`

### 2. Column Mappings Updated
**Leads Table Columns → Form Fields:**

| Leads Column | Form Field | Description |
|-------------|------------|-------------|
| `customer_code` | Customer Code | Unique identifier |
| `customer_name` | Customer Name | Full name |
| `mobile_number` | Contact Number | Primary phone |
| `alternate_mobile` | Concern Contact | Secondary phone |
| `email` | Email | Email address |
| `company_name` | Company Name | Company name |
| `gst_number` | GST Number | GST registration |
| `complete_address` | Address & GST Address | Full address |
| `location` | - | City/Location (not mapped) |

### 3. Search Logic
- **1-4 digits** → Search by `customer_code`
- **5+ digits** → Search by `mobile_number` → fallback to `alternate_mobile` → fallback to `customer_code`

---

## Live Testing on office.axel-guard.com

### Test Case 1: Customer Code Search
1. Go to: https://office.axel-guard.com
2. Navigate to **"New Quotation"** section
3. In "Search Customer" field, enter: `711`
4. Click outside the field (onblur trigger)

**✅ Expected Result:**
```
Customer Code: 711
Customer Name: Sachin
Contact: 9422483227
Email: sachin@nplus1.in
Company: Nplus 1 Technologies Pvt. Ltd.
GST Number: 27AAECN8613R1ZR
Address: 402, Sugurudatta Apartment, Nimhan Mala, Pashan, pune-411021
```

### Test Case 2: Mobile Number Search
1. In "Search Customer" field, enter: `7737269072`
2. Click outside the field

**✅ Expected Result:**
```
Customer Code: 1936
Customer Name: Pankaj Kumar Asnani
Contact: 7737269072
Email: asnani12.pankaj@gmail.com
Address: 6, 1st Mullai Nagar street, Opposite SRM Ramapuram, Chennai - 600089
```

---

## API Testing

### Direct API Calls
```bash
# Test customer code search
curl "https://office.axel-guard.com/api/customers/search/711" | jq

# Test mobile search
curl "https://office.axel-guard.com/api/customers/search/7737269072" | jq

# Test not found
curl "https://office.axel-guard.com/api/customers/search/9999" | jq
```

**Expected Responses:**

✅ **Found (200):**
```json
{
  "success": true,
  "data": {
    "id": 712,
    "customer_code": "711",
    "customer_name": "Sachin",
    "mobile_number": "9422483227",
    "company_name": "Nplus 1 Technologies Pvt. Ltd.",
    ...
  }
}
```

❌ **Not Found (404):**
```json
{
  "success": false,
  "error": "Customer not found"
}
```

---

## Deployment Details

- **Deployment ID**: c5a681e0
- **Production URL**: https://office.axel-guard.com
- **Direct URL**: https://c5a681e0.webapp-6dk.pages.dev
- **Git Commit**: d3701d2 - "CRITICAL FIX: Change customer search to use LEADS table"
- **Deployment Time**: 2025-11-10

---

## Next Steps

1. ✅ Test both search methods on live site
2. ✅ Verify all customer fields are filled correctly
3. ⚠️ Check if any other features reference the old `customers` table
4. 📋 Consider removing/deprecating the `customers` table if no longer needed

---

## Notes

- The `customers` table was created by mistake and is NOT used anymore
- All customer data is now fetched from the production `leads` table
- Local database doesn't have leads data - testing must be done on production
- Custom domain (office.axel-guard.com) automatically updates with latest deployment
