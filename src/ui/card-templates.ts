/**
 * @name ui/card-templates
 * @description HTML card templates for MCP Apps UI resources.
 *
 * Bento grid layout: variable-size cards (compact stat, wide detail, hero).
 * Colors only on numbers (PnL green/red, balance cyan, cost amber).
 * Labels neutral. No badges. No overflow — everything visible.
 *
 * @module ui/card-templates
 */

const C = {
  bg: '#080e18',
  surface: 'rgba(255,255,255,0.01)',
  border: 'rgba(255,255,255,0.03)',
  borderHover: 'rgba(255,255,255,0.06)',
  accent: 'hsl(190,85%,55%)',
  text: '#eaeef2',
  textDim: 'hsl(210,10%,55%)',
  textMuted: 'hsl(210,8%,38%)',
  success: 'hsl(155,65%,52%)',
  warning: 'hsl(35,90%,55%)',
  danger: 'hsl(0,75%,60%)',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
} as const;

const SAP_LOGO = `<svg width="32" height="32" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="sapg" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
<stop stop-color="#00F0FF"/><stop offset="0.5" stop-color="#0097A7"/><stop offset="1" stop-color="#05101F"/></linearGradient></defs>
<rect width="200" height="200" rx="48" fill="url(#sapg)"/>
<path d="M125 30 C 95 30 75 55 75 85 C 75 115 105 125 125 145 C 105 165 75 175 75 185" stroke="white" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M40 105 L 55 105 L 60 85 L 70 125 L 80 95 L 90 115" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/></svg>`;

// logoBaseUrl removed — all logos are now inline base64 data URIs (see logos.ts)

import {
  SOL_LOGO_URI,
  USDC_LOGO_URI,
  USDT_LOGO_URI,
  JUPITER_LOGO_URI,
  ORCA_LOGO_URI,
  RAYDIUM_LOGO_URI,
  METEORA_LOGO_URI,
  ADRENA_LOGO_URI,
  MAGICBLOCK_LOGO_URI,
  METAPLEX_LOGO_URI,
} from './logos.js';

/**
 * Returns an <img> tag with the real protocol logo as a base64 data URI.
 * Falls back to a colored circle with initials if the protocol is unknown.
 */
function pLogo(name: string, initials: string, color: string): string {
  const k = name.toLowerCase();
  const known: Record<string, string> = {
    jupiter: JUPITER_LOGO_URI,
    orca: ORCA_LOGO_URI,
    raydium: RAYDIUM_LOGO_URI,
    meteora: METEORA_LOGO_URI,
    adrena: ADRENA_LOGO_URI,
    magicblock: MAGICBLOCK_LOGO_URI,
    metaplex: METAPLEX_LOGO_URI,
  };
  const uri = known[k];
  if (uri) return `<img src="${uri}" alt="${esc(name)}" style="width:16px;height:16px;border-radius:4px;object-fit:cover">`;
  return `<svg width="14" height="14" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="${color}" opacity="0.85"/><text x="20" y="27" text-anchor="middle" font-family="sans-serif" font-size="${initials.length>2?9:14}" font-weight="700" fill="white">${esc(initials)}</text></svg>`;
}

