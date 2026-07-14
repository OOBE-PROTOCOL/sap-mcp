#!/usr/bin/env node

/**
 * SAP MCP Server - Configuration Wizard
 * 
 * Interactive wizard for initial configuration setup.
 * Guides users through secure configuration with explanations.
 * 
 * Usage:
 *   npx sap-mcp-config wizard
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import readline from 'readline';
import { Keypair } from '@solana/web3.js';
import { defaults } from './defaults.js';
import { defaultGeneratedWalletPath } from './paths.js';
import { saveWizardSetup, type WizardSetupInput, type WizardSetupResult } from './setup.js';
import type { SapMcpMode } from './env.js';
import {
  applyMcpClientInjection,
  createCanonicalServerConfig,
  createManualMcpJsonSnippets,
  createX402PaidCallAddonSnippets,
  discoverMcpClientTargets,
  installCodexHostedPaymentBridgeConfig,
  installHostedPaymentBridgeConfigs,
  installX402PaidCallAddon,
  planMcpClientInjection,
  type McpClientInjectionMode,
  type McpClientId,
  type McpClientTarget,
} from './mcp-client-injection.js';

type WizardLogLevel = WizardSetupInput['logLevel'];
type QuestionValidator = (value: string) => string | undefined;
type QuestionTransform = (value: string) => string;

interface QuestionOptions {
  defaultValue?: string;
  required?: boolean;
  help?: string[];
  validate?: QuestionValidator;
  transform?: QuestionTransform;
}

class WizardCancelled extends Error {
  constructor() {
    super('Wizard cancelled');
    this.name = 'WizardCancelled';
  }
}

const EXIT_COMMANDS = new Set(['exit', 'quit', 'cancel', 'q', ':q', '/exit', '/quit', '/cancel']);
const HELP_COMMANDS = new Set(['?', 'help', '/help']);
const WIZARD_WIDTH = 72;
const COLOR_ENABLED = process.env.NO_COLOR !== '1' && process.env.SAP_MCP_NO_COLOR !== 'true';

const color = {
  aqua: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
} as const;

type ColorName = keyof typeof color;

/**
 * @name paint
 * @description Applies ANSI color only when terminal color output is enabled.
 */
function paint(value: string, ...colors: ColorName[]): string {
  if (!COLOR_ENABLED) {
    return value;
  }

  return `${colors.map((name) => color[name]).join('')}${value}${color.reset}`;
}

// ============================================================================
// Interactive CLI Helper
// ============================================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

process.once('SIGINT', () => {
  console.log(`\n${paint('Wizard cancelled. No configuration was saved.', 'yellow')}`);
  rl.close();
  process.exit(130);
});

/**
 * Returns true when the user requested wizard cancellation.
 */
function isExitCommand(value: string): boolean {
  return EXIT_COMMANDS.has(value.trim().toLowerCase());
}

/**
 * Returns true when the user requested contextual help.
 */
function isHelpCommand(value: string): boolean {
  return HELP_COMMANDS.has(value.trim().toLowerCase());
}

/**
 * Prints contextual help for a prompt.
 */
function printPromptHelp(lines: string[] | undefined): void {
  console.log('');
  console.log(paint('Help', 'aqua', 'bold'));
  for (const line of lines ?? ['Enter a value, or type /exit to cancel the wizard.']) {
    console.log(`  ${line}`);
  }
  console.log('');
}

/**
 * Prints the common wizard control hints.
 */
function printControlHints(): void {
  console.log(paint('Controls: type ? for help, /exit to cancel, Ctrl+C to abort.', 'gray'));
}

/**
 * Builds a user-friendly prompt string with default values.
 */
function formatPrompt(question: string, defaultValue?: string): string {
  return defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
}

/**
 * Formats a selectable option label, preserving labels that already include ANSI styling.
 */
function formatChoiceLabel(choice: string): string {
  return choice.includes('\x1b[') ? choice : paint(choice, 'aqua');
}

/**
 * Internal helper for the ask question operation.
 */
function askQuestion(question: string, defaultValueOrOptions?: string | QuestionOptions): Promise<string> {
  const options: QuestionOptions = typeof defaultValueOrOptions === 'string'
    ? { defaultValue: defaultValueOrOptions }
    : defaultValueOrOptions ?? {};

  return new Promise((resolve, reject) => {
    const ask = () => {
      rl.question(formatPrompt(question, options.defaultValue), (answer) => {
        const raw = answer.trim();

        if (isExitCommand(raw)) {
          reject(new WizardCancelled());
          return;
        }

        if (isHelpCommand(raw)) {
          printPromptHelp(options.help);
          ask();
          return;
        }

        const candidate = raw || options.defaultValue || '';
        const value = options.transform ? options.transform(candidate) : candidate;

        if (options.required && !value) {
          printError('This field is required.');
          ask();
          return;
        }

        const validationError = options.validate?.(value);
        if (validationError) {
          printError(validationError);
          ask();
          return;
        }

        resolve(value);
      });
    };

    ask();
  });
}

/**
 * Internal helper for the ask choice operation.
 */
function askChoice(question: string, choices: string[], defaultIndex: number = 0, help?: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const ask = () => {
      console.log(question);
      choices.forEach((choice, i) => {
        const alreadyMarked = choice.includes('[RECOMMENDED]') || choice.includes('[recommended]');
        const marker = i === defaultIndex && !alreadyMarked ? ' (recommended)' : '';
        console.log(`  ${paint(`${i + 1})`, 'gray')} ${formatChoiceLabel(choice)}${paint(marker, 'green')}`);
      });
      
      const prompt = `Enter choice (1-${choices.length})`;
      const defaultChoice = defaultIndex + 1;
      
      rl.question(`${paint(`${prompt} [${defaultChoice}]:`, 'gray')} `, (answer) => {
        const raw = answer.trim();
        if (isExitCommand(raw)) {
          reject(new WizardCancelled());
          return;
        }

        if (isHelpCommand(raw)) {
          printPromptHelp(help);
          ask();
          return;
        }

        if (!raw) {
          resolve(defaultIndex);
          return;
        }

        const num = parseInt(raw, 10);
        if (isNaN(num) || num < 1 || num > choices.length) {
          printError(`Choose a number between 1 and ${choices.length}.`);
          ask();
          return;
        }

        resolve(num - 1);
      });
    };

    ask();
  });
}

/**
 * Internal helper for selecting multiple numbered options in one prompt.
 */
