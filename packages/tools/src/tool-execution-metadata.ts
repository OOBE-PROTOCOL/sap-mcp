/**
 * @name tools/tool-execution-metadata
 * @description Shared execution metadata for MCP tool policy, routing, pricing, and guidance.
 *
 * The MCP adapter, wizard, plugin tooling, and release checks should use this
 * module instead of re-implementing tool intent, pricing, and signer-boundary
 * rules in separate places.
 *
 * @module tools/tool-execution-metadata
 */

import type { SapPermission } from '../../core/src/types.js';
import { isHostedAccountlessBlockedTool } from '../../payments/src/hosted-tool-eligibility.js';
import { classifyTool, type PaymentTier } from '../../payments/src/pricing.js';
import { getRequiredPermission, isWriteOperation } from '../../security/src/tool-permissions.js';
import type { ToolModuleDefinition } from './module-registry.js';

export type ToolExecutionIntent =
  | 'local-payment-bridge'
  | 'agent-bootstrap'
  | 'unsigned-transaction-builder'
  | 'value-action'
  | 'local-signer-write'
  | 'read-discovery'
  | 'sap-mcp-workflow';

export interface ToolExecutionGuidance {
  readonly descriptionSuffix: string;
  readonly schemaDescription: string;
}

export interface ToolExecutionMetadata {
  readonly toolName: string;
  readonly paymentTier: PaymentTier;
  readonly intent: ToolExecutionIntent;
  readonly intentDescription: string;
  readonly requiredPermission?: SapPermission;
  readonly writeOperation: boolean;
  readonly hostedAccountlessBlocked: boolean;
  readonly localSignerEquivalent?: string;
  readonly routing: string;
  readonly signerBoundary: string;
  readonly guidance: ToolExecutionGuidance;
}

export interface ToolModulePolicyCatalogEntry {
  readonly moduleId: string;
  readonly moduleTitle: string;
  readonly moduleCategory: ToolModuleDefinition['category'];
  readonly toolName: string;
  readonly metadata: ToolExecutionMetadata;
}

export function priceHintForTier(tier: PaymentTier): string {
  switch (tier) {
    case 'free':
      return 'free; call directly without x402';
    case 'read-premium':
      return 'paid read-premium; estimate first, then use sap_payments_call_paid_tool when the runtime cannot replay x402 natively';
    case 'builder':
      return 'paid builder; estimate first, then pay/build and finalize unsigned transactions locally when returned';
    case 'value-action':
      return 'paid value-action; preview cost and transaction effects before user confirmation';
    case 'batch':
      return 'paid batch; enforce maxPriceUsd and maxTotalUsd caps';
    default:
      return 'priced by hosted x402 challenge';
  }
}

export function localSignerEquivalent(toolName: string): string | undefined {
  const equivalents: Record<string, string> = {
    sap_register_agent: 'sap_payments_register_agent',
    sap_update_agent: 'sap_payments_update_agent',
    sap_sign_transaction: 'sap_payments_finalize_transaction',
  };
  if (equivalents[toolName]) return equivalents[toolName];
  if (toolName.startsWith('sap_escrow_build_')) return 'sap_payments_finalize_transaction';
  if (toolName.startsWith('sap_sns_build_')) return 'sap_payments_finalize_transaction';
  if (toolName.startsWith('sap_x402_build_')) return 'sap_payments_finalize_transaction';
  return undefined;
}

export function classifyToolIntent(toolName: string): ToolExecutionIntent {
  if (toolName.startsWith('sap_payments_') || toolName === 'sap_x402_paid_call') {
    return 'local-payment-bridge';
  }
  if (toolName.startsWith('sap_agent_') || toolName.startsWith('sap_runtime_') || toolName.startsWith('sap_skills_')) {
    return 'agent-bootstrap';
  }
  if (toolName.includes('_build_') || toolName.startsWith('sap_escrow_build_') || toolName.startsWith('sap_sns_build_')) {
    return 'unsigned-transaction-builder';
  }
  if (toolName.includes('swap') || toolName.includes('trade') || toolName.includes('buy') || toolName.includes('sell')) {
    return 'value-action';
  }
  if (toolName.includes('register') || toolName.includes('update') || toolName.includes('mint') || toolName.includes('transfer')) {
    return 'local-signer-write';
  }
  if (toolName.includes('list') || toolName.includes('get') || toolName.includes('fetch') || toolName.includes('discover') || toolName.includes('search')) {
    return 'read-discovery';
  }
  return 'sap-mcp-workflow';
}

