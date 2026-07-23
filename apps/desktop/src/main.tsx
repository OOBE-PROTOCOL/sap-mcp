import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import sapLogoUrl from '../../../assets/explorer_logo.png';
import './styles.css';

const fullSteps = ['Setup', 'Profile', 'Wallet', 'Policy', 'Runtimes', 'Review'] as const;
const paymentsOnlySteps = ['Setup', 'Runtimes', 'Review'] as const;
type StepName = typeof fullSteps[number];
type WorkspaceView = 'wizard' | 'profiles';

const hostedUrl = 'https://mcp.sap.oobeprotocol.ai/mcp';
const wizardVersion = '0.9.17';
const releaseUrl = `https://github.com/OOBE-PROTOCOL/sap-mcp/releases/tag/${wizardVersion}`;
const initialStateTimeoutMs = 15_000;

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
  const [profiles, setProfiles] = useState<ProfileStatus[]>([]);
  const [step, setStep] = useState<StepName>('Setup');
  const [view, setView] = useState<WorkspaceView>('wizard');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WizardResult | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadInitialState() {
      const bridge = window.sapMcpWizard;
      if (!bridge?.getInitialState) {
        throw new Error('SAP MCP Wizard desktop bridge is unavailable. Reinstall the latest wizard build, then reopen the app.');
      }

      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error('SAP MCP Wizard startup timed out while detecting local agent runtimes. Check the desktop wizard log and try payment bridge repair if you already have a profile.'));
        }, initialStateTimeoutMs);
      });

      return await Promise.race([bridge.getInitialState(), timeout]);
    }

    loadInitialState()
      .then((state) => {
        if (!mounted) return;
        const recommendedRuntimes = state.runtimes
          .filter((runtime) => runtime.detected)
          .map((runtime) => runtime.id);
        const defaultRuntimes = recommendedRuntimes.length > 0 ? recommendedRuntimes : state.draft.configureRuntimes;
        setDraft({
          ...state.draft,
          configureRuntimes: defaultRuntimes,
          configureCodex: defaultRuntimes.includes('codex'),
        });
        setRuntimes(state.runtimes);
        setProfiles(state.profiles);
      })
      .catch((cause: unknown) => {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      mounted = false;
    };
  }, []);

  const visibleSteps = useMemo(
    () => draft?.setupMode === 'payments-only' ? [...paymentsOnlySteps] : [...fullSteps],
    [draft?.setupMode],
  );
  const stepIndex = visibleSteps.indexOf(step);
  const canGoBack = stepIndex > 0 && !saving;
  const canGoForward = stepIndex < visibleSteps.length - 1 && !saving;

  useEffect(() => {
    if (draft && !visibleSteps.includes(step)) {
      setStep('Runtimes');
    }
  }, [draft, step, visibleSteps]);

  const validation = useMemo(() => {
    if (!draft) return ['Loading wizard state.'];
    const errors: string[] = [];
    if (draft.setupMode === 'payments-only') {
      if (draft.configureRuntimes.length === 0 && !draft.installAddonBundle) {
        errors.push('Choose at least one runtime or install the local bridge reference bundle.');
      }
      return errors;
    }
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
          {error ? (
            <div className="boot-card">
              <h1>Wizard startup needs attention</h1>
              <p>{error}</p>
              <div className="command-line"><code>npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard</code></div>
              <button type="button" className="primary-button" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="loader" aria-hidden="true" />
              <h1>Loading SAP MCP Wizard</h1>
              <p>Preparing local profile, runtime detection, and hosted MCP defaults.</p>
            </>
          )}
        </main>
      </Shell>
    );
  }

  function update(next: Partial<WizardDraft>) {
    setDraft((current) => current ? { ...current, ...next } : current);
  }

  function goHome() {
    setResult(null);
    setError(null);
    setView('wizard');
    setStep('Setup');
  }

  function goToStep(nextStep: StepName) {
    setResult(null);
    setError(null);
    setView('wizard');
    setStep(nextStep);
  }

  function openProfiles() {
    setResult(null);
    setError(null);
    setView('profiles');
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
      if (saved.setup) {
        const profileName = normalizeProfileName(draft.profileName);
        setProfiles((current) => upsertProfile(current, {
          name: profileName,
          path: saved.setup?.configPath ?? '',
          active: true,
          mode: saved.setup?.config.mode as WizardDraft['mode'],
          rpcUrl: saved.setup?.config.rpcUrl,
          network: networkFromRpcUrl(saved.setup?.config.rpcUrl),
          agentPubkey: saved.setup?.config.agentPubkey,
          walletPath: saved.setup?.walletPath,
          walletExists: Boolean(saved.setup?.walletPath),
          externalSignerConfigured: false,
          readiness: saved.readiness.status,
          issues: saved.readiness.profileIssues,
        }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <aside className="sidebar" aria-label="Wizard progress">
        <div className="brand-top">
          <img className="brand-logo" src={sapLogoUrl} alt="SAP MCP" />
          <button type="button" className="update-button" onClick={() => window.sapMcpWizard.openExternal(releaseUrl)} disabled={saving}>
            <UpdateIcon />
            Update
          </button>
        </div>
        <div>
          <p className="eyebrow">OOBE Protocol</p>
          <h1>SAP MCP Wizard</h1>
          <p className="sidebar-copy">Create a local SAP profile, connect hosted MCP, and configure the native payment bridge.</p>
        </div>
        <ol className="step-list">
          {visibleSteps.map((item, index) => (
            <li key={item}>
              <button
                type="button"
                className={item === step ? 'step active' : index < stepIndex ? 'step done' : 'step'}
                onClick={() => goToStep(item)}
                disabled={saving}
                aria-current={item === step ? 'step' : undefined}
              >
                <span>{index + 1}</span>
                {item}
              </button>
            </li>
          ))}
        </ol>
        <div className="sidebar-actions">
          <button type="button" className="sidebar-home-button" onClick={goHome} disabled={saving}>
            <span aria-hidden="true"><HomeIcon /></span>
            Home
          </button>
        </div>
        <ActiveProfileSummary profiles={profiles} onOpenProfiles={openProfiles} />
        <div className="hosted-card">
          <p>Hosted MCP</p>
          <code>{hostedUrl}</code>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{view === 'profiles' ? 'Local SAP MCP' : `Step ${stepIndex + 1} of ${visibleSteps.length}`}</p>
            <h2>{view === 'profiles' ? 'Profiles' : step}</h2>
          </div>
          <button type="button" className="ghost-button" onClick={() => window.sapMcpWizard.openExternal('https://mcp.sap.oobeprotocol.ai/docs')}>
            Docs
          </button>
        </header>

        {error && <StatusBanner tone="error" title="Setup needs attention" text={error} />}
        {view === 'profiles' && <ProfilesPage profiles={profiles} />}
        {view === 'wizard' && result && <DoneState result={result} />}

        {view === 'wizard' && !result && (
          <section className="panel" aria-labelledby="panel-title">
            <StepContent step={step} draft={draft} runtimes={runtimes} update={update} validation={validation} />
          </section>
        )}

        {view === 'wizard' && !result && (
          <footer className="footer-actions">
            <button type="button" className="secondary-button" disabled={!canGoBack} onClick={() => setStep(visibleSteps[stepIndex - 1])}>
              Back
            </button>
            {canGoForward ? (
              <button type="button" className="primary-button" onClick={() => setStep(visibleSteps[stepIndex + 1])}>
                Continue
              </button>
            ) : (
              <button type="button" className="primary-button" disabled={saving || validation.length > 0} onClick={save} aria-busy={saving}>
                {saving ? 'Saving...' : draft.setupMode === 'payments-only' ? 'Repair Payment Bridge' : 'Create Profile'}
              </button>
            )}
          </footer>
        )}
      </main>
    </Shell>
  );
}

function upsertProfile(profiles: ProfileStatus[], next: ProfileStatus): ProfileStatus[] {
  const merged = profiles.map((profile) => ({ ...profile, active: false }));
  const index = merged.findIndex((profile) => profile.name === next.name);
  if (index >= 0) {
    merged[index] = next;
  } else {
    merged.unshift(next);
  }
  return merged.sort((a, b) => {
    if (a.active) return -1;
    if (b.active) return 1;
    return a.name.localeCompare(b.name);
  });
}

function networkFromRpcUrl(rpcUrl?: string): string | undefined {
  if (!rpcUrl) return undefined;
  if (rpcUrl.includes('devnet')) return 'devnet';
  if (rpcUrl.includes('testnet')) return 'testnet';
  return 'mainnet-beta';
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
  function toggleRuntime(runtimeId: RuntimeStatus['id']) {
    const selected = new Set(draft.configureRuntimes);
    if (selected.has(runtimeId)) {
      selected.delete(runtimeId);
    } else {
      selected.add(runtimeId);
    }
    const configureRuntimes = Array.from(selected);
    update({
      configureRuntimes,
      configureCodex: configureRuntimes.includes('codex'),
    });
  }

  if (step === 'Setup') {
    return (
      <>
        <PanelHeader
          title="Choose the SAP MCP setup path"
          copy="Recommended for most users: hosted SAP MCP tools, a local SAP profile signer, and the native sap_payments bridge for x402 paid/write calls."
        />
        <div className="setup-layout">
          <div className="setup-options setup-options-row">
            <ToggleCard
              title="Full hosted SAP MCP setup"
              badge="Recommended"
              copy="Create or update a local SAP profile, configure wallet boundaries, policy limits, hosted MCP, and the native sap_payments bridge."
              checked={draft.setupMode === 'full'}
              onChange={() => update({ setupMode: 'full' })}
            />
            <ToggleCard
              title="Repair payment bridge only"
              badge="Already configured"
              copy="Keep the existing SAP profile and only install or repair the local sap_payments MCP entry for Codex, Claude, Hermes, OpenClaw, or compatible agents."
              checked={draft.setupMode === 'payments-only'}
              onChange={() => update({ setupMode: 'payments-only' })}
            />
          </div>
          <div className="setup-summary">
            <div className="setup-kicker">
              <span>Recommended hosted endpoint</span>
              <code>{hostedUrl}</code>
            </div>
            <h3>Remote tools. Local signatures. Smooth payments.</h3>
            <div className="setup-bullets">
              <span>Hosted SAP MCP exposes the full remote tool surface.</span>
              <span>Your local SAP MCP profile owns signing.</span>
              <span>sap_payments handles x402 challenges locally.</span>
            </div>
            <div className="info-strip">
              <strong>Default trust boundary</strong>
              <span>OOBE never receives keypair bytes. Paid/write hosted calls are authorized by the local SAP profile or external signer.</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === 'Profile') {
    return (
      <>
        <PanelHeader title="Name the local SAP profile" copy="Profiles isolate agent identity, policy limits, and wallet paths in the OS-specific SAP MCP config directory." />
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
              ['hosted-api', 'Hosted SAP MCP + local signer (recommended)'],
              ['local-dev-keypair', 'Local stdio/dev signer profile'],
              ['readonly', 'Read-only profile'],
              ['external-signer', 'External signer'],
              ['delegated-session', 'Delegated session'],
            ]}
          />
          <TextField id="rpcUrl" label="Local profile RPC URL" value={draft.rpcUrl} onChange={(value) => update({ rpcUrl: value })} helper="Hosted tools run at mcp.sap.oobeprotocol.ai; this RPC is for local profile reads, payment signing context, and local fallback flows." />
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
        <PanelHeader
          title="Connect runtimes to SAP MCP"
          copy="Select the agent runtimes to configure. The wizard writes hosted sap plus local sap_payments entries using each runtime's native JSON, TOML, or YAML structure."
        />
        <div className="runtime-actions">
          <button type="button" className="secondary-button" onClick={() => {
            const detected = runtimes.filter((runtime) => runtime.detected).map((runtime) => runtime.id);
            const configureRuntimes = detected.length > 0 ? detected : ['codex'];
            update({ configureRuntimes, configureCodex: configureRuntimes.includes('codex') });
          }}>
            Select Detected
          </button>
          <button type="button" className="secondary-button" onClick={() => {
            const configureRuntimes = runtimes.map((runtime) => runtime.id);
            update({ configureRuntimes, configureCodex: configureRuntimes.includes('codex') });
          }}>
            Select All Supported
          </button>
        </div>
        <div className="runtime-grid">
          {runtimes.map((runtime) => (
            <button
              type="button"
              className={draft.configureRuntimes.includes(runtime.id) ? 'runtime-card selected' : 'runtime-card'}
              key={runtime.id}
              onClick={() => toggleRuntime(runtime.id)}
              aria-pressed={draft.configureRuntimes.includes(runtime.id)}
            >
              <div>
                <h3>{runtime.label}</h3>
                <p>{runtime.recommendation}</p>
              </div>
              <span className={runtime.detected ? 'pill success' : 'pill'}>{runtime.detected ? 'Detected' : 'Ready'}</span>
              {runtime.paths.length > 0 && <code>{runtime.paths[0]}</code>}
            </button>
          ))}
        </div>
        <label className="switch-row" htmlFor={fieldId('installAddonBundle')}>
          <input id={fieldId('installAddonBundle')} type="checkbox" checked={draft.installAddonBundle} onChange={(event) => update({ installAddonBundle: event.target.checked })} />
          <span>
            <strong>Install local bridge reference bundle</strong>
            <small>Writes runtime snippets under the SAP MCP config directory for inspection, repair, and custom clients.</small>
          </span>
        </label>
      </>
    );
  }

  return (
    <>
      <PanelHeader title="Review install plan" copy="Nothing is sent to OOBE. The hosted MCP URL is public; signing remains local." />
      <div className="review-grid">
        <ReviewItem label="Install mode" value={draft.setupMode === 'payments-only' ? 'Payment bridge repair only' : 'Full SAP MCP setup'} />
        {draft.setupMode === 'full' && <ReviewItem label="Profile" value={normalizeProfileName(draft.profileName)} />}
        {draft.setupMode === 'full' && <ReviewItem label="Mode" value={draft.mode} />}
        {draft.setupMode === 'full' && <ReviewItem label="RPC" value={draft.rpcUrl} />}
        {draft.setupMode === 'full' && <ReviewItem label="Wallet" value={draft.createNewWallet ? 'Create dedicated SAP MCP keypair' : draft.walletPath ?? 'Missing path'} />}
        <ReviewItem label="Runtime configs" value={draft.configureRuntimes.length > 0 ? draft.configureRuntimes.join(', ') : 'Skip'} />
        <ReviewItem label="Bridge bundle" value={draft.installAddonBundle ? 'Install local reference bundle' : 'Skip'} />
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

function ToggleCard({ title, copy, badge, checked, onChange }: { title: string; copy: string; badge?: string; checked: boolean; onChange: () => void }) {
  return (
    <button type="button" className={checked ? 'toggle-card selected' : 'toggle-card'} onClick={onChange} aria-pressed={checked}>
      <span className="toggle-heading">
        <strong>{title}</strong>
        {badge && <em>{badge}</em>}
      </span>
      <span>{copy}</span>
    </button>
  );
}

function ActiveProfileSummary({
  profiles,
  onOpenProfiles,
}: {
  profiles: ProfileStatus[];
  onOpenProfiles: () => void;
}) {
  const activeProfile = profiles.find((profile) => profile.active);
  return (
    <section className="active-profile-panel" aria-label="Active local SAP MCP profile">
      <div className="profiles-heading">
        <span>Active profile</span>
        <strong>{profiles.length}</strong>
      </div>
      {activeProfile ? (
        <article className={activeProfile.readiness === 'ready' ? 'active-profile-card ready' : 'active-profile-card attention'}>
          <div>
            <strong>{activeProfile.name}</strong>
            <span>{activeProfile.readiness === 'ready' ? 'Ready' : 'Needs repair'}</span>
          </div>
          <small>{activeProfile.network ?? activeProfile.mode ?? 'configured'}</small>
          {activeProfile.agentPubkey && <code>{shorten(activeProfile.agentPubkey)}</code>}
          <small className={activeProfile.walletExists || activeProfile.externalSignerConfigured ? 'wallet-ok' : 'wallet-missing'}>
            {profileSignerLabel(activeProfile)}
          </small>
        </article>
      ) : (
        <p>No active local profile yet. Full setup will create one under the SAP MCP config directory.</p>
      )}
      <button type="button" className="sidebar-profile-button" onClick={onOpenProfiles}>
        View all profiles
      </button>
    </section>
  );
}

function ProfilesPage({ profiles }: { profiles: ProfileStatus[] }) {
  const readyCount = profiles.filter((profile) => profile.readiness === 'ready').length;
  const activeProfile = profiles.find((profile) => profile.active);

  if (profiles.length === 0) {
    return (
      <section className="profiles-page empty-state" aria-labelledby="profiles-title">
        <div>
          <p className="eyebrow">No local profiles</p>
          <h3 id="profiles-title">Create a profile to connect local signing.</h3>
          <p>Full hosted setup creates a named profile under the SAP MCP config directory and keeps wallet material local.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="profiles-page" aria-labelledby="profiles-title">
      <header className="profiles-page-header">
        <div>
          <p className="eyebrow">Profile manager</p>
          <h3 id="profiles-title">Local SAP MCP profiles</h3>
          <p>These profiles live on this machine. Hosted SAP MCP remains accountless; the local sap_payments bridge uses the active profile for x402 paid/write calls.</p>
        </div>
        <div className="profile-stats" aria-label="Profile counts">
          <span><strong>{profiles.length}</strong> total</span>
          <span><strong>{readyCount}</strong> ready</span>
          <span><strong>{activeProfile?.name ?? 'none'}</strong> active</span>
        </div>
      </header>
      <div className="profiles-page-grid">
        {profiles.map((profile) => (
          <article className={profile.active ? 'profile-detail-card active' : 'profile-detail-card'} key={profile.path}>
            <header>
              <div>
                <span className={profile.readiness === 'ready' ? 'profile-status ready' : 'profile-status attention'}>
                  {profile.readiness === 'ready' ? 'Ready' : 'Needs repair'}
                </span>
                {profile.active && <span className="profile-status active">Active</span>}
              </div>
              <h4>{profile.name}</h4>
            </header>
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>{profile.mode ?? 'Configured'}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{profile.network ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt>Signer</dt>
                <dd>{profileSignerLabel(profile)}</dd>
              </div>
              {profile.agentPubkey && (
                <div>
                  <dt>Agent public key</dt>
                  <dd><code>{profile.agentPubkey}</code></dd>
                </div>
              )}
              <div>
                <dt>Config path</dt>
                <dd><code>{profile.path}</code></dd>
              </div>
              {profile.walletPath && (
                <div>
                  <dt>Wallet path</dt>
                  <dd><code>{profile.walletPath}</code></dd>
                </div>
              )}
            </dl>
            {(profile.issues ?? []).length > 0 && (
              <div className="profile-issues">
                <strong>Attention</strong>
                <ul>
                  {(profile.issues ?? []).map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function profileSignerLabel(profile: ProfileStatus): string {
  if (profile.externalSignerConfigured) return 'External signer configured';
  if (profile.walletExists) return 'Wallet path exists';
  if (profile.walletPath) return 'Wallet path missing';
  return 'No wallet path';
}

function shorten(value: string): string {
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-6)}` : value;
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
  const setup = result.setup;
  const ready = result.readiness.status === 'ready';
  return (
    <section className="done-state" aria-labelledby="done-title">
      <div className={ready ? 'done-icon' : 'done-icon warning'} aria-hidden="true">{ready ? '✓' : '!'}</div>
      <h2 id="done-title">{ready ? result.setupMode === 'payments-only' ? 'Payment bridge is configured' : 'SAP MCP is configured' : 'Setup needs attention'}</h2>
      <p>{ready
        ? 'Restart your agent runtime. Hosted SAP MCP can use the local sap_payments bridge for x402 paid/write tools without exposing keypair bytes.'
        : 'The wizard wrote the config, but one or more local readiness checks failed. Fix these before relying on paid/write hosted tools.'}</p>
      {setup && (
        <div className="review-grid">
          <ReviewItem label="Config" value={setup.configPath} />
          <ReviewItem label="Wallet" value={setup.walletPath ?? 'No local wallet'} />
          <ReviewItem label="Agent public key" value={setup.config.agentPubkey ?? 'Not available'} />
        </div>
      )}
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
      {!ready && (
        <div className="readiness-panel">
          {result.readiness.profileIssues.length > 0 && (
            <div>
              <h3>Profile readiness</h3>
              <ul>{result.readiness.profileIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </div>
          )}
          {result.readiness.runtimeIssues.length > 0 && (
            <div>
              <h3>Runtime config readiness</h3>
              {result.readiness.runtimeIssues.map((runtime) => (
                <article key={runtime.path}>
                  <strong>{runtime.runtime}</strong>
                  <code>{runtime.path}</code>
                  <ul>{runtime.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                </article>
              ))}
            </div>
          )}
          <div>
            <h3>Next steps</h3>
            <ul>{result.readiness.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul>
          </div>
        </div>
      )}
      <StatusBanner tone={ready ? 'success' : 'error'} title={ready ? 'Next command for paid tools' : 'Do this before testing Codex'} text={ready ? 'Ask the agent to use sap_payments.sap_payments_profile_current for local profile checks and sap_payments.sap_payments_call_paid_tool when a hosted tool returns payment_required.' : 'Run Repair payment bridge only or Full hosted SAP MCP setup again, then restart Codex/Claude/Hermes/OpenClaw completely.'} />
    </section>
  );
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 10.5 9-7 9 7" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

function UpdateIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 1-15.2 6.5" />
      <path d="M3 12a9 9 0 0 1 15.2-6.5" />
      <path d="M18 3v5h-5" />
      <path d="M6 21v-5h5" />
    </svg>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
