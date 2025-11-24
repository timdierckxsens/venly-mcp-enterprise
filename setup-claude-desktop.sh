#!/bin/bash
# Quick setup script for Claude Desktop + Venly MCP
# For macOS and Linux

echo "🚀 Setting up Venly MCP for Claude Desktop..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "📥 Please install Node.js from: https://nodejs.org"
    echo "   Download the LTS version (20.x)"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Get the project directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build if needed
if [ ! -d "dist" ] || [ ! -f "dist/server.js" ]; then
    echo "🔨 Building TypeScript..."
    npm run build
fi

echo "✅ Build complete!"
echo ""

# Detect OS and config location
if [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CONFIG_DIR="$HOME/.config/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
else
    echo "⚠️  Windows detected. Config location:"
    echo "   %APPDATA%\\Claude\\claude_desktop_config.json"
    CONFIG_FILE="<Windows path>"
fi

echo "📝 Claude Desktop Configuration:"
echo "   Location: $CONFIG_FILE"
echo ""

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR" 2>/dev/null || true

# Generate the config
cat > /tmp/claude_mcp_config.json << EOF
{
  "mcpServers": {
    "venly-treasury": {
      "command": "node",
      "args": ["$SCRIPT_DIR/dist/server.js"],
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
EOF

echo "✅ Configuration generated!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Copy this configuration to Claude Desktop:"
echo "   cp /tmp/claude_mcp_config.json \"$CONFIG_FILE\""
echo ""
echo "2. Restart Claude Desktop completely (Quit + Reopen)"
echo ""
echo "3. Look for the 🔌 icon in Claude Desktop"
echo ""
echo "4. Try saying: 'Check my Venly treasury balance'"
echo ""
echo "---"
echo ""
echo "📄 Your config file content:"
cat /tmp/claude_mcp_config.json
echo ""
echo "🎉 Setup complete! Copy the config and restart Claude Desktop."
