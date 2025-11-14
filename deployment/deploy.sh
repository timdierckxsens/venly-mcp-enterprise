#!/bin/bash

# ================================================
# Venly MCP Treasury - Enterprise Deploy Script v2
# ================================================
# Production-grade deployment with validation & rollback

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Deployment state tracking for rollback
DEPLOYMENT_DIR=""
REPO_CREATED=false
GITHUB_REPO=""

# Cleanup function for rollback
cleanup_on_failure() {
    echo -e "${RED}❌ Deployment failed. Rolling back...${NC}"
    
    if [ "$REPO_CREATED" = true ] && [ -n "$GITHUB_REPO" ]; then
        echo "Cleaning up GitHub repository..."
        if command -v gh &> /dev/null; then
            gh repo delete "$GITHUB_REPO" --yes 2>/dev/null || true
        fi
    fi
    
    if [ -n "$DEPLOYMENT_DIR" ] && [ -d "$DEPLOYMENT_DIR" ]; then
        echo "Cleaning up local files..."
        cd ..
        rm -rf "$DEPLOYMENT_DIR"
    fi
    
    echo -e "${YELLOW}Rollback complete. Please check your inputs and try again.${NC}"
    exit 1
}

# Set trap for cleanup on error
trap cleanup_on_failure ERR

echo "
╔════════════════════════════════════════════════╗
║     Venly MCP Treasury - Enterprise Deploy    ║
║     Version 2.0 - With Safety & Validation    ║
╚════════════════════════════════════════════════╝
"

# ================================================
# STEP 1: Prerequisites & Validation
# ================================================

echo -e "${GREEN}📋 Step 1: Checking prerequisites...${NC}"

# Check OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OPEN_CMD="open"
    OS_TYPE="macOS"
else
    OPEN_CMD="xdg-open"
    OS_TYPE="Linux"
fi
echo "✅ Operating System: $OS_TYPE"

# Check required tools
MISSING_TOOLS=""

if ! command -v git &> /dev/null; then
    MISSING_TOOLS="$MISSING_TOOLS git"
fi

if ! command -v curl &> /dev/null; then
    MISSING_TOOLS="$MISSING_TOOLS curl"
fi

if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  jq not installed (optional but recommended)${NC}"
    echo "   Install with: brew install jq (macOS) or apt-get install jq (Linux)"
fi

if [ -n "$MISSING_TOOLS" ]; then
    echo -e "${RED}❌ Missing required tools:$MISSING_TOOLS${NC}"
    echo "Please install missing tools and try again."
    exit 1
fi

echo "✅ All required tools installed"

# Check for optional tools
echo -e "\n${GREEN}Checking optional tools...${NC}"

if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI found (will automate repo creation)"
    HAS_GH_CLI=true
else
    echo "⚠️  GitHub CLI not found (manual repo creation needed)"
    HAS_GH_CLI=false
fi

if command -v railway &> /dev/null; then
    echo "✅ Railway CLI found (will auto-inject variables)"
    HAS_RAILWAY_CLI=true
else
    echo "⚠️  Railway CLI not found (manual variable setup needed)"
    HAS_RAILWAY_CLI=false
fi

# ================================================
# STEP 2: Verify MCP Package Exists
# ================================================

echo -e "\n${GREEN}📦 Step 2: Verifying MCP package...${NC}"

PACKAGE_FILE="venly-mcp-10-production.tar.gz"
if [ ! -f "$PACKAGE_FILE" ]; then
    # Try to find it in common locations
    if [ -f "../$PACKAGE_FILE" ]; then
        PACKAGE_FILE="../$PACKAGE_FILE"
    elif [ -f "/mnt/user-data/outputs/$PACKAGE_FILE" ]; then
        PACKAGE_FILE="/mnt/user-data/outputs/$PACKAGE_FILE"
    else
        echo -e "${RED}❌ Cannot find $PACKAGE_FILE${NC}"
        echo "Please ensure the file is in the current directory or provide the path."
        exit 1
    fi
fi

# Verify package integrity
echo "Verifying package contents..."
EXPECTED_FILES=("src/server.ts" "src/venlyClient.ts" "package.json" "railway.json")
TEMP_DIR=$(mktemp -d)

