# Role-Based Access Control (RBAC) Implementation Plan

**Date**: 2025-11-15  
**Status**: In Progress  
**Goal**: Implement comprehensive role-based permissions system for employee edit rights

---

## Overview

Admin users can control which employees have edit/delete permissions. Employees without permissions can only view data.

---

## Database Changes

### Migration: 0019_add_user_permissions.sql ✅ COMPLETED

```sql
ALTER TABLE users ADD COLUMN can_edit INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN can_delete INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN can_view INTEGER DEFAULT 1;

-- Admin gets all permissions
UPDATE users SET can_edit = 1, can_delete = 1, can_view = 1 WHERE role = 'admin';

-- Employees start with view-only
UPDATE users SET can_edit = 0, can_delete = 0, can_view = 1 WHERE role = 'employee';
```

**Status**: Applied to local database ✅

---

## Frontend Changes Required

### 1. User Management Page Enhancement

**File**: `/home/user/webapp/src/index.tsx`

**Current Table Columns (Line 6605-6613)**:
- ID
- Username
- Full Name
- Role
- Employee Name
- Status
- Created
- Actions

**New Table Columns Required**:
- ID
- Username
- Full Name
- Role
- Employee Name
- **Permissions** (NEW - Show Edit/Delete/View badges)
- Status
- Created
- Actions (Edit button)

**Changes to loadUsers() function (Line 12007-12039)**:
```javascript
// ADD after line 12026 (before Actions column):
<td>
    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
        ${user.can_view ? '<span class="badge badge-info" style="font-size: 10px;">View</span>' : ''}
        ${user.can_edit ? '<span class="badge badge-success" style="font-size: 10px;">Edit</span>' : ''}
        ${user.can_delete ? '<span class="badge badge-error" style="font-size: 10px;">Delete</span>' : ''}
        ${(!user.can_edit && !user.can_delete) ? '<span class="badge badge-warning" style="font-size: 10px;">View Only</span>' : ''}
    </div>
</td>
```

### 2. Edit User Modal Enhancement

**Find Edit User Modal** (around line 7100+)

**Add Permission Checkboxes**:
```html
<div class="form-group">
    <label>Permissions *</label>
    <div style="display: flex; gap: 15px; flex-wrap: wrap; padding: 10px; background: #f9fafb; border-radius: 6px;">
        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
            <input type="checkbox" id="editUserCanView" checked disabled style="cursor: not-allowed;">
            <span>View</span>
        </label>
        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
            <input type="checkbox" id="editUserCanEdit" name="can_edit" value="1">
            <span>Edit</span>
        </label>
        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
            <input type="checkbox" id="editUserCanDelete" name="can_delete" value="1">
            <span>Delete</span>
        </label>
    </div>
    <small style="color: #6b7280;">View permission is always enabled. Grant Edit and Delete as needed.</small>
</div>
```

### 3. Edit User Functions

**Update editUser() function (Line 12089-12121)**:
```javascript
// ADD after line 12106 (after status):
document.getElementById('editUserCanEdit').checked = user.can_edit === 1;
document.getElementById('editUserCanDelete').checked = user.can_delete === 1;
```

**Update submitEditUser() function (Line 12137-12158)**:
```javascript
// ADD to data object (around line 12144):
can_edit: document.getElementById('editUserCanEdit').checked ? 1 : 0,
can_delete: document.getElementById('editUserCanDelete').checked ? 1 : 0,
can_view: 1  // Always 1
```

### 4. Change Password Page - Remove Current Password

**File**: Line 6565-6586

**REMOVE**:
```html
<div class="form-group">
    <label>Current Password *</label>
    <input type="password" id="currentPassword" required placeholder="Enter current password">
</div>
```

**Update changePassword() function (Line 11948+)**:
- Remove currentPassword validation
- Remove currentPassword from API request
- Only send newPassword

---

## Backend Changes Required

### 1. API Endpoint: GET /api/users

**Current Response**:
```json
{
  "id": 1,
  "username": "admin",
  "full_name": "Administrator",
  "role": "admin",
  "employee_name": "Admin User",
  "is_active": 1,
  "created_at": "2025-11-15"
}
```

**New Response (ADD)**:
```json
{
  "id": 1,
  "username": "admin",
  "full_name": "Administrator",
  "role": "admin",
  "employee_name": "Admin User",
  "is_active": 1,
  "can_edit": 1,      // NEW
  "can_delete": 1,    // NEW
  "can_view": 1,      // NEW
  "created_at": "2025-11-15"
}
```

**Change**: Update SELECT query to include permission columns

### 2. API Endpoint: PUT /api/users/:userId

**Current Request Body**:
```json
{
  "full_name": "John Doe",
  "role": "employee",
  "employee_name": "John Doe",
  "is_active": 1,
  "new_password": "optional"
}
```

