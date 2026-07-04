import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const steps = ['Profile', 'Wallet', 'Policy', 'Runtimes', 'Review'] as const;
type StepName = typeof steps[number];

const hostedUrl = 'https://mcp.sap.oobeprotocol.ai/mcp';

function normalizeProfileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function fieldId(name: string): string {
  return `sap-${name}`;
}

function App() {
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [step, setStep] = useState<StepName>('Profile');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WizardResult | null>(null);

  useEffect(() => {
    let mounted = true;
    window.sapMcpWizard.getInitialState()
      .then((state) => {
        if (!mounted) return;
        setDraft(state.draft);
        setRuntimes(state.runtimes);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      mounted = false;
    };
  }, []);

  const stepIndex = steps.indexOf(step);
  const canGoBack = stepIndex > 0 && !saving;
  const canGoForward = stepIndex < steps.length - 1 && !saving;

  const validation = useMemo(() => {
    if (!draft) return ['Loading wizard state.'];
    const errors: string[] = [];
    const profile = normalizeProfileName(draft.profileName);
    if (!profile || profile === 'default') {
      errors.push('Choose a named profile. Avoid default.');
    }
    if (!draft.rpcUrl.startsWith('https://') && !draft.rpcUrl.startsWith('http://')) {
      errors.push('RPC URL must start with http:// or https://.');
    }
    if (!draft.createNewWallet && !draft.walletPath) {
      errors.push('Import mode requires a wallet path.');
    }
    if (draft.maxTxValueSol <= 0 || draft.dailyLimitSol <= 0) {
      errors.push('Policy limits must be greater than zero.');
    }
    return errors;
  }, [draft]);

  if (!draft) {
    return (
      <Shell>
        <main className="center-state" aria-busy="true">
          <div className="loader" aria-hidden="true" />
          <h1>Loading SAP MCP Wizard</h1>
          <p>Preparing local profile, runtime detection, and hosted MCP defaults.</p>
        </main>
      </Shell>
    );
  }

  function update(next: Partial<WizardDraft>) {
    setDraft((current) => current ? { ...current, ...next } : current);
  }

  async function save() {
    if (!draft || validation.length > 0) {
      setError(validation.join('\n'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await window.sapMcpWizard.save({
        ...draft,
        profileName: normalizeProfileName(draft.profileName),
      });
      setResult(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <aside className="sidebar" aria-label="Wizard progress">
        <div className="brand-mark" aria-hidden="true">S</div>
        <div>
          <p className="eyebrow">OOBE Protocol</p>
          <h1>SAP MCP Wizard</h1>
          <p className="sidebar-copy">Create a local SAP profile, connect hosted MCP, and install the local x402 payment bridge.</p>
        </div>
        <ol className="step-list">
          {steps.map((item, index) => (
            <li key={item}>
              <button
                type="button"
                className={item === step ? 'step active' : index < stepIndex ? 'step done' : 'step'}
                onClick={() => setStep(item)}
                disabled={saving}
              >
                <span>{index + 1}</span>
                {item}
              </button>
            </li>
          ))}
        </ol>
        <div className="hosted-card">
          <p>Hosted MCP</p>
          <code>{hostedUrl}</code>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Step {stepIndex + 1} of {steps.length}</p>
            <h2>{step}</h2>
          </div>
          <button type="button" className="ghost-button" onClick={() => window.sapMcpWizard.openExternal('https://mcp.sap.oobeprotocol.ai/docs')}>
            Docs
          </button>
        </header>

        {error && <StatusBanner tone="error" title="Setup needs attention" text={error} />}
        {result && <DoneState result={result} />}

        {!result && (
          <section className="panel" aria-labelledby="panel-title">
            <StepContent step={step} draft={draft} runtimes={runtimes} update={update} validation={validation} />
          </section>
        )}

        {!result && (
          <footer className="footer-actions">
            <button type="button" className="secondary-button" disabled={!canGoBack} onClick={() => setStep(steps[stepIndex - 1])}>
              Back
            </button>
            {canGoForward ? (
              <button type="button" className="primary-button" onClick={() => setStep(steps[stepIndex + 1])}>
                Continue
              </button>
            ) : (
              <button type="button" className="primary-button" disabled={saving || validation.length > 0} onClick={save} aria-busy={saving}>
                {saving ? 'Saving...' : 'Create Profile'}
              </button>
            )}
          </footer>
        )}
      </main>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">{children}</div>;
}

function StepContent({
  step,
  draft,
  runtimes,
  validation,
  update,
}: {
  step: StepName;
  draft: WizardDraft;
  runtimes: RuntimeStatus[];
  validation: string[];
  update: (next: Partial<WizardDraft>) => void;
}) {
  if (step === 'Profile') {
    return (
      <>
        <PanelHeader title="Name the local SAP profile" copy="Profiles isolate agent identity, policy limits, and wallet paths under ~/.config/mcp-sap." />
        <div className="form-grid">
          <TextField
            id="profileName"
            label="Profile name"
            value={draft.profileName}
            helper={`Will be saved as ${normalizeProfileName(draft.profileName) || 'your-profile'}.`}
            onChange={(value) => update({ profileName: value })}
          />
          <SelectField
            id="mode"
            label="Operating mode"
            value={draft.mode}
            onChange={(value) => update({ mode: value as WizardDraft['mode'] })}
            options={[
              ['local-dev-keypair', 'Local signer profile'],
              ['readonly', 'Read-only profile'],
              ['external-signer', 'External signer'],
              ['delegated-session', 'Delegated session'],
            ]}
          />
          <TextField id="rpcUrl" label="Solana RPC URL" value={draft.rpcUrl} onChange={(value) => update({ rpcUrl: value })} helper="Use mainnet for hosted SAP MCP unless you are testing." />
        </div>
      </>
    );
  }

  if (step === 'Wallet') {
    return (
      <>
        <PanelHeader title="Configure the signer boundary" copy="The hosted server never stores keys. Payments and writes are signed locally by this profile or an external signer." />
        <div className="choice-row">
          <ToggleCard
            title="Create dedicated wallet"
            copy="Recommended for new users. Keeps SAP MCP separate from Solana CLI keypairs."
            checked={draft.createNewWallet}
            onChange={() => update({ createNewWallet: true })}
          />
          <ToggleCard
            title="Use existing keypair path"
            copy="Advanced. Use only a dedicated SAP MCP wallet, never a shared production keypair."
            checked={!draft.createNewWallet}
            onChange={() => update({ createNewWallet: false })}
          />
        </div>
        {!draft.createNewWallet && (
          <TextField id="walletPath" label="Wallet path" value={draft.walletPath ?? ''} onChange={(value) => update({ walletPath: value })} helper="Keypair bytes are read only by the local save/signing process, never by the renderer or hosted server." />
        )}
      </>
    );
  }

  if (step === 'Policy') {
    return (
      <>
        <PanelHeader title="Set safety limits" copy="These defaults are intentionally conservative. Paid and value-moving operations still require explicit confirmation." />
        <div className="form-grid">
          <NumberField id="maxTxValueSol" label="Max transaction value (SOL)" value={draft.maxTxValueSol} onChange={(value) => update({ maxTxValueSol: value })} />
          <NumberField id="dailyLimitSol" label="Daily limit (SOL)" value={draft.dailyLimitSol} onChange={(value) => update({ dailyLimitSol: value })} />
          <SelectField id="logLevel" label="Log level" value={draft.logLevel} onChange={(value) => update({ logLevel: value as WizardDraft['logLevel'] })} options={[['info', 'Info'], ['debug', 'Debug'], ['warn', 'Warn'], ['error', 'Error']]} />
        </div>
        <label className="switch-row" htmlFor={fieldId('enableBento')}>
          <input id={fieldId('enableBento')} type="checkbox" checked={draft.enableBento} onChange={(event) => update({ enableBento: event.target.checked })} />
          <span>
            <strong>Enable Bento Guard policy layer</strong>
            <small>Optional policy firewall before sensitive permissions or on-chain execution.</small>
          </span>
        </label>
        {draft.enableBento && (
          <div className="form-grid">
            <TextField id="bentoApiKey" label="Bento API key" value={draft.bentoApiKey ?? ''} onChange={(value) => update({ bentoApiKey: value })} helper="Stored only in local config if provided." />
            <TextField id="bentoAgentId" label="Bento agent ID" value={draft.bentoAgentId ?? ''} onChange={(value) => update({ bentoAgentId: value })} />
          </div>
        )}
      </>
    );
  }

  if (step === 'Runtimes') {
    return (
      <>
        <PanelHeader title="Connect agent runtimes" copy="The wizard can make Codex fully usable with hosted SAP MCP and a local x402 payment bridge." />
        <div className="runtime-grid">
          {runtimes.map((runtime) => (
            <article className="runtime-card" key={runtime.id}>
              <div>
                <h3>{runtime.label}</h3>
                <p>{runtime.recommendation}</p>
              </div>
              <span className={runtime.detected ? 'pill success' : 'pill'}>{runtime.detected ? 'Detected' : 'Ready'}</span>
              {runtime.paths.length > 0 && <code>{runtime.paths[0]}</code>}
            </article>
          ))}
        </div>
        <label className="switch-row" htmlFor={fieldId('configureCodex')}>
          <input id={fieldId('configureCodex')} type="checkbox" checked={draft.configureCodex} onChange={(event) => update({ configureCodex: event.target.checked })} />
          <span>
            <strong>Configure Codex automatically</strong>
            <small>Add hosted sap and local sap_payments entries to Codex config.toml.</small>
          </span>
        </label>
        <label className="switch-row" htmlFor={fieldId('installAddonBundle')}>
          <input id={fieldId('installAddonBundle')} type="checkbox" checked={draft.installAddonBundle} onChange={(event) => update({ installAddonBundle: event.target.checked })} />
          <span>
            <strong>Install x402 addon bundle</strong>
            <small>Writes runtime snippets under ~/.config/mcp-sap/addons/x402-paid-call.</small>
          </span>
        </label>
      </>
    );
  }

  return (
    <>
      <PanelHeader title="Review install plan" copy="Nothing is sent to OOBE. The hosted MCP URL is public; signing remains local." />
      <div className="review-grid">
        <ReviewItem label="Profile" value={normalizeProfileName(draft.profileName)} />
        <ReviewItem label="Mode" value={draft.mode} />
        <ReviewItem label="RPC" value={draft.rpcUrl} />
        <ReviewItem label="Wallet" value={draft.createNewWallet ? 'Create dedicated SAP MCP keypair' : draft.walletPath ?? 'Missing path'} />
        <ReviewItem label="Codex" value={draft.configureCodex ? 'Configure hosted sap + sap_payments bridge' : 'Skip'} />
        <ReviewItem label="x402 addon" value={draft.installAddonBundle ? 'Install local addon bundle' : 'Skip'} />
      </div>
      {validation.length > 0 && <StatusBanner tone="error" title="Fix before saving" text={validation.join('\n')} />}
    </>
  );
}

function PanelHeader({ title, copy }: { title: string; copy: string }) {
  return (
    <header className="panel-header">
      <h3 id="panel-title">{title}</h3>
      <p>{copy}</p>
    </header>
  );
}

function TextField({ id, label, value, helper, onChange }: { id: string; label: string; value: string; helper?: string; onChange: (value: string) => void }) {
  const inputId = fieldId(id);
  const helperId = `${inputId}-helper`;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} type="text" value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={helper ? helperId : undefined} spellCheck={false} />
      {helper && <p id={helperId}>{helper}</p>}
    </div>
  );
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  const inputId = fieldId(id);
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} type="text" inputMode="decimal" value={String(value)} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function SelectField({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  const inputId = fieldId(id);
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <select id={inputId} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, label]) => <option value={optionValue} key={optionValue}>{label}</option>)}
      </select>
    </div>
  );
}

