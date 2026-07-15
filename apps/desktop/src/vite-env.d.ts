/// <reference types="vite/client" />

type RuntimeStatus = {
  id: 'codex' | 'claude' | 'hermes' | 'openclaw';
  label: string;
  detected: boolean;
  paths: string[];
  autoConfigurable: boolean;
  recommendation: string;
};

type ProfileStatus = {
  name: string;
  path: string;
  active: boolean;
  mode?: WizardDraft['mode'];
  rpcUrl?: string;
  network?: string;
  agentPubkey?: string;
  walletPath?: string;
  walletExists: boolean;
  externalSignerConfigured: boolean;
  readiness: 'ready' | 'needs-attention';
  issues: string[];
};

type WizardDraft = {
  setupMode: 'full' | 'payments-only';
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
  configureRuntimes: RuntimeStatus['id'][];
  installAddonBundle: boolean;
};

type WizardResult = {
  setupMode: 'full' | 'payments-only';
  readiness: {
    status: 'ready' | 'needs-attention';
    profileName?: string;
    profileIssues: string[];
    runtimeIssues: Array<{
      runtime: string;
      path: string;
      issues: string[];
    }>;
    nextSteps: string[];
  };
  setup?: {
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
    getInitialState: () => Promise<{ draft: WizardDraft; runtimes: RuntimeStatus[]; profiles: ProfileStatus[] }>;
    save: (draft: WizardDraft) => Promise<WizardResult>;
    openExternal: (url: string) => Promise<void>;
  };
}
