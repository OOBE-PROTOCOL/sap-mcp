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
  .nav-links {
    display: flex;
    justify-content: center;
    gap: 4px;
    min-width: 0;
  }
  .nav-links a,
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
  .nav-links a:hover,
  .nav-actions a:hover,
  .button:hover {
    border-color: var(--line-strong);
    background: rgba(40, 216, 232, .09);
  }
  .nav-actions {
    display: flex;
    gap: 8px;
    align-items: center;
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
    padding: 22px 0 82px;
  }
  .bento-header {
    display: grid;
    grid-template-columns: minmax(0, .78fr) minmax(260px, .42fr);
    gap: 18px;
    align-items: end;
    margin-bottom: 16px;
  }
  .bento-header h2 {
    max-width: 780px;
    margin: 0;
    font-size: clamp(34px, 4.8vw, 64px);
    line-height: .92;
  }
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-auto-rows: minmax(170px, auto);
    gap: 14px;
  }
  .bento-card {
    position: relative;
    grid-column: span 2;
    min-height: 170px;
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
  .bento-card.wide { grid-column: span 3; }
  .bento-card.tall { grid-column: span 3; grid-row: span 2; }
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
    background: var(--paper);
    color: var(--paper-ink);
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
  .machine-copy p { color: #68615b; }
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
    width: 190px;
    height: 190px;
    border: 1px solid rgba(36,35,32,.18);
    border-radius: 42px;
    background: #151817;
    color: var(--aqua);
    box-shadow: 0 40px 80px rgba(0,0,0,.22);
    transform: rotate(var(--machine-rotate, 0deg));
  }
  .machine-core img { border-radius: 20px; }
  .machine-core strong { font-size: 28px; }
  .machine-core-ring {
    position: absolute;
    inset: -52px;
    border: 1px solid rgba(36,35,32,.18);
    border-radius: 50%;
  }
  .machine-part {
    position: absolute;
    z-index: 3;
    width: min(250px, 36vw);
    border: 1px solid rgba(36,35,32,.16);
    border-radius: 20px;
    padding: 18px;
    background: rgba(255,255,255,.42);
    box-shadow: 0 20px 40px rgba(0,0,0,.08);
    opacity: var(--machine-fade, .2);
  }
  .machine-part span {
    color: #087f91;
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
    color: #67615a;
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
    background: rgba(36,35,32,.16);
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

  .metric-grid,
  .feature-grid,
  .install-grid,
  .endpoint-grid,
  .download-grid {
    display: grid;
    gap: 14px;
  }
  .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .feature-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .install-grid { grid-template-columns: 1.15fr .85fr; }
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
    .doc-tile {
      transition: none;
    }
  }

  @media (max-width: 980px) {
    .site-nav {
      grid-template-columns: 1fr;
      align-items: stretch;
    }
    .nav-links {
      justify-content: start;
      overflow-x: auto;
      padding-bottom: 2px;
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
    .bento-header,
    .bento-grid {
      grid-template-columns: 1fr;
    }
    .bento-card,
    .bento-card.wide,
    .bento-card.tall {
      grid-column: auto;
      grid-row: auto;
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
      width: 150px;
      height: 150px;
      border-radius: 32px;
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
    .docs-grid {
      grid-template-columns: 1fr;
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
