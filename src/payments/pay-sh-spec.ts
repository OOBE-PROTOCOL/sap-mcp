#!/usr/bin/env node
/**
 * @name PayShProviderSpec
 * @description Generates a pay.sh provider YAML for hosted SAP MCP monetization.
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import type { SapMcpConfig } from '../config/env.js';
import { loadConfig } from '../config/env.js';
import { initLogger, logger } from '../core/logger.js';

const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const SOLANA_TESTNET_CAIP2 = 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z';

/**
 * @name PayShSpecOptions
 * @description Options used to generate a pay.sh provider YAML for the hosted MCP endpoint.
 */
export interface PayShSpecOptions {
  name: string;
  subdomain: string;
  title: string;
  description: string;
  version: string;
  upstreamUrl: string;
  operatorNetwork: 'mainnet' | 'devnet' | 'localnet';
  feePayer: boolean;
  recipient?: string;
  rpcUrl?: string;
  signerPath?: string;
}

/**
 * @name DEFAULT_PAY_SH_SPEC_OPTIONS
 * @description Production defaults for OOBE Protocol's hosted SAP MCP pay.sh provider spec.
 */
export const DEFAULT_PAY_SH_SPEC_OPTIONS: PayShSpecOptions = {
  name: 'oobe-sap-mcp',
  subdomain: 'oobe-sap-mcp',
  title: 'OOBE SAP MCP Server',
  description: 'Paid hosted MCP access for Synapse Agent Protocol tools, discovery, SNS, and Solana agent workflows.',
  version: 'v1',
  upstreamUrl: 'http://127.0.0.1:8787',
  operatorNetwork: 'devnet',
  feePayer: true,
};

/**
 * @name generatePayShProviderYaml
 * @description Builds a pay.sh provider YAML that proxies paid MCP requests to the SAP MCP HTTP server.
 */
export function generatePayShProviderYaml(
  config: SapMcpConfig,
  options: Partial<PayShSpecOptions> = {},
): string {
  const resolved = resolvePayShOptions(config, options);
  const readPremiumUsd = formatYamlNumber(config.monetization.prices.readPremiumUsd);
  const builderUsd = formatYamlNumber(config.monetization.prices.builderUsd);
  const maxUsd = formatYamlNumber(config.monetization.prices.maxUsd);
  const minUsd = formatYamlNumber(config.monetization.prices.minUsd);
  const yaml = [
    `name: ${quoteYaml(resolved.name)}`,
    `subdomain: ${quoteYaml(resolved.subdomain)}`,
    `title: ${quoteYaml(resolved.title)}`,
    `description: ${quoteYaml(resolved.description)}`,
    'category: devtools',
    `version: ${quoteYaml(resolved.version)}`,
    '',
    'routing:',
    '  type: proxy',
    `  url: ${quoteYaml(withTrailingSlash(resolved.upstreamUrl))}`,
    '',
    'operator:',
    "  currencies:",
    "    usd: ['USDC']",
    `  network: ${resolved.operatorNetwork}`,
    `  fee_payer: ${String(resolved.feePayer)}`,
    ...(resolved.recipient ? [`  recipient: ${quoteYaml(resolved.recipient)}`] : []),
    ...(resolved.rpcUrl ? [`  rpc_url: ${quoteYaml(resolved.rpcUrl)}`] : []),
    ...(resolved.signerPath ? [`  signer: { type: file, path: ${quoteYaml(resolved.signerPath)} }`] : []),
    '',
    'endpoints:',
    '  - method: GET',
    "    path: 'health'",
    "    description: 'Health check forwarded to the hosted SAP MCP server.'",
    '',
    '  - method: POST',
    "    path: 'mcp'",
    "    description: 'SAP MCP JSON-RPC endpoint. Server-side x402 pricing remains authoritative per tool call.'",
    '    metering:',
    '      dimensions:',
    '        - direction: usage',
    '          unit: requests',
    '          scale: 1',
    '          tiers:',
    `            - price_usd: ${readPremiumUsd}`,
    '',
    'notes: |',
    '  The pay.sh gateway protects the outer HTTP MCP endpoint and forwards verified calls to SAP MCP.',
    `  SAP MCP still performs native x402 per-tool pricing internally: free tools stay free, premium reads start at $${readPremiumUsd}, builders at $${builderUsd}, and value actions are capped between $${minUsd} and $${maxUsd}.`,
    '  Validate with: pay --sandbox server start sap-mcp-pay-sh.yml --bind 127.0.0.1:1402',
    '',
  ];

  return `${yaml.join('\n')}`;
}

