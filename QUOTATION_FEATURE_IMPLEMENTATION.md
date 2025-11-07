# Quotation Feature Implementation Guide

## Completed Tasks ✅

### 1. Login Page
- ✅ Removed demo credentials display
- Users no longer see "Admin: admin/admin123" text

### 2. Sidebar Reorganization
- ✅ Added collapsible menu structure
- ✅ Organized items into categories:
  - **Dashboard** (standalone)
  - **Reports & Analytics** → Sales Reports
  - **Search** → Customer Details, Order Details, Courier Calculator
  - **Sale** → Current Month Sale, Balance Payment, Sale Database
  - **Leads Database** (standalone)
  - **Settings** → User Management, Change Password, Upload Excel Data

### 3. Database Migration
- ✅ Created migration file: `0006_quotations_and_email.sql`
- ✅ Added `email` column to `users` table
- ✅ Created `quotations` table
- ✅ Created `quotation_items` table
- ✅ Created `email_log` table for tracking sent emails

### 4. Add New Menu
- ✅ Added "New Quotation" option alongside "New Sale", "Balance Payment", and "Add New Lead"

---

## Pending Implementation Tasks

### Task 1: Apply Database Migration
```bash
cd /home/user/webapp
npx wrangler d1 migrations apply webapp-production --local
```

### Task 2: Create Quotation API Endpoints

Need to add these endpoints in `/home/user/webapp/src/index.tsx`:

1. **POST /api/quotations** - Create new quotation
2. **GET /api/quotations** - Get all quotations
3. **GET /api/quotations/:id** - Get single quotation
4. **PUT /api/quotations/:id** - Update quotation
5. **DELETE /api/quotations/:id** - Delete quotation
6. **POST /api/quotations/:id/send-email** - Send quotation via email
7. **GET /api/quotations/:id/download** - Generate PDF and download

### Task 3: Create Quotation Modal Form

The form should match the PDF format you provided:
- Company header with logo
- Customer details section (fetch by customer code/mobile)
- Items table (HSN/SAC, Item Name, Quantity, Unit Price)
- Subtotal, GST, Total calculation
- Terms & Conditions
- Bank details for payment
- Action buttons: Save, Send Email, Download PDF

### Task 4: Email Integration (Google Workspace)

**Google Workspace Setup Required:**

1. **Enable Gmail API:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project or select existing
   - Enable Gmail API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs

2. **Create Service Account (Recommended for server-to-server):**
   - Go to IAM & Admin → Service Accounts
   - Create service account
   - Download JSON key file
   - Enable domain-wide delegation
   - Add Gmail API scopes in Workspace Admin

3. **Required Scopes:**
   ```
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.compose
   ```

4. **Store Credentials:**
   - Add to Cloudflare Workers secrets:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_EMAIL
   npx wrangler secret put GOOGLE_PRIVATE_KEY
   npx wrangler secret put GOOGLE_WORKSPACE_DOMAIN
   ```

**Alternative: SMTP Configuration (Easier)**

Use Google Workspace SMTP instead of API:
- SMTP Server: `smtp.gmail.com`
- Port: 587 (TLS) or 465 (SSL)
- Username: Your email address
- Password: App-specific password

To create app password:
1. Go to Google Account → Security
2. Enable 2-Step Verification
3. Go to App Passwords
4. Generate new app password
5. Store in Cloudflare secrets:
   ```bash
   npx wrangler secret put SMTP_HOST
   npx wrangler secret put SMTP_PORT  
   npx wrangler secret put SMTP_USER
   npx wrangler secret put SMTP_PASS
   ```

### Task 5: User Management Email Field

Add email field to user creation/edit forms:
- Update User Management modal
- Add email input field
- Update API to save email
- Validate email format

### Task 6: PDF Generation

For quotation PDF generation, we have two options:

**Option A: HTML to PDF (Recommended for Cloudflare)**
- Use browser-rendered HTML
- Style it to match your estimate template
- Use Cloudflare's Puppeteer or similar service

**Option B: PDF Library**
- Use a lightweight PDF library compatible with Workers
- jsPDF or pdfmake (check Workers compatibility)

### Task 7: Email Template

Professional email template structure:
```html
Subject: Quotation #{QUOTATION_NUMBER} from RealTrack Technology

Dear {CUSTOMER_NAME},

Thank you for your interest in our services. Please find attached the quotation
as per your requirements.

Quotation Number: {QUOTATION_NUMBER}
Date: {DATE}
Total Amount: ₹{TOTAL_AMOUNT}

Items Included:
{ITEMS_LIST}

This quotation is valid for 30 days from the date of issue.

For any queries, please feel free to contact us.

Best regards,
{SENDER_NAME}
RealTrack Technology
Email: {SENDER_EMAIL}
Phone: +91 8755311835

---
This is an automated email. Please do not reply directly to this message.
```

---

## Implementation Priority

### High Priority (Complete First):
1. ✅ Sidebar reorganization (DONE)
2. ✅ Remove demo credentials (DONE)
3. Apply database migration
4. Create quotation form modal
5. Add customer search/autofill functionality
6. Basic save quotation functionality

### Medium Priority:
1. PDF generation and download
2. Email sending functionality
3. User email management
4. Email template creation

### Low Priority:
1. Quotation status tracking (draft/sent/accepted)
2. Email logs and tracking
3. Quotation analytics

---

## Testing Checklist

- [ ] Sidebar collapsible menus work correctly
- [ ] Clicking on submenu items navigates properly
- [ ] Demo credentials no longer visible on login
- [ ] New Quotation option appears in Add New menu
- [ ] Quotation form opens with all fields
- [ ] Customer code search fetches customer details
- [ ] Items can be added/removed dynamically
- [ ] GST calculation works correctly
- [ ] Quotation saves to database
- [ ] PDF downloads with correct data
- [ ] Email sends successfully
- [ ] Email appears in email_log table
- [ ] User management shows email field
- [ ] Multiple users can send emails from their own addresses

---

## Files Modified

1. `/home/user/webapp/src/index.tsx` - Main application file
2. `/home/user/webapp/migrations/0006_quotations_and_email.sql` - Database migration

## Files to Create

1. Quotation modal HTML (add to index.tsx)
2. Quotation API endpoints (add to index.tsx)
3. Quotation JavaScript functions (add to index.tsx)
4. Email service integration
5. PDF generation service

---

## Domain Setup Status

**Domain:** office.axel-guard.com
**Status:** Nameserver propagation in progress (2-6 hours remaining)
**Current URL:** https://webapp-6dk.pages.dev

Once nameservers propagate:
- office.axel-guard.com will be accessible
- SSL certificate will be provisioned
- You'll receive email from Cloudflare when ready

---

## Next Steps for You

1. **Wait for DNS Propagation** (1-6 hours)
   - Check: https://dnschecker.org/ for office.axel-guard.com

2. **Apply Database Migration**
   ```bash
   cd /home/user/webapp
   npx wrangler d1 migrations apply webapp-production --local
   ```

3. **Set Up Google Workspace Email**
   - Choose between Gmail API or SMTP
   - Create app-specific password if using SMTP
   - Add credentials to Cloudflare secrets

4. **Review This Document**
   - Prioritize features
   - Decide on email method (API vs SMTP)
   - Decide on PDF generation method

5. **Continue Development**
   - I can help implement remaining features
   - Let me know which feature to tackle next
   - Share any specific requirements for quotation format

---

## Contact & Support

For any questions or to continue implementation:
- Share screenshots of specific requirements
- Provide sample data for testing
- Let me know your email setup preferences
- Confirm PDF template requirements

The foundation is ready. We can now build the remaining features systematically!
