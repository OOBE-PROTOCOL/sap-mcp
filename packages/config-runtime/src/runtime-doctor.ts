/**
 * @name runtime-doctor
 * @description Runtime doctor module for diagnosing SAP MCP configuration, signer, wallet, policy, and RPC readiness.
 * @module config-runtime/runtime-doctor
 */

import { existsSync } from 'fs';
import { getPreferredConfigDir } from './paths.js';
import { getActiveProfile, getProfileConfigPath, loadProfileConfig } from './profiles.js';
import { getConfigManager, type FullConfig } from './secure-config.js';

/** @name DoctorStatus - Result status of a single doctor check. */
export type DoctorStatus = 'pass' | 'warning' | 'fail';

/** @name DoctorCheck - A single diagnostic check with status, message, and optional remediation action. */
export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorStatus;
  message: string;
  action?: string;
}

/** @name DoctorReport - Aggregated doctor report with overall status, profile info, checks, and summary. */
export interface DoctorReport {
  status: DoctorStatus;
  profileName: string;
  configPath: string;
  configRoot: string;
  checks: DoctorCheck[];
  summary: {
    pass: number;
    warning: number;
    fail: number;
  };
}

/** @name DoctorReportInput - Input parameters for building a doctor report from a loaded config. */
export interface DoctorReportInput {
  config: FullConfig;
  profileName: string;
  configPath: string;
  configRoot: string;
  walletExists?: boolean;
}

/** @name ActiveDoctorConfig - Active configuration snapshot used by the doctor for diagnostics. */
export interface ActiveDoctorConfig {
  config: FullConfig;
  profileName: string;
  configPath: string;
  configRoot: string;
}

const localWalletRequiredModes = new Set<FullConfig['mode']>(['local-dev-keypair']);

/** @name summarizeDoctorStatus - Returns the worst status across all checks (fail > warning > pass). */
export function summarizeDoctorStatus(checks: readonly DoctorCheck[]): DoctorStatus {
  if (checks.some((check) => check.status === 'fail')) {
    return 'fail';
  }

  if (checks.some((check) => check.status === 'warning')) {
    return 'warning';
  }

  return 'pass';
}

/** @name summarizeDoctorChecks - Produces a summary block from an array of doctor checks. */
export function summarizeDoctorChecks(checks: readonly DoctorCheck[]): DoctorReport['summary'] {
  return {
    pass: checks.filter((check) => check.status === 'pass').length,
    warning: checks.filter((check) => check.status === 'warning').length,
    fail: checks.filter((check) => check.status === 'fail').length,
  };
}

/** @name loadActiveDoctorConfig - Loads the active profile and its full configuration for doctor analysis. */
export function loadActiveDoctorConfig(): ActiveDoctorConfig {
  const profileName = getActiveProfile();
  const profileConfig = loadProfileConfig(profileName);
  const configRoot = getPreferredConfigDir();

  if (profileConfig) {
    return {
      config: profileConfig,
      profileName,
      configPath: getProfileConfigPath(profileName),
      configRoot,
    };
  }

  return {
    config: getConfigManager().load(),
    profileName: 'default',
    configPath: `${configRoot}/config.json`,
    configRoot,
  };
}

