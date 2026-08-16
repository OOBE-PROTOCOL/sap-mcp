/**
 * @name policy/default-policies
 * @description Built-in default policy sets for each SAP MCP operating mode.
 *
 * Provides ready-made policy arrays for readonly, local development, and
 * hosted API modes. These policies are loaded by `PolicyEngine` at startup
 * and serve as the baseline permission rules before any custom policies
 * are added.
 *
 * @module policy/default-policies
 */

import type { Policy } from './policy-types.js';

/**
 * @name defaultPolicies
 * @description Shared default policies used by the SAP MCP runtime.
 *
 * Contains three pre-configured policy sets:
 * - `readonly-default` — Allows read operations, denies writes and transactions.
 * - `dev-default` — Allows all operations with spend limits and approval escalation.
 * - `hosted-default` — Allows discovery tools only, denies all writes.
 *
 * @usedBy `policy-engine.ts:PolicyEngine`
 */
export const defaultPolicies: Policy[] = [
  {
    id: 'readonly-default',
    name: 'Read-Only Default',
    description: 'Default policy for readonly mode - allows all read operations',
    rules: [
      {
        id: 'allow-read',
        condition: 'permission.endsWith(":read")',
        action: 'allow',
      },
      {
        id: 'deny-write',
        condition: 'permission.endsWith(":write")',
        action: 'deny',
      },
      {
        id: 'deny-transaction',
        condition: 'permission === "transaction:submit"',
        action: 'deny',
      },
    ],
    enabled: true,
  },
  {
    id: 'dev-default',
    name: 'Development Default',
    description: 'Default policy for local-dev-keypair mode - allows all operations with limits',
    rules: [
      {
        id: 'allow-all',
        condition: 'true',
        action: 'allow',
        maxAmountSol: 1.0,
      },
      {
        id: 'require-approval-large',
        condition: 'amountSol > 1.0',
        action: 'require_approval',
      },
    ],
    enabled: true,
  },
  {
    id: 'hosted-default',
    name: 'Hosted API Default',
    description: 'Default policy for hosted-api mode - restricted operations',
    rules: [
      {
        id: 'allow-discovery',
        condition: 'toolName.startsWith("sap_get_") || toolName.startsWith("sap_list_")',
        action: 'allow',
      },
      {
        id: 'deny-write',
        condition: 'true',
        action: 'deny',
      },
    ],
    enabled: true,
  },
];
