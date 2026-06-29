/**
 * Type guards for SAP MCP types
 */

import type {
  SapMcpMode,
  SapSignerMode,
  SapRiskLevel,
  SapPermission,
  SapMcpConfig,
} from './types.js';

const VALID_MODES: SapMcpMode[] = [
  'readonly',
  'local-dev-keypair',
  'external-signer',
  'delegated-session',
  'hosted-api',
];

const VALID_SIGNER_MODES: SapSignerMode[] = [
  'none',
  'local-keypair',
  'external',
  'delegated',
];

const VALID_RISK_LEVELS: SapRiskLevel[] = [
  'safe',
  'low',
  'medium',
  'high',
  'critical',
];

const VALID_PERMISSIONS: SapPermission[] = [
  'registry:read',
  'registry:write',
  'identity:read',
  'identity:write',
  'reputation:read',
  'reputation:write',
  'payments:read',
  'payments:write',
  'settlement:read',
  'settlement:write',
  'memory:read',
  'memory:write',
  'transaction:submit',
];

/**
 * Executes the is valid mcp mode operation.
 */
export function isValidMcpMode(value: string): value is SapMcpMode {
  return VALID_MODES.includes(value as SapMcpMode);
}

/**
 * Executes the is valid signer mode operation.
 */
export function isValidSignerMode(value: string): value is SapSignerMode {
  return VALID_SIGNER_MODES.includes(value as SapSignerMode);
}

/**
 * Executes the is valid risk level operation.
 */
export function isValidRiskLevel(value: string): value is SapRiskLevel {
  return VALID_RISK_LEVELS.includes(value as SapRiskLevel);
}

/**
 * Executes the is valid permission operation.
 */
export function isValidPermission(value: string): value is SapPermission {
  return VALID_PERMISSIONS.includes(value as SapPermission);
}

/**
 * Executes the is readonly mode operation.
 */
export function isReadonlyMode(config: SapMcpConfig): boolean {
  return config.mode === 'readonly' || config.mode === 'hosted-api';
}

/**
 * Executes the is write mode operation.
 */
export function isWriteMode(config: SapMcpConfig): boolean {
  return !isReadonlyMode(config);
}

/**
 * Executes the requires signer operation.
 */
export function requiresSigner(config: SapMcpConfig): boolean {
  return config.mode === 'local-dev-keypair' || config.mode === 'delegated-session';
}

/**
 * Executes the is dev mode operation.
 */
export function isDevMode(config: SapMcpConfig): boolean {
  return config.mode === 'local-dev-keypair';
}

/**
 * Executes the is production mode operation.
 */
export function isProductionMode(config: SapMcpConfig): boolean {
  return config.mode === 'hosted-api' || config.mode === 'external-signer';
}
