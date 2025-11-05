# Custom Domain Setup Guide: office.axel-guard.com

## 🎯 Goal
Set up `office.axel-guard.com` for your Sales Management System without affecting existing websites.

## 🌐 Your Domain Structure

**BEFORE:**
- `axel-guard.com` → Main website
- `live.axel-guard.com` → Live website

**AFTER:**
- `axel-guard.com` → Main website ✅ (unchanged)
- `live.axel-guard.com` → Live website ✅ (unchanged)
- `office.axel-guard.com` → Sales Management System 🆕

---

## 📋 Step-by-Step Instructions

### Part 1: BigRock DNS Configuration

1. **Login to BigRock**
   - URL: https://www.bigrock.in
   - Login with your account credentials

2. **Access Domain Management**
   - Click "My Account" or "My Services"
   - Find "My Domains"
   - Click on `axel-guard.com`
   - Look for "Manage DNS" or "DNS Management" button

3. **Add CNAME Record**
   
   Click "Add Record" and fill in:
   
   | Field | Value |
   |-------|-------|
   | **Record Type** | CNAME |
   | **Host/Name** | office |
   | **Points to / Value** | webapp-6dk.pages.dev |
   | **TTL** | 3600 (or leave as Auto) |

4. **Save Changes**
   - Click "Add" or "Save"
   - You should see the new record in your DNS records list

5. **Screenshot Your DNS Records**
   - Take a screenshot showing all DNS records
   - Verify you can see: `office` CNAME pointing to `webapp-6dk.pages.dev`

---

### Part 2: Cloudflare Pages Configuration

#### Option A: Using Wrangler CLI (Automated)

Run these commands:

```bash
# Navigate to project
cd /home/user/webapp

# Add custom domain
npx wrangler pages domain add office.axel-guard.com --project-name webapp

# Check domain status
npx wrangler pages domain list --project-name webapp
```

#### Option B: Using Cloudflare Dashboard (Manual)

1. **Open Cloudflare Pages Dashboard**
   - Go to: https://dash.cloudflare.com/
   - Select your account
   - Click "Workers & Pages"
   - Click on "webapp" project

2. **Add Custom Domain**
   - Click "Custom domains" tab
   - Click "Set up a custom domain"
   - Enter: `office.axel-guard.com`
   - Click "Continue"

3. **Verify Domain**
   - Cloudflare will check DNS records
   - If CNAME is correct, it will verify automatically
   - Click "Activate domain"

---

### Part 3: Verification & Testing

#### Check DNS Propagation

**Windows:**
```cmd
nslookup office.axel-guard.com
```

**Mac/Linux:**
```bash
nslookup office.axel-guard.com
# or
dig office.axel-guard.com
```

**Expected Output:**
```
office.axel-guard.com   canonical name = webapp-6dk.pages.dev
```

#### Test Your Domain

After DNS propagates (5-30 minutes), test:

```bash
curl -I https://office.axel-guard.com
```

**Expected:** HTTP 200 OK

---

## 🔧 Troubleshooting

### Issue 1: "Domain not found" or "DNS not resolved"

**Cause:** DNS not propagated yet

**Solution:**
- Wait 15-30 minutes
- Clear DNS cache:
  - Windows: `ipconfig /flushdns`
  - Mac: `sudo dscacheutil -flushcache`
  - Linux: `sudo systemd-resolve --flush-caches`

---

### Issue 2: "SSL/HTTPS not working"

**Cause:** Cloudflare is provisioning SSL certificate

**Solution:**
- Wait 5-15 minutes for SSL provisioning
- Cloudflare automatically generates free SSL certificate
- Once ready, HTTPS will work automatically

---

### Issue 3: "Domain verification failed"

**Cause:** CNAME record not pointing correctly

**Solution:**
1. Check BigRock DNS records
2. Verify CNAME points to: `webapp-6dk.pages.dev` (not the hash URL)
3. Wait 10 minutes and try again

---

### Issue 4: "Affecting existing websites"

**Answer:** **This won't happen!**

**Why?**
- Subdomains are independent DNS entries
- `office.axel-guard.com` is separate from `axel-guard.com`
- Each CNAME record points to different destinations
- No cross-interference is possible

**To verify:**
```bash
# Test main domain (should work unchanged)
curl -I https://axel-guard.com

# Test live subdomain (should work unchanged)
curl -I https://live.axel-guard.com

# Test new office subdomain (should work after setup)
curl -I https://office.axel-guard.com
```