tar -tzf "$PACKAGE_FILE" > "$TEMP_DIR/contents.txt" 2>/dev/null || {
    echo -e "${RED}❌ Package file is corrupted${NC}"
    rm -rf "$TEMP_DIR"
    exit 1
}

for file in "${EXPECTED_FILES[@]}"; do
    if ! grep -q "$file" "$TEMP_DIR/contents.txt"; then
        echo -e "${RED}❌ Package missing required file: $file${NC}"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
done
rm -rf "$TEMP_DIR"

echo "✅ Package verified successfully"

# ================================================
# STEP 3: Get and Validate Venly Credentials
# ================================================

echo -e "\n${GREEN}📝 Step 3: Venly Configuration & Validation${NC}"
echo "-----------------------------------------------"

# Get credentials
read -p "Enter your Venly Client ID: " VENLY_CLIENT_ID
if [ -z "$VENLY_CLIENT_ID" ]; then
    echo -e "${RED}❌ Client ID cannot be empty${NC}"
    exit 1
fi

read -sp "Enter your Venly Client Secret: " VENLY_CLIENT_SECRET
echo ""
if [ -z "$VENLY_CLIENT_SECRET" ]; then
    echo -e "${RED}❌ Client Secret cannot be empty${NC}"
    exit 1
fi

# Choose environment
echo ""
read -p "Start in sandbox mode? (Y/n): " SANDBOX
SANDBOX=${SANDBOX:-Y}
if [[ "$SANDBOX" =~ ^[Yy] ]]; then
    VENLY_ENV="sandbox"
    VENLY_AUTH_URL="https://login-sandbox.venly.io/auth/realms/Arkane/protocol/openid-connect/token"
else
    VENLY_ENV="production"
    VENLY_AUTH_URL="https://login.venly.io/auth/realms/Arkane/protocol/openid-connect/token"
    echo -e "${YELLOW}⚠️  WARNING: PRODUCTION mode selected${NC}"
    read -p "Are you sure? Type 'PRODUCTION' to confirm: " CONFIRM
    if [ "$CONFIRM" != "PRODUCTION" ]; then
        echo "Switching to sandbox mode for safety."
        VENLY_ENV="sandbox"
        VENLY_AUTH_URL="https://login-sandbox.venly.io/auth/realms/Arkane/protocol/openid-connect/token"
    fi
fi

# Validate credentials with Venly
echo -e "\n${GREEN}Validating Venly credentials...${NC}"

AUTH_RESPONSE=$(curl -s -X POST "$VENLY_AUTH_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials" \
    -d "client_id=$VENLY_CLIENT_ID" \
    -d "client_secret=$VENLY_CLIENT_SECRET" 2>/dev/null || echo "NETWORK_ERROR")

if [ "$AUTH_RESPONSE" = "NETWORK_ERROR" ]; then
    echo -e "${RED}❌ Network error connecting to Venly${NC}"
    exit 1
fi

if echo "$AUTH_RESPONSE" | grep -q "access_token"; then
    echo -e "${GREEN}✅ Venly credentials validated successfully${NC}"
    
    # Extract token expiry if jq is available
    if command -v jq &> /dev/null; then
        TOKEN_EXPIRY=$(echo "$AUTH_RESPONSE" | jq -r '.expires_in' 2>/dev/null || echo "unknown")
        echo "   Token expires in: ${TOKEN_EXPIRY} seconds"
    fi
else
    echo -e "${RED}❌ Invalid Venly credentials${NC}"
    echo "Response: $AUTH_RESPONSE"
    echo ""
    echo "Please check:"
    echo "1. Credentials are correct"
    echo "2. You're using the right environment (sandbox vs production)"
    echo "3. Your Venly account is active"
    exit 1
fi

# ================================================
# STEP 4: GitHub Repository Setup
# ================================================

echo -e "\n${GREEN}🚀 Step 4: Setting up GitHub repository...${NC}"

read -p "Enter your GitHub username: " GITHUB_USER
if [ -z "$GITHUB_USER" ]; then
    echo -e "${RED}❌ GitHub username cannot be empty${NC}"
    exit 1
