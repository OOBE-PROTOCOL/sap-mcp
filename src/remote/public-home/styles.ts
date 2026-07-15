/**
 * @name LANDING_CSS
 * @description Server-rendered CSS for the public SAP MCP homepage.
 */
export const LANDING_CSS = `
  :root {
    color-scheme: dark;
    --bg: #111413;
    --bg-2: #20201e;
    --paper: #d9d4cd;
    --paper-ink: #242320;
    --ink: #f5fbfc;
    --muted: #a8b9bc;
    --subtle: #7e9397;
    --panel: rgba(255, 255, 255, .055);
    --panel-strong: rgba(255, 255, 255, .09);
    --line: rgba(255, 255, 255, .14);
    --line-strong: rgba(40, 216, 232, .44);
    --aqua: #28d8e8;
    --aqua-2: #55f1df;
    --green: #8ce99a;
    --yellow: #f6d365;
    --coral: #ff7666;
    --blue: #86a6ff;
    --radius: 16px;
    --content: 1180px;
    --nav-height: 74px;
  }

  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    min-height: 100vh;
    font: 16px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--ink);
    background:
      linear-gradient(rgba(40, 216, 232, .025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(40, 216, 232, .025) 1px, transparent 1px),
      var(--bg);
    background-size: 80px 80px;
    overflow-x: hidden;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(circle at 16% 10%, rgba(40, 216, 232, .12), transparent 30%),
      radial-gradient(circle at 84% 18%, rgba(134, 166, 255, .08), transparent 28%),
      linear-gradient(180deg, rgba(255,255,255,.025), transparent 40%);
  }

  a { color: inherit; }
  a:focus-visible, button:focus-visible {
    outline: 2px solid var(--aqua);
    outline-offset: 3px;
  }

  .skip-link {
    position: fixed;
    left: 16px;
    top: 16px;
    z-index: 100;
    transform: translateY(-150%);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 10px 14px;
    background: #061517;
    color: var(--ink);
  }
  .skip-link:focus { transform: translateY(0); }

  .site-nav {
    position: sticky;
    top: 12px;
    z-index: 20;
    width: min(calc(100% - 32px), var(--content));
    min-height: var(--nav-height);
    margin: 12px auto 0;
    padding: 10px 12px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 14px;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, .11);
    border-radius: 999px;
    background: rgba(11, 17, 17, .78);
    box-shadow: 0 18px 44px rgba(0, 0, 0, .28);
    backdrop-filter: blur(18px);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    text-decoration: none;
  }
  .brand img {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    box-shadow: 0 0 0 1px rgba(40, 216, 232, .2);
  }
  .brand strong {
    display: block;
    font-size: 15px;
    line-height: 1.1;
  }
  .brand span {
    display: block;
    color: var(--subtle);
    font-size: 12px;
  }
  .nav-center {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .nav-pill,
  .nav-dropdown summary,
  .nav-actions a,
  .button {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, .12);
    border-radius: 999px;
    padding: 10px 14px;
    color: var(--ink);
    text-decoration: none;
    font-weight: 800;
    font-size: 14px;
    background: rgba(255, 255, 255, .04);
  }
  .nav-pill:hover,
  .nav-dropdown summary:hover,
  .nav-actions a:hover,
  .button:hover {
    border-color: var(--line-strong);
    background: rgba(40, 216, 232, .09);
  }
  .nav-pill.is-active,
  .nav-pill-strong {
    border-color: rgba(40, 216, 232, .28);
    background: rgba(40, 216, 232, .09);
  }
  .nav-pill-strong {
    color: var(--aqua);
  }
  .oobe-nav {
    gap: 8px;
    padding-left: 10px;
  }
  .oobe-nav img {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    box-shadow: 0 0 0 1px rgba(140, 233, 154, .28);
  }
  .nav-dropdown {
    position: relative;
  }
  .nav-dropdown summary {
    gap: 7px;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .nav-dropdown summary::-webkit-details-marker {
    display: none;
  }
  .nav-dropdown[open] summary {
    border-color: var(--line-strong);
    background: rgba(40, 216, 232, .11);
  }
  .nav-dropdown[open] summary span {
    transform: rotate(180deg);
  }
  .nav-dropdown summary span {
    color: var(--aqua);
    transition: transform .18s ease;
  }
  .nav-menu {
    position: absolute;
    top: calc(100% + 12px);
    left: 50%;
    z-index: 40;
    display: grid;
    gap: 8px;
    width: min(420px, calc(100vw - 34px));
    max-height: min(72vh, 560px);
    overflow: auto;
    border: 1px solid rgba(255, 255, 255, .12);
    border-radius: 22px;
    padding: 10px;
    background: rgba(10, 17, 18, .9);
    box-shadow: 0 28px 80px rgba(0, 0, 0, .44);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transform: translateX(-50%);
  }
  .nav-menu-wide {
    width: min(690px, calc(100vw - 34px));
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .nav-menu-link {
    display: grid;
    grid-template-columns: 42px 1fr;
    gap: 12px;
    align-items: start;
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, .08);
    border-radius: 16px;
    padding: 12px;
    color: var(--ink);
    text-decoration: none;
    background: rgba(255, 255, 255, .04);
  }
  .nav-menu-link:hover {
    border-color: rgba(40, 216, 232, .34);
    background: rgba(40, 216, 232, .075);
  }
  .nav-menu-link span:not(.nav-glyph) {
    min-width: 0;
  }
  .nav-menu-link strong,
  .nav-menu-link small {
    display: block;
  }
  .nav-menu-link strong {
    font-size: 14px;
    line-height: 1.2;
  }
  .nav-menu-link small {
    margin-top: 5px;
    color: var(--subtle);
    font-size: 12px;
    line-height: 1.35;
  }
  .nav-glyph {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid rgba(40, 216, 232, .2);
    border-radius: 14px;
    color: var(--aqua);
    background: rgba(40, 216, 232, .08);
    font-weight: 900;
    font-size: 12px;
  }
  .nav-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .nav-install {
    gap: 8px;
  }
  .install-os {
    display: none;
    width: 20px;
    height: 20px;
    color: #061517;
  }
  .install-os svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
  html[data-os="windows"] .install-os-windows,
  html[data-os="macos"] .install-os-macos,
  html[data-os="linux"] .install-os-linux {
    display: inline-grid;
    place-items: center;
  }
  .button.primary {
    border-color: rgba(40, 216, 232, .58);
    color: #061517;
    background: var(--aqua);
  }
  .version-pill {
    border: 1px solid rgba(255, 255, 255, .12);
    border-radius: 999px;
    padding: 9px 12px;
    color: var(--muted);
    font-weight: 800;
    font-size: 13px;
    white-space: nowrap;
  }

  .page-shell {
    width: min(calc(100% - 32px), var(--content));
    margin: 0 auto;
  }

  .hero {
    min-height: calc(96svh - var(--nav-height));
    display: grid;
    grid-template-columns: minmax(0, .98fr) minmax(380px, 560px);
    gap: 56px;
    align-items: center;
    padding: 78px 0 52px;
  }
  .hero-copy { align-self: center; }
  .eyebrow {
    margin: 0 0 18px;
    color: var(--aqua);
    font-weight: 900;
    font-size: 13px;
    text-transform: uppercase;
  }
  h1, h2, h3, p { margin-top: 0; }
  h1 {
    max-width: 760px;
    margin-bottom: 22px;
    font-size: clamp(56px, 7vw, 108px);
    line-height: .84;
    letter-spacing: 0;
  }
  .lead {
    max-width: 620px;
    color: var(--muted);
    font-size: clamp(17px, 1.7vw, 22px);
  }
  .hero-actions,
  .inline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-top: 30px;
  }
  .micro-copy {
    margin-top: 18px;
    color: var(--subtle);
    font-size: 14px;
  }

  .hero-visual {
    position: relative;
    min-height: 620px;
    border: 1px solid rgba(255,255,255,.11);
    border-radius: 34px;
    background:
      linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.035)),
      radial-gradient(circle at 50% 42%, rgba(40,216,232,var(--hero-glow, .16)), transparent 42%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 34px 90px rgba(0,0,0,.36);
    overflow: hidden;
  }
  .hero-visual::before {
    content: "";
    position: absolute;
    inset: 18px;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 26px;
    pointer-events: none;
  }
  .terminal-strip {
    position: absolute;
    left: 24px;
    right: 24px;
    top: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    border: 1px solid rgba(255,255,255,.09);
    border-radius: 999px;
    padding: 0 14px;
    color: var(--subtle);
    background: rgba(0,0,0,.22);
  }
  .terminal-strip span {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--coral);
  }
  .terminal-strip span:nth-child(2) { background: var(--yellow); }
  .terminal-strip span:nth-child(3) { background: var(--green); }
  .terminal-strip code {
    margin-left: auto;
    color: var(--aqua);
    font-size: 12px;
  }
  .orbital-engine {
    position: absolute;
    inset: 86px 26px 124px;
    display: grid;
    place-items: center;
    perspective: 1100px;
  }
  .orbit {
    position: absolute;
    width: min(78%, 390px);
    aspect-ratio: 1;
    border: 1px solid rgba(40,216,232,.24);
    border-radius: 42%;
    transform: rotateX(var(--engine-tilt, 0deg)) rotateZ(var(--orbit-a, 0deg));
  }
  .orbit-b {
    width: min(58%, 300px);
    border-color: rgba(246,211,101,.24);
    transform: rotateX(var(--engine-tilt, 0deg)) rotateZ(var(--orbit-b, 0deg));
  }
  .orbit-c {
    width: min(40%, 220px);
    border-color: rgba(255,118,102,.22);
    transform: rotateX(var(--engine-tilt, 0deg)) rotateZ(var(--orbit-c, 0deg));
  }
  .orbit-core {
    position: relative;
    z-index: 3;
    display: grid;
    place-items: center;
    width: 148px;
    height: 148px;
    border: 1px solid rgba(40,216,232,.45);
    border-radius: 34px;
    color: var(--aqua);
    background: rgba(4, 16, 18, .76);
    box-shadow: 0 0 70px rgba(40,216,232,.16), inset 0 0 44px rgba(40,216,232,.08);
    transform: rotateZ(var(--engine-spin, 0deg));
  }
  .orbit-core img { border-radius: 16px; }
  .orbit-core strong {
    margin-top: 8px;
    font-size: 28px;
    line-height: 1;
  }
  .orbit-chip {
    position: absolute;
    z-index: 4;
    width: 118px;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 16px;
    padding: 12px;
    background: rgba(8, 16, 17, .78);
    box-shadow: 0 20px 40px rgba(0,0,0,.24);
  }
  .orbit-chip b,
  .orbit-chip span { display: block; }
  .orbit-chip b { color: var(--ink); }
  .orbit-chip span { color: var(--subtle); font-size: 12px; }
  .chip-a { left: calc(12% - var(--chip-spread, 0px)); top: 22%; transform: rotate(-12deg); }
  .chip-b { right: calc(10% - var(--chip-spread, 0px)); top: 24%; transform: rotate(12deg); }
  .chip-c { left: calc(13% - var(--chip-spread, 0px)); bottom: 18%; transform: rotate(10deg); }
  .chip-d { right: calc(12% - var(--chip-spread, 0px)); bottom: 16%; transform: rotate(-10deg); }
  .hero-bento-mini {
    position: absolute;
    left: 24px;
    right: 24px;
    bottom: 24px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .hero-bento-mini div {
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 16px;
    padding: 14px;
    background: rgba(255,255,255,.04);
  }
  .hero-bento-mini span,
  .hero-bento-mini strong { display: block; }
  .hero-bento-mini span {
    color: var(--subtle);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }
  .hero-bento-mini strong {
    margin-top: 4px;
    font-size: 20px;
  }

  .bento-strip {
    padding: 34px 0 96px;
  }
  .bento-stack {
    display: grid;
    grid-template-columns: minmax(0, .92fr) minmax(480px, .68fr);
    gap: 58px;
    align-items: start;
  }
  .bento-sticky-copy {
    position: sticky;
    top: 112px;
    min-height: min(74vh, 760px);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 4px 0 10px;
  }
  .bento-sticky-copy h2 {
    max-width: 720px;
    margin: 0 0 18px;
    font-size: clamp(52px, 5.8vw, 104px);
    line-height: .88;
  }
  .bento-sticky-copy p:last-child {
    max-width: 620px;
    margin-bottom: 0;
    color: var(--muted);
    font-size: clamp(18px, 1.6vw, 24px);
  }
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: minmax(260px, auto);
    gap: 14px;
  }
  .bento-card {
    position: relative;
    grid-column: span 1;
    min-height: 260px;
    border: 1px solid rgba(255,255,255,.11);
    border-radius: 26px;
    padding: 22px;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
  }
  .bento-card::after {
    content: "";
    position: absolute;
    right: -36px;
    bottom: -48px;
    width: 150px;
    height: 150px;
    border-radius: 44px;
    opacity: .14;
    background: var(--aqua);
    transform: rotate(16deg);
  }
  .bento-card[data-tone="coral"]::after { background: var(--coral); }
  .bento-card[data-tone="yellow"]::after { background: var(--yellow); }
  .bento-card[data-tone="green"]::after { background: var(--green); }
  .bento-card[data-tone="blue"]::after { background: var(--blue); }
  .bento-card.wide { grid-column: span 2; }
  .bento-card.full {
    grid-column: 1 / -1;
    min-height: 220px;
  }
  .bento-card.tall { grid-column: span 2; grid-row: span 2; }
  .bento-card span {
    color: var(--aqua);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }
  .bento-card h3 {
    margin: 14px 0 10px;
    font-size: clamp(24px, 3vw, 40px);
    line-height: .96;
  }
  .bento-card p { color: var(--muted); }
  .bento-card code {
    display: block;
    margin: 18px 0;
    overflow-wrap: anywhere;
    color: var(--aqua);
  }

  .machine-section {
    position: relative;
    width: 100vw;
    min-height: 180vh;
    margin-left: calc(50% - 50vw);
    padding: 110px max(16px, calc((100vw - var(--content)) / 2));
    border-top: 1px solid rgba(255, 255, 255, .08);
    border-bottom: 1px solid rgba(255, 255, 255, .08);
    background:
      linear-gradient(rgba(40, 216, 232, .022) 1px, transparent 1px),
      linear-gradient(90deg, rgba(40, 216, 232, .022) 1px, transparent 1px),
      #0c1111;
    background-size: 80px 80px;
    color: var(--ink);
    overflow: clip;
  }
  .machine-copy {
    position: sticky;
    top: 112px;
    z-index: 2;
    width: min(430px, 100%);
  }
  .machine-copy h2 {
    margin: 0 0 16px;
    font-size: clamp(36px, 5vw, 72px);
    line-height: .9;
  }
  .machine-copy p { color: var(--muted); }
  .machine-stage {
    position: sticky;
    top: 90px;
    height: min(76vh, 760px);
    margin-left: min(460px, 42vw);
    display: grid;
    place-items: center;
  }
  .machine-core {
    position: relative;
    z-index: 4;
    display: grid;
    place-items: center;
    width: 270px;
    height: 190px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--aqua);
    box-shadow: none;
    transform: rotate(var(--machine-rotate, 0deg));
  }
  .machine-logo-pair {
    display: flex;
    align-items: center;
    gap: 22px;
    filter: drop-shadow(0 28px 50px rgba(0,0,0,.36));
  }
  .machine-logo-pair img {
    width: 100px;
    height: 100px;
    border-radius: 25px;
  }
  .solana-mark {
    width: 112px;
    height: auto;
    color: var(--ink);
  }
  .solana-mark path {
    fill: rgba(245, 251, 252, .94);
  }
  .machine-core-ring {
    position: absolute;
    inset: -52px;
    border: 1px solid rgba(40,216,232,.14);
    border-radius: 50%;
  }
  .machine-part {
    position: absolute;
    z-index: 3;
    width: min(250px, 36vw);
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 20px;
    padding: 18px;
    background: rgba(255,255,255,.055);
    box-shadow: 0 20px 40px rgba(0,0,0,.18);
    opacity: var(--machine-fade, .2);
  }
  .machine-part span {
    color: var(--aqua);
    font-weight: 900;
    font-size: 12px;
  }
  .machine-part strong {
    display: block;
    margin: 6px 0;
    font-size: 22px;
  }
  .machine-part p {
    margin: 0;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .part-remote { transform: translate(calc(-230px - var(--machine-open, 0px)), -180px); }
  .part-policy { transform: translate(calc(220px + var(--machine-open, 0px)), -160px); }
  .part-payments { transform: translate(calc(-230px - var(--machine-open, 0px)), 170px); }
  .part-signer { transform: translate(calc(230px + var(--machine-open, 0px)), 160px); }
  .machine-rail {
    position: absolute;
    width: min(780px, 72vw);
    height: 1px;
    background: rgba(40,216,232,.2);
    transform: rotate(24deg) scaleX(var(--machine-rail-scale, .4));
  }
  .rail-b { transform: rotate(-24deg) scaleX(var(--machine-rail-scale, .4)); }

  .section {
    padding: 86px 0;
  }
  .section.paper {
    width: 100vw;
    margin-left: calc(50% - 50vw);
    padding-left: max(16px, calc((100vw - var(--content)) / 2));
    padding-right: max(16px, calc((100vw - var(--content)) / 2));
    color: var(--paper-ink);
    background: var(--paper);
  }
  .section-head {
    display: grid;
    gap: 10px;
    max-width: 740px;
    margin-bottom: 28px;
  }
  .section h2 {
    margin-bottom: 0;
    font-size: 44px;
    line-height: 1;
    letter-spacing: 0;
  }
  .section-head p {
    color: var(--muted);
    font-size: 18px;
  }
  .paper .section-head p { color: #67615a; }
  .paper .feature {
    border-color: rgba(36, 35, 32, .16);
    background: rgba(36, 35, 32, .055);
  }
  .paper .feature p { color: #67615a; }

  .protocol-surface {
    position: relative;
    width: 100vw;
    margin-left: calc(50% - 50vw);
    padding-left: max(16px, calc((100vw - var(--content)) / 2));
    padding-right: max(16px, calc((100vw - var(--content)) / 2));
    border-top: 1px solid rgba(255, 255, 255, .08);
    border-bottom: 1px solid rgba(255, 255, 255, .08);
    background:
      radial-gradient(circle at 20% 10%, rgba(40, 216, 232, .13), transparent 30%),
      linear-gradient(rgba(40, 216, 232, .022) 1px, transparent 1px),
      linear-gradient(90deg, rgba(40, 216, 232, .022) 1px, transparent 1px),
      #0c1111;
    background-size: auto, 80px 80px, 80px 80px;
    color: var(--ink);
  }
  .protocol-surface .section-head {
    max-width: 820px;
  }
  .protocol-bento {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: minmax(260px, auto);
    gap: 14px;
  }
  .protocol-card {
    position: relative;
    grid-column: span 1;
    min-height: 260px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    border: 1px solid rgba(255, 255, 255, .11);
    border-radius: 28px;
    padding: 22px;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.032)),
      rgba(255,255,255,.035);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
    animation: surfaceRise .34s cubic-bezier(0, 0, .2, 1) both, bentoDrift 14s ease-in-out infinite;
  }
  .protocol-card:nth-child(2n) { animation-delay: .06s, -4s; }
  .protocol-card:nth-child(3n) { animation-delay: .12s, -8s; }
  .protocol-card::before {
    content: "";
    position: absolute;
    inset: auto -54px -68px auto;
    width: 180px;
    height: 180px;
    border-radius: 54px;
    background: linear-gradient(135deg, rgba(40,216,232,.2), rgba(140,233,154,.06));
    transform: rotate(18deg);
    opacity: .1;
  }
  .protocol-card.wide { grid-column: span 2; }
  .protocol-card.tall { grid-column: span 1; grid-row: span 2; }
  .protocol-sap {
    min-height: 534px;
  }
  .protocol-index {
    position: absolute;
    top: 18px;
    left: 18px;
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid rgba(255,255,255,.13);
    border-radius: 999px;
    color: var(--muted);
    background: rgba(255,255,255,.045);
    font-size: 12px;
    font-weight: 900;
  }
  .protocol-logo-rail {
    position: absolute;
    top: 18px;
    right: 18px;
    width: min(270px, 48%);
    overflow: hidden;
    mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
    z-index: 2;
  }
  .protocol-logo-rail div {
    display: flex;
    width: max-content;
    gap: 8px;
    animation: logoRail 22s linear infinite;
  }
  .protocol-logo-rail span {
    display: grid;
    place-items: center;
    min-width: 58px;
    min-height: 34px;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 999px;
    color: rgba(245,251,252,.9);
    background: rgba(255,255,255,.055);
    backdrop-filter: blur(10px);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0;
  }
  .protocol-avatar {
    position: absolute;
    top: 18px;
    right: 18px;
    display: grid;
    place-items: center;
    width: 86px;
    height: 86px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 24px;
    background: rgba(255,255,255,.045);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
    z-index: 2;
  }
  .protocol-avatar .solana-mark {
    width: 58px;
  }
  .sap-avatar {
    width: 112px;
    height: 112px;
    border-radius: 30px;
    background: rgba(40,216,232,.06);
  }
  .sap-avatar img {
    width: 78px;
    height: 78px;
    border-radius: 20px;
  }
  .protocol-card strong,
  .protocol-card p {
    position: relative;
    z-index: 1;
  }
  .protocol-card strong {
    display: block;
    max-width: 360px;
    margin-bottom: 10px;
    font-size: clamp(24px, 3vw, 42px);
    line-height: .96;
  }
  .protocol-card p {
    max-width: 460px;
    margin-bottom: 0;
    color: var(--muted);
  }
  @keyframes bentoDrift {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  @keyframes surfaceRise {
    from {
      opacity: 0;
      filter: blur(8px);
    }
    to {
      opacity: 1;
      filter: blur(0);
    }
  }
  @keyframes logoRail {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }

  .registry-section {
    padding-top: 94px;
  }
  .registry-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .registry-card {
    position: relative;
    display: grid;
    grid-template-columns: 74px 1fr auto;
    gap: 16px;
    align-items: center;
    min-height: 154px;
    border: 1px solid rgba(255,255,255,.11);
    border-radius: 28px;
    padding: 22px;
    color: var(--ink);
    text-decoration: none;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.032)),
      rgba(255,255,255,.04);
    animation: surfaceRise .34s cubic-bezier(0, 0, .2, 1) both;
    transition: border-color .18s ease, background .18s ease, transform .18s ease;
  }
  .registry-card:hover {
    border-color: var(--line-strong);
    background: rgba(40,216,232,.075);
    transform: translateY(-2px);
  }
  .registry-logo {
    display: grid;
    place-items: center;
    width: 74px;
    height: 74px;
    border: 1px solid rgba(40,216,232,.24);
    border-radius: 22px;
    color: var(--aqua);
    background: rgba(40,216,232,.08);
    font-weight: 950;
  }
  .registry-logo-sm {
    color: #ffffff;
    background:
      radial-gradient(circle at 28% 26%, rgba(40,216,232,.22), transparent 38%),
      linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.035));
  }
  .registry-logo-mcp {
    color: var(--aqua);
    background:
      linear-gradient(135deg, rgba(40,216,232,.16), rgba(140,233,154,.055)),
      rgba(40,216,232,.055);
  }
  .registry-copy {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .registry-copy strong {
    font-size: clamp(24px, 3vw, 38px);
    line-height: 1;
  }
  .registry-copy small {
    color: var(--muted);
    font-size: 15px;
    line-height: 1.45;
  }
  .registry-status {
    align-self: start;
    border: 1px solid rgba(140,233,154,.28);
    border-radius: 999px;
    padding: 8px 10px;
    color: var(--green);
    background: rgba(140,233,154,.08);
    font-size: 12px;
    font-weight: 900;
  }

  .metric-grid,
  .feature-grid,
  .install-grid,
  .setup-grid,
  .endpoint-grid,
  .download-grid {
    display: grid;
    gap: 14px;
  }
  .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .feature-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .install-grid { grid-template-columns: 1.15fr .85fr; }
  .setup-grid { grid-template-columns: minmax(0, .95fr) minmax(380px, 1.05fr); }
  .endpoint-grid { grid-template-columns: 1.35fr .65fr; }
  .download-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }

  .card,
  .metric,
  .feature,
  .download-card,
  .code-block {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
  }
  .card,
  .feature {
    padding: 22px;
  }
  .card,
  .metric,
  .feature,
  .bento-card,
  .download-card,
  .doc-tile {
    overflow-wrap: anywhere;
  }
  .metric {
    padding: 20px;
  }
  .metric span,
  .feature span,
  .download-card > span:not(.os-mark) > span {
    display: block;
    color: var(--subtle);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }
  .metric strong {
    display: block;
    margin-top: 6px;
    font-size: 48px;
    line-height: 1;
  }
  .metric p,
  .feature p,
  .card p {
    color: var(--muted);
  }
  .feature strong {
    display: block;
    margin: 8px 0;
    font-size: 21px;
  }
  .feature[data-tone="coral"] span { color: var(--coral); }
  .feature[data-tone="yellow"] span { color: var(--yellow); }
  .feature[data-tone="green"] span { color: var(--green); }
  .feature[data-tone="blue"] span { color: var(--blue); }
  .feature[data-tone="aqua"] span { color: var(--aqua); }

  .step-list {
    display: grid;
    gap: 12px;
    margin: 18px 0 0;
    padding: 0;
    list-style: none;
  }
  .step-list li {
    display: grid;
    grid-template-columns: 34px 1fr;
    gap: 12px;
    align-items: start;
    min-width: 0;
  }
  .step-list b {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--aqua);
  }
  .step-list code,
  .code-block code {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .code-block {
    margin-top: 14px;
    padding: 16px;
    overflow: auto;
    max-width: 100%;
    color: #d8faff;
    background: rgba(0, 0, 0, .34);
  }
  .command-stack {
    display: grid;
    gap: 12px;
    margin-top: 18px;
  }
  .command-stack > div > span {
    display: block;
    margin-bottom: 8px;
    color: var(--subtle);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }
  .download-actions,
  .step-downloads {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 18px;
  }
  .step-downloads {
    margin-top: 12px;
  }
  .download-action {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: center;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 12px;
    color: var(--ink);
    text-decoration: none;
    background: rgba(255, 255, 255, .045);
    transition: border-color .18s ease, background .18s ease, transform .18s ease;
  }
  .download-action:hover {
    border-color: var(--line-strong);
    background: rgba(40, 216, 232, .08);
    transform: translateY(-2px);
  }
  .download-action .os-mark {
    width: 44px;
    height: 44px;
    border-radius: 14px;
  }
  .download-action .os-mark svg {
    width: 26px;
    height: 26px;
  }
  .download-action span:last-child {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .download-action strong,
  .download-action small {
    display: block;
  }
  .download-action small {
    color: var(--subtle);
    font-size: 12px;
  }
  .download-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 14px;
    align-items: center;
    min-height: 112px;
    padding: 16px;
    text-decoration: none;
    transition: border-color .18s ease, background .18s ease, transform .18s ease;
  }
  .download-card:hover {
    border-color: var(--line-strong);
    background: rgba(40, 216, 232, .08);
    transform: translateY(-2px);
  }
  .os-mark {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    border-radius: 16px;
    color: var(--aqua);
    background: rgba(40, 216, 232, .11);
    box-shadow: inset 0 0 0 1px rgba(40, 216, 232, .22);
  }
  .os-mark svg {
    width: 30px;
    height: 30px;
    fill: currentColor;
  }
  .os-macos { color: var(--aqua-2); }
  .os-linux { color: var(--green); }
  .os-windows { color: #3ed7ff; }
  .download-card > span:last-child {
    display: grid;
    gap: 3px;
  }
  .download-card strong {
    display: block;
    font-size: 20px;
  }

  .docs-launchpad {
    position: relative;
    padding: 94px 0;
  }
  .docs-launchpad h2 {
    max-width: 740px;
    margin: 0 0 26px;
    font-size: clamp(36px, 5vw, 72px);
    line-height: .9;
  }
  .docs-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .doc-tile {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    gap: 14px;
    align-items: center;
    min-height: 74px;
    border: 1px solid rgba(255,255,255,.11);
    border-radius: 18px;
    padding: 18px;
    color: var(--ink);
    text-decoration: none;
    background: rgba(255,255,255,.045);
    transition: border-color .18s ease, background .18s ease, transform .18s ease;
  }
  .doc-tile:hover {
    border-color: var(--line-strong);
    background: rgba(40,216,232,.08);
    transform: translateY(-2px);
  }
  .doc-tile > span {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--aqua);
  }
  .doc-tile[data-tone="coral"] > span { background: var(--coral); }
  .doc-tile[data-tone="yellow"] > span { background: var(--yellow); }
  .doc-tile[data-tone="green"] > span { background: var(--green); }
  .doc-tile[data-tone="blue"] > span { background: var(--blue); }
  .doc-tile b {
    color: var(--subtle);
  }

  .timeline {
    position: relative;
    display: grid;
    gap: 16px;
    margin-top: 20px;
  }
  .timeline::before {
    content: "";
    position: absolute;
    left: 16px;
    top: 8px;
    bottom: 8px;
    width: 1px;
    background: rgba(40, 216, 232, .3);
  }
  .timeline-item {
    position: relative;
    display: grid;
    grid-template-columns: 34px 1fr;
    gap: 14px;
  }
  .timeline-item b {
    z-index: 1;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    color: #061517;
    background: var(--aqua);
  }
  .timeline-item p { margin-bottom: 0; }
  .endpoint-list {
    display: grid;
    gap: 10px;
    margin-top: 20px;
  }
  .endpoint-row {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    min-width: 0;
  }
  .method-badge {
    display: inline-grid;
    place-items: center;
    min-width: 46px;
    height: 26px;
    border: 1px solid rgba(40, 216, 232, .28);
    border-radius: 999px;
    padding: 0 9px;
    color: var(--aqua);
    font-size: 10px;
    font-weight: 900;
    line-height: 1;
  }
  .method-post {
    color: var(--green);
    border-color: rgba(140, 233, 154, .32);
  }
  .endpoint-row a {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .footer {
    padding: 70px 0 50px;
    color: var(--muted);
  }
  .footer-grid {
    display: grid;
    grid-template-columns: 1.1fr repeat(3, minmax(0, .7fr));
    gap: 14px;
    border-top: 1px solid var(--line);
    padding-top: 24px;
  }
  .footer a {
    display: block;
    padding: 7px 0;
    color: var(--muted);
    text-decoration: none;
  }
  .footer a:hover { color: var(--aqua); }

  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    .download-card,
    .doc-tile,
    .protocol-card,
    .protocol-logo-rail div,
    .registry-card {
      animation: none;
      transition: none;
    }
  }

  @media (max-width: 980px) {
    .site-nav {
      grid-template-columns: 1fr;
      align-items: stretch;
      border-radius: 28px;
    }
    .nav-center {
      justify-content: stretch;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .nav-center > * {
      flex: 0 0 auto;
    }
    .nav-menu {
      left: 0;
      transform: none;
    }
    .nav-menu-wide {
      grid-template-columns: 1fr;
    }
    .nav-actions { justify-content: space-between; }
    .hero {
      grid-template-columns: 1fr;
      padding-top: 56px;
    }
    .hero-visual {
      min-height: 540px;
    }
    h1 { font-size: 52px; }
    .bento-stack,
    .bento-grid {
      grid-template-columns: 1fr;
    }
    .bento-sticky-copy {
      position: relative;
      top: auto;
      order: -1;
      min-height: 0;
    }
    .bento-card,
    .bento-card.wide,
    .bento-card.full,
    .bento-card.tall {
      grid-column: auto;
      grid-row: auto;
    }
    .protocol-bento {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .registry-grid {
      grid-template-columns: 1fr;
    }
    .protocol-card,
    .protocol-card.wide,
    .protocol-card.tall {
      grid-column: auto;
      grid-row: auto;
    }
    .protocol-sap {
      min-height: 360px;
    }
    .machine-section {
      min-height: auto;
      padding-top: 74px;
      padding-bottom: 74px;
    }
    .machine-copy,
    .machine-stage {
      position: relative;
      top: auto;
    }
    .machine-copy {
      width: 100%;
      max-width: 680px;
    }
    .machine-stage {
      height: auto;
      min-height: 680px;
      margin: 36px 0 0;
    }
    .docs-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .metric-grid,
    .feature-grid,
    .install-grid,
    .setup-grid,
    .endpoint-grid,
    .footer-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .page-shell,
    .site-nav {
      width: min(calc(100% - 24px), var(--content));
    }
    h1 { font-size: 42px; }
    .section h2 { font-size: 34px; }
    .lead { font-size: 18px; }
    .hero {
      min-height: auto;
      gap: 34px;
      padding-bottom: 44px;
    }
    .hero-actions .button,
    .inline-actions .button {
      width: 100%;
    }
    .hero-visual {
      min-height: 500px;
      border-radius: 24px;
    }
    .orbital-engine {
      inset: 78px 12px 132px;
    }
    .orbit-chip {
      width: 92px;
      padding: 10px;
      font-size: 12px;
    }
    .chip-a,
    .chip-c {
      left: 4%;
    }
    .chip-b,
    .chip-d {
      right: 4%;
    }
    .hero-bento-mini {
      grid-template-columns: 1fr;
    }
    .bento-header h2,
    .docs-launchpad h2,
    .machine-copy h2 {
      font-size: 38px;
    }
    .machine-stage {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      min-height: 0;
      place-items: stretch;
    }
    .machine-core {
      order: -1;
      justify-self: center;
      width: 100%;
      height: auto;
      min-height: 136px;
    }
    .machine-core-ring,
    .machine-rail {
      display: none;
    }
    .machine-part {
      position: relative;
      width: 100%;
      opacity: 1;
      transform: none !important;
    }
    .download-grid,
    .download-actions,
    .step-downloads,
    .docs-grid,
    .protocol-bento,
    .registry-card {
      grid-template-columns: 1fr;
    }
    .protocol-logo-rail {
      width: min(210px, 54%);
    }
    .protocol-logo-rail span {
      min-width: 50px;
      min-height: 30px;
      font-size: 10px;
    }
    .protocol-avatar {
      width: 68px;
      height: 68px;
      border-radius: 20px;
    }
    .protocol-avatar .solana-mark {
      width: 46px;
    }
    .sap-avatar {
      width: 82px;
      height: 82px;
      border-radius: 24px;
    }
    .sap-avatar img {
      width: 58px;
      height: 58px;
      border-radius: 16px;
    }
    .registry-status {
      justify-self: start;
    }
    .metric strong { font-size: 40px; }
    .card,
    .feature,
    .metric { padding: 18px; }
    .download-card {
      min-height: 96px;
    }
  }
`;
