# 🗄️ AxelGuard Dashboard - Database Setup Guide

## Step-by-Step Setup Instructions

### Step 1: Create D1 Database (2 minutes)

1. Open: https://dash.cloudflare.com/f019f99cf90785325862a3a79a51bba7/workers/d1
2. Click **"Create database"** button
3. Enter database name: `webapp-production`
4. Click **"Create"**
5. **IMPORTANT:** Copy the Database ID (looks like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

---

### Step 2: Connect Database to Pages Project (1 minute)

1. Go to: https://dash.cloudflare.com/f019f99cf90785325862a3a79a51bba7/pages/view/webapp
2. Click **"Settings"** tab
3. Click **"Functions"** in the left sidebar
4. Scroll down to **"D1 database bindings"** section
5. Click **"Add binding"** button
6. Fill in:
   - **Variable name:** `DB` (exactly as shown, case-sensitive)
   - **D1 database:** Select `webapp-production` from dropdown
7. Click **"Save"** button
8. **The page will automatically redeploy** (wait 30 seconds)

---

### Step 3: Run Database Schema (3 minutes)

1. Go back to D1 database page: https://dash.cloudflare.com/f019f99cf90785325862a3a79a51bba7/workers/d1
2. Click on **"webapp-production"** database
3. Click **"Console"** tab
4. Open the file `/home/user/webapp/schema.sql` (download it from the sandbox)
5. **Copy ALL the SQL** from `schema.sql`
6. **Paste** into the console
7. Click **"Execute"** button
8. You should see: "✓ Success"

---

### Step 4: Add Sample Data (Optional - 1 minute)

If you want to test with sample data:

1. In the same D1 Console
2. Open `/home/user/webapp/sample-data.sql`
3. **Copy ALL the SQL**
4. **Paste** into console
5. Click **"Execute"**

---

### Step 5: Test Your Dashboard

1. Open: https://1dd559a4.webapp-6dk.pages.dev
2. Login with:
   - **Username:** `admin`
   - **Password:** `admin123`
3. You should see the dashboard with data!

---

## 🔐 Default User Accounts

After running `schema.sql`, these accounts are created:

| Username | Password | Role | Employee Name |
|----------|----------|------|---------------|
| admin | admin123 | admin | Admin |
| akash | akash123 | employee | Akash Parashar |
| mandeep | mandeep123 | employee | Mandeep Samal |
| smruti | smruti123 | employee | Smruti Ranjan Nayak |

**⚠️ IMPORTANT:** Change these passwords after first login!

---

## 📊 What Gets Created

### Tables:
- `users` - User accounts and authentication
- `sales` - Sales records
- `sale_items` - Product details for each sale
- `payment_history` - Payment tracking
- `leads` - Customer leads database
- `incentive_history` - Employee incentives

### Sample Data (if you run sample-data.sql):
- 3 sample leads
- 3 sample sales
- Sample sale items
- Sample payment records

---

## ✅ Verification Checklist

After setup, verify:
- [ ] D1 database created
- [ ] Database binding added to Pages project
- [ ] Schema executed successfully
- [ ] Can login with admin/admin123
- [ ] Dashboard shows data
- [ ] Can create new sales
- [ ] Can add leads

---

## 🔧 Troubleshooting

**Problem: "Database not found" error**
- Solution: Make sure the binding variable name is exactly `DB` (uppercase)
- Check the binding in Pages Settings → Functions → D1 database bindings

**Problem: "Authentication failed"**
- Solution: Run `schema.sql` again - it creates default users

**Problem: "No data showing"**
- Solution: Run `sample-data.sql` to add test data
- Or add data manually through the dashboard

**Problem: Pages not updating after binding**
- Solution: Wait 30-60 seconds for automatic redeployment
- Or manually redeploy: Go to Deployments → Retry deployment

---

## 📱 Need Help?

If you encounter issues:
1. Check the Cloudflare Pages logs: Settings → Functions → View logs
2. Check D1 database console for SQL errors
3. Verify the binding is exactly `DB` (case-sensitive)

---

## 🚀 After Setup

Once database is working:
1. Change default passwords
2. Add your real sales data
3. Import your leads CSV
4. Configure custom domain (optional)
5. Set up user accounts for your team

---

**Total Setup Time: ~7 minutes**