function askMultiChoice(question: string, choices: string[], defaultIndexes: number[] = [], help?: string[]): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const ask = () => {
      console.log(question);
      choices.forEach((choice, i) => {
        const marker = defaultIndexes.includes(i) ? ' (default)' : '';
        console.log(`  ${paint(`${i + 1})`, 'gray')} ${formatChoiceLabel(choice)}${paint(marker, 'green')}`);
      });

      const defaultValue = defaultIndexes.length > 0
        ? defaultIndexes.map((index) => String(index + 1)).join(',')
        : 'none';

      rl.question(`${paint(`Enter choices as comma-separated numbers, "all", or "none" [${defaultValue}]:`, 'gray')} `, (answer) => {
        const raw = answer.trim().toLowerCase();
        if (isExitCommand(raw)) {
          reject(new WizardCancelled());
          return;
        }

        if (isHelpCommand(raw)) {
          printPromptHelp(help);
          ask();
          return;
        }

        const value = raw || defaultValue;
        if (value === 'none' || value === 'no' || value === 'skip') {
          resolve([]);
          return;
        }

        if (value === 'all') {
          resolve(choices.map((_, index) => index));
          return;
        }

        const indexes = value
          .split(',')
          .map((item) => Number(item.trim()))
          .filter((item) => Number.isInteger(item));

        if (indexes.length === 0 || indexes.some((item) => item < 1 || item > choices.length)) {
          printError(`Choose numbers between 1 and ${choices.length}, "all", or "none".`);
          ask();
          return;
        }

        resolve(Array.from(new Set(indexes.map((item) => item - 1))));
      });
    };

    ask();
  });
}

/**
 * Internal helper for the ask confirm operation.
 */
function askConfirm(question: string, defaultYes: boolean = false, help?: string[]): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const ask = () => {
      const suffix = defaultYes ? ' (Y/n)' : ' (y/N)';
      rl.question(`${question}${suffix}: `, (answer) => {
        const lower = answer.toLowerCase().trim();
        if (isExitCommand(lower)) {
          reject(new WizardCancelled());
          return;
        }

        if (isHelpCommand(lower)) {
          printPromptHelp(help);
          ask();
          return;
        }

        if (lower === '') {
          resolve(defaultYes);
          return;
        }

        if (lower === 'y' || lower === 'yes') {
          resolve(true);
          return;
        }

        if (lower === 'n' || lower === 'no') {
          resolve(false);
          return;
        }

        printError('Answer yes or no.');
        ask();
      });
    };

    ask();
  });
}

/**
 * Internal helper for the clear console operation.
 */
function clearConsole() {
  console.clear();
}

/**
 * Internal helper for the print header operation.
 */
function printHeader(title: string, subtitle?: string) {
  const width = WIZARD_WIDTH;
  const line = '═'.repeat(width);
  const space = ' '.repeat(width);
  
  console.log('');
  console.log(paint('╔' + line + '╗', 'aqua'));
  console.log(paint('║', 'aqua') + space + paint('║', 'aqua'));
  
  const titlePadding = Math.floor((width - title.length) / 2);
  const titleLine = ' '.repeat(titlePadding) + title + ' '.repeat(width - titlePadding - title.length);
  console.log(paint('║', 'aqua') + paint(titleLine, 'bold') + paint('║', 'aqua'));
  
  if (subtitle) {
    const subPadding = Math.floor((width - subtitle.length) / 2);
    const subLine = ' '.repeat(subPadding) + subtitle + ' '.repeat(width - subPadding - subtitle.length);
    console.log(paint('║', 'aqua') + paint(subLine, 'gray') + paint('║', 'aqua'));
  }
  
  console.log(paint('║', 'aqua') + space + paint('║', 'aqua'));
  console.log(paint('╚' + line + '╝', 'aqua'));
  console.log('');
}

/**
 * Print SAP ASCII art logo
 */
function printSapLogo() {
  const logo = [
    '  ███████╗ █████╗ ██████╗     ███╗   ███╗ ██████╗██████╗ ',
    '  ██╔════╝██╔══██╗██╔══██╗════████╗ ████║██╔════╝██╔══██╗',
    '  ███████╗███████║██████╔╝════██╔████╔██║██║     ██████╔╝',
    '  ╚════██║██╔══██║██╔═══╝     ██║╚██╔╝██║██║     ██╔═══╝ ',
    '  ███████║██║  ██║██║         ██║ ╚═╝ ██║╚██████╗██║     ',
    '  ╚══════╝╚═╝  ╚═╝╚═╝         ╚═╝     ╚═╝ ╚═════╝╚═╝     ',
    '',
    '  ┌─────────────────────────────────────┐',
    '  │  Synapse Agent Protocol  │  MCP     │',
    '  └─────────────────────────────────────┘',
  ];
  
  console.log(logo.map((line) => paint(line, 'aqua')).join('\n'));
  console.log('');
}

/**
 * Internal helper for the print section operation.
 */
function printSection(title: string) {
  console.log(`\n${paint('─'.repeat(WIZARD_WIDTH), 'aqua')}`);
  console.log(`  ${paint(title, 'aqua', 'bold')}`);
  console.log(`${paint('─'.repeat(WIZARD_WIDTH), 'aqua')}\n`);
}

/**
 * Internal helper for the print success operation.
 */
function printSuccess(message: string) {
  console.log(paint(`OK: ${message}`, 'green'));
}

/**
 * Internal helper for the print info operation.
 */
function printInfo(message: string) {
  console.log(paint(`Info: ${message}`, 'aqua'));
}

/**
 * Prints a warning message.
 */
function printWarning(message: string) {
  console.log(paint(`Warning: ${message}`, 'yellow'));
}

/**
 * Prints an error message with a text prefix that remains meaningful without color.
 */
function printError(message: string): void {
  console.log(paint(`Error: ${message}`, 'red'));
}

/**
 * Prints a descriptive lead paragraph for the current wizard step.
 */
function printLead(message: string): void {
  console.log(paint(message, 'aqua'));
}

/**
 * Prints a section label in the wizard's primary color.
 */
function printLabel(label: string): void {
  console.log(paint(label, 'aqua', 'bold'));
}

/**
 * Prints one accessible bullet line.
 */
function printBullet(message: string): void {
  console.log(`  - ${message}`);
}

/**
 * Prints a key/value summary row.
 */
function printField(label: string, value: string): void {
  console.log(`  ${paint(`${label}:`, 'aqua')} ${value}`);
}

/**
 * Expands a shell-style home directory prefix for local file inputs.
 */
function expandHomePath(path: string): string {
  if (path === '~') {
    return homedir();
  }

  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }

  return path;
}

