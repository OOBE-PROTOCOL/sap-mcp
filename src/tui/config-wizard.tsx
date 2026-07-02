/**
 * SAP MCP Server - Professional Configuration Wizard
 * 
 * Beautiful, production-grade TUI wizard with:
 * - Animated water-themed UI
 * - Step-by-step configuration
 * - Bento Guard integration (optional)
 * - Security limits configuration
 * - Professional validation and error handling
 */

import React, { useState, useEffect } from 'react';
import { render, Text, Box } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import {
  defaultWalletPath,
  isValidProfileName,
  normalizeProfileName,
  saveTuiWizardConfig,
  type TuiWizardSaveResult,
} from './wizard-save.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Internal type alias for wizard step values.
 */
type WizardStep = 
  | 'welcome'
  | 'profile'
  | 'mode'
  | 'rpc'
  | 'wallet'
  | 'security'
  | 'bento'
  | 'logging'
  | 'summary'
  | 'saving'
  | 'done';

/**
 * Internal contract describing config state data.
 */
interface ConfigState {
  profileName: string;
  mode: string;
  rpcUrl: string;
  walletPath?: string;
  createNewWallet?: boolean;
  maxTxValueSol: number;
  dailyLimitSol: number;
  enableBento: boolean;
  bentoApiKey?: string;
  bentoAgentId?: string;
  logLevel: string;
  enableMetrics: boolean;
}

/**
 * Internal contract describing select item data.
 */
interface SelectItem {
  label: string;
  value: string;
  hint?: string;
}

// ============================================================================
// Animated Components
// ============================================================================

/**
 * Internal helper for the water wave operation.
 */
function WaterWave({ frames = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] }: { frames?: string[] }) {
  const [frame, setFrame] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 100);
    return () => clearInterval(interval);
  }, [frames.length]);
  
  return (
    <Text color="cyan">
      {frames[frame]}{frames[(frame + 1) % frames.length]}{frames[(frame + 2) % frames.length]}
      {frames[(frame + 3) % frames.length]}{frames[(frame + 4) % frames.length]}
      {frames[(frame + 5) % frames.length]}{frames[(frame + 6) % frames.length]}
      {frames[(frame + 7) % frames.length]}
    </Text>
  );
}

/**
 * Internal helper for the animated title operation.
 */
function AnimatedTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % 4);
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  
  const decorations = ['╔═', '║ ', '╚═', '  '];
  const dec = decorations[phase];
  
  return (
    <Box flexDirection="column" alignItems="center">
      <Text color="cyan" bold>
        {dec} {title} {dec.split('').reverse().join('')}
      </Text>
      {subtitle && (
        <Text color="gray" dimColor>
          {subtitle}
        </Text>
      )}
      <WaterWave />
    </Box>
  );
}

/**
 * Internal helper for the step progress operation.
 */
function StepProgress({ current, total }: { current: number; total: number }) {
  const steps = [];
  for (let i = 1; i <= total; i++) {
    const isActive = i === current;
    const isCompleted = i < current;
    
    steps.push(
      <Text key={i}>
        {isCompleted ? (
          <Text color="green">✓</Text>
        ) : isActive ? (
          <Text color="cyan" bold>●</Text>
        ) : (
          <Text color="gray" dimColor>○</Text>
        )}
        {i < total && <Text color="gray"> ─ </Text>}
      </Text>
    );
  }
  
  return (
    <Box flexDirection="column" alignItems="center">
      <Text>{steps}</Text>
      <Text color="gray" dimColor>
        Step {current} of {total}
      </Text>
    </Box>
  );
}

/**
 * Internal helper for the panel operation.
 */