/**
 * @name resolvePayShOptions
 * @description Resolves pay.sh YAML options from explicit overrides and the SAP MCP runtime config.
 */
export function resolvePayShOptions(
  config: SapMcpConfig,
  options: Partial<PayShSpecOptions> = {},
): PayShSpecOptions {
  return {
    ...DEFAULT_PAY_SH_SPEC_OPTIONS,
    operatorNetwork: resolvePayShNetwork(config),
    recipient: config.monetization.payTo,
    rpcUrl: config.rpcUrl,
    ...options,
  };
}

/**
 * @name resolvePayShNetwork
 * @description Maps SAP MCP RPC/network config to pay.sh operator network aliases.
 */
export function resolvePayShNetwork(config: SapMcpConfig): PayShSpecOptions['operatorNetwork'] {
  const network = config.monetization.network ?? config.rpcUrl;
  if (network === SOLANA_MAINNET_CAIP2 || network.includes('mainnet')) {
    return 'mainnet';
  }
  if (
    network === SOLANA_DEVNET_CAIP2
    || network === SOLANA_TESTNET_CAIP2
    || network.includes('devnet')
    || network.includes('testnet')
  ) {
    return 'devnet';
  }
  if (network.includes('local')) {
    return 'localnet';
  }
  return 'devnet';
}

function quoteYaml(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function formatYamlNumber(value: number): string {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function parseCliOptions(argv: string[]): { configPath?: string; outputPath?: string; options: Partial<PayShSpecOptions> } {
  const parsed: { configPath?: string; outputPath?: string; options: Partial<PayShSpecOptions> } = { options: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--config' && value) {
      parsed.configPath = value;
      index += 1;
    } else if (arg === '--out' && value) {
      parsed.outputPath = value;
      index += 1;
    } else if (arg === '--upstream-url' && value) {
      parsed.options.upstreamUrl = value;
      index += 1;
    } else if (arg === '--network' && isPayShNetwork(value)) {
      parsed.options.operatorNetwork = value;
      index += 1;
    } else if (arg === '--recipient' && value) {
      parsed.options.recipient = value;
      index += 1;
    } else if (arg === '--rpc-url' && value) {
      parsed.options.rpcUrl = value;
      index += 1;
    } else if (arg === '--signer-path' && value) {
      parsed.options.signerPath = value;
      index += 1;
    } else if (arg === '--title' && value) {
      parsed.options.title = value;
      index += 1;
    } else if (arg === '--subdomain' && value) {
      parsed.options.subdomain = value;
      parsed.options.name = value;
      index += 1;
    } else if (arg === '--no-fee-payer') {
      parsed.options.feePayer = false;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  return parsed;
}

function isPayShNetwork(value: string | undefined): value is PayShSpecOptions['operatorNetwork'] {
  return value === 'mainnet' || value === 'devnet' || value === 'localnet';
}

function printUsage(): void {
  process.stdout.write([
    'sap-mcp-pay-sh-spec',
    '',
    'Generate a pay.sh provider YAML for hosted SAP MCP monetization.',
    '',
    'Usage:',
    '  npx sap-mcp-pay-sh-spec --out sap-mcp-pay-sh.yml --upstream-url https://sap.mcp.oobeprotocol.ai',
    '',
    'Options:',
    '  --config <path>        SAP MCP profile/config JSON path',
    '  --out <path>           Write YAML to file instead of stdout',
    '  --upstream-url <url>   Hosted SAP MCP base URL',
    '  --network <name>       mainnet, devnet, or localnet',
    '  --recipient <pubkey>   Revenue wallet override',
    '  --rpc-url <url>        pay.sh operator RPC URL',
    '  --signer-path <path>   pay.sh operator signer file',
    '  --subdomain <slug>     pay.sh provider slug',
    '  --title <text>         pay.sh provider title',
    '  --no-fee-payer         Disable operator fee payer sponsorship',
    '',
  ].join('\n'));
}

if (process.argv[1]?.endsWith('pay-sh-spec.js') || process.argv[1]?.endsWith('pay-sh-spec.ts')) {
  initLogger({
    level: process.env.SAP_MCP_LOG_LEVEL === 'debug' ? 'debug' : 'info',
    format: process.env.SAP_MCP_LOG_FORMAT === 'json' ? 'json' : 'pretty',
  });

  const { configPath, outputPath, options } = parseCliOptions(process.argv.slice(2));
  const yaml = generatePayShProviderYaml(loadConfig(configPath), options);

  if (outputPath) {
    const target = resolve(outputPath);
    writeFileSync(target, yaml, 'utf-8');
    logger.info('pay.sh provider YAML generated', { path: target });
  } else {
    process.stdout.write(yaml);
  }
}
