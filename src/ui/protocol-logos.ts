/**
 * @name ui/protocol-logos
 * @description Centralized protocol + token logo registry with runtime resolution.
 *
 * Every protocol and token has a canonical logo entry. Logos are resolved in
 * this order:
 *   1. Inline SVG (for known tokens: SOL, USDC, USDT, wSOL)
 *   2. Hosted URL (for protocols with logos on mcp.sap.oobeprotocol.ai/logos/)
 *   3. Generated fallback SVG with initials + brand color
 *
 * The registry is extensible: new protocols can be added at runtime via
 * `registerProtocol()` or `registerToken()`.
 *
 * @module ui/protocol-logos
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProtocolLogoEntry {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly color: string;
  readonly hostedFile?: string;
  readonly inlineSvg?: string;
}

export interface TokenLogoEntry {
  readonly symbol: string;
  readonly mint?: string;
  readonly color: string;
  readonly inlineSvg?: string;
}

// ── Inline SVGs for major tokens ───────────────────────────────────────────

const SOL_SVG = `<svg width="14" height="14" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="#9945FF"/><path d="M8 13h19c1.3 0 2 1.6 1 2.6L8 27h19c1.3 0 2 1.6 1 2.6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M12 20h19c1.3 0 2 1.6 1 2.6L12 34" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.5"/></svg>`;

const USDC_SVG = `<svg width="14" height="14" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="#2775CA"/><text x="20" y="28" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="700" fill="white">$</text></svg>`;

const USDT_SVG = `<svg width="14" height="14" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="#26A17B"/><text x="20" y="28" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="white">T</text></svg>`;

const WSOL_SVG = `<svg width="14" height="14" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="#9945FF"/><text x="20" y="27" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="700" fill="white">wSOL</text></svg>`;

// ── Token Registry ─────────────────────────────────────────────────────────

const tokens = new Map<string, TokenLogoEntry>([
  ['SOL', { symbol: 'SOL', color: '#9945FF', inlineSvg: SOL_SVG }],
  ['USDC', { symbol: 'USDC', color: '#2775CA', inlineSvg: USDC_SVG }],
  ['USDT', { symbol: 'USDT', color: '#26A17B', inlineSvg: USDT_SVG }],
  ['WSOL', { symbol: 'WSOL', color: '#9945FF', inlineSvg: WSOL_SVG }],
]);

// ── Protocol Registry ──────────────────────────────────────────────────────

const protocols = new Map<string, ProtocolLogoEntry>([
  { id: 'jupiter',   name: 'Jupiter',   initials: 'JUP', color: '#f97316' },
  { id: 'raydium',    name: 'Raydium',    initials: 'RAY', color: '#e94560' },
  { id: 'orca',       name: 'Orca',       initials: 'ORC', color: '#4f9cf9' },
  { id: 'meteora',    name: 'Meteora',    initials: 'MET', color: '#9b59b6' },
  { id: 'hermes',     name: 'Hermes',    initials: 'HMS', color: '#64748b' },
  { id: 'claude',     name: 'Claude',    initials: 'CLD', color: '#d4a574' },
  { id: 'adrena',     name: 'Adrena',    initials: 'ADX', color: '#8b5cf6' },
  { id: 'metaplex',   name: 'Metaplex',  initials: 'MP',  color: '#ec4899' },
  { id: 'magicblock', name: 'MagicBlock', initials: 'MB', color: '#6366f1' },
  { id: 'openbook',   name: 'OpenBook',  initials: 'OB',  color: '#3b82f6' },
  { id: 'manifest',   name: 'Manifest',  initials: 'MNF', color: '#06b6d4' },
  { id: 'pump',       name: 'Pump.fun',  initials: 'PMP', color: '#22c55e' },
  { id: 'pyth',       name: 'Pyth',       initials: 'PYT', color: '#fbbf24' },
  { id: 'coingecko',  name: 'CoinGecko', initials: 'CGK', color: '#22c55e' },
  { id: 'jito',       name: 'Jito',       initials: 'JTO', color: '#22c55e' },
  { id: 'das',        name: 'DAS',        initials: 'DAS', color: '#64748b' },
  { id: 'blinks',     name: 'Blinks',     initials: 'BLK', color: '#f97316' },
  { id: 'gibwork',    name: 'Gibwork',    initials: 'GIB', color: '#8b5cf6' },
  { id: 'lulo',       name: 'Lulo',       initials: 'LUL', color: '#06b6d4' },
  { id: '3land',      name: '3Land',      initials: '3LD', color: '#ec4899' },
  { id: 'send_arcade',name: 'Send Arcade', initials: 'ARC', color: '#f97316' },
  { id: 'solana',     name: 'Solana',    initials: 'SOL', color: '#9945FF' },
  { id: 'spl',        name: 'SPL Token', initials: 'SPL', color: '#9945FF' },
  { id: 'staking',    name: 'Staking',   initials: 'STK', color: '#10b981' },
  { id: 'sns',        name: 'SNS',        initials: 'SNS', color: '#06b6d4' },
  { id: 'alldomains', name: 'AllDomains', initials: 'AD',  color: '#06b6d4' },
  { id: 'bridging',   name: 'Bridging',  initials: 'BRG', color: '#8b5cf6' },
  { id: 'sap',        name: 'SAP MCP',   initials: 'SAP', color: '#06b6d4' },
  { id: 'clawpump',    name: 'ClawPump',  initials: 'CLW', color: '#f97316' },
  { id: 'synapse',     name: 'Synapse',  initials: 'SYN', color: '#8b5cf6' },
  { id: 'magicblock', name: 'MagicBlock', initials: 'MB', color: '#6366f1' },
  { id: 'metaplex',   name: 'Metaplex',  initials: 'MP',  color: '#ec4899' },
].map(p => [p.id, p] as const));

// ── Public API ────────────────────────────────────────────────────────────

export function registerProtocol(entry: ProtocolLogoEntry): void {
  protocols.set(entry.id, entry);
}

export function registerToken(entry: TokenLogoEntry): void {
  tokens.set(entry.symbol.toUpperCase(), entry);
}

/**
 * Resolve a protocol logo as inline HTML (SVG or img tag with onerror fallback).
 * @param protocolId - e.g. 'jupiter', 'adrena', 'metaplex'
 * @returns HTML string with logo + onerror fallback
 */