function Panel({ 
  title, 
  children, 
  width = 70,
  color = 'cyan'
}: { 
  title: string; 
  children: React.ReactNode; 
  width?: number;
  color?: string;
}) {
  const emptyLine = ' '.repeat(width - 4);
  
  return (
    <Box flexDirection="column" alignItems="center">
      <Text color={color}>
        {'┌' + '─'.repeat(width - 2) + '┐'}
      </Text>
      <Text color={color}>
        {'│'}
        <Text color="white">{' '.repeat(Math.floor((width - 2 - title.length) / 2))}</Text>
        <Text color={color} bold>{title}</Text>
        <Text color="white">{' '.repeat(Math.ceil((width - 2 - title.length) / 2))}</Text>
        {'│'}
      </Text>
      <Text color={color}>{'│'}<Text color="white">{emptyLine}</Text>{'│'}</Text>
      <Text color={color}>
        {'│ '}
        {children}
        {' │'}
      </Text>
      <Text color={color}>{'│'}<Text color="white">{emptyLine}</Text>{'│'}</Text>
      <Text color={color}>
        {'└' + '─'.repeat(width - 2) + '┘'}
      </Text>
    </Box>
  );
}

/**
 * Internal helper for the loading screen operation.
 */
function LoadingScreen({ message, subMessage }: { message: string; subMessage?: string }) {
  return (
    <Box flexDirection="column" alignItems="center" marginTop={5}>
      <WaterWave />
      <Box marginTop={1}>
        <Text color="cyan" bold>
          <Spinner type="dots" /> {message}
        </Text>
      </Box>
      {subMessage && (
        <Text color="gray" dimColor>
          {subMessage}
        </Text>
      )}
      <WaterWave />
    </Box>
  );
}

/**
 * Internal helper for the success screen operation.
 */
function SuccessScreen({ title, config, result }: { title: string; config: Partial<ConfigState>; result?: TuiWizardSaveResult }) {
  return (
    <Box flexDirection="column" alignItems="center" marginTop={3}>
      <Text color="green" bold>╔══════════════════════════════════════════════════════╗</Text>
      <Text color="green" bold>║   {title}</Text>
      <Text color="green" bold>╠══════════════════════════════════════════════════════╣</Text>
      <Text> </Text>
      <Text color="white">  Profile:     </Text><Text color="cyan">{config.profileName}</Text>
      <Text color="white">  Mode:        </Text><Text color="cyan">{config.mode}</Text>
      <Text color="white">  Network:     </Text><Text color="cyan">{config.rpcUrl?.includes('devnet') ? 'Devnet' : config.rpcUrl?.includes('testnet') ? 'Testnet' : 'Mainnet'}</Text>
      <Text color="white">  Wallet:      </Text><Text color="cyan">{config.createNewWallet ? 'New (Generated)' : config.walletPath || 'Existing'}</Text>
      <Text color="white">  Max Tx:      </Text><Text color="cyan">{config.maxTxValueSol} SOL</Text>
      <Text color="white">  Daily Limit: </Text><Text color="cyan">{config.dailyLimitSol} SOL</Text>
      <Text color="white">  Bento Guard: </Text><Text color={config.enableBento ? 'green' : 'gray'}>{config.enableBento ? 'Enabled ✓' : 'Disabled'}</Text>
      <Text color="white">  Log Level:   </Text><Text color="cyan">{config.logLevel}</Text>
      <Text> </Text>
      <Text color="green" bold>╚══════════════════════════════════════════════════════╝</Text>
      <Text> </Text>
      <Text color="gray" dimColor>Config saved to {result?.configPath || '~/.config/mcp-sap/config.json'}</Text>
      {result?.walletPath && (
        <Text color="gray" dimColor>Wallet: {result.walletPath}</Text>
      )}
      {result?.agentPubkey && (
        <Text color="gray" dimColor>Agent Pubkey: {result.agentPubkey}</Text>
      )}
      <Text color="cyan">Secret material was never printed or injected into MCP client config.</Text>
      <Text color="gray" dimColor>Run: npx sap-mcp-server</Text>
      <Text color="gray" dimColor>Inspect later: npx sap-mcp-config show</Text>
    </Box>
  );
}

