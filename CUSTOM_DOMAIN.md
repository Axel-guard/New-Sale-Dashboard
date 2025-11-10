# Custom Domain Deployment Summary

## 🌐 Live URLs

### Production URLs (All serve the same latest deployment):
- **Custom Domain**: https://office.axel-guard.com
- **Cloudflare Pages**: https://webapp-6dk.pages.dev
- **Latest Deployment**: https://4955239a.webapp-6dk.pages.dev

### Deployment Information:
- **Deployment ID**: 4955239a-a1d9-4c97-95e5-111e116a1385
- **Git Commit**: 1c7fac3
- **Environment**: Production
- **Branch**: main
- **Deployed**: Just now (latest)

## ✅ Features Status

### Customer Search:
- ✅ Working on office.axel-guard.com
- ✅ API endpoint: /api/customers/search/:query
- ✅ Logic: 1-4 digits = customer code, 5+ = mobile

### Test Customers Available:
| Code | Name | Phone | Status |
|------|------|-------|--------|
| 1 | Customer One | 7737269072 | ✅ Working |
| 12 | Customer Twelve | 9876543211 | ✅ Working |
| 123 | Customer OneTwoThree | 9876543212 | ✅ Working |
| 711 | Test Customer | 9876543210 | ✅ Working |
| 1234 | Customer Thousand | 9876543213 | ✅ Working |

## 🧪 Testing Instructions

### Test on office.axel-guard.com:

1. **Open**: https://office.axel-guard.com
2. **Login**: 
   - Username: `admin`
   - Password: `admin123`
3. **Navigate**: Click "New Quotation"
4. **Test Search**:
   - Enter: `711` (customer code)
   - Click outside field
   - ✅ Should auto-fill: Test Customer details
   
5. **Test Mobile Search**:
   - Clear form
   - Enter: `7737269072` (mobile number)
   - Click outside field
   - ✅ Should auto-fill: Customer One details

### API Testing (Direct):

```bash
# Test customer code search
curl "https://office.axel-guard.com/api/customers/search/711"
# Returns: Test Customer

# Test mobile number search
curl "https://office.axel-guard.com/api/customers/search/7737269072"
# Returns: Customer One

# Test 1-digit code
curl "https://office.axel-guard.com/api/customers/search/1"
# Returns: Customer One
```

## 🔧 Domain Configuration

### Custom Domain Setup:
- **Domain**: office.axel-guard.com
- **Status**: ✅ Active
- **DNS**: Configured and working
- **SSL**: ✅ Enabled (Cloudflare)
- **Auto-update**: ✅ Yes (points to latest production deployment)

### How Domain Updates:
- When you deploy with `wrangler pages deploy`, the new deployment becomes "Production"
- Custom domain (office.axel-guard.com) automatically points to latest production deployment
- No manual domain rebinding needed
- Updates are instant (with DNS propagation)

## 📊 Deployment History

Recent deployments (newest first):
1. **4955239a** (Latest) - Commit 1c7fac3 - Customer search fix
2. 83eb10e8 - Commit 29a0ddb - Previous version
3. 253e9303 - Commit 4d776b8 - Earlier version
4. 1fea59a2 - Commit 37adf0d - Signature/courier fixes

## ⚠️ Important Notes

### Customer Search Frontend:
- Uses `onblur` event on search input
- Calls `fetchCustomerForQuotation(value)` function
- Search triggers when you click outside the field
- Status message appears below search field

### If Search Doesn't Work:
1. **Clear browser cache**: Ctrl+Shift+R or Cmd+Shift+R
2. **Check browser console**: F12 → Console tab for errors
3. **Verify API works**: Test API endpoint directly (see above)
4. **Try incognito mode**: To rule out cache issues

### Troubleshooting:
```bash
# Check if domain is resolving correctly
curl -I https://office.axel-guard.com

# Test API endpoint
curl "https://office.axel-guard.com/api/customers/search/711"

# Check latest deployment
npx wrangler pages deployment list --project-name webapp | head -5
```

## 🚀 Future Deployments

To deploy updates:
```bash
# Build the project
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name webapp

# office.axel-guard.com will automatically update!
```

## 📞 Support Information

### Production Database:
- **Database**: webapp-production
- **ID**: 4f8ab9fe-4b4d-4484-b86c-1abf0bdf8208
- **Region**: APAC
- **Tables**: 13 (including customers, products, quotations, etc.)

### Key Features:
- ✅ Customer management
- ✅ Quotation system with themes
- ✅ Courier calculation
- ✅ Sales tracking
- ✅ Multi-currency support
- ✅ PDF generation
- ✅ WhatsApp sharing

---

**All systems operational on office.axel-guard.com** ✅
