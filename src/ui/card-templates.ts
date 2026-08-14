/**
 * @name ui/card-templates
 * @description HTML card templates for MCP Apps UI resources.
 *
 * Bento grid layout: variable-size cards (compact stat, wide detail, hero).
 * Colors only on numbers (PnL green/red, balance cyan, cost amber).
 * Labels neutral. No badges. No overflow — everything visible.
 *
 * The SAP brand avatar (header right) is an avatar group combining the
 * SAP protocol icon and the OOBE Protocol logo. The card footer version
 * is sourced from MCP_SERVER_VERSION at module load time — callers
 * never pass it and render functions never hardcode it.
 *
 * @module ui/card-templates
 */

import { MCP_SERVER_VERSION } from '../core/constants.js';
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

// ── Brand logos ────────────────────────────────────────────────────────────

// SAP protocol icon — from assets/explorer_logo.png (the S-curve + ECG line)
const SAP_LOGO_URI = `data:image/png;base64,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`;

// OOBE Protocol logo — from assets/oobe-logo.png (neon green OOBE wordmark on black)
const OOBE_LOGO_URI = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAACxLAAAsSwGlPZapAAAPx0lEQVR4nOVaaVCc931eEMfuvnu+154cAknoAoSExClgWUDc97ILLKdYDgkJIdlBErJl17asNI1zVInTfMhMm3Ym0zqeaZ1xVE8cJ21jpbGb1M3Utg4kcUtCFyRGSdrp03n/K5Zd2IVltciZ9sMz784gfXie3/X8fu8rio+Px2qIi4vzwMaNG12IjY1dhpiYGILo6GgPREVFERiNRg8YDAYX9Hq9CzqdzgNardYFjUbjAZ7nXeA4zgWWZV1gGMYDNE1DtFYB3Ml7E2A18ksFeFLyvoj7Q94vAYIZ+ZXIuwsQCPm1Rt4vAdaL/FLiK0U/kLR3F2Al8mq12rcAT0renbi/aR9s8ksFWErepwCBkHcXINjkg1H37uRXFMBXxw9GzbsLEOzIuxP3J/JeBQik269n5NebvEqlWhTg/yN5IsBaTI434mshH8ioexKT4424O/llAvyxkQ/GnPdFfJkAT4t8sNN+JfLuAngjr1QqIVpa7/7a2/UkH4zI+0N+mQDBtre+Gt5KMz5YDm+l1F8gv6oAf6xpH0i3X0peoVAQiJ5m5Nfb4a0l8i4BgmFv17rW6vQ66AxaaPWL0Og0LvBaft0j71OAp7HY0BQDpVgNlURNnkqxygV5uAJKqYqQ5fi1e/u1kJfL5YsC+Bp1wU57IdVLhvPQcKEMNV8qQu1rB1D7ZSdqvlyEshfzkVqXDJbloJariQhPMue9pf0Cea8CBHLG8tfkaHVaMEoWpkMZOP/fgzj7+16c/m0XhucdLpx51I3TD7vQ8U4NNu6KgUqmBsuxa466r8gvEPcQYLW0D6TT++r2ggjKCBX2tSbj0FQdOqZL0TpRjLbJYrRNHIB9pAgtVw+g72EtWi+VQRerhVpJBxx5b2m/AJlMBlGgaW+MNsIYZYBhAUYD9AY3EQxucG92GmejU1MMkmoSUP53mSh7Ox2lb6eh/N10NFzOhW00D/Uf56DjQQkyTyVBKVGB1bJgOMYJlga9AIaGmlF7QEWroFStTt4lwFrOWAJxvU4PVsmDVXAuMHIWjIJbbHQyhpB0gnZCSoNjOWi0GvAaHmoZA1r4fyoWtJIBo2awqSAGDb8yofF6PhrHTSh7Kx3yMAVk4XJQAsJkkIZRTmygINkg9YA4VApxiASUmIJC6T3tF8gTAdYSeWOUEZySR1SMEVn2VNLIDr5pQef361H3lQNIs6a4MiCtYTfqv1qCzjfq0fFGHeq/Vow0WwoZfyqpmow6XsORJsdxLKlz4bdMpEDh+XT0PKiCbSQPtb/MRkr3VqR1JCGzYw8y2/Ygo223E61O7LUlI9WahNQGAYnYa01CdKIRMkpORPBFnqKoRQFWnfNGAzgVj8ymVJz4sBPnHh3Hn8z3Y3i2G0MPO3DyNx04NdeJzh/VoOfHVpz73TG89OgIzsx24+TDTgzNduDkXCd6Llmwp34nVFIavDDmHpMXwOt4yCIUMD+biaHP2tF0xQzr9Ty03y7G4GwTnp/vxdn5vkU8cj5feHTIhed/04dXMQD7mxWQhks9MsCdvIcAq815IfK8SoPS0yac/90JvDB3GMfGm9EzXYPOO2Vov1MM+81CtIwUoftOFY7es+LweAN6JmpwcKacEGgZL4L9aiEc05UYuGdDzolU4gPIaKMZ0GoatIqGWCSB7dtleG6+Gy3XDsA6kgfrtTzYRwrRdqME7TdL0UFQtgydN8rROVqOnvtVSG5NgCRU6soAb+SJAKuSj3amfW5XOr74+xM4dcuBw9MW0rXLL2Yg7/UU5H4jBdXvZ8J2Mw+WyzmwXslD82gBat7PRu6FXcj95i6U/TCd1LTtRh5sV03onqnE7pbtpP61Rg30MVpEbdZjv2Mfzt7qxzO329B64wAaruai4UouLJedaHgMy6c5sHySA8vHbvg0F3X/sR97hhIgjaR8pr07RCulvdFogE6jQ/zOOAyP9OH5+304fNuCuku52F4dT7o7KxManw6Wn5rROnEAtusmkraNYyaUv5sBjuVBS1lS71sr41D7fg6axvNJVFuvF6P7o1o8c7kDQ9e6cOqmAy/OHcHpew70jtai9XYR9v95EhgtA902HprNnAv8JhbcRgZcrBNsLA0ujgatV0MaIYNctjp5qVTqFMCXyYmKNoKVcyg/a8arfziOgelGNHyQj5ikKLAUD71BR7p/3kAahue70D1ejboPc1DzQRZs1/PQfNuMlO4EMhF4LQdlhBrRiQY0fliI5lEzEaFjspT4gSNTVvRPNqDnZi06b1Sg+VoBGkdNqPpZFvg4FtJQGdQqNVQKFYFSrnRBIVNAQSkgE8tASWRQKFcmLxBfgGi1pUan1aH/PTuem+0l9Ztk3wJWykMfpSOmhqU5OH5gxdm5PvTMVCOxeTNB661CNE+ZUfjXe0HLGZIBvJ6HPEyJ1NZE9N2thfWqyVnfU2a03CqA/TGab5nROGEiqd80kY+6n+XCsF1H+oMkjII4VEIQGSJ2QiSGJEwCuULuhB+R9yqAh8szGqDltYjbFovhG7149kEbLD83QR+rh1bjtLUaXgNDjB5DnzjIJLD9uxmaaB7GeAM6fl2BjlslqPxpJnSxGjBq55hj1DT0sTr0fmRB52QZ6v8zB/u/noyMVxOR9aVEZH81CTnf3IXSi2loGjfBciUXLbcLUf9uPrIHdqPwVBaKTmWj6GQ2Ck9mo2AoCweG9yO5ajtklMzvyAuQSCSLAnh7X6dhNdiemYAzE70YeGBD6Zvp4GmnnRVmPUdziE/eiFPXuzH4sAkVF7PAMhxxfF3v1eHw/XrU/tt+GLZqidEhArDOrt/xdi2OPGhA/Uc50G3mIQtRQiFRQiF+/JQqkTq4DS2TRaTpNY+ZcfhBHYbmOnDmt90uDM868OL/HELfr6xQKOREBJncP/IuAbz5+wUBEvZuxunxHvTft6D0rXTwjAY6ndPtcQyHjTtiMDTShaP3raj8URZxejqjFv2XmogodR/kQJ+gBaNiXEuNsNr2/tiG47N2WD7KgyFZC5VcBYZVg16wsyoVqFAZKr6bQ0atMAGE6dEyWoS2sWK0jZWgbdSJrnvl2NW9hThAoQT8JU8E8LnSGpypHh0XhROftOPwTD2JVtQOA3iWh1Y4XPAaEu2BX7biyF0rbJdN0CdoEJe0Ec/d7sXAvUZUvpMJTseRqAsCCERjd0bjzHgfBu83o+af94MzMlAp1FDTi4uNIAIVRmGPdQeOPWhE07V8MhKr/zULVe9noupSJnlWf5iF1DNbIQmX+lXz7uTFYrFvAYQU1+t14GkebW9UE/MiNKuM5xKhCmegNWiJraXlNBr/shyDD5vRcqsQaS/sQOmrOTg7f4hkTd6FFKjEanBaDpyGhUREoep8IV55NID+ew0wf2cP5JEK51LjttkJYlARMmwzb8bphw60j5YSW6xP4UEb1GBi1GCi1WCMalCRlDP1V6n7peRdAvg6ZuiNenK9ye5MxbOzrWi6akbTdTNSWrZBFcmQtFZGqrCnOhEn7raieaQAthETuseqcXSqkTS5TUXR5N8oZUpIQylkdabi5YcDGJruhONOJbbWxUIeoXSl/QIYjkakSIJsRype+OwQHFOVqPhJBlSskghDSWVk4RHgXvMymf/kiQArXnIe17pQCm3vVBH3JqShUIMlX8/GzoIEGOMMiIo3ousntei+Jfw9j8xwYc8v/YcM8AYW2mgNduRvgfX1MrwydwzDt7txdNaKsr/PAE2rF1fbxxCiLw2nyFp77FIbhh90wzFTif0XkiAJ8WJvKSckkRJERoj9Jr9MAG/HDOGAyao4bEmLR/enNWidKiSW0zFTgaNTNgxea8XQ9YP4wkQHesZqYLvinN/CfBfsqbDadn9cizN3e8hy9MxkO/rv1qPuX3KJgxOiLA6Rkif5LZKAiqBIr3G81YBz84MYGG9C61gRyt9LR8n3MtD8gzJ0XbTAcbHhMSxw/NACxz82YGf5FoSHRICSUR7El5KPjIwkEPlzyREaHSNnsDV3E5p/cQCtd4ucTm+kAAfHytE3UUfQOVUG+x2nkbGNmcgi03zdjK6xCvSO1aFnqoZ07Op/ykb6KzuQfmYnCs6noeTlXJS/bEL5KyZU/1kh2r5XjecmD+Glz45icKIFHTfKYL2cR/aI9uli9M9YcPyeHSfutbhw/I4dwziIfT2JCBOFg5JTq5InAqx4w/M4ZWmIozPG65FzbjfqfpED26gJ9hkz7DMFaLyZj+pL2Uj9wjakPruN/LbdNMF+x4yWmQI0j5tR/fNspJ7eirxv74J9qgCO2QoMzjXi1GcHcWa+2wnhJjjXhcFJOw5NWNA1U0FcoiBq03Q+cZct04UesE8WoP1hMQr+JhUSqcSvyHsVYLU3NsIlR7C+agkNfZwWCSWx2NEcjx1N8dhUGAM+iiMNTxGhIr83FURje2MctjfFIb4wCmpehcyziWRFbhspIetu+2QxiWr7dIkHOu6WoOHXeTB9JwU5rycj91vJyPlWMva/noTsbwhIdOJCInL+Ihn7XtoKhVYGcbjYo+59kY+IiCAQ+UveAxoOLM2SE5ew4AgQdntazYDlnbc7YXFRRCohD1dCFqaAJIRC0Z9m4sS8HX0363Hwdjmsn+ah+K19KPp+KgoF/G0q8r+bgqyvJCKxJx6abYzz7BVGLTl7SYjpEbCwC0SIIiERS5ZlgK/IewgQ6ItKjmfBaZxPllt+t3ceMWnIJHJUvVaAl/9wFMfHWtF3rxYlb6TBkKKFQq6ALEJORptUuPdtkDlJh0jJTk82O4XMBTLy5BSB0OgomZRAKpN6kF/a7b2RJwKs94tK4XhZec6ML/7XMxiaPoj+uXoU/tVeqFRKcugUrrdLQY6ZKoXL1gbi8FaLvIDw8PBFAYJNXnB2cqkCVecL8BpO4vT9LvRMViP3aylQqVVQUErn+XqFFxe+zlhrmfO+yHsIsFrNr5n84+gLJietaRcyu3YjqT4BUak6yCUKKGRKkgH+kg8k8iuRF4gvQBTsz1KWvrGRCPUcSpF7vlyscL61+RzJ+xRgvT5IEmztwoqrVPv3usrfY0YgNb+AsLAwAtFq5AP5LCXQF5XrRd6d+KoCrCf5QNLeX/L+1vwCcZcA6/0d3pOQD9ao80V+w4YNTgGWGZwAvsl5klfU3gQIRuTdBfBG3qsA6/1NztNqeP6QJwI86ff2/n6NFYy092e5WQt5DwGCHfnP2+F5E8CdeGhoKIFoPRpeIDX/eZAnAgRC3t+a93fOr2e3X5ry7uRDQkJ8C7CekV9Pb+9v5AXyHgIE0ux81XywIx+oyVmNPBEgGJ+cB0J+vR2eP+Q9BFiPjxADIe/PGSvQhrcs+iKRdwHWc9Q9TZOzYuQF8gsCPKnJ+by6/Vob3jLyAv4vmhx3AVYkLxLhfwF7YCRv1HLk5AAAAABJRU5ErkJggg==`;

// ── Protocol logo lookup ───────────────────────────────────────────────────

/**
 * Returns an `<img>` tag with the real protocol logo as a base64 data URI.
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

// ── Color palette ──────────────────────────────────────────────────────────

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
.hp{display:flex;align-items:center;gap:0;margin-left:auto;flex-shrink:0}
.hp img{width:18px;height:18px;border-radius:50%;object-fit:cover;border:1.5px solid ${C.bg}}
.hp img:nth-child(2){margin-left:-8px}
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

// ── Shell + header ─────────────────────────────────────────────────────────

/**
 * Avatar group HTML for the header right side: SAP icon + OOBE logo
 * stacked with a slight negative margin (overlap effect).
 */
const BRAND_AVATAR = `<div class="hp"><img src="${SAP_LOGO_URI}" alt="SAP"><img src="${OOBE_LOGO_URI}" alt="OOBE"></div>`;

function shell(title: string, body: string, fw: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="c">${body}<div class="f"><span class="fl"><span class="dot"></span> SAP MCP v${esc(MCP_SERVER_VERSION)}</span><span class="fr">${esc(fw)}</span></div></div></body></html>`;
}

