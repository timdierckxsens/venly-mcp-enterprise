# 🖥️ Connect Claude Desktop to Your Venly MCP Server

## 📋 What You Need:
- Claude Desktop app installed
- Your Railway MCP server running (✅ you have this!)
- 5 minutes

---

## 🎯 **Method 1: Local Connection** (Recommended - Faster & More Reliable)

This runs the MCP server on your computer and connects directly to Claude Desktop.

### **Step 1: Install Your MCP Package**

Open your terminal and run:

```bash
npm install -g github:timdierckxsens/venly-mcp-enterprise
```

### **Step 2: Configure Claude Desktop**

**On macOS:**
1. Open: `~/Library/Application Support/Claude/claude_desktop_config.json`

**On Windows:**
1. Open: `%APPDATA%\Claude\claude_desktop_config.json`

**On Linux:**
1. Open: `~/.config/Claude/claude_desktop_config.json`

### **Step 3: Add This Configuration**

Paste this into the file (replace any existing content):

```json
{
  "mcpServers": {
    "venly-treasury": {
      "command": "npx",
      "args": ["-y", "github:timdierckxsens/venly-mcp-enterprise"],
      "env": {
        "VENLY_CLIENT_ID": "29ca4641-3d28-40fd-9000-27dadae72cf1",
        "VENLY_CLIENT_SECRET": "527085ae-8b24-4b8b-b256-04cb15206831",
        "VENLY_ENVIRONMENT": "sandbox",
        "TREASURY_WALLET_ID": "fe448cb6-1240-4002-9f0a-c99ada82af5e",
        "SAFE_MODE_MAX_AMOUNT": "1000",
        "AUDIT_LOG_ENABLED": "true",
        "AUDIT_PROVIDER": "local"
      }
    }
  }
}
```

### **Step 4: Restart Claude Desktop**

1. Quit Claude Desktop completely
2. Reopen it
3. Look for a 🔌 icon (MCP tools connected)

---

## 🧪 **Test It Works:**

In Claude Desktop, try saying:

```
"Show me my Venly treasury balance across all chains"
```

Claude should use your MCP tool to fetch real balance data!

---

## 🎯 **Method 2: Remote Connection** (HTTP - For Advanced Users)

Connect Claude Desktop to your Railway server.

### **Configuration:**

```json
{
  "mcpServers": {
    "venly-treasury-remote": {
      "command": "node",
      "args": ["-e", "require('http').get('https://hearty-reprieve-production.up.railway.app/mcp')"],
      "transport": "sse"
    }
  }
}
```

**Note:** This method is experimental and may have limitations.

---

## ✅ **What You Can Do in Claude Desktop:**

Once connected, you can chat naturally:

### **Check Balances:**
- *"What's my treasury balance?"*
- *"Show USDC across all chains"*

### **Make Payments:**
- *"Pay invoice INV-001 for $100 USDC to 0x123... on Polygon"*
- *"Settle this invoice with confirmed=true and origin=claude"*

### **Batch Payments:**
- *"Process payouts for these addresses: [paste CSV]"*

### **View History:**
- *"Show my last transaction"*
- *"Open the dashboard"*

---

## 🔍 **Verify Connection:**

Look for these signs in Claude Desktop:

1. **🔌 Icon** in the bottom corner (MCP connected)
2. **Hammer icon** when composing (tools available)
3. Claude mentions **"venly_"** tools when you ask about payments

---

## 🚨 **Troubleshooting:**

### **"MCP server failed to start"**
- Make sure Node.js is installed: `node --version`
- Try: `npm install -g npm` to update npm

### **"Cannot find module"**
- Run: `npm install -g github:timdierckxsens/venly-mcp-enterprise`

### **"Connection refused"**
- Railway server might be sleeping
- Open: https://hearty-reprieve-production.up.railway.app/healthz
- Wait 30 seconds for it to wake up

### **No 🔌 icon showing**
- Check config file has correct JSON syntax
- Restart Claude Desktop completely (quit + reopen)
- Check logs in: `~/Library/Logs/Claude/mcp*.log`

---

## 💡 **Pro Tips:**

1. **Keep Railway Dashboard Open:** Monitor transactions in real-time
2. **Start with Small Amounts:** Test with $1-10 in sandbox first
3. **Use Natural Language:** Claude understands context, just talk normally
4. **Check Audit Logs:** Every transaction is logged automatically

---

## 🎉 **You're Ready!**

Your Venly MCP is now connected to Claude Desktop. You can make crypto payments just by chatting!

**Try it now:** Open Claude Desktop and say *"Check my Venly treasury balance"*