function tLogo(symbol: string): string {
  const k = symbol.toUpperCase();
  const known: Record<string, string> = { SOL: SOL_LOGO_URI, USDC: USDC_LOGO_URI, USDT: USDT_LOGO_URI };
  const uri = known[k];
  if (uri) return `<img src="${uri}" alt="${esc(k)}" style="width:12px;height:12px;border-radius:3px;object-fit:cover;vertical-align:middle;margin-right:2px">`;
  return pLogo(symbol, k.slice(0, 3), C.textMuted);
}
function esc(t: string): string { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function short(a: string): string { return a.length<=12 ? esc(a) : `${esc(a.slice(0,4))}...${esc(a.slice(-4))}`; }

// ── CSS (shared, compact, no overflow) ────────────────────────────────────

const CSS = `*{margin:0;padding:0;box-sizing:border-box}
body{background:${C.bg};color:${C.text};font-family:${C.sans};font-size:12px;line-height:1.4;-webkit-font-smoothing:antialiased}
.c{background:${C.surface};border:1px solid ${C.border};border-radius:12px;overflow:hidden;position:relative;backdrop-filter:blur(20px) saturate(130%);-webkit-backdrop-filter:blur(20px) saturate(130%);transition:border-color .2s;display:flex;flex-direction:column;height:100%}
.c:hover{border-color:${C.borderHover}}
.c::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)}
.h{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid ${C.border}}
.hl{width:28px;height:28px;border-radius:7px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.hl svg{width:28px;height:28px}.hl img{width:28px;height:28px;border-radius:7px;object-fit:cover}
.ht{font-size:12px;font-weight:600;color:${C.text};letter-spacing:-0.01em}
.hs{font-size:9px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.05em;margin-top:1px}
.hp{width:18px;height:18px;opacity:0.3;margin-left:auto;flex-shrink:0}
.hp svg{width:18px;height:18px}
.b{padding:10px 14px;flex:1 1 auto}
.r{display:flex;justify-content:space-between;align-items:center;padding:5px 0}
.r+.r{border-top:1px solid rgba(255,255,255,0.02)}
.rl{font-size:10px;color:${C.textMuted};font-weight:500;display:flex;align-items:center;gap:4px}
.rv{font-family:${C.mono};font-size:12px;font-weight:600;color:${C.text}}
.rv.a{color:${C.text}}.rv.s{color:${C.success}}.rv.w{color:${C.warning}}.rv.d{color:${C.danger}}
.rv.lg{font-size:24px;font-weight:700}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:0}
.g2 .r{padding:5px 0}.g2 .r:nth-child(2n){padding-left:10px}.g2 .r:nth-child(2n-1){padding-right:10px}
.f{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-top:1px solid ${C.border};background:rgba(0,0,0,0.1);font-size:9px;color:${C.textMuted};font-family:${C.mono};flex-shrink:0}
.fl{display:flex;align-items:center;gap:4px}.fr{color:${C.textDim}}
.dot{width:4px;height:4px;border-radius:50%;background:${C.text};box-shadow:0 0 3px ${C.textMuted}}
.stat{padding:10px 14px;text-align:center}
.stat-v{font-family:${C.mono};font-size:26px;font-weight:700}
.stat-l{font-size:10px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.06em;margin-top:3px}
.tag{display:inline-block;padding:2px 7px;border-radius:5px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);font-size:9px;color:${C.textDim};font-family:${C.mono};margin:1px}`;

function shell(title: string, body: string, fv: string, fw: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="c">${body}<div class="f"><span class="fl"><span class="dot"></span> SAP MCP v${esc(fv)}</span><span class="fr">${esc(fw)}</span></div></div></body></html>`;
}

function hdr(t: string, s: string, logo: string = SAP_LOGO): string {
  const b = SAP_LOGO.replace('width="32" height="32"', 'width="18" height="18"');
  return `<div class="h"><div class="hl">${logo}</div><div><div class="ht">${esc(t)}</div><div class="hs">${esc(s)}</div></div><div class="hp">${b}</div></div>`;
}

function r(label: string, value: string, vc?: string, icon?: string): string {
  const cls = vc ? ` ${vc}` : '';
  const ic = icon ? `<span style="display:flex;align-items:center;flex-shrink:0">${icon}</span>` : '';
  return `<div class="r"><span class="rl">${ic}${esc(label)}</span><span class="rv${cls}">${value}</span></div>`;
}

// ── Cards (compact, variable size, colors on numbers only) ────────────────

export function renderBalanceCard(d: { sol: number; usdc?: number; walletAddress: string; network: string; version: string }): string {
  // Hero stat card: big SOL number, small USDC below
  const usdcRow = d.usdc !== undefined ? `<div class="r" style="margin-top:6px"><span class="rl">${tLogo('USDC')}USDC</span><span class="rv">${d.usdc.toFixed(2)}</span></div>` : '';
  const body = hdr('Wallet Balance', d.network) + `<div class="b"><div class="stat" style="padding:8px 0 4px"><div class="stat-v">${d.sol.toFixed(4)}</div><div class="stat-l">${tLogo('SOL')} SOL</div></div>${usdcRow}<div class="r" style="margin-top:4px"><span class="rl">Wallet</span><span class="rv" style="font-size:10px">${short(d.walletAddress)}</span></div></div>`;
  return shell('Wallet Balance', body, d.version, short(d.walletAddress));
}

export function renderReadinessCard(d: {
  status: 'ready' | 'degraded' | 'not-ready'; signerPublicKey?: string; sol?: number; usdc?: number;
  profile: string; canPayX402: boolean; canExecuteWriteTools: boolean;
  issues: readonly string[]; version: string; walletAddress?: string;
}): string {
  const color = d.status === 'ready' ? C.success : d.status === 'degraded' ? C.warning : C.danger;
  const rows = [
    r('Profile', esc(d.profile)),
    r('SOL', d.sol !== undefined ? d.sol.toFixed(4) : '—'),
    r('x402', d.canPayX402 ? 'enabled' : 'disabled', d.canPayX402 ? 's' : 'd'),
    r('Write', d.canExecuteWriteTools ? 'enabled' : 'disabled', d.canExecuteWriteTools ? 's' : 'd'),
  ];
  let extra = '';
  if (d.issues.length > 0) extra = `<div style="margin-top:6px;font-size:10px;color:${C.warning}">${d.issues.map(i => `<div style="padding:1px 0">${esc(i)}</div>`).join('')}</div>`;
  const body = hdr('Payment Bridge', d.profile) + `<div class="b"><div class="stat" style="padding:4px 0 8px"><div class="stat-v" style="color:${color};font-size:16px">${d.status}</div></div><div class="g2">${rows.join('')}</div>${extra}</div>`;
  return shell('Payment Bridge', body, d.version, d.walletAddress ? short(d.walletAddress) : d.profile);
}

export function renderPositionCard(d: {
  market: string; side: 'long' | 'short'; size: number; entryPrice: number;
  markPrice: number; leverage: number; pnlUsd: number; pnlPct: number;
  liquidationPrice?: number; version: string; walletAddress?: string;
}): string {
  const pnlColor = d.pnlUsd >= 0 ? 's' : 'd';
  const ps = d.pnlUsd >= 0 ? '+' : '-';
  const pa = Math.abs(d.pnlUsd); const pp = Math.abs(d.pnlPct);
  const adx = pLogo('adrena', 'ADX', '#8b5cf6');
  const rows = [
    r('Side', d.side.toUpperCase(), d.side === 'long' ? 's' : 'd'),
    r('Lev', `${d.leverage}x`),
    r('Entry', `$${d.entryPrice.toFixed(2)}`),
    r('Mark', `$${d.markPrice.toFixed(2)}`),
    r('Size', `$${d.size.toFixed(2)}`),
    r('Liq.', d.liquidationPrice !== undefined ? `$${d.liquidationPrice.toFixed(2)}` : '—', 'w'),
  ];
  const body = hdr('Perp Position', d.market, adx) + `<div class="b"><div class="stat" style="padding:4px 0 8px"><div class="stat-v ${pnlColor} lg">${ps}$${pa.toFixed(2)}</div><div class="stat-l">${ps}${pp.toFixed(2)}% PnL</div></div><div class="g2">${rows.join('')}</div></div>`;
  return shell('Perp Position', body, d.version, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderPricingCard(d: {
  toolName: string; tier: string; priceUsd: number; recommendedMaxPriceUsd: number;
  isFree: boolean; version: string; walletAddress?: string;
}): string {
  const price = d.isFree ? 'FREE' : `$${d.priceUsd.toFixed(6)}`;
  const priceColor = d.isFree ? 's' : '';
  const cap = d.isFree ? '' : r('Max Cap', `$${d.recommendedMaxPriceUsd.toFixed(6)}`, 'w');
  const body = hdr('Tool Pricing', d.toolName) + `<div class="b"><div class="stat" style="padding:8px 0"><div class="stat-v ${priceColor} lg">${price}</div><div class="stat-l">${esc(d.tier)}</div></div>${cap}</div>`;
  return shell('Tool Pricing', body, d.version, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderTransferCard(d: {
  type: 'sol' | 'spl'; amount: number; symbol: string; from: string; to: string;
  signature?: string; status: 'confirmed' | 'pending' | 'failed'; version: string; walletAddress?: string;
}): string {
  const sc = d.status === 'confirmed' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const rows = [
    r('From', short(d.from)),
    r('To', short(d.to)),
    r('Status', d.status, sc),
  ];
  if (d.signature) rows.push(r('Sig', short(d.signature)));
  const body = hdr('Transfer', `${d.type.toUpperCase()} Transfer`) + `<div class="b"><div class="stat" style="padding:4px 0 8px"><div class="stat-v lg">${d.amount.toFixed(4)}</div><div class="stat-l">${tLogo(d.symbol)} ${esc(d.symbol)}</div></div><div class="g2">${rows.join('')}</div></div>`;
  return shell('Transfer', body, d.version, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderMagicBlockCard(d: {
  action: 'swap' | 'deposit' | 'withdraw' | 'transfer'; tokenIn?: string; tokenOut?: string;
  amountIn?: number; amountOut?: number; status: 'success' | 'pending' | 'failed';
  visibility?: 'public' | 'private'; version: string; walletAddress?: string;
}): string {
  const sc = d.status === 'success' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const mb = pLogo('magicblock', 'MB', '#6366f1');
  const rows = [r('Action', d.action.toUpperCase())];
  if (d.visibility) rows.push(r('Vis', d.visibility));
  if (d.tokenIn && d.amountIn !== undefined) rows.push(r('In', `${d.amountIn.toFixed(4)} ${esc(d.tokenIn)}`));
  if (d.tokenOut && d.amountOut !== undefined) rows.push(r('Out', `${d.amountOut.toFixed(4)} ${esc(d.tokenOut)}`));
  rows.push(r('Status', d.status, sc));
  const body = hdr('MagicBlock', d.action, mb) + `<div class="b"><div class="g2">${rows.join('')}</div></div>`;
  return shell('MagicBlock', body, d.version, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderMetaplexCard(d: {
  action: 'mint' | 'deploy' | 'update' | 'verify'; collectionName?: string;
  nftName?: string; mintAddress?: string; status: 'success' | 'pending' | 'failed';
  version: string; walletAddress?: string;
}): string {
  const sc = d.status === 'success' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const mp = pLogo('metaplex', 'MP', '#ec4899');
  const rows = [r('Action', d.action.toUpperCase()), r('Status', d.status, sc)];
  if (d.collectionName) rows.push(r('Collection', esc(d.collectionName)));
  if (d.nftName) rows.push(r('NFT', esc(d.nftName)));
  if (d.mintAddress) rows.push(r('Mint', short(d.mintAddress)));
  const body = hdr('Metaplex', d.action, mp) + `<div class="b"><div class="g2">${rows.join('')}</div></div>`;
  return shell('Metaplex NFT', body, d.version, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderJupiterSwapCard(d: {
  tokenIn: string; tokenOut: string; amountIn: number; amountOut: number;
  priceImpactPct: number; route: string[]; status: 'success' | 'pending' | 'failed';
  version: string; walletAddress?: string;
}): string {
  const sc = d.status === 'success' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const pi = d.priceImpactPct < 0.5 ? 's' : d.priceImpactPct < 2 ? 'w' : 'd';
  const jp = pLogo('jupiter', 'JUP', '#f97316');
  const rows = [
    r('In', `${d.amountIn.toFixed(4)} ${esc(d.tokenIn)}`),
    r('Out', `${d.amountOut.toFixed(4)} ${esc(d.tokenOut)}`),
    r('Impact', `${d.priceImpactPct.toFixed(3)}%`, pi),
    r('Status', d.status, sc),
  ];
  const routeRow = `<div class="r" style="margin-top:4px"><span class="rl">Route</span><span class="rv" style="font-size:10px">${esc(d.route.join(' -> '))}</span></div>`;
  const body = hdr('Jupiter Swap', `${d.tokenIn} -> ${d.tokenOut}`, jp) + `<div class="b"><div class="g2">${rows.join('')}</div>${routeRow}</div>`;
  return shell('Jupiter Swap', body, d.version, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderAgentRegistryCard(d: {
  agentName: string; agentId?: string; capabilities: string[]; protocols: string[];
  isActive: boolean; registeredAt?: string; version: string; walletAddress?: string;
}): string {
  const rows = [
    r('Status', d.isActive ? 'active' : 'inactive', d.isActive ? 's' : 'd'),
    r('Caps', `${d.capabilities.length}`),
  ];
  if (d.agentId) rows.push(r('ID', short(d.agentId)));
  if (d.registeredAt) rows.push(r('Since', esc(d.registeredAt)));
  const tags = `<div style="margin-top:4px">${d.protocols.map(p => `<span class="tag">${esc(p)}</span>`).join(' ')}</div>`;
  const body = hdr('Agent Registry', d.agentName) + `<div class="b"><div class="g2">${rows.join('')}</div>${tags}</div>`;
  return shell('Agent Registry', body, d.version, d.walletAddress ? short(d.walletAddress) : '');
}