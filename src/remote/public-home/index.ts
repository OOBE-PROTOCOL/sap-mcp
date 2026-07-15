import { escapeHtml, escapeJsonForHtml } from './escape.js';
import {
  renderDownloads,
  renderDocsLaunchpad,
  renderEndpointMap,
  renderFeatureEngine,
  renderFooter,
  renderHero,
  renderHeroBento,
  renderIntegrationPath,
  renderMetrics,
  renderPayments,
  renderRegistryListings,
  renderScrollMachine,
  renderTopNavigation,
} from './sections.js';
import { LANDING_SCRIPT } from './scripts.js';
import { LANDING_CSS } from './styles.js';
import type { LandingPageModel } from './types.js';

export type { LandingEndpoint, LandingPageModel, LandingPublicPaymentStats, LandingPublicServerInfo } from './types.js';

/**
 * @name renderLandingPage
 * @description Renders the SAP MCP hosted homepage and MCP preview page.
 */
export function renderLandingPage(model: LandingPageModel): string {
  const publicInfo = escapeJsonForHtml(model.info);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(model.title)}</title>
  <meta name="description" content="${escapeHtml(model.info.description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(model.pageUrl)}">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(model.title)}">
  <meta property="og:description" content="${escapeHtml(model.info.description)}">
  <meta property="og:url" content="${escapeHtml(model.pageUrl)}">
  <meta property="og:image" content="${escapeHtml(model.info.endpoints.favicon)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(model.title)}">
  <meta name="twitter:description" content="${escapeHtml(model.info.description)}">
  <meta name="twitter:image" content="${escapeHtml(model.info.endpoints.favicon)}">
  <script type="application/ld+json">${publicInfo}</script>
  <style>${LANDING_CSS}</style>
</head>
<body>
  <a class="skip-link" href="#install">Skip to install</a>
  ${renderTopNavigation(model)}
  <main class="page-shell">
    ${renderHero(model)}
    ${renderHeroBento(model)}
    ${renderMetrics(model)}
    ${renderScrollMachine(model)}
    ${renderFeatureEngine()}
    ${renderRegistryListings()}
    ${renderIntegrationPath(model)}
    ${renderDownloads(model)}
    ${renderPayments(model)}
    ${renderDocsLaunchpad(model)}
    ${renderEndpointMap(model)}
    ${renderFooter(model)}
  </main>
  <script>${LANDING_SCRIPT}</script>
</body>
</html>`;
}
