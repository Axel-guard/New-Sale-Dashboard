# Customer Code Auto-Generation Demo

## 🎯 What You Asked For

> "When anyone comes to fill the new lead form, customer code should automatically fill. You have to read the last customer code then give me next digit. Example: if last lead was 1945, after that when anyone fills the form, next customer code was 1946."

## ✅ IMPLEMENTED & WORKING!

### How It Works Now

1. **User clicks "Add New Lead" button**
2. **Modal opens with visual feedback:**
   - Field shows: "⏳ Fetching..." (yellow background)
3. **System queries database:**
   - `SELECT customer_code FROM leads ORDER BY CAST(customer_code AS INTEGER) DESC LIMIT 1`
4. **Calculates next code:**
   - Last code: `1977` (from production database)
   - Next code: `1978` (automatically generated)
5. **Field auto-fills:**
   - Shows: `1978` (green text, gray background)
   - Indicator: `✅ Loaded` (disappears after 2 seconds)

### Real Production Example

**Current Database State:**
```
Last lead: Customer Code 1977
Next auto-generated: Customer Code 1978
```

**API Response:**
```bash
curl https://office.axel-guard.com/api/leads/next-code
# Returns: {"success":true,"next_code":"1978"}
```

### Visual States

#### 1️⃣ Loading State (Yellow)
```
┌─────────────────────────────────────────────┐
│ Customer Code (Auto-generated) ⏳ Loading...│
│ ┌─────────────────────────────────────────┐ │
│ │ ⏳ Fetching...                          │ │
│ └─────────────────────────────────────────┘ │
│   🟡 Background: Yellow (#fef3c7)           │
│   🟡 Border: Orange (#fbbf24)               │
└─────────────────────────────────────────────┘
```

#### 2️⃣ Success State (Green)
```
┌─────────────────────────────────────────────┐
│ Customer Code (Auto-generated) ✅ Loaded    │
│ ┌─────────────────────────────────────────┐ │
│ │ 1978                                    │ │
│ └─────────────────────────────────────────┘ │
│   🟢 Text Color: Green (#059669)            │
│   ⚪ Background: Gray (#f3f4f6)             │
│   🟢 Border: Gray (#d1d5db)                 │
│   ✅ Success indicator (auto-hides)         │
└─────────────────────────────────────────────┘
```

#### 3️⃣ Error State (Red)
```
┌─────────────────────────────────────────────┐
│ Customer Code ❌ Failed - Enter manually    │
│ ┌─────────────────────────────────────────┐ │
│ │ Enter code manually                     │ │
│ └─────────────────────────────────────────┘ │
│   🔴 Background: Red (#fee2e2)              │
│   🔴 Border: Red (#ef4444)                  │
│   🔴 Text Color: Red (#dc2626)              │
│   📝 Read-only: FALSE (can type)            │
└─────────────────────────────────────────────┘
```

### Database Flow

```
┌──────────────────────────────────────────────────────────┐
│                    LEADS DATABASE                        │
├────────┬─────────────────┬──────────────┬───────────────┤
│   ID   │ CUSTOMER_CODE   │ CUSTOMER_NAME│   STATUS      │
├────────┼─────────────────┼──────────────┼───────────────┤
│   245  │     1975        │  Alice Brown │    New        │
│   246  │     1976        │  Bob Smith   │    New        │
│   247  │     1977        │  Carol White │    New        │ ← LAST
├────────┴─────────────────┴──────────────┴───────────────┤
│                                                           │
│  Next Auto-Generated Code: 1978                          │
│                              ↓                            │
│  [User opens form] → API reads 1977 → Returns 1978       │
│                              ↓                            │
│  [Form auto-fills with 1978]                             │
│                              ↓                            │
│  [User submits] → New row added with code 1978           │
│                              ↓                            │
│  Next time: API will return 1979                         │
└──────────────────────────────────────────────────────────┘
```

## 🧪 Testing Instructions

### 1. Open Production Site
Navigate to: https://office.axel-guard.com/

### 2. Open Lead Form
- Click the **"+ Add New"** button (or similar)
- Select **"New Lead"** from dropdown

### 3. Watch Auto-Fill
- Customer Code field should immediately show yellow "Fetching..."
- Within 1 second, should change to green with code "1978"
- ✅ indicator appears briefly

### 4. Fill Other Fields
- Customer Name: (required)
- Mobile Number: (required)
- Other fields: (optional)

### 5. Submit Form
- Click "💾 Save Lead" button
- New lead is saved with code 1978
- Next form opening will show 1979

## 📊 Example Scenario

### Day 1 - Morning (First Lead)
```
Current max code: 1977
User opens form → Shows: 1978
User fills: "David Lee" → Saves
Database now has: 1978
```

### Day 1 - Afternoon (Second Lead)
```
Current max code: 1978
User opens form → Shows: 1979
User fills: "Emma Davis" → Saves
Database now has: 1979
```

### Day 1 - Evening (Third Lead)
```
Current max code: 1979
User opens form → Shows: 1980
User fills: "Frank Wilson" → Saves
Database now has: 1980
```

## 🔧 Technical Details

### API Endpoint
```typescript
app.get('/api/leads/next-code', async (c) => {
  const { env } = c;
  
  try {
    const lastLead = await env.DB.prepare(`
      SELECT customer_code FROM leads 
      ORDER BY CAST(customer_code AS INTEGER) DESC 
      LIMIT 1
    `).first();
    
    let nextCode = '1';
    if (lastLead && lastLead.customer_code) {
      const lastCode = parseInt(lastLead.customer_code);
      if (!isNaN(lastCode)) {
        nextCode = String(lastCode + 1);
      }
    }
    
    return c.json({ success: true, next_code: nextCode });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to get next code' }, 500);
  }
});
```

### Frontend Implementation
```javascript
async function openNewLeadModal() {
  // Show modal
  document.getElementById('newLeadModal').classList.add('show');
  
  // Wait for DOM
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const customerCodeInput = document.getElementById('leadCustomerCode');
  
  // Set loading state
  customerCodeInput.placeholder = '⏳ Fetching...';
  customerCodeInput.style.backgroundColor = '#fef3c7';
  
  // Fetch next code
  try {
    const response = await axios.get('/api/leads/next-code');
    
    if (response.data.success) {
      // Show success
      customerCodeInput.value = response.data.next_code;
      customerCodeInput.style.backgroundColor = '#f3f4f6';
      customerCodeInput.style.color = '#059669';
    }
  } catch (error) {
    // Show error
    customerCodeInput.placeholder = 'Enter code manually';
    customerCodeInput.style.backgroundColor = '#fee2e2';
    customerCodeInput.readOnly = false;
  }
}
```

## 🎉 Summary

**Your Requirement:** ✅ FULLY IMPLEMENTED
- ✅ Reads last customer code from database
- ✅ Auto-generates next sequential number
- ✅ Works exactly as requested (1945 → 1946)
- ✅ Visual feedback for loading/success/error
- ✅ Deployed to production and working
- ✅ Production database has codes up to 1977
- ✅ Next lead will get code 1978

**Deployment URLs:**
- Production: https://office.axel-guard.com/
- Latest: https://40862deb.webapp-6dk.pages.dev/
- GitHub: https://github.com/Axel-guard/New-Sale-Dashboard

**Test Command:**
```bash
curl https://office.axel-guard.com/api/leads/next-code
# Returns: {"success":true,"next_code":"1978"}
```

**Backup Available:**
- Download: https://www.genspark.ai/api/files/s/LXpjsM0c
- Size: 45 MB
- Includes: All database migrations, code, and documentation
