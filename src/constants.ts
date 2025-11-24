/**
 * constants.ts - Configuration constants and enums
 */

export const VENLY_ENVIRONMENTS = {
  SANDBOX: 'sandbox',
  PRODUCTION: 'production',
} as const;

export const SERVER_CONFIG = {
  name: 'venly-treasury-mcp',
  version: '1.0.0',
  description: 'Production-grade MCP server for Venly treasury operations',
};

export const TOOL_ANNOTATIONS = {
  READ_ONLY: {
    isExpensive: false,
    isDestructive: false,
  },
  EXPENSIVE: {
    isExpensive: true,
  },
  DESTRUCTIVE: {
    isDestructive: true,
  },
};

export const ERROR_CODES = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  SAFE_MODE_VIOLATION: 'SAFE_MODE_VIOLATION',
  VENLY_API_ERROR: 'VENLY_API_ERROR',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export const SUPPORTED_CHAINS = [
  'POLYGON',
  'BASE',
  'ETHEREUM',
  'ARBITRUM',
  'OPTIMISM',
  'AVALANCHE',
  'BSC',
] as const;

export const USDC_CONTRACTS: Record<string, string> = {
  POLYGON: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  BASE: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ETHEREUM: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  ARBITRUM: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  OPTIMISM: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  AVALANCHE: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
};

export const USDT_CONTRACTS: Record<string, string> = {
  POLYGON: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  ETHEREUM: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  ARBITRUM: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  OPTIMISM: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  AVALANCHE: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
  BSC: '0x55d398326f99059fF775485246999027B3197955',
};

export const EXPLORER_URLS: Record<string, string> = {
  POLYGON: 'https://polygonscan.com/tx/',
  BASE: 'https://basescan.org/tx/',
  ETHEREUM: 'https://etherscan.io/tx/',
  ARBITRUM: 'https://arbiscan.io/tx/',
  OPTIMISM: 'https://optimistic.etherscan.io/tx/',
  AVALANCHE: 'https://snowtrace.io/tx/',
  BSC: 'https://bscscan.com/tx/',
};

export const CHAIN_IDS: Record<string, number> = {
  ETHEREUM: 1,
  POLYGON: 137,
  BASE: 8453,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  AVALANCHE: 43114,
  BSC: 56,
};

export const DEFAULT_TRANSACTION_TIMEOUT_MS = 180000; // 3 minutes
export const DEFAULT_POLL_INTERVAL_MS = 5000; // 5 seconds
export const MAX_BATCH_SIZE = 100;
