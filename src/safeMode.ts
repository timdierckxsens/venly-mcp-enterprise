/**
 * safeMode.ts - Production safety controls
 * 
 * Prevents accidental large transfers and enforces
 * confirmation requirements in production
 */

export interface SafeModeConfig {
  enabled: boolean;
  maxAmount: string;
  requireConfirmation: boolean;
  allowedOrigins: string[];
  warningThreshold?: string;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  warnings?: string[];
}

export class SafeMode {
  private config: SafeModeConfig;

  constructor(config: SafeModeConfig) {
    this.config = {
      ...config,
      warningThreshold: config.warningThreshold || '500',
    };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  validateOperation(params: {
    toolName: string;
    amount?: string;
    confirmed?: boolean;
    origin?: string;
  }): ValidationResult {
    const warnings: string[] = [];

    // If safe mode is disabled, allow everything
    if (!this.config.enabled) {
      return { allowed: true };
    }

    // Check confirmation flag
    if (this.config.requireConfirmation && !params.confirmed) {
      return {
        allowed: false,
        reason: 'Operation requires confirmed=true in production',
      };
    }

    // Check origin
    if (params.origin && !this.config.allowedOrigins.includes(params.origin)) {
      return {
        allowed: false,
        reason: `Origin '${params.origin}' not allowed. Must be one of: ${this.config.allowedOrigins.join(', ')}`,
      };
    }

    // Check amount limits
    if (params.amount) {
      const amount = parseFloat(params.amount);
      const maxAmount = parseFloat(this.config.maxAmount);
      const warningThreshold = parseFloat(this.config.warningThreshold!);

      if (amount > maxAmount) {
        return {
          allowed: false,
          reason: `Amount $${amount} exceeds maximum allowed $${maxAmount}`,
        };
      }

      if (amount > warningThreshold) {
        warnings.push(`Amount $${amount} exceeds warning threshold $${warningThreshold}`);
      }
    }

    // Check for dangerous operations
    const dangerousOps = [
      'sweep_treasury',
      'emergency_withdrawal',
      'update_signer',
      'rotate_keys',
    ];

    if (dangerousOps.some(op => params.toolName.includes(op))) {
      if (!params.confirmed || params.origin !== 'internal') {
        return {
          allowed: false,
          reason: `Dangerous operation '${params.toolName}' requires confirmed=true and origin=internal`,
        };
      }
      warnings.push(`Executing dangerous operation: ${params.toolName}`);
    }

    return {
      allowed: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  getConfig(): SafeModeConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<SafeModeConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // Generate safe mode status for health checks
  getStatus(): {
    enabled: boolean;
    maxAmount: string;
    requireConfirmation: boolean;
    allowedOrigins: string[];
    rules: string[];
  } {
    return {
      enabled: this.config.enabled,
      maxAmount: this.config.maxAmount,
      requireConfirmation: this.config.requireConfirmation,
      allowedOrigins: this.config.allowedOrigins,
      rules: [
        this.config.requireConfirmation ? '✓ Confirmation required' : '✗ Confirmation not required',
        `✓ Max amount: $${this.config.maxAmount}`,
        `✓ Warning threshold: $${this.config.warningThreshold}`,
        `✓ Allowed origins: ${this.config.allowedOrigins.join(', ')}`,
      ],
    };
  }
}

// Preset configurations
export const SAFE_MODE_PRESETS = {
  development: {
    enabled: false,
    maxAmount: '10000',
    requireConfirmation: false,
    allowedOrigins: ['n8n', 'claude', 'internal', 'test'],
  },
  staging: {
    enabled: true,
    maxAmount: '1000',
    requireConfirmation: true,
    allowedOrigins: ['n8n', 'claude', 'internal'],
    warningThreshold: '500',
  },
  production: {
    enabled: true,
    maxAmount: '5000',
    requireConfirmation: true,
    allowedOrigins: ['n8n', 'internal'],
    warningThreshold: '1000',
  },
  paranoid: {
    enabled: true,
    maxAmount: '100',
    requireConfirmation: true,
    allowedOrigins: ['internal'],
    warningThreshold: '50',
  },
};
