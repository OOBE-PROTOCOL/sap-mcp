/**
 * @name ui/runtime-logo-resolver
 * @description Runtime favicon fetcher with in-memory + filesystem cache.
 *
 * Instead of shipping static logo files in the repo, this resolver fetches
 * favicons from each protocol's website at runtime, caches them to disk,
 * and serves them from the SAP MCP server's /logos/{protocol-id} endpoint.
 *
 * Resolution order:
 *   1. In-memory cache (fastest, already fetched this session)
 *   2. Filesystem cache (~/.local/share/mcp-sap/logos/{protocol-id}.{ext})
 *   3. Inline SVG fallback (initials + brand color, always available)
 *
 * @module ui/runtime-logo-resolver
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProtocolFaviconEntry {
  readonly id: string;
  readonly name: string;
  readonly website: string;
  readonly initials: string;
  readonly color: string;
  readonly inlineSvg?: string;
}

export interface ResolvedLogo {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly source: 'memory' | 'cache' | 'fetched' | 'fallback';
}

// ── Cache paths ────────────────────────────────────────────────────────────

const CACHE_DIR = process.env.SAP_LOGO_CACHE_DIR
  ?? join(homedir(), '.local', 'share', 'mcp-sap', 'logos');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

// ── In-memory cache ────────────────────────────────────────────────────────

const memoryCache = new Map<string, { buffer: Buffer; mimeType: string; fetchedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Protocol → website mapping ────────────────────────────────────────────

const faviconEntries = new Map<string, ProtocolFaviconEntry>([
  { id: 'jupiter',    name: 'Jupiter',    website: 'https://jup.ag',                  initials: 'JUP', color: '#f97316' },
  { id: 'raydium',    name: 'Raydium',    website: 'https://raydium.io',               initials: 'RAY', color: '#e94560' },
  { id: 'orca',       name: 'Orca',       website: 'https://www.orca.so',               initials: 'ORC', color: '#4f9cf9' },
  { id: 'meteora',    name: 'Meteora',    website: 'https://www.meteora.ag',           initials: 'MET', color: '#9b59b6' },
  { id: 'metaplex',   name: 'Metaplex',   website: 'https://www.metaplex.com',         initials: 'MP',  color: '#ec4899' },
  { id: 'magicblock', name: 'MagicBlock', website: 'https://magicblock.dev',           initials: 'MB',  color: '#6366f1' },
  { id: 'adrena',     name: 'Adrena',     website: 'https://app.adrena.xyz',            initials: 'ADX', color: '#8b5cf6' },
  { id: 'openbook',   name: 'OpenBook',   website: 'https://www.openbook.ag',          initials: 'OB',  color: '#3b82f6' },
  { id: 'manifest',   name: 'Manifest',    website: 'https://www.manifestapp.xyz',       initials: 'MNF', color: '#06b6d4' },
  { id: 'pump',       name: 'Pump.fun',   website: 'https://pump.fun',                 initials: 'PMP', color: '#22c55e' },
  { id: 'pyth',       name: 'Pyth',       website: 'https://pyth.network',             initials: 'PYT', color: '#fbbf24' },
  { id: 'coingecko',  name: 'CoinGecko',  website: 'https://www.coingecko.com',       initials: 'CGK', color: '#22c55e' },
  { id: 'jito',       name: 'Jito',       website: 'https://www.jito.network',         initials: 'JTO', color: '#22c55e' },
  { id: 'das',        name: 'DAS',        website: 'https://www.helius.dev',           initials: 'DAS', color: '#64748b' },
  { id: 'blinks',     name: 'Blinks',     website: 'https://dial.to',                  initials: 'BLK', color: '#f97316' },
  { id: 'gibwork',    name: 'Gibwork',    website: 'https://gib.work',                 initials: 'GIB', color: '#8b5cf6' },
  { id: 'lulo',       name: 'Lulo',       website: 'https://lulo.fi',                  initials: 'LUL', color: '#06b6d4' },
  { id: '3land',      name: '3Land',      website: 'https://3.land',                   initials: '3LD', color: '#ec4899' },
  { id: 'send_arcade',name: 'Send Arcade',website: 'https://sendarcade.fun',          initials: 'ARC', color: '#f97316' },
  { id: 'bridging',   name: 'Bridging',   website: 'https://debridge.finance',         initials: 'BRG', color: '#8b5cf6' },
  { id: 'alldomains', name: 'AllDomains', website: 'https://alldomains.id',           initials: 'AD',  color: '#06b6d4' },
  { id: 'sns',        name: 'SNS',        website: 'https://www.sns.id',              initials: 'SNS', color: '#06b6d4' },
  { id: 'solana',     name: 'Solana',    website: 'https://solana.com',              initials: 'SOL', color: '#9945FF' },
  { id: 'spl',        name: 'SPL Token',  website: 'https://solana.com',              initials: 'SPL', color: '#9945FF' },
  { id: 'staking',    name: 'Staking',   website: 'https://solana.com',              initials: 'STK', color: '#10b981' },
  { id: 'sap',        name: 'SAP MCP',   website: 'https://oobe.io',                  initials: 'SAP', color: '#06b6d4' },
  { id: 'clawpump',   name: 'ClawPump',  website: 'https://clawpump.fun',             initials: 'CLW', color: '#f97316' },
  { id: 'hermes',     name: 'Hermes',    website: 'https://hermes-agent.nousresearch.com', initials: 'HMS', color: '#64748b' },
].map(p => [p.id, p] as const));

// ── Public API ────────────────────────────────────────────────────────────

export function registerFaviconEntry(entry: ProtocolFaviconEntry): void {
  faviconEntries.set(entry.id, entry);
}

/**
 * Resolve a protocol logo as a Buffer + MIME type.
 * Fetches the favicon from the protocol's website on first access,
 * then caches it to memory + disk for subsequent requests.
 *
 * @param protocolId - e.g. 'jupiter', 'adrena', 'metaplex'
 * @returns ResolvedLogo with buffer, mimeType, and source
 */
