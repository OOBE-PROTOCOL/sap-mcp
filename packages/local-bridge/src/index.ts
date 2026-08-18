/**
 * @name local-bridge/index
 * @description Stable local bridge API surface for stdio MCP and sap_payments process diagnostics.
 *
 * This boundary intentionally exposes local transport/process primitives only.
 * Signing and spend-policy enforcement remain in signer and policy modules.
 */

export { startStdioTransport } from '@oobe-protocol-labs/sap-mcp-transports/stdio';
export {
  PaymentBridgeLockError,
  acquirePaymentBridgeProcessLock,
  getPaymentBridgeLockPath,
  getPaymentBridgeProcessStatus,
  listPossibleSapMcpProcesses,
  releasePaymentBridgeProcessLock,
  resolvePaymentBridgeProfileName,
  resolvePaymentBridgeRuntimeId,
} from '@oobe-protocol-labs/sap-mcp-runtime/payment-bridge-process';

export type {
  PaymentBridgeLockRecord,
  PaymentBridgeProcessInfo,
  PaymentBridgeProcessStatus,
} from '@oobe-protocol-labs/sap-mcp-runtime/payment-bridge-process';