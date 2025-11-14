# Venly MCP Treasury Server - Production Deployment Guide

## 🎯 What This Is

A **production-grade MCP server** for your Venly treasury operations with:
- ✅ **Safe Mode**: Prevents accidental large transfers
- ✅ **Health Monitoring**: Auto-healing with Railway
- ✅ **Audit Trail**: Every transaction logged to Google Sheets
- ✅ **10/10 Production Ready**: All safety features implemented

## 🚀 15-Minute CEO Deployment

### Step 1: Fork This Repository
1. Click "Fork" button on GitHub
2. Name it: `venly-treasury-mcp`
3. Keep it private for security

### Step 2: Deploy to Railway ($5/month)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/venly-mcp)

**OR Manual Setup:**

1. Go to [Railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your forked repository
4. Railway auto-detects the configuration

### Step 3: Configure Environment Variables

In Railway dashboard, add these variables:

```bash
# REQUIRED - Get from https://portal.venly.io/
VENLY_CLIENT_ID=your-client-id
VENLY_CLIENT_SECRET=your-secret

# START WITH SANDBOX
VENLY_ENVIRONMENT=sandbox

# Your treasury wallet (create in Venly first)
TREASURY_WALLET_ID=your-wallet-uuid

# Safety settings (CRITICAL)
SAFE_MODE_MAX_AMOUNT=1000
AUDIT_LOG_ENABLED=true
```

### Step 4: Verify Health

Once deployed, visit:
```
https://your-app.up.railway.app/healthz
```

You should see:
```json
{
  "status": "healthy",
  "environment": "sandbox",
  "checks": {
    "venly_oauth": "healthy",
    "safe_mode": "enabled"
  }
}
```

### Step 5: View Dashboard

Visit:
```
https://your-app.up.railway.app/dashboard
```

## 📊 Google Sheets Audit Setup (Recommended)

### Why You Need This:
Every transaction creates an immutable record - critical for compliance and debugging.

### Setup (10 minutes):

1. **Create Google Sheet**:
   - Name: "Venly MCP Audit Log"
   - Share with service account email

2. **Create Service Account**:
   ```
   1. Go to https://console.cloud.google.com
   2. Create new project or select existing
   3. Enable Google Sheets API
   4. Create service account
   5. Download JSON key
   ```

3. **Add to Railway**:
   ```bash
   AUDIT_PROVIDER=sheets
   GOOGLE_SHEETS_CREDS=<paste entire JSON here>
   ```

## 🔗 Integration Points

### For n8n Workflows:
```javascript
// Add to n8n HTTP Request node
URL: https://your-app.up.railway.app/mcp
Method: POST
Headers: 
  Content-Type: application/json
Body:
{
  "jsonrpc": "2.0",
  "method": "venly_settle_invoice",
  "params": {
    "invoiceId": "INV-001",
    "recipientAddress": "0x...",
    "amount": "100",
    "chain": "POLYGON",
    "confirmed": true,
    "origin": "n8n"
  }
}
```

### For Claude Desktop:
Add to config:
```json
{
  "mcpServers": {
    "venly-treasury": {
      "command": "npx",
      "args": ["-y", "github:yourusername/venly-treasury-mcp"]
    }
  }
}
```

## 🛡️ Safe Mode Features

In production, these are ENFORCED:

| Check | Limit | Action if Exceeded |
|-------|-------|-------------------|
| Max Transaction | $1000 | BLOCKED |
| Requires Confirmation | `confirmed: true` | BLOCKED |
| Allowed Origins | n8n, internal | BLOCKED |
| Warning Threshold | $500 | LOGGED |

## 📈 Production Checklist

### Before First Real Transaction:

- [ ] Test in `sandbox` environment
- [ ] Create test transaction < $10
- [ ] Verify audit log captures it
- [ ] Check dashboard shows metrics
- [ ] Test safe mode (try amount > limit)
- [ ] Verify health endpoint returns 200

### Going to Production:

1. **Change environment**:
   ```bash
   VENLY_ENVIRONMENT=production
   TREASURY_WALLET_ID=<production-wallet-id>
   ```

2. **Increase limits carefully**:
   ```bash
   SAFE_MODE_MAX_AMOUNT=5000  # Based on your needs
   ```

3. **Set up alerts**:
   ```bash
   SLACK_ALERT_WEBHOOK=https://hooks.slack.com/...
   ALERT_EMAIL=ceo@venly.io
   ```

## 🔧 Available Tools

### Treasury Operations (High-Level):
- `venly_settle_invoice` - Pay invoices with USDC
- `venly_batch_payouts` - Multiple freelancer payments
- `venly_get_treasury_position` - View all balances

### Wallet Operations (Low-Level):
- `venly_create_wallet` - Create new wallet
- `venly_execute_transaction` - Send tokens
- `venly_get_balance` - Check balances

## 📊 Monitoring

### Key Metrics to Watch:
1. **Success Rate** - Should be >95%
2. **Last Successful TX** - Should be recent
3. **Failed Transactions** - Investigate any failures
4. **Audit Log Rows** - Should match transaction count

### Railway Dashboard:
- **Logs**: View all operations
- **Metrics**: CPU, Memory usage
- **Deployments**: History of updates
- **Settings**: Environment variables

## 🚨 Troubleshooting

### "Safe mode violation"
**Cause**: Transaction exceeds limits or missing confirmation
**Fix**: Check amount and add `confirmed: true`

### "Rate limit exceeded"  
**Cause**: Too many requests
**Fix**: Wait 1 minute, requests auto-resume

### "Venly OAuth unhealthy"
**Cause**: Invalid credentials or Venly is down
**Fix**: Verify CLIENT_ID and CLIENT_SECRET

### "Transaction timeout"
**Cause**: Network congestion
**Fix**: Retry or check on block explorer

## 💰 Cost Breakdown

| Service | Cost | What You Get |
|---------|------|--------------|
| Railway | $5/mo | Hosting, auto-scaling, monitoring |
| Venly | Free tier → $99/mo | Based on transaction volume |
| Google Sheets | Free | Audit logging |
| Your time | 15 minutes | Complete setup |

## 🎯 Your Specific Use Case (Pakistani Bank)

For $2-4M monthly freelancer payouts:

1. **Use batch tool**:
   ```javascript
   venly_batch_payouts({
     payouts: [...freelancers],
     chain: "POLYGON",  // Lowest fees
     confirmed: true,
     origin: "n8n"
   })
   ```

2. **Set appropriate limits**:
   ```bash
   SAFE_MODE_MAX_AMOUNT=10000  # For larger batches
   ```

3. **Monitor closely**:
   - Check dashboard hourly initially
   - Review audit logs daily
   - Set up Slack alerts

## 📞 Support Escalation

1. **Check dashboard** - Most issues visible here
2. **Review audit logs** - See exactly what happened  
3. **Check Railway logs** - Detailed error messages
4. **Venly Status** - https://status.venly.io/
5. **Emergency** - Disable in Railway, investigate offline

## ✅ You're Production Ready When:

- [ ] Health check shows all green
- [ ] Successfully sent test transaction
- [ ] Audit log capturing all operations
- [ ] Safe mode blocked a test over-limit transaction
- [ ] n8n workflow connected and tested
- [ ] Dashboard bookmarked for daily review

---

**Remember**: Start in `sandbox`, test everything, then switch to `production`.
Safety features are your friend - they prevent expensive mistakes.

Built for CEOs who need reliability without complexity. 🚀
