#!/usr/bin/env node

/**
 * SAP MCP Server - CLI Entry Point
 * 
 * Production-grade MCP server with support for:
 * - stdio transport (default, for local MCP clients)
 * - HTTP transport (remote, for distributed deployments)
 * - TUI config wizard (multi-agent configuration management)
 * 
 * Usage:
 *   npx sap-mcp-server                    # Start with stdio (default)
 *   npx sap-mcp-server start              # Start with stdio
 *   npx sap-mcp-server start --http       # Start with HTTP transport (remote)
 *   npx sap-mcp-server http               # Start with HTTP transport
 *   npx sap-mcp-server wizard             # Launch TUI config wizard
 *   npx sap-mcp-server config             # CLI config management
 * 
 * Environment Variables:
 *   SAP_MCP_MODE - 'readonly' | 'local-keypair' | 'local-dev-keypair' | 'delegated' | 'external'
 *   SAP_MCP_PROFILE - SAP MCP profile name to load from ~/.config/mcp-sap
 *   SAP_MCP_CONFIG_PATH - Explicit config JSON path to load
 *   SAP_MCP_RPC_URL - Optional Solana RPC endpoint override
 *   SAP_WALLET_PATH - Optional wallet keypair path override
 *   SAP_MCP_LOG_LEVEL - 'debug' | 'info' | 'warn' | 'error'
 *   SAP_MCP_PORT - HTTP port (default: 3000, for --http mode)
 *   SAP_MCP_HOST - HTTP host (default: 0.0.0.0, for --http mode)
 */

import { loadConfig, ensureDirectories } from './config/env.js';
import { createSapMcpServer } from './server/create-server.js';
import { startStdioTransport } from './transports/stdio.js';
import { startHttpTransport } from './transports/http.js';
import { logger, initLogger } from './core/logger.js';
import { MCP_SERVER_VERSION } from './core/constants.js';

// Parse CLI arguments
const args = process.argv.slice(2);
const command = args[0] || 'start';
const flags = args.slice(1);

const isHttpMode = flags.includes('--http') || flags.includes('-H');
const helpFlags = ['--help', '-h', 'help'];

/**
 * @name resolveHttpApiKey
 * @description Resolves the HTTP bearer API key from documented environment variables.
 */
function resolveHttpApiKey(): string | undefined {
  if (process.env.SAP_HTTP_API_KEY) {
    return process.env.SAP_HTTP_API_KEY;
  }

  if (process.env.SAP_MCP_AUTH_SECRET && process.env.SAP_MCP_AUTH_TYPE !== 'jwt') {
    return process.env.SAP_MCP_AUTH_SECRET;
  }

  const firstApiKey = process.env.SAP_MCP_API_KEYS?.split(',')[0]?.split('=')[0]?.trim();
  return firstApiKey || undefined;
}

/**
 * Internal helper for the print help operation.
 */
function printHelp() {
  console.error(`
╔══════════════════════════════════════════════════════════╗
║             SAP MCP Server v${MCP_SERVER_VERSION}                          ║
║             Enterprise Edition                           ║
╚══════════════════════════════════════════════════════════╝

Usage:
  sap-mcp-server [command] [options]

Commands:
  start       Start MCP server with stdio transport (default)
  http        Start MCP server with HTTP transport (for remote deployments)
  wizard      Launch TUI configuration wizard for multi-agent setup
  config      CLI configuration management

Options:
  --http, -H  Use HTTP transport instead of stdio (for start command)
  --help, -h  Show this help message

Environment Variables:
  SAP_MCP_MODE          Server mode (readonly|local-keypair|local-dev-keypair|delegated|external)
  SAP_MCP_PROFILE       Profile name in ~/.config/mcp-sap (recommended for MCP clients)
  SAP_MCP_CONFIG_PATH   Explicit config JSON path
  SAP_MCP_RPC_URL       Optional Solana RPC override
  SAP_WALLET_PATH       Optional wallet keypair path override
  SAP_MCP_LOG_LEVEL     Log level (debug|info|warn|error)
  SAP_MCP_PORT          HTTP port (default: 3000)
  SAP_MCP_HOST          HTTP host (default: 0.0.0.0)
  SAP_SIGNING_PROXY_URL External signer URL (for delegated mode)

Examples:
  # Start with stdio transport (Claude Desktop, Cursor, etc.)
  sap-mcp-server

  # Start Hermes/Codex/Claude against a named SAP MCP profile
  SAP_MCP_PROFILE=gianni-market-nft-agent sap-mcp-server

  # Start with HTTP transport
  sap-mcp-server start --http
  sap-mcp-server http

  # Launch config wizard for multi-agent setup
  sap-mcp-server wizard

  # Start authenticated Streamable HTTP remote server
  sap-mcp-server remote

  # Configure via CLI
  sap-mcp-server config set mode local-dev-keypair
  sap-mcp-server config set rpc https://api.devnet.solana.com
`);
}