/** @name buildDoctorReport - Builds a complete doctor report from a loaded configuration, checking mode, signer, wallet, policy, RPC, and paid/write readiness. */
export function buildDoctorReport(input: DoctorReportInput): DoctorReport {
  const { config, profileName, configPath, configRoot } = input;
  const checks: DoctorCheck[] = [];
  const walletPath = config.walletPath;
  const walletExists = input.walletExists ?? (walletPath ? existsSync(walletPath) : false);
  const mode = config.mode;

  checks.push({
    id: 'profile-config',
    label: 'Profile config',
    status: configPath ? 'pass' : 'fail',
    message: configPath ? `Active profile "${profileName}" resolves to a config file.` : 'No active config path resolved.',
    action: configPath ? undefined : 'Run sap-mcp-config wizard.',
  });

  checks.push({
    id: 'runtime-mode',
    label: 'Runtime mode',
    status: mode === 'local-dev-keypair' ? 'warning' : 'pass',
    message: `Mode is ${mode}.`,
    action: mode === 'local-dev-keypair'
      ? 'Use local-keypair, delegated, or external mode for production funds.'
      : undefined,
  });

  checks.push({
    id: 'agent-pubkey',
    label: 'Agent public key',
    status: config.agentPubkey ? 'pass' : 'warning',
    message: config.agentPubkey ? 'Agent public key is configured.' : 'Agent public key is not configured.',
    action: config.agentPubkey ? undefined : 'Run sap-mcp-config wizard or set walletPath, then re-run profile setup.',
  });

  checks.push({
    id: 'wallet-path',
    label: 'Wallet path',
    status: walletPath
      ? (walletExists ? 'pass' : 'fail')
      : (localWalletRequiredModes.has(mode) ? 'fail' : 'warning'),
    message: walletPath
      ? (walletExists ? 'Wallet path is configured and exists.' : 'Wallet path is configured but the file is missing.')
      : 'No local wallet path is configured.',
    action: walletPath && !walletExists
      ? 'Repair the profile wallet path or re-run sap-mcp-config wizard.'
      : (!walletPath && localWalletRequiredModes.has(mode)
        ? 'Configure walletPath or switch to external-signer/delegated-session mode.'
        : (!walletPath ? 'Read-only hosted discovery works; paid/write flows need wizard-created local signing.' : undefined)),
  });

  checks.push({
    id: 'wallet-storage',
    label: 'Wallet storage',
    status: config.walletEncrypted || mode === 'delegated-session' || mode === 'external-signer' || !walletPath ? 'pass' : 'warning',
    message: config.walletEncrypted
      ? 'Wallet encryption flag is enabled.'
      : (mode === 'delegated-session' || mode === 'external-signer'
        ? 'Signing is delegated or external.'
        : (!walletPath ? 'No local wallet file is configured.' : 'Local wallet file is not marked encrypted.')),
    action: config.walletEncrypted || mode === 'delegated-session' || mode === 'external-signer' || !walletPath
      ? undefined
      : 'Use an external signer or keep only limited funds in this profile.',
  });

  checks.push({
    id: 'spending-policy',
    label: 'Spending policy',
    status: config.maxTxValueSol > 0 && config.dailyLimitSol > 0 && config.requireApprovalAboveSol >= 0 ? 'pass' : 'fail',
    message: `maxTxValueSol=${config.maxTxValueSol}, dailyLimitSol=${config.dailyLimitSol}, requireApprovalAboveSol=${config.requireApprovalAboveSol}.`,
    action: config.maxTxValueSol > 0 && config.dailyLimitSol > 0 && config.requireApprovalAboveSol >= 0
      ? undefined
      : 'Set positive maxTxValueSol and dailyLimitSol before enabling paid/write tools.',
  });

  const isPublicRpc = (() => {
    try {
      return new URL(config.rpcUrl).hostname === 'api.mainnet-beta.solana.com';
    } catch {
      return false;
    }
  })();
  checks.push({
    id: 'rpc',
    label: 'RPC endpoint',
    status: config.rpcUrl ? (isPublicRpc ? 'warning' : 'pass') : 'fail',
    message: config.rpcUrl ? 'RPC URL is configured.' : 'RPC URL is missing.',
    action: !config.rpcUrl
      ? 'Set rpcUrl or run sap-mcp-config wizard.'
      : (isPublicRpc
        ? 'Use a private or OOBE RPC endpoint for production signing/finalization.'
        : undefined),
  });

  checks.push({
    id: 'paid-write-readiness',
    label: 'Paid/write readiness',
    status: walletPath && walletExists ? 'pass' : 'warning',
    message: walletPath && walletExists
      ? 'Local signing material is present for paid/write bridge flows.'
      : 'Hosted read-only use is available; paid/write bridge flows need local signing.',
    action: walletPath && walletExists
      ? undefined
      : 'Run sap-mcp-config wizard or repair before calling x402/pay.sh paid tools or value-moving tools.',
  });

  const summary = summarizeDoctorChecks(checks);
  return {
    status: summarizeDoctorStatus(checks),
    profileName,
    configPath,
    configRoot,
    checks,
    summary,
  };
}

/** @name buildActiveDoctorReport - Convenience function that loads the active config and builds a doctor report in one call. */
export function buildActiveDoctorReport(): DoctorReport {
  return buildDoctorReport(loadActiveDoctorConfig());
}
