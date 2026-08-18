/**
 * @name tui/wizard-save
 * @description TUI wizard configuration persistence — saves profiles, generates keypairs, and writes config files.
 *
 * @flow
 *   1. `saveTuiWizardConfig` takes wizard input, normalizes the profile name, and optionally
 *      generates a new Solana keypair (saved to disk with restrictive permissions).
 *   2. Writes the full SAP MCP config JSON to the profile config path.
 *   3. Sets the active profile marker file.
 *   4. Returns the config path, wallet path, and agent public key.
 *
 * @module tui/wizard-save
 */
/**
 * @name TuiWizardConfig
 * @description Configuration data collected by the TUI wizard for a new profile.
 *
 * @property profileName     — Desired profile name (will be normalized).
 * @property mode            — SAP MCP operational mode string.
 * @property rpcUrl          — Solana RPC URL for on-chain interaction.
 * @property walletPath      — Optional path to an existing keypair file.
 * @property createNewWallet — Whether to generate a new keypair for this profile.
 * @property maxTxValueSol   — Maximum transaction value in SOL.
 * @property dailyLimitSol   — Daily spending limit in SOL.
 * @property enableBento     — Whether to enable Bento integration.
 * @property bentoApiKey     — Optional Bento API key.
 * @property bentoAgentId    — Optional Bento agent ID.
 * @property logLevel        — Logging level string.
 * @property enableMetrics   — Whether to enable metrics collection.
 *
 * @usedBy `saveTuiWizardConfig`
 */
export interface TuiWizardConfig {
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
 * @name TuiWizardSaveResult
 * @description Result of saving a TUI wizard configuration.
 *
 * @property configPath    — Filesystem path to the written config JSON.
 * @property walletPath    — Optional path to the keypair file used or created.
 * @property walletCreated — Whether a new keypair was generated.
 * @property agentPubkey   — Optional base58 public key of the agent's wallet.
 *
 * @usedBy TUI wizard save flow.
 */
export interface TuiWizardSaveResult {
    configPath: string;
    walletPath?: string;
    walletCreated: boolean;
    agentPubkey?: string;
}
/**
 * @name preferredConfigDir
 * @description Returns the preferred configuration directory for SAP MCP profiles.
 *
 * Respects `XDG_CONFIG_HOME` on Linux, `%APPDATA%` on Windows, and `~/.config` on macOS.
 *
 * @returns Absolute path to the config directory.
 *
 * @usedBy `saveTuiWizardConfig`, `defaultWalletPath`, `profileConfigPath`.
 */
export declare function preferredConfigDir(): string;
/**
 * @name defaultWalletPath
 * @description Returns the default keypair file path for a given profile name.
 *
 * @param profileName — Normalized profile name.
 * @returns Absolute path to the keypair JSON file.
 *
 * @usedBy `saveTuiWizardConfig`.
 */
export declare function defaultWalletPath(profileName: string): string;
/**
 * @name profileConfigPath
 * @description Resolves the config file path for a normalized profile name.
 *
 * @param profileName — Profile name to resolve (will be normalized).
 * @returns Absolute path to the profile config JSON file.
 *
 * @usedBy `saveTuiWizardConfig`.
 */
export declare function profileConfigPath(profileName: string): string;
/**
 * @name normalizeProfileName
 * @description Normalizes a profile name to lowercase alphanumeric with single hyphens.
 *
 * Trims, lowercases, replaces non-alphanumeric sequences with hyphens, and strips
 * leading/trailing hyphens.
 *
 * @param value — Raw profile name string from user input.
 * @returns Normalized profile name string.
 *
 * @usedBy `defaultWalletPath`, `profileConfigPath`, `saveTuiWizardConfig`.
 */
export declare function normalizeProfileName(value: string): string;
/**
 * @name isValidProfileName
 * @description Returns `true` when a normalized profile name is safe for config and wallet paths.
 *
 * Rejects empty names, names that don't match the profile pattern, and the reserved name `default`.
 *
 * @param value — Normalized profile name to validate.
 * @returns `true` if the name is valid, `false` otherwise.
 *
 * @usedBy `saveTuiWizardConfig`.
 */
export declare function isValidProfileName(value: string): boolean;
/**
 * @name saveTuiWizardConfig
 * @description Saves a TUI wizard configuration to disk, optionally generating a new keypair.
 *
 * @param config — TUI wizard configuration data from user input.
 * @returns Result containing the config path, wallet path, whether a wallet was created, and agent public key.
 * @throws If the profile name is invalid or if file I/O fails.
 *
 * @usedBy TUI wizard save flow.
 */
export declare function saveTuiWizardConfig(config: TuiWizardConfig): TuiWizardSaveResult;
//# sourceMappingURL=wizard-save.d.ts.map