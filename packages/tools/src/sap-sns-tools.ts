/**
 * SAP SNS MCP tools.
 *
 * Stage 1 (`.sns` namespace, post slot 452,825,395): all SNS reads route
 * through the SNS JS SDK v4 (`@bonfida/spl-name-service@4.x`) exposed by the
 * SAP SDK's `SnsModule` (`context.sapClient.sns`); the historical hand-rolled
 * SPL Name Service derivation/decoding helpers are gone.
 *
 * Write paths (registration, record management, primary domain) build
 * **unsigned instruction sets** — the caller signs and submits with its own
 * wallet; SAP MCP never custodies keys (hosted mode = signer none).
 *
 * Input rule: `.sns` full names or bare names are accepted; legacy `.sol`
 * inputs are rejected explicitly (legacy `.sol` resolution is paused at the
 * protocol level; SRS-backed `.sol` support arrives with SNS Stage 2).
 *
 * Tool groups (names and input shapes stable for sentinel verification):
 * - Registration: `sap_sns_register_agent_domain` (unsigned builder)
 * - Availability: `sap_sns_check_domain`, `sap_sns_batch_check_domains`
 * - Resolution: `sap_sns_resolve_domain`, `sap_sns_resolve_wallet`
 * - Records: `sap_sns_get_domain_records`, `sap_sns_get_record`
 * - Ownership: `sap_sns_check_ownership`
 * - PDA: `sap_sns_get_domain_pda`, `sap_sns_get_record_pda`
 * - Validation: `sap_sns_validate_records`
 * - Record management: `sap_sns_build_manage_record_transaction` (unsigned builder)
 * - Primary domain: `sap_sns_build_set_primary_domain_transaction` (unsigned builder)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey, type Signer, type TransactionInstruction } from '@solana/web3.js';
import type { SapMcpContext } from '../../core/src/types.js';
import { logger } from '../../core/src/logger.js';
import {
  createToolFamilyPipelineResult,
  registerToolFamilyPipelineTool,
  type ToolFamilyPipelineResult,
} from './tool-family-pipeline.js';
import { displayDomain, toFullSnsName } from '@oobe-protocol-labs/synapse-sap-sdk/utils';
import { parseSnsRecordType, SnsModule } from '@oobe-protocol-labs/synapse-sap-sdk/modules/sns';

type JsonRecord = Record<string, unknown>;
type SnsToolResult = ToolFamilyPipelineResult;
type SnsToolHandler = (input: JsonRecord) => Promise<unknown>;

interface SnsToolRegistration {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: SnsToolHandler;
}

const SIGNER_NONE_NOTICE =
  'Sign and submit these unsigned instructions with your own wallet; SAP MCP holds no keys.';

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof PublicKey) {
    return value.toBase58();
  }

  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }

  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  return value;
}

function ok(payload: unknown): SnsToolResult {
  const objectPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as JsonRecord
    : { result: payload };

  return createToolFamilyPipelineResult(JSON.parse(JSON.stringify({ success: true, ...objectPayload }, jsonReplacer)) as JsonRecord);
}

function errorResponse(error: unknown): SnsToolResult {
  return createToolFamilyPipelineResult({
    success: false,
    error: error instanceof Error ? error.message : 'Unknown SNS error',
  }, undefined, { isError: true });
}

// ============================================================================
// Input parsing helpers
// ============================================================================

function requiredString(input: JsonRecord, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function requiredPublicKey(input: JsonRecord, field: string): PublicKey {
  return new PublicKey(requiredString(input, field));
}

function optionalStringArray(input: JsonRecord, field: string): string[] | undefined {
  const value = input[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value;
}

function optionalNumber(input: JsonRecord, field: string): number | undefined {
  const value = input[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

function optionalBoolean(input: JsonRecord, field: string): boolean | undefined {
  const value = input[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function optionalRecord(input: JsonRecord, field: string): Record<string, string> | undefined {
  const value = input[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== 'string') {
      throw new Error(`${field}.${key} must be a string`);
    }
    // Normalize record labels to the SNS SDK v4 wire values (e.g. "Pic" → "pic").
    const wireValue = String(parseSnsRecordType(key));
    out[wireValue] = raw;
  }
  return out;
}

// ============================================================================
// Module access and unsigned serialization
// ============================================================================

/**
 * Returns the SDK-backed `SnsModule` bound to the server connection and the
 * SAP program id. Reads and unsigned builders share the same instance.
 */
