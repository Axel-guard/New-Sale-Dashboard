# Module-Level Permissions Guide

**Date**: November 15, 2025  
**Version**: 2.1 - Granular Module Permissions  
**Status**: ✅ Live in Production  

---

## 🎯 What's New

Your application now has **granular module-level permissions**! Instead of giving employees all-or-nothing access, you can now control permissions per module:

- 🛒 **Sales Module**
- 📦 **Inventory Module**
- 👥 **Leads Module**
- 📊 **Reports Module**

---

## 🎨 How It Looks

### Edit User Modal

When you edit a user, you'll see **color-coded modules**:

```
┌─────────────────────────────────────────┐
│ 🛒 Sales Module (Blue Background)      │
│ □ View (always checked, disabled)      │
│ ☑ Edit (you can toggle)                │
│ ☑ Delete (you can toggle)              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📦 Inventory Module (Green Background) │
│ □ View (always checked, disabled)      │
│ ☐ Edit (you can toggle)                │
│ ☐ Delete (you can toggle)              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 👥 Leads Module (Yellow Background)    │
│ □ View (always checked, disabled)      │
│ ☑ Edit (you can toggle)                │
│ ☐ Delete (you can toggle)              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📊 Reports Module (Pink Background)    │
│ □ View (always checked, disabled)      │
│ ☑ Edit (you can toggle)                │
└─────────────────────────────────────────┘
```

### User Management Table

The permissions column now shows compact module badges:

```
Permissions Column:
Sales:  [Edit] [Del]
Inv:    [View]
Leads:  [Edit] [Del]
```

---

## 🔧 How to Use (For Admins)

### Granting Permissions

1. Login as admin
2. Go to **Settings → User Management**
3. Click **Edit** on any employee
4. Scroll to **Module Permissions** section
5. Check/uncheck permissions for each module:
   - **Sales**: Grant edit if employee should modify sales records
   - **Inventory**: Grant edit if employee should update inventory
   - **Leads**: Grant edit if employee should manage leads
   - **Reports**: Grant edit if employee should modify reports
6. Click **Update User**

### Example Scenarios

**Scenario 1: Sales Team Member**
- Sales: ✅ Edit, ✅ Delete
- Inventory: ⬜ View only
- Leads: ✅ Edit, ⬜ No delete
- Reports: ⬜ View only

**Result**: Can fully manage sales, view inventory, edit leads, view reports

**Scenario 2: Inventory Manager**
- Sales: ⬜ View only
- Inventory: ✅ Edit, ✅ Delete
- Leads: ⬜ View only
- Reports: ✅ Edit

**Result**: Can view sales, fully manage inventory, view leads, edit reports

**Scenario 3: Read-Only Employee**
- Sales: ⬜ View only
- Inventory: ⬜ View only
- Leads: ⬜ View only
- Reports: ⬜ View only

**Result**: Can only view all modules, no editing anywhere

---

## 📊 Database Structure

### New Columns in `users` Table

```sql
-- Sales Module Permissions
sales_view INTEGER DEFAULT 1        (always 1)
sales_edit INTEGER DEFAULT 0        (admin grants)
sales_delete INTEGER DEFAULT 0      (admin grants)

-- Inventory Module Permissions
inventory_view INTEGER DEFAULT 1    (always 1)
inventory_edit INTEGER DEFAULT 0    (admin grants)
inventory_delete INTEGER DEFAULT 0  (admin grants)

-- Leads Module Permissions
leads_view INTEGER DEFAULT 1        (always 1)
leads_edit INTEGER DEFAULT 0        (admin grants)
leads_delete INTEGER DEFAULT 0      (admin grants)

-- Reports Module Permissions
reports_view INTEGER DEFAULT 1      (always 1)
reports_edit INTEGER DEFAULT 0      (admin grants)
```

---

## 🔐 Permission Hierarchy

### View Permission
- **Always granted** to all users
- Cannot be revoked
- Allows seeing data in the module

### Edit Permission
- **Admin must grant** explicitly
- Allows modifying existing records
- Does NOT include delete ability

### Delete Permission
- **Admin must grant** explicitly
- Allows removing records permanently
- Usually more restricted than Edit

---

## 🎭 What Employees See

### With Sales Edit + Inventory View-Only

**Sales Module:**
- ✅ Can add new sales
- ✅ Can edit existing sales
- ✅ Can delete sales (if Delete permission granted)
- ✅ See edit/delete buttons

**Inventory Module:**
- ✅ Can view all inventory
- ❌ Cannot add/edit/delete inventory
- ❌ No edit/delete buttons visible
- ⚠️ Forms show "View Only" mode

---

## 📱 Frontend Behavior

The application automatically:

1. **Hides buttons** based on permissions
2. **Disables forms** for view-only modules
3. **Shows "View Only" badges** when no edit permission
4. **Logs permissions** to browser console for debugging

### Console Logging

When you login, check browser console (F12):

```javascript
📊 Permissions: {
  role: "employee",
  isAdmin: false,
  permissions: {
    modules: {
      sales: { view: true, edit: true, delete: false },
      inventory: { view: true, edit: false, delete: false },
      leads: { view: true, edit: true, delete: true },
      reports: { view: true, edit: false }
    }
  }
}
```