/**
 * Validates profile names used as config and wallet filename components.
 */
function validateProfileName(value: string): string | undefined {
  if (value === 'default') {
    return 'Use a named profile instead of "default" so wallets and configs stay explicit.';
  }

  if (value.length < 3 || value.length > 48) {
    return 'Profile names must be between 3 and 48 characters.';
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return 'Use lowercase letters, numbers, and single hyphens between words.';
  }

  return undefined;
}

/**
 * Validates HTTP(S) URLs.
 */
function validateHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'URL must start with http:// or https://.';
    }

    if (!url.hostname) {
      return 'URL must include a hostname.';
    }

    return undefined;
  } catch {
    return 'Enter a valid URL, for example https://api.mainnet-beta.solana.com.';
  }
}

/**
 * Validates a Solana keypair JSON file without exposing the secret bytes.
 */
function validateWalletFile(value: string): string | undefined {
  const walletPath = expandHomePath(value);
  if (!existsSync(walletPath)) {
    return 'Wallet file does not exist.';
  }

  try {
    const stat = statSync(walletPath);
    if (!stat.isFile()) {
      return 'Wallet path must point to a JSON file.';
    }

    const parsed: unknown = JSON.parse(readFileSync(walletPath, 'utf-8'));
    if (!Array.isArray(parsed) || parsed.length !== 64) {
      return 'Wallet JSON must be a Solana keypair array with 64 bytes.';
    }

    const bytes = parsed as unknown[];
    if (!bytes.every((item) => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 255)) {
      return 'Wallet JSON contains invalid byte values.';
    }

    Keypair.fromSecretKey(Uint8Array.from(bytes as number[]));
    return undefined;
  } catch {
    return 'Wallet file is not a valid Solana keypair JSON.';
  }
}

/**
 * Creates a validator for positive SOL amount inputs.
 */
function validateSolAmount(label: string, options: { allowZero?: boolean; min?: number; max?: number } = {}): QuestionValidator {
  return (value: string) => {
    const amount = Number(value);
    const minimum = options.min ?? 0;
    const maximum = options.max ?? 1_000_000;

    if (!Number.isFinite(amount)) {
      return `${label} must be a number.`;
    }

    if (!options.allowZero && amount <= 0) {
      return `${label} must be greater than 0 SOL.`;
    }

    if (amount < minimum) {
      return `${label} must be at least ${minimum} SOL.`;
    }

    if (amount > maximum) {
      return `${label} is too high; choose a value below ${maximum} SOL.`;
    }

    return undefined;
  };
}

/**
 * Validates that a daily spending limit can contain the per-transaction limit.
 */
function validateDailyLimit(maxTxValueSol: number): QuestionValidator {
  return (value: string) => {
    const amountError = validateSolAmount('Daily spending limit', { allowZero: false })(value);
    if (amountError) {
      return amountError;
    }

    if (Number(value) < maxTxValueSol) {
      return 'Daily spending limit must be greater than or equal to the maximum transaction value.';
    }

    return undefined;
  };
}

// ============================================================================
// Wizard Steps
// ============================================================================

/**
 * Internal helper for the wizard welcome operation.
 */
async function wizardWelcome() {
  clearConsole();
  printSapLogo();
  printHeader(
    'SAP MCP Configuration Wizard',
    'Secure setup for AI agent access to SAP Protocol'
  );
  
  printLead('This guided setup creates a named SAP MCP profile, isolates its wallet, and prepares MCP clients to load the active profile safely.');
  printLead('You can review everything before saving. Secret key bytes are never printed or injected into client configs.');
  printControlHints();
  console.log('');
  printLabel('What this wizard configures');
  printBullet('A named profile under ~/.config/mcp-sap/config-<profile>.json.');
  printBullet('A dedicated wallet path under ~/.config/mcp-sap/keypairs/ when signing is enabled.');
  printBullet('Policy limits for transaction value, daily spending, and optional Bento Guard checks.');
  printBullet('Optional MCP client config injection for Claude, Hermes, OpenClaw, and Codex.');
  console.log('');
  printLabel('What this wizard will not do');
  printBullet('It will not modify ~/.config/solana/id.json.');
  printBullet('It will not print, log, or copy keypair bytes.');
  printBullet('It will not write anything until the final confirmation step.');
  console.log('');
  
  const continueResult = await askConfirm('Continue?', true, [
    'Choose yes to create/update a named SAP MCP profile.',
    'Type /exit at any prompt to leave without saving.',
  ]);
  
  if (!continueResult) {
    throw new WizardCancelled();
  }
}

/**
 * Internal helper for the wizard profile operation.
 */
async function wizardProfile(): Promise<string> {
  while (true) {
    clearConsole();
    printSapLogo();
    printHeader('Step 1: Agent Profile', 'Create or select agent identity');
    
    printLead('Choose a stable profile name for this agent or operator identity.');
    printControlHints();
    console.log('');
    printLabel('Profile naming convention');
    printBullet('Use a descriptive name such as merchant-lexus-sap.');
    printBullet('Include the agent purpose, environment, or business role.');
    printBullet('Use lowercase letters, numbers, and hyphens only.');
    printBullet('The name controls config and wallet isolation.');
    console.log('');
    printLabel('Examples');
    printBullet('merchant-lexus-sap');
    printBullet('gianni-market-nft-agent');
    printBullet('dev-testing-mainnet');
    printBullet('citizen-support-bot');
    console.log('');
    
    const profileName = await askQuestion('Profile name', {
      required: true,
      transform: (value) => value.trim().toLowerCase(),
      validate: validateProfileName,
      help: [
        'Use the real agent identity, for example gianni-market-nft-agent.',
        'The wizard reserves "default" to prevent accidental profile ambiguity.',
        'This name becomes config-<profile>.json and <profile>-keypair.json.',
      ],
    });
    
    return profileName;
  }
}

/**
 * Internal helper for the wizard mode operation.
 */
