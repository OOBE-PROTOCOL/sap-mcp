/// <reference types="vite/client" />

type RuntimeStatus = {
  id: 'codex' | 'claude' | 'hermes' | 'openclaw';
  label: string;
  detected: boolean;
  paths: string[];
  autoConfigurable: boolean;
  recommendation: string;
};

type WizardDraft = {
  profileName: string;
  mode: 'readonly' | 'local-dev-keypair' | 'external-signer' | 'delegated-session' | 'hosted-api';
  rpcUrl: string;
  createNewWallet: boolean;
  walletPath?: string;
  maxTxValueSol: number;
  dailyLimitSol: number;
  enableBento: boolean;
  bentoApiKey?: string;
  bentoAgentId?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableMetrics: boolean;
  configureCodex: boolean;
  installAddonBundle: boolean;
};

type WizardResult = {
  setup: {
    configPath: string;
    walletPath?: string;
    walletCreated: boolean;
    config: {
      agentPubkey?: string;
      rpcUrl: string;
      mode: string;
    };
  };
  runtimeActions: Array<{
    runtime: string;
    status: 'configured' | 'installed' | 'skipped';
    path?: string;
    backupPath?: string;
    message: string;
  }>;
};

interface Window {
  sapMcpWizard: {
    getInitialState: () => Promise<{ draft: WizardDraft; runtimes: RuntimeStatus[] }>;
    save: (draft: WizardDraft) => Promise<WizardResult>;
    openExternal: (url: string) => Promise<void>;
  };
}
