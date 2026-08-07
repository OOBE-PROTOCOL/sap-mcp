/**
 * @file src/ui/card-templates.test.ts
 * @description Unit tests for MCP Apps UI card template rendering.
 */

import { describe, it, expect } from 'vitest';
import { MCP_SERVER_VERSION } from '../core/constants.js';
import {
  renderBalanceCard, renderReadinessCard, renderPositionCard, renderPricingCard,
  renderTransferCard, renderMagicBlockCard, renderMetaplexCard, renderJupiterSwapCard, renderAgentRegistryCard,
} from './card-templates.js';

describe('MCP Apps UI card templates', () => {
  it('renders a balance card with SOL and USDC', () => {
    const html = renderBalanceCard({ sol: 2.5, usdc: 15.3, walletAddress: '3YfahM9yqdXEQjDLedME76wnynSzqGaUUBzMNJKzTjiB', network: 'mainnet-beta' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Wallet Balance');
    expect(html).toContain('2.5000');
    expect(html).toContain('15.30');
    expect(html).toContain('mainnet-beta');
    expect(html).toContain('3Yfa...TjiB');
    expect(html).toContain(`SAP MCP v${MCP_SERVER_VERSION}`);
  });

  it('renders a readiness card with ready status', () => {
    const html = renderReadinessCard({ status: 'ready', signerPublicKey: '3YfahM9yqdXEQjDLedME76wnynSzqGaUUBzMNJKzTjiB', sol: 1.2, usdc: 50, profile: 'my-sap-agent', canPayX402: true, canExecuteWriteTools: true, issues: [] });
    expect(html).toContain('ready');
    expect(html).toContain('my-sap-agent');
    expect(html).toContain('1.2000');
    expect(html).toContain('enabled');
  });

  it('renders a readiness card with issues', () => {
    const html = renderReadinessCard({ status: 'degraded', profile: 'test-profile', canPayX402: false, canExecuteWriteTools: true, issues: ['public-mainnet-rpc', 'plaintext-dedicated-wallet'] });
    expect(html).toContain('degraded');
    expect(html).toContain('disabled');
    expect(html).toContain('public-mainnet-rpc');
  });

  it('renders a long position card with positive PnL', () => {
    const html = renderPositionCard({ market: 'SOL-PERP', side: 'long', size: 100, entryPrice: 150, markPrice: 165, leverage: 3, pnlUsd: 15, pnlPct: 10, liquidationPrice: 120 });
    expect(html).toContain('LONG');
    expect(html).toContain('+$15.00');
    expect(html).toContain('+10.00%');
    expect(html).toContain('3x');
  });

  it('renders a short position card with negative PnL', () => {
    const html = renderPositionCard({ market: 'BTC-PERP', side: 'short', size: 500, entryPrice: 60000, markPrice: 62000, leverage: 5, pnlUsd: -16.67, pnlPct: -3.33 });
    expect(html).toContain('SHORT');
    expect(html).toContain('-$16.67');
    expect(html).toContain('-3.33%');
  });

  it('renders a pricing card for a paid tool', () => {
    const html = renderPricingCard({ toolName: 'sap_perp_markets', tier: 'read-premium', priceUsd: 0.005, recommendedMaxPriceUsd: 0.0075, isFree: false });
    expect(html).toContain('Tool Pricing');
    expect(html).toContain('sap_perp_markets');
    expect(html).toContain('$0.005000');
    expect(html).toContain('$0.007500');
  });

  it('renders a pricing card for a free tool', () => {
    const html = renderPricingCard({ toolName: 'sol_get_balance', tier: 'free', priceUsd: 0, recommendedMaxPriceUsd: 0, isFree: true });
    expect(html).toContain('FREE');
  });

  it('renders a transfer card', () => {
    const html = renderTransferCard({ type: 'sol', amount: 1.5, symbol: 'SOL', from: '3YfahM9yqdXEQjDLedME76wnynSzqGaUUBzMNJKzTjiB', to: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', signature: '5xKp7nQmN2q', status: 'confirmed' });
    expect(html).toContain('Transfer');
    expect(html).toContain('1.5000');
    expect(html).toContain('3Yfa...TjiB');
    expect(html).toContain('EPjF...Dt1v');
    expect(html).toContain('confirmed');
  });

  it('renders a magicblock swap card', () => {
    const html = renderMagicBlockCard({ action: 'swap', tokenIn: 'USDC', tokenOut: 'SOL', amountIn: 100, amountOut: 0.65, status: 'success', visibility: 'private' });
    expect(html).toContain('MagicBlock');
    expect(html).toContain('SWAP');
    expect(html).toContain('100.0000 USDC');
    expect(html).toContain('0.6500 SOL');
    expect(html).toContain('private');
  });

  it('renders a metaplex mint card', () => {
    const html = renderMetaplexCard({ action: 'mint', collectionName: 'SAP Agents', nftName: 'Agent #001', mintAddress: '7xKp7nQmN2qR8sT4', status: 'success' });
    expect(html).toContain('Metaplex');
    expect(html).toContain('MINT');
    expect(html).toContain('SAP Agents');
    expect(html).toContain('Agent #001');
  });

  it('renders a jupiter swap card', () => {
    const html = renderJupiterSwapCard({ tokenIn: 'SOL', tokenOut: 'USDC', amountIn: 2.5, amountOut: 412.5, priceImpactPct: 0.15, route: ['SOL', 'USDC'], status: 'success' });
    expect(html).toContain('Jupiter Swap');
    expect(html).toContain('2.5000 SOL');
    expect(html).toContain('412.5000 USDC');
    expect(html).toContain('0.150%');
  });

  it('renders an agent registry card', () => {
    const html = renderAgentRegistryCard({ agentName: 'sap-trader-01', agentId: '3YfahM9yqdXEQjDLedME76wnynSzqGaUUBzMNJKzTjiB', capabilities: ['trading', 'payments'], protocols: ['sap', 'clawpump'], isActive: true, registeredAt: '2026-08-01' });
    expect(html).toContain('Agent Registry');
    expect(html).toContain('sap-trader-01');
    expect(html).toContain('active');
    expect(html).toContain('clawpump');
  });

  it('escapes HTML in user-provided content', () => {
    const html = renderReadinessCard({ status: 'not-ready', profile: '<script>alert("xss")</script>', canPayX402: false, canExecuteWriteTools: false, issues: ['<img src=x onerror=alert(1)>'] });
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('footer shows version from MCP_SERVER_VERSION and wallet right', () => {
    const html = renderBalanceCard({ sol: 1, walletAddress: '3YfahM9yqdXEQjDLedME76wnynSzqGaUUBzMNJKzTjiB', network: 'mainnet-beta' });
    expect(html).toContain(`SAP MCP v${MCP_SERVER_VERSION}`);
    expect(html).toContain('3Yfa...TjiB');
    expect(html).toContain('fl');
    expect(html).toContain('fr');
  });

  it('header contains avatar group with SAP and OOBE logos', () => {
    const html = renderBalanceCard({ sol: 1, walletAddress: '3YfahM9yqdXEQjDLedME76wnynSzqGaUUBzMNJKzTjiB', network: 'mainnet-beta' });
    expect(html).toContain('alt="SAP"');
    expect(html).toContain('alt="OOBE"');
    expect(html).toContain('class="hp"');
  });

  it('uses real protocol logos as base64 data URIs', () => {
    const balance = renderBalanceCard({ sol: 1, walletAddress: '3YfahM9yqdXEQjDLedME76wnynSzqGaUUBzMNJKzTjiB', network: 'mainnet-beta' });
    expect(balance).toContain('data:image/png;base64,');
    expect(balance).toContain('alt="SOL"');

    const jup = renderJupiterSwapCard({ tokenIn: 'SOL', tokenOut: 'USDC', amountIn: 1, amountOut: 160, priceImpactPct: 0.1, route: ['SOL', 'USDC'], status: 'success' });
    expect(jup).toContain('data:image/svg+xml;base64,');
    expect(jup).toContain('alt="jupiter"');

    const pos = renderPositionCard({ market: 'SOL-PERP', side: 'long', size: 100, entryPrice: 150, markPrice: 165, leverage: 3, pnlUsd: 15, pnlPct: 10 });
    expect(pos).toContain('alt="adrena"');

    const mb = renderMagicBlockCard({ action: 'swap', status: 'success' });
    expect(mb).toContain('alt="magicblock"');

    const mp = renderMetaplexCard({ action: 'mint', status: 'success' });
    expect(mp).toContain('alt="metaplex"');
  });
});