---

## 📊 DNS Record Comparison

### Before (Existing):
```
Type    Host    Value                           Status
─────────────────────────────────────────────────────────
A       @       [IP Address]                    ✅ Working
CNAME   live    [live.destination.com]          ✅ Working
```

### After (With Office Subdomain):
```
Type    Host    Value                           Status
─────────────────────────────────────────────────────────
A       @       [IP Address]                    ✅ Working (unchanged)
CNAME   live    [live.destination.com]          ✅ Working (unchanged)
CNAME   office  webapp-6dk.pages.dev            🆕 New subdomain
```

**Notice:** Existing records remain **completely untouched**!

---

## 🎓 Understanding Subdomains

### What is a Subdomain?

A subdomain is a separate website under your main domain.

**Example:**
- `axel-guard.com` = Main domain (root)
- `office.axel-guard.com` = Subdomain
- `live.axel-guard.com` = Subdomain

**Think of it like:**
```
Main House:    axel-guard.com
Side Building: live.axel-guard.com
New Office:    office.axel-guard.com
```

Each building is independent - renovating the office won't affect the main house!

---

## 🔒 Security & SSL

### Free SSL Certificate

Cloudflare automatically provides:
- ✅ Free SSL certificate (HTTPS)
- ✅ Auto-renewal (never expires)
- ✅ CDN protection
- ✅ DDoS protection
- ✅ Always-on HTTPS

### Your Users Will See:
```
🔒 Secure | https://office.axel-guard.com
```

No "Not Secure" warning - fully encrypted!

---

## 📱 Access URLs After Setup

### For Your Team:
```
https://office.axel-guard.com
```
✅ Professional domain
✅ Easy to remember
✅ Looks official

### Fallback URLs (Still work):
```
https://webapp-6dk.pages.dev
https://55fee99a.webapp-6dk.pages.dev
```

All three URLs will point to the same application!

---

## 🚀 Timeline

| Step | Time | Status |
|------|------|--------|
| Add CNAME in BigRock | 2 minutes | Manual |
| DNS Propagation | 5-30 minutes | Automatic |
| Add domain in Cloudflare | 2 minutes | Manual |
| Domain Verification | 1-5 minutes | Automatic |
| SSL Certificate | 5-15 minutes | Automatic |
| **Total Time** | **15-60 minutes** | |

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Can access `https://office.axel-guard.com`
- [ ] HTTPS works (green lock icon)
- [ ] Login page loads correctly
- [ ] Main site `axel-guard.com` still works
- [ ] Live site `live.axel-guard.com` still works
- [ ] Dashboard loads after login
- [ ] All features work (sales, payments, etc.)

---

## 📞 Support

### If DNS Doesn't Propagate

**Contact BigRock Support:**
- Email: support@bigrock.in
- Phone: +91-80-66012222
- Chat: Live chat on website

**What to ask:**
- "I added a CNAME record for `office` subdomain"
- "Can you verify it's configured correctly?"
- "When will DNS propagate?"

### If Cloudflare Verification Fails

**Check These:**
1. CNAME record in BigRock is correct
2. Value is `webapp-6dk.pages.dev` (not hash URL)
3. TTL is 3600 or Auto
4. Waited at least 15 minutes for propagation

---

## 🎉 Final Result

**After successful setup:**

Your team can access the sales system at:
```
https://office.axel-guard.com
```

**Benefits:**
- ✅ Professional custom domain
- ✅ Easy to remember
- ✅ Branded URL
- ✅ Free SSL (HTTPS)
- ✅ No affect on existing websites
- ✅ Same login credentials
- ✅ All features work perfectly

---

## 📝 Summary

**What to do in BigRock:**
1. Login to BigRock
2. Go to DNS Management for `axel-guard.com`
3. Add CNAME: `office` → `webapp-6dk.pages.dev`
4. Save

**What to do in Cloudflare:**
1. Run: `npx wrangler pages domain add office.axel-guard.com --project-name webapp`
2. Wait for verification

**Wait:**
- 15-30 minutes for DNS propagation
- 5-15 minutes for SSL certificate

**Test:**
- Visit `https://office.axel-guard.com`
- Verify other websites still work

---

**Need Help?** Let me know if you encounter any issues during setup!
