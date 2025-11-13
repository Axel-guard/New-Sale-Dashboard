# 🚀 Quick Start Guide

## Start the Server

```bash
cd /home/user/webapp
pm2 restart webapp
```

## Access the Application

**URL:** https://3000-id7zgaopnm7accybu066c-b32ec7bb.sandbox.novita.ai

**Login:**
- Username: `admin`
- Password: `admin123`

## Check Status

```bash
pm2 status
pm2 logs webapp --nostream
```

## That's It!

The server automatically:
- ✅ Runs database migrations
- ✅ Creates admin user
- ✅ Starts on port 3000
- ✅ Enables D1 database binding

---

**For more details, see:** LOGIN_FIXED_README.md
