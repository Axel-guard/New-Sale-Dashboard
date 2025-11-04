# Deployment Guide - Cloudflare Pages

## 🌐 Stable Production URL

**USE THIS URL FOR YOUR WORK:**
```
https://webapp-6dk.pages.dev
```

This is your **permanent production URL** that never changes. It always points to the latest deployment on the `main` branch.

### ✅ Why Use This URL?

- **Permanent**: Never changes, always the same URL
- **Automatic**: Automatically updates with each deployment
- **Shareable**: Share this URL with your team
- **Bookmarkable**: Save it in your browser favorites

### ❌ Don't Use Preview URLs

When you deploy, you'll see URLs like:
- `https://49cd1acf.webapp-6dk.pages.dev`
- `https://82bdbd24.webapp-6dk.pages.dev`
- `https://6d5004a9.webapp-6dk.pages.dev`

**These are temporary preview URLs** for each specific deployment. They work, but you don't need to use them.

## 📦 How to Deploy

### Method 1: Deploy from Local Computer
```bash
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name webapp --branch main
```

### Method 2: Use npm script
```bash
npm run deploy:prod
```

After deployment completes, your changes are **automatically live** at:
```
https://webapp-6dk.pages.dev
```

## 🔍 How URL Routing Works

### Cloudflare Pages URL Structure

1. **Production URL (Use This)**
   ```
   https://webapp-6dk.pages.dev
   ```
   - Always points to latest main branch deployment
   - Stable and permanent
   - Recommended for all users

2. **Preview URLs (Ignore These)**
   ```
   https://[random-hash].webapp-6dk.pages.dev
   ```
   - Unique URL for each deployment
   - Used for testing specific versions
   - Not needed for regular use

3. **Branch URLs**
   ```
   https://main.webapp-6dk.pages.dev
   ```
   - Specific to main branch
   - Also stable and permanent
   - Alternative to production URL

## 📋 Deployment Checklist

### Before Deploying
- [ ] Test locally: `npm run build && npm run dev:sandbox`
- [ ] Verify changes work correctly
- [ ] Commit changes to git: `git commit -m "Description"`

### Deploy to Production
```bash
# 1. Build the project
npm run build

# 2. Deploy to production
npx wrangler pages deploy dist --project-name webapp --branch main

# 3. Verify deployment
curl https://webapp-6dk.pages.dev/api/sales/current-month
```

### After Deployment
- [ ] Test production URL: https://webapp-6dk.pages.dev
- [ ] Verify latest fixes are working
- [ ] Notify team if major changes

## 🎯 Quick Reference

### Production URL (Always Use This)
```
https://webapp-6dk.pages.dev
```

### API Endpoints
```
https://webapp-6dk.pages.dev/api/sales
https://webapp-6dk.pages.dev/api/reports/incentives
https://webapp-6dk.pages.dev/api/leads
```

### Test Commands
```bash
# Test if site is working
curl https://webapp-6dk.pages.dev

# Test API
curl https://webapp-6dk.pages.dev/api/sales/current-month

# Test specific sale details
curl https://webapp-6dk.pages.dev/api/sales/order/2019903
```

## 📊 Deployment History

You can view all deployments:
```bash
npx wrangler pages deployment list --project-name webapp
```

Each deployment has:
- Unique ID (the random hash)
- Branch (should be `main`)
- Git commit hash
- Timestamp
- Preview URL

But remember: **The production URL always points to the latest one automatically!**

## 🔧 Troubleshooting

### Issue: Changes not showing on webapp-6dk.pages.dev
**Solution:**
1. Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
2. Check deployment succeeded: `npx wrangler pages deployment list --project-name webapp`
3. Verify latest deployment timestamp matches your deploy time

### Issue: Getting 404 errors
**Solution:**
1. Verify you're using the correct URL: `https://webapp-6dk.pages.dev`
2. Check if deployment completed successfully
3. Test API endpoint: `curl https://webapp-6dk.pages.dev/api/sales`

### Issue: Old code still showing
**Solution:**
1. Hard refresh browser: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Wait 30-60 seconds for CDN cache to clear
3. Test in incognito/private browsing mode

## 📝 Git Workflow

Always commit before deploying:
```bash
# 1. Stage changes
git add .

# 2. Commit with descriptive message
git commit -m "Fix: Description of what you fixed"

# 3. Build and deploy
npm run build
npx wrangler pages deploy dist --project-name webapp --branch main
```

## 🌍 Custom Domain (Future)

If you want a custom domain like `sales.yourcompany.com`:

1. Go to Cloudflare Pages dashboard
2. Select your `webapp` project
3. Go to "Custom domains" tab
4. Add your domain
5. Follow DNS setup instructions

After setup, both URLs will work:
- `https://webapp-6dk.pages.dev` (original)
- `https://sales.yourcompany.com` (custom)

## 🎓 Summary

### Remember These 3 Things:

1. **Production URL**: `https://webapp-6dk.pages.dev` ← Use this always!
2. **Deploy Command**: `npm run deploy:prod`
3. **Preview URLs**: Ignore the random hash URLs

### Your Workflow:
```bash
# Make changes → Test locally → Deploy
npm run build
npx wrangler pages deploy dist --project-name webapp --branch main
# ✅ Now live at: https://webapp-6dk.pages.dev
```

---

**Questions?**
- Check deployments: `npx wrangler pages deployment list --project-name webapp`
- Test production: `curl https://webapp-6dk.pages.dev/api/sales`
- View logs: Check Cloudflare Pages dashboard
