/**
 * @name signer/wallet-guard
 * @description Redacted wallet capability surface for local SAP MCP signing.
 *
 * Agents should reason about local signing as a capability, not as a file path.
 * This module intentionally reports readiness, storage class, permission hints,
 * and forbidden actions without returning keypair paths or secret material.
 *
 * @module signer/wallet-guard
 */

import { existsSync, statSync } from 'node:fs';
import type { SapMcpConfig } from '@oobe-protocol-labs/sap-mcp-config-runtime/env';

export type WalletStorageClass =
  | 'none'
  | 'local-keypair-file'
  | 'external-signer'
  | 'encrypted-local-keypair'
  | 'readonly';

export type WalletPermissionStatus =
  | 'not-configured'
  | 'missing'
  | 'owner-only'
  | 'group-or-world-readable'
  | 'unknown';

export interface WalletGuardSummary {
  model: 'capability-only-local-signer';
  storage: WalletStorageClass;
  activeProfile?: string;
  signerPublicKey?: string;
  wallet: {
    configured: boolean;
    exists: boolean;
    path: '[REDACTED]' | 'not-configured';
    permissions: WalletPermissionStatus;
  };
  secretMaterial: 'keypair-bytes-never-returned';
  hostedVisibility: 'not-visible-to-hosted-accountless-server';
  agentVisibleCapabilities: readonly string[];
  forbiddenAgentActions: readonly string[];
  recommendedFlow: readonly string[];
  warnings: readonly string[];
}

export interface WalletGuardAudit {
  action: string;
  signerPublicKey?: string;
  intentId?: string;
  custody: 'user-local';
  secretMaterial: 'never-exposed-to-hosted-server';
  signerAccess: 'capability-only';
  forbidden: readonly string[];
}

const AGENT_VISIBLE_CAPABILITIES = Object.freeze([
  'read redacted active profile and signer public key',
  'check SOL/USDC readiness before paid or value-moving workflows',
  'pay hosted x402 challenges under local policy limits',
  'sign approved hosted unsigned transactions locally',
  'register and update SAP agents through local sap_payments tools',
]);

const FORBIDDEN_AGENT_ACTIONS = Object.freeze([
  'do not read or print keypair JSON files',
  'do not create temporary signing scripts',
  'do not ask the user to paste private keys or seed phrases',
  'do not infer local wallet state from hosted sap_profile_current',
  'do not call hosted write tools again after hosted_local_signer_required',
  'do not sign or submit transactions outside an explicit user mandate',
]);

const RECOMMENDED_FLOW = Object.freeze([
  'call sap_payments_wallet_guard to understand local signer boundaries',
  'call sap_payments_readiness before paid/write workflows',
  'use sap_payments_call_paid_tool for hosted x402 tool calls',
  'use sap_payments_finalize_transaction for hosted unsigned transactions',
  'use sap_payments_register_agent or sap_payments_update_agent for SAP registry writes',
]);

export function walletGuardForbiddenActions(): readonly string[] {
  return FORBIDDEN_AGENT_ACTIONS;
}

export function buildWalletGuardAudit(action: string, signerPublicKey?: string, intentId?: string): WalletGuardAudit {
  return {
    action,
    ...(signerPublicKey ? { signerPublicKey } : {}),
    ...(intentId ? { intentId } : {}),
    custody: 'user-local',
    secretMaterial: 'never-exposed-to-hosted-server',
    signerAccess: 'capability-only',
    forbidden: FORBIDDEN_AGENT_ACTIONS,
  };
}

export function buildWalletGuardSummary(
  config: Partial<SapMcpConfig> | undefined,
  options: { activeProfile?: string; signerPublicKey?: string } = {},
): WalletGuardSummary {
  const wallet = inspectWalletPath(config?.walletPath);
  const storage = resolveStorageClass(config, wallet.configured);
  const warnings = buildWarnings(storage, wallet.permissions);

  return {
    model: 'capability-only-local-signer',
    storage,
    ...(options.activeProfile ? { activeProfile: options.activeProfile } : {}),
    ...(options.signerPublicKey ? { signerPublicKey: options.signerPublicKey } : {}),
    wallet,
    secretMaterial: 'keypair-bytes-never-returned',
    hostedVisibility: 'not-visible-to-hosted-accountless-server',
    agentVisibleCapabilities: AGENT_VISIBLE_CAPABILITIES,
    forbiddenAgentActions: FORBIDDEN_AGENT_ACTIONS,
    recommendedFlow: RECOMMENDED_FLOW,
    warnings,
  };
}

function resolveStorageClass(
  config: Partial<SapMcpConfig> | undefined,
  walletConfigured: boolean,
): WalletStorageClass {
  if (!config || config.mode === 'readonly') {
    return 'readonly';
  }
  if (hasEncryptedWalletFlag(config)) {
    return 'encrypted-local-keypair';
  }
  if (config.externalSignerUrl) {
    return 'external-signer';
  }
  if (walletConfigured) {
    return 'local-keypair-file';
  }
  return 'none';
}

function hasEncryptedWalletFlag(config: Partial<SapMcpConfig>): boolean {
  return (config as { encryptedWallet?: unknown }).encryptedWallet === true;
}

function inspectWalletPath(walletPath?: string): WalletGuardSummary['wallet'] {
  if (!walletPath) {
    return {
      configured: false,
      exists: false,
      path: 'not-configured',
      permissions: 'not-configured',
    };
  }

  if (!existsSync(walletPath)) {
    return {
      configured: true,
      exists: false,
      path: '[REDACTED]',
      permissions: 'missing',
    };
  }

  return {
    configured: true,
    exists: true,
    path: '[REDACTED]',
    permissions: inspectPermissions(walletPath),
  };
}

function inspectPermissions(walletPath: string): WalletPermissionStatus {
  if (process.platform === 'win32') {
    return 'unknown';
  }

  try {
    const stat = statSync(walletPath);
    return (stat.mode & 0o077) === 0 ? 'owner-only' : 'group-or-world-readable';
  } catch {
    return 'unknown';
  }
}

function buildWarnings(storage: WalletStorageClass, permissions: WalletPermissionStatus): readonly string[] {
  const warnings: string[] = [];
  if (storage === 'local-keypair-file') {
    warnings.push('Use a dedicated capped profile for agent workflows; keep treasury and long-term funds in separate wallets.');
  }
  if (storage === 'encrypted-local-keypair') {
    warnings.push('Encrypted wallet profiles require an unlock flow before local signing can proceed.');
  }
  if (permissions === 'group-or-world-readable') {
    warnings.push('Wallet file permissions are broader than owner-only; run the wizard repair flow to harden local permissions.');
  }
  return warnings;
}
