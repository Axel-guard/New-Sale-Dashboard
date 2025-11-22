# 🔐 Secure Login System Documentation

## Overview
The login system has been **completely isolated and secured** to prevent any interference from application code changes.

## 🎯 Key Security Features

### 1. **Isolated Location**
- **File**: `/public/static/login.html`
- **URL**: `https://your-domain.com/static/login`
- **Redirect URLs**: `/login` and `/login.html` both redirect to `/static/login`

### 2. **Self-Contained Code**
- All JavaScript is wrapped in an IIFE (Immediately Invoked Function Expression)
- Uses vanilla JavaScript (no external dependencies except Fetch API)
- No interference from app.js or other scripts

### 3. **Robust Error Handling**
- Clear error messages for failed login attempts
- Success messages before redirect
- Button disabled during login to prevent double-submission
- 5-second auto-dismiss for error messages

### 4. **Password Visibility Toggle**
- Eye icon to show/hide password
- FontAwesome icons loaded via CDN
- Always visible and functional

## 🔑 Login Credentials

### Admin Account:
- **Username**: `info@axel-guard.com`
- **Password**: `admin123`

### Employee Accounts:
- **Username**: `akash` | **Password**: `employee123`
- **Username**: `mandeep` | **Password**: `employee123`
- **Username**: `smruti` | **Password**: `employee123`
- **Username**: `support@axel-guard.com` | **Password**: `Support123`

## 🔄 API Response Format

### Login Request:
```json
POST /api/auth/login
Content-Type: application/json

{
  "username": "info@axel-guard.com",
  "password": "admin123"
}
```

### Success Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "info@axel-guard.com",
    "fullName": "Administrator",
    "role": "admin",
    "employeeName": null,
    "permissions": {
      "canEdit": true,
      "canDelete": true,
      "canView": true,
      "modules": {
        "sales": { "view": true, "edit": true, "delete": true },
        "inventory": { "view": true, "edit": true, "delete": true },
        "leads": { "view": true, "edit": true, "delete": true },
        "reports": { "view": true, "edit": true }
      }
    }
  }
}
```

### Error Response:
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

## 💾 LocalStorage Data

After successful login, the following data is stored:
```javascript
localStorage.setItem('userId', userData.id);
localStorage.setItem('username', userData.username);
localStorage.setItem('fullName', userData.fullName);
localStorage.setItem('role', userData.role);
localStorage.setItem('employeeName', userData.employeeName || '');
localStorage.setItem('permissions', JSON.stringify(userData.permissions));
localStorage.setItem('authToken', 'logged-in-' + Date.now());
```

## 🛠️ How to Update Login Page

If you need to make changes to the login page:

1. **Edit the secure file**: `/home/user/webapp/public/static/login.html`
2. **Rebuild the app**: `npm run build`
3. **Restart PM2**: `pm2 restart webapp`
4. **Test the changes**: Visit `http://localhost:3000/login`

**IMPORTANT**: 
- Do NOT edit `/public/login.html` - this file is deprecated
- All login changes should be in `/public/static/login.html`
- The static version is served directly and won't be affected by app.js changes

## 🔧 Troubleshooting

### Issue: "Login button not working"
**Solution**: Check browser console for JavaScript errors. The login script uses Fetch API which is universally supported.

### Issue: "Password toggle icon not showing"
**Solution**: Ensure FontAwesome CDN is loading:
```html
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
```

### Issue: "Invalid credentials"
**Solution**: 
1. Verify you're using the correct username/password (case-sensitive)
2. Check the database has users: 
   ```bash
   npx wrangler d1 execute webapp-production --local --command="SELECT username FROM users"
   ```

### Issue: "Can't access after quotation changes"
**Solution**: The login page is now isolated in `/static/` directory and uses vanilla JavaScript with no template literals or quotation issues. It's safe from app code changes.

## 🚀 Deployment

When deploying to production:

1. The `/public/static/` directory is automatically copied to `/dist/static/`
2. Login page will be available at: `https://your-domain.pages.dev/static/login`
3. Routes `/login` and `/login.html` will redirect to `/static/login`

## 📝 Change Log

### 2025-11-22: Major Security Update
- ✅ Moved login page to `/static/` directory for isolation
- ✅ Converted to vanilla JavaScript (removed template literals)
- ✅ Fixed API response parsing (data.data structure)
- ✅ Added proper error handling with user-friendly messages
- ✅ Implemented button disable during login submission
- ✅ Added success message before redirect
- ✅ Wrapped all code in IIFE for namespace isolation
- ✅ Fixed password toggle functionality
- ✅ Updated all redirects to point to secure location

## 🎨 UI Features

- **Animated Characters**: Eye-tracking characters follow cursor movement
- **Responsive Design**: Mobile-friendly with character hiding on small screens
- **Smooth Animations**: Button hover effects and transitions
- **Form Validation**: HTML5 validation + custom error messages
- **Remember Me**: Checkbox for 30-day sessions (UI only, not implemented)

## 📞 Support

If you encounter any login issues:
1. Check this documentation first
2. Verify credentials are correct
3. Check browser console for errors
4. Ensure `/static/login` URL is accessible
5. Contact administrator if issue persists
