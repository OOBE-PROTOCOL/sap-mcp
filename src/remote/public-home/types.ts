/**
 * @name LandingEndpoint
 * @description Public HTML preview surface rendered by the hosted MCP server.
 */
export type LandingEndpoint = 'root' | 'mcp';

/**
 * @name LandingPublicServerInfo
 * @description Secret-free public server metadata used to render the hosted landing page.
 */
export interface LandingPublicServerInfo {
  title: string;
  displayName: string;
  description: string;
  version: string;
  homepage: string;
  icon: string;
  endpoints: {
    landing: string;
    docs: string;
    mcp: string;
    txSubmit: string;
    health: string;
    serverInfo: string;
    pricing: string;
    openApi: string;
    x402Discovery: string;
    smitheryServerCard: string;
    payShProvider: string;
    agentCard: string;
    wizardDescriptor: string;
    wizardDownloads: string;
    wizardInstallScript: string;
    favicon: string;
    faviconIco: string;
  };
  downloads: {
    release: string;
    desktopWizard: {
      macosArm64Dmg: string;
      windowsX64Setup: string;
      linuxX64TarGz: string;
    };
  };
  payments?: {
    provider: 'x402' | 'pay-sh';
    network: string;
    assetSymbol: 'USDC';
    payTo: string;
    facilitator?: {
      role: 'x402-svm-fee-payer';
      publicKey: string;
    };
  };
  docs: {
    npm: string;
    github: string;
    userDocs: string;
  };
}

/**
 * @name LandingPublicPaymentStats
 * @description Public-safe aggregate payment metrics displayed on the hosted landing page.
 */
export interface LandingPublicPaymentStats {
  totalVolumeUsd: number;
  totalSettlements: number;
  totalPaymentRequests: number;
  totalVerifiedPayments: number;
  totalFailedSettlements: number;
  uniqueRemoteCallers: number;
  uniqueUserAgents: number;
  lastSettlementAt?: string;
  ledgerAvailable: boolean;
}

/**
 * @name LandingPageModel
 * @description Complete data contract for rendering the hosted SAP MCP public homepage.
 */
export interface LandingPageModel {
  endpoint: LandingEndpoint;
  info: LandingPublicServerInfo;
  paymentStats: LandingPublicPaymentStats;
  pageUrl: string;
  title: string;
  installScriptCommand: string;
  wizardCommand: string;
  repairCommand: string;
  paidCallCommand: string;
  paidCallAddonPath: string;
}

/**
 * @name LandingLink
 * @description Public navigation link rendered in the top navigation or footer.
 */
export interface LandingLink {
  label: string;
  href: string;
  tone?: 'primary' | 'default';
}