/**
 * Internal helper for the run wizard operation.
 */
async function runWizard() {
  console.error('Launching SAP MCP Configuration Wizard...\n');
  console.error('Starting interactive wizard...\n');
  
  // Run wizard as subprocess
  const { spawn } = await import('child_process');
  const wizard = spawn('node', ['dist/tui/config-wizard.js'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  
  return new Promise<void>((resolve, reject) => {
    wizard.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Wizard exited with code ${code}`));
      }
    });
    wizard.on('error', reject);
  });
}

/**
 * Internal helper for the run remote server operation.
 * DEPRECATED: Use 'http' command instead for Streamable HTTP transport.
 */
async function runRemoteServer() {
  console.error('WARNING: The "remote" command is deprecated.\n');
  console.error('Use "sap-mcp-server http" or "sap-mcp-server start --http" instead.\n');
  console.error('Redirecting to HTTP transport...\n');
  
  await runHttpServer();
}

/**
 * Internal helper for the run HTTP server operation.
 */
async function runHttpServer() {
  console.error('Starting SAP MCP HTTP Server...\n');
  console.error('Endpoint: http://localhost:3000/mcp\n');
  console.error('Press Ctrl+C to stop\n');

  const config = await loadConfig();
  await ensureDirectories();
  initLogger({
    level: config.logLevel,
    format: config.logFormat,
    file: config.logFile,
  });

  const server = await createSapMcpServer(config);
  await startHttpTransport(server, {
    port: parseInt(process.env.SAP_MCP_PORT || '3000', 10),
    host: process.env.SAP_MCP_HOST || '0.0.0.0',
    apiKey: resolveHttpApiKey(),
    corsOrigins: config.httpCorsOrigins,
    rateLimitPerMinute: config.enableRateLimit ? config.rateLimitPerMinute : 0,
    appConfig: config,
  });
}

/**
 * Internal helper for the run config cli operation.
 */
async function runConfigCLI() {
  console.error('SAP MCP Configuration CLI\n');
  
  // Run config CLI as subprocess
  const { spawn } = await import('child_process');
  const config = spawn('node', ['dist/config-cli.js'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  
  return new Promise<void>((resolve, reject) => {
    config.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Config CLI exited with code ${code}`));
      }
    });
    config.on('error', reject);
  });
}

/**
 * Internal helper for the main operation.
 */
async function main() {
  // Handle help
  if (helpFlags.includes(command) || helpFlags.some(f => flags.includes(f))) {
    printHelp();
    process.exit(0);
  }

  // Handle wizard command
  if (command === 'wizard') {
    await runWizard();
    process.exit(0);
  }

  // Handle remote command (deprecated → redirects to HTTP)
  if (command === 'remote') {
    await runRemoteServer();
    return; // Don't exit - HTTP server runs indefinitely
  }

  // Handle config command
  if (command === 'config') {
    await runConfigCLI();
    process.exit(0);
  }

  // Handle start command (default, also covers 'http' via --http flag)
  if (command === 'start' || command === 'http') {
    // Load and validate configuration
    const config = await loadConfig();
    
    // Ensure directories exist
    ensureDirectories();
    
    // Initialize logger with config
    initLogger({
      level: config.logLevel,
      format: config.logFormat,
      file: config.logFile,
    });
    
    // Startup banner
    logger.startup({
      version: MCP_SERVER_VERSION,
      mode: config.mode,
      rpcUrl: config.rpcUrl,
      programId: config.programId,
    });
    
    // Create server instance
    const server = await createSapMcpServer(config);
    
    // Determine transport
    const useHttp = isHttpMode || command === 'http';
    
    if (useHttp) {
      // Start HTTP transport
      await startHttpTransport(server, {
        port: parseInt(process.env.SAP_MCP_PORT || '3000', 10),
        host: process.env.SAP_MCP_HOST || '0.0.0.0',
        apiKey: resolveHttpApiKey(),
        corsOrigins: config.httpCorsOrigins,
        rateLimitPerMinute: config.enableRateLimit ? config.rateLimitPerMinute : 0,
        appConfig: config,
      });

      logger.info('SAP MCP Server started with HTTP transport', {
        port: process.env.SAP_MCP_PORT || '3000',
      });
    } else {
      // Start stdio transport (default)
      await startStdioTransport(server);
      
      logger.info('SAP MCP Server started with stdio transport');
    }
    
    return; // Server runs indefinitely
  }

  // Unknown command
  console.error(`Unknown command: ${command}`);
  console.error('Run "sap-mcp-server --help" for usage information.');
  process.exit(1);
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
