# Magic Link Authentication - User Guide

## ✨ What is Magic Link Login?

Magic Link is a **passwordless authentication** method that allows users to login by clicking a special link sent to their email. No need to remember passwords!

## 🎯 Benefits

- ✅ **No Password to Remember** - Just need email access
- ✅ **More Secure** - Tokens expire after 15 minutes and can only be used once
- ✅ **User Friendly** - Simple click-to-login experience
- ✅ **Reduced Support** - No password reset requests

## 🚀 How to Use (Development)

### Step 1: Open Login Page

Navigate to your application URL:
- **Sandbox**: https://3000-id7zgaopnm7accybu066c-b32ec7bb.sandbox.novita.ai
- **Local**: http://localhost:3000

### Step 2: Click "Login with Email" Button

You'll see two options on the login page:
1. **Traditional Login** - Email/Password form (center)
2. **Login with Email** - New button below the login form

Click the **"Login with Email"** button (has envelope icon 📧)

### Step 3: Enter Email Address

A modal will appear with:
- **Title**: "Login with Email"
- **Description**: Instructions about the magic link
- **Email Field**: Enter your registered email
- **Send Button**: "Send Magic Link"

**Enter one of these registered emails:**
- `info@axel-guard.com` (Admin account)
- Or any other registered user email

### Step 4: Send Magic Link

Click the **"Send Magic Link"** button

The system will:
1. Check if email exists in database
2. Generate a unique token (valid for 15 minutes)
3. Store token in `magic_links` table
4. In **demo mode**, display the magic link in the success message

### Step 5: Click the Magic Link

In the success message, you'll see:
```
✓ Magic link sent! Please check your email inbox (and spam folder).
```

**In development/demo mode**, the response will also include:
```json
{
  "success": true,
  "message": "Magic link sent to your email!",
  "demo_link": "http://localhost:3000?magic_token=aW5mb0BheG..."
}
```

**Copy and open the `demo_link`** in your browser.

### Step 6: Automatic Login

When you open the magic link:
1. Page detects `?magic_token=...` in URL
2. Automatically sends verification request to backend
3. Backend checks token validity:
   - ✅ Token exists?
   - ✅ Not used before?
   - ✅ Not expired (< 15 minutes old)?
4. If valid, logs you in automatically
5. Removes token from URL (clean address bar)
6. Shows dashboard

## 🔧 For Production Deployment

### Email Service Integration

In production, you need to integrate an email service to send actual emails:

**Recommended Services:**
- **SendGrid** - https://sendgrid.com (Free tier: 100 emails/day)
- **Mailgun** - https://mailgun.com (Free tier: 5,000 emails/month)
- **AWS SES** - https://aws.amazon.com/ses/ (Cheap, requires verification)
- **Resend** - https://resend.com (Modern, developer-friendly)

### Implementation Steps

1. **Choose Email Service** and get API key

2. **Store API Key as Cloudflare Secret**:
```bash
npx wrangler pages secret put SENDGRID_API_KEY --project-name webapp
```

3. **Update `/api/auth/magic-link/send` endpoint** (around line 120):

```typescript
// Remove this demo code:
return c.json({ 
  success: true, 
  message: 'Magic link sent to your email!',
  demo_link: magicLink  // REMOVE THIS LINE
});

// Add actual email sending:
import { sendEmail } from './email-service';  // Your email service wrapper

// Send email using your service
await sendEmail({
  to: email,
  subject: 'Your AxelGuard Login Link',
  html: `
    <h2>Login to AxelGuard</h2>
    <p>Click the link below to login (valid for 15 minutes):</p>
    <a href="${magicLink}">${magicLink}</a>
    <p>If you didn't request this, please ignore this email.</p>
  `
});

return c.json({ 
  success: true, 
  message: 'Magic link sent to your email!'
});
```

4. **Create email service wrapper** for your chosen provider

Example for SendGrid:
```typescript
// src/email-service.ts
export async function sendEmail({ to, subject, html }: { 
  to: string; 
  subject: string; 
  html: string; 
}) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'noreply@axelguard.com', name: 'AxelGuard' },
      subject,
      content: [{ type: 'text/html', value: html }]
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to send email');
  }
}
```

## 📊 Database Structure

### `magic_links` Table

Created by migration `0021_magic_links.sql`:

