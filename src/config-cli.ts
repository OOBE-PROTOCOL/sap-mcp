#!/usr/bin/env node

/**
 * SAP MCP Server - Config CLI
 * 
 * Manage secure JSON configuration with approval workflow.
 * 
 * Usage:
 *   npx sap-mcp-config init              # Create default config
 *   npx sap-mcp-config wizard            # Interactive setup wizard
 *   npx sap-mcp-config show              # Show current config
 *   npx sap-mcp-config set mode readonly # Set a field
 *   npx sap-mcp-config pending           # List pending changes
 *   npx sap-mcp-config approve <id>      # Approve a change
 *   npx sap-mcp-config deny <id>         # Deny a change
 *   npx sap-mcp-config audit             # Show audit log
 */

import { getConfigManager, type AuditEntry, type FullConfig, type PendingChange } from './config/secure-config.js';
import { runWizard } from './config/wizard.js';
import { getPreferredConfigDir } from './config/paths.js';
import {
  listProfiles,
  switchProfile,
  createProfile,
  deleteProfile,
  getCurrentProfileInfo,
  getActiveProfile,
  getProfileConfigPath,
  loadProfileConfig,
} from './config/profiles.js';
import { existsSync, readFileSync } from 'fs';

const cliColors = {
  aqua: '\x1b[36m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  purple: '\x1b[35m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
} as const;

type CliColor = Exclude<keyof typeof cliColors, 'reset'>;

const secretFieldPattern = /(?:apiKey|secret|privateKey|mnemonic|password|token)/i;

/**
 * Wraps terminal output with an ANSI color and reset sequence.
 */
function colorize(value: string, color: CliColor): string {
  return `${cliColors[color]}${value}${cliColors.reset}`;
}

/**
 * Prints a wizard-style boxed header for config CLI commands.
 */
function printCliHeader(title: string, subtitle?: string): void {
  const width = 70;
  const line = '═'.repeat(width);
  const space = ' '.repeat(width);

  console.log('');
  console.log(colorize(`╔${line}╗`, 'purple'));
  console.log(`${colorize('║', 'purple')}${space}${colorize('║', 'purple')}`);

  const titlePadding = Math.max(0, Math.floor((width - title.length) / 2));
  const titleLine = ' '.repeat(titlePadding) + title + ' '.repeat(Math.max(0, width - titlePadding - title.length));
  console.log(`${colorize('║', 'purple')}${titleLine}${colorize('║', 'purple')}`);

  if (subtitle) {
    const subtitlePadding = Math.max(0, Math.floor((width - subtitle.length) / 2));
    const subtitleLine = ' '.repeat(subtitlePadding) + subtitle + ' '.repeat(Math.max(0, width - subtitlePadding - subtitle.length));
    console.log(`${colorize('║', 'purple')}${subtitleLine}${colorize('║', 'purple')}`);
  }

  console.log(`${colorize('║', 'purple')}${space}${colorize('║', 'purple')}`);
  console.log(colorize(`╚${line}╝`, 'purple'));
  console.log('');
}

/**
 * Prints a wizard-style section divider.
 */
function printCliSection(title: string): void {
  console.log(colorize('─'.repeat(70), 'purple'));
  console.log(`  ${colorize(title, 'aqua')}`);
  console.log(colorize('─'.repeat(70), 'purple'));
}

/**
 * Prints a colored key/value row.
 */
function printKeyValue(label: string, value: unknown, valueColor: CliColor = 'aqua'): void {
  console.log(`  ${colorize(`${label}:`, 'aqua')} ${colorize(formatCliValue(value), valueColor)}`);
}

/**
 * Prints a success message using the same visual language as the wizard.
 */
function printSuccess(message: string): void {
  console.log(`${colorize('✓', 'green')} ${message}`);
}

/**
 * Prints a warning message using the same visual language as the wizard.
 */
function printWarning(message: string): void {
  console.log(`${colorize('⚠', 'yellow')} ${message}`);
}

/**
 * Prints an error message using the same visual language as the wizard.
 */
function printCliError(message: string): void {
  console.error(`${colorize('✗', 'red')} ${message}`);
}

/**
 * Formats scalar and object values for CLI display without losing type meaning.
 */
function formatCliValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

/**
 * Returns true when a config field name should not be printed verbatim.
 */
function isSecretField(fieldName: string): boolean {
  return secretFieldPattern.test(fieldName);
}

/**
 * Redacts secret-looking config values before they are printed to a terminal.
 */
function redactForDisplay(value: unknown, fieldName = ''): unknown {
  if (isSecretField(fieldName)) {
    return '[redacted]';
  }

  if (Array.isArray(value)) {
    if (value.length >= 32 && value.every((item) => typeof item === 'number')) {
      return '[redacted byte array]';
    }

    return value.map((item) => redactForDisplay(item, fieldName));
  }

  if (value && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      redacted[key] = redactForDisplay(nestedValue, key);
    }
    return redacted;
  }

  return value;
}

