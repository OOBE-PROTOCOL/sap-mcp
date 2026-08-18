/**
 * @name ui/card-shell
 * @description Shared card shell: CSS, HTML wrapper, header, footer, row rendering.
 *
 * This module owns the visual identity (colors, fonts, layout) and exposes
 * a single `renderShell` function that CardBuilder calls. Keeping the shell
 * separate from the builder ensures every card shares identical styling
 * without duplicating CSS.
 *
 * @module ui/card-shell
 */

// ── Palette ────────────────────────────────────────────────────────────────

export const C = {
  bg: '#080e18',
  surface: 'rgba(255,255,255,0.01)',
  border: 'rgba(255,255,255,0.03)',
  borderHover: 'rgba(255,255,255,0.06)',
  text: '#eaeef2',
  textDim: 'hsl(210,10%,55%)',
  textMuted: 'hsl(210,8%,38%)',
  success: 'hsl(155,65%,52%)',
  warning: 'hsl(35,90%,55%)',
  danger: 'hsl(0,75%,60%)',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
} as const;

// ── SAP Logo ───────────────────────────────────────────────────────────────

export const SAP_LOGO = `<svg width="32" height="32" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="sapg" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
<stop stop-color="#00F0FF"/><stop offset="0.5" stop-color="#0097A7"/><stop offset="1" stop-color="#05101F"/></linearGradient></defs>
<rect width="200" height="200" rx="48" fill="url(#sapg)"/>
<path d="M125 30 C 95 30 75 55 75 85 C 75 115 105 125 125 145 C 105 165 75 175 75 185" stroke="white" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M40 105 L 55 105 L 60 85 L 70 125 L 80 95 L 90 115" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/></svg>`;

// ── Types ──────────────────────────────────────────────────────────────────

export type RowValueColor = '' | 's' | 'w' | 'd';

export interface StatSpec {
  readonly value: string;
  readonly label: string;
  readonly color?: RowValueColor;
  readonly icon?: string;
  readonly large?: boolean;
}

export interface CardRow {
  readonly label: string;
  readonly value: string;
  readonly color?: RowValueColor;
  readonly icon?: string;
  readonly raw?: boolean;
}

export interface FullRow extends CardRow {
  readonly full: true;
  readonly raw?: boolean;
}

export interface ShellInput {
  readonly title: string;
  readonly subtitle: string;
  readonly logo?: string;
  readonly version: string;
  readonly wallet: string;
  readonly stats: readonly StatSpec[];
  readonly rows: readonly CardRow[];
  readonly fullRows: readonly FullRow[];
  readonly tags: readonly string[];
  readonly issues: readonly string[];
  readonly noGrid?: boolean;
}

// ── CSS ────────────────────────────────────────────────────────────────────

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
.rv.s{color:${C.success}}.rv.w{color:${C.warning}}.rv.d{color:${C.danger}}
.rv.lg{font-size:24px;font-weight:700}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:0}
.g2 .r{padding:5px 0}.g2 .r:nth-child(2n){padding-left:10px}.g2 .r:nth-child(2n-1){padding-right:10px}
.f{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-top:1px solid ${C.border};background:rgba(0,0,0,0.1);font-size:9px;color:${C.textMuted};font-family:${C.mono};flex-shrink:0}
.fl{display:flex;align-items:center;gap:4px}.fr{color:${C.textDim}}
.dot{width:4px;height:4px;border-radius:50%;background:${C.text};box-shadow:0 0 3px ${C.textMuted}}
.stat{padding:10px 14px;text-align:center}
.stat-v{font-family:${C.mono};font-size:26px;font-weight:700}
.stat-v.s{color:${C.success}}.stat-v.w{color:${C.warning}}.stat-v.d{color:${C.danger}}
.stat-l{font-size:10px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.06em;margin-top:3px}
.fr-row{padding:5px 0;border-top:1px solid ${C.border}}
.tag{display:inline-block;padding:2px 7px;border-radius:5px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);font-size:9px;color:${C.textDim};font-family:${C.mono};margin:1px}`;

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function shortAddr(a: string): string {
  return a.length <= 12 ? esc(a) : `${esc(a.slice(0, 4))}...${esc(a.slice(-4))}`;
}

// ── Shell renderer ─────────────────────────────────────────────────────────

export function renderShell(input: ShellInput): string {
  const logo = input.logo ?? SAP_LOGO;
  const badge = SAP_LOGO.replace('width="32" height="32"', 'width="18" height="18"');

  // Header
  const header = `<div class="h"><div class="hl">${logo}</div><div><div class="ht">${esc(input.title)}</div><div class="hs">${esc(input.subtitle)}</div></div><div class="hp">${badge}</div></div>`;

  // Stats (hero numbers)
  let statsHtml = '';
  for (const s of input.stats) {
    const colorCls = s.color ? ` ${s.color}` : '';
    const sizeCls = s.large ? ' lg' : '';
    const icon = s.icon ?? '';
    statsHtml += `<div class="stat"><div class="stat-v${colorCls}${sizeCls}">${esc(s.value)}</div><div class="stat-l">${icon}${esc(s.label)}</div></div>`;
  }

  // Rows (2-column grid or simple rows)
  let rowsHtml = '';
  if (input.rows.length > 0) {
    const wrapper = input.noGrid ? '' : ' class="g2"';
    rowsHtml = `<div${wrapper}>${input.rows.map(r => {
      const cls = r.color ? ` ${r.color}` : '';
      const ic = r.icon ? `<span style="display:flex;align-items:center;flex-shrink:0">${r.icon}</span>` : '';
      const val = r.raw ? r.value : esc(r.value);
      return `<div class="r"><span class="rl">${ic}${esc(r.label)}</span><span class="rv${cls}">${val}</span></div>`;
    }).join('')}</div>`;
  }

  // Full rows (spanning full width)
  let fullRowsHtml = '';
  for (const r of input.fullRows) {
    const cls = r.color ? ` ${r.color}` : '';
    const ic = r.icon ? `<span style="display:flex;align-items:center;flex-shrink:0">${r.icon}</span>` : '';
    const val = r.raw ? r.value : esc(r.value);
    fullRowsHtml += `<div class="fr-row"><div class="rl">${ic}${esc(r.label)}</div><div class="rv${cls}" style="margin-top:2px">${val}</div></div>`;
  }

  // Tags
  let tagsHtml = '';
  if (input.tags.length > 0) {
    tagsHtml = `<div style="margin-top:4px">${input.tags.map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>`;
  }

  // Issues
  let issuesHtml = '';
  if (input.issues.length > 0) {
    issuesHtml = `<div style="margin-top:4px">${input.issues.map(i => `<div style="font-size:11px;color:${C.warning};padding:1px 0">${esc(i)}</div>`).join('')}</div>`;
  }

  // Footer
  const footer = `<div class="f"><span class="fl"><span class="dot"></span> SAP MCP v${esc(input.version)}</span><span class="fr">${input.wallet ? shortAddr(input.wallet) : ''}</span></div>`;

  // Assemble
  const body = header + `<div class="b">${statsHtml}${rowsHtml}${fullRowsHtml}${tagsHtml}${issuesHtml}</div>` + footer;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(input.title)}</title><style>${CSS}</style></head><body><div class="c">${body}</div></body></html>`;
}