---

## 🧪 Testing Guide

### Test Case 1: Grant Sales Edit Only

1. As admin, edit employee
2. Check: Sales > Edit
3. Uncheck all other Edit/Delete boxes
4. Logout, login as employee
5. **Expected**: 
   - Sales: Can edit
   - Inventory: View-only
   - Leads: View-only
   - Reports: View-only

### Test Case 2: Grant Multiple Module Access

1. As admin, edit employee
2. Check: Sales > Edit + Delete
3. Check: Inventory > Edit (but NOT Delete)
4. Check: Leads > Edit
5. Logout, login as employee
6. **Expected**:
   - Sales: Full access (edit + delete)
   - Inventory: Can edit but not delete
   - Leads: Can edit but not delete
   - Reports: View-only

### Test Case 3: Revoke All Permissions

1. As admin, edit employee
2. Uncheck ALL Edit/Delete boxes
3. Logout, login as employee
4. **Expected**:
   - All modules: View-only
   - No edit/delete buttons anywhere
   - All forms read-only

---

## 🆕 API Response Format

### Login Response

```json
{
  "success": true,
  "data": {
    "id": 7,
    "username": "priyanshu",
    "role": "employee",
    "permissions": {
      "canEdit": true,
      "canDelete": true,
      "canView": true,
      "modules": {
        "sales": {
          "view": true,
          "edit": true,
          "delete": false
        },
        "inventory": {
          "view": true,
          "edit": false,
          "delete": false
        },
        "leads": {
          "view": true,
          "edit": true,
          "delete": true
        },
        "reports": {
          "view": true,
          "edit": false
        }
      }
    }
  }
}
```

### Users API Response

```json
{
  "success": true,
  "data": [
    {
      "id": 7,
      "username": "priyanshu",
      "role": "employee",
      "sales_view": 1,
      "sales_edit": 1,
      "sales_delete": 0,
      "inventory_view": 1,
      "inventory_edit": 0,
      "inventory_delete": 0,
      "leads_view": 1,
      "leads_edit": 1,
      "leads_delete": 1,
      "reports_view": 1,
      "reports_edit": 0
    }
  ]
}
```

---

## 🎯 Best Practices

### For Admins

1. **Start restrictive**: Grant view-only by default
2. **Grant on request**: Let employees request permissions they need
3. **Review regularly**: Check permissions quarterly
4. **Document changes**: Keep notes on why permissions were granted
5. **Test before granting**: Understand what each permission allows

### Permission Guidelines

| Role | Sales | Inventory | Leads | Reports |
|------|-------|-----------|-------|---------|
| **Sales Rep** | Edit + Delete | View | Edit | View |
| **Inventory Manager** | View | Edit + Delete | View | Edit |
| **Lead Manager** | View | View | Edit + Delete | View |
| **Report Analyst** | View | View | View | Edit |
| **Manager** | Edit + Delete | Edit + Delete | Edit + Delete | Edit |
| **Read-Only** | View | View | View | View |

---

## 🔄 Migration Details

### Database Changes

- **Migration**: `0020_add_module_permissions.sql`
- **Columns Added**: 11 new permission columns
- **Default Values**: View=1, Edit=0, Delete=0 for employees
- **Admin Permissions**: All permissions = 1
- **Backward Compatible**: Yes, old code ignores new columns

### Deployment Impact

- **Downtime**: ~3 seconds during migration
- **Data Loss**: None
- **User Impact**: Minimal - admins need to grant permissions

---

## 🆘 Troubleshooting

### Issue: Employee can't edit despite permission granted

**Check**:
1. Browser console for permission logs
2. User Management table shows correct badges
3. Hard refresh browser (Ctrl+Shift+R)
4. Verify database: `SELECT * FROM users WHERE username='employee'`

### Issue: Permissions not saving

**Check**:
1. Admin is logged in (not employee)
2. No browser console errors
3. Click "Update User" button
4. Refresh user management page to verify

### Issue: All employees see edit buttons

**Check**:
1. Migration applied: `SELECT sql FROM sqlite_master WHERE name='users'`
2. Look for module permission columns
3. Check updateUIForRole() function is called on login

---

## 📝 Quick Reference

### Permission Codes

```
1 = Granted
0 = Not Granted

Example:
sales_edit=1, sales_delete=0
Means: Can edit sales, cannot delete sales
```

### Color Codes

- 🔵 **Blue** = Sales Module
- 🟢 **Green** = Inventory Module  
- 🟡 **Yellow** = Leads Module
- 🔴 **Pink** = Reports Module

---

## ✅ Verification Checklist

After granting permissions, verify:

- [  ] User sees correct module badges in User Management table
- [  ] Employee can login successfully
- [  ] Console shows correct permissions object
- [  ] Edit buttons visible in granted modules
- [  ] Edit buttons hidden in restricted modules
- [  ] Forms work correctly in edit mode
- [  ] Forms show view-only in restricted modules

---

**Production URL**: https://webapp-6dk.pages.dev  
**User Management**: Settings → User Management (Admin only)  
**Support**: Check browser console (F12) for permission debugging  

---

**Status**: ✅ Live and operational in production!
