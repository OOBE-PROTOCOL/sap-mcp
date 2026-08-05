/**
 * @name sap/sap-client-manager
 * @description Creates and manages the SAP SDK client (`SapClient`) as a singleton with
 * connection, wallet, and program ID configuration.
 *
 * @flow
 *   1. `SapClientManager.getInstance()` returns the singleton manager.
 *   2. `initialize(config)` creates a `SapClient` from the SDK, loading a wallet when needed.
 *   3. If config hasn't changed, the existing client is reused.
 *   4. `createSapClient`, `getSapClient`, and `isSapClientInitialized` are convenience wrappers.
 *
 * @module sap/sap-client-manager
 */

import { createSapClient as createSdkClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import { Wallet } from '@coral-xyz/anchor';
import { logger } from '../core/logger.js';
import { SapClientError } from '../core/errors.js';
import type { SapMcpConfig } from '../core/types.js';
import type { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import type { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyEnforcingWallet } from '../signer/policy-enforcing-wallet.js';

/**
 * @name SapClientManager
 * @description Singleton manager for the SAP SDK client with config-aware reinitialization.
 *
 * @method getInstance     — Returns the singleton `SapClientManager` instance.
 * @method initialize      — Creates or reuses the `SapClient` based on config changes.
 * @method getClient       — Returns the initialized client (throws if not initialized).
 * @method getClientOrNull — Returns the initialized client or `null`.
 * @method reset           — Resets the client and config (for testing).
 *
 * @usedBy `createSapClient`, `getSapClient`, `isSapClientInitialized`, `create-server.ts`
 */
export class SapClientManager {
  private static instance: SapClientManager | null = null;
  private client: SapClient | null = null;
  private config: SapMcpConfig | null = null;

  private constructor() {}

  /**
   * @name SapClientManager.isSameClientConfig
   * @description Compares connection and wallet fields that affect SapClient construction.
   *
   * @param current — Current stored config.
   * @param next    — New config to compare against.
   * @returns `true` if the relevant config fields match, `false` otherwise.
   *
   * @internal
   */
  private isSameClientConfig(current: SapMcpConfig, next: SapMcpConfig): boolean {
    return current.rpcUrl === next.rpcUrl
      && current.programId === next.programId
      && current.commitment === next.commitment
      && current.mode === next.mode
      && current.walletPath === next.walletPath;
  }

  /**
   * @name SapClientManager.getInstance
   * @description Returns the singleton `SapClientManager` instance, creating it if necessary.
   *
   * @returns The singleton `SapClientManager`.
   *
   * @usedBy `createSapClient`, `getSapClient`, `isSapClientInitialized`.
   */
  static getInstance(): SapClientManager {
    if (!SapClientManager.instance) {
      SapClientManager.instance = new SapClientManager();
    }
    return SapClientManager.instance;
  }

  /**
   * @name SapClientManager.initialize
   * @description Initializes the SAP client from config, reusing the existing client if config hasn't changed.
   *
   * @param config — SAP MCP configuration with RPC URL, program ID, mode, and wallet path.
   * @returns The initialized `SapClient` instance.
   * @throws `SapClientError` if client creation fails.
   *
   * @usedBy `createSapClient`, `create-server.ts:createSapMcpServer`.
   */
  async initialize(config: SapMcpConfig, policyEngine?: PolicyEngine): Promise<SapClient> {
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

      // Enforce the SOL spending policy on local signer writes. The SDK signs
      // through the wallet, so wrapping it here covers every SDK tool that writes
      // on-chain (agent, escrow, staking, swaps) without patching each tool.
      let effectiveWallet = wallet;
      if (wallet && policyEngine) {
        effectiveWallet = new PolicyEnforcingWallet(wallet, policyEngine) as unknown as Wallet;
      }

      // Create SAP client using factory function
      this.client = createSdkClient(config.rpcUrl, effectiveWallet);

      logger.debug('SAP client initialized successfully', {
        programId: this.client.programId.toBase58(),
        spendingPolicyEnforced: Boolean(wallet && policyEngine),
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
   * @name SapClientManager.getClient
   * @description Returns the initialized SAP client.
   *
   * @returns The `SapClient` instance.
   * @throws `SapClientError` if the client has not been initialized.
   *
   * @usedBy `getSapClient`.
   */
  getClient(): SapClient {
    if (!this.client) {
      throw new SapClientError('SAP client not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * @name SapClientManager.getClientOrNull
   * @description Returns the initialized SAP client or `null` if not yet initialized.
   *
   * @returns The `SapClient` instance or `null`.
   *
   * @usedBy `isSapClientInitialized`.
   */
  getClientOrNull(): SapClient | null {
    return this.client;
  }

  /**
   * @name SapClientManager.reset
   * @description Resets the client and config to `null` (for testing purposes).
   *
   * @usedBy Test setup and teardown.
   */
  reset(): void {
    this.client = null;
    this.config = null;
    logger.debug('SAP client reset');
  }
}

/**
 * @name createSapClient
 * @description Creates or reuses the SAP client from the given configuration.
 *
 * @param config — SAP MCP configuration.
 * @returns The initialized `SapClient` instance.
 * @throws `SapClientError` if initialization fails.
 *
 * @usedBy `create-server.ts:createSapMcpServer`.
 */
export async function createSapClient(config: SapMcpConfig, policyEngine?: PolicyEngine): Promise<SapClient> {
  const manager = SapClientManager.getInstance();
  return manager.initialize(config, policyEngine);
}

/**
 * @name getSapClient
 * @description Returns the currently initialized SAP client.
 *
 * @returns The `SapClient` instance.
 * @throws `SapClientError` if the client has not been initialized.
 *
 * @usedBy Tool handlers across the SAP MCP runtime.
 */
export function getSapClient(): SapClient {
  const manager = SapClientManager.getInstance();
  return manager.getClient();
}

/**
 * @name isSapClientInitialized
 * @description Checks whether the SAP client has been initialized.
 *
 * @returns `true` if the client is initialized, `false` otherwise.
 *
 * @usedBy Health checks and startup validation.
 */
export function isSapClientInitialized(): boolean {
  const manager = SapClientManager.getInstance();
  return manager.getClientOrNull() !== null;
}