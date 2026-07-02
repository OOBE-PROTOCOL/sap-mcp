/**
 * Resolve signer based on MCP mode
 */

import { logger } from '../core/logger.js';
import { SignerError } from '../core/errors.js';
import type { SapMcpConfig, SapSignerMode } from '../core/types.js';
import type { SignerResult } from './signer-types.js';
import { createLocalKeypairSigner } from './local-keypair-signer.js';
import { createExternalSigner } from './external-signer.js';

/**
 * Resolve signer based on configuration
 */
export async function resolveSigner(config: SapMcpConfig): Promise<SignerResult> {
  const mode = getSignerModeFromConfig(config);
  
  logger.info('Resolving signer', { mcpMode: config.mode, signerMode: mode });
  
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
 * Map resolved MCP config to signer mode.
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
