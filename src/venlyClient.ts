/**
 * venlyClient.ts - Venly API Client
 *
 * Handles OAuth authentication and API calls to Venly services
 */

export interface VenlyConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
}

export interface TokenBalance {
  tokenAddress: string;
  symbol: string;
  decimals: number;
  balance: string;
  rawBalance: string;
}

export interface TransactionResult {
  transactionHash: string;
  status: string;
}

export interface ExecuteTransactionParams {
  walletId: string;
  to: string;
  secretType: string;
  tokenAddress?: string;
  amount: string;
  decimals?: number;
  data?: string;
}

export interface WaitForTransactionParams {
  transactionHash: string;
  secretType: string;
  timeoutMs?: number;
}

export interface GetTokenBalancesParams {
  walletId: string;
  secretType: string;
}

export class VenlyAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'VenlyAPIError';
  }
}

export class VenlyClient {
  private config: VenlyConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private baseUrl: string;

  constructor(config: VenlyConfig) {
    this.config = config;
    this.baseUrl = config.environment === 'production'
      ? 'https://api.venly.io'
      : 'https://api-sandbox.venly.io';
  }

  /**
   * Get OAuth access token (cached)
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Request new token
    const tokenUrl = `${this.baseUrl}/auth/oauth2/token`;
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new VenlyAPIError(
          `OAuth failed: ${response.statusText}`,
          response.status,
          await response.text()
        );
      }

      const data = await response.json() as { access_token: string; expires_in: number };
      this.accessToken = data.access_token;
      // Set expiry with 5 minute buffer
      this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

      return this.accessToken!;
    } catch (error: any) {
      throw new VenlyAPIError(
        `Failed to get access token: ${error.message}`,
        error.statusCode
      );
    }
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${path}`;

    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new VenlyAPIError(
          `API request failed: ${response.statusText}`,
          response.status,
          errorText
        );
      }

      return await response.json() as T;
    } catch (error: any) {
      if (error instanceof VenlyAPIError) {
        throw error;
      }
      throw new VenlyAPIError(
        `Network error: ${error.message}`,
        undefined,
        error
      );
    }
  }

  /**
   * Health check - verifies OAuth is working
   */
  async getHealth(): Promise<{ status: string; authenticated: boolean }> {
    try {
      await this.getAccessToken();
      return { status: 'healthy', authenticated: true };
    } catch (error) {
      return { status: 'unhealthy', authenticated: false };
    }
  }

  /**
   * Create a new wallet
   */
  async createWallet(params: {
    secretType: string;
    walletType?: string;
    description?: string;
  }): Promise<any> {
    return this.request('POST', '/api/wallets', {
      secretType: params.secretType,
      walletType: params.walletType || 'WHITE_LABEL',
      description: params.description,
    });
  }

  /**
   * Get wallet details
   */
  async getWallet(walletId: string): Promise<any> {
    return this.request('GET', `/api/wallets/${walletId}`);
  }

  /**
   * Get native balance for a wallet
   */
  async getNativeBalance(params: {
    walletId: string;
    secretType: string;
  }): Promise<any> {
    return this.request(
      'GET',
      `/api/wallets/${params.walletId}/balance?secretType=${params.secretType}`
    );
  }

  /**
   * Get token balances for a wallet
   */
  async getTokenBalances(params: GetTokenBalancesParams): Promise<{
    result: TokenBalance[];
  }> {
    return this.request(
      'GET',
      `/api/wallets/${params.walletId}/tokens?secretType=${params.secretType}`
    );
  }

  /**
   * Execute a transaction (native or token transfer)
   */
  async executeTransaction(params: ExecuteTransactionParams): Promise<TransactionResult> {
    const requestBody: any = {
      walletId: params.walletId,
      to: params.to,
      secretType: params.secretType,
    };

    // Token transfer
    if (params.tokenAddress) {
      requestBody.type = 'TOKEN_TRANSFER';
      requestBody.tokenAddress = params.tokenAddress;
      requestBody.value = params.amount;
      if (params.decimals) {
        requestBody.decimals = params.decimals;
      }
    } else {
      // Native transfer
      requestBody.type = 'TRANSFER';
      requestBody.value = params.amount;
    }

    if (params.data) {
      requestBody.data = params.data;
    }

    const result = await this.request<any>(
      'POST',
      '/api/transactions/execute',
      requestBody
    );

    return {
      transactionHash: result.transactionHash,
      status: result.status,
    };
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionId: string): Promise<any> {
    return this.request('GET', `/api/transactions/${transactionId}`);
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(params: WaitForTransactionParams): Promise<boolean> {
    const timeout = params.timeoutMs || 180000; // 3 minutes default
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < timeout) {
      try {
        const status = await this.getTransactionStatus(params.transactionHash);

        if (status.status === 'SUCCEEDED' || status.status === 'CONFIRMED') {
          return true;
        }

        if (status.status === 'FAILED') {
          throw new VenlyAPIError(
            `Transaction failed: ${status.errorMessage || 'Unknown error'}`
          );
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        // If we can't get status, wait and retry
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new VenlyAPIError('Transaction confirmation timeout');
  }

  /**
   * List all wallets
   */
  async listWallets(): Promise<any> {
    return this.request('GET', '/api/wallets');
  }

  /**
   * Sign message
   */
  async signMessage(params: {
    walletId: string;
    secretType: string;
    message: string;
  }): Promise<any> {
    return this.request('POST', '/api/signatures', {
      walletId: params.walletId,
      secretType: params.secretType,
      data: params.message,
      signatureType: 'MESSAGE',
    });
  }
}