// ============================================================================
// Wizard Steps
// ============================================================================

/**
 * Internal helper for the welcome step operation.
 */
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <Box flexDirection="column" alignItems="center" marginTop={3}>
      <AnimatedTitle 
        title="SAP MCP Configuration Wizard" 
        subtitle="Aqua guided setup for SAP profiles, wallets, policies, and MCP clients"
      />
      <Box marginTop={2} flexDirection="column" alignItems="center">
        <Text> </Text>
        <Text color="white">
          Create a named SAP MCP profile with clear wallet isolation.
        </Text>
        <Text color="white">
          Review every value before saving. Keypair bytes are never displayed.
        </Text>
        <Text color="gray" dimColor>
          Config lives in ~/.config/mcp-sap and follows the active profile pointer.
        </Text>
        <Text> </Text>
        <WaterWave />
        <Text> </Text>
        <Text color="gray" dimColor>Press Enter to continue</Text>
        <SelectInput
          items={[{ label: 'Continue →', value: 'continue' }]}
          onSelect={onNext}
        />
      </Box>
    </Box>
  );
}

/**
 * Internal helper for the profile step operation.
 */
function ProfileStep({ onSelect }: { onSelect: (profileName: string) => void }) {
  const [profileName, setProfileName] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submitProfile = () => {
    const normalized = normalizeProfileName(profileName);
    if (!isValidProfileName(normalized)) {
      setError('Use a real profile name: lowercase letters, numbers, and hyphens only.');
      return;
    }

    onSelect(normalized);
  };

  return (
    <Box flexDirection="column" alignItems="center" marginTop={3}>
      <StepProgress current={1} total={8} />
      <Box marginTop={1}>
        <Panel title="Agent Profile">
          <Text color="white">Name the isolated identity this agent will load</Text>
        </Panel>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="gray" dimColor>Profile name:</Text>
        <TextInput
          value={profileName}
          onChange={(value) => {
            setProfileName(value);
            setError(undefined);
          }}
          onSubmit={submitProfile}
          placeholder="gianni-market-nft-agent"
        />
        <Text color="gray" dimColor>Use lowercase words with hyphens. Avoid "default" for production agents.</Text>
        {error && <Text color="red">{error}</Text>}
      </Box>
    </Box>
  );
}

/**
 * Internal helper for the mode step operation.
 */
function ModeStep({ onSelect }: { onSelect: (mode: string) => void }) {
  const options: SelectItem[] = [
    { label: 'Read-Only - safest, no transactions', value: 'readonly', hint: 'Safest - no transactions' },
    { label: 'Local Dev Keypair - dedicated profile wallet', value: 'local-dev-keypair', hint: 'Development with wallet file' },
    { label: 'Delegated Session - session-scoped with limits', value: 'delegated-session', hint: 'Session-based with limits' },
    { label: 'External Signer - Ledger, Fireblocks, or signing proxy', value: 'external-signer', hint: 'Ledger, Fireblocks, etc.' },
    { label: 'Hosted SAP MCP Server - mcp.sap.oobeprotocol.ai', value: 'hosted-api', hint: 'OOBE hosted MCP, user-controlled signing' },
  ];
  
  return (
    <Box flexDirection="column" alignItems="center" marginTop={3}>
      <StepProgress current={2} total={8} />
      <Box marginTop={1}>
        <Panel title="Connection & Signing Mode">
          <Text color="white">Choose where SAP MCP runs and who controls signatures</Text>
          <Text color="cyan">Hosted SAP MCP Server: https://mcp.sap.oobeprotocol.ai/mcp</Text>
          <Text color="gray">Hosted mode connects agents remotely while wallet/payment signatures stay local or external.</Text>
        </Panel>
      </Box>
      <Box marginTop={1}>
        <SelectInput items={options} onSelect={(item) => onSelect(item.value)} />
      </Box>
    </Box>
  );
}

/**
 * Internal helper for the rpc step operation.
 */
