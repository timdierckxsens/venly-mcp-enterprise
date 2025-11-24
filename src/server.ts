/**
 * server.ts - Production MCP Server with Safety Features
 *
 * Enhanced with:
 * - Safe mode for production environments
 * - Health check endpoint with comprehensive status
 * - Audit logging
 * - Origin tracking for all operations
 */

import "dotenv/config";
import express from "express";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  McpError,
  ErrorCode,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  VenlyClient,
  VenlyAPIError,
} from './venlyClient.js';

import {
  VENLY_ENVIRONMENTS,
  SERVER_CONFIG,
  TOOL_ANNOTATIONS,
  ERROR_CODES,
} from './constants.js';

import { AuditLogger } from './auditLogger.js';
import { SafeMode } from './safeMode.js';

// Initialize clients
const venlyClient = new VenlyClient({
  clientId: process.env.VENLY_CLIENT_ID!,
  clientSecret: process.env.VENLY_CLIENT_SECRET!,
  environment: (process.env.VENLY_ENVIRONMENT || 'sandbox') as any,
});

const auditLogger = new AuditLogger({
  enabled: process.env.AUDIT_LOG_ENABLED === 'true',
  provider: process.env.AUDIT_PROVIDER as 'sheets' | 'notion' | 'local',
  credentials: process.env.AUDIT_CREDENTIALS,
});

const safeMode = new SafeMode({
  enabled: process.env.VENLY_ENVIRONMENT === 'production',
  maxAmount: process.env.SAFE_MODE_MAX_AMOUNT || '1000',
  requireConfirmation: true,
  allowedOrigins: ['n8n', 'claude', 'internal'],
});

// Health tracking
let lastSuccessfulTx: Date | null = null;
let totalTransactions = 0;
let failedTransactions = 0;
const startTime = new Date();

