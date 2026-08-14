/**
 * @name local-bridge/index
 * @description Stable local bridge API surface for stdio MCP and sap_payments process diagnostics.
 *
 * This boundary intentionally exposes local transport/process primitives only.
 * Signing and spend-policy enforcement remain in signer and policy modules.
 */

export { startStdioTransport } from '../../../src/transports/stdio.js';
export {
  PaymentBridgeLockError,
  acquirePaymentBridgeProcessLock,
  getPaymentBridgeLockPath,
  getPaymentBridgeProcessStatus,
  listPossibleSapMcpProcesses,
  releasePaymentBridgeProcessLock,
  resolvePaymentBridgeProfileName,
  resolvePaymentBridgeRuntimeId,
} from '../../../src/runtime/payment-bridge-process.js';

export type {
  PaymentBridgeLockRecord,
  PaymentBridgeProcessInfo,
  PaymentBridgeProcessStatus,
} from '../../../src/runtime/payment-bridge-process.js';