function hdr(t: string, s: string, logo: string = `<img src="${SAP_LOGO_URI}" alt="SAP" style="width:28px;height:28px;border-radius:7px;object-fit:cover">`): string {
  return `<div class="h"><div class="hl">${logo}</div><div><div class="ht">${esc(t)}</div><div class="hs">${esc(s)}</div></div>${BRAND_AVATAR}</div>`;
}

function r(label: string, value: string, vc?: string, icon?: string): string {
  const cls = vc ? ` ${vc}` : '';
  const ic = icon ? `<span style="display:flex;align-items:center;flex-shrink:0">${icon}</span>` : '';
  return `<div class="r"><span class="rl">${ic}${esc(label)}</span><span class="rv${cls}">${value}</span></div>`;
}

// ── Card renderers ─────────────────────────────────────────────────────────

export function renderBalanceCard(d: { sol: number; usdc?: number; walletAddress: string; network: string }): string {
  const usdcRow = d.usdc !== undefined ? `<div class="r" style="margin-top:6px"><span class="rl">${tLogo('USDC')}USDC</span><span class="rv">${d.usdc.toFixed(2)}</span></div>` : '';
  const body = hdr('Wallet Balance', d.network) + `<div class="b"><div class="stat" style="padding:8px 0 4px"><div class="stat-v">${d.sol.toFixed(4)}</div><div class="stat-l">${tLogo('SOL')} SOL</div></div>${usdcRow}<div class="r" style="margin-top:4px"><span class="rl">Wallet</span><span class="rv" style="font-size:10px">${short(d.walletAddress)}</span></div></div>`;
  return shell('Wallet Balance', body, short(d.walletAddress));
}