function snsModule(context: SapMcpContext): SnsModule {
  return context.sapClient.sns;
}

/**
 * PublicKey-only signer for the SDK builders: hosted mode has no keypair
 * custody, so registration builders only need the fee payer's public key.
 * `secretKey` stays empty — nothing under SAP MCP ever signs.
 */
function publicKeyOnlySigner(wallet: PublicKey): Signer {
  return {
    publicKey: wallet,
    secretKey: Buffer.alloc(0),
  };
}

function serializeInstruction(instruction: TransactionInstruction): JsonRecord {
  return {
    programId: instruction.programId.toBase58(),
    keys: instruction.keys.map((key) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data).toString('base64'),
  };
}

function unsignedInstructionsPayload(
  domain: string,
  instructions: TransactionInstruction[],
): JsonRecord {
  return {
    status: 'unsigned_instructions_ready',
    domain,
    instructions: instructions.map(serializeInstruction),
    message: SIGNER_NONE_NOTICE,
  };
}

// ============================================================================
// Tool registration helper
// ============================================================================

function registerSnsPipelineTool(server: Server, context: SapMcpContext, tool: SnsToolRegistration): void {
  registerToolFamilyPipelineTool<JsonRecord, JsonRecord>(
    server,
    context,
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (input) => {
      try {
        const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
        return ok(await tool.handler(args));
      } catch (error) {
        logger.error(`SAP SNS tool failed: ${tool.name}`, { error });
        return errorResponse(error);
      }
    },
  );
}

// ============================================================================
// Tool definitions
// ============================================================================

