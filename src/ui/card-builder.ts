/**
 * @name ui/card-builder
 * @description Fluent builder for MCP Apps UI card rendering.
 *
 * CardBuilder provides a fluent API for constructing card HTML without
 * writing raw template strings in every tool. Each builder call returns
 * the builder for chaining, and `build()` produces the final HTML string.
 *
 * Usage:
 *   const html = new CardBuilder()
 *     .title('Wallet Balance')
 *     .subtitle('mainnet-beta')
 *     .version('0.9.67')
 *     .wallet('3Yfa...TjiB')
 *     .stat('2.5341', 'SOL')
 *     .row('USDC', '15.30')
 *     .row('Network', 'mainnet-beta')
 *     .build();
 *
 * @module ui/card-builder
 */

import { renderShell, type RowValueColor } from './card-shell.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CardStat {
  readonly value: string;
  readonly label: string;
  readonly color?: RowValueColor;
  readonly icon?: string;
  readonly large?: boolean;
}

export interface CardRowSpec {
  readonly label: string;
  readonly value: string;
  readonly color?: RowValueColor;
  readonly icon?: string;
  readonly raw?: boolean;
}

export interface CardTag {
  readonly label: string;
}

export interface CardFullRowSpec extends CardRowSpec {
  readonly full: true;
  readonly raw?: boolean;
}

// ── CardBuilder ────────────────────────────────────────────────────────────

export class CardBuilder {
  private _title = '';
  private _subtitle = '';
  private _logo: string | undefined;
  private _version = '';
  private _wallet = '';
  private _stats: CardStat[] = [];
  private _rows: CardRowSpec[] = [];
  private _fullRows: CardFullRowSpec[] = [];
  private _tags: string[] = [];
  private _issues: string[] = [];
  private _noGrid = false;

  title(t: string): this { this._title = t; return this; }
  subtitle(s: string): this { this._subtitle = s; return this; }
  logo(svg: string): this { this._logo = svg; return this; }
  version(v: string): this { this._version = v; return this; }
  wallet(w: string): this { this._wallet = w; return this; }

  stat(value: string, label: string, opts?: { color?: RowValueColor; icon?: string; large?: boolean }): this {
    this._stats.push({ value, label, color: opts?.color, icon: opts?.icon, large: opts?.large });
    return this;
  }

  row(label: string, value: string, opts?: { color?: RowValueColor; icon?: string; raw?: boolean }): this {
    this._rows.push({ label, value, color: opts?.color, icon: opts?.icon, raw: opts?.raw });
    return this;
  }

  fullRow(label: string, value: string, opts?: { color?: RowValueColor; icon?: string; raw?: boolean }): this {
    this._fullRows.push({ label, value, color: opts?.color, icon: opts?.icon, full: true, raw: opts?.raw });
    return this;
  }

  tags(...t: string[]): this { this._tags.push(...t); return this; }
  issues(...i: string[]): this { this._issues.push(...i); return this; }
  noGrid(): this { this._noGrid = true; return this; }

  build(): string {
    return renderShell({
      title: this._title,
      subtitle: this._subtitle,
      logo: this._logo,
      version: this._version,
      wallet: this._wallet,
      stats: this._stats,
      rows: this._rows,
      fullRows: this._fullRows,
      tags: this._tags,
      issues: this._issues,
      noGrid: this._noGrid,
    });
  }
}

// ── Macro builders (category shortcuts) ────────────────────────────────────

/**
 * Macro for creating a balance/wallet card.
 * @example
 *   balanceCard({ sol: 2.5, usdc: 15, walletAddress: '3Yfa...', network: 'mainnet-beta', version: '0.9.67' })
 */
export function balanceCard(d: { sol: number; usdc?: number; walletAddress: string; network: string; version: string }): string {
  const b = new CardBuilder().title('Wallet Balance').subtitle(d.network).version(d.version).wallet(d.walletAddress)
    .stat(d.sol.toFixed(4), 'SOL', { large: true });
  if (d.usdc !== undefined) b.row('USDC', `${d.usdc.toFixed(2)}`);
  b.row('Wallet', shortAddr(d.walletAddress));
  return b.build();
}

/**
 * Macro for creating a perp position card.
 */
export function positionCard(d: {
  market: string; side: 'long' | 'short'; size: number; entryPrice: number;
  markPrice: number; leverage: number; pnlUsd: number; pnlPct: number;
  liquidationPrice?: number; version: string; walletAddress?: string;
}): string {
  const pnlColor = d.pnlUsd >= 0 ? 's' : 'd';
  const ps = d.pnlUsd >= 0 ? '+' : '-';
  const pa = Math.abs(d.pnlUsd); const pp = Math.abs(d.pnlPct);
  return new CardBuilder()
    .title('Perp Position').subtitle(d.market).version(d.version).wallet(d.walletAddress ?? '')
    .stat(`${ps}$${pa.toFixed(2)}`, `${ps}${pp.toFixed(2)}% PnL`, { color: pnlColor, large: true })
    .row('Side', d.side.toUpperCase(), { color: d.side === 'long' ? 's' : 'd' })
    .row('Lev', `${d.leverage}x`)
    .row('Entry', `$${d.entryPrice.toFixed(2)}`)
    .row('Mark', `$${d.markPrice.toFixed(2)}`)
    .row('Size', `$${d.size.toFixed(2)}`)
    .row('Liq.', d.liquidationPrice !== undefined ? `$${d.liquidationPrice.toFixed(2)}` : '—', { color: 'w' })
    .build();
}

/**
 * Macro for creating a generic tool status card.
 * Used for tools that return simple key-value data.
 */
export function toolStatusCard(d: {
  toolName: string; status: string; version: string; walletAddress?: string;
  rows?: Array<{ label: string; value: string; color?: RowValueColor }>;
}): string {
  const b = new CardBuilder()
    .title(d.toolName).subtitle(d.status).version(d.version).wallet(d.walletAddress ?? '')
    .stat(d.status, 'Status', { color: d.status === 'success' || d.status === 'ready' || d.status === 'active' ? 's' : d.status === 'pending' || d.status === 'degraded' ? 'w' : 'd' });
  if (d.rows) for (const r of d.rows) b.row(r.label, r.value, { color: r.color });
  return b.build();
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function shortAddr(a: string): string {
  if (!a || a.length <= 12) return a;
  return `${a.slice(0, 4)}...${a.slice(-4)}`;
}

/**
 * Generate a clickable address with Solscan link icon.
 * Shows the full address truncated to fit, with an external-link icon
 * that opens Solscan in a new tab.
 */
export function addrLink(addr: string, type: 'tx' | 'address' | 'token' = 'address'): string {
  if (!addr || addr.length <= 12) return addr;
  const short = `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  const url = type === 'tx'
    ? `https://solscan.io/tx/${addr}`
    : type === 'token'
      ? `https://solscan.io/token/${addr}`
      : `https://solscan.io/account/${addr}`;
  const icon = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" style="opacity:0.4;vertical-align:middle;margin-left:3px"><path d="M6 3h5a1 1 0 011 1v5M11 3L5 9M9 13H4a1 1 0 01-1-1V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<span style="white-space:nowrap">${short}<a href="${url}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;display:inline-flex;align-items:center">${icon}</a></span>`;
}