async function wizardMode(): Promise<SapMcpMode> {
  clearConsole();
  printSapLogo();
  printHeader('Step 2: Connection & Signing Mode', 'Where should this SAP MCP profile operate?');
  
  printLead('For most users, choose the hosted SAP MCP Server: agents connect to https://mcp.sap.oobeprotocol.ai/mcp while payments and signatures stay on this machine through the local sap_payments bridge.');
  console.log('');
  printLabel('Mode guidance');
  printBullet('Choose hosted-api for the public SAP MCP Server. This is recommended for Claude, Hermes, OpenClaw, Codex, and most users.');
  printBullet('Choose local-dev-keypair only for local stdio development or offline testing.');
  printBullet('Choose external-signer for hardware wallets, custody systems, or a local signing proxy.');
  printBullet('Choose readonly if the profile must never sign or pay.');
  console.log('');
  printLabel('Recommended architecture');
  printField('URL', paint('https://mcp.sap.oobeprotocol.ai/mcp', 'aqua'));
  printField('Remote server', 'Lists and executes SAP MCP hosted tools');
  printField('Local bridge', 'sap_payments signs x402 proofs locally and retries paid/write tools');
  printField('Keys', 'Your profile wallet or external signer; OOBE never receives keypair bytes');
  console.log('');
  printControlHints();
  console.log('');
  
  const choices = [
    `${paint('hosted-api', 'aqua', 'bold')} ${paint('[RECOMMENDED]', 'green', 'bold')} - Connect agents to OOBE hosted MCP; keep signing local.`,
    `${paint('local-dev-keypair', 'aqua', 'bold')} ${paint('[local stdio/dev]', 'yellow')} - Run local tools with this profile's dedicated keypair file.`,
    `${paint('external-signer', 'aqua', 'bold')} ${paint('[production signer]', 'green')} - Use Ledger, Fireblocks, or signing proxy.`,
    `${paint('readonly', 'aqua', 'bold')} ${paint('[read-only]', 'blue')} - Read tools only; no payment or transaction signing.`,
    `${paint('delegated-session', 'aqua', 'bold')} ${paint('[advanced]', 'blue')} - Session-scoped permissions and spending limits.`,
  ];
  
  const index = await askChoice(paint('Select operating mode:', 'aqua', 'bold'), choices, 0, [
    'hosted-api is the normal hosted path: remote tools plus local sap_payments signing.',
    'local-dev-keypair is for developers who intentionally run local stdio tools.',
    'external-signer is preferred when a production custody layer owns signing.',
    'readonly is for discovery-only users.',
  ]);
  
  const modes: SapMcpMode[] = ['hosted-api', 'local-dev-keypair', 'external-signer', 'readonly', 'delegated-session'];
  return modes[index];
}

/**
 * Internal helper for the wizard rpc url operation.
 */
async function wizardRpcUrl(mode: SapMcpMode): Promise<string> {
  clearConsole();
  printSapLogo();
  printHeader('Step 3: Solana RPC', 'Blockchain connection settings');
  
  const isDev = mode === 'local-dev-keypair';
  const defaultRpc = isDev 
    ? 'https://api.devnet.solana.com'
    : 'https://api.mainnet-beta.solana.com';
  
  printLead('Select the Solana network and RPC endpoint this profile will use. Tools will report and execute against this configured network.');
  printControlHints();
  console.log('');
  printLabel('Common endpoints');
  printField('Mainnet', paint('https://api.mainnet-beta.solana.com', 'green'));
  printField('Devnet', paint('https://api.devnet.solana.com', 'yellow'));
  printField('Testnet', paint('https://api.testnet.solana.com', 'blue'));
  printField('Custom', 'Your own RPC endpoint');
  console.log('');
  
  const rpcUrl = await askQuestion('RPC URL', {
    defaultValue: defaultRpc,
    required: true,
    validate: validateHttpUrl,
    help: [
      'Use devnet for disposable test wallets and faucet workflows.',
      'Use mainnet-beta only when the profile wallet is intended for production assets.',
      'Custom RPC endpoints are allowed if they use http:// or https://.',
    ],
  });
  
  return rpcUrl;
}

/**
 * Internal helper for the wizard signer config operation.
 */
async function wizardSignerConfig(
  mode: SapMcpMode,
  profileName: string
): Promise<{ walletPath?: string; externalSignerUrl?: string; createNewWallet?: boolean }> {
  if (mode === 'readonly') {
    return {};
  }
  
  if (mode === 'local-dev-keypair' || mode === 'hosted-api') {
    clearConsole();
    printSapLogo();
    printHeader(
      'Step 4: Wallet Configuration',
      mode === 'hosted-api' ? 'Hosted signing profile' : 'Local keypair setup',
    );
    
    printLead(
      mode === 'hosted-api'
        ? 'Hosted SAP MCP runs remotely, but x402 payments and value-moving operations are still authorized by your local profile wallet or external signer.'
        : 'Choose the wallet that will sign transactions for this profile. A new dedicated wallet is safest for first-time setup.',
    );
    printControlHints();
    console.log('');
    printField('Profile', profileName);
    printField('Default wallet', `~/.config/mcp-sap/keypairs/${profileName}-keypair.json`);
    printWarning('The wizard never modifies ~/.config/solana/id.json and never asks you to paste secret key bytes.');
    console.log('');

    if (mode === 'hosted-api') {
      const signerType = await askChoice('Choose hosted signing method:', [
        `${paint('Dedicated local wallet', 'aqua', 'bold')} ${paint('[RECOMMENDED]', 'green')} - Creates or references a wallet under ~/.config/mcp-sap.`,
        `${paint('External signer', 'aqua', 'bold')} ${paint('[advanced]', 'yellow')} - Delegates signing to a local proxy, hardware wallet, or custody service.`,
      ], 0, [
        'The hosted MCP server never receives keypair bytes.',
        'Choose external signer when policy, custody, or hardware approval should happen outside this CLI.',
      ]);

      if (signerType === 1) {
        return { externalSignerUrl: await askExternalSignerUrl() };
      }

      console.log('');
    }
    
    const useExisting = await askChoice('Choose option:', [
      'Use existing wallet file',
      `Create new wallet for "${profileName}"`,
    ], 1, [
      'Creating a wallet is safest for new agents because it isolates funds and permissions.',
      'Using an existing wallet validates the JSON keypair file and stores only its path.',
      'Do not paste keypair bytes into the terminal.',
    ]);
    
    if (useExisting === 0) {
      // Use existing wallet
      console.log('');
      printLead('Enter the path to a Solana keypair JSON file. The wizard validates the file and stores only the path.');
      printLabel('Examples');
      printBullet(`~/.config/mcp-sap/keypairs/${profileName}-keypair.json`);
      printBullet('/path/to/wallet.json');
      console.log('');
      
      const defaultPath = defaultGeneratedWalletPath(profileName);
      
      const walletPath = await askQuestion('Wallet path', {
        defaultValue: defaultPath,
        required: true,
        transform: expandHomePath,
        validate: validateWalletFile,
        help: [
          'Enter the path to a Solana keypair JSON file.',
          'The wizard validates the file and stores the path, not the secret bytes.',
          'Use a dedicated SAP MCP wallet, not your Solana CLI id.json.',
        ],
      });
      
      return { walletPath, createNewWallet: false };
    } else {
      // Create new wallet
      const walletFileName = `${profileName}-keypair.json`;
      
      console.log('');
      printSuccess(`Will create a new dedicated wallet for profile "${profileName}".`);
      printField('Wallet path', `~/.config/mcp-sap/keypairs/${walletFileName}`);
      printInfo('This wallet is isolated from the Solana CLI keypair.');
      printWarning('Back up this keypair after creation; it controls funds for this SAP MCP profile.');
      console.log('');
      
      return { createNewWallet: true };
    }
  }
  
  if (mode === 'external-signer') {
    clearConsole();
    printSapLogo();
    printHeader('Step 4: External Signer', 'Signing service configuration');

    return { externalSignerUrl: await askExternalSignerUrl() };
  }
  
  return {};
}