export async function resolveFavicon(protocolId: string): Promise<ResolvedLogo> {
  const entry = faviconEntries.get(protocolId.toLowerCase());
  if (!entry) {
    return fallbackLogo(protocolId);
  }

  // 1. In-memory cache (fresh)
  const cached = memoryCache.get(protocolId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { buffer: cached.buffer, mimeType: cached.mimeType, source: 'memory' };
  }

  // 2. Filesystem cache
  ensureCacheDir();
  const cachePath = join(CACHE_DIR, `${protocolId}.png`);
  if (existsSync(cachePath)) {
    try {
      const buffer = readFileSync(cachePath);
      const mimeType = 'image/png';
      memoryCache.set(protocolId, { buffer, mimeType, fetchedAt: Date.now() });
      return { buffer, mimeType, source: 'cache' };
    } catch { /* fall through to fetch */ }
  }

  // 3. Fetch favicon from website
  try {
    const buffer = await fetchFavicon(entry.website);
    if (buffer && buffer.length > 0) {
      const mimeType = detectMimeType(buffer);
      // Write to filesystem cache
      const fetchExt = mimeType.includes('svg') ? 'svg' : mimeType.includes('ico') ? 'ico' : 'png';
      const fetchPath = join(CACHE_DIR, `${protocolId}.${fetchExt}`);
      writeFileSync(fetchPath, buffer);
      // Update memory cache
      memoryCache.set(protocolId, { buffer, mimeType, fetchedAt: Date.now() });
      return { buffer, mimeType, source: 'fetched' };
    }
  } catch {
    // Fetch failed, fall through to fallback
  }

  // 4. Fallback SVG
  return fallbackLogo(protocolId);
}

/**
 * Get the inline SVG for a protocol logo (for use in HTML cards without
 * a network request). Uses inlineSvg if available, otherwise generates
 * a fallback with initials + brand color.
 */
export function resolveLogoInline(protocolId: string): string {
  const entry = faviconEntries.get(protocolId.toLowerCase());
  if (!entry) {
    return generateFallbackSvg(protocolId.slice(0, 3).toUpperCase(), '#64748b');
  }
  if (entry.inlineSvg) return entry.inlineSvg;
  return generateFallbackSvg(entry.initials, entry.color);
}

/**
 * List all registered protocol IDs.
 */
export function listProtocols(): string[] {
  return Array.from(faviconEntries.keys()).sort();
}

// ── Internal helpers ──────────────────────────────────────────────────────

async function fetchFavicon(website: string): Promise<Buffer | null> {
  // Try Google's favicon service first (reliable, caches well)
  const googleUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(website)}&sz=64`;
  try {
    const resp = await fetch(googleUrl, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > 100) return buf; // Skip tiny/empty responses
    }
  } catch { /* try direct */ }

  // Try direct favicon fetch
  const faviconUrl = new URL('/favicon.ico', website).href;
  try {
    const resp = await fetch(faviconUrl, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > 100) return buf;
    }
  } catch { /* try /favicon.png */ }

  // Try /favicon.png
  const pngUrl = new URL('/favicon.png', website).href;
  try {
    const resp = await fetch(pngUrl, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > 100) return buf;
    }
  } catch { /* give up */ }

  return null;
}

function detectMimeType(buffer: Buffer): string {
  if (buffer.length >= 4) {
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    // SVG: starts with <svg or <?xml
    const head = buffer.subarray(0, 50).toString('utf8').trim();
    if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml';
    // ICO: 00 00 01 00
    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return 'image/x-icon';
    // WebP: RIFF....WEBP
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  }
  return 'image/png'; // default
}

function generateFallbackSvg(initials: string, color: string): string {
  const fontSize = initials.length > 2 ? 9 : 14;
  return `<svg width="16" height="16" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="${color}" opacity="0.85"/><text x="20" y="27" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="white">${initials}</text></svg>`;
}

function fallbackLogo(protocolId: string): ResolvedLogo {
  const entry = faviconEntries.get(protocolId.toLowerCase());
  const initials = entry?.initials ?? protocolId.slice(0, 3).toUpperCase();
  const color = entry?.color ?? '#64748b';
  const svg = generateFallbackSvg(initials, color);
  return { buffer: Buffer.from(svg, 'utf8'), mimeType: 'image/svg+xml', source: 'fallback' };
}