// Initialize MCP server
const server = new Server(
  {
    name: SERVER_CONFIG.name,
    version: SERVER_CONFIG.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ====================
// SAFE MODE WRAPPER
// ====================

async function executeWithSafety<T>(
  toolName: string,
  params: any,
  operation: () => Promise<T>,
  options: {
    isFinancial?: boolean;
    amount?: string;
    walletId?: string;
  } = {}
): Promise<T> {
  // Check safe mode restrictions
  if (options.isFinancial && safeMode.isEnabled()) {
    const validation = safeMode.validateOperation({
      toolName,
      amount: options.amount,
      confirmed: params.confirmed,
      origin: params.origin,
    });

    if (!validation.allowed) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Safe mode violation: ${validation.reason}`
      );
    }
  }

  // Execute operation
  const opStartTime = Date.now();
  let success = false;
  let error: any = null;

  try {
    const result = await operation();
    success = true;

    if (options.isFinancial) {
      lastSuccessfulTx = new Date();
      totalTransactions++;
    }

    return result;
  } catch (err) {
    error = err;
    if (options.isFinancial) {
      failedTransactions++;
    }
    throw err;
  } finally {
    // Audit log
    await auditLogger.log({
      timestamp: new Date().toISOString(),
      toolName,
      action: toolName.replace('venly_', ''),
      status: success ? 'success' : 'failed',
      duration: Date.now() - opStartTime,
      walletId: options.walletId,
      amount: options.amount,
      origin: params.origin || 'unknown',
      error: error?.message,
      environment: process.env.VENLY_ENVIRONMENT,
    });
  }
}

// ====================
// TOOL DEFINITIONS
// ====================

const TOOLS = [
  {
    name: "venly_settle_invoice",
    description: "Settle an invoice using stablecoin (USDC) from treasury wallet",
    inputSchema: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          description: "Invoice identifier for tracking"
        },
        recipientAddress: {
          type: "string",
          description: "Ethereum address of recipient (0x...)",
          pattern: "^0x[a-fA-F0-9]{40}$"
        },
        amount: {
          type: "string",
          description: "USDC amount to send"
        },
        chain: {
          type: "string",
          enum: ["POLYGON", "BASE", "ETHEREUM"],
          default: "POLYGON",
          description: "Blockchain to use"
        },
        memo: {
          type: "string",
          description: "Optional memo for the transaction"
        },
        confirmed: {
          type: "boolean",
          description: "Confirmation flag required for production"
        },
        origin: {
          type: "string",
          enum: ["n8n", "claude", "internal"],
          description: "Origin of the request"
        }
      },
      required: ["invoiceId", "recipientAddress", "amount", "confirmed", "origin"]
    }
  },
  {
    name: "venly_batch_payouts",
    description: "Execute multiple freelancer payouts in a single batch operation",
    inputSchema: {
      type: "object",
      properties: {
        payouts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              recipientAddress: {
                type: "string",
                pattern: "^0x[a-fA-F0-9]{40}$"
              },
              amount: {
                type: "string"
              },
              reference: {
                type: "string"
              }
            },
            required: ["recipientAddress", "amount", "reference"]
          }
        },
        chain: {
          type: "string",
          enum: ["POLYGON", "BASE"],
          default: "POLYGON"
        },
        confirmed: {
          type: "boolean"
        },
        origin: {
          type: "string",
          enum: ["n8n", "claude", "internal"]
        }
      },
      required: ["payouts", "confirmed", "origin"]
    }
  },
  {
    name: "venly_get_treasury_position",
    description: "Get comprehensive treasury wallet balances across multiple chains",
    inputSchema: {
      type: "object",
      properties: {
        chains: {
          type: "array",
          items: {
            type: "string",
            enum: ["POLYGON", "BASE", "ETHEREUM", "ARBITRUM"]
          },
          description: "Chains to query (defaults to POLYGON, BASE, ETHEREUM)"
        },
        includeNative: {
          type: "boolean",
          default: false,
          description: "Include native token balances"
        }
      }
    }
  }
];

// ====================
// TOOL HANDLERS
// ====================

// Handler for tools/list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Handler for tools/call
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new McpError(ErrorCode.InvalidRequest, "Missing arguments");
  }

  switch (name) {
    case "venly_settle_invoice":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              await executeWithSafety(
                "venly_settle_invoice",
                args,
                async () => {
                  const treasuryWalletId = process.env.TREASURY_WALLET_ID;
                  if (!treasuryWalletId) {
                    throw new McpError(ErrorCode.InvalidRequest, "Treasury wallet not configured");
                  }

                  const usdcContracts: Record<string, string> = {
                    POLYGON: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
                    BASE: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                    ETHEREUM: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                  };

                  const result = await venlyClient.executeTransaction({
                    walletId: treasuryWalletId,
                    to: args.recipientAddress as string,
                    secretType: args.chain as string,
                    tokenAddress: usdcContracts[args.chain as string],
                    amount: args.amount as string,
                    decimals: 6,
                  });

                  await venlyClient.waitForTransaction({
                    transactionHash: result.transactionHash,
                    secretType: args.chain as string,
                    timeoutMs: 180000,
                  });

                  const explorerUrls: Record<string, string> = {
                    POLYGON: `https://polygonscan.com/tx/${result.transactionHash}`,
                    BASE: `https://basescan.org/tx/${result.transactionHash}`,
                    ETHEREUM: `https://etherscan.io/tx/${result.transactionHash}`,
                  };

                  return {
                    success: true,
                    transactionHash: result.transactionHash,
                    explorerUrl: explorerUrls[args.chain as string],
                    auditId: `INV-${args.invoiceId}-${Date.now()}`,
                  };
                },
                {
                  isFinancial: true,
                  amount: args.amount as string,
                  walletId: process.env.TREASURY_WALLET_ID,
                }
              ),
              null,
              2
            ),
          },
        ],
      };

    case "venly_batch_payouts":
      const payouts = args.payouts as Array<{
        recipientAddress: string;
        amount: string;
        reference: string;
      }>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              await executeWithSafety(
                "venly_batch_payouts",
                args,
                async () => {
                  const totalAmount = payouts.reduce(
                    (sum, p) => sum + parseFloat(p.amount),
                    0
                  ).toString();

                  const results = [];
                  let successCount = 0;
                  let failCount = 0;

                  for (const payout of payouts) {
                    try {
                      const result = await venlyClient.executeTransaction({
                        walletId: process.env.TREASURY_WALLET_ID!,
                        to: payout.recipientAddress,
                        secretType: args.chain as string,
                        tokenAddress:
                          args.chain === "POLYGON"
                            ? "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
                            : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                        amount: payout.amount,
                        decimals: 6,
                      });

                      results.push({
                        reference: payout.reference,
                        transactionHash: result.transactionHash,
                      });
                      successCount++;
                    } catch (error: any) {
                      results.push({
                        reference: payout.reference,
                        error: error.message,
                      });
                      failCount++;
                    }
                  }

                  return {
                    success: failCount === 0,
                    totalAmount,
                    successfulPayouts: successCount,
                    failedPayouts: failCount,
                    results,
                  };
                },
                {
                  isFinancial: true,
                  amount: payouts.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0).toString(),
                  walletId: process.env.TREASURY_WALLET_ID,
                }
              ),
              null,
              2
            ),
          },
        ],
      };

    case "venly_get_treasury_position":
      const treasuryWalletId = process.env.TREASURY_WALLET_ID;
      if (!treasuryWalletId) {
        throw new McpError(ErrorCode.InvalidRequest, "Treasury wallet not configured");
      }

      const chains = (args.chains as string[]) || ["POLYGON", "BASE", "ETHEREUM"];
      const positions = [];
      let totalUSDC = 0;
      let totalUSDT = 0;

      for (const chain of chains) {
        const balances = await venlyClient.getTokenBalances({
          walletId: treasuryWalletId,
          secretType: chain,
        });

        for (const balance of balances.result) {
          const position = {
            chain,
            token: balance.symbol,
            balance: balance.balance,
            balanceUSD: balance.symbol.includes("USD") ? balance.balance : undefined,
          };
          positions.push(position);

          if (balance.symbol === "USDC") {
            totalUSDC += parseFloat(balance.balance);
          } else if (balance.symbol === "USDT") {
            totalUSDT += parseFloat(balance.balance);
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                totalUSDC: totalUSDC.toString(),
                totalUSDT: totalUSDT.toString(),
                positions,
                lastUpdated: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

// ====================
// HEALTH ENDPOINT (HTTP MODE)
// ====================

if (process.argv[2] === 'http') {
  const app = express();
  const port = process.env.PORT || 3000;

  // Comprehensive health check
  app.get('/healthz', async (req, res) => {
    const checks: any = {
      status: 'healthy',
      version: SERVER_CONFIG.version,
      environment: process.env.VENLY_ENVIRONMENT,
      uptime: Math.floor((Date.now() - startTime.getTime()) / 1000),
      timestamp: new Date().toISOString(),
      checks: {
        venly_oauth: 'unknown',
        audit_logger: 'unknown',
        safe_mode: safeMode.isEnabled() ? 'enabled' : 'disabled',
      },
      metrics: {
        total_transactions: totalTransactions,
        failed_transactions: failedTransactions,
        success_rate: totalTransactions > 0
          ? ((totalTransactions - failedTransactions) / totalTransactions * 100).toFixed(2) + '%'
          : 'N/A',
        last_successful_tx: lastSuccessfulTx?.toISOString() || 'none',
      },
    };

    // Test Venly OAuth
    try {
      await venlyClient.getHealth();
      checks.checks.venly_oauth = 'healthy';
    } catch {
      checks.checks.venly_oauth = 'unhealthy';
      checks.status = 'degraded';
    }

    // Test audit logger
    try {
      await auditLogger.health();
      checks.checks.audit_logger = 'healthy';
    } catch {
      checks.checks.audit_logger = 'unhealthy';
    }

    const statusCode = checks.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(checks);
  });

  // Simple dashboard
  app.get('/dashboard', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Venly MCP Dashboard</title>
        <style>
          body { font-family: system-ui; padding: 20px; background: #f5f5f5; }
          .card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .metric { display: inline-block; margin: 10px 20px; }
          .metric .value { font-size: 2em; font-weight: bold; }
          .metric .label { color: #666; }
          .status { padding: 5px 10px; border-radius: 4px; display: inline-block; }
          .healthy { background: #d4f4dd; color: #1e7e34; }
          .unhealthy { background: #f8d7da; color: #721c24; }
        </style>
      </head>
      <body>
        <h1>Venly MCP Treasury Dashboard</h1>

        <div class="card">
          <h2>System Status</h2>
          <div class="metric">
            <div class="value">${SERVER_CONFIG.version}</div>
            <div class="label">Version</div>
          </div>
          <div class="metric">
            <div class="value">${process.env.VENLY_ENVIRONMENT}</div>
            <div class="label">Environment</div>
          </div>
          <div class="metric">
            <div class="value">${Math.floor((Date.now() - startTime.getTime()) / 3600000)}h</div>
            <div class="label">Uptime</div>
          </div>
        </div>

        <div class="card">
          <h2>Transaction Metrics</h2>
          <div class="metric">
            <div class="value">${totalTransactions}</div>
            <div class="label">Total Transactions</div>
          </div>
          <div class="metric">
            <div class="value">${failedTransactions}</div>
            <div class="label">Failed</div>
          </div>
          <div class="metric">
            <div class="value">${totalTransactions > 0 ? ((totalTransactions - failedTransactions) / totalTransactions * 100).toFixed(1) : 0}%</div>
            <div class="label">Success Rate</div>
          </div>
        </div>

        <div class="card">
          <h2>Safety Features</h2>
          <p>Safe Mode: <span class="status ${safeMode.isEnabled() ? 'healthy' : 'unhealthy'}">${safeMode.isEnabled() ? 'ENABLED' : 'DISABLED'}</span></p>
          <p>Max Transaction: $${process.env.SAFE_MODE_MAX_AMOUNT || '1000'}</p>
          <p>Audit Logging: <span class="status healthy">ENABLED</span></p>
        </div>

        <div class="card">
          <h2>Recent Activity</h2>
          <p>Last Successful TX: ${lastSuccessfulTx?.toISOString() || 'None yet'}</p>
        </div>

        <script>
          setInterval(() => location.reload(), 30000);
        </script>
      </body>
      </html>
    `);
  });

  // MCP endpoint
  app.post('/mcp', express.json(), async (req, res) => {
    const transport = new SSEServerTransport("/mcp", res);
    await server.connect(transport);
  });

  app.listen(port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Venly MCP Treasury Server Running              ║
╠═══════════════════════════════════════════════════════════╣
║  Environment: ${(process.env.VENLY_ENVIRONMENT || '').padEnd(43)}║
║  Safe Mode:   ${(safeMode.isEnabled() ? 'ENABLED' : 'DISABLED').padEnd(43)}║
║  Port:        ${port.toString().padEnd(43)}║
║                                                           ║
║  Endpoints:                                               ║
║  - Health:    http://localhost:${port}/healthz            ${' '.repeat(Math.max(0, 12 - port.toString().length))}║
║  - Dashboard: http://localhost:${port}/dashboard          ${' '.repeat(Math.max(0, 12 - port.toString().length))}║
║  - MCP:       http://localhost:${port}/mcp                ${' '.repeat(Math.max(0, 12 - port.toString().length))}║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
} else {
  // STDIO mode
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
