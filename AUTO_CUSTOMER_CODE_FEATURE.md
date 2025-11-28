# Auto Customer Code Generation Feature

## Overview
The customer code field in the "Add New Lead" form now automatically fills with the next sequential number from the database.

## How It Works

### 1. **Database Query**
When the lead form opens, the system queries the `leads` table:
```sql
SELECT customer_code FROM leads 
ORDER BY CAST(customer_code AS INTEGER) DESC 
LIMIT 1
```

### 2. **Code Generation Logic**
- Retrieves the last customer code from the database
- Converts it to an integer
- Adds 1 to generate the next code
- Example: If last code is `1945`, next will be `1946`

### 3. **Visual Feedback**
The input field shows different states:
- **🟡 Yellow (Loading)**: "⏳ Fetching..." - Retrieving data from database
- **🟢 Green (Success)**: Shows the generated code with ✅ indicator
- **🔴 Red (Error)**: "Enter code manually" - Allows manual entry if API fails

## API Endpoint

### GET `/api/leads/next-code`

**Response (Success):**
```json
{
  "success": true,
  "next_code": "1946"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Failed to get next code"
}
```

## Testing

### Local Testing
```bash
# Test API endpoint
curl http://localhost:3000/api/leads/next-code

# Expected output:
# {"success":true,"next_code":"1946"}
```

### Production Testing
1. Open the application
2. Click "Add New Lead" button
3. Watch the customer code field auto-fill
4. The field should show:
   - Yellow background while loading
   - Green text with the next code (e.g., "1946")
   - ✅ success indicator (disappears after 2 seconds)

## Sample Data
The database contains test data:
- Customer Code 1943: John Doe
- Customer Code 1944: Jane Smith
- Customer Code 1945: Bob Johnson
- **Next available**: 1946

## Database Schema

The `leads` table includes the `customer_code` field:
```sql
ALTER TABLE leads ADD COLUMN customer_code TEXT;
```

## Implementation Details

### Frontend Function: `openNewLeadModal()`
Location: `src/index.tsx` line 9875

Key features:
- Async/await for API calls
- DOM ready check with 100ms delay
- Visual state management (loading, success, error)
- Error handling with fallback to manual entry
- Console logging for debugging

### Backend API: `/api/leads/next-code`
Location: `src/index.tsx` line 1323

Key features:
- D1 database query with CAST for integer sorting
- Returns next sequential code
- Defaults to "1" if no leads exist
- Error handling with 500 status

## Error Handling

### Scenario 1: Database Empty
- **Behavior**: Returns `"1"` as the first code
- **User Experience**: Field auto-fills with "1"

### Scenario 2: API Failure
- **Behavior**: Shows red error state
- **User Experience**: Can manually enter code
- **Alert**: "⚠️ Could not auto-generate customer code. Please enter it manually or try again."

### Scenario 3: Network Timeout
- **Behavior**: Same as API failure
- **User Experience**: Manual entry enabled

## Deployment URLs

- **Latest Deployment**: https://40862deb.webapp-6dk.pages.dev/
- **Production**: https://office.axel-guard.com/
- **GitHub**: https://github.com/Axel-guard/New-Sale-Dashboard

## Maintenance

### Adding New Leads
When new leads are added through the form:
1. The auto-generated code is submitted
2. Database stores the code
3. Next form opening will increment from this new maximum

### Manual Code Entry
If a user manually enters a code:
- System accepts custom codes
- Next auto-generation still uses the highest numeric code
- Example: If codes are 1945, 1946, 2000 (manual), next auto will be 2001

### Database Reset
To reset customer codes:
```bash
# Delete all leads
npx wrangler d1 execute webapp-production --local --command="DELETE FROM leads;"

# Next code will start from 1
```

## Future Enhancements

1. **Prefix Support**: Add company prefix (e.g., "AXL-1946")
2. **Zero Padding**: Format with leading zeros (e.g., "001946")
3. **Custom Ranges**: Allow different starting numbers per branch
4. **Code Validation**: Check for duplicates before saving

## Technical Stack

- **Backend**: Cloudflare Workers + Hono
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JavaScript + Axios
- **Deployment**: Cloudflare Pages

## Commit History
- Latest commit: `7d6aaa9` - Feature: Auto-generate customer code from database
- Previous: `b537b01` - Remove core dump file and update .gitignore
