/**
 * @name ui/ui-resources
 * @description MCP Apps UI resource registry and tool-result embedding helpers.
 *
 * Implements the MCP Apps extension (November 2025, spec 2026-07-28) for the
 * SAP MCP server. Each `ui://` resource is a self-contained HTML document
 * rendered by MCP clients inside a sandboxed iframe.
 *
 * @module ui/ui-resources
 */

import { MCP_SERVER_VERSION } from '../core/constants.js';
import {
  renderBalanceCard,
  renderReadinessCard,
  renderPositionCard,
  renderPricingCard,
  renderTransferCard,
  renderMagicBlockCard,
  renderMetaplexCard,
  renderJupiterSwapCard,
  renderAgentRegistryCard,
} from './card-templates.js';

export interface UiResourceDescriptor {
  uri: string;
  name: string;
  mimeType: 'text/html';
  description: string;
}

export type UiCardContext =
  | { kind: 'balance'; sol: number; usdc?: number; walletAddress: string; network: string }
  | {
      kind: 'readiness';
      status: 'ready' | 'degraded' | 'not-ready';
      signerPublicKey?: string;
      sol?: number;
      usdc?: number;
      profile: string;
      canPayX402: boolean;
      canExecuteWriteTools: boolean;
      issues: readonly string[];
      walletAddress?: string;
    }
  | {
      kind: 'position';
      market: string;
      side: 'long' | 'short';
      size: number;
      entryPrice: number;
      markPrice: number;
      leverage: number;
      pnlUsd: number;
      pnlPct: number;
      liquidationPrice?: number;
      walletAddress?: string;
    }
  | {
      kind: 'pricing';
      toolName: string;
      tier: string;
      priceUsd: number;
      recommendedMaxPriceUsd: number;
      isFree: boolean;
      walletAddress?: string;
    }
  | {
      kind: 'transfer';
      type: 'sol' | 'spl';
      amount: number;
      symbol: string;
      from: string;
      to: string;
      signature?: string;
      status: 'confirmed' | 'pending' | 'failed';
      walletAddress?: string;
    }
  | {
      kind: 'magicblock';
      action: 'swap' | 'deposit' | 'withdraw' | 'transfer';
      tokenIn?: string;
      tokenOut?: string;
      amountIn?: number;
      amountOut?: number;
      status: 'success' | 'pending' | 'failed';
      visibility?: 'public' | 'private';
      walletAddress?: string;
    }
  | {
      kind: 'metaplex';
      action: 'mint' | 'deploy' | 'update' | 'verify';
      collectionName?: string;
      nftName?: string;
      mintAddress?: string;
      status: 'success' | 'pending' | 'failed';
      walletAddress?: string;
    }
  | {
      kind: 'jupiter';
      tokenIn: string;
      tokenOut: string;
      amountIn: number;
      amountOut: number;
      priceImpactPct: number;
      route: string[];
      status: 'success' | 'pending' | 'failed';
      walletAddress?: string;
    }
  | {
      kind: 'agent';
      agentName: string;
      agentId?: string;
      capabilities: string[];
      protocols: string[];
      isActive: boolean;
      registeredAt?: string;
      walletAddress?: string;
    };

export const UI_RESOURCES: readonly UiResourceDescriptor[] = [
  { uri: 'ui://sap/balance-card', name: 'SAP Balance Card', mimeType: 'text/html', description: 'Visual wallet balance card with SOL and SPL token amounts.' },
  { uri: 'ui://sap/readiness-card', name: 'SAP Readiness Card', mimeType: 'text/html', description: 'Payment bridge readiness card with signer, balances, and policy status.' },
  { uri: 'ui://sap/position-card', name: 'SAP Position Card', mimeType: 'text/html', description: 'Perpetual position card with PnL, leverage, and liquidation price.' },
  { uri: 'ui://sap/pricing-card', name: 'SAP Pricing Card', mimeType: 'text/html', description: 'Tool pricing card with tier, cost, and recommended spending cap.' },
  { uri: 'ui://sap/transfer-card', name: 'SAP Transfer Card', mimeType: 'text/html', description: 'Token transfer card with amount, from/to addresses, and status.' },
  { uri: 'ui://sap/magicblock-card', name: 'SAP MagicBlock Card', mimeType: 'text/html', description: 'MagicBlock operation card for swaps, deposits, and withdrawals.' },
  { uri: 'ui://sap/metaplex-card', name: 'SAP Metaplex Card', mimeType: 'text/html', description: 'Metaplex NFT operation card for mint, deploy, update, and verify.' },
  { uri: 'ui://sap/jupiter-card', name: 'SAP Jupiter Swap Card', mimeType: 'text/html', description: 'Jupiter swap card with route, price impact, and amounts.' },
  { uri: 'ui://sap/agent-card', name: 'SAP Agent Registry Card', mimeType: 'text/html', description: 'Agent registry card with capabilities, protocols, and status.' },
] as const;

export function renderUiCard(ctx: UiCardContext): string {
  const v = MCP_SERVER_VERSION;
  switch (ctx.kind) {
    case 'balance': return renderBalanceCard({ ...ctx, version: v });
    case 'readiness': return renderReadinessCard({ ...ctx, version: v });
    case 'position': return renderPositionCard({ ...ctx, version: v });
    case 'pricing': return renderPricingCard({ ...ctx, version: v });
    case 'transfer': return renderTransferCard({ ...ctx, version: v });
    case 'magicblock': return renderMagicBlockCard({ ...ctx, version: v });
    case 'metaplex': return renderMetaplexCard({ ...ctx, version: v });
    case 'jupiter': return renderJupiterSwapCard({ ...ctx, version: v });
    case 'agent': return renderAgentRegistryCard({ ...ctx, version: v });
  }
}

export function createEmbeddedUiResource(
  uri: string,
  html: string,
): {
  type: 'resource';
  resource: { uri: string; mimeType: 'text/html'; text: string };
} {
  return { type: 'resource', resource: { uri, mimeType: 'text/html', text: html } };
}

export function resolveUiResourceUri(kind: UiCardContext['kind']): string {
  const map: Record<string, string> = {
    balance: 'ui://sap/balance-card',
    readiness: 'ui://sap/readiness-card',
    position: 'ui://sap/position-card',
    pricing: 'ui://sap/pricing-card',
    transfer: 'ui://sap/transfer-card',
    magicblock: 'ui://sap/magicblock-card',
    metaplex: 'ui://sap/metaplex-card',
    jupiter: 'ui://sap/jupiter-card',
    agent: 'ui://sap/agent-card',
  };
  return map[kind] ?? 'ui://sap/balance-card';
}

export function buildUiCardResource(ctx: UiCardContext) {
  const uri = resolveUiResourceUri(ctx.kind);
  const html = renderUiCard(ctx);
  return createEmbeddedUiResource(uri, html);
}