export function renderReadinessCard(d: {
  status: 'ready' | 'degraded' | 'not-ready'; signerPublicKey?: string; sol?: number; usdc?: number;
  profile: string; canPayX402: boolean; canExecuteWriteTools: boolean;
  issues: readonly string[]; walletAddress?: string;
}): string {
  const color = d.status === 'ready' ? C.success : d.status === 'degraded' ? C.warning : C.danger;
  const rows = [
    r('Profile', esc(d.profile)),
    r('SOL', d.sol !== undefined ? d.sol.toFixed(4) : '\u2014'),
    r('x402', d.canPayX402 ? 'enabled' : 'disabled', d.canPayX402 ? 's' : 'd'),
    r('Write', d.canExecuteWriteTools ? 'enabled' : 'disabled', d.canExecuteWriteTools ? 's' : 'd'),
  ];
  let extra = '';
  if (d.issues.length > 0) extra = `<div style="margin-top:6px;font-size:10px;color:${C.warning}">${d.issues.map(i => `<div style="padding:1px 0">${esc(i)}</div>`).join('')}</div>`;
  const body = hdr('Payment Bridge', d.profile) + `<div class="b"><div class="stat" style="padding:4px 0 8px"><div class="stat-v" style="color:${color};font-size:16px">${d.status}</div></div><div class="g2">${rows.join('')}</div>${extra}</div>`;
  return shell('Payment Bridge', body, d.walletAddress ? short(d.walletAddress) : d.profile);
}

