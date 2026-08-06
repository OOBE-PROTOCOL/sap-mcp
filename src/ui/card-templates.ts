/**
 * @name ui/card-templates
 * @description HTML card templates for MCP Apps UI resources.
 *
 * Each template is a self-contained HTML document rendered inside a sandboxed
 * iframe by MCP clients that support the `ui://` resource scheme (MCP Apps
 * extension, standardized November 2025, spec version 2026-07-28).
 *
 * Logos are resolved via a hybrid system:
 * - Protocol logos present in assets/logos/ → absolute URL to the hosted server
 * - Token logos (SOL, USDC, etc.) → inline SVG with official brand colors
 * - Unknown tokens/protocols → inline SVG fallback with initials + brand color
 *
 * @module ui/card-templates
 */

// ── Brand ─────────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0e14',
  surface: '#111827',
  surface2: '#0d1421',
  border: '#1f2937',
  borderDim: '#161e2e',
  accent: '#06b6d4',
  accentDim: '#0e7490',
  text: '#e5e7eb',
  textDim: '#9ca3af',
  textMuted: '#6b7280',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const;

/** Base URL for hosted logo assets. Overridden at render time when available. */
let logoBaseUrl = 'https://mcp.sap.oobeprotocol.ai';

/**
 * @name setLogoBaseUrl
 * @description Sets the base URL for resolving hosted logo assets (e.g.
 * `https://mcp.sap.oobeprotocol.ai/logos/jupiter.ico`). Called once at server
 * startup or when the hosted URL is known.
 */
export function setLogoBaseUrl(url: string): void {
  logoBaseUrl = url.replace(/\/$/, '');
}

// ── SAP Logo (inline SVG) ─────────────────────────────────────────────────

const SAP_LOGO = `<svg width="32" height="32" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="sapg" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
<stop stop-color="#22d3ee"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
<rect width="200" height="200" rx="44" fill="url(#sapg)"/>
<path d="M125 30 C 95 30 75 55 75 85 C 75 115 105 125 125 145 C 105 165 75 175 75 185" stroke="white" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M40 105 L 55 105 L 60 85 L 70 125 L 80 95 L 90 115" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/>
</svg>`;

// ── Token Logos (inline SVG with official brand colors) ───────────────────

const TOKEN_LOGOS: Record<string, string> = {
  SOL: `<svg width="20" height="20" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="#9945FF"/><path d="M9 14h17.5c1.4 0 2.1 1.7 1.1 2.7L9 27h17.5c1.4 0 2.1 1.7 1.1 2.7" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M14 20h17.5c1.4 0 2.1 1.7 1.1 2.7L14 33" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6"/></svg>`,
  USDC: `<svg width="20" height="20" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="#2775CA"/><text x="20" y="27" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="16" font-weight="700" fill="white">$</text></svg>`,
  USDT: `<svg width="20" height="20" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="#26A17B"/><text x="20" y="27" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="700" fill="white">T</text></svg>`,
  WSOL: `<svg width="20" height="20" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="#9945FF"/><text x="20" y="27" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10" font-weight="700" fill="white">wSOL</text></svg>`,
  EPjFWdd5: `<svg width="20" height="20" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="#2775CA"/><text x="20" y="27" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="16" font-weight="700" fill="white">$</text></svg>`,
};

// ── Protocol Logos ────────────────────────────────────────────────────────

/** Maps protocol names to hosted logo URLs (files in assets/logos/). */
const HOSTED_LOGOS: Record<string, { filename: string; contentType: string }> = {
  jupiter: { filename: 'jupiter.ico', contentType: 'image/x-icon' },
  raydium: { filename: 'raydium.ico', contentType: 'image/x-icon' },
  orca: { filename: 'orca.ico', contentType: 'image/x-icon' },
  meteora: { filename: 'meteora.png', contentType: 'image/png' },
  hermes: { filename: 'hermes.png', contentType: 'image/png' },
  claude: { filename: 'claude.png', contentType: 'image/png' },
  codex: { filename: 'codex.webp', contentType: 'image/webp' },
  openclaw: { filename: 'openclaw.svg', contentType: 'image/svg+xml' },
  smithery: { filename: 'smithery.svg', contentType: 'image/svg+xml' },
  mcp: { filename: 'mcp.svg', contentType: 'image/svg+xml' },
};

