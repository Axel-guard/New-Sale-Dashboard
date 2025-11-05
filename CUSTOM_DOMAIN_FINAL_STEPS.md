# Final Steps: Setup office.axel-guard.com

## ✅ Step 1: BigRock DNS (Do This First)

You showed me your BigRock DNS screen. Here's exactly what to do:

### Click "+Add A Record" (blue link at top)

Then fill in:

```
┌──────────────────────────────────────┐
│ Record Type:  CNAME                  │
│ Host:         office                 │
│ Points To:    webapp-6dk.pages.dev  │
│ TTL:          3600                   │
└──────────────────────────────────────┘
```

### **IMPORTANT:**
- Type exactly: `office` (not office.axel-guard.com)
- Type exactly: `webapp-6dk.pages.dev` (not the hash URL)
- Save the record

### After Saving:
You should see a new line in your CNAME records:
```
office.axel-guard.com  IN  CNAME  webapp-6dk.pages.dev
```

---

## ✅ Step 2: Cloudflare Dashboard (Do After DNS)

### **Go to Cloudflare Dashboard:**

Open this URL in your browser:
```
https://dash.cloudflare.com/
```

### **Navigate to Your Project:**

1. Login with your Cloudflare account
2. Click **"Workers & Pages"** in left sidebar
3. Find and click on **"webapp"** project
4. Click **"Custom domains"** tab

### **Add Custom Domain:**

1. Click **"Set up a custom domain"** button
2. Enter: `office.axel-guard.com`
3. Click **"Continue"**
4. Wait for verification (may take 15-30 minutes)
5. Click **"Activate domain"** when ready

### **Visual Guide:**

```
Cloudflare Dashboard
└── Workers & Pages
    └── webapp (click)
        └── Custom domains (tab)
            └── "Set up a custom domain" (button)
                └── Enter: office.axel-guard.com
```

---

## ⏰ Timeline

| Step | Time | What Happens |
|------|------|--------------|
| 1. Add DNS in BigRock | 2 min | You manually add CNAME |
| 2. DNS Propagation | 15-30 min | Automatic, internet-wide |
| 3. Add domain in Cloudflare | 2 min | You manually configure |
| 4. Domain Verification | 2-5 min | Cloudflare checks DNS |
| 5. SSL Certificate | 5-15 min | Cloudflare auto-generates |
| **TOTAL** | **~30-60 min** | |

---

## 🧪 Testing

### Check DNS Propagation

**Windows Command Prompt:**
```cmd
nslookup office.axel-guard.com
```

**Expected Output:**
```
office.axel-guard.com   canonical name = webapp-6dk.pages.dev
```

### Test Your Domain

After setup completes, test:
```
https://office.axel-guard.com
```

You should see your login page!

---

## 📸 Screenshots to Take

For verification, take screenshots of:

1. **BigRock DNS Records** - showing the new CNAME
2. **Cloudflare Custom Domains** - showing office.axel-guard.com active
3. **Browser** - showing office.axel-guard.com working with green lock

---

## ❓ Troubleshooting

### "Domain verification pending"

**Cause:** DNS not propagated yet

**Solution:**
- Wait 15-30 minutes
- Check DNS with nslookup
- Refresh Cloudflare page

---

### "CNAME already exists" error

**Cause:** You may have added the record before

**Solution:**
- Check BigRock DNS records
- Look for existing `office` CNAME
- If exists, verify it points to `webapp-6dk.pages.dev`

---

### "SSL/TLS certificate provisioning"

**Status:** Normal! 

**Action:**
- Wait 5-15 minutes
- SSL auto-generates
- HTTPS will work automatically

---

### Existing websites not working

**Check:**
```bash
# Main site
curl -I https://axel-guard.com

# Live site  
curl -I https://live.axel-guard.com
```

Both should return `HTTP 200 OK`

**If broken:**
- You may have accidentally modified existing DNS records
- Check BigRock DNS - restore original records
- Contact BigRock support

---

## 🎯 Quick Checklist

### In BigRock:
- [ ] Logged into BigRock
- [ ] Opened DNS Management for axel-guard.com
- [ ] Clicked "+Add A Record" or similar
- [ ] Selected Record Type: CNAME
- [ ] Entered Host: office
- [ ] Entered Points To: webapp-6dk.pages.dev
- [ ] Saved the record
- [ ] Can see new CNAME in list

### In Cloudflare:
- [ ] Opened dash.cloudflare.com
- [ ] Navigated to Workers & Pages
- [ ] Clicked on webapp project
- [ ] Clicked Custom domains tab
- [ ] Clicked "Set up a custom domain"
- [ ] Entered: office.axel-guard.com
- [ ] Waited for verification
- [ ] Domain shows as "Active"

### Testing:
- [ ] Ran nslookup office.axel-guard.com
- [ ] Got CNAME response
- [ ] Visited https://office.axel-guard.com
- [ ] Saw login page
- [ ] Green lock icon (HTTPS)
- [ ] Existing sites still work

---

## 🆘 Need Help?

### BigRock Support:
- **Email:** support@bigrock.in
- **Phone:** +91-80-66012222
- **Chat:** Live chat on website

**What to ask:**
"I need to add a CNAME record for office subdomain pointing to webapp-6dk.pages.dev. Can you help?"

### Cloudflare Support:
- **Docs:** https://developers.cloudflare.com/pages/platform/custom-domains/
- **Community:** https://community.cloudflare.com/

---

## 📝 Summary

**What you're doing:**
1. Adding CNAME in BigRock
2. Configuring domain in Cloudflare
3. Waiting for propagation
4. Testing the new URL

**What you get:**
- Professional URL: office.axel-guard.com
- Free SSL certificate
- No impact on existing websites
- Easy to share with team

**Total time:** 30-60 minutes (mostly waiting)

---

**After this is done:**
- Share `https://office.axel-guard.com` with your 4 employees
- They can bookmark it
- Use same login credentials
- All features work identically

Good luck! Let me know once you've added the DNS record and I can help verify it.