export function renderPositionCard(d: {
  market: string; side: 'long' | 'short'; size: number; entryPrice: number;
  markPrice: number; leverage: number; pnlUsd: number; pnlPct: number;
  liquidationPrice?: number; walletAddress?: string;
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
    r('Liq.', d.liquidationPrice !== undefined ? `$${d.liquidationPrice.toFixed(2)}` : '\u2014', 'w'),
  ];
  const body = hdr('Perp Position', d.market, adx) + `<div class="b"><div class="stat" style="padding:4px 0 8px"><div class="stat-v ${pnlColor} lg">${ps}$${pa.toFixed(2)}</div><div class="stat-l">${ps}${pp.toFixed(2)}% PnL</div></div><div class="g2">${rows.join('')}</div></div>`;
  return shell('Perp Position', body, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderPricingCard(d: {
  toolName: string; tier: string; priceUsd: number; recommendedMaxPriceUsd: number;
  isFree: boolean; walletAddress?: string;
}): string {
  const price = d.isFree ? 'FREE' : `$${d.priceUsd.toFixed(6)}`;
  const priceColor = d.isFree ? 's' : '';
  const cap = d.isFree ? '' : r('Max Cap', `$${d.recommendedMaxPriceUsd.toFixed(6)}`, 'w');
  const body = hdr('Tool Pricing', d.toolName) + `<div class="b"><div class="stat" style="padding:8px 0"><div class="stat-v ${priceColor} lg">${price}</div><div class="stat-l">${esc(d.tier)}</div></div>${cap}</div>`;
  return shell('Tool Pricing', body, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderTransferCard(d: {
  type: 'sol' | 'spl'; amount: number; symbol: string; from: string; to: string;
  signature?: string; status: 'confirmed' | 'pending' | 'failed'; walletAddress?: string;
}): string {
  const sc = d.status === 'confirmed' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const rows = [
    r('From', short(d.from)),
    r('To', short(d.to)),
    r('Status', d.status, sc),
  ];
  if (d.signature) rows.push(r('Sig', short(d.signature)));
  const body = hdr('Transfer', `${d.type.toUpperCase()} Transfer`) + `<div class="b"><div class="stat" style="padding:4px 0 8px"><div class="stat-v lg">${d.amount.toFixed(4)}</div><div class="stat-l">${tLogo(d.symbol)} ${esc(d.symbol)}</div></div><div class="g2">${rows.join('')}</div></div>`;
  return shell('Transfer', body, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderMagicBlockCard(d: {
  action: 'swap' | 'deposit' | 'withdraw' | 'transfer'; tokenIn?: string; tokenOut?: string;
  amountIn?: number; amountOut?: number; status: 'success' | 'pending' | 'failed';
  visibility?: 'public' | 'private'; walletAddress?: string;
}): string {
  const sc = d.status === 'success' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const mb = pLogo('magicblock', 'MB', '#6366f1');
  const rows = [r('Action', d.action.toUpperCase())];
  if (d.visibility) rows.push(r('Vis', d.visibility));
  if (d.tokenIn && d.amountIn !== undefined) rows.push(r('In', `${d.amountIn.toFixed(4)} ${esc(d.tokenIn)}`));
  if (d.tokenOut && d.amountOut !== undefined) rows.push(r('Out', `${d.amountOut.toFixed(4)} ${esc(d.tokenOut)}`));
  rows.push(r('Status', d.status, sc));
  const body = hdr('MagicBlock', d.action, mb) + `<div class="b"><div class="g2">${rows.join('')}</div></div>`;
  return shell('MagicBlock', body, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderMetaplexCard(d: {
  action: 'mint' | 'deploy' | 'update' | 'verify'; collectionName?: string;
  nftName?: string; mintAddress?: string; status: 'success' | 'pending' | 'failed';
  walletAddress?: string;
}): string {
  const sc = d.status === 'success' ? 's' : d.status === 'pending' ? 'w' : 'd';
  const mp = pLogo('metaplex', 'MP', '#ec4899');
  const rows = [r('Action', d.action.toUpperCase()), r('Status', d.status, sc)];
  if (d.collectionName) rows.push(r('Collection', esc(d.collectionName)));
  if (d.nftName) rows.push(r('NFT', esc(d.nftName)));
  if (d.mintAddress) rows.push(r('Mint', short(d.mintAddress)));
  const body = hdr('Metaplex', d.action, mp) + `<div class="b"><div class="g2">${rows.join('')}</div></div>`;
  return shell('Metaplex NFT', body, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderJupiterSwapCard(d: {
  tokenIn: string; tokenOut: string; amountIn: number; amountOut: number;
  priceImpactPct: number; route: string[]; status: 'success' | 'pending' | 'failed';
  walletAddress?: string;
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
  return shell('Jupiter Swap', body, d.walletAddress ? short(d.walletAddress) : '');
}

export function renderAgentRegistryCard(d: {
  agentName: string; agentId?: string; capabilities: string[]; protocols: string[];
  isActive: boolean; registeredAt?: string; walletAddress?: string;
}): string {
  const rows = [
    r('Status', d.isActive ? 'active' : 'inactive', d.isActive ? 's' : 'd'),
    r('Caps', `${d.capabilities.length}`),
  ];
  if (d.agentId) rows.push(r('ID', short(d.agentId)));
  if (d.registeredAt) rows.push(r('Since', esc(d.registeredAt)));
  const tags = `<div style="margin-top:4px">${d.protocols.map(p => `<span class="tag">${esc(p)}</span>`).join(' ')}</div>`;
  const body = hdr('Agent Registry', d.agentName) + `<div class="b"><div class="g2">${rows.join('')}</div>${tags}</div>`;
  return shell('Agent Registry', body, d.walletAddress ? short(d.walletAddress) : '');
}