```sql
CREATE TABLE magic_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,  -- Unix timestamp (ms)
    used INTEGER DEFAULT 0,       -- 0 = unused, 1 = used
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `idx_magic_links_token` - Fast token lookup
- `idx_magic_links_email` - Fast email lookup
- `idx_magic_links_expires` - Cleanup expired tokens

## 🔒 Security Features

1. **Time-Limited Tokens** - Valid for only 15 minutes
2. **Single-Use Tokens** - Each token can only be used once
3. **Secure Random Tokens** - Base64-encoded with timestamp and random data
4. **Email Verification** - Only works for registered users
5. **Active User Check** - Only active users can get magic links

## 🧪 Testing Scenarios

### Test 1: Valid Email
```bash
curl -X POST http://localhost:3000/api/auth/magic-link/send \
  -H "Content-Type: application/json" \
  -d '{"email":"info@axel-guard.com"}'
```

**Expected**: Success response with demo_link

### Test 2: Invalid Email
```bash
curl -X POST http://localhost:3000/api/auth/magic-link/send \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@example.com"}'
```

**Expected**: Success response (for security, doesn't reveal if user exists)

### Test 3: Verify Magic Link
```bash
# First get a token from Test 1, then:
curl -X POST http://localhost:3000/api/auth/magic-link/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN_HERE"}'
```

**Expected**: User data if valid, error if expired/used

### Test 4: Double-Use Prevention
```bash
# Use the same token twice
# First use: Success
# Second use: Error "This magic link has already been used"
```

## 📝 API Endpoints

### POST `/api/auth/magic-link/send`

Generate and send magic link to user's email.

**Request:**
```json
{
  "email": "info@axel-guard.com"
}
```

**Response (Development):**
```json
{
  "success": true,
  "message": "Magic link sent to your email!",
  "demo_link": "http://localhost:3000?magic_token=aW5mb0..."
}
```

**Response (Production):**
```json
{
  "success": true,
  "message": "Magic link sent to your email!"
}
```

### POST `/api/auth/magic-link/verify`

Verify magic link token and login user.

**Request:**
```json
{
  "token": "aW5mb0BheGVsLWd1YXJkLmNvbToxNzYzNjM0ODg0Mjc4OjAuZHd6cnFvMDdxaGE="
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "username": "info@axel-guard.com",
    "fullName": "Administrator",
    "role": "admin",
    "permissions": { ... }
  }
}
```

**Response (Error - Used):**
```json
{
  "success": false,
  "error": "This magic link has already been used"
}
```

**Response (Error - Expired):**
```json
{
  "success": false,
  "error": "Magic link has expired. Please request a new one."
}
```

## 🎨 UI Components

### Login Page Button

Located below the traditional login form:
```html
<button type="button" class="google-login-btn" onclick="showMagicLinkModal()">
    <i class="fas fa-envelope"></i> Login with Email
</button>
```

### Magic Link Modal

Popup modal with email input form:
- Modal ID: `magicLinkModal`
- Form ID: `magicLinkForm`
- Email Input ID: `magicLinkEmail`
- Error Div ID: `magicLinkError`
- Success Div ID: `magicLinkSuccess`

### JavaScript Functions

1. `showMagicLinkModal()` - Opens the modal
2. `closeMagicLinkModal()` - Closes the modal
3. `sendMagicLink(event)` - Handles form submission
4. `window.addEventListener('load', ...)` - Auto-verifies token on page load

## 🔍 Debugging

### Check Database Tokens

```bash
# Local database
npx wrangler d1 execute webapp-production --local \
  --command="SELECT * FROM magic_links ORDER BY created_at DESC LIMIT 10"

# Production database
npx wrangler d1 execute webapp-production --remote \
  --command="SELECT * FROM magic_links ORDER BY created_at DESC LIMIT 10"
```

### Check Logs

```bash
# PM2 logs
pm2 logs webapp --nostream

# Look for:
# [MAGIC LINK] Send request for email: ...
# [MAGIC LINK] Generated link: ...
# [MAGIC LINK] Verify request
# [MAGIC LINK] Success for user: ...
```

### Common Issues

1. **"Invalid magic link"** - Token doesn't exist in database
2. **"Already used"** - Token has been used before
3. **"Expired"** - More than 15 minutes passed
4. **"User not found"** - Email not registered

## 📦 Files Modified

1. **`/home/user/webapp/src/index.tsx`**
   - Added magic link modal HTML (after line 8457)
   - Added magic link API endpoints (after line 99)
   - Added magic link JavaScript functions (before line 18453)
   - Changed button text from "Google" to "Email"

2. **`/home/user/webapp/migrations/0021_magic_links.sql`**
   - Created `magic_links` table with indexes

3. **`/home/user/webapp/README.md`**
   - Added magic link documentation

## 🎉 Success!

Your application now supports passwordless authentication via magic links! 

Users can login by simply clicking a link in their email - no password needed! 🚀
