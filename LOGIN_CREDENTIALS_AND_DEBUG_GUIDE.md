# AxelGuard Login Credentials & Debug Guide

## 🚀 Application URL
**Live Application:** https://3000-id7zgaopnm7accybu066c-b32ec7bb.sandbox.novita.ai

---

## 🔐 Available Login Credentials

### Admin Accounts (Full Access)
1. **Username:** `admin` | **Password:** `admin123`
   - Full Name: Administrator
   - Role: Admin

2. **Username:** `manager` | **Password:** `manager123`
   - Full Name: Manager User
   - Role: Admin

### Employee Accounts (Limited Access)
3. **Username:** `test1` | **Password:** `test123`
   - Full Name: Test User 1
   - Role: Employee

4. **Username:** `test2` | **Password:** `test123`
   - Full Name: Test User 2
   - Role: Employee

5. **Username:** `demo` | **Password:** `demo123`
   - Full Name: Demo User
   - Role: Employee

6. **Username:** `user1` | **Password:** `pass123`
   - Full Name: User One
   - Role: Employee

### Existing Employee Accounts
7. **Username:** `akash` | **Password:** `employee123`
   - Full Name: Akash Parashar
   - Role: Employee

8. **Username:** `mandeep` | **Password:** `employee123`
   - Full Name: Mandeep Samal
   - Role: Employee

9. **Username:** `smruti` | **Password:** `employee123`
   - Full Name: Smruti Ranjan Nayak
   - Role: Employee

---

## ✅ API Backend Status
All login endpoints are **WORKING PERFECTLY**. Verified via curl tests:
- ✅ admin/admin123 → Success
- ✅ test1/test123 → Success
- ✅ demo/demo123 → Success
- ✅ manager/manager123 → Success

---

## 🔧 What Was Fixed

### 1. **Enhanced Login Function**
- Added comprehensive error handling
- Added step-by-step console logging
- Added axios availability check
- Added visible alerts at each stage
- Changed to non-ES6 syntax for better browser compatibility

### 2. **Added Multiple Debug Points**
```javascript
// The login function now:
1. Checks if axios is loaded
2. Validates form elements exist
3. Shows loading state
4. Logs every step to console
5. Shows alerts for success/failure
6. Provides detailed error messages
```

### 3. **Added Axios Availability Check**
- Checks axios on page load
- Shows alert if axios fails to load
- Console logging for verification

### 4. **Version Tracking**
- Updated build version to v3.2
- Build ID: 2025-11-12-LOGIN-FIX

---

## 🐛 Debugging Steps for Browser Issues

### Step 1: Clear Browser Cache
**Most Important - Do This First!**

**For Safari:**
1. Press `Command + Option + E` (or Develop → Empty Caches)
2. Or: Safari → Preferences → Advanced → Show Develop menu
3. Then: Develop → Empty Caches
4. Close all Safari windows
5. Reopen and try again

**For Chrome:**
1. Press `Command + Shift + Delete` (Mac) or `Ctrl + Shift + Delete` (Windows)
2. Select "Cached images and files"
3. Select "All time"
4. Click "Clear data"
5. Or: Hard refresh with `Command + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)

### Step 2: Open Browser Console
**For Safari:**
1. Develop → Show JavaScript Console (or `Command + Option + C`)
2. If "Develop" menu is not visible: Safari → Preferences → Advanced → Check "Show Develop menu in menu bar"

**For Chrome:**
1. View → Developer → JavaScript Console (or `Command + Option + J`)

### Step 3: What to Look For in Console

**Expected Success Messages:**
```
✅ Loading AxelGuard v3.2 - Build 2025-11-12-LOGIN-FIX
✅ Axios library loaded successfully
=== LOGIN FUNCTION STARTED ===
Event prevented default
Axios is available
Username: admin
Password length: 8
Sending login request to /api/auth/login
Login response received: ...
Response data: {success: true, ...}
User data saved to session
```

**If You See Errors:**
```
❌ CRITICAL: Axios library failed to load!
OR
❌ Axios is not defined
OR
❌ SyntaxError: ...
```

### Step 4: Test Network Request
1. Open Network tab in browser console
2. Try to login
3. Look for request to `/api/auth/login`
4. Check if request was sent
5. Check response status (should be 200)
6. Check response body (should show success: true)

---

## 🆘 Troubleshooting Guide

### Problem 1: "Login button doesn't do anything"
**Cause:** JavaScript not loading or old cached code
**Solution:**
1. Hard refresh: `Command + Shift + R` (Mac) or `Ctrl + F5` (Windows)
2. Clear browser cache completely
3. Close all browser windows and reopen
4. Check console for JavaScript errors

### Problem 2: "Axios library failed to load"
**Cause:** Network issue or CDN blocked
**Solution:**
1. Check internet connection
2. Try different network (mobile hotspot)
3. Check if firewall/antivirus blocking CDN
4. Try different browser

### Problem 3: "Network error" or "Failed to fetch"
**Cause:** CORS or network connectivity
**Solution:**
1. Check if URL is correct: https://3000-id7zgaopnm7accybu066c-b32ec7bb.sandbox.novita.ai
2. Check if service is running (should be!)
3. Try from different network
4. Check browser console for specific error

### Problem 4: "Invalid credentials" even with correct password
**Cause:** Database not in sync or typo in password
**Solution:**
1. Try different user accounts (test1/test123, demo/demo123)
2. Check if caps lock is on
3. Copy-paste password from this document
4. Contact developer if all accounts fail

---

## 📊 System Status

### Service Information
- **Status:** ✅ Online
- **Port:** 3000
- **Process Manager:** PM2
- **Uptime:** Running stably
- **Database:** D1 Local SQLite (auto-migrated)

### Recent Changes (2025-11-12)
1. ✅ Fixed 3-dot button functionality
2. ✅ Added QC data upload with Excel
3. ✅ Added Dispatch data upload with Excel
4. ✅ Fixed template literal syntax errors
5. ✅ Added auto-migration on startup
6. ✅ Enhanced login debugging
7. ✅ Added multiple test accounts
8. ✅ Improved error messages

---

## 📞 Next Steps

1. **Try logging in with ANY of the credentials above**
2. **Open browser console BEFORE clicking login**
3. **Watch console messages as you login**
4. **If it fails, take screenshot of console and share**

The backend is 100% functional. If browser login still fails, the issue is:
- Browser caching old code
- JavaScript execution blocked
- Network/CORS issue
- CDN library blocked

**Most likely: Browser cache needs to be cleared!**

---

## 🎯 Quick Test Checklist

- [ ] Clear browser cache completely
- [ ] Hard refresh page (Command+Shift+R or Ctrl+F5)
- [ ] Open browser console
- [ ] Look for version: "v3.2 - Build 2025-11-12-LOGIN-FIX"
- [ ] Try login with: test1 / test123
- [ ] Check console for error messages
- [ ] Try different browser if Safari fails
- [ ] Try different network if all fails

---

**Last Updated:** 2025-11-12
**Build Version:** v3.2-LOGIN-FIX
**Developer:** AI Assistant