/**
 * Formats a field value after applying terminal-safe redaction.
 */
function formatDisplayValue(fieldName: string, value: unknown): string {
  return formatCliValue(redactForDisplay(value, fieldName));
}

/**
 * Prints one pending config change in a readable, colorized block.
 */
function printPendingChange(change: PendingChange): void {
  console.log(`${colorize('ID', 'aqua')}: ${colorize(change.id, 'purple')}`);
  printKeyValue('Field', change.field, 'yellow');
  printKeyValue('Old', formatDisplayValue(change.field, change.oldValue), 'gray');
  printKeyValue('New', formatDisplayValue(change.field, change.newValue), 'green');
  printKeyValue('Requested', `${change.requestedAt} by ${change.requestedBy}`, 'aqua');
  printKeyValue('Expires', change.expiresAt, 'yellow');
  printKeyValue('Status', change.status, change.status === 'pending' ? 'yellow' : 'green');
  console.log('');
}

/**
 * Prints one audit entry in a readable, colorized block.
 */
function printAuditEntry(entry: AuditEntry): void {
  console.log(`${colorize(`[${entry.timestamp}]`, 'gray')} ${colorize(entry.action, 'purple')}`);
  printKeyValue('User', entry.user, 'aqua');

  for (const change of entry.changes ?? []) {
    printKeyValue('Change', change.field, 'yellow');
    printKeyValue('Old', formatDisplayValue(change.field, change.oldValue), 'gray');
    printKeyValue('New', formatDisplayValue(change.field, change.newValue), 'green');
  }

  printKeyValue('Approval', entry.approvalStatus || 'not required', entry.approvalStatus === 'denied' ? 'red' : 'green');
  printKeyValue('Hash', entry.configHash, 'gray');
  console.log('');
}

/**
 * Loads the active profile config, falling back to the default secure config manager for first-run setup.
 */
function loadActiveConfigForDisplay(): { config: FullConfig; profileName: string; configPath: string } {
  const profileName = getActiveProfile();
  const profileConfig = loadProfileConfig(profileName);
  if (profileConfig) {
    return {
      config: profileConfig,
      profileName,
      configPath: getProfileConfigPath(profileName),
    };
  }

  return {
    config: getConfigManager().load(),
    profileName: 'default',
    configPath: `${getPreferredConfigDir()}/config.json`,
  };
}

/**
 * Internal helper for the print usage operation.
 */