function createSnsTools(context: SapMcpContext): SnsToolRegistration[] {
  return [
    // --- SNS reads: availability checks ---
    {
      name: 'sap_sns_check_domain',
      title: 'Check SNS Domain',
      description: 'Check whether a .sns domain is available for registration. Derives its Solana Name Service PDA and checks whether the account exists on-chain. Accepts a full .sns name or a bare name; legacy .sol inputs are rejected (legacy .sol resolution is paused since slot 452,825,395).',
      inputSchema: { domain: { type: 'string', description: 'The .sns domain name to check for availability (with or without .sns suffix)' } },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        return { domain: displayDomain(domain), available: await module.checkAvailability(domain) };
      },
    },
    {
      name: 'sap_sns_batch_check_domains',
      title: 'Batch Check SNS Domains',
      description: 'Check availability for multiple .sns domains (up to 25): each SNS PDA is derived and probed on-chain. Read-only and safe for hosted mode. Accepts full .sns names or bare names.',
      inputSchema: { domains: { type: 'array', items: { type: 'string', description: 'A .sns domain name to check (with or without .sns suffix)' }, description: 'Array of .sns domain names to batch-check for availability (1-25 domains)' } },
      handler: async (input) => {
        const module = snsModule(context);
        const domains = optionalStringArray(input, 'domains');
        if (!domains || domains.length === 0) {
          throw new Error('domains must contain at least one domain');
        }
        if (domains.length > 25) {
          throw new Error('domains supports at most 25 items per call');
        }
        const availability = await module.batchCheckAvailability(domains);
        return { availability: Object.fromEntries(availability.entries()) };
      },
    },

    // --- SNS reads: domain resolution ---
    {
      name: 'sap_sns_resolve_domain',
      title: 'Resolve SAP SNS Domain',
      description: 'Resolve a .sns domain to its wallet/owner and configured SNS records, with the SAP-linked metadata parsed from the TXT payload when present. Agents should treat TXT/Pic/Url records as optional metadata and fall back to the wallet owner when no SOL record exists.',
      inputSchema: { domain: { type: 'string', description: 'The .sns domain name to resolve to SAP agent identity and SNS records' } },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        const resolution = await module.resolveAgentDomain(domain);
        return {
          resolution: resolution && {
            domain: resolution.domain,
            wallet: resolution.wallet.toBase58(),
            agentPda: resolution.agentPda.toBase58(),
            metadata: resolution.metadata,
            records: resolution.records,
          },
        };
      },
    },
    {
      name: 'sap_sns_validate_records',
      title: 'Validate SAP SNS Records',
      description: 'Validate SNS records for SAP agent compatibility (checks SOL, Pic, TXT records on-chain).',
      inputSchema: { domain: { type: 'string', description: 'The .sns domain whose SNS records should be validated for SAP agent compatibility' } },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        const validation = await module.validateAgentRecords(domain);
        return { domain: displayDomain(domain), ...validation };
      },
    },

    // --- SNS reads: PDA derivation ---
    {
      name: 'sap_sns_get_domain_pda',
      title: 'Get SNS Domain PDA',
      description: 'Derive the Solana Name Service domain PDA for a .sns domain. This helper is deterministic, read-only. Accepts a full .sns name or a bare name.',
      inputSchema: { domain: { type: 'string', description: 'The .sns domain name to derive the SNS domain PDA for' } },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        return { domainPda: module.getDomainPda(domain) };
      },
    },
    {
      name: 'sap_sns_get_record_pda',
      title: 'Get SNS Record PDA',
      description: 'Derive the Solana Name Service V1 record PDA for a .sns domain and record type such as SOL, TXT, pic, url, IPFS, ETH, BTC, etc. Deterministic and read-only.',
      inputSchema: { domain: { type: 'string', description: 'The .sns domain name to derive the record PDA for' }, recordType: { type: 'string', description: 'The SNS record type for the PDA derivation (e.g. SOL, txt, url, pic, IPFS, ETH, BTC, etc.)' } },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        const recordType = parseSnsRecordType(requiredString(input, 'recordType'));
        return { recordPda: module.getRecordPda(domain, recordType) };
      },
    },

    // --- SNS writes: unsigned builders (no key custody) ---
    {
      name: 'sap_sns_register_agent_domain',
      title: 'Register SAP Agent SNS Domain',
      description: "Build the unsigned instruction set to register a .sns domain for a SAP agent (registration, optional TXT/Url identity records, optional set-as-primary). Registration fee is paid in USDC from the agent wallet's associated token account. The caller signs and submits with its own wallet — SAP MCP holds no keys.",
      inputSchema: {
        domain: { type: 'string', description: 'The .sns domain name to register for the SAP agent (with or without .sns suffix)' },
        agentWallet: { type: 'string', description: 'The Solana public key (base58) of the SAP agent wallet that will own the domain and pay the fee' },
        pic: { type: 'string', description: 'Profile picture URL for the SNS pic record (required if not provided in records.Pic)' },
        records: { type: 'object', description: 'Optional map of SNS record key-value pairs to set during registration (e.g. { "url": "https://...", "twitter": "@handle" }). Note: SOL record is derived on-chain and skipped.' },
        sapData: { type: 'object', description: 'Optional structured SAP metadata to merge into the domain TXT record (capabilities, protocols, endpoints, etc.)' },
        capabilities: { type: 'array', items: { type: 'string', description: 'A SAP capability identifier (e.g. "jupiter:swap")' }, description: 'Optional list of SAP capability IDs to advertise in the domain TXT record' },
        protocols: { type: 'array', items: { type: 'string', description: 'A protocol identifier (e.g. "sap", "mcp")' }, description: 'Optional list of protocol IDs the agent supports' },
        setAsPrimary: { type: 'boolean', description: 'Whether to set this domain as the agent primary .sns domain' },
        durationYears: { type: 'number', description: 'Registration duration in years (default: 1)' },
        space: { type: 'number', description: 'Storage space in bytes for the domain name account (default: 600)' },
      },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        const agentWallet = requiredPublicKey(input, 'agentWallet');

        const records: Record<string, string> = { ...(optionalRecord(input, 'records') ?? {}) };
        const pic = typeof input.pic === 'string' ? input.pic : undefined;
        if (pic && !records.pic) {
          records.pic = pic;
        }

        const sapData: Record<string, unknown> = {
          ...(input.sapData && typeof input.sapData === 'object' ? input.sapData as Record<string, unknown> : {}),
        };
        const capabilities = optionalStringArray(input, 'capabilities');
        if (capabilities?.length) {
          sapData.capabilities = capabilities;
        }
        const protocols = optionalStringArray(input, 'protocols');
        if (protocols?.length) {
          sapData.protocols = protocols;
        }
        if (!records.txt && Object.keys(sapData).length > 0) {
          records.txt = JSON.stringify(sapData);
        }

        const fullName = toFullSnsName(domain);
        const built = await module.buildRegistrationInstructions({
          agentWallet,
          domainName: fullName,
          signer: publicKeyOnlySigner(agentWallet),
          space: optionalNumber(input, 'space'),
          setAsPrimary: optionalBoolean(input, 'setAsPrimary'),
          records,
        });

        return {
          ...unsignedInstructionsPayload(built.domain, built.instructions),
          domainPda: built.domainPda,
          buyerTokenAccount: built.buyerTokenAccount,
          recordTypes: built.records,
          note: 'durationYears is accepted but registration duration is governed by the protocol pricing; space defaults to 600 bytes.',
        };
      },
    },

    // --- SNS reads: record fetching ---
    {
      name: 'sap_sns_get_domain_records',
      title: 'Get SNS Domain Records',
      description: 'Fetch known SNS records for a .sns domain. Returns a key-value map for the records that exist (SOL, TXT, twitter, github, discord, telegram, email, url, pic).',
      inputSchema: { domain: { type: 'string', description: 'The .sns domain name to fetch all configured SNS records for' } },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        const fullName = displayDomain(domain);
        const recordLabels = ['SOL', 'TXT', 'Twitter', 'Github', 'Discord', 'Telegram', 'Email', 'Url', 'Pic'];
        const entries = await Promise.all(recordLabels.map(async (label) => {
          try {
            const value = await module.getRecordValue(fullName, label);
            return [label, value] as const;
          } catch {
            return [label, null] as const;
          }
        }));
        const records: Record<string, string> = {};
        for (const [label, value] of entries) {
          if (value !== null) {
            records[label] = value;
          }
        }
        return { domain: fullName, records };
      },
    },
    {
      name: 'sap_sns_get_record',
      title: 'Get SNS Record',
      description: 'Fetch a single SNS record value for a .sns domain. Returns null if the record is absent. Accepts record labels case-insensitively (SOL, txt, url, pic, IPFS, ETH, BTC, etc.).',
      inputSchema: { domain: { type: 'string', description: 'The .sns domain name to fetch a record from' }, recordType: { type: 'string', description: 'The SNS record type to fetch (e.g. SOL, txt, url, pic, IPFS, ETH, BTC, etc.)' } },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        const recordType = requiredString(input, 'recordType');
        const record = parseSnsRecordType(recordType);
        return {
          recordType: record,
          record: await module.getRecordValue(domain, recordType),
        };
      },
    },

    // --- SNS reads: domain queries ---
    {
      name: 'sap_sns_resolve_wallet',
      title: 'Resolve SNS Wallet',
      description: 'Resolve a .sns domain to a wallet public key. The tool prefers the SOL record when available and falls back to the registry owner derived from the name service account header.',
      inputSchema: { domain: { type: 'string', description: 'The .sns domain name to resolve to its owner wallet public key' } },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        const full = displayDomain(domain);
        let wallet: string | null = null;
        try {
          wallet = await module.getRecordValue(full, 'sol');
        } catch {
          // No readable SOL record: fall through to the registry owner.
        }
        if (!wallet) {
          const owner = await module.resolve(full);
          wallet = owner ? owner.toBase58() : null;
        }
        return { domain: full, wallet };
      },
    },
    {
      name: 'sap_sns_check_ownership',
      title: 'Check SNS Ownership',
      description: 'Check whether a wallet matches the resolved SNS wallet for a .sns domain. Uses the SOL record when present and the registry owner as fallback.',
      inputSchema: {
        domain: { type: 'string', description: 'The .sns domain name to check ownership of' },
        owner: { type: 'string', description: 'Canonical field: Solana public key (base58) of the wallet to verify as the domain owner' },
        wallet: { type: 'string', description: 'Alias for owner, accepted for agent ergonomics when the user says wallet.' },
      },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        const full = displayDomain(domain);
        const claimed = input.owner === undefined
          ? requiredPublicKey(input, 'wallet')
          : requiredPublicKey(input, 'owner');
        let actual: string | null = null;
        try {
          actual = await module.getRecordValue(full, 'sol');
        } catch {
          actual = null;
        }
        if (!actual) {
          const owner = await module.resolve(full);
          actual = owner ? owner.toBase58() : null;
        }
        return {
          domain: full,
          owner: actual,
          ownsDomain: actual === claimed.toBase58(),
        };
      },
    },

    // --- SNS writes: unsigned builders (no key custody) ---
    {
      name: 'sap_sns_build_manage_record_transaction',
      title: 'Build SNS Manage Record Transaction',
      description: 'Build the unsigned instruction(s) to create, update, or delete an SNS record on a .sns domain (create when absent, update when present, delete when value is null). The caller signs and submits with its own wallet — SAP MCP holds no keys.',
      inputSchema: {
        domain: { type: 'string', description: 'The .sns domain whose record should be created, updated, or deleted' },
        recordType: { type: 'string', description: 'The SNS record type to manage (e.g. txt, url, pic, IPFS, ETH, BTC, etc.)' },
        value: { type: ['string', 'null'], description: 'The new record value as a string, or null to delete the record' },
        owner: { type: 'string', description: 'The Solana public key (base58) of the domain owner authorizing the record change' },
      },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        const recordType = requiredString(input, 'recordType');
        const owner = requiredPublicKey(input, 'owner');
        const value = input.value === undefined || input.value === null
          ? null
          : (typeof input.value === 'string' ? input.value : (() => { throw new Error('value must be a string or null'); })());
        const instructions = await module.buildManageRecordInstructions(owner, domain, recordType, value);
        return unsignedInstructionsPayload(displayDomain(domain), instructions);
      },
    },
    {
      name: 'sap_sns_build_set_primary_domain_transaction',
      title: 'Build SNS Set Primary Domain Transaction',
      description: 'Build the unsigned instruction to set a .sns domain as the wallet primary domain. The caller signs and submits with its own wallet — SAP MCP holds no keys.',
      inputSchema: { domain: { type: 'string', description: 'The .sns domain name to set as primary for the owner' }, owner: { type: 'string', description: 'The Solana public key (base58) of the domain owner setting their primary domain' } },
      handler: async (input) => {
        const module = snsModule(context);
        const domain = requiredString(input, 'domain');
        const owner = requiredPublicKey(input, 'owner');
        const instructions = await module.buildSetPrimaryDomainInstructions(owner, domain);
        return unsignedInstructionsPayload(displayDomain(domain), instructions);
      },
    },
  ];
}

// ============================================================================
// Registration entry point
// ============================================================================

/**
 * @name registerSapSnsTools
 * @description Registers the production SNS integration tools.
 *
 * Reads route through the SDK `SnsModule` (`context.sapClient.sns`); write
 * paths return unsigned instruction sets for local signing.
 */
export function registerSapSnsTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering SAP SNS tools');

  let count = 0;
  for (const tool of createSnsTools(context)) {
    registerSnsPipelineTool(server, context, tool);
    count++;
  }

  logger.debug('SAP SNS tools registered', { count });
}
