/**
 * @name signer/signer-resolver
 * @description Resolves the appropriate signer implementation based on SAP MCP configuration mode.
 *
 * @flow
 *   1. `resolveSigner` reads the config mode and determines the signer mode via `getSignerModeFromConfig`.
 *   2. For `local-keypair` mode, creates a local keypair signer from `walletPath`.
 *   3. For `external` mode, creates an external signer from `externalSignerUrl`.
 *   4. For `none` mode (readonly), returns a result with no signer.
 *   5. For `delegated` mode, throws — delegated signers are session-bound and resolved at runtime.
 *
 * @module signer/signer-resolver
 */

import { logger } from '@oobe-protocol-labs/sap-mcp-core/logger';
import { SignerError } from '@oobe-protocol-labs/sap-mcp-core/errors';
import type { SapMcpConfig, SapSignerMode } from '@oobe-protocol-labs/sap-mcp-core/types';
import type { SignerResult } from './signer-types.js';
import { createLocalKeypairSigner } from './local-keypair-signer.js';
import { createExternalSigner } from './external-signer.js';

/**
 * @name resolveSigner
 * @description Resolves and creates a signer instance based on the SAP MCP configuration.
 *
 * @param config — SAP MCP configuration with mode, wallet path, and external signer URL.
 * @returns A `SignerResult` containing the signer, mode, and optional public key.
 * @throws `SignerError` if required config is missing for the resolved mode, or if the mode is `delegated`.
 *
 * @usedBy `create-server.ts:createSapMcpServer`.
 */
export async function resolveSigner(config: SapMcpConfig): Promise<SignerResult> {
  const mode = getSignerModeFromConfig(config);
  
  logger.debug('Resolving signer', { mcpMode: config.mode, signerMode: mode });
  
  switch (mode) {
    case 'none':
      return { mode: 'none' };
    
    case 'local-keypair': {
      if (!config.walletPath) {
        throw new SignerError('SAP_WALLET_PATH required for local-dev-keypair mode');
      }
      const localSigner = createLocalKeypairSigner(config.walletPath);
      return {
        mode: 'local-keypair',
        signer: localSigner,
        publicKey: localSigner.publicKey.toBase58(),
      };
    }
    
    case 'external': {
      if (!config.externalSignerUrl) {
        throw new SignerError('SAP_EXTERNAL_SIGNER_URL required for external-signer mode');
      }
      const externalSigner = await createExternalSigner(config.externalSignerUrl);
      return {
        mode: 'external',
        signer: externalSigner,
        publicKey: externalSigner.publicKey.toBase58(),
      };
    }
    
    case 'delegated':
      throw new SignerError('Delegated signer mode requires a session-bound signer and cannot be resolved at server startup');
    
    default:
      throw new SignerError(`Unknown signer mode: ${mode}`);
  }
}

/**
 * @name getSignerModeFromConfig
 * @description Maps the SAP MCP config mode to a `SapSignerMode` value.
 *
 * @param config — SAP MCP configuration.
 * @returns The resolved signer mode: `none`, `local-keypair`, `external`, or `delegated`.
 *
 * @internal
 */
function getSignerModeFromConfig(config: SapMcpConfig): SapSignerMode {
  switch (config.mode) {
    case 'readonly':
      return 'none';
    case 'hosted-api':
      if (config.externalSignerUrl) {
        return 'external';
      }
      if (config.walletPath) {
        return 'local-keypair';
      }
      return 'none';
    case 'local-dev-keypair':
      return 'local-keypair';
    case 'external-signer':
      return 'external';
    case 'delegated-session':
      return 'delegated';
    default:
      return 'none';
  }
}