export function resolveProtocolLogo(protocolId: string): string {
  const entry = protocols.get(protocolId.toLowerCase());
  if (!entry) {
    return generateFallback(protocolId.slice(0, 3).toUpperCase(), '#64748b');
  }
  // Inline SVG takes priority (no network needed)
  if (entry.inlineSvg) return entry.inlineSvg;
  // Always use generated SVG fallback (no hosted files, no network)
  return generateFallback(entry.initials, entry.color);
}

/**
 * Resolve a token logo as inline HTML.
 * @param symbol - e.g. 'SOL', 'USDC', 'USDT'
 */
export function resolveTokenLogo(symbol: string): string {
  const entry = tokens.get(symbol.toUpperCase());
  if (entry?.inlineSvg) return entry.inlineSvg;
  // Unknown token: generate fallback
  return generateFallback(symbol.slice(0, 3).toUpperCase(), '#64748b');
}

/**
 * Generate a fallback SVG logo with initials + brand color.
 */
function generateFallback(initials: string, color: string): string {
  const fontSize = initials.length > 2 ? 9 : 14;
  return `<svg width="14" height="14" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="${color}" opacity="0.85"/><text x="20" y="27" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="white">${escapeHtml(initials)}</text></svg>`;
}

function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Resolve which protocol a tool belongs to based on its name.
 * @param toolName - e.g. 'jupiter_swap', 'sap_adrena_get_markets', 'sol_get_balance'
 */
export function resolveProtocolFromToolName(toolName: string): string {
  const lower = toolName.toLowerCase().replace(/^mcp__sap__/, '').replace(/^sap_/, '');

  // Check direct protocol prefixes
  const directPrefixes = ['jupiter_', 'raydium_', 'orca_', 'meteora_', 'metaplex_', 'magicblock_', 'openbook_', 'manifest_', 'pump_', 'pyth_', 'coingecko_', 'jito_', 'das_', 'blinks_', 'gibwork_', 'lulo_', '3land_', 'send_arcade_', 'bridging_', 'alldomains_', 'sns_'];
  for (const prefix of directPrefixes) {
    if (lower.startsWith(prefix)) return prefix.replace(/_$/, '');
  }

  // sap_adrena_* -> adrena
  if (lower.startsWith('adrena')) return 'adrena';

  // sol_* -> solana
  if (lower.startsWith('sol_')) return 'solana';

  // spl_* -> spl
  if (lower.startsWith('spl_')) return 'spl';

  // staking_* -> staking
  if (lower.startsWith('staking_') || lower.includes('stake')) return 'staking';

  // Everything else is SAP generic
  return 'sap';
}