/**
 * Prompts for an external signing service URL.
 */
async function askExternalSignerUrl(): Promise<string> {
  printLead('Enter the URL of the service that will sign transactions without exposing key material to the MCP server.');
  printControlHints();
  console.log('');
  printLabel('Examples');
  printBullet('http://localhost:8080/sign');
  printBullet('https://fireblocks.example.com/api/v1/sign');
  console.log('');

  return askQuestion('External signer URL', {
    defaultValue: 'http://localhost:8080/sign',
    required: true,
    validate: validateHttpUrl,
    help: [
      'The signer service must expose the SAP MCP signing protocol.',
      'Use HTTPS for remote signer services.',
      'Localhost HTTP is acceptable for local development only.',
    ],
  });
}

/**
 * Internal helper for the wizard security limits operation.
 */
async function wizardSecurityLimits(mode: SapMcpMode): Promise<{ maxTxValueSol: number; dailyLimitSol: number }> {
  if (mode === 'readonly') {
    return { maxTxValueSol: 0, dailyLimitSol: 0 };
  }
  
  clearConsole();
  printSapLogo();
  printHeader('Step 5: Security Limits', 'Transaction spending controls');
  
  printLead('Set guardrails before this profile can sign or submit transactions. These limits are enforced before signing.');
  printControlHints();
  console.log('');
  
  const maxTxValueSol = await askQuestion(
    paint('Maximum transaction value (SOL)', 'aqua'),
    {
      defaultValue: defaults.maxTxValueSol.toString(),
      required: true,
      validate: validateSolAmount('Maximum transaction value', { allowZero: false }),
      help: [
        'This is a hard per-transaction ceiling enforced before signing.',
        'For test/dev profiles, 1 SOL or less is usually enough.',
      ],
    }
  );
  
  const dailyLimitSol = await askQuestion(
    paint('Daily spending limit (SOL)', 'aqua'),
    {
      defaultValue: defaults.dailyLimitSol.toString(),
      required: true,
      validate: validateDailyLimit(Number(maxTxValueSol)),
      help: [
        'This is the total native SOL value allowed per day.',
        'It must be greater than or equal to the per-transaction maximum.',
      ],
    }
  );
  
  return {
    maxTxValueSol: parseFloat(maxTxValueSol) || defaults.maxTxValueSol,
    dailyLimitSol: parseFloat(dailyLimitSol) || defaults.dailyLimitSol,
  };
}

/**
 * Internal helper for the wizard bento integration operation.
 */
async function wizardBentoIntegration(): Promise<{ enableBento: boolean; bentoApiKey?: string; bentoAgentId?: string }> {
  clearConsole();
  printSapLogo();
  printHeader('Step 6: Bento Guard Integration', 'Optional AI-powered security layer');
  
  printLead('Bento Guard is optional. When enabled, local deterministic policy still runs and Bento adds AI-assisted intent scoring.');
  printControlHints();
  console.log('');
  printWarning('This step is optional. Choose no to use local policy enforcement only.');
  console.log('');
  printLabel('If enabled');
  printBullet('Tool calls are scored for intent and policy risk.');
  printBullet('Suspicious actions can be escalated or blocked.');
  printBullet('Bento outages follow your configured fail-open/fail-closed policy.');
  printBullet('API keys are redacted in summaries.');
  console.log('');
  
  const enableBento = await askConfirm('Enable Bento Guard integration?', false, [
    'Choose no for local-only policy enforcement.',
    'Choose yes when you have Bento credentials and want hybrid policy checks.',
  ]);
  
  if (!enableBento) {
    console.log('');
    printInfo('Skipping Bento. This profile will use local policy enforcement only.');
    printLabel('Enable later with');
    printBullet('SAP_MCP_BENTO_API_KEY');
    printBullet('SAP_MCP_BENTO_AGENT_ID');
    console.log('');
    return { enableBento: false };
  }
  
  console.log('');
  printLead('Enter your Bento Guard credentials.');
  printField('Dashboard', 'https://app.bentoguard.xyz');
  console.log('');
  
  const bentoApiKey = await askQuestion(paint('Bento API Key', 'aqua'), {
    required: true,
    help: [
      'Paste only the Bento API key here.',
      'It is redacted in the summary and can be rotated later.',
    ],
  });
  
  const bentoAgentId = await askQuestion(
    paint('Bento Agent ID', 'aqua'),
    {
      defaultValue: 'sap-mcp-server-' + Math.random().toString(36).substring(2, 8),
      required: true,
      validate: (value) => /^[a-zA-Z0-9_.:-]+$/.test(value)
        ? undefined
        : 'Bento Agent ID may contain letters, numbers, dot, underscore, colon, or hyphen.',
      help: [
        'This identifies this SAP MCP server inside Bento policy logs.',
      ],
    }
  );
  
  console.log('');
  printSuccess('Bento Guard will be used for policy enforcement.');
  printInfo('Local policies still run as deterministic guardrails.');
  console.log('');
  
  return {
    enableBento: true,
    bentoApiKey,
    bentoAgentId,
  };
}

/**
 * Internal helper for the wizard http transport operation.
 */
async function wizardHttpTransport(_mode: SapMcpMode): Promise<{ enableHttp: boolean; httpPort: number }> {
  return { enableHttp: false, httpPort: defaults.httpPort };
}

/**
 * Internal helper for the wizard logging operation.
 */