function ToggleCard({ title, copy, checked, onChange }: { title: string; copy: string; checked: boolean; onChange: () => void }) {
  return (
    <button type="button" className={checked ? 'toggle-card selected' : 'toggle-card'} onClick={onChange} aria-pressed={checked}>
      <strong>{title}</strong>
      <span>{copy}</span>
    </button>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-item">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function StatusBanner({ tone, title, text }: { tone: 'error' | 'success'; title: string; text: string }) {
  return (
    <div className={`status-banner ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function DoneState({ result }: { result: WizardResult }) {
  return (
    <section className="done-state" aria-labelledby="done-title">
      <div className="done-icon" aria-hidden="true">✓</div>
      <h2 id="done-title">SAP MCP is configured</h2>
      <p>Restart your agent runtime. Codex can use hosted SAP MCP plus the local sap_payments bridge for x402 paid/write tools.</p>
      <div className="review-grid">
        <ReviewItem label="Config" value={result.setup.configPath} />
        <ReviewItem label="Wallet" value={result.setup.walletPath ?? 'No local wallet'} />
        <ReviewItem label="Agent public key" value={result.setup.config.agentPubkey ?? 'Not available'} />
      </div>
      <div className="runtime-grid">
        {result.runtimeActions.map((action) => (
          <article className="runtime-card" key={`${action.runtime}-${action.status}`}>
            <h3>{action.runtime}</h3>
            <p>{action.message}</p>
            {action.path && <code>{action.path}</code>}
            {action.backupPath && <small>Backup: {action.backupPath}</small>}
          </article>
        ))}
      </div>
      <StatusBanner tone="success" title="Next command for paid tools" text="Ask the agent to use sap_payments.sap_x402_paid_call when a hosted SAP MCP tool returns payment_required." />
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
