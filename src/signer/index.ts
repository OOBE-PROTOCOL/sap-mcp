/**
 * @name signer/index
 * @description Barrel export for the SAP MCP signer module.
 *
 * Re-exports signer type definitions, keypair loading functions, local and external
 * signer factories, and the signer resolver.
 *
 * @module signer/index
 */

export type {
  Signer,
  SignerMode,
  SignerConfig,
  SignerResult,
} from './signer-types.js';

export { loadKeypairFromFile, loadKeypairFromEnv } from './load-keypair.js';
export { createLocalKeypairSigner } from './local-keypair-signer.js';
export { createExternalSigner } from './external-signer.js';
export { resolveSigner } from './signer-resolver.js';