**New Request Body (ADD)**:
```json
{
  "full_name": "John Doe",
  "role": "employee",
  "employee_name": "John Doe",
  "is_active": 1,
  "can_edit": 1,      // NEW
  "can_delete": 0,    // NEW
  "can_view": 1,      // NEW
  "new_password": "optional"
}
```

**Change**: Update UPDATE query to set permission columns

### 3. API Endpoint: POST /api/auth/login

**Current Response**:
```json
{
  "success": true,
  "data": {
    "id": 5,
    "username": "admin",
    "fullName": "Administrator",
    "role": "admin",
    "employeeName": "Admin User"
  }
}
```

**New Response (ADD)**:
```json
{
  "success": true,
  "data": {
    "id": 5,
    "username": "admin",
    "fullName": "Administrator",
    "role": "admin",
    "employeeName": "Admin User",
    "permissions": {    // NEW
      "canEdit": true,
      "canDelete": true,
      "canView": true
    }
  }
}
```

**Change**: Include permissions in login response

### 4. API Endpoint: PUT /api/auth/change-password

**Current Request**:
```json
{
  "currentPassword": "old123",
  "newPassword": "new456"
}
```

**New Request (REMOVE currentPassword)**:
```json
{
  "newPassword": "new456"
}
```

**Change**: Remove current password validation, admin can change any user's password

### 5. New API Endpoint: GET /api/auth/me

**Purpose**: Get current logged-in user with permissions

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 6,
    "username": "mandeep",
    "fullName": "Mandeep Samal",
    "role": "employee",
    "permissions": {
      "canEdit": false,
      "canDelete": false,
      "canView": true
    }
  }
}
```

---

## Permission Checks Throughout Application

### Areas Where Edit/Delete Buttons Must Be Hidden

1. **Sales Table** (Dashboard, Sales Database, etc.)
   - Hide "Edit" button if `!user.permissions.canEdit`
   - Hide "Delete" button if `!user.permissions.canDelete`

2. **Inventory Management**
   - Hide edit actions in inventory table
   - Hide delete actions in inventory table
   - Disable dispatch form if no edit permission
   - Disable QC form if no edit permission

3. **Leads Management**
   - Hide edit/delete buttons in leads table

4. **All Forms**
   - Disable "Save" buttons if no edit permission
   - Show "View Only" message at top

### Global Permission Check Function

```javascript
// Store user permissions globally after login
let currentUserPermissions = {
    canEdit: false,
    canDelete: false,
    canView: true
};

// Check permission before showing buttons
function hasPermission(permission) {
    if (currentUserPermissions.role === 'admin') return true;
    return currentUserPermissions[permission] === true;
}

// Usage:
if (hasPermission('canEdit')) {
    // Show edit button
}
```

---

## Implementation Steps

1. ✅ Create and apply database migration
2. ⏳ Update backend API endpoints
3. ⏳ Update user management page UI
4. ⏳ Update login response to include permissions
5. ⏳ Store permissions in sessionStorage after login
6. ⏳ Create global permission check function
7. ⏳ Add permission checks to all edit/delete buttons
8. ⏳ Remove current password field from change password page
9. ⏳ Test all permission scenarios
10. ⏳ Build and deploy to production

---

## Testing Checklist

### Admin User Tests
- [  ] Can see User Management menu
- [  ] Can view all users with permission badges
- [  ] Can edit employee permissions (grant/revoke Edit and Delete)
- [  ] Can see all edit/delete buttons everywhere
- [  ] Can change any user's password without current password

### Employee User Tests (With Permissions)
- [  ] Cannot see User Management menu
- [  ] Can see edit buttons in tables
- [  ] Can see delete buttons in tables
- [  ] Can edit sales, inventory, leads
- [  ] Cannot access user management

### Employee User Tests (Without Permissions)
- [  ] Cannot see User Management menu
- [  ] Cannot see edit buttons anywhere
- [  ] Cannot see delete buttons anywhere
- [  ] Can only view data (read-only mode)
- [  ] Forms show "View Only" message

---

## Deployment Safety

### Pre-Deployment
1. Backup production database ✅
2. Test thoroughly in sandbox
3. Verify all API endpoints work
4. Check permissions display correctly

### Deployment Steps
1. Apply migration to production database first
2. Deploy new application code
3. Verify login still works
4. Test admin can manage permissions
5. Test employee permissions work correctly

### Rollback Plan
If anything goes wrong:
1. Revert to previous deployment
2. Database changes are backward compatible (new columns with defaults)
3. Old code will ignore new columns

---

## Security Considerations

1. **Backend Validation**: Always validate permissions on backend, never trust frontend
2. **API Protection**: All PUT/DELETE/POST endpoints must check user permissions
3. **Admin Only**: Only admins can modify user permissions
4. **Audit Trail**: Consider logging permission changes

---

**Status**: Ready to implement backend changes
