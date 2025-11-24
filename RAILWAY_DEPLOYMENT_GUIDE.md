# 🚂 Deploy Your Venly MCP Server to Railway
## Simple Step-by-Step Guide (No Technical Skills Required)

---

## 📋 What You'll Need (5 minutes)

1. **GitHub Account** - You already have this ✅
2. **Railway Account** - Free to create at [railway.app](https://railway.app)
3. **Venly Credentials** - From [portal.venly.io](https://portal.venly.io)

---

## 🚀 Step 1: Create Railway Account

1. Go to **https://railway.app**
2. Click **"Login"** in the top right
3. Click **"Login with GitHub"**
4. Authorize Railway to access your GitHub
5. You'll see the Railway dashboard

✅ **Done!** Railway is connected to your GitHub account.

---

## 🔗 Step 2: Deploy Your Repository

1. In Railway, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Find and select: **`venly-mcp-enterprise`**
4. Railway will start building automatically

⏳ **Wait 2-3 minutes** - You'll see logs scrolling. This is normal!

---

## 🔧 Step 3: Add Your Venly Credentials

**IMPORTANT:** Your server needs these to work!

1. In Railway, click on your project
2. Click the **"Variables"** tab
3. Click **"+ New Variable"** and add each of these:

### Required Variables:

```
VENLY_CLIENT_ID
Your client ID from portal.venly.io

VENLY_CLIENT_SECRET
Your secret from portal.venly.io

VENLY_ENVIRONMENT
sandbox   (use "sandbox" for testing, "production" when ready)

TREASURY_WALLET_ID
Your wallet UUID from Venly (create a wallet first if you haven't)

SAFE_MODE_MAX_AMOUNT
1000   (maximum transaction amount in dollars)

AUDIT_LOG_ENABLED
true

AUDIT_PROVIDER
local
```

4. Click **"Add"** after entering each one
5. Railway will **automatically redeploy** with the new variables

---

## ✅ Step 4: Get Your Live URL

1. Still in Railway, click the **"Settings"** tab
2. Scroll to **"Domains"**
3. Click **"Generate Domain"**
4. You'll get a URL like: `your-app.up.railway.app`

**Copy this URL** - you'll need it!

---

## 🎯 Step 5: Test It's Working

Open these URLs in your browser (replace `your-app` with your actual domain):

### Dashboard:
```
https://your-app.up.railway.app/dashboard
```
You should see a nice dashboard with:
- ✅ System Status
- ✅ Safe Mode: ENABLED
- ✅ Environment: sandbox

### Health Check:
```
https://your-app.up.railway.app/healthz
```
Should show JSON with `"status": "healthy"`

---

## 🎉 Success! Your Server is Live

You now have a **24/7 running MCP server** at:
- **Dashboard:** `https://your-app.up.railway.app/dashboard`
- **API Endpoint:** `https://your-app.up.railway.app/mcp`

---

## 🔄 Next Steps

### Before First Transaction:

1. **Create a Treasury Wallet:**
   - Go to https://portal.venly.io
   - Create a new wallet (Polygon/Base/Ethereum)
   - Copy the Wallet ID
   - Add it to Railway as `TREASURY_WALLET_ID` variable

2. **Test in Sandbox:**
   - Make sure `VENLY_ENVIRONMENT=sandbox`
   - Try a small test transaction ($1-10)
   - Check the dashboard for success

3. **When Ready for Production:**
   - Change `VENLY_ENVIRONMENT` to `production` in Railway
   - Increase `SAFE_MODE_MAX_AMOUNT` if needed
   - Monitor the dashboard closely

---

## 📊 Using Your Server

### For n8n Workflows:
Use this endpoint in HTTP Request nodes:
```
https://your-app.up.railway.app/mcp
```

### For Claude Desktop:
See the main README.md for configuration

---

## 🆘 Troubleshooting

### Server Shows "Unhealthy"
- Check your Venly credentials are correct
- Make sure `TREASURY_WALLET_ID` is set
- View logs in Railway (Deployments tab → Click latest → View logs)

### Transactions Failing
- Verify you're in correct environment (sandbox vs production)
- Check wallet has enough balance
- Look at dashboard for error messages

### Can't Access Dashboard
- Make sure you generated a domain in Railway
- Wait 2-3 minutes after deployment
- Check Railway logs for errors

---

## 💰 Cost

- **Railway:** $5/month (hobby plan)
- **Venly:** Free tier available, scales with usage

---

## 🔐 Security Notes

1. ✅ Your credentials are stored securely in Railway
2. ✅ Safe mode prevents accidental large transfers
3. ✅ All transactions are logged for audit
4. ✅ Repository is private on GitHub

**Never share your `VENLY_CLIENT_SECRET` with anyone!**

---

## 📞 Need Help?

1. Check the **Dashboard** first - it shows most issues
2. View **Railway Logs** - they show detailed errors
3. Check **Venly Status** - https://status.venly.io

---

**You're all set! 🚀**

Your treasury automation system is now running in the cloud!
