/**
 * @name completions
 * @description MCP autocompletion support for tool arguments. Provides completion callbacks
 * for common SAP MCP tool parameters (domains, custody names, agent pubkeys, runtime IDs)
 * using the SDK's `completable()` API.
 *
 * @module tools/completions
 */

import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import { z } from 'zod';

/**
 * @name domainCompleter
 * @description Autocomplete .sol domain names. Returns common TLDs and suggestions
 * based on partial input.
 */
export function domainCompleter(value: string): string[] {
  const base = value.replace(/\.sol$/i, '').trim();
  if (!base) {
    return ['oobe.sol', 'sap.sol', 'synapse.sol', 'solana.sol'];
  }
  // Suggest the .sol suffix if not present
  if (!value.toLowerCase().endsWith('.sol')) {
    return [`${base}.sol`];
  }
  return [value];
}

/**
 * @name runtimeCompleter
 * @description Autocomplete MCP runtime IDs (codex, claude, hermes, openclaw).
 */
export function runtimeCompleter(value: string): string[] {
  const runtimes = ['codex', 'claude', 'hermes', 'openclaw'];
  if (!value) return runtimes;
  return runtimes.filter(r => r.startsWith(value.toLowerCase()));
}

/**
 * @name custodyCompleter
 * @description Autocomplete Adrena custody/ pool names from common Solana SPL tokens.
 */
export function custodyCompleter(value: string): string[] {
  const commonMints = [
    'SOL', 'USDC', 'USDT', 'JUP', 'WIF', 'BONK', 'PYTH', 'JTO', 'RAY', 'MNGO',
  ];
  if (!value) return commonMints;
  return commonMints.filter(c => c.toLowerCase().startsWith(value.toLowerCase()));
}

/**
 * @name profileCompleter
 * @description Autocomplete SAP MCP profile names. Profiles are alphanumeric with dashes.
 */
export function profileCompleter(value: string): string[] {
  if (!value) return ['default', 'mainnet', 'devnet', 'trading'];
  // Only suggest if it starts with valid profile chars
  if (/^[a-z0-9-]*$/.test(value)) {
    return [value];
  }
  return [];
}

/**
 * @name commitmentCompleter
 * @description Autocomplete Solana commitment levels.
 */
export function commitmentCompleter(value: string): string[] {
  const levels = ['confirmed', 'finalized', 'processed'];
  if (!value) return levels;
  return levels.filter(l => l.startsWith(value.toLowerCase()));
}

/**
 * @name completableDomain
 * @description A Zod string schema with domain autocompletion attached.
 */
export const completableDomain = completable(z.string(), domainCompleter);

/**
 * @name completableRuntime
 * @description A Zod string schema with runtime ID autocompletion attached.
 */
export const completableRuntime = completable(z.string(), runtimeCompleter);

/**
 * @name completableCustody
 * @description A Zod string schema with custody name autocompletion attached.
 */
export const completableCustody = completable(z.string(), custodyCompleter);

/**
 * @name completableProfile
 * @description A Zod string schema with profile name autocompletion attached.
 */
export const completableProfile = completable(z.string(), profileCompleter);

/**
 * @name completableCommitment
 * @description A Zod string schema with commitment level autocompletion attached.
 */
export const completableCommitment = completable(z.string(), commitmentCompleter);

/**
 * @name CompletionProvider
 * @description Central registry for MCP completion callbacks. Maps tool names to
 * parameter completion functions so the MCP adapter can wire them at registration time.
 */
export class CompletionProvider {
  private static readonly registry = new Map<string, Map<string, (value: string, context?: { arguments?: Record<string, string> }) => string[] | Promise<string[]>>>();

  /**
   * @name register
   * @description Register a completion callback for a specific tool parameter.
   */
  static register(toolName: string, paramName: string, callback: (value: string, context?: { arguments?: Record<string, string> }) => string[] | Promise<string[]>): void {
    let params = this.registry.get(toolName);
    if (!params) {
      params = new Map();
      this.registry.set(toolName, params);
    }
    params.set(paramName, callback);
  }

  /**
   * @name getCompletions
   * @description Get completion suggestions for a tool parameter given partial input.
   */
  static getCompletions(toolName: string, paramName: string, value: string, context?: { arguments?: Record<string, string> }): string[] | Promise<string[]> {
    const params = this.registry.get(toolName);
    if (!params) return [];
    const callback = params.get(paramName);
    if (!callback) return [];
    return callback(value, context);
  }

  /**
   * @name hasCompletions
   * @description Check if a tool has any registered completion callbacks.
   */
  static hasCompletions(toolName: string): boolean {
    return this.registry.has(toolName);
  }

  /**
   * @name registerDefaults
   * @description Register default completions for common SAP MCP tool parameters.
   * Call this once during server startup before tool registration.
   */
  static registerDefaults(): void {
    // SNS domain tools
    const snsDomainTools = [
      'sap_sns_check_domain',
      'sap_sns_resolve_domain',
      'sap_sns_validate_records',
      'sap_sns_get_domain_pda',
      'sap_sns_get_record_pda',
      'sap_sns_get_domain_records',
      'sap_sns_check_ownership',
    ];
    for (const tool of snsDomainTools) {
      CompletionProvider.register(tool, 'domain', domainCompleter);
    }
    CompletionProvider.register('sap_sns_batch_check_domains', 'domains', domainCompleter);

    // Runtime/agent tools
    CompletionProvider.register('sap_agent_start', 'runtimeId', runtimeCompleter);
    CompletionProvider.register('sap_agent_runtime_status', 'runtimeId', runtimeCompleter);

    // Commitment level
    CompletionProvider.register('sap_decode_transaction', 'commitment', commitmentCompleter);
    CompletionProvider.register('sap_submit_signed_transaction', 'commitment', commitmentCompleter);
    CompletionProvider.register('sap_preview_transaction', 'commitment', commitmentCompleter);

    // Profile tools
    CompletionProvider.register('sap_profile_switch', 'profile', profileCompleter);
  }
}