export function describeToolIntent(intent: ToolExecutionIntent): string {
  switch (intent) {
    case 'local-payment-bridge':
      return 'local non-custodial payment/signing bridge';
    case 'agent-bootstrap':
      return 'agent bootstrap, routing, skills, or repair guidance';
    case 'unsigned-transaction-builder':
      return 'hosted unsigned transaction builder';
    case 'value-action':
      return 'Solana value-action or trading workflow';
    case 'local-signer-write':
      return 'local-signer write workflow';
    case 'read-discovery':
      return 'read/discovery workflow';
    case 'sap-mcp-workflow':
      return 'SAP MCP tool workflow';
  }
}

export function getToolExecutionMetadata(toolName: string, title = toolName): ToolExecutionMetadata {
  const paymentTier = classifyTool(toolName);
  const intent = classifyToolIntent(toolName);
  const intentDescription = describeToolIntent(intent);
  const equivalent = localSignerEquivalent(toolName);
  const hostedAccountlessBlocked = isHostedAccountlessBlockedTool(toolName);

  const routing = hostedAccountlessBlocked
    ? `Routing: hosted accountless write is blocked; do not call this as a paid hosted write and no x402 payment should be charged. Use ${equivalent ?? 'the local sap_payments bridge or a hosted unsigned builder'} when user signing is required.`
    : toolName.startsWith('sap_payments_')
      ? 'Routing: local sap_payments bridge. It may sign x402 payment payloads or user-approved transactions locally, and must never expose keypair bytes.'
      : equivalent && toolName.includes('_build_')
        ? `Routing: hosted-safe builder. If a transaction is returned, preview/sign/submit with ${equivalent}; never create temporary signing scripts.`
        : paymentTier === 'free'
          ? 'Routing: free hosted call; call directly and keep it small/exact when possible.'
          : 'Routing: paid hosted call; call sap_estimate_tool_cost first, then use sap_payments_call_paid_tool if the runtime cannot handle x402 natively.';

  const signerBoundary = toolName.startsWith('sap_payments_') || hostedAccountlessBlocked || equivalent
    ? 'Signer boundary: user-controlled local profile or external signer; OOBE hosted MCP remains non-custodial.'
    : 'Signer boundary: hosted reads/builders never receive keypair bytes; value-moving results must be finalized locally when signing is required.';

  const descriptionSuffix = [
    `Intent: ${intentDescription}.`,
    `Pricing: ${priceHintForTier(paymentTier)}.`,
    routing,
    signerBoundary,
  ].join(' ');

  return {
    toolName,
    paymentTier,
    intent,
    intentDescription,
    requiredPermission: getRequiredPermission(toolName),
    writeOperation: isWriteOperation(toolName),
    hostedAccountlessBlocked,
    localSignerEquivalent: equivalent,
    routing,
    signerBoundary,
    guidance: {
      descriptionSuffix,
      schemaDescription: `${title} input schema. ${descriptionSuffix} Use exact field names from this schema; do not guess aliases or include private key material.`,
    },
  };
}

export function buildToolModulePolicyCatalog(
  modules: readonly ToolModuleDefinition[],
): readonly ToolModulePolicyCatalogEntry[] {
  return modules.flatMap((module) => (
    [...(module.expectedTools ?? [])].map((toolName) => ({
      moduleId: module.id,
      moduleTitle: module.title,
      moduleCategory: module.category,
      toolName,
      metadata: getToolExecutionMetadata(toolName, toolName),
    }))
  ));
}
