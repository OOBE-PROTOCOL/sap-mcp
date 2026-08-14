/**
 * @name ui/tool-card-registry
 * @description Polymorphic card dispatcher: maps tool name + real data to the
 * correct card builder. Each tool category has an adapter that transforms
 * tool result data into CardBuilder calls.
 *
 * Usage:
 *   const registry = new ToolCardRegistry(version, wallet);
 *   const html = registry.render('sol_get_balance', { sol: 2.5, usdc: 15, ... });
 *
 * @module ui/tool-card-registry
 */

import { CardBuilder, addrLink, escapeHtml } from './card-builder.js';
import type { RowValueColor } from './card-shell.js';
import { resolveProtocolFromToolName, resolveProtocolLogo, resolveTokenLogo } from './protocol-logos.js';

// ── Types ──────────────────────────────────────────────────────────────────

/** Tool result data — a loosely-typed record that adapters transform. */
export type ToolResultData = Record<string, unknown>;

/** Adapter function: takes tool name + result data + meta, returns card HTML. */
export type ToolCardAdapter = (data: ToolResultData, meta: CardMeta) => string;

export interface CardMeta {
  readonly toolName: string;
  readonly version: string;
  readonly wallet: string;
}

export type ToolCategory =
  | 'balance' | 'position' | 'pricing' | 'transfer' | 'swap'
  | 'nft' | 'magicblock' | 'bridge' | 'agent' | 'memory' | 'audit'
  | 'premium' | 'chart' | 'staking' | 'strategy' | 'stream'
  | 'generic-read' | 'generic-write' | 'generic-build';

export type ToolCardCoverageKind = 'specialized' | 'generic-read' | 'generic-write' | 'generic-build';

export interface ToolCardCoverageEntry {
  readonly toolName: string;
  readonly coverage: ToolCardCoverageKind;
  readonly specialized: boolean;
}