async function wizardLogging(): Promise<{ logLevel: WizardLogLevel; enableMetrics: boolean }> {
  clearConsole();
  printSapLogo();
  printHeader('Step 8: Logging & Observability', 'Debugging and monitoring');
  
  printLead('Choose how much operational detail SAP MCP should write to logs.');
  printControlHints();
  console.log('');
  
  const logChoices: WizardLogLevel[] = ['debug', 'info', 'warn', 'error'];
  const logIndex = await askChoice(
    'Log level:',
    logChoices.map((level, i) => {
      const colors: ColorName[] = ['blue', 'aqua', 'yellow', 'red'];
      return paint(level, colors[i]);
    }),
    1,
    [
      'info is recommended for normal use.',
      'debug is useful while integrating Hermes, Claude, Codex, or OpenClaw.',
      'error is quietest and best for stable production logs.',
    ]
  );
  
  const enableMetrics = await askConfirm('Enable Prometheus metrics?', false, [
    'Metrics expose operational counters for monitoring.',
    'Enable when deploying behind a trusted network or protected reverse proxy.',
  ]);
  
  return {
    logLevel: logChoices[logIndex],
    enableMetrics,
  };
}

/**
 * Formats a discovered MCP client target for selector output.
 */
function formatMcpClientTarget(target: McpClientTarget): string {
  const state = target.exists ? 'found' : 'will create';
  const profile = target.profileName ? ` (${target.profileName})` : '';
  return `${target.label}${profile} - ${state} - ${target.path}`;
}

/**
 * Prints copy/paste JSON snippets for manual MCP client setup.
 */
function printManualMcpJsonSnippets(canonical = createCanonicalServerConfig(process.cwd())): void {
  const snippets = createManualMcpJsonSnippets(canonical);

  console.log('');
  printSection('Manual MCP Client Configuration');
  printLead('Paste the snippet that matches your MCP client config format. Codex uses TOML, Hermes profile config uses YAML, and Claude/OpenClaw commonly use JSON.');
  printWarning('Do not add wallet paths, RPC overrides, profile names, or keypair bytes to client config.');
  console.log('');

  for (const snippet of snippets) {
    printLabel(snippet.title);
    printBullet(snippet.description);
    console.log('');
    console.log(snippet.content.trimEnd());
    console.log('');
  }
}

/**
 * Prints the recommended hosted MCP client configuration.
 */
function printHostedMcpJsonSnippet(canonical = createCanonicalServerConfig(process.cwd())): void {
  const hostedSnippets = createManualMcpJsonSnippets(canonical)
    .filter((snippet) => snippet.title.startsWith('Hosted SAP MCP'));

  if (hostedSnippets.length === 0) {
    printError('Hosted SAP MCP config snippets are not available.');
    return;
  }

  console.log('');
  printSection('Hosted SAP MCP Configuration');
  printLead('Use this for agents that should connect to the OOBE hosted MCP server.');
  printInfo('Hosted mode uses the remote MCP transport, but the user SAP profile and signer are still created locally by this wizard.');
  printInfo('The local wallet or external signer is what authorizes x402, pay.sh, and any value-moving tool transaction.');
  console.log('');
  printField('Hosted MCP URL', 'https://mcp.sap.oobeprotocol.ai/mcp');
  printWarning('Do not paste keypair bytes into hosted client config. Keep wallet material in ~/.config/mcp-sap or an external signer.');
  printWarning('Do not add stale SAP_MCP_RPC_URL or SAP_WALLET_PATH overrides to the hosted MCP block.');
  console.log('');
  for (const hostedSnippet of hostedSnippets) {
    printLabel(`${hostedSnippet.title} ${paint('[RECOMMENDED]', 'green', 'bold')}`);
    printBullet(hostedSnippet.description);
    printBullet('Run the wizard first to create the user SAP profile, wallet path, policy limits, and signing preferences.');
    printBullet('For signing flows, the agent must use the configured local wallet/external signer rather than expecting the hosted server to hold private keys.');
    console.log('');
    console.log(hostedSnippet.content.trimEnd());
    console.log('');
  }
}

/**
 * Prints manual local payment bridge snippets for agent runtimes.
 */
function printX402PaidCallAddonSnippets(titleFilter?: (title: string) => boolean): void {
  console.log('');
  printSection('SAP MCP Local Payment Bridge Snippets');
  printLead('Use these snippets when your agent runtime can connect to hosted SAP MCP but cannot natively replay x402 challenges.');
  printInfo('The sap_payments bridge signs x402 payment payloads locally with the SAP MCP profile wallet or external signer. It never sends keypair bytes to the hosted server.');
  printWarning('Every paid call must set a max USD cap and explicit confirmation.');
  console.log('');

  for (const snippet of createX402PaidCallAddonSnippets().filter((item) => !titleFilter || titleFilter(item.title))) {
    printLabel(snippet.title);
    printBullet(snippet.description);
    console.log('');
    console.log(snippet.content.trimEnd());
    console.log('');
  }
}

/**
 * Installs hosted SAP MCP plus local sap_payments bridge configs for the normal hosted path.
 */
function installRecommendedPaymentBridgeConfigs(): void {
  const runtimeIds: McpClientId[] = ['codex', 'claude', 'hermes', 'openclaw'];
  const results = installHostedPaymentBridgeConfigs(runtimeIds);
  if (results.length === 0) {
    printWarning('No supported MCP client config target was detected or createable on this machine.');
    printX402PaidCallAddonSnippets();
    return;
  }

  for (const result of results) {
    printSuccess(result.message);
    printBullet(result.target.path);
    if (result.backupPath) {
      printBullet(`Backup: ${result.backupPath}`);
    }
  }

  const bundle = installX402PaidCallAddon();
  printSuccess(`Installed ${bundle.addonId} bridge reference bundle to ${bundle.targetDir}`);
  printInfo('Restart your agent runtime, then use sap_payments.sap_payments_call_paid_tool for hosted paid/write SAP MCP tools.');
}

/**
 * Runs the optional local x402 payment bridge setup step.
 */