function printUsage() {
  const purple = cliColors.purple;
  const aqua = cliColors.aqua;
  const reset = cliColors.reset;

  printCliHeader('SAP MCP Config Manager');
  console.log('');
  console.log(`${aqua}Usage:${reset} sap-mcp-config <command> [options]`);
  console.log('');
  console.log(`${purple}Core Commands:${reset}`);
  console.log('  init                      Create default configuration');
  console.log('  wizard                    Interactive setup wizard (recommended for first-time)');
  console.log('  show                      Show current configuration');
  console.log('  set <field> <value>       Set a configuration field');
  console.log('  pubkey                    Show agent public key');
  console.log('  info                      Show full configuration info');
  console.log('  wallet                    Show wallet information');
  console.log('');
  console.log(`${purple}Profile Management (Multi-Agent):${reset}`);
  console.log('  profiles                  List all available profiles');
  console.log('  profile <name>            Switch to a profile');
  console.log('  create-profile <name>     Create new profile from current');
  console.log('  delete-profile <name>     Delete a profile');
  console.log('  profile-info              Show current profile info');
  console.log('');
  console.log(`${purple}Approval Workflow:${reset}`);
  console.log('  pending                   List pending changes');
  console.log('  approve <id>              Approve a pending change');
  console.log('  deny <id>                 Deny a pending change');
  console.log('');
  console.log(`${purple}Audit & Security:${reset}`);
  console.log('  audit                     Show audit log');
  console.log('  hash                      Show config hash');
  console.log('');
  console.log(`${purple}Other:${reset}`);
  console.log('  help                      Show this help message');
  console.log('');
  console.log(`${aqua}Examples:${reset}`);
  console.log(`  ${purple}sap-mcp-config wizard${reset}              # Start interactive wizard`);
  console.log(`  ${purple}sap-mcp-config pubkey${reset}              # Show agent pubkey`);
  console.log(`  ${purple}sap-mcp-config profiles${reset}            # List all profiles`);
  console.log(`  ${purple}sap-mcp-config profile hermes${reset}      # Switch to hermes profile`);
  console.log(`  ${purple}sap-mcp-config create-profile claude${reset}   # Create claude profile`);
  console.log(`  ${purple}sap-mcp-config set mode readonly${reset}`);
  console.log(`  ${purple}sap-mcp-config pending${reset}`);
  console.log(`  ${purple}sap-mcp-config approve chg_1719139200_abc123${reset}`);
  console.log(`  ${purple}sap-mcp-config audit --limit 20${reset}`);
  console.log('');
}