export interface ToolCardCoverageReport {
  readonly totalTools: number;
  readonly specializedTools: number;
  readonly genericTools: number;
  readonly byCoverage: Readonly<Record<ToolCardCoverageKind, number>>;
  readonly entries: readonly ToolCardCoverageEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Smart value formatter: trims trailing zeros, uses K/M suffixes for large numbers.
 * Examples: 10.0000 -> "10", 12.3490 -> "12.349", 1500000 -> "1.5M", 12500 -> "12.5K"
 */
function fmt(v: unknown): string {
  if (typeof v !== 'number') {
    if (typeof v === 'string') { const n = parseFloat(v); if (isNaN(n)) return String(v); v = n; }
    else return '—';
  }
  const n = v as number;
  if (n === 0) return '0';
  const abs = Math.abs(n);
  // Large numbers: K/M/B suffixes
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(2).replace(/\.?0+$/, '')}K`;
  // Normal numbers: trim trailing zeros
  if (abs >= 1) return n.toFixed(4).replace(/\.?0+$/, '');
  // Small numbers: keep up to 6 decimals, trim zeros
  return n.toFixed(6).replace(/\.?0+$/, '');
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return String(v);
}

function statusColor(status: string): RowValueColor {
  const s = status.toLowerCase();
  if (['ready', 'success', 'confirmed', 'active', 'enabled', 'complete'].includes(s)) return 's';
  if (['pending', 'degraded', 'warning', 'processing'].includes(s)) return 'w';
  if (['failed', 'error', 'disabled', 'inactive', 'not-ready'].includes(s)) return 'd';
  return '';
}

function pnlColor(pnl: number): RowValueColor {
  return pnl >= 0 ? 's' : 'd';
}

// ── Category adapters ──────────────────────────────────────────────────────
// Each adapter takes real tool result data and builds a card with actual values.

const balanceAdapter: ToolCardAdapter = (data, meta) => {
  const walletAddress = str(data.walletAddress ?? data.wallet ?? meta.wallet);
  const network = str(data.network ?? 'mainnet-beta');

  const b = new CardBuilder()
    .title('Wallet Balance').subtitle(network)
    .version(meta.version).wallet(walletAddress)
    .logo(resolveTokenLogo('SOL'));

  // Primary SOL balance as stat
  const sol = typeof data.sol === 'number' ? data.sol : typeof data.balance === 'number' ? data.balance / 1e9 : 0;
  b.stat(fmt(sol), 'SOL', { large: true });

  // USDC if present
  if (typeof data.usdc === 'number') b.row('USDC', `${fmt(data.usdc)} USDC`, { icon: resolveTokenLogo('USDC') });

  // Any other token balances (SPL, Token-2022, custom)
  const knownKeys = ['sol', 'usdc', 'balance', 'walletAddress', 'wallet', 'network', 'title', 'version'];
  const tokenEntries = Object.entries(data).filter(([k, v]) => !knownKeys.includes(k) && typeof v === 'number');
  for (const [symbol, amount] of tokenEntries.slice(0, 4)) {
    b.row(symbol.toUpperCase(), `${fmt(amount)} ${symbol.toUpperCase()}`, { icon: resolveTokenLogo(symbol) });
  }

  b.row('Wallet', addrLink(walletAddress), { raw: true });
  return b.build();
};

const positionAdapter: ToolCardAdapter = (data, meta) => {
  const pnlUsd = typeof data.pnlUsd === 'number' ? data.pnlUsd : 0;
  const pnlPct = typeof data.pnlPct === 'number' ? data.pnlPct : 0;
  const ps = pnlUsd >= 0 ? '+' : '-';
  const pa = Math.abs(pnlUsd);
  const pp = Math.abs(pnlPct);
  const protocol = resolveProtocolFromToolName(meta.toolName);
  const market = str(data.market ?? data.symbol ?? '—');

  return new CardBuilder()
    .title('Perp Position').subtitle(market)
    .version(meta.version).wallet(meta.wallet)
    .logo(resolveProtocolLogo(protocol))
    .stat(`${ps}$${pa.toFixed(2)}`, `${ps}${pp.toFixed(2)}% PnL`, { color: pnlColor(pnlUsd), large: true })
    .row('Side', str(data.side ?? '—').toUpperCase(), { color: (data.side === 'long' ? 's' : 'd') as RowValueColor })
    .row('Lev', str(data.leverage ? `${data.leverage}x` : '—'))
    .row('Entry', `$${fmt(data.entryPrice ?? data.entry ?? 0)}`)
    .row('Mark', `$${fmt(data.markPrice ?? data.mark ?? 0)}`)
    .row('Size', `$${fmt(data.size ?? 0)}`)
    .row('Liq.', data.liquidationPrice !== undefined ? `$${fmt(data.liquidationPrice)}` : '—', { color: 'w' })
    .build();
};

const swapAdapter: ToolCardAdapter = (data, meta) => {
  const protocol = resolveProtocolFromToolName(meta.toolName);
  const tokenIn = str(data.tokenIn ?? data.inputToken ?? '—');
  const tokenOut = str(data.tokenOut ?? data.outputToken ?? '—');
  const amountIn = typeof data.amountIn === 'number' ? data.amountIn : 0;
  const amountOut = typeof data.amountOut === 'number' ? data.amountOut : 0;
  const priceImpact = typeof data.priceImpactPct === 'number' ? data.priceImpactPct : 0;
  const pi: RowValueColor = priceImpact < 0.5 ? 's' : priceImpact < 2 ? 'w' : 'd';
  const route = Array.isArray(data.route) ? data.route : [tokenIn, tokenOut];

  return new CardBuilder()
    .title('Swap').subtitle(`${tokenIn} -> ${tokenOut}`)
    .version(meta.version).wallet(meta.wallet)
    .logo(resolveProtocolLogo(protocol))
    .row('In', `${fmt(amountIn)} ${tokenIn}`, { icon: resolveTokenLogo(tokenIn) })
    .row('Out', `${fmt(amountOut)} ${tokenOut}`, { icon: resolveTokenLogo(tokenOut) })
    .row('Impact', `${priceImpact.toFixed(3)}%`, { color: pi })
    .row('Status', str(data.status ?? 'success'), { color: statusColor(str(data.status ?? 'success')) })
    .fullRow('Route', route.join(' -> '))
    .build();
};

const transferAdapter: ToolCardAdapter = (data, meta) => {
  const symbol = str(data.symbol ?? data.tokenSymbol ?? 'SOL');
  const amount = typeof data.amount === 'number' ? data.amount : 0;
  const status = str(data.status ?? 'confirmed');
  const from = str(data.from ?? data.sender ?? meta.wallet);
  const to = str(data.to ?? data.recipient ?? '—');
  const sig = data.signature ?? data.sig;

  const b = new CardBuilder()
    .title('Transfer').subtitle(str(data.type ?? 'SOL').toUpperCase())
    .version(meta.version).wallet(meta.wallet)
    .logo(resolveTokenLogo(symbol))
    .stat(fmt(amount), symbol, { large: true, icon: resolveTokenLogo(symbol) })
    .row('From', addrLink(from), { raw: true });
  b.row('To', addrLink(to), { raw: true });
  b.row('Status', status, { color: statusColor(status) });
  if (sig) b.row('Sig', addrLink(str(sig), 'tx'), { raw: true });
  return b.build();
};

const nftAdapter: ToolCardAdapter = (data, meta) => {
  const protocol = resolveProtocolFromToolName(meta.toolName);
  const status = str(data.status ?? 'success');

  return new CardBuilder()
    .title('NFT Operation').subtitle(str(data.action ?? 'mint').toUpperCase())
    .version(meta.version).wallet(meta.wallet)
    .logo(resolveProtocolLogo(protocol))
    .row('Collection', str(data.collectionName ?? data.collection ?? '—'))
    .row('NFT', str(data.nftName ?? data.name ?? '—'))
    .row('Mint', data.mintAddress ? addrLink(str(data.mintAddress), 'token') : '—', { raw: true })
    .row('Status', status, { color: statusColor(status) })
    .build();
};

const agentAdapter: ToolCardAdapter = (data, meta) => {
  const isActive = data.isActive === true || data.status === 'active';
  const protocols = Array.isArray(data.protocols) ? data.protocols as string[] : [];
  const protocolHtml = protocols.map(p => {
    const logo = resolveProtocolLogo(p);
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:5px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);font-size:9px;color:#eaeef2;font-family:ui-monospace,monospace;margin:1px">${logo} ${escapeHtml(p)}</span>`;
  }).join(' ');

  return new CardBuilder()
    .title('Agent Registry').subtitle(str(data.agentName ?? data.name ?? 'agent'))
    .version(meta.version).wallet(meta.wallet)
    .logo(resolveProtocolLogo('sap'))
    .row('Status', isActive ? 'active' : 'inactive', { color: isActive ? 's' : 'd' })
    .row('Caps', str(data.capabilities ? (data.capabilities as string[]).length : '—'))
    .fullRow('Protocols', protocolHtml, { raw: true })
    .build();
};