/** Protocol logo as <img> tag pointing to hosted asset, or inline SVG fallback. */
function protocolLogo(name: string, fallbackInitials: string, fallbackColor: string): string {
  const key = name.toLowerCase();
  const hosted = HOSTED_LOGOS[key];
  if (hosted) {
    return `<img class="icon" src="${logoBaseUrl}/logos/${hosted.filename}" alt="${esc(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="icon-fallback" style="display:none;width:20px;height:20px;border-radius:6px;background:${fallbackColor};align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;flex-shrink:0">${esc(fallbackInitials)}</span>`;
  }
  return inlineLogo(fallbackInitials, fallbackColor);
}

/** Inline SVG logo fallback with initials + brand color. */
function inlineLogo(initials: string, color: string): string {
  return `<svg width="20" height="20" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="8" fill="${color}"/><text x="20" y="27" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${initials.length > 2 ? 10 : 14}" font-weight="700" fill="white">${esc(initials)}</text></svg>`;
}

/** Token logo: inline SVG for known tokens, fallback for unknown. */
function tokenLogo(symbol: string, mintAddress?: string): string {
  const key = symbol.toUpperCase();
  if (TOKEN_LOGOS[key]) return TOKEN_LOGOS[key];
  // Try mint address prefix (for USDC etc.)
  if (mintAddress && TOKEN_LOGOS[mintAddress.slice(0, 8)]) return TOKEN_LOGOS[mintAddress.slice(0, 8)];
  // Fallback: first letter + deterministic color from mint
  const color = mintAddress ? `#${mintAddress.slice(0, 6).padEnd(6, '0')}` : '#6b7280';
  return inlineLogo(symbol.slice(0, 3).toUpperCase(), color);
}

// ── Shell ─────────────────────────────────────────────────────────────────

function shell(title: string, body: string, footerVersion: string, footerWallet: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${C.bg};color:${C.text};font-family:${C.sans};font-size:13px;line-height:1.5;padding:14px}
.card{background:${C.surface};border:1px solid ${C.border};border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px ${C.borderDim},0 4px 24px rgba(0,0,0,0.25)}
.ch{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid ${C.border};background:linear-gradient(135deg,${C.surface} 0%,${C.surface2} 100%)}
.ch-logo{width:32px;height:32px;border-radius:8px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.ch-title{font-size:13px;font-weight:600;color:${C.text};letter-spacing:.01em}
.ch-sub{font-size:10px;color:${C.textMuted};margin-top:1px}
.ch-sap{width:20px;height:20px;margin-left:auto;opacity:0.5}
.cb{padding:14px 15px}
.row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid ${C.borderDim}}
.row:last-child{border-bottom:none}
.rl{font-size:11px;color:${C.textDim};font-weight:500;display:flex;align-items:center;gap:6px}
.rv{font-family:${C.mono};font-size:12px;color:${C.text};font-weight:600;text-align:right}
.rv.a{color:${C.accent}}
.rv.s{color:${C.success}}
.rv.w{color:${C.warning}}
.rv.d{color:${C.danger}}
.rv.p{color:${C.purple}}
.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
.badge.s{background:rgba(16,185,129,.15);color:${C.success}}
.badge.w{background:rgba(245,158,11,.15);color:${C.warning}}
.badge.d{background:rgba(239,68,68,.15);color:${C.danger}}
.badge.a{background:rgba(6,182,212,.15);color:${C.accent}}
.badge.p{background:rgba(139,92,246,.15);color:${C.purple}}
.cf{display:flex;justify-content:space-between;align-items:center;padding:8px 15px;border-top:1px solid ${C.border};font-size:9px;color:${C.textMuted}}
.cf-l{font-family:${C.mono}}
.cf-r{font-family:${C.mono};color:${C.textDim}}
.sect{font-size:9px;font-weight:600;color:${C.textMuted};text-transform:uppercase;letter-spacing:.05em;margin:10px 0 4px}
.tag{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:${C.surface2};border:1px solid ${C.border};font-size:10px;color:${C.textDim};font-family:${C.mono}}
.icon{width:16px;height:16px;flex-shrink:0;border-radius:4px}
.icon-fallback{width:16px;height:16px;flex-shrink:0;border-radius:4px}
</style>
</head>
<body>
<div class="card">
${body}
  <div class="cf">
    <span class="cf-l">SAP MCP v${esc(footerVersion)}</span>
    <span class="cf-r">${esc(footerWallet)}</span>
  </div>
