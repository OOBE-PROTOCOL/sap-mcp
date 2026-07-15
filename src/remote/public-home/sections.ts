import { escapeHtml } from './escape.js';
import type { LandingLink, LandingPageModel } from './types.js';

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
 * @name renderTopNavigation
 * @description Renders the glass top navigation used by the hosted landing page.
 */
export function renderTopNavigation(model: LandingPageModel): string {
  const links: LandingLink[] = [
    { label: 'Docs', href: model.info.endpoints.docs },
    { label: 'Downloads', href: '#downloads' },
    { label: 'Payments', href: '#payments' },
    { label: 'OpenAPI', href: model.info.endpoints.openApi },
    { label: 'pay.sh', href: model.info.endpoints.payShProvider },
  ];

  return `
    <nav class="site-nav" aria-label="Primary navigation">
      <a class="brand" href="${escapeHtml(model.info.endpoints.landing)}">
        <img src="/favicon.png" width="42" height="42" alt="SAP MCP">
        <span>
          <strong>SAP MCP</strong>
          <span>OOBE Protocol</span>
        </span>
      </a>
      <div class="nav-links">
        ${links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('')}
      </div>
      <div class="nav-actions">
        <span class="version-pill">v${escapeHtml(model.info.version)}</span>
        <a class="button primary" href="#install">Install</a>
      </div>
    </nav>
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
      <div>
        <p class="eyebrow">OOBE Protocol · ${escapeHtml(endpointLabel)}</p>
        <h1>Solana-native operations for agent runtimes.</h1>
        <p class="lead">
          SAP MCP connects Codex, Claude, Hermes, OpenClaw and custom agents to Solana RPC,
          DeFi protocol tools, Synapse Agent Protocol primitives, SNS identity, and paid
          x402/pay.sh execution without OOBE ever receiving user keypair bytes.
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
      <div class="engine-card" data-engine-scene aria-label="Animated SAP MCP protocol engine">
        <div class="engine-stage">
          <div class="engine-core">
            <div class="engine-ring"></div>
            <div class="engine-ring"></div>
            <div class="engine-ring"></div>
            <div class="engine-trace"></div>
            <div class="engine-dial">SAP</div>
            <div class="engine-node node-a"><strong>MCP</strong>Tools</div>
            <div class="engine-node node-b"><strong>x402</strong>Receipts</div>
            <div class="engine-node node-c"><strong>SNS</strong>Identity</div>
            <div class="engine-node node-d"><strong>RPC</strong>Solana</div>
          </div>
        </div>
        <div class="engine-caption">
          <code>${escapeHtml(model.info.endpoints.mcp)}</code>
          <p>One hosted gateway. Local signatures. Metered execution.</p>
        </div>
      </div>
    </header>
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
    <section class="section" aria-labelledby="metrics-title">
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
          <span>Payment Requests</span>
          <strong>${escapeHtml(formatInteger(stats.totalPaymentRequests))}</strong>
          <p>${escapeHtml(formatInteger(stats.totalVerifiedPayments))} verified, ${escapeHtml(formatInteger(stats.totalFailedSettlements))} failed settlements.</p>
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
    ['Solana DeFi', 'Jupiter, Raydium, Orca, Meteora, Drift and market data flows.', 'coral'],
    ['Solana RPC', 'Balances, token accounts, DAS assets, transactions, programs and simulation.', 'yellow'],
    ['SAP Protocol', 'Agent registry, discovery, reputation, escrow, settlement and attestations.', 'green'],
    ['Identity', 'SNS domain checks, reverse lookup, linked identity and agent profile context.', 'blue'],
    ['Payments', 'x402 challenge tools, pay.sh provider metadata, receipts and paid-call replay.', 'aqua'],
    ['Policy', 'Local limits and optional Bento Guard policy checks before sensitive execution.', 'green'],
    ['Skills', 'Bundled agent skills explain how to choose tools, fetch context and avoid waste.', 'blue'],
    ['Remote-first', 'Hosted Streamable HTTP with local non-custodial signing for paid/write calls.', 'yellow'],
  ] as const;

  return `
    <section class="section paper" id="capabilities" aria-labelledby="capabilities-title">
      <div class="section-head">
        <p class="eyebrow" id="capabilities-title">Protocol surface</p>
        <h2>Three buckets. One agent operations layer.</h2>
        <p>SAP MCP exposes Solana DeFi protocols, Solana RPC methods, and Synapse Agent Protocol operations through one MCP-compatible interface.</p>
      </div>
      <div class="feature-grid">
        ${features.map(([label, description, tone]) => `
          <article class="feature" data-tone="${escapeHtml(tone)}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(label)}</strong>
            <p>${escapeHtml(description)}</p>
          </article>
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
            <li><b>1</b><span>Download the Windows, macOS, or Linux wizard below.</span></li>
            <li><b>2</b><span>Open the wizard and choose <strong>Full hosted SAP MCP setup</strong>.</span></li>
            <li><b>3</b><span>Select detected runtimes such as Codex, Claude, Hermes, or OpenClaw.</span></li>
            <li><b>4</b><span>Restart the agent and connect to the hosted <code>/mcp</code> endpoint.</span></li>
          </ol>
          <div class="inline-actions">
            <a class="button" href="${escapeHtml(model.info.endpoints.docs)}/#/user/06_DESKTOP_GUI_WIZARD">Desktop docs</a>
            <a class="button" href="${escapeHtml(model.info.endpoints.wizardDownloads)}">Downloads JSON</a>
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
            <li><b>4</b><span>Use <code>sap_payments_call_paid_tool</code> when hosted tools require x402 payment.</span></li>
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
  const downloads = [
    ['Windows', 'x64 setup .exe', 'Win', model.info.downloads.desktopWizard.windowsX64Setup],
    ['macOS', 'Apple Silicon .dmg', 'mac', model.info.downloads.desktopWizard.macosArm64Dmg],
    ['Linux', 'x64 tar.gz', 'Lin', model.info.downloads.desktopWizard.linuxX64TarGz],
  ] as const;

  return `
    <section class="section" id="downloads" aria-labelledby="downloads-title">
      <div class="install-grid">
        <article class="card">
          <p class="eyebrow" id="downloads-title">Install wizard</p>
          <h2>Choose native or npm setup.</h2>
          <p>Create a local SAP MCP profile, signer, policy limits, hosted client config, and payment bridge. For guided details, start with <a href="${escapeHtml(model.info.endpoints.docs)}">the user docs</a>.</p>
          <pre class="code-block"><code>${escapeHtml(model.installScriptCommand)}</code></pre>
          <pre class="code-block"><code>${escapeHtml(model.wizardCommand)}</code></pre>
        </article>
        <article class="card">
          <p class="eyebrow">Native Downloads</p>
          <h2>One-click desktop wizard.</h2>
          <p>Download directly from the GitHub release for v${escapeHtml(model.info.version)}. The public downloads manifest remains available at <a href="${escapeHtml(model.info.endpoints.wizardDownloads)}">/wizard/downloads.json</a>.</p>
          <div class="download-grid">
            ${downloads.map(([label, caption, mark, href]) => `
              <a class="download-card" href="${escapeHtml(href)}">
                <span class="os-mark" aria-hidden="true">${escapeHtml(mark)}</span>
                <span>
                  <strong>${escapeHtml(label)}</strong>
                  <span>${escapeHtml(caption)}</span>
                </span>
              </a>
            `).join('')}
          </div>
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
            <div class="timeline-item"><b>1</b><p>Agent calls hosted SAP MCP tool.</p></div>
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
          <div class="timeline">
            ${endpoints.map(([method, url]) => `
              <div class="timeline-item"><b>${escapeHtml(method)}</b><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p></div>
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