const chartAdapter: ToolCardAdapter = (data, meta) => {
  const protocol = resolveProtocolFromToolName(meta.toolName);
  const symbol = str(data.symbol ?? data.token ?? '—');
  const interval = str(data.interval ?? '1h');

  // Collect candles from ohlc[] array or single open/high/low/close
  const candles: Array<{ o: number; h: number; l: number; c: number }> = [];
  if (Array.isArray(data.ohlc)) {
    for (const c of data.ohlc) {
      if (c && typeof c === 'object') {
        candles.push({ o: Number(c.open ?? 0), h: Number(c.high ?? 0), l: Number(c.low ?? 0), c: Number(c.close ?? 0) });
      }
    }
  } else if (typeof data.open === 'number' || typeof data.close === 'number') {
    candles.push({ o: data.open as number, h: data.high as number, l: data.low as number, c: data.close as number });
  }

  // Use last candle for OHLC rows when array is present
  const last = candles.length > 0 ? candles[candles.length - 1] : { o: 0, h: 0, l: 0, c: 0 };

  // Build SVG candlestick chart with Y-axis price labels
  let chartHtml = '';
  if (candles.length > 0) {
    let min = Infinity, max = -Infinity;
    for (const c of candles) { if (c.l < min) min = c.l; if (c.h > max) max = c.h; }
    const range = max - min || 1;
    const W = 280, H = 100, padTop = 6, padBot = 6, padLeft = 42, padRight = 6;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBot;
    const yScale = chartH / range;
    const candleW = candles.length > 1 ? Math.min(chartW / candles.length, 20) : 40;
    const totalCandlesW = candleW * candles.length;
    const gap = candles.length > 1 ? (chartW - totalCandlesW) / (candles.length - 1) : 0;

    // Y-axis labels (3 price levels: top, mid, bottom)
    const yLabels = [max, (max + min) / 2, min];
    const yLabelHtml = yLabels.map((price, i) => {
      const y = padTop + (i / 2) * chartH;
      return `<text x="${padLeft - 4}" y="${y + 3}" text-anchor="end" font-family="ui-monospace,monospace" font-size="8" fill="rgba(255,255,255,0.3)">$${price.toFixed(price > 1000 ? 0 : 2)}</text>`;
    }).join('');

    // Horizontal grid lines
    const gridLines = yLabels.map((_, i) => {
      const y = padTop + (i / 2) * chartH;
      return `<line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;
    }).join('');

    // Current price line (dashed)
    const yCurrent = padTop + (max - last.c) * yScale;
    const priceLine = `<line x1="${padLeft}" y1="${yCurrent}" x2="${W - padRight}" y2="${yCurrent}" stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-dasharray="2,2"/>`;

    // Candlesticks
    const rects = candles.map((c, i) => {
      const isUp = c.c >= c.o;
      const color = isUp ? '#00ffa3' : '#ff3366';
      const x = padLeft + i * (candleW + gap);
      const yHigh = padTop + (max - c.h) * yScale;
      const yLow = padTop + (max - c.l) * yScale;
      const yBodyTop = padTop + (max - Math.max(c.o, c.c)) * yScale;
      const bodyH = Math.max(Math.abs(c.c - c.o) * yScale, 1.5);
      const wickX = x + candleW / 2;
      const bodyX = x + candleW * 0.15;
      const bodyW = candleW * 0.7;

      return `<line x1="${wickX}" y1="${yHigh}" x2="${wickX}" y2="${yLow}" stroke="${color}" stroke-width="1" opacity="0.6"/><rect x="${bodyX}" y="${yBodyTop}" width="${bodyW}" height="${bodyH}" fill="${color}" rx="1"/>`;
    }).join('');

    chartHtml = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;margin:6px 0;border-radius:6px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.03)">${gridLines}${priceLine}${yLabelHtml}${rects}</svg>`;
  }

  const b = new CardBuilder()
    .title('Chart Data').subtitle(`${symbol} ${interval}`)
    .version(meta.version).wallet(meta.wallet)
    .logo(resolveProtocolLogo(protocol));

  if (chartHtml) {
    b.fullRow('Price', chartHtml, { raw: true });
  }

  b.row('Open', `$${last.o.toFixed(2)}`)
    .row('High', `$${last.h.toFixed(2)}`, { color: 's' })
    .row('Low', `$${last.l.toFixed(2)}`, { color: 'd' })
    .row('Close', `$${last.c.toFixed(2)}`)
    .row('Volume', str(data.volume ?? '—'));

  return b.build();
};

const stakingAdapter: ToolCardAdapter = (data, meta) => {
  const protocol = resolveProtocolFromToolName(meta.toolName);
  return new CardBuilder()
    .title('Staking').subtitle(str(data.token ?? 'SOL'))
    .version(meta.version).wallet(meta.wallet)
    .logo(resolveProtocolLogo(protocol))
    .row('Amount', `${fmt(data.amount ?? 0)} ${str(data.token ?? 'SOL')}`)
    .row('APY', str(data.apy ?? '—'))
    .row('Status', str(data.status ?? 'active'), { color: statusColor(str(data.status ?? 'active')) })
    .build();
};

const genericReadAdapter: ToolCardAdapter = (data, meta) => {
  const protocol = resolveProtocolFromToolName(meta.toolName);
  const cleanName = meta.toolName.replace(/^sap_/, '').replace(/^mcp__sap__/, '');
  const b = new CardBuilder()
    .title(str(data.title ?? protocol))
    .subtitle(cleanName)
    .version(meta.version).wallet(meta.wallet)
    .logo(resolveProtocolLogo(protocol))
    .noGrid();

  // Auto-extract key-value pairs as simple rows (not grid)
  const entries = Object.entries(data).filter(([k]) => !['title', 'version', 'wallet'].includes(k)).slice(0, 6);
  for (const [key, val] of entries) {
    if (val === null || val === undefined) continue;
    if (typeof val === 'object') continue;
    const valStr = str(val);
    if (valStr.length >= 32 && valStr.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(valStr)) {
      b.row(key, addrLink(valStr, 'address'), { raw: true });
    } else if (typeof val === 'boolean') {
      b.row(key, val ? 'yes' : 'no', { color: val ? 's' : '' });
    } else if (typeof val === 'number') {
      b.row(key, fmt(val));
    } else {
      b.row(key, valStr);
    }
  }
  return b.build();
};

const genericWriteAdapter: ToolCardAdapter = (data, meta) => {
  const protocol = resolveProtocolFromToolName(meta.toolName);
  const cleanName = meta.toolName.replace(/^sap_/, '').replace(/^mcp__sap__/, '');
  const b = new CardBuilder()
    .title(str(data.title ?? protocol))
    .subtitle(cleanName)
    .version(meta.version).wallet(meta.wallet)
    .logo(resolveProtocolLogo(protocol))
    .noGrid();

  // Try to find a primary value (amount, price, size) to show as stat
  const primaryVal = data.amount ?? data.price ?? data.size ?? data.value;
  const primarySymbol = data.token ?? data.symbol ?? data.mint ?? 'SOL';
  if (typeof primaryVal === 'number') {
    b.stat(fmt(primaryVal), str(primarySymbol).toUpperCase(), { large: true, icon: resolveTokenLogo(str(primarySymbol)) });
  }

  b.row('Signer', addrLink(meta.wallet), { raw: true })
    .row('Network', 'mainnet-beta');

  const entries = Object.entries(data).filter(([k]) => !['title', 'version', 'wallet', 'signer', 'network', 'amount', 'price', 'size', 'value', 'token', 'symbol', 'mint'].includes(k)).slice(0, 4);
  for (const [key, val] of entries) {
    if (val === null || val === undefined) continue;
    if (typeof val === 'object') continue;
    const valStr = str(val);
    if (valStr.length >= 32 && valStr.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(valStr)) {
      b.row(key, addrLink(valStr, 'address'), { raw: true });
    } else if (typeof val === 'boolean') {
      b.row(key, val ? 'yes' : 'no', { color: val ? 's' : '' });
    } else if (typeof val === 'number') {
      b.row(key, fmt(val));
    } else {
      b.row(key, valStr);
    }
  }
  return b.build();
};

const genericBuildAdapter: ToolCardAdapter = (data, meta) => {
  const protocol = resolveProtocolFromToolName(meta.toolName);
  const cleanName = meta.toolName.replace(/^sap_/, '').replace(/^mcp__sap__/, '');
  const b = new CardBuilder()
    .title(str(data.title ?? protocol))
    .subtitle(cleanName)
    .version(meta.version).wallet(meta.wallet)
    .logo(resolveProtocolLogo(protocol))
    .noGrid();

  // Try to find a primary value for stat instead of "BUILD"
  const primaryVal = data.amount ?? data.size ?? data.leverage;
  const primaryLabel = data.market ?? data.token ?? data.type ?? 'Build';
  if (typeof primaryVal === 'number') {
    b.stat(fmt(primaryVal), str(primaryLabel), { large: true });
  }

  b.row('Output', str(data.output ?? 'unsigned tx'))
    .row('Network', 'mainnet-beta');

  const entries = Object.entries(data).filter(([k]) => !['title', 'version', 'wallet', 'output', 'network', 'amount', 'size', 'leverage', 'market', 'token', 'type'].includes(k)).slice(0, 4);
  for (const [key, val] of entries) {
    if (val === null || val === undefined) continue;
    if (typeof val === 'object') continue;
    const valStr = str(val);
    if (valStr.length >= 32 && valStr.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(valStr)) {
      b.row(key, addrLink(valStr, 'address'), { raw: true });
    } else if (typeof val === 'boolean') {
      b.row(key, val ? 'yes' : 'no', { color: val ? 's' : '' });
    } else if (typeof val === 'number') {
      b.row(key, fmt(val));
    } else {
      b.row(key, valStr);
    }
  }
  return b.build();
};

// ── Tool → Adapter mapping ─────────────────────────────────────────────────

const toolAdapters = new Map<string, ToolCardAdapter>([
  // Balance
  ['sol_get_balance', balanceAdapter],
  ['spl_token_getBalance', balanceAdapter],
  ['magicblock_balance', balanceAdapter],
  ['magicblock_private_balance', balanceAdapter],
  ['magicblock_privateBalance', balanceAdapter],
  ['sap_payments_prepaid_balance', balanceAdapter],
  ['jupiter_getHoldings', balanceAdapter],
  ['sap_x402_get_balance', balanceAdapter],

  // Position
  ['sap_perp_position_info', positionAdapter],
  ['sap_adrena_get_positions', positionAdapter],
  ['sap_adrena_get_position_status', positionAdapter],
  ['adrena_getPositions', positionAdapter],
  ['orca_getWhirlpool', positionAdapter],

  // Swap
  ['jupiter_swap', swapAdapter],
  ['jupiter_smartSwap', swapAdapter],
  ['jupiter_swapInstructions', swapAdapter],
  ['jupiter_getQuote', swapAdapter],
  ['jupiter_getPrice', swapAdapter],
  ['orca_swap', swapAdapter],
  ['sap_adrena_build_swap', swapAdapter],
  ['magicblock_swap', swapAdapter],
  ['magicblock_swap_quote', swapAdapter],
  ['magicblock_swapQuote', swapAdapter],
  ['raydium_pools_addLiquidity', swapAdapter],
  ['raydium_pools_removeLiquidity', swapAdapter],
  ['meteora_addDLMMLiquidity', swapAdapter],
  ['meteora_removeDLMMLiquidity', swapAdapter],
  ['adrena_addCollateral', swapAdapter],
  ['adrena_removeCollateral', swapAdapter],

  // Transfer
  ['spl-token_transfer', transferAdapter],
  ['spl-token_transferSol', transferAdapter],
  ['spl_token_transfer', transferAdapter],
  ['spl_token_transferSol', transferAdapter],
  ['sap_build_sol_transfer', transferAdapter],
  ['sap_build_spl_transfer', transferAdapter],
  ['magicblock_transfer', transferAdapter],
  ['magicblock_deposit', transferAdapter],
  ['magicblock_withdraw', transferAdapter],

  // NFT
  ['metaplex-nft_mintNFT', nftAdapter],
  ['metaplex-nft_deployCollection', nftAdapter],
  ['metaplex-nft_updateMetadata', nftAdapter],
  ['metaplex-nft_verifyCollection', nftAdapter],
  ['metaplex-nft_verifyCreator', nftAdapter],
  ['metaplex-nft_configureRoyalties', nftAdapter],
  ['metaplex-nft_delegateAuthority', nftAdapter],
  ['metaplex-nft_revokeAuthority', nftAdapter],
  ['metaplex-nft_setAndVerifyCollection', nftAdapter],
  ['metaplex_nft_mintNFT', nftAdapter],
  ['metaplex_nft_deployCollection', nftAdapter],
  ['metaplex_nft_updateMetadata', nftAdapter],
  ['metaplex_nft_verifyCollection', nftAdapter],
  ['metaplex_nft_verifyCreator', nftAdapter],
  ['metaplex_nft_configureRoyalties', nftAdapter],
  ['metaplex_nft_delegateAuthority', nftAdapter],
  ['metaplex_nft_revokeAuthority', nftAdapter],
  ['metaplex_nft_setAndVerifyCollection', nftAdapter],
  ['3land_buyNFT', nftAdapter],
  ['3land_createCollection', nftAdapter],
  ['3land_mintAndList', nftAdapter],

  // Balance
  ['sap_register_agent', agentAdapter],
  ['sap_get_agent', agentAdapter],
  ['sap_get_agent_profile', agentAdapter],
  ['sap_list_agents', agentAdapter],
  ['sap_list_all_agents', agentAdapter],
  ['sap_discover_agents', agentAdapter],
  ['sap_update_agent', agentAdapter],
  ['sap_close_agent', agentAdapter],
  ['sap_deactivate_agent', agentAdapter],
  ['sap_reactivate_agent', agentAdapter],
  ['sap_is_agent_active', agentAdapter],

  // Pricing — removed (too spammy for chat, falls to generic adapters)

  // Chart
  ['sap_chart_ohlc', chartAdapter],
  ['sap_chart_multi_ohlc', chartAdapter],
  ['sap_chart_long_term', chartAdapter],
  ['sap_chart_indicators', chartAdapter],
  ['sap_chart_volume_profile', chartAdapter],
  ['coingecko_getOHLCV', chartAdapter],
  ['coingecko_getTokenPrice', chartAdapter],
  ['coingecko_getTokenInfo', chartAdapter],
  ['pyth_getPrice', chartAdapter],
  ['pyth_getPriceHistory', chartAdapter],

  // Staking
  ['staking_stakeSOL', stakingAdapter],
  ['staking_unstakeSOL', stakingAdapter],
  ['staking_stakeJupSOL', stakingAdapter],
  ['staking_unstakeJupSOL', stakingAdapter],
  ['staking_stakeSolayer', stakingAdapter],
  ['staking_unstakeSolayer', stakingAdapter],
  ['sap_deposit_stake', stakingAdapter],
  ['sap_init_stake', stakingAdapter],
  ['sap_request_unstake', stakingAdapter],
  ['sap_complete_unstake', stakingAdapter],
]);

// ── Tool name → generic adapter ───────────────────────────────────────────

function resolveGenericAdapter(toolName: string): ToolCardAdapter {
  const category = resolveGenericCardCoverage(toolName);
  if (category === 'generic-build') return genericBuildAdapter;
  if (category === 'generic-write') return genericWriteAdapter;
  return genericReadAdapter;
}

export function resolveGenericCardCoverage(toolName: string): Exclude<ToolCardCoverageKind, 'specialized'> {
  const lower = toolName.toLowerCase();
  if (lower.includes('build') || lower.includes('prepare') || lower.includes('preview') || lower.includes('estimate') || lower.includes('simulate') || lower.includes('construct'))
    return 'generic-build';
  if (lower.includes('create') || lower.includes('open') || lower.includes('execute') || lower.includes('send') || lower.includes('sign') || lower.includes('submit') || lower.includes('mint') || lower.includes('register') || lower.includes('update') || lower.includes('activate') || lower.includes('deposit') || lower.includes('stake') || lower.includes('swap') || lower.includes('transfer') || lower.includes('cancel') || lower.includes('close') || lower.includes('remove') || lower.includes('delete') || lower.includes('revoke') || lower.includes('deactivate') || lower.includes('withdraw') || lower.includes('unstake') || lower.includes('fund') || lower.includes('settle') || lower.includes('finalize') || lower.includes('call_paid') || lower.includes('burn') || lower.includes('freeze') || lower.includes('thaw'))
    return 'generic-write';
  return 'generic-read';
}

export function classifyToolCardCoverage(toolName: string): ToolCardCoverageKind {
  return toolAdapters.has(toolName) ? 'specialized' : resolveGenericCardCoverage(toolName);
}

export function buildToolCardCoverageReport(toolNames: readonly string[]): ToolCardCoverageReport {
  const uniqueToolNames = [...new Set(toolNames)].sort();
  const byCoverage: Record<ToolCardCoverageKind, number> = {
    specialized: 0,
    'generic-read': 0,
    'generic-write': 0,
    'generic-build': 0,
  };
  const entries = uniqueToolNames.map((toolName): ToolCardCoverageEntry => {
    const coverage = classifyToolCardCoverage(toolName);
    byCoverage[coverage] += 1;
    return {
      toolName,
      coverage,
      specialized: coverage === 'specialized',
    };
  });

  return {
    totalTools: entries.length,
    specializedTools: byCoverage.specialized,
    genericTools: entries.length - byCoverage.specialized,
    byCoverage,
    entries,
  };
}

// ── Registry ──────────────────────────────────────────────────────────────

export class ToolCardRegistry {
  private readonly version: string;
  private readonly wallet: string;

  constructor(version: string, wallet: string) {
    this.version = version;
    this.wallet = wallet;
  }

  /**
   * Render a card for a specific tool with real result data.
   * @param toolName - Tool name (e.g. 'sol_get_balance')
   * @param data - Real tool result data
   */
  render(toolName: string, data: ToolResultData = {}): string {
    const meta: CardMeta = { toolName, version: this.version, wallet: this.wallet };
    const adapter = toolAdapters.get(toolName) ?? resolveGenericAdapter(toolName);
    return adapter(data, meta);
  }

  /**
   * Render cards for multiple tools with their data.
   */
  renderMany(entries: Array<{ toolName: string; data?: ToolResultData }>): string[] {
    return entries.map(e => this.render(e.toolName, e.data ?? {}));
  }

  /**
   * List all tools that have specific (non-generic) adapters.
   */
  specializedTools(): string[] {
    return Array.from(toolAdapters.keys()).sort();
  }
}