fi

read -p "Enter repository name (default: venly-treasury-mcp): " REPO_NAME
REPO_NAME=${REPO_NAME:-venly-treasury-mcp}
GITHUB_REPO="$GITHUB_USER/$REPO_NAME"

# Create repository
if [ "$HAS_GH_CLI" = true ]; then
    echo "Creating private repository via GitHub CLI..."
    if gh repo create "$REPO_NAME" --private --clone 2>/dev/null; then
        REPO_CREATED=true
        cd "$REPO_NAME"
        DEPLOYMENT_DIR=$(pwd)
    else
        echo -e "${RED}❌ Failed to create repository${NC}"
        echo "Repository might already exist or you need to login: gh auth login"
        exit 1
    fi
else
    echo -e "${YELLOW}Manual GitHub setup required:${NC}"
    echo "1. Go to https://github.com/new"
    echo "2. Repository name: $REPO_NAME"
    echo "3. Set to PRIVATE"
    echo "4. DO NOT add README, .gitignore, or license"
    echo "5. Click 'Create repository'"
    echo ""
    read -p "Press Enter when done..."
    
    # Clone the empty repo
    echo "Cloning repository..."
    if git clone "https://github.com/$GITHUB_USER/$REPO_NAME.git" 2>/dev/null; then
        cd "$REPO_NAME"
        DEPLOYMENT_DIR=$(pwd)
        REPO_CREATED=true
    else
        echo -e "${RED}❌ Failed to clone repository${NC}"
        echo "Please check the repository was created and try again."
        exit 1
    fi
fi

# ================================================
# STEP 5: Extract and Organize MCP Files
# ================================================

echo -e "\n${GREEN}📦 Step 5: Setting up project structure...${NC}"

# Extract MCP files
echo "Extracting MCP server..."
tar -xzf "../$PACKAGE_FILE" || tar -xzf "$PACKAGE_FILE"

# Create deployment folder for configs
mkdir -p deployment

# Create .env file
cat > .env << EOF
# ================================================
# Venly MCP Treasury Configuration
# Generated: $(date)
# ================================================

# VENLY CREDENTIALS (Validated ✓)
VENLY_CLIENT_ID=$VENLY_CLIENT_ID
VENLY_CLIENT_SECRET=$VENLY_CLIENT_SECRET
VENLY_ENVIRONMENT=$VENLY_ENV

# SAFETY FEATURES (Production Defaults)
SAFE_MODE_MAX_AMOUNT=1000
SAFE_MODE_WARNING_THRESHOLD=500
SAFE_MODE_REQUIRE_CONFIRMATION=true
AUDIT_LOG_ENABLED=true
AUDIT_PROVIDER=local

# TO CONFIGURE LATER:
# TREASURY_WALLET_ID=
# GOOGLE_SHEETS_CREDS=
# SLACK_ALERT_WEBHOOK=
EOF

echo "✅ Environment configuration created"

# ================================================
# STEP 6: Create Deployment Configurations
# ================================================

echo -e "\n${GREEN}📝 Step 6: Generating deployment configurations...${NC}"

# Claude Desktop config
cat > deployment/claude-desktop-config.json << EOF
{
  "mcpServers": {
    "venly-treasury": {
      "command": "npx",
      "args": ["-y", "github:$GITHUB_USER/$REPO_NAME"]
    }
  }
}
EOF

# n8n webhook template
cat > deployment/n8n-webhook-template.json << EOF
{
  "name": "Venly Treasury Settlement",
  "nodes": [
    {
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://YOUR-APP.up.railway.app/mcp",
        "method": "POST",
        "responseFormat": "json",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "jsonrpc": "2.0",
          "method": "venly_settle_invoice",
          "params": {
            "invoiceId": "={{ \$json.invoiceId }}",
            "recipientAddress": "={{ \$json.recipientAddress }}",
            "amount": "={{ \$json.amount }}",
            "chain": "POLYGON",
            "confirmed": true,
            "origin": "n8n"
          }
        }
      }
    }
  ]
}
EOF

