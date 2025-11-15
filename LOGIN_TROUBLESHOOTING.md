# Login Troubleshooting Guide

## ✅ BACKEND STATUS: CONFIRMED WORKING

The backend API `/api/auth/login` is **100% functional**:

```bash
# Test from command line
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Response:
{"success":true,"data":{"id":1,"username":"admin","fullName":"Administrator","role":"admin","employeeName":null}}
```

**PM2 Logs confirm successful login:**
```
[LOGIN] Attempt: { username: 'admin', passwordLength: 8 }
[LOGIN] Encoded password: YWRtaW4xMjM=
[LOGIN] User found: true
[LOGIN] Success for user: admin
[wrangler:info] POST /api/auth/login 200 OK (329ms)
```

---

## 🔧 FRONTEND VERIFICATION

### 1. Check Browser Developer Console

Open browser DevTools (F12) and go to Console tab. Look for:

**Expected successful login flow:**
```javascript
// Should NOT see these errors:
❌ axios is not defined
❌ handleLogin is not defined  
❌ CORS error
❌ Mixed Content warning

// Should see network request:
✅ POST /api/auth/login → 200 OK
```

### 2. Check Network Tab

1. Open DevTools (F12) → Network tab
2. Try to login
3. Look for `/api/auth/login` request

**If request is RED (failed):**
- Check status code
- Check response body
- Check request headers

**If request is GREEN (success) but dashboard doesn't show:**
- Check Console for JavaScript errors
- Verify `sessionStorage` contains user data:
  ```javascript
  // Run in Console:
  sessionStorage.getItem('user')
  ```

### 3. Common Issues & Solutions

#### Issue A: Axios Not Loaded
**Symptom:** `axios is not defined` error  
**Solution:** Check if CDN is accessible
```javascript
// Run in Console:
typeof axios
// Should return: "function"
```

#### Issue B: CORS Error
**Symptom:** "Access-Control-Allow-Origin" error  
**Solution:** Already fixed - CORS is enabled in backend:
```typescript
app.use('/api/*', cors())
```

#### Issue C: Mixed Content (HTTP/HTTPS)
**Symptom:** "Mixed Content" warning  
**Solution:** Use HTTPS sandbox URL:
```
https://3000-id7zgaopnm7accybu066c-b32ec7bb.sandbox.novita.ai
```

#### Issue D: Cached Old Build
**Symptom:** Login doesn't respond or shows old behavior  
**Solution:** Hard refresh browser
```
Windows/Linux: Ctrl + F5
Mac: Cmd + Shift + R
```

#### Issue E: JavaScript Not Executing
**Symptom:** No console logs, button doesn't respond  
**Solution:** Check if script is loaded
```javascript
// Run in Console:
typeof handleLogin
// Should return: "function"
```

---

## 🧪 Manual Testing Steps

### Step 1: Open Browser Console
1. Right-click page → "Inspect" → "Console" tab
2. Clear console (trash icon)

### Step 2: Open Network Tab  
1. Click "Network" tab
2. Ensure "Preserve log" is checked

### Step 3: Attempt Login
1. Enter username: `admin`
2. Enter password: `admin123`
3. Click "Sign In" button

### Step 4: Observe Results

**✅ SUCCESS INDICATORS:**
- Network: `POST /api/auth/login` shows 200 OK
- Console: No errors
- Page: Dashboard appears

**❌ FAILURE INDICATORS:**
- Network: Request fails or doesn't appear
- Console: JavaScript errors
- Page: Error message appears

---

## 📊 Diagnostic Commands

### Check Server Status
```bash
pm2 list
pm2 logs webapp --nostream --lines 50
```

### Test API Directly
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Check Database
```bash
cd /home/user/webapp
npx wrangler d1 execute webapp-production --local \
  --command="SELECT username, full_name, role FROM users WHERE is_active=1"
```

### View Build Output
```bash
cd /home/user/webapp
ls -la dist/
cat dist/_worker.js | grep "handleLogin" | head -5
```

---

## 🔐 Valid Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Administrator |
| akash | employee123 | Employee |
| mandeep | employee123 | Employee |
| smruti | employee123 | Employee |

---

## 🌐 Access URLs

### Sandbox (Public Access)
```
https://3000-id7zgaopnm7accybu066c-b32ec7bb.sandbox.novita.ai
```

### Local Development
```
http://localhost:3000
```

---

## 📝 What We Know

1. ✅ **Backend API works perfectly** - Tested via curl
2. ✅ **Database has correct users** - Verified via wrangler d1 execute
3. ✅ **Password encoding matches** - base64(admin123) = YWDtaW4xMjM=
4. ✅ **CORS is enabled** - Headers configured correctly
5. ✅ **Axios is included** - CDN link present in HTML
6. ✅ **handleLogin function exists** - Present in rendered HTML
7. ✅ **Form is properly connected** - onsubmit="handleLogin(event)"

## 🎯 Next Steps

**If login still fails, provide these details:**

1. Screenshot of browser Console tab (F12)
2. Screenshot of Network tab showing `/api/auth/login` request
3. Any error messages visible on screen
4. Browser name and version (Chrome, Firefox, Safari, etc.)

This will help pinpoint the exact issue!

---

**Last Updated:** 2025-11-15  
**Backend Status:** ✅ WORKING  
**API Endpoint:** ✅ VERIFIED  
**Database:** ✅ POPULATED  
**Frontend:** ⚠️ NEEDS BROWSER TESTING
