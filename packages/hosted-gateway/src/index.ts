/**
 * @name remote/index
 * @description Stable hosted gateway API surface for SAP MCP Streamable HTTP deployments.
 *
 * Keep this barrel explicit: it is the public modular boundary for hosted
 * gateway embedding, discovery documents, marketplace metadata, and docs assets.
 */

export {
  RemoteMCPServer,
  buildA2AAgentCard,
  buildDocsHtml,
  buildLandingHtml,
  buildMarketplaceConfigurationMetadata,
  buildOpenApiSpec,
  buildPremiumDiscoveryDocument,
  buildPublicPayShProviderYaml,
  buildPublicServerInfo,
  buildPublicToolCatalogDocument,
  buildStaticServerCard,
  buildWizardInstallDescriptor,
  buildWizardInstallScript,
  buildX402DiscoveryDocument,
  defaultRemoteConfig,
  parseApiKeys,
  readPublicPaymentStats,
  readSmitheryConfigSchema,
  resolvePublicDocsMarkdown,
  resolvePublicLogoAsset,
  startRemoteMcpServerProcess,
} from './server.js';

export type {
  A2AAgentCard,
  MarketplaceConfigurationMetadata,
  PublicLogoAsset,
  PublicMarkdownAsset,
  PublicPaymentDiscovery,
  PublicPaymentPriceRange,
  PublicPaymentStats,
  PublicServerInfo,
  RemoteConcurrencyConfig,
  RemoteHttpTuningConfig,
  RemoteMCPConfig,
  RemoteSessionConfig,
  StaticServerCard,
  WizardInstallDescriptor,
  X402DiscoveryDocument,
} from './server.js';
