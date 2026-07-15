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
    border: 1px solid rgba(255, 255, 255, .13);
    border-radius: 22px;
    background: rgba(16, 24, 25, .72);
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
    border-radius: 12px;
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
    min-height: calc(100svh - var(--nav-height));
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 520px);
    gap: 44px;
    align-items: center;
    padding: 88px 0 72px;
  }
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
    font-size: 72px;
    line-height: .94;
    letter-spacing: 0;
  }
  .lead {
    max-width: 680px;
    color: var(--muted);
    font-size: 20px;
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

  .engine-card {
    position: relative;
    min-height: 560px;
    border: 1px solid var(--line);
    border-radius: 28px;
    background: linear-gradient(180deg, rgba(255, 255, 255, .08), rgba(255, 255, 255, .035));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .07), 0 28px 72px rgba(0, 0, 0, .34);
    overflow: hidden;
  }
  .engine-stage {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    perspective: 1100px;
  }
  .engine-core {
    position: relative;
    width: 290px;
    height: 290px;
    transform: rotateX(var(--engine-tilt, 0deg)) rotateZ(var(--engine-spin, 0deg));
    transition: transform .18s linear;
  }
  .engine-ring,
  .engine-dial,
  .engine-node,
  .engine-bar {
    position: absolute;
    border: 1px solid rgba(40, 216, 232, .34);
    background: rgba(6, 19, 20, .72);
    box-shadow: inset 0 0 28px rgba(40, 216, 232, .08);
  }
  .engine-ring {
    inset: 0;
    border-radius: 50%;
  }
  .engine-ring:nth-child(2) {
    inset: 36px;
    border-color: rgba(246, 211, 101, .34);
    transform: rotate(var(--ring-a, 0deg));
  }
  .engine-ring:nth-child(3) {
    inset: 72px;
    border-color: rgba(255, 118, 102, .34);
    transform: rotate(var(--ring-b, 0deg));
  }
  .engine-dial {
    inset: 104px;
    border-radius: 30px;
    display: grid;
    place-items: center;
    color: var(--aqua);
    font-size: 44px;
    font-weight: 900;
  }
  .engine-node {
    width: 84px;
    min-height: 72px;
    border-radius: 18px;
    padding: 11px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 800;
  }
  .engine-node strong {
    display: block;
    color: var(--ink);
    font-size: 13px;
  }
  .node-a { left: var(--node-a-x, 10px); top: var(--node-a-y, 16px); }
  .node-b { right: var(--node-b-x, 8px); top: var(--node-b-y, 44px); }
  .node-c { left: var(--node-c-x, 44px); bottom: var(--node-c-y, 4px); }
  .node-d { right: var(--node-d-x, 34px); bottom: var(--node-d-y, 34px); }
  .engine-trace {
    position: absolute;
    inset: 36px;
    border-radius: 40px;
    background:
      linear-gradient(90deg, transparent 0 46%, rgba(40, 216, 232, .55) 47% 53%, transparent 54%),
      linear-gradient(0deg, transparent 0 46%, rgba(140, 233, 154, .35) 47% 53%, transparent 54%);
    opacity: var(--trace-opacity, .24);
  }
  .engine-caption {
    position: absolute;
    left: 24px;
    right: 24px;
    bottom: 24px;
    display: grid;
    gap: 10px;
  }
  .engine-caption code {
    display: inline-flex;
    width: max-content;
    max-width: 100%;
    overflow: hidden;
    border: 1px solid rgba(40, 216, 232, .24);
    border-radius: 999px;
    padding: 8px 10px;
    color: var(--aqua-2);
    background: rgba(0, 0, 0, .24);
  }
  .engine-caption p {
    margin: 0;
    color: var(--muted);
  }

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
  .metric {
    padding: 20px;
  }
  .metric span,
  .feature span,
  .download-card span {
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
  }
  .download-card:hover {
    border-color: var(--line-strong);
    background: rgba(40, 216, 232, .08);
  }
  .os-mark {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    color: #061517;
    background: var(--aqua);
    font-weight: 900;
  }
  .download-card strong {
    display: block;
    font-size: 20px;
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
    .engine-core { transition: none; }
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
    h1 { font-size: 52px; }
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
    .engine-card { min-height: 460px; }
    .engine-core {
      width: 244px;
      height: 244px;
    }
    .engine-dial {
      inset: 88px;
      font-size: 34px;
    }
    .engine-node {
      width: 74px;
      font-size: 11px;
    }
    .download-grid { grid-template-columns: 1fr; }
    .metric strong { font-size: 40px; }
    .card,
    .feature,
    .metric { padding: 18px; }
  }
`;
