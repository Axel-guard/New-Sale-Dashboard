# AxelGuard Login Credentials

## 🔐 Available User Accounts

### Admin Account
- **Username:** `admin`
- **Password:** `admin123`
- **Role:** Administrator
- **Access:** Full system access

### Employee Accounts

#### Akash Parashar
- **Username:** `akash`
- **Password:** `employee123`
- **Role:** Employee
- **Access:** Employee dashboard

#### Mandeep Samal
- **Username:** `mandeep`
- **Password:** `employee123`
- **Role:** Employee
- **Access:** Employee dashboard

#### Smruti Ranjan Nayak
- **Username:** `smruti`
- **Password:** `employee123`
- **Role:** Employee
- **Access:** Employee dashboard

---

## 🌐 Access URLs

### Local Development
- **URL:** http://localhost:3000
- **Status:** ✅ Active

### Sandbox (Public Access)
- **URL:** https://3000-id7zgaopnm7accybu066c-b32ec7bb.sandbox.novita.ai
- **Status:** ✅ Active
- **Valid For:** 1 hour (auto-extended on use)

---

## ✅ What Was Fixed

### Problem
The login system was changed to a **hardcoded authentication** that only accepted `admin/admin123` in JavaScript code. This meant:
- Database credentials were completely ignored
- No one could login with employee accounts
- The API endpoint existed but wasn't being used

### Solution
Restored **database-based authentication**:
1. Login now uses `/api/auth/login` API endpoint
2. Credentials are verified against the `users` table in D1 database
3. All user accounts work correctly
4. Passwords are stored as base64-encoded strings in database

### How It Works Now
```
User enters credentials
    ↓
JavaScript calls /api/auth/login
    ↓
API queries users table with username + base64(password)
    ↓
If match found: Login successful ✅
If no match: Error message ❌
```

---

## 🧪 Testing

### Test Admin Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "fullName": "Administrator",
    "role": "admin",
    "employeeName": null
  }
}
```

### Test Employee Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"akash","password":"employee123"}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "username": "akash",
    "fullName": "Akash Parashar",
    "role": "employee",
    "employeeName": "Akash Parashar"
  }
}
```

---

## 🔧 Technical Details

### Database Table: `users`
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,  -- base64 encoded
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  employee_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  email TEXT
);
```

### Password Encoding
Passwords are stored as **base64-encoded strings**:
- `admin123` → `YWRtaW4xMjM=`
- `employee123` → `ZW1wbG95ZWUxMjM=`

**Note:** This is for demonstration purposes. Production systems should use proper password hashing (bcrypt, argon2, etc.).

---

## 📝 Notes

1. **Session Storage:** User data is stored in `sessionStorage` after successful login
2. **Logout:** Clears `sessionStorage` and returns to login screen
3. **Auto-login:** If `sessionStorage` has user data, automatically shows dashboard on page load
4. **Security:** Current implementation uses base64 encoding (suitable for demo/internal use)

---

## 🚀 Deployment Status

- ✅ Local development server running
- ✅ Database migrations applied
- ✅ All user accounts active
- ✅ Login API endpoint working
- ✅ Frontend form properly connected
- ✅ Session management working

**Last Updated:** 2025-11-15
**Commit:** ccc3f62 - Fix login: Restore database-based authentication