async function wizardX402PaidCallAddon(): Promise<void> {
  console.log('');
  printSection('SAP MCP Local Payment Bridge');
  printLead('This is the recommended hosted setup: the agent connects to remote SAP MCP, while sap_payments signs x402 proofs locally with your SAP profile.');
  printInfo('Use it for Hermes, Claude, Codex, OpenClaw, or custom agents that will call paid hosted tools.');
  printInfo('Preferred tool: sap_payments_call_paid_tool. The sap_x402_paid_call name is only a backward-compatible alias.');
  printWarning('This bridge does not store or print keypair bytes. It uses the active SAP MCP profile at call time.');
  printControlHints();
  console.log('');

  const choice = await askChoice(
    'How should hosted paid/write tools be enabled?',
    [
      `${paint('Configure supported runtimes automatically: hosted sap + local sap_payments', 'aqua', 'bold')} ${paint('[RECOMMENDED]', 'green', 'bold')}`,
      `${paint('Configure Codex automatically only', 'aqua', 'bold')}`,
      'Print Claude Code / Claude Desktop payment bridge instructions',
      'Print Hermes payment bridge instructions',
      'Print OpenClaw / generic payment bridge instructions',
      `${paint('Install local bridge reference bundle and print all runtime snippets', 'aqua', 'bold')}`,
      'Skip payment bridge setup',
    ],
    0,
    [
      'Writes native config for supported runtimes so hosted sap and local sap_payments are both available.',
      'Writes ~/.codex/config.toml only.',
      'Shows the official Claude MCP CLI flow plus Claude-style JSON config.',
      'Shows Hermes profile/global config options for hosted sap plus local sap_payments.',
      'Shows JSON snippets for runtimes with mcpServers support.',
      'Writes manifest, README, and client snippets for repair/custom clients.',
      'Skip if this profile will only use free/read-only hosted tools.',
    ],
  );

  if (choice === 6) {
    printInfo('Skipped local payment bridge setup.');
    return;
  }

  if (choice === 0) {
    installRecommendedPaymentBridgeConfigs();
    return;
  }

  if (choice === 2) {
    printX402PaidCallAddonSnippets((title) => title.startsWith('Claude'));
    return;
  }

  if (choice === 3) {
    printX402PaidCallAddonSnippets((title) => title.startsWith('Hermes'));
    return;
  }

  if (choice === 4) {
    printX402PaidCallAddonSnippets((title) => title.startsWith('OpenClaw') || title.includes('Local MCP Tool'));
    return;
  }

  if (choice === 1) {
    const codexResult = installCodexHostedPaymentBridgeConfig();
    printSuccess(codexResult.message);
    printBullet(codexResult.target.path);
    if (codexResult.backupPath) {
      printBullet(`Backup: ${codexResult.backupPath}`);
    }
    printInfo('Restart Codex completely, then ask it to use sap_payments.sap_payments_call_paid_tool for hosted paid/write SAP MCP tools.');
  }

  const result = installX402PaidCallAddon();
  printSuccess(`Installed ${result.addonId} bridge reference bundle to ${result.targetDir}`);
  for (const file of result.files) {
    printBullet(file);
  }
  printX402PaidCallAddonSnippets();
}

/**
 * Runs the recommended MCP client setup step after profile config has been saved.
 */
async function wizardMcpClientInjection(result: WizardSetupResult): Promise<void> {
  clearConsole();
  printSapLogo();
  printHeader('Recommended MCP Client Setup', 'Hosted tools plus local payments bridge');

  printLead('Choose how Claude, Hermes, OpenClaw, Codex, or another MCP client should reach SAP MCP.');
  printInfo('Recommended: connect the agent to hosted SAP MCP and add the local sap_payments bridge for x402 paid/write tools.');
  printInfo('Injected hosted config does not pin wallet paths, RPC overrides, profile names, or keypair bytes.');
  console.log('');
  printField('Agent public key', result.config.agentPubkey ?? 'not configured');
  printField('Config path', result.configPath);
  printField('Hosted MCP URL', 'https://mcp.sap.oobeprotocol.ai/mcp');
  printControlHints();
  console.log('');

  const setupMode = await askChoice(
    'How do you want to configure MCP clients?',
    [
      `${paint('Automatically configure hosted sap + local sap_payments for supported runtimes', 'aqua', 'bold')} ${paint('[RECOMMENDED]', 'green', 'bold')}`,
      'Print hosted SAP MCP config snippets for Claude, Hermes, Codex, OpenClaw',
      'Print all manual config snippets for hosted and local setup',
      'Advanced: inject local active-profile stdio config into detected client files',
      'Skip all runtime configuration',
    ],
    0,
    [
      'Recommended for most users: hosted remote tools plus local payment/signing bridge.',
      'Use snippets when you want to paste config manually.',
      'Manual snippets are useful when configuring an unknown client or comparing hosted and local setup.',
      'Advanced local stdio is for developers who intentionally do not want hosted remote MCP.',
      'Use this only if you will configure MCP clients later.',
    ]
  );

  const canonical = createCanonicalServerConfig(process.cwd());

  if (setupMode === 0) {
    installRecommendedPaymentBridgeConfigs();
    return;
  }

  if (setupMode === 1) {
    printHostedMcpJsonSnippet(canonical);
    await wizardX402PaidCallAddon();
    return;
  }

  if (setupMode === 2) {
    printManualMcpJsonSnippets(canonical);
    await wizardX402PaidCallAddon();
    return;
  }

  if (setupMode === 4) {
    printInfo('Skipped MCP client and local payment bridge configuration.');
    return;
  }

  const targets = discoverMcpClientTargets();
  if (targets.length === 0) {
    printWarning('No known MCP client config paths were found.');
    await wizardX402PaidCallAddon();
    return;
  }

  const selectedIndexes = await askMultiChoice(
    'Select client configs to update:',
    targets.map(formatMcpClientTarget),
    [],
    [
      'Use "all" to select every discovered config.',
      'The wizard previews every change and asks again before writing.',
      'Existing SAP MCP entries trigger merge/override/skip choices.',
    ]
  );

  if (selectedIndexes.length === 0) {
    printInfo('No MCP client configs selected.');
    await wizardX402PaidCallAddon();
    return;
  }

  const applied: string[] = [];

  for (const index of selectedIndexes) {
    const target = targets[index];
    const previewPlan = planMcpClientInjection(target, canonical, 'merge');

    console.log('');
    printSection(target.label);
    printField('Path', target.path);
    printField('Current', previewPlan.beforeSummary);
    printField('Result', previewPlan.afterSummary);

    if (previewPlan.legacyFindings.length > 0) {
      printWarning('Existing config contains SAP MCP related entries:');
      for (const finding of previewPlan.legacyFindings) {
        printBullet(finding);
      }
    }

    let mode: McpClientInjectionMode = 'merge';
    if (previewPlan.hadSapConfig || previewPlan.legacyFindings.length > 0) {
      const choice = await askChoice(
        'How should this SAP MCP config be updated?',
        [
          'Merge and clean stale SAP env overrides',
          'Override the SAP MCP block completely',
          'Skip this client config',
        ],
        0,
        [
          'Merge preserves unrelated environment values and removes wallet/RPC/profile overrides.',
          'Override replaces only the SAP MCP server entry/block.',
          'Skip leaves this file unchanged.',
        ]
      );

      if (choice === 2) {
        printInfo(`Skipped ${target.label}.`);
        continue;
      }

      mode = choice === 1 ? 'override' : 'merge';
    }

    const plan = planMcpClientInjection(target, canonical, mode);
    const shouldApply = await askConfirm(`Apply ${mode} to ${target.label}?`, true, [
      `Backup will be created when the file already exists: ${plan.backupPath ?? 'not needed for new file'}`,
      'The injected SAP MCP entry follows the active profile manager and does not include wallet paths or keypair bytes.',
    ]);

    if (!shouldApply) {
      printInfo(`Skipped ${target.label}.`);
      continue;
    }

    const writeResult = applyMcpClientInjection(plan);
    applied.push(`${writeResult.message}${writeResult.backupPath ? ` (backup: ${writeResult.backupPath})` : ''}`);
    printSuccess(writeResult.message);
  }

  console.log('');
  if (applied.length === 0) {
    printInfo('No MCP client config files were changed.');
    await wizardX402PaidCallAddon();
    return;
  }

  printSuccess('MCP client injection complete.');
  for (const item of applied) {
    console.log(`  - ${item}`);
  }
  await wizardX402PaidCallAddon();
}