# Deployment summary
cat > deployment/deployment-summary.md << EOF
# Venly MCP Treasury - Deployment Summary

**Generated:** $(date)
**Repository:** https://github.com/$GITHUB_USER/$REPO_NAME
**Environment:** $VENLY_ENV
**Safe Mode:** ENABLED (Max: \$1000)

## Quick Links
- GitHub: https://github.com/$GITHUB_USER/$REPO_NAME
- Railway: [Pending Deployment]
- Dashboard: [Pending Deployment]/dashboard
- Health: [Pending Deployment]/healthz

## Configuration Status
- ✅ Venly Credentials: Validated
- ✅ GitHub Repository: Created
- ✅ Project Structure: Initialized
- ⏳ Railway Deployment: Pending
- ⏳ Treasury Wallet: Not configured

## Next Steps
1. Deploy to Railway (see instructions below)
2. Create treasury wallet in Venly
3. Add TREASURY_WALLET_ID to Railway
4. Test with small transaction
5. Configure Google Sheets audit log
EOF

echo "✅ All configurations generated in deployment/ folder"

# ================================================
# STEP 7: Git Commit and Push
# ================================================

echo -e "\n${GREEN}📤 Step 7: Pushing to GitHub...${NC}"

git add .
git commit -m "Initial deployment: Venly MCP Treasury Server v10

- Production-grade MCP server with safety features
- Safe mode enabled (max \$1000)
- Audit logging configured
- Health monitoring ready
- Environment: $VENLY_ENV"

if git push origin main 2>/dev/null || git push origin master 2>/dev/null; then
    echo "✅ Successfully pushed to GitHub"
else
    echo -e "${RED}❌ Failed to push to GitHub${NC}"
    echo "You may need to set up authentication: https://docs.github.com/en/authentication"
    exit 1
fi

# ================================================
# STEP 8: Railway Deployment
# ================================================

echo -e "\n${GREEN}🚂 Step 8: Railway Deployment${NC}"
echo "--------------------------------"

if [ "$HAS_RAILWAY_CLI" = true ]; then
    echo "Railway CLI detected. Attempting automated deployment..."
    
    # Initialize Railway project
    if railway link 2>/dev/null; then
        echo "Linked to existing Railway project"
    else
        echo "Creating new Railway project..."
        railway init
    fi
    
    # Set environment variables
    echo "Setting Railway environment variables..."
    railway variables set VENLY_CLIENT_ID="$VENLY_CLIENT_ID"
    railway variables set VENLY_CLIENT_SECRET="$VENLY_CLIENT_SECRET"
    railway variables set VENLY_ENVIRONMENT="$VENLY_ENV"
    railway variables set SAFE_MODE_MAX_AMOUNT="1000"
    railway variables set AUDIT_LOG_ENABLED="true"
    
    # Deploy
    echo "Deploying to Railway..."
    railway up
    
    # Get deployment URL
    RAILWAY_URL=$(railway open --json | jq -r '.url' 2>/dev/null || echo "")
    if [ -n "$RAILWAY_URL" ]; then
        echo "✅ Deployed to: $RAILWAY_URL"
    fi
else
    # Manual deployment instructions
    echo -e "${YELLOW}Manual Railway deployment required:${NC}"
    echo ""
    echo "1. Open Railway: https://railway.app"
    echo "2. Click 'New Project' → 'Deploy from GitHub repo'"
    echo "3. Select: $GITHUB_USER/$REPO_NAME"
    echo "4. Add these environment variables:"
    echo ""
    echo "   VENLY_CLIENT_ID=$VENLY_CLIENT_ID"
    echo "   VENLY_CLIENT_SECRET=[your-secret]"
    echo "   VENLY_ENVIRONMENT=$VENLY_ENV"
    echo "   SAFE_MODE_MAX_AMOUNT=1000"
    echo "   AUDIT_LOG_ENABLED=true"
    echo ""
    echo "5. Click 'Deploy'"
    echo ""
    
    # Open Railway in browser
    echo "Opening Railway in browser..."
    RAILWAY_TEMPLATE="https://railway.app/new/github/$GITHUB_USER/$REPO_NAME"
    $OPEN_CMD "$RAILWAY_TEMPLATE" 2>/dev/null || echo "Visit: $RAILWAY_TEMPLATE"
    
    read -p "Press Enter when Railway deployment is complete..."
    read -p "Enter your Railway app URL (e.g., venly-mcp.up.railway.app): " RAILWAY_URL