function RpcStep({ onSelect, mode }: { onSelect: (rpc: string) => void; mode: string }) {
  const isDev = mode === 'local-dev-keypair';
  const defaultRpc = isDev ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
  const [rpcUrl, setRpcUrl] = useState(defaultRpc);
  const [submitted, setSubmitted] = useState(false);
  
  const options: SelectItem[] = [
    { label: 'Mainnet Beta', value: 'https://api.mainnet-beta.solana.com', hint: 'Production network' },
    { label: 'Devnet', value: 'https://api.devnet.solana.com', hint: 'Testing network (free)' },
    { label: 'Testnet', value: 'https://api.testnet.solana.com', hint: 'Staging network' },
    { label: 'Custom RPC', value: 'custom', hint: 'Enter your own endpoint' },
  ];
  
  const handleSelect = (item: SelectItem) => {
    if (item.value === 'custom') {
      setSubmitted(true);
    } else {
      onSelect(item.value);
    }
  };
  
  const handleSubmit = () => {
    if (rpcUrl.trim()) {
      onSelect(rpcUrl.trim());
    }
  };
  
  return (
    <Box flexDirection="column" alignItems="center" marginTop={3}>
      <StepProgress current={3} total={8} />
      <Box marginTop={1}>
        <Panel title="Solana RPC Endpoint">
          <Text color="white">Network used by every SAP and Solana tool call</Text>
        </Panel>
      </Box>
      <Box marginTop={1} flexDirection="column" alignItems="center">
        {!submitted ? (
          <SelectInput items={options} onSelect={handleSelect} />
        ) : (
          <Box flexDirection="column">
            <Text color="gray" dimColor>Enter custom RPC URL:</Text>
            <TextInput
              value={rpcUrl}
              onChange={setRpcUrl}
              onSubmit={handleSubmit}
              placeholder="https://..."
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * Internal helper for the wallet step operation.
 */
function WalletStep({ 
  onSelect, 
  mode,
  profileName,
}: { 
  onSelect: (wallet: { path?: string; createNew?: boolean }) => void; 
  mode: string;
  profileName: string;
}) {
  const [enterExisting, setEnterExisting] = useState(false);
  const [walletPath, setWalletPath] = useState(defaultWalletPath(profileName));

  if (mode === 'readonly') {
    useEffect(() => {
      onSelect({});
    }, []);
    return (
      <Box flexDirection="column" alignItems="center" marginTop={5}>
        <Text color="gray">Read-only mode - no wallet needed</Text>
        <Spinner type="dots" />
      </Box>
    );
  }
  
  const options: SelectItem[] = [
    { label: 'Create new wallet', value: 'new', hint: `Generate ${profileName}-keypair.json` },
    { label: 'Use existing wallet', value: 'existing', hint: 'Provide explicit keypair path' },
  ];

  if (enterExisting) {
    return (
      <Box flexDirection="column" alignItems="center" marginTop={3}>
        <StepProgress current={4} total={8} />
        <Box marginTop={1}>
          <Panel title="Wallet Path">
            <Text color="white">Store only the keypair path, never the bytes</Text>
          </Panel>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color="gray" dimColor>Wallet path:</Text>
          <TextInput
            value={walletPath}
            onChange={setWalletPath}
            onSubmit={() => onSelect({ path: walletPath.trim(), createNew: false })}
            placeholder={defaultWalletPath(profileName)}
          />
          <Text color="gray" dimColor>Use a dedicated SAP MCP wallet, not ~/.config/solana/id.json.</Text>
        </Box>
      </Box>
    );
  }
  
  return (
    <Box flexDirection="column" alignItems="center" marginTop={3}>
      <StepProgress current={4} total={8} />
      <Box marginTop={1}>
        <Panel title="Wallet Configuration">
          <Text color="white">Use a dedicated wallet for profile-owned signing</Text>
        </Panel>
      </Box>
      <Text color="gray" dimColor>The wizard never modifies the Solana CLI keypair.</Text>
      <Box marginTop={1}>
        <SelectInput 
          items={options} 
          onSelect={(item) => {
            if (item.value === 'existing') {
              setEnterExisting(true);
              return;
            }
            onSelect({ createNew: true });
          }} 
        />
      </Box>
    </Box>
  );
}

/**
 * Internal helper for the security step operation.
 */
function SecurityStep({ onSelect }: { onSelect: (limits: { max: number; daily: number }) => void }) {
  const [maxTx, setMaxTx] = useState('1.0');
  const [daily, setDaily] = useState('10.0');
  const [step, setStep] = useState(0);
  
  const handleMaxSubmit = () => {
    setStep(1);
  };
  
  const handleDailySubmit = () => {
    onSelect({
      max: parseFloat(maxTx) || 1.0,
      daily: parseFloat(daily) || 10.0,
    });
  };
  
  return (
    <Box flexDirection="column" alignItems="center" marginTop={3}>
      <StepProgress current={5} total={8} />
      <Box marginTop={1}>
        <Panel title="Security Limits">
          <Text color="white">Policy guardrails checked before signing</Text>
        </Panel>
      </Box>
      <Box marginTop={1} flexDirection="column" alignItems="center">
        {step === 0 ? (
          <Box flexDirection="column">
            <Text color="gray" dimColor>Max transaction value (SOL):</Text>
            <TextInput
              value={maxTx}
              onChange={setMaxTx}
              onSubmit={handleMaxSubmit}
              placeholder="1.0"
            />
            <Text color="gray" dimColor>Hard ceiling for a single transaction.</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text color="gray" dimColor>Daily spending limit (SOL):</Text>
            <TextInput
              value={daily}
              onChange={setDaily}
              onSubmit={handleDailySubmit}
              placeholder="10.0"
            />
            <Text color="gray" dimColor>Total allowed native SOL value per day.</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * Internal helper for the bento step operation.
 */
function BentoStep({ onSelect }: { onSelect: (bento: { enabled: boolean; apiKey?: string; agentId?: string }) => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [agentId, setAgentId] = useState('');
  const [step, setStep] = useState(0);
  
  const handleEnableSelect = (item: SelectItem) => {
    setEnabled(item.value === 'yes');
    if (item.value === 'no') {
      onSelect({ enabled: false });
    } else {
      setStep(1);
    }
  };
  
  const handleApiKeySubmit = () => {
    if (apiKey.trim()) {
      setStep(2);
    }
  };
  
  const handleAgentIdSubmit = () => {
    onSelect({
      enabled: true,
      apiKey: apiKey.trim(),
      agentId: agentId.trim() || `sap-mcp-server-${Math.random().toString(36).substring(2, 8)}`,
    });
  };
  
  const yesNoOptions: SelectItem[] = [
    { label: 'Yes, enable Bento Guard', value: 'yes', hint: 'AI-powered security + escalation' },
    { label: 'No, use local policies only', value: 'no', hint: 'Deterministic rules only' },
  ];
  
  return (
    <Box flexDirection="column" alignItems="center" marginTop={3}>
      <StepProgress current={6} total={8} />
      <Box marginTop={1}>
        <Panel title="Bento Guard Integration" color="cyan">
          <Text color="white">Optional AI-assisted policy layer after local checks</Text>
        </Panel>
      </Box>
      <Box marginTop={1} flexDirection="column" alignItems="center">
        {step === 0 && (
          <Box flexDirection="column">
            <Text color="white" wrap="truncate">
              Bento adds intent scoring, escalation, and policy telemetry.
            </Text>
            <Text color="white" wrap="truncate">
              Local policy remains the deterministic guardrail.
            </Text>
            <Text color="gray" dimColor>Requires credentials from https://app.bentoguard.xyz</Text>
            <Text> </Text>
            <SelectInput items={yesNoOptions} onSelect={handleEnableSelect} />
          </Box>
        )}
        {step === 1 && (
          <Box flexDirection="column">
            <Text color="gray" dimColor>Bento API Key:</Text>
            <TextInput
              value={apiKey}
              onChange={setApiKey}
              onSubmit={handleApiKeySubmit}
              placeholder="bg_..."
            />
            <Text color="gray" dimColor>The key is saved to config and redacted in summaries.</Text>
          </Box>
        )}
        {step === 2 && (
          <Box flexDirection="column">
            <Text color="gray" dimColor>Agent ID (optional):</Text>
            <TextInput
              value={agentId}
              onChange={setAgentId}
              onSubmit={handleAgentIdSubmit}
              placeholder="sap-mcp-server-001"
            />
            <Text color="gray" dimColor>This label appears in Bento policy logs.</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * Internal helper for the logging step operation.
 */
function LoggingStep({ onSelect }: { onSelect: (logging: { level: string; metrics: boolean }) => void }) {
  const options: SelectItem[] = [
    { label: 'Debug', value: 'debug', hint: 'Verbose logging for development' },
    { label: 'Info', value: 'info', hint: 'Standard production logging' },
    { label: 'Warn', value: 'warn', hint: 'Only warnings and errors' },
    { label: 'Error', value: 'error', hint: 'Errors only' },
  ];
  
  return (
    <Box flexDirection="column" alignItems="center" marginTop={3}>
      <StepProgress current={7} total={8} />
      <Box marginTop={1}>
        <Panel title="Logging & Observability">
          <Text color="white">Choose how much runtime detail SAP MCP should write</Text>
        </Panel>
      </Box>
      <Text color="gray" dimColor>Info is recommended for normal use. Debug is best while integrating clients.</Text>
      <Box marginTop={1}>
        <SelectInput 
          items={options} 
          onSelect={(item) => onSelect({ level: item.value, metrics: false })} 
        />
      </Box>
    </Box>
  );
}

/**
 * Internal helper for the summary step operation.
 */
function SummaryStep({ 
  config, 
  onConfirm 
}: { 
  config: ConfigState; 
  onConfirm: () => void;
}) {
  return (
    <Box flexDirection="column" alignItems="center" marginTop={3}>
      <StepProgress current={8} total={8} />
      <Box marginTop={1}>
        <Panel title="Configuration Summary">
          <Text color="white">Review before writing profile config and active profile pointer</Text>
        </Panel>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="white">  Profile:     <Text color="cyan">{config.profileName}</Text></Text>
        <Text color="white">  Mode:        <Text color="cyan">{config.mode}</Text></Text>
        <Text color="white">  RPC:         <Text color="cyan">{config.rpcUrl}</Text></Text>
        <Text color="white">  Wallet:      <Text color="cyan">{config.createNewWallet ? 'New' : config.walletPath || 'Existing'}</Text></Text>
        <Text color="white">  Max Tx:      <Text color="cyan">{config.maxTxValueSol} SOL</Text></Text>
        <Text color="white">  Daily Limit: <Text color="cyan">{config.dailyLimitSol} SOL</Text></Text>
        <Text color="white">  Bento:       <Text color={config.enableBento ? 'green' : 'gray'}>{config.enableBento ? 'Enabled' : 'Disabled'}</Text></Text>
        <Text color="white">  Log Level:   <Text color="cyan">{config.logLevel}</Text></Text>
      </Box>
      <Text color="gray" dimColor>Wallet bytes are never displayed. Client configs should follow the active profile.</Text>
      <Box marginTop={1}>
        <SelectInput 
          items={[{ label: '✓ Confirm & Save', value: 'confirm' }]}
          onSelect={onConfirm}
        />
      </Box>
    </Box>
  );
}

/**
 * Internal helper for the saving step operation.
 */
function SavingStep() {
  const [message, setMessage] = useState('Saving configuration...');
  const [subMessage, setSubMessage] = useState('');
  
  useEffect(() => {
    const messages = [
      ['Saving configuration...', 'Writing config file'],
      ['Generating wallet...', 'Creating keypair'],
      ['Initializing...', 'Setting up directories'],
      ['Finalizing...', 'Almost done'],
    ];
    
    let i = 0;
    const interval = setInterval(() => {
      if (i < messages.length) {
        setMessage(messages[i][0]);
        setSubMessage(messages[i][1]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 800);
    
    return () => clearInterval(interval);
  }, []);
  
  return <LoadingScreen message={message} subMessage={subMessage} />;
}

// ============================================================================
// Main Wizard
// ============================================================================

/**
 * Internal helper for the config wizard operation.
 */
function ConfigWizard() {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [saveResult, setSaveResult] = useState<TuiWizardSaveResult | undefined>();
  const [config, setConfig] = useState<Partial<ConfigState>>({
    profileName: '',
    maxTxValueSol: 1.0,
    dailyLimitSol: 10.0,
    logLevel: 'info',
    enableMetrics: false,
  });

  const handleProfileSelect = (profileName: string) => {
    setConfig({ ...config, profileName });
    setStep('mode');
  };
  
  const handleModeSelect = (mode: string) => {
    setConfig({ ...config, mode });
    setStep('rpc');
  };
  
  const handleRpcSelect = (rpcUrl: string) => {
    setConfig({ ...config, rpcUrl });
    setStep('wallet');
  };
  
  const handleWalletSelect = (wallet: { path?: string; createNew?: boolean }) => {
    setConfig({ ...config, ...wallet });
    setStep('security');
  };
  
  const handleSecuritySelect = (limits: { max: number; daily: number }) => {
    setConfig({ 
      ...config, 
      maxTxValueSol: limits.max,
      dailyLimitSol: limits.daily,
    });
    setStep('bento');
  };
  
  const handleBentoSelect = (bento: { enabled: boolean; apiKey?: string; agentId?: string }) => {
    setConfig({ 
      ...config, 
      enableBento: bento.enabled,
      bentoApiKey: bento.apiKey,
      bentoAgentId: bento.agentId,
    });
    setStep('logging');
  };
  
  const handleLoggingSelect = (logging: { level: string; metrics: boolean }) => {
    setConfig({ 
      ...config, 
      logLevel: logging.level,
      enableMetrics: logging.metrics,
    });
    setStep('summary');
  };
  
  const handleConfirm = () => {
    setStep('saving');
    setTimeout(() => {
      const result = saveTuiWizardConfig(config as ConfigState);
      setSaveResult(result);
      setStep('done');
    }, 800);
  };
  
  return (
    <Box flexDirection="column" alignItems="center">
      {step === 'welcome' && <WelcomeStep onNext={() => setStep('profile')} />}
      {step === 'profile' && <ProfileStep onSelect={handleProfileSelect} />}
      {step === 'mode' && <ModeStep onSelect={handleModeSelect} />}
      {step === 'rpc' && <RpcStep onSelect={handleRpcSelect} mode={config.mode || 'readonly'} />}
      {step === 'wallet' && (
        <WalletStep
          onSelect={handleWalletSelect}
          mode={config.mode || 'readonly'}
          profileName={config.profileName ?? ''}
        />
      )}
      {step === 'security' && <SecurityStep onSelect={handleSecuritySelect} />}
      {step === 'bento' && <BentoStep onSelect={handleBentoSelect} />}
      {step === 'logging' && <LoggingStep onSelect={handleLoggingSelect} />}
      {step === 'summary' && <SummaryStep config={config as ConfigState} onConfirm={handleConfirm} />}
      {step === 'saving' && <SavingStep />}
      {step === 'done' && <SuccessScreen title="Configuration Complete!" config={config} result={saveResult} />}
    </Box>
  );
}

// ============================================================================
// Entry Point
// ============================================================================

const { waitUntilExit } = render(<ConfigWizard />);
await waitUntilExit();
