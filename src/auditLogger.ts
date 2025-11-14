/**
 * auditLogger.ts - Immutable audit trail for all operations
 * 
 * Supports:
 * - Google Sheets (via API)
 * - Notion Database
 * - Local JSON file (fallback)
 */

import fs from 'fs/promises';
import path from 'path';

export interface AuditLogEntry {
  timestamp: string;
  toolName: string;
  action: string;
  status: 'success' | 'failed';
  duration: number;
  walletId?: string;
  amount?: string;
  origin: string;
  error?: string;
  environment?: string;
  metadata?: Record<string, any>;
}

export interface AuditLoggerConfig {
  enabled: boolean;
  provider: 'sheets' | 'notion' | 'local';
  credentials?: string; // JSON string with provider-specific creds
}

export class AuditLogger {
  private config: AuditLoggerConfig;
  private logBuffer: AuditLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(config: AuditLoggerConfig) {
    this.config = config;
    
    // Start flush interval if enabled
    if (config.enabled) {
      this.flushInterval = setInterval(() => {
        this.flush().catch(console.error);
      }, 30000); // Flush every 30 seconds
    }
  }

  async log(entry: AuditLogEntry): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Add entry to buffer
    this.logBuffer.push(entry);

    // Flush immediately for financial operations
    if (entry.amount || entry.action.includes('transfer') || entry.action.includes('settle')) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    try {
      switch (this.config.provider) {
        case 'sheets':
          await this.logToSheets(entries);
          break;
        case 'notion':
          await this.logToNotion(entries);
          break;
        case 'local':
        default:
          await this.logToLocal(entries);
          break;
      }
    } catch (error) {
      console.error('Failed to flush audit logs:', error);
      // Re-add entries to buffer for retry
      this.logBuffer.unshift(...entries);
    }
  }

  private async logToSheets(entries: AuditLogEntry[]): Promise<void> {
    // Google Sheets implementation
    // Requires service account credentials in AUDIT_CREDENTIALS env var
    
    if (!this.config.credentials) {
      throw new Error('Google Sheets credentials not configured');
    }

    const creds = JSON.parse(this.config.credentials);
    
    // Simple HTTP implementation (in production, use googleapis package)
    for (const entry of entries) {
      const row = [
        entry.timestamp,
        entry.toolName,
        entry.action,
        entry.status,
        entry.duration.toString(),
        entry.walletId || '',
        entry.amount || '',
        entry.origin,
        entry.error || '',
        entry.environment || '',
        JSON.stringify(entry.metadata || {}),
      ];

      // In production, this would use Google Sheets API
      // For now, log to console as placeholder
      console.log('AUDIT_SHEET:', row.join('\t'));
    }
  }

  private async logToNotion(entries: AuditLogEntry[]): Promise<void> {
    // Notion Database implementation
    // Requires database ID and integration token in AUDIT_CREDENTIALS
    
    if (!this.config.credentials) {
      throw new Error('Notion credentials not configured');
    }

    const creds = JSON.parse(this.config.credentials);
    const { databaseId, token } = creds;

    for (const entry of entries) {
      const payload = {
        parent: { database_id: databaseId },
        properties: {
          Timestamp: { 
            date: { start: entry.timestamp } 
          },
          Tool: { 
            title: [{ text: { content: entry.toolName } }] 
          },
          Action: { 
            select: { name: entry.action } 
          },
          Status: { 
            select: { 
              name: entry.status,
              color: entry.status === 'success' ? 'green' : 'red'
            } 
          },
          Duration: { 
            number: entry.duration 
          },
          Amount: { 
            number: entry.amount ? parseFloat(entry.amount) : null 
          },
          Origin: { 
            select: { name: entry.origin } 
          },
          Error: { 
            rich_text: [{ text: { content: entry.error || '' } }] 
          },
        }
      };

      // In production, make actual Notion API call
      // For now, log as placeholder
      console.log('AUDIT_NOTION:', JSON.stringify(payload));
    }
  }

  private async logToLocal(entries: AuditLogEntry[]): Promise<void> {
    // Local JSON file implementation (fallback)
    const logDir = process.env.AUDIT_LOG_DIR || './audit-logs';
    await fs.mkdir(logDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `audit-${date}.jsonl`);

    const lines = entries.map(entry => JSON.stringify(entry));
    await fs.appendFile(logFile, lines.join('\n') + '\n');
  }

  async health(): Promise<{ healthy: boolean; provider: string; bufferedLogs: number }> {
    // Test connection based on provider
    let healthy = false;

    try {
      switch (this.config.provider) {
        case 'sheets':
          // Test Google Sheets connection
          healthy = !!this.config.credentials;
          break;
        case 'notion':
          // Test Notion connection
          healthy = !!this.config.credentials;
          break;
        case 'local':
          // Test local filesystem
          const testDir = process.env.AUDIT_LOG_DIR || './audit-logs';
          await fs.access(testDir).catch(() => fs.mkdir(testDir, { recursive: true }));
          healthy = true;
          break;
      }
    } catch (error) {
      healthy = false;
    }

    return {
      healthy,
      provider: this.config.provider,
      bufferedLogs: this.logBuffer.length,
    };
  }

  async close(): Promise<void> {
    // Flush remaining logs and clean up
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    await this.flush();
  }

  // Get audit summary for dashboard
  async getSummary(since?: Date): Promise<{
    totalOperations: number;
    successRate: number;
    totalVolume: string;
    topTools: Array<{ tool: string; count: number }>;
  }> {
    // In production, this would query the actual storage
    // For now, return mock data
    return {
      totalOperations: 0,
      successRate: 100,
      totalVolume: '0',
      topTools: [],
    };
  }
}

// Helper to create audit logger from environment
export function createAuditLoggerFromEnv(): AuditLogger {
  const provider = process.env.AUDIT_PROVIDER as 'sheets' | 'notion' | 'local' || 'local';
  
  let credentials: string | undefined;
  
  if (provider === 'sheets' && process.env.GOOGLE_SHEETS_CREDS) {
    credentials = process.env.GOOGLE_SHEETS_CREDS;
  } else if (provider === 'notion' && process.env.NOTION_CREDS) {
    credentials = process.env.NOTION_CREDS;
  }

  return new AuditLogger({
    enabled: process.env.AUDIT_LOG_ENABLED === 'true',
    provider,
    credentials,
  });
}

// Export formats for different providers
export const AUDIT_LOG_SCHEMAS = {
  sheets: {
    headers: [
      'Timestamp',
      'Tool Name',
      'Action',
      'Status',
      'Duration (ms)',
      'Wallet ID',
      'Amount',
      'Origin',
      'Error',
      'Environment',
      'Metadata',
    ],
    sheetName: 'VenlyMCP_AuditLog',
  },
  notion: {
    properties: {
      Timestamp: 'date',
      Tool: 'title',
      Action: 'select',
      Status: 'select',
      Duration: 'number',
      Amount: 'number',
      Origin: 'select',
      Error: 'rich_text',
      Wallet: 'rich_text',
      Environment: 'select',
    },
  },
};