/**
 * Internal helper for the main operation.
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  try {
    const configManager = getConfigManager();

    switch (command) {
      case 'init': {
        console.log('Initializing configuration...');
        configManager.load();
        console.log('✓ Configuration initialized at:', `${getPreferredConfigDir()}/config.json`);
        console.log('');
        console.log('Edit with: sap-mcp-config set <field> <value>');
        console.log('Or use wizard for interactive setup: sap-mcp-config wizard');
        break;
      }

      case 'wizard': {
        console.log('Starting interactive configuration wizard...\n');
        await runWizard();
        break;
      }

      case 'show': {
        const { config, profileName, configPath } = loadActiveConfigForDisplay();
        printCliHeader('Current Configuration', 'Active SAP MCP profile');
        printCliSection('Profile');
        printKeyValue('Name', profileName, 'green');
        printKeyValue('Path', configPath, 'purple');
        printKeyValue('Config Root', getPreferredConfigDir(), 'aqua');
        console.log('');
        printCliSection('JSON');
        console.log(colorize('Secret values are redacted before display.', 'gray'));
        console.log(JSON.stringify(redactForDisplay(config), null, 2));
        console.log('');
        break;
      }

      // Profile Management
      case 'profiles': {
        const profiles = listProfiles();
        
        if (profiles.length === 0) {
          console.log('No profiles found. Create one with: sap-mcp-config create-profile <name>');
        } else {
          console.log('Available Profiles:');
          console.log('─────────────────────────────────────────────────────────');
          
          for (const profile of profiles) {
            const activeMarker = profile.name === getActiveProfile() ? '● ' : '  ';
            console.log(`${activeMarker}${profile.name}`);
            console.log(`   Path: ${profile.path}`);
            if (profile.agentPubkey) {
              console.log(`   Pubkey: ${profile.agentPubkey}`);
            }
            if (profile.mode) {
              console.log(`   Mode: ${profile.mode}`);
            }
            if (profile.walletPath) {
              console.log(`   Wallet: ${profile.walletPath}`);
            }
            console.log('');
          }
        }
        break;
      }

      case 'profile': {
        if (args.length < 2) {
          console.error('Error: Missing profile name');
          console.log('Usage: sap-mcp-config profile <name>');
          console.log('');
          console.log('Available profiles:');
          const profiles = listProfiles();
          for (const p of profiles) {
            const activeMarker = p.name === getActiveProfile() ? '●' : ' ';
            console.log(`  ${activeMarker} ${p.name}`);
          }
          process.exit(1);
        }
        
        const profileName = args[1];
        const result = switchProfile(profileName);
        
        if (result.success) {
          console.log(`✓ ${result.message}`);
          
          // Show new profile info
          const newConfig = loadProfileConfig(profileName);
          if (newConfig) {
            console.log('');
            console.log('New Profile Configuration:');
            console.log(`  Agent Pubkey: ${newConfig.agentPubkey || 'Not set'}`);
            console.log(`  Mode: ${newConfig.mode}`);
            console.log(`  RPC: ${newConfig.rpcUrl}`);
            console.log(`  Wallet: ${newConfig.walletPath || 'Not set'}`);
          }
        } else {
          console.error(`✗ ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'create-profile': {
        if (args.length < 2) {
          console.error('Error: Missing profile name');
          console.log('Usage: sap-mcp-config create-profile <name> [copy-from]');
          process.exit(1);
        }
        
        const profileName = args[1];
        const copyFrom = args[2]; // Optional
        
        const result = await createProfile(profileName, copyFrom);
        
        if (result.success) {
          console.log(`✓ ${result.message}`);
        } else {
          console.error(`✗ ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'delete-profile': {
        if (args.length < 2) {
          console.error('Error: Missing profile name');
          console.log('Usage: sap-mcp-config delete-profile <name>');
          process.exit(1);
        }
        
        const profileName = args[1];
        const result = await deleteProfile(profileName);
        
        if (result.success) {
          console.log(`✓ ${result.message}`);
        } else {
          console.error(`✗ ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'profile-info': {
        const info = getCurrentProfileInfo();
        
        console.log('Current Profile:');
        console.log('─────────────────────────────────────────────────────────');
        console.log(`Name: ${info.name}`);
        console.log(`Path: ${info.path}`);
        console.log(`Exists: ${info.exists ? 'Yes' : 'No'}`);
        
        if (info.exists) {
          if (info.agentPubkey) {
            console.log(`Agent Pubkey: ${info.agentPubkey}`);
          }
          if (info.mode) {
            console.log(`Mode: ${info.mode}`);
          }
          if (info.walletPath) {
            console.log(`Wallet: ${info.walletPath}`);
          }
        }
        break;
      }

      // Config Extension Commands
      case 'pubkey': {
        const { config, configPath } = loadActiveConfigForDisplay();
        const purple = '\x1b[35m';
        const aqua = '\x1b[36m';
        const green = '\x1b[32m';
        const yellow = '\x1b[33m';
        const reset = '\x1b[0m';
        
        console.log('');
        console.log(`${purple}╔══════════════════════════════════════════════════════════╗${reset}`);
        console.log(`${purple}║${reset}           SAP MCP Agent Public Key      ${purple}║${reset}`);
        console.log(`${purple}╚══════════════════════════════════════════════════════════╝${reset}`);
        console.log('');
        
        if (config.agentPubkey) {
          console.log(`${aqua}Agent Public Key:${reset} ${green}${config.agentPubkey}${reset}`);
          console.log('');
          console.log(`${aqua}This pubkey is:${reset}`);
          console.log(`  ${green}✓${reset} Auto-extracted from your wallet file`);
          console.log(`  ${green}✓${reset} Saved in config for easy access`);
          console.log(`  ${green}✓${reset} Used for SAP agent registration`);
          console.log('');
          console.log(`${aqua}Use this pubkey to:${reset}`);
          console.log('  - Register your SAP agent on-chain');
          console.log('  - Bridge Identity over Metaplex 014 Agent Registry');
          console.log('  - Link SNS domain to your agent');
          console.log('  - Configure AI agent identity');
          console.log('  - Execute tools on Solana and SAP');
          console.log('');
        } else {
          console.log(`${yellow}⚠ No agentPubkey found in config!${reset}`);
          console.log('');
          console.log(`${aqua}Run the wizard to auto-extract your pubkey:${reset}`);
          console.log(`  ${purple}sap-mcp-config wizard${reset}`);
          console.log('');
          console.log(`${aqua}Or manually set walletPath:${reset}`);
          console.log(`  ${purple}sap-mcp-config set walletPath ~/.config/mcp-sap/keypairs/your-wallet.json${reset}`);
          console.log('');
        }
        
        console.log(`${aqua}Config Location:${reset}`);
        console.log(`  ${purple}${configPath}${reset}`);
        console.log('');
        break;
      }

      case 'info': {
        const { config, profileName, configPath } = loadActiveConfigForDisplay();
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║           SAP MCP Configuration Info                     ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');
        
        console.log('Agent Identity:');
        console.log(`  Profile: ${profileName}`);
        console.log(`  Pubkey: ${config.agentPubkey || 'Not set (run wizard to extract)'}`);
        console.log(`  Wallet: ${config.walletPath || 'Not set'}`);
        console.log('');
        
        console.log('Server Configuration:');
        console.log(`  Mode: ${config.mode}`);
        console.log(`  RPC: ${config.rpcUrl}`);
        console.log(`  Program ID: ${config.programId}`);
        console.log('');
        
        console.log('Security Limits:');
        console.log(`  Max TX Value: ${config.maxTxValueSol} SOL`);
        console.log(`  Daily Limit: ${config.dailyLimitSol} SOL`);
        console.log(`  Approval Above: ${config.requireApprovalAboveSol} SOL`);
        console.log('');
        
        console.log('HTTP Transport:');
        console.log(`  Enabled: ${config.enableHttp ? 'Yes' : 'No'}`);
        if (config.enableHttp) {
          console.log(`  Port: ${config.httpPort}`);
          console.log(`  Host: ${config.httpHost}`);
          if (config.httpCorsOrigins) {
            console.log(`  CORS: ${config.httpCorsOrigins.join(', ')}`);
          }
        }
        console.log('');
        
        console.log('Bento Integration:');
        console.log(`  Enabled: ${config.bento?.enabled ? 'Yes' : 'No'}`);
        if (config.bento?.enabled) {
          console.log(`  Agent ID: ${config.bento.agentId || 'Not set'}`);
        }
        console.log('');
        
        console.log('Policy Engine:');
        console.log(`  Mode: ${config.policy?.mode || 'local-only'}`);
        console.log(`  Fail Open: ${config.policy?.failOpen ? 'Yes' : 'No'}`);
        console.log('');
        
        console.log('Files:');
        console.log(`  Config: ${configPath}`);
        console.log(`  Keypairs: ${getPreferredConfigDir()}/keypairs/`);
        console.log(`  Logs: ${getPreferredConfigDir()}/logs/`);
        console.log('');
        break;
      }

      case 'wallet': {
        const { config } = loadActiveConfigForDisplay();
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║           SAP MCP Wallet Information                     ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');
        
        if (!config.walletPath) {
          console.log('⚠ No wallet configured!');
          console.log('');
          console.log('Run wizard to create or select a wallet:');
          console.log('  npx sap-mcp-config wizard');
          console.log('');
          break;
        }
        
        console.log(`Wallet Path: ${config.walletPath}`);
        console.log('');
        
        if (existsSync(config.walletPath)) {
          console.log('✓ Wallet file exists');
          
          try {
            const keypairData = JSON.parse(readFileSync(config.walletPath, 'utf-8'));
            console.log(`  Format: ${Array.isArray(keypairData) ? 'Secret key array (64 bytes)' : 'Unknown'}`);
            console.log(`  Size: ${keypairData.length} bytes`);
          } catch {
            console.log('  ⚠ Could not read wallet');
          }
        } else {
          console.log('✗ Wallet file NOT found');
          console.log('');
          console.log('Create wallet with wizard:');
          console.log('  npx sap-mcp-config wizard');
        }
        
        console.log('');
        console.log('Keypairs Directory:');
        console.log(`  ${getPreferredConfigDir()}/keypairs/`);
        console.log('');
        
        console.log('Agent Pubkey:');
        if (config.agentPubkey) {
          console.log(`  ${config.agentPubkey}`);
        } else {
          console.log('  Not extracted (run wizard to auto-extract)');
        }
        console.log('');
        break;
      }

      case 'set': {
        if (args.length < 3) {
          printCliError('Missing field or value');
          console.log('Usage: sap-mcp-config set <field> <value>');
          process.exit(1);
        }
        const field = args[1];
        const value = args[2];
        
        // Parse value type
        let parsedValue: unknown = value;
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (/^\d+$/.test(value)) parsedValue = parseInt(value, 10);
        
        const result = await configManager.update({ [field]: parsedValue }, process.env.USER || 'user');

        printCliHeader('Configuration Update', 'Secure config change workflow');
        printCliSection('Requested Change');
        printKeyValue('Field', field, 'yellow');
        printKeyValue('Value', formatDisplayValue(field, parsedValue), 'green');
        console.log('');

        if (result.applied.length > 0) {
          printCliSection('Applied Immediately');
          result.applied.forEach((appliedField) => printSuccess(appliedField));
          console.log('');
        }
        
        if (result.pendingChanges.length > 0) {
          printCliSection('Pending Approval');
          result.pendingChanges.forEach((pendingChange: PendingChange) => {
            printPendingChange(pendingChange);
          });
          console.log(`${colorize('Next:', 'aqua')} sap-mcp-config approve <id>`);
        }

        if (result.applied.length === 0 && result.pendingChanges.length === 0) {
          printWarning('No changes were applied or queued.');
        }
        break;
      }

      case 'pending': {
        const pending = configManager.getPendingChanges();
        printCliHeader('Pending Changes', 'Approval queue');
        if (pending.length === 0) {
          printSuccess('No pending changes');
          console.log('');
        } else {
          printCliSection(`${pending.length} change${pending.length === 1 ? '' : 's'} awaiting approval`);
          pending.forEach((change: PendingChange) => {
            printPendingChange(change);
          });
          console.log(`${colorize('Approve:', 'aqua')} sap-mcp-config approve <id>`);
          console.log(`${colorize('Deny:', 'aqua')} sap-mcp-config deny <id>`);
          console.log('');
        }
        break;
      }

      case 'approve': {
        if (args.length < 2) {
          printCliError('Missing change ID');
          console.log('Usage: sap-mcp-config approve <id>');
          process.exit(1);
        }
        const changeId = args[1];
        printCliHeader('Approve Change', 'Security approval workflow');
        printKeyValue('Change ID', changeId, 'purple');
        console.log('');
        const success = configManager.approve(changeId, process.env.USER || 'user');
        if (success) {
          printSuccess('Change approved and applied');
          console.log('');
        } else {
          printCliError('Failed to approve change (not found or expired)');
          process.exit(1);
        }
        break;
      }

      case 'deny': {
        if (args.length < 2) {
          printCliError('Missing change ID');
          console.log('Usage: sap-mcp-config deny <id>');
          process.exit(1);
        }
        const changeId = args[1];
        printCliHeader('Deny Change', 'Security approval workflow');
        printKeyValue('Change ID', changeId, 'purple');
        console.log('');
        const success = configManager.deny(changeId, process.env.USER || 'user');
        if (success) {
          printSuccess('Change denied');
          console.log('');
        } else {
          printCliError('Failed to deny change (not found)');
          process.exit(1);
        }
        break;
      }

      case 'audit': {
        const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : 20;
        const audit = configManager.getAuditLog(limit);

        printCliHeader('Audit Log', 'Configuration security history');
        printKeyValue('Limit', limit, 'yellow');
        console.log('');

        if (audit.length === 0) {
          printWarning('No audit entries');
          console.log('');
        } else {
          printCliSection(`${audit.length} entr${audit.length === 1 ? 'y' : 'ies'}`);
          audit.forEach((entry: AuditEntry) => {
            printAuditEntry(entry);
          });
        }
        break;
      }

      case 'hash': {
        const hash = configManager.getConfigHash();
        console.log('Current Configuration Hash:');
        console.log(hash);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Export for use in main CLI
/**
 * Executes the run config cli operation.
 */
export async function runConfigCLI() {
  await main();
}

main();