/**
 * Internal helper for the wizard summary operation.
 */
async function wizardSummary(config: WizardSetupInput) {
  clearConsole();
  printSapLogo();
  printHeader('Configuration Summary', 'Review before saving');
  
  printLead('Review the profile before it becomes active for MCP clients. Values marked redacted are intentionally not displayed.');
  console.log('');
  
  // Pretty print with colors
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.includes('Key') || key.includes('Secret')) {
      summary[key] = '[REDACTED]';
    } else {
      summary[key] = value;
    }
  }
  
  console.log(JSON.stringify(summary, null, 2));
  console.log('');
  printLabel('Operational impact');
  printBullet(`Active profile will be set to: ${config.profileName}`);
  printBullet('MCP clients should omit SAP_MCP_PROFILE to follow the active profile manager.');
  printBullet('Wallet secret bytes are never printed in this wizard output.');
  if (config.mode === 'local-dev-keypair') {
    printBullet('This profile can sign transactions; preview and policy checks still apply.');
  }
  if (config.mode === 'hosted-api') {
    printBullet('This profile is for the OOBE hosted MCP endpoint; it does not start a local HTTP server.');
  }
  console.log('');
  
  const confirmed = await askConfirm('Save this configuration?', true, [
    'Choose yes to write the profile config and update .active-profile.',
    'Choose no or type /exit to leave without saving.',
  ]);
  
  if (!confirmed) {
    console.log('');
    printError('Configuration cancelled. Run wizard again to retry.');
    return false;
  }
  
  return true;
}

// ============================================================================
// Main Wizard Function
// ============================================================================

/**
 * Executes the run wizard operation.
 */
export async function runWizard() {
  try {
    // Welcome
    await wizardWelcome();
    
    // Step 1: Profile
    const profileName = await wizardProfile();
    
    // Step 2: Mode
    const mode = await wizardMode();
    
    // Step 3: RPC
    const rpcUrl = await wizardRpcUrl(mode);
    
    // Step 4: Signer (pass profileName for wallet path)
    const signerConfig = await wizardSignerConfig(mode, profileName);
    
    // Step 5: Security
    const securityLimits = await wizardSecurityLimits(mode);
    
    // Step 6: Bento Integration (optional)
    const bentoConfig = await wizardBentoIntegration();
    
    // Step 7: HTTP (if hosted-api)
    const httpConfig = await wizardHttpTransport(mode);
    
    // Step 8: Logging
    const loggingConfig = await wizardLogging();
    
    // Build final config
    const config: WizardSetupInput = {
      mode,
      rpcUrl,
      profileName,  // Include profile name for wallet path generation
      ...signerConfig,
      ...securityLimits,
      ...httpConfig,
      ...loggingConfig,
      enableBento: bentoConfig.enableBento,
      bentoApiKey: bentoConfig.bentoApiKey,
      bentoAgentId: bentoConfig.bentoAgentId,
    };
    
    // Summary and confirmation
    const confirmed = await wizardSummary(config);
    
    if (!confirmed) {
      rl.close();
      return;
    }
    
    // Save configuration
    clearConsole();
    printSapLogo();
    printHeader('Saving Configuration', 'Please wait...');
    
    const result = await saveWizardSetup(config);
    printSuccess(`Configuration saved to ${result.configPath}`);
    if (result.walletPath) {
      printSuccess(`${result.walletCreated ? 'Wallet created' : 'Wallet configured'} at ${result.walletPath}`);
      if (result.config.agentPubkey) {
        console.log('');
        printField('Agent public key', result.config.agentPubkey);
        printInfo('Use this public key for SAP agent registration, SNS linking, and operator identity.');
      }
    }
    await wizardMcpClientInjection(result);
    
    console.log('\n');
    printSuccess('Configuration complete!');
    console.log('');
    if (mode === 'hosted-api') {
      printLabel('Connect hosted SAP MCP');
      printBullet(paint('https://mcp.sap.oobeprotocol.ai/mcp', 'aqua'));
      printBullet('Use the hosted snippets above for Claude, Hermes, OpenClaw, Codex, or another MCP client.');
    } else {
      printLabel('Start local stdio MCP');
      printBullet(paint('npx sap-mcp-server', 'aqua'));
    }
    console.log('');
    printLabel('Recommended MCP client environment');
    printBullet(`${paint('SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE=false', 'aqua')} keeps clients pointed at the active profile manager.`);
    printBullet(`${paint('SAP_LOG_LEVEL=info', 'aqua')} keeps logs useful without debug noise.`);
    console.log('');
    printLabel('Manage this setup later');
    printBullet(paint('npx sap-mcp-config show', 'aqua'));
    printBullet(paint('npx sap-mcp-config profiles', 'aqua'));
    printBullet(paint('npx sap-mcp-config profile <name>', 'aqua'));
    printBullet(paint('npx sap-mcp-config set <field> <value>', 'aqua'));
    console.log('');
    
    rl.close();
  } catch (error) {
    if (error instanceof WizardCancelled) {
      console.log('');
      printWarning('Wizard cancelled. No configuration was saved.');
      rl.close();
      return;
    }

    console.error('');
    printError(`Error during wizard: ${error instanceof Error ? error.message : String(error)}`);
    rl.close();
    process.exit(1);
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (process.argv[1]?.endsWith('wizard.ts') || process.argv[1]?.endsWith('wizard.js')) {
  runWizard();
}