</div>
</body>
</html>`;
}

function header(title: string, subtitle: string, logoSvg: string = SAP_LOGO, showSapBadge: boolean = true): string {
  const sapBadge = showSapBadge ? `<div class="ch-sap">${SAP_LOGO.replace('width="32" height="32"', 'width="20" height="20"')}</div>` : '';
  return `  <div class="ch">
    <div class="ch-logo">${logoSvg}</div>
    <div>
      <div class="ch-title">${esc(title)}</div>
      <div class="ch-sub">${esc(subtitle)}</div>
    </div>
    ${sapBadge}
  </div>`;
}

function row(label: string, value: string, vClass?: string, icon?: string): string {
  const cls = vClass ? ` ${vClass}` : '';
  const ic = icon ? `<span class="rl-icon">${icon}</span>` : '';
  return `    <div class="row"><span class="rl">${ic}${esc(label)}</span><span class="rv${cls}">${value}</span></div>`;
}

function shortAddr(a: string): string {
  return a.length <= 12 ? esc(a) : `${esc(a.slice(0,4))}...${esc(a.slice(-4))}`;
}

function esc(t: string): string {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── Card: Balance ────────────────────────────────────────────────────────

export function renderBalanceCard(d: { sol: number; usdc?: number; walletAddress: string; network: string; version: string }): string {
  const rows = [
    row('SOL', `${d.sol.toFixed(4)} SOL`, 'a', tokenLogo('SOL')),
  ];
  if (d.usdc !== undefined) rows.push(row('USDC', `${d.usdc.toFixed(2)} USDC`, '', tokenLogo('USDC')));
  rows.push(row('Network', esc(d.network)));
  rows.push(row('Wallet', shortAddr(d.walletAddress)));
  return shell('Wallet Balance', header('Wallet Balance', d.network) + `  <div class="cb">\n${rows.join('\n')}\n  </div>`, d.version, shortAddr(d.walletAddress));
}

// ── Card: Readiness ──────────────────────────────────────────────────────

export function renderReadinessCard(d: {
  status: 'ready' | 'degraded' | 'not-ready';
  signerPublicKey?: string;
  sol?: number; usdc?: number;
  profile: string;
  canPayX402: boolean; canExecuteWriteTools: boolean;
  issues: readonly string[];
  version: string;
  walletAddress?: string;
}): string {
  const sc = d.status === 'ready' ? 's' : d.status === 'degraded' ? 'w' : 'd';
  const badge = `<span class="badge ${sc}">${d.status}</span>`;
  const rows = [
    row('Status', badge),
    row('Profile', esc(d.profile)),
  ];
  if (d.signerPublicKey) rows.push(row('Signer', shortAddr(d.signerPublicKey)));
  if (d.sol !== undefined) rows.push(row('SOL', d.sol.toFixed(4), 'a', tokenLogo('SOL')));
  if (d.usdc !== undefined) rows.push(row('USDC', `${d.usdc.toFixed(2)} USDC`, '', tokenLogo('USDC')));
  rows.push(row('x402', d.canPayX402 ? '<span class="badge s">enabled</span>' : '<span class="badge d">disabled</span>'));
  rows.push(row('Write', d.canExecuteWriteTools ? '<span class="badge s">enabled</span>' : '<span class="badge d">disabled</span>'));
  if (d.issues.length > 0) {
    rows.push(`<div class="sect">Issues</div>`);
    for (const i of d.issues) rows.push(`<div style="font-size:10px;color:${C.warning};padding:3px 0">${esc(i)}</div>`);
  }
  return shell('Payment Bridge', header('Payment Bridge Readiness', d.profile) + `  <div class="cb">\n${rows.join('\n')}\n  </div>`, d.version, d.walletAddress ? shortAddr(d.walletAddress) : d.profile);
}

// ── Card: Position ───────────────────────────────────────────────────────

export function renderPositionCard(d: {
  market: string; side: 'long' | 'short';
  size: number; entryPrice: number; markPrice: number;
  leverage: number; pnlUsd: number; pnlPct: number;
  liquidationPrice?: number; version: string; walletAddress?: string;
}): string {
  const sc = d.side === 'long' ? 's' : 'd';
  const pc = d.pnlUsd >= 0 ? 's' : 'd';
  const ps = d.pnlUsd >= 0 ? '+' : '-';
  const pa = Math.abs(d.pnlUsd); const pp = Math.abs(d.pnlPct);
  const adxLogo = protocolLogo('adrena', 'ADX', '#8b5cf6');
  const rows = [
    row('Market', esc(d.market), 'a'),
    row('Side', `<span class="badge ${sc}">${d.side.toUpperCase()}</span>`),
    row('Size', `$${d.size.toFixed(2)}`),
    row('Leverage', `${d.leverage}x`),
    row('Entry', `$${d.entryPrice.toFixed(2)}`),
    row('Mark', `$${d.markPrice.toFixed(2)}`),
    row('PnL', `${ps}$${pa.toFixed(2)} (${ps}${pp.toFixed(2)}%)`, pc),
  ];
  if (d.liquidationPrice !== undefined) rows.push(row('Liq.', `$${d.liquidationPrice.toFixed(2)}`, 'w'));
  return shell('Perp Position', header('Perp Position', d.market, adxLogo) + `  <div class="cb">\n${rows.join('\n')}\n  </div>`, d.version, d.walletAddress ? shortAddr(d.walletAddress) : '');
}

// ── Card: Pricing ─────────────────────────────────────────────────────────

export function renderPricingCard(d: {
  toolName: string; tier: string;
  priceUsd: number; recommendedMaxPriceUsd: number;
  isFree: boolean; version: string; walletAddress?: string;
}): string {
  const tb = d.isFree ? '<span class="badge s">FREE</span>' : `<span class="badge a">${esc(d.tier)}</span>`;
  const rows = [
    row('Tool', esc(d.toolName), 'a'),
    row('Tier', tb),
  ];
  if (!d.isFree) {
    rows.push(row('Cost', `$${d.priceUsd.toFixed(6)}`));
    rows.push(row('Max Cap', `$${d.recommendedMaxPriceUsd.toFixed(6)}`, 'w'));
  }
  return shell('Tool Pricing', header('Tool Pricing', d.toolName) + `  <div class="cb">\n${rows.join('\n')}\n  </div>`, d.version, d.walletAddress ? shortAddr(d.walletAddress) : '');
}

// ── Card: Transfer ────────────────────────────────────────────────────────

export function renderTransferCard(d: {
  type: 'sol' | 'spl';
  amount: number; symbol: string;
  from: string; to: string;
  signature?: string; status: 'confirmed' | 'pending' | 'failed';
  version: string; walletAddress?: string;
  mintAddress?: string;
}): string {
  const sc = d.status === 'confirmed' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const logo = tokenLogo(d.symbol, d.mintAddress);
  const rows = [
    row('Amount', `${d.amount.toFixed(6)} ${esc(d.symbol)}`, 'a', logo),
    row('From', shortAddr(d.from)),
    row('To', shortAddr(d.to)),
    row('Status', `<span class="badge ${sc}">${d.status}</span>`),
  ];
  if (d.signature) rows.push(row('Signature', shortAddr(d.signature)));
  return shell('Transfer', header('Token Transfer', `${d.type.toUpperCase()} Transfer`) + `  <div class="cb">\n${rows.join('\n')}\n  </div>`, d.version, d.walletAddress ? shortAddr(d.walletAddress) : '');
}

// ── Card: MagicBlock ──────────────────────────────────────────────────────

export function renderMagicBlockCard(d: {
  action: 'swap' | 'deposit' | 'withdraw' | 'transfer';
  tokenIn?: string; tokenOut?: string;
  amountIn?: number; amountOut?: number;
  status: 'success' | 'pending' | 'failed';
  visibility?: 'public' | 'private';
  version: string; walletAddress?: string;
  mintIn?: string; mintOut?: string;
}): string {
  const sc = d.status === 'success' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const mbLogo = protocolLogo('magicblock', 'MB', '#6366f1');
  const rows = [
    row('Action', `<span class="badge p">${esc(d.action.toUpperCase())}</span>`),
  ];
  if (d.visibility) rows.push(row('Visibility', `<span class="badge ${d.visibility === 'private' ? 'p' : 'a'}">${d.visibility}</span>`));
  if (d.tokenIn && d.amountIn !== undefined) rows.push(row('Token In', `${d.amountIn.toFixed(4)} ${esc(d.tokenIn)}`, '', tokenLogo(d.tokenIn, d.mintIn)));
  if (d.tokenOut && d.amountOut !== undefined) rows.push(row('Token Out', `${d.amountOut.toFixed(4)} ${esc(d.tokenOut)}`, 'a', tokenLogo(d.tokenOut, d.mintOut)));
  rows.push(row('Status', `<span class="badge ${sc}">${d.status}</span>`));
  return shell('MagicBlock', header('MagicBlock Operation', d.action, mbLogo) + `  <div class="cb">\n${rows.join('\n')}\n  </div>`, d.version, d.walletAddress ? shortAddr(d.walletAddress) : '');
}

// ── Card: Metaplex NFT ─────────────────────────────────────────────────────

export function renderMetaplexCard(d: {
  action: 'mint' | 'deploy' | 'update' | 'verify';
  collectionName?: string;
  nftName?: string;
  mintAddress?: string;
  status: 'success' | 'pending' | 'failed';
  version: string; walletAddress?: string;
}): string {
  const sc = d.status === 'success' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const mpLogo = protocolLogo('metaplex', 'MP', '#ec4899');
  const rows = [
    row('Action', `<span class="badge p">${esc(d.action.toUpperCase())}</span>`),
  ];
  if (d.collectionName) rows.push(row('Collection', esc(d.collectionName)));
  if (d.nftName) rows.push(row('NFT', esc(d.nftName)));
  if (d.mintAddress) rows.push(row('Mint', shortAddr(d.mintAddress)));
  rows.push(row('Status', `<span class="badge ${sc}">${d.status}</span>`));
  return shell('Metaplex NFT', header('Metaplex NFT Operation', d.action, mpLogo) + `  <div class="cb">\n${rows.join('\n')}\n  </div>`, d.version, d.walletAddress ? shortAddr(d.walletAddress) : '');
}

// ── Card: Jupiter Swap ────────────────────────────────────────────────────

export function renderJupiterSwapCard(d: {
  tokenIn: string; tokenOut: string;
  amountIn: number; amountOut: number;
  priceImpactPct: number;
  route: string[];
  status: 'success' | 'pending' | 'failed';
  version: string; walletAddress?: string;
  mintIn?: string; mintOut?: string;
}): string {
  const sc = d.status === 'success' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const pi = d.priceImpactPct < 0.5 ? 's' : d.priceImpactPct < 2 ? 'w' : 'd';
  const jupLogo = protocolLogo('jupiter', 'JUP', '#f97316');
  const rows = [
    row('Input', `${d.amountIn.toFixed(4)} ${esc(d.tokenIn)}`, '', tokenLogo(d.tokenIn, d.mintIn)),
    row('Output', `${d.amountOut.toFixed(4)} ${esc(d.tokenOut)}`, 'a', tokenLogo(d.tokenOut, d.mintOut)),
    row('Price Impact', `${d.priceImpactPct.toFixed(3)}%`, pi),
    row('Route', esc(d.route.join(' \u2192 '))),
    row('Status', `<span class="badge ${sc}">${d.status}</span>`),
  ];
  return shell('Jupiter Swap', header('Jupiter Swap', `${d.tokenIn} \u2192 ${d.tokenOut}`, jupLogo) + `  <div class="cb">\n${rows.join('\n')}\n  </div>`, d.version, d.walletAddress ? shortAddr(d.walletAddress) : '');
}

// ── Card: Agent Registry ──────────────────────────────────────────────────

export function renderAgentRegistryCard(d: {
  agentName: string;
  agentId?: string;
  capabilities: string[];
  protocols: string[];
  isActive: boolean;
  registeredAt?: string;
  version: string; walletAddress?: string;
}): string {
  const st = d.isActive ? '<span class="badge s">active</span>' : '<span class="badge d">inactive</span>';
  const rows = [
    row('Agent', esc(d.agentName), 'a'),
    row('Status', st),
  ];
  if (d.agentId) rows.push(row('Agent ID', shortAddr(d.agentId)));
  if (d.registeredAt) rows.push(row('Registered', esc(d.registeredAt)));
  rows.push(row('Capabilities', `${d.capabilities.length}`));
  rows.push(row('Protocols', d.protocols.map(p => `<span class="tag">${esc(p)}</span>`).join(' ')));
  return shell('Agent Registry', header('SAP Agent Registry', d.agentName) + `  <div class="cb">\n${rows.join('\n')}\n  </div>`, d.version, d.walletAddress ? shortAddr(d.walletAddress) : '');
}