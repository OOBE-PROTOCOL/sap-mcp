/**
 * Default configuration values
 */

export const defaults = {
  mode: 'readonly' as const,
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  commitment: 'confirmed' as const,
  programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
  maxRetries: 3,
  retryDelayMs: 1000,
  walletEncrypted: false,
  externalSignerTimeoutMs: 30000,
  enableHttp: false,
  httpPort: 8787,
  httpHost: '127.0.0.1',
  maxTxValueSol: 10,
  requireApprovalAboveSol: 1,
  dailyLimitSol: 100,
  logLevel: 'info' as const,
  logFormat: 'pretty' as const,
  enableMetrics: false,
  metricsPort: 9090,
  enableCache: true,
  cacheTtlSeconds: 300,
  enableRateLimit: true,
  rateLimitPerMinute: 60,
};
