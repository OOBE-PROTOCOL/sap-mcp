/**
 * SAP Client Manager 
 * 
 * Creates and manages SapClient from @oobe-protocol-labs/synapse-sap-sdk
 * with proper connection, wallet, and program ID configuration.
 */

import { createSapClient as createSdkClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import { Wallet } from '@coral-xyz/anchor';
import { logger } from '../core/logger.js';
import { SapClientError } from '../core/errors.js';
import type { SapMcpConfig } from '../core/types.js';
import type { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';

/**
 * SAP Client Manager
 */
export class SapClientManager {
  private static instance: SapClientManager | null = null;
  private client: SapClient | null = null;
  private config: SapMcpConfig | null = null;

  private constructor() {}

  /**
   * Compares the connection and wallet fields that affect SapClient construction.
   */
  private isSameClientConfig(current: SapMcpConfig, next: SapMcpConfig): boolean {
    return current.rpcUrl === next.rpcUrl
      && current.programId === next.programId
      && current.commitment === next.commitment
      && current.mode === next.mode
      && current.walletPath === next.walletPath;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SapClientManager {
    if (!SapClientManager.instance) {
      SapClientManager.instance = new SapClientManager();
    }
    return SapClientManager.instance;
  }

  /**
   * Initialize SAP client from config
   */
  async initialize(config: SapMcpConfig): Promise<SapClient> {
    if (this.client && this.config && this.isSameClientConfig(this.config, config)) {
      logger.debug('SAP client already initialized');
      return this.client;
    }

    if (this.client) {
      logger.debug('SAP client configuration changed, recreating client');
      this.client = null;
    }

    this.config = config;

    try {
      logger.debug('Initializing SAP client', {
        rpcUrl: config.rpcUrl,
        programId: config.programId,
        mode: config.mode,
      });

      // Get wallet based on mode
      let wallet: Wallet | undefined;

      if ((config.mode === 'local-dev-keypair' || config.mode === 'hosted-api') && config.walletPath) {
        // Load keypair from file
        const { loadKeypairFromFile } = await import('../signer/load-keypair.js');
        const keypair = loadKeypairFromFile(config.walletPath);
        wallet = new Wallet(keypair);
        logger.debug('Loaded wallet from file', {
          publicKey: keypair.publicKey.toBase58(),
        });
      } else if (config.mode === 'delegated-session') {
        // Delegated signing — wallet provided by session
        logger.debug('Delegated mode — wallet will be provided by session');
      }

      // Create SAP client using factory function
      this.client = createSdkClient(config.rpcUrl, wallet);

      logger.debug('SAP client initialized successfully', {
        programId: this.client.programId.toBase58(),
      });

      return this.client;
    } catch (error) {
      logger.error('Failed to initialize SAP client', { error });
      throw new SapClientError(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get SAP client instance
   */
  getClient(): SapClient {
    if (!this.client) {
      throw new SapClientError('SAP client not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Get client or null if not initialized
   */
  getClientOrNull(): SapClient | null {
    return this.client;
  }

  /**
   * Reset client (for testing)
   */
  reset(): void {
    this.client = null;
    this.config = null;
    logger.debug('SAP client reset');
  }
}

/**
 * Create SAP client from config
 */
export async function createSapClient(config: SapMcpConfig): Promise<SapClient> {
  const manager = SapClientManager.getInstance();
  return manager.initialize(config);
}

/**
 * Get existing SAP client
 */
export function getSapClient(): SapClient {
  const manager = SapClientManager.getInstance();
  return manager.getClient();
}

/**
 * Check if SAP client is initialized
 */
export function isSapClientInitialized(): boolean {
  const manager = SapClientManager.getInstance();
  return manager.getClientOrNull() !== null;
}