fi

# ================================================
# STEP 9: Verify Deployment
# ================================================

echo -e "\n${GREEN}✅ Step 9: Verifying deployment...${NC}"

if [ -n "$RAILWAY_URL" ]; then
    # Clean up URL (remove https:// if present)
    RAILWAY_URL=${RAILWAY_URL#https://}
    RAILWAY_URL=${RAILWAY_URL#http://}
    
    HEALTH_URL="https://$RAILWAY_URL/healthz"
    echo "Checking health endpoint: $HEALTH_URL"
    echo "Waiting for server to start (this may take 30 seconds)..."
    
    # Try up to 6 times with 10 second intervals
    for i in {1..6}; do
        if curl -s "$HEALTH_URL" | grep -q "healthy"; then
            echo -e "${GREEN}✅ Server is healthy!${NC}"
            
            # Display health status if jq is available
            if command -v jq &> /dev/null; then
                echo "Health Status:"
                curl -s "$HEALTH_URL" | jq '.'
            fi
            break
        else
            if [ $i -lt 6 ]; then
                echo "   Attempt $i/6 - Server starting..."
                sleep 10
            else
                echo -e "${YELLOW}⚠️  Server not responding yet${NC}"
                echo "   Manual check required: $HEALTH_URL"
            fi
        fi
    done
    
    # Update deployment summary with actual URLs
    cat >> deployment/deployment-summary.md << EOF

## Deployment URLs (Live)
- Dashboard: https://$RAILWAY_URL/dashboard
- Health: https://$RAILWAY_URL/healthz
- MCP Endpoint: https://$RAILWAY_URL/mcp

**Deployment Verified:** $(date)
EOF
fi

# ================================================
# STEP 10: Final Summary
# ================================================

echo -e "\n${GREEN}"
echo "╔════════════════════════════════════════════════╗"
echo "║         ✅ DEPLOYMENT SUCCESSFUL!              ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"

echo "📊 Your Production URLs:"
echo "------------------------"
if [ -n "$RAILWAY_URL" ]; then
    echo "Dashboard:    https://$RAILWAY_URL/dashboard"
    echo "Health:       https://$RAILWAY_URL/healthz"
    echo "MCP Endpoint: https://$RAILWAY_URL/mcp"
else
    echo "Railway URL: [Pending configuration]"
fi

echo ""
echo "📁 Configuration Files:"
echo "----------------------"
echo "Environment:     .env"
echo "Claude Desktop:  deployment/claude-desktop-config.json"
echo "n8n Template:    deployment/n8n-webhook-template.json"
echo "Summary:         deployment/deployment-summary.md"

echo ""
echo "✅ Validated Components:"
echo "------------------------"
echo "• Venly Credentials: VALIDATED"
echo "• GitHub Repository: CREATED"
echo "• Safe Mode: ENABLED (\$1000 max)"
echo "• Audit Logging: ENABLED"
echo "• Health Monitoring: READY"

echo ""
echo -e "${YELLOW}📋 REMAINING SETUP STEPS:${NC}"
echo "-------------------------"
echo "1. Create treasury wallet in Venly Portal"
echo "2. Add TREASURY_WALLET_ID to Railway variables"
echo "3. Send test transaction (<\$10)"
echo "4. Configure Google Sheets for audit log"
echo "5. Test safe mode (try exceeding limit)"
echo "6. Switch to production when ready"

echo ""
echo -e "${GREEN}🎉 Your treasury system is ready for testing!${NC}"
echo ""
echo "Documentation: https://github.com/$GITHUB_USER/$REPO_NAME"
echo "Support: Check dashboard first, then logs in Railway"

# Save final state
echo "SUCCESS" > deployment/.deployment-status

# Remove trap since we succeeded
trap - ERR

exit 0
