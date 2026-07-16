import { escapeHtml } from './escape.js';
import type { LandingPageModel } from './types.js';

/**
 * @name formatUsd
 * @description Formats public payment totals for the landing page.
 */
function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '$0.00';
  }

  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: value < 1 ? 3 : 2,
    maximumFractionDigits: value < 1 ? 3 : 2,
  })}`;
}

/**
 * @name formatInteger
 * @description Formats public counters with stable grouping.
 */
function formatInteger(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }

  return Math.trunc(value).toLocaleString('en-US');
}

/**
 * @name renderOsIcon
 * @description Renders inline platform marks for native wizard download cards.
 */
function renderOsIcon(platform: 'windows' | 'macos' | 'linux'): string {
  if (platform === 'windows') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 5.2 10.7 4v7.2H3V5.2Zm9.3-1.4L21 2.5v8.7h-8.7V3.8ZM3 12.8h7.7V20L3 18.8v-6Zm9.3 0H21v8.7l-8.7-1.3v-7.4Z" />
      </svg>
    `;
  }

  if (platform === 'macos') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16.7 2.4c.1 1.2-.4 2.4-1.2 3.3-.9 1-2.2 1.7-3.4 1.6-.2-1.2.4-2.4 1.2-3.2.9-1 2.3-1.7 3.4-1.7ZM20.2 17.4c-.5 1.2-.8 1.7-1.5 2.8-1 1.5-2.3 3.3-4 3.3-1.5 0-1.9-1-3.9-1s-2.5 1-4 1c-1.7 0-3-1.6-4-3.1-2.8-4.3-3.1-9.4-1.4-12.1 1.2-1.9 3-3 4.7-3 1.8 0 2.9 1 4.3 1 1.4 0 2.2-1 4.3-1 1.6 0 3.3.9 4.5 2.4-3.9 2.1-3.3 7.7 1 9.7Z" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.2c2.2 0 4 1.8 4 4v2.1c1.1.5 2 1.5 2.5 2.8l1.3 3.3c.4 1.1-.1 2.3-1.2 2.8l-1.1.5v1.2c0 1.6-1.3 2.9-2.9 2.9H9.4c-1.6 0-2.9-1.3-2.9-2.9v-1.2l-1.1-.5c-1.1-.5-1.6-1.7-1.2-2.8l1.3-3.3c.5-1.3 1.4-2.3 2.5-2.8V6.2c0-2.2 1.8-4 4-4Zm-2.2 16.2v.5c0 .4.3.7.7.7h3c.4 0 .7-.3.7-.7v-.5H9.8Zm2.2-14c-1 0-1.8.8-1.8 1.8v1.6h3.6V6.2c0-1-.8-1.8-1.8-1.8Zm-4.4 7.4-1.2 3.1 2.5 1.1h6.2l2.5-1.1-1.2-3.1c-.4-1-1.3-1.7-2.4-1.7H10c-1.1 0-2 .7-2.4 1.7Z" />
    </svg>
  `;
}

/**
 * @name renderSolanaMark
 * @description Renders the Solana mark used in the scroll coordination scene.
 */
function renderSolanaMark(): string {
  return `
    <svg class="solana-mark" viewBox="0 0 397 311" aria-label="Solana">
      <path d="M64.6 237.9c2.8-2.8 6.6-4.4 10.6-4.4h306.2c6.7 0 10.1 8.1 5.3 12.9l-60.5 60.5c-2.8 2.8-6.6 4.4-10.6 4.4H9.4c-6.7 0-10.1-8.1-5.3-12.9l60.5-60.5Z" />
      <path d="M64.6 4.4C67.4 1.6 71.2 0 75.2 0h306.2c6.7 0 10.1 8.1 5.3 12.9l-60.5 60.5c-2.8 2.8-6.6 4.4-10.6 4.4H9.4C2.7 77.8-.7 69.7 4.1 64.9L64.6 4.4Z" />
      <path d="M326.2 120.7c-2.8-2.8-6.6-4.4-10.6-4.4H9.4c-6.7 0-10.1 8.1-5.3 12.9l60.5 60.5c2.8 2.8 6.6 4.4 10.6 4.4h306.2c6.7 0 10.1-8.1 5.3-12.9l-60.5-60.5Z" />
    </svg>
  `;
}

/**
 * @name renderDefiLogoRail
 * @description Renders a compact animated rail for Solana DeFi protocol names exposed by SAP MCP.
 */
function renderDefiLogoRail(): string {
  const protocols = [
    ['Jupiter', '/logos/jupiter.ico'],
    ['Raydium', '/logos/raydium.ico'],
    ['Orca', '/logos/orca.ico'],
    ['Meteora', '/logos/meteora.png'],
    ['Drift', '/logos/drift.svg'],
  ] as const;
  const items = [...protocols, ...protocols];

  return `
    <div class="protocol-logo-rail" aria-label="Integrated Solana protocol logos">
      <div>
        ${items.map(([name, src]) => `
          <span>
            <img src="${escapeHtml(src)}" width="30" height="30" alt="${escapeHtml(name)}">
          </span>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * @name renderRuntimeLogoRail
 * @description Renders the hosted MCP-compatible runtime carousel under the primary navigation.
 */
export function renderRuntimeLogoRail(): string {
  const runtimes = [
    ['Hermes', '/logos/hermes.svg', 'Agent profile runtime with MCP tools and skills.'],
    ['Codex', '/logos/codex.svg', 'Developer agent runtime with hosted MCP and local payment bridge.'],
    ['Claude', '/logos/claude.svg', 'Claude Desktop and Claude Code MCP-compatible setup.'],
    ['OpenClaw', '/logos/openclaw.svg', 'Open agent runtime wired through hosted SAP MCP.'],
  ] as const;
  const items = [...runtimes, ...runtimes, ...runtimes];

  return `
    <section class="runtime-logo-strip" aria-label="SAP MCP compatible agent runtimes">
      <div class="runtime-logo-rail">
        <div>
          ${items.map(([name, src, description]) => `
            <span class="runtime-logo-item" title="${escapeHtml(description)}">
              <img src="${escapeHtml(src)}" width="30" height="30" alt="${escapeHtml(name)}">
              <strong>${escapeHtml(name)}</strong>
            </span>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

/**
 * @name renderProtocolMedia
 * @description Renders protocol-specific visual affordances inside the Protocol surface bento cards.
 */
function renderProtocolMedia(key: string): string {
  if (key === 'defi') {
    return renderDefiLogoRail();
  }

  if (key === 'rpc') {
    return `<div class="protocol-avatar solana-avatar">${renderSolanaMark()}</div>`;
  }

  if (key === 'sap') {
    return `
      <div class="protocol-avatar sap-avatar">
        <img src="/favicon.png" width="68" height="68" alt="SAP MCP">
      </div>
    `;
  }

  return '';
}

/**
 * @name renderNavGlyph
 * @description Renders compact glyphs for navigation dropdown rows without client-side icon dependencies.
 */
function renderNavGlyph(label: string): string {
  const initials = label
    .split(/[\s./-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return `<span class="nav-glyph" aria-hidden="true">${escapeHtml(initials || '•')}</span>`;
}

/**
 * @name renderTopNavigation
 * @description Renders the glass top navigation used by the hosted landing page.
 */
export function renderTopNavigation(model: LandingPageModel): string {
  const runtimeLinks = [
    ['Quick start', '#install', 'Choose native setup or CLI setup for hosted SAP MCP.'],
    ['Payments', '#payments', 'x402, pay.sh, local paid-call bridge, and receipt flow.'],
    ['Tool buckets', '#capabilities', 'Solana DeFi, Solana RPC, and Synapse Agent Protocol tools.'],
    ['Endpoints', '#endpoints', 'Public HTTP surface, discovery URLs, and security boundary.'],
  ] as const;

  const machineLinks = [
    ['Server JSON', model.info.endpoints.serverInfo, 'Public server metadata for runtimes and marketplaces.'],
    ['OpenAPI', model.info.endpoints.openApi, 'pay.sh catalog and HTTP integration schema.'],
    ['Downloads JSON', model.info.endpoints.wizardDownloads, 'Native wizard release links by operating system.'],
    ['Agent card', model.info.endpoints.agentCard, 'A2A-compatible agent card metadata.'],
    ['MCP server card', model.info.endpoints.smitheryServerCard, 'Marketplace server card metadata.'],
    ['Wizard descriptor', model.info.endpoints.wizardDescriptor, 'Wizard installer descriptor and setup hints.'],
    ['x402 discovery', model.info.endpoints.x402Discovery, 'x402 payment discovery record.'],
    ['pay.sh provider', model.info.endpoints.payShProvider, 'pay.sh provider YAML for catalog and proxy workflows.'],
  ] as const;

  const renderDropdownLink = ([label, href, description]: readonly [string, string, string]): string => `
    <a class="nav-menu-link" href="${escapeHtml(href)}">
      ${renderNavGlyph(label)}
      <span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(description)}</small>
      </span>
    </a>
  `;

  return `
    <nav class="site-nav" aria-label="Primary navigation">
      <a class="brand" href="${escapeHtml(model.info.endpoints.landing)}">
        <img src="/favicon.png" width="42" height="42" alt="SAP MCP">
        <span>
          <strong>SAP MCP</strong>
          <span>OOBE Protocol</span>
        </span>
      </a>
      <div class="nav-center">
        <a class="nav-pill is-active" href="${escapeHtml(model.info.endpoints.landing)}">Home</a>
        <a class="nav-pill oobe-nav" href="https://www.oobeprotocol.ai/">
          <img src="/oobe-logo.png" width="24" height="24" alt="">
          <span>OOBE</span>
        </a>
        <a class="nav-pill nav-pill-strong" href="${escapeHtml(model.info.endpoints.docs)}">Docs</a>
        <details class="nav-dropdown" data-nav-dropdown>
          <summary>
            Gateway
            <span aria-hidden="true">⌄</span>
          </summary>
          <div class="nav-menu nav-menu-small">
            ${runtimeLinks.map(renderDropdownLink).join('')}
          </div>
        </details>
        <details class="nav-dropdown" data-nav-dropdown>
          <summary>
            Metadata
            <span aria-hidden="true">⌄</span>
          </summary>
          <div class="nav-menu nav-menu-wide">
            ${machineLinks.map(renderDropdownLink).join('')}
          </div>
        </details>
      </div>
      <div class="nav-actions">
        <span class="version-pill">v${escapeHtml(model.info.version)}</span>
        <a class="button primary nav-install" href="#install">
          <span class="install-os install-os-windows">${renderOsIcon('windows')}</span>
          <span class="install-os install-os-macos">${renderOsIcon('macos')}</span>
          <span class="install-os install-os-linux">${renderOsIcon('linux')}</span>
          <span>Install</span>
        </a>
      </div>
    </nav>
  `;
}

/**
 * @name renderDownloadActionGroup
 * @description Renders direct OS download buttons for install steps and download cards.
 */
function renderDownloadActionGroup(model: LandingPageModel, className = 'download-actions'): string {
  const downloads = [
    ['Windows', 'x64 .exe', 'windows', model.info.downloads.desktopWizard.windowsX64Setup],
    ['macOS', 'Apple Silicon .dmg', 'macos', model.info.downloads.desktopWizard.macosArm64Dmg],
    ['Linux', 'x64 .tar.gz', 'linux', model.info.downloads.desktopWizard.linuxX64TarGz],
  ] as const;

  return `
    <div class="${escapeHtml(className)}">
      ${downloads.map(([label, caption, platform, href]) => `
        <a class="download-action os-${escapeHtml(platform)}" href="${escapeHtml(href)}">
          <span class="os-mark">${renderOsIcon(platform)}</span>
          <span>
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(caption)}</small>
          </span>
        </a>
      `).join('')}
    </div>
  `;
}

/**
 * @name renderHero
 * @description Renders the first viewport with the animated protocol engine.
 */
export function renderHero(model: LandingPageModel): string {
  const endpointLabel = model.endpoint === 'mcp'
    ? 'Streamable HTTP MCP endpoint'
    : 'Hosted MCP gateway';

  return `
    <header class="hero" id="top">
      <div class="hero-copy">
        <p class="eyebrow">OOBE Protocol · ${escapeHtml(endpointLabel)}</p>
        <h1>Agent operations, wired into Solana.</h1>
        <p class="lead">
          SAP MCP is the hosted MCP surface for agents that need real Solana work:
          protocol tools, registry state, identity, payments, policy, and local non-custodial signing.
        </p>
        <div class="hero-actions">
          <a class="button primary" href="#install">Start with the wizard</a>
          <a class="button" href="${escapeHtml(model.info.endpoints.docs)}">Read docs</a>
          <a class="button" href="${escapeHtml(model.info.endpoints.mcp)}">MCP endpoint</a>
        </div>
        <p class="micro-copy">
          Hosted tools run at <code>${escapeHtml(model.info.endpoints.mcp)}</code>. Paid and write calls
          are authorized by the user-owned local <code>sap_payments</code> bridge or an external signer.
        </p>
      </div>
      <div class="hero-visual" data-engine-scene aria-label="Animated SAP MCP protocol engine">
        <div class="terminal-strip">
          <span></span><span></span><span></span>
          <code>sap:mcp://remote</code>
        </div>
        <div class="orbital-engine">
          <div class="orbit orbit-a"></div>
          <div class="orbit orbit-b"></div>
          <div class="orbit orbit-c"></div>
          <div class="orbit-core">
            <img src="/favicon.png" alt="" width="52" height="52">
            <strong>SAP</strong>
          </div>
          <div class="orbit-chip chip-a"><b>MCP</b><span>Tools</span></div>
          <div class="orbit-chip chip-b"><b>x402</b><span>Receipts</span></div>
          <div class="orbit-chip chip-c"><b>SNS</b><span>Identity</span></div>
          <div class="orbit-chip chip-d"><b>RPC</b><span>Solana</span></div>
        </div>
        <div class="hero-bento-mini">
          <div><span>Tools</span><strong>268</strong></div>
          <div><span>Transport</span><strong>HTTP</strong></div>
          <div><span>Keys</span><strong>Local</strong></div>
        </div>
      </div>
    </header>
  `;
}

/**
 * @name renderHeroBento
 * @description Renders the first bento grid with operational primitives and live stats.
 */
export function renderHeroBento(model: LandingPageModel): string {
  const stats = model.paymentStats;
  const cards = [
    ['Solana DeFi Protocols', 'Jupiter, Raydium, Orca, Meteora, Drift, Pyth, DAS, Metaplex and more.', 'coral', 'protocols'],
    ['Solana RPC Methods', 'Balances, token accounts, assets, simulation, programs, transactions and raw chain reads.', 'yellow', 'rpc'],
    ['Synapse Agent Protocol', 'Registry, tools, reputation, attestations, escrow, settlement, memory, SNS identity.', 'green', 'sap'],
    ['x402 / pay.sh Revenue', `${formatUsd(stats.totalVolumeUsd)} settled volume across ${formatInteger(stats.totalSettlements)} settlement events.`, 'aqua', 'payments'],
  ] as const;

  const renderCard = ([title, body, tone, key]: typeof cards[number], index: number): string => `
    <article class="bento-card bento-${escapeHtml(key)} wide" data-tone="${escapeHtml(tone)}">
      <span>${escapeHtml(String(index + 1).padStart(2, '0'))}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </article>
  `;

  return `
    <section class="bento-strip bento-stack" aria-labelledby="bento-title">
      <div class="bento-grid">
        ${cards.slice(0, 2).map((card, index) => renderCard(card, index)).join('')}
        <article class="bento-card full" data-tone="blue">
          <span>Live endpoint</span>
          <h3>Streamable HTTP MCP</h3>
          <code>${escapeHtml(model.info.endpoints.mcp)}</code>
          <p>Free discovery. Paid tools return x402 challenges. Local signatures stay on the user's machine.</p>
        </article>
        ${cards.slice(2).map((card, index) => renderCard(card, index + 2)).join('')}
      </div>
      <aside class="bento-sticky-copy">
        <p class="eyebrow" id="bento-title">Agent coordination stack</p>
        <h2>One gateway for discovery, execution, payment, and proof.</h2>
        <p>
          SAP MCP gives agent runtimes one hosted gateway for discovery and execution,
          while payment receipts and signatures stay bound to the local profile.
        </p>
      </aside>
    </section>
  `;
}

/**
 * @name renderScrollMachine
 * @description Renders the large scroll-driven protocol assembly scene.
 */
export function renderScrollMachine(model: LandingPageModel): string {
  return `
    <section class="machine-section" data-machine-section aria-labelledby="machine-title">
      <div class="machine-copy">
        <p class="eyebrow" id="machine-title">Scroll the coordination engine</p>
        <h2>Hosted calls open into local authorization.</h2>
        <p>
          The remote server exposes the tool surface. The local profile owns signer state.
          The payment bridge resolves x402 challenges and replays the exact call with a receipt.
        </p>
      </div>
      <div class="machine-stage">
        <div class="machine-part part-remote">
          <span>01</span>
          <strong>Remote MCP</strong>
          <p>${escapeHtml(model.info.endpoints.mcp)}</p>
        </div>
        <div class="machine-part part-policy">
          <span>02</span>
          <strong>Policy</strong>
          <p>Limits, approvals, Bento optional.</p>
        </div>
        <div class="machine-core">
          <div class="machine-core-ring"></div>
          <div class="machine-logo-pair">
            <img src="/favicon.png" alt="SAP MCP" width="98" height="98">
            ${renderSolanaMark()}
          </div>
        </div>
        <div class="machine-part part-payments">
          <span>03</span>
          <strong>x402/pay.sh</strong>
          <p>Challenge, settlement, receipt.</p>
        </div>
        <div class="machine-part part-signer">
          <span>04</span>
          <strong>Local signer</strong>
          <p>Keypair bytes never leave device.</p>
        </div>
        <div class="machine-rail rail-a"></div>
        <div class="machine-rail rail-b"></div>
      </div>
    </section>
  `;
}

/**
 * @name renderDocsLaunchpad
 * @description Renders a compact docs grid similar to a production documentation launchpad.
 */
export function renderDocsLaunchpad(model: LandingPageModel): string {
  const docs = [
    ['Getting started', `${model.info.endpoints.docs}/#/user/00_START_HERE`, 'coral'],
    ['Hosted remote MCP', `${model.info.endpoints.docs}/#/user/01_HOSTED_REMOTE_MCP`, 'yellow'],
    ['Client configs', `${model.info.endpoints.docs}/#/user/04_CLIENT_CONFIGS`, 'green'],
    ['Desktop wizard', `${model.info.endpoints.docs}/#/user/06_DESKTOP_GUI_WIZARD`, 'blue'],
    ['x402 and pay.sh', `${model.info.endpoints.docs}/#/user/03_PAYMENTS_X402_PAYSH`, 'aqua'],
    ['Skills and tools', `${model.info.endpoints.docs}/#/user/05_SKILLS_AND_TOOLS`, 'green'],
  ] as const;

  return `
    <section class="docs-launchpad" aria-labelledby="docs-launchpad-title">
      <p class="eyebrow" id="docs-launchpad-title">Start operating</p>
      <h2>Documentation that maps to the agent workflow.</h2>
      <div class="docs-grid">
        ${docs.map(([label, href, tone]) => `
          <a class="doc-tile" data-tone="${escapeHtml(tone)}" href="${escapeHtml(href)}">
            <span></span>
            <strong>${escapeHtml(label)}</strong>
            <b aria-hidden="true">→</b>
          </a>
        `).join('')}
      </div>
    </section>
  `;
}

/**
 * @name renderMetrics
 * @description Renders public payment ledger counters.
 */
export function renderMetrics(model: LandingPageModel): string {
  const stats = model.paymentStats;
  const lastSettlement = stats.ledgerAvailable
    ? stats.lastSettlementAt ?? 'Waiting for first settlement'
    : 'Ledger initializes after the first paid hosted call';

  return `
    <section class="section compact" aria-labelledby="metrics-title">
      <div class="section-head">
        <p class="eyebrow" id="metrics-title">Live hosted gateway</p>
        <h2>Payment-aware MCP infrastructure.</h2>
        <p>Public ledger counters show the hosted payment rail without exposing secrets, wallet files, or RPC credentials.</p>
      </div>
      <div class="metric-grid">
        <article class="metric">
          <span>Facilitator Volume</span>
          <strong>${escapeHtml(formatUsd(stats.totalVolumeUsd))}</strong>
          <p>Estimated settled x402/pay.sh tool volume recorded by the hosted ledger.</p>
        </article>
        <article class="metric">
          <span>Total Settlements</span>
          <strong>${escapeHtml(formatInteger(stats.totalSettlements))}</strong>
          <p>${escapeHtml(lastSettlement)}</p>
        </article>
        <article class="metric">
          <span>x402 Challenges</span>
          <strong>${escapeHtml(formatInteger(stats.totalPaymentRequests))}</strong>
          <p>${escapeHtml(formatInteger(stats.totalVerifiedPayments))} verified payments, ${escapeHtml(formatInteger(stats.totalFailedSettlements))} failed settlements.</p>
        </article>
      </div>
    </section>
  `;
}

/**
 * @name renderFeatureEngine
 * @description Renders the capability matrix as a docs-style feature grid.
 */
export function renderFeatureEngine(): string {
  const features = [
    ['Solana DeFi', 'Jupiter, Raydium, Orca, Meteora, Drift and market data flows.', 'wide', 'defi'],
    ['Solana RPC', 'Balances, token accounts, DAS assets, transactions, programs and simulation.', '', 'rpc'],
    ['SAP Protocol', 'Agent registry, discovery, reputation, escrow, settlement and attestations.', 'tall', 'sap'],
    ['Identity', 'SNS domain checks, reverse lookup, linked identity and agent profile context.', '', 'identity'],
    ['Payments', 'x402 challenge tools, pay.sh provider metadata, receipts and paid-call replay.', 'wide', 'payments'],
    ['Policy', 'Local limits and optional Bento Guard policy checks before sensitive execution.', '', 'policy'],
    ['Skills', 'Bundled agent skills explain how to choose tools, fetch context and avoid waste.', '', 'skills'],
    ['Remote-first', 'Hosted Streamable HTTP with local non-custodial signing for paid/write calls.', 'wide', 'remote'],
  ] as const;

  return `
    <section class="section protocol-surface" id="capabilities" aria-labelledby="capabilities-title">
      <div class="section-head">
        <p class="eyebrow" id="capabilities-title">Protocol surface</p>
        <h2>Three buckets. One agent operations layer.</h2>
        <p>SAP MCP exposes Solana DeFi protocols, Solana RPC methods, and Synapse Agent Protocol operations through one MCP-compatible interface.</p>
      </div>
      <div class="protocol-bento">
        ${features.map(([label, description, size, key], index) => `
          <article class="protocol-card ${escapeHtml(size)} protocol-${escapeHtml(key)}">
            <span class="protocol-index">${escapeHtml(String(index + 1).padStart(2, '0'))}</span>
            ${renderProtocolMedia(key)}
            <strong>${escapeHtml(label)}</strong>
            <p>${escapeHtml(description)}</p>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

/**
 * @name renderRegistryListings
 * @description Renders public marketplace and registry listings where SAP MCP can be verified.
 */
export function renderRegistryListings(): string {
  const listings = [
    [
      'Smithery',
      'MCP server marketplace listing with hosted server metadata, tools, prompts, and configuration UX.',
      'https://smithery.ai/servers/oobe-protocol/sap-mcp',
      '/logos/smithery.svg',
    ],
    [
      'Official MCP Registry',
      'Canonical Model Context Protocol registry entry for ai.oobeprotocol.sap.mcp/sap-mcp.',
      'https://registry.modelcontextprotocol.io/?q=ai.oobeprotocol.sap.mcp%2Fsap-mcp',
      '/logos/mcp.svg',
    ],
  ] as const;

  return `
    <section class="section registry-section" aria-labelledby="registry-title">
      <div class="section-head">
        <p class="eyebrow" id="registry-title">Listed and verifiable</p>
        <h2>Discover SAP MCP from trusted MCP indexes.</h2>
        <p>Hosted metadata is public, crawler-friendly, and linked from registries agents already inspect.</p>
      </div>
      <div class="registry-grid">
        ${listings.map(([name, description, href, logo]) => `
          <a class="registry-card" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">
            <span class="registry-logo">
              <img src="${escapeHtml(logo)}" width="42" height="42" alt="${escapeHtml(name)}">
            </span>
            <span class="registry-copy">
              <strong>${escapeHtml(name)}</strong>
              <small>${escapeHtml(description)}</small>
            </span>
            <span class="registry-status">Verified</span>
          </a>
        `).join('')}
      </div>
    </section>
  `;
}

/**
 * @name renderIntegrationPath
 * @description Renders the recommended setup paths for native and CLI users.
 */
export function renderIntegrationPath(model: LandingPageModel): string {
  return `
    <section class="section" id="install" aria-labelledby="install-title">
      <div class="section-head">
        <p class="eyebrow" id="install-title">Fast integration path</p>
        <h2>Remote tools. Local signatures. Smooth payments.</h2>
        <p>
          Both paths end with the same production model: hosted SAP MCP tools at <code>/mcp</code>,
          plus a local non-custodial <code>sap_payments</code> bridge for paid and write calls.
        </p>
      </div>
      <div class="install-grid">
        <article class="card">
          <p class="eyebrow">Recommended for most users</p>
          <h3>Native download</h3>
          <p>Best when the user wants a guided desktop installer for profile creation, wallet isolation, runtime detection, and payment bridge repair.</p>
          <ol class="step-list">
            <li>
              <b>1</b>
              <span>
                Download the desktop wizard for your operating system.
                ${renderDownloadActionGroup(model, 'step-downloads')}
              </span>
            </li>
            <li><b>2</b><span>Open the wizard and choose <strong>Full hosted SAP MCP setup</strong>.</span></li>
            <li><b>3</b><span>Select detected runtimes such as Codex, Claude, Hermes, or OpenClaw.</span></li>
            <li><b>4</b><span>Restart the agent and connect to the hosted <code>/mcp</code> endpoint.</span></li>
          </ol>
          <div class="inline-actions">
            <a class="button" href="${escapeHtml(model.info.endpoints.docs)}/#/user/06_DESKTOP_GUI_WIZARD">Desktop docs</a>
          </div>
        </article>
        <article class="card">
          <p class="eyebrow">Developer path</p>
          <h3>CLI wizard</h3>
          <p>Best for terminals, servers, and deterministic setup from npm without touching runtime config files by hand.</p>
          <ol class="step-list">
            <li><b>1</b><span>Run the CLI wizard command.</span></li>
            <li><b>2</b><span>Accept the default <code>hosted-api</code> mode for remote SAP MCP.</span></li>
            <li><b>3</b><span>Let the wizard configure hosted <code>sap</code> plus local <code>sap_payments</code>.</span></li>
            <li><b>4</b><span>Call <code>sap_payments_readiness</code>, then use <code>sap_payments_call_paid_tool</code> when hosted tools require x402 payment.</span></li>
          </ol>
          <pre class="code-block"><code>${escapeHtml(model.wizardCommand)}</code></pre>
          <div class="inline-actions">
            <a class="button" href="${escapeHtml(model.info.endpoints.docs)}">Start here</a>
            <a class="button" href="${escapeHtml(model.info.endpoints.docs)}/#/user/04_CLIENT_CONFIGS">Client configs</a>
            <a class="button" href="${escapeHtml(model.info.endpoints.docs)}/#/user/03_PAYMENTS_X402_PAYSH">Payments</a>
          </div>
        </article>
      </div>
    </section>
  `;
}

/**
 * @name renderDownloads
 * @description Renders native wizard download cards and install commands.
 */
export function renderDownloads(model: LandingPageModel): string {
  return `
    <section class="section" id="downloads" aria-labelledby="downloads-title">
      <div class="setup-grid">
        <article class="card">
          <p class="eyebrow" id="downloads-title">Install wizard</p>
          <h2>Choose native or npm setup.</h2>
          <p>Create a local SAP MCP profile, signer, policy limits, hosted client config, and payment bridge. For guided details, start with <a href="${escapeHtml(model.info.endpoints.docs)}">the user docs</a>.</p>
          <div class="command-stack">
            <div>
              <span>Native installer script</span>
              <pre class="code-block"><code>${escapeHtml(model.installScriptCommand)}</code></pre>
            </div>
            <div>
              <span>npm wizard</span>
              <pre class="code-block"><code>${escapeHtml(model.wizardCommand)}</code></pre>
            </div>
          </div>
        </article>
        <article class="card">
          <p class="eyebrow">Native Downloads</p>
          <h2>One-click desktop wizard.</h2>
          <p>Download directly from the GitHub release for v${escapeHtml(model.info.version)}. The public downloads manifest remains available at <a href="${escapeHtml(model.info.endpoints.wizardDownloads)}">/wizard/downloads.json</a>.</p>
          ${renderDownloadActionGroup(model)}
        </article>
      </div>
    </section>
  `;
}

/**
 * @name renderPayments
 * @description Renders x402 and pay.sh integration guidance.
 */
export function renderPayments(model: LandingPageModel): string {
  return `
    <section class="section" id="payments" aria-labelledby="payments-title">
      <div class="section-head">
        <p class="eyebrow" id="payments-title">x402 Challenge Tools For Agents</p>
        <h2>Payment challenges are first-class tools.</h2>
        <p>
          Hosted paid calls return x402 requirements. The local <code>sap_payments</code> bridge
          signs, settles, replays the exact tool call, and returns the receipt without sending
          keypair bytes to OOBE.
        </p>
      </div>
      <div class="install-grid">
        <article class="card">
          <h3>Agent-native paid call flow</h3>
          <div class="timeline">
            <div class="timeline-item"><b>1</b><p>Agent checks <code>sap_payments_readiness</code> for local profile, signer, balance, and policy status.</p></div>
            <div class="timeline-item"><b>2</b><p>Paid tools return an x402 challenge with resource, amount, asset, and payTo.</p></div>
            <div class="timeline-item"><b>3</b><p>Local <code>sap_payments_call_paid_tool</code> signs payment proof and retries the call.</p></div>
            <div class="timeline-item"><b>4</b><p>Hosted MCP verifies settlement and returns the tool output plus receipt.</p></div>
          </div>
          <pre class="code-block"><code>${escapeHtml(model.paidCallCommand)}</code></pre>
        </article>
        <article class="card">
          <h3>Provider metadata</h3>
          <p>pay.sh and x402 discovery endpoints are public, machine-readable, and secret-free.</p>
          <ul>
            <li><strong>x402:</strong> paid MCP tool calls return HTTP 402 with payment requirements, then settle through the OOBE facilitator.</li>
            <li><strong>pay.sh:</strong> public provider YAML is available for catalog and proxy workflows.</li>
            <li>x402 discovery: <a href="${escapeHtml(model.info.endpoints.x402Discovery)}">/.well-known/x402</a></li>
            <li>pay.sh provider YAML: <a href="${escapeHtml(model.info.endpoints.payShProvider)}">/pay/provider.yml</a></li>
            <li>OpenAPI catalog spec: <a href="${escapeHtml(model.info.endpoints.openApi)}">/openapi.json</a></li>
            <li>Addon path: <code>${escapeHtml(model.paidCallAddonPath)}</code></li>
          </ul>
        </article>
      </div>
    </section>
  `;
}

/**
 * @name renderEndpointMap
 * @description Renders operational endpoints and security boundary notes.
 */
export function renderEndpointMap(model: LandingPageModel): string {
  const endpoints = [
    ['POST', model.info.endpoints.mcp],
    ['GET', model.info.endpoints.docs],
    ['GET', model.info.endpoints.health],
    ['GET', model.info.endpoints.serverInfo],
    ['GET', model.info.endpoints.openApi],
    ['GET', model.info.endpoints.x402Discovery],
    ['GET', model.info.endpoints.payShProvider],
    ['GET', model.info.endpoints.smitheryServerCard],
    ['GET', model.info.endpoints.agentCard],
    ['GET', model.info.endpoints.wizardDescriptor],
  ] as const;

  return `
    <section class="section" id="endpoints" aria-labelledby="endpoints-title">
      <div class="endpoint-grid">
        <article class="card">
          <p class="eyebrow" id="endpoints-title">Endpoint map</p>
          <h2>Public surface area.</h2>
          <div class="endpoint-list">
            ${endpoints.map(([method, url]) => `
              <div class="endpoint-row">
                <span class="method-badge method-${escapeHtml(method.toLowerCase())}">${escapeHtml(method)}</span>
                <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>
              </div>
            `).join('')}
          </div>
          <p>MCP clients should connect to <code>/mcp</code> with <code>Accept: application/json, text/event-stream</code>.</p>
        </article>
        <article class="card">
          <p class="eyebrow">Security boundary</p>
          <h2>Non-custodial by default.</h2>
          <ul>
            <li>Keypair bytes are never exposed by public endpoints.</li>
            <li>RPC secrets are redacted from public metadata and UI.</li>
            <li>Paid tools require payment before execution.</li>
            <li>Write tools require a user-controlled local signer or external signer.</li>
          </ul>
        </article>
      </div>
    </section>
  `;
}

/**
 * @name renderFooter
 * @description Renders final docs, marketplace, and protocol links.
 */
export function renderFooter(model: LandingPageModel): string {
  return `
    <footer class="footer">
      <div class="footer-grid">
        <div>
          <strong>SAP MCP Server</strong>
          <p>Hosted by OOBE Protocol for agentic Solana operations.</p>
        </div>
        <div>
          <strong>Site</strong>
          <a href="${escapeHtml(model.info.endpoints.landing)}">Home</a>
          <a href="${escapeHtml(model.info.endpoints.docs)}">Documentation</a>
          <a href="${escapeHtml(model.info.docs.github)}">GitHub</a>
          <a href="${escapeHtml(model.info.docs.npm)}">npm</a>
        </div>
        <div>
          <strong>Discovery</strong>
          <a href="${escapeHtml(model.info.endpoints.serverInfo)}">Server JSON</a>
          <a href="${escapeHtml(model.info.endpoints.openApi)}">OpenAPI</a>
          <a href="${escapeHtml(model.info.endpoints.agentCard)}">Agent card</a>
          <a href="${escapeHtml(model.info.endpoints.smitheryServerCard)}">MCP server card</a>
        </div>
        <div>
          <strong>Payments</strong>
          <a href="${escapeHtml(model.info.endpoints.x402Discovery)}">x402 discovery</a>
          <a href="${escapeHtml(model.info.endpoints.payShProvider)}">pay.sh YAML</a>
          <a href="${escapeHtml(model.info.endpoints.docs)}/#/user/03_PAYMENTS_X402_PAYSH">Payment docs</a>
          <a href="${escapeHtml(model.info.endpoints.wizardDownloads)}">Wizard downloads</a>
        </div>
      </div>
    </footer>
  `;
}
