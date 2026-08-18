/**
 * SAP SNS MCP tools.
 *
 * Wraps Solana Name Service lookups without requiring the historical Bonfida
 * npm package, which is no longer available from the public npm registry.
 *
 * Architecture (v1.0.x — Free Choice Record System):
 * - Availability, PDA derivation, owner lookup, and record reads use local
 *   Solana Name Service helpers backed only by `@solana/web3.js`.
 * - Registration and record-write builders are fail-fast until migrated to a
 *   current, installable SNS SDK and covered by end-to-end tests.
 * - The old Bonfida SDK package is not imported anywhere in SAP MCP runtime.
 *
 * Tool groups:
 * - Registration: `sap_sns_register_agent_domain` (temporarily unavailable; no hosted key custody)
 * - Availability: `sap_sns_check_domain`, `sap_sns_batch_check_domains`
 * - Resolution: `sap_sns_resolve_domain`, `sap_sns_resolve_wallet`
 * - Records: `sap_sns_get_domain_records`, `sap_sns_get_record`
 * - Ownership: `sap_sns_check_ownership`
 * - PDA: `sap_sns_get_domain_pda`, `sap_sns_get_record_pda`
 * - Validation: `sap_sns_validate_records`
 * - Record management: `sap_sns_build_manage_record_transaction` (temporarily unavailable)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createHash } from 'crypto';
import { PublicKey, type Connection } from '@solana/web3.js';
import type { SapMcpContext } from '../../core/src/types.js';
import { logger } from '../../core/src/logger.js';
import {
  createToolFamilyPipelineResult,
  registerToolFamilyPipelineTool,
  type ToolFamilyPipelineResult,
} from './tool-family-pipeline.js';

type JsonRecord = Record<string, unknown>;
type SnsRecordType = string;
type SnsToolResult = ToolFamilyPipelineResult;
type SnsToolHandler = (input: JsonRecord) => Promise<unknown>;

interface SnsToolRegistration {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: SnsToolHandler;
}

const SNS_UNAVAILABLE_MESSAGE =
  'This SNS write path is temporarily unavailable in SAP MCP because the historical ' +
  '@bonfida/spl-name-service npm package is not installable from npmjs. SAP MCP keeps ' +
  'read/discovery tools available without that dependency, but registration and record ' +
  'write builders will stay disabled until a current SNS SDK path is migrated and tested.';

const SNS_NAME_PROGRAM_ID = new PublicKey('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX');
const SNS_ROOT_DOMAIN_ACCOUNT = new PublicKey('58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx');
const SNS_HASH_PREFIX = 'SPL Name Service';
const SNS_REGISTRY_HEADER_LEN = 96;
const SNS_RECORD_V1_PREFIX = '\u0001';
const SNS_SUBDOMAIN_PREFIX = '\u0000';
const ZERO_PUBLIC_KEY_BUFFER = Buffer.alloc(32);

const SNS_RECORD_VALUE_BY_KEY: Record<string, string> = {
  IPFS: 'IPFS',
  ARWV: 'ARWV',
  SOL: 'SOL',
  ETH: 'ETH',
  BTC: 'BTC',
  LTC: 'LTC',
  DOGE: 'DOGE',
  Email: 'email',
  Url: 'url',
  Discord: 'discord',
  Github: 'github',
  Reddit: 'reddit',
  Twitter: 'twitter',
  Telegram: 'telegram',
  Pic: 'pic',
  SHDW: 'SHDW',
  POINT: 'POINT',
  BSC: 'BSC',
  Injective: 'INJ',
  Backpack: 'backpack',
  A: 'A',
  AAAA: 'AAAA',
  CNAME: 'CNAME',
  TXT: 'TXT',
  Background: 'background',
  BASE: 'BASE',
  IPNS: 'IPNS',
};

// ============================================================================
// Serialization helpers
// ============================================================================

/**
 * @name jsonReplacer
 * @description Serializes SDK values returned by SNS tools into JSON-safe output.
 */
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

/**
 * @name ok
 * @description Wraps successful SNS output in a consistent MCP text response.
 */
function ok(payload: unknown): SnsToolResult {
  const objectPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as JsonRecord
    : { result: payload };

  return createToolFamilyPipelineResult(JSON.parse(JSON.stringify({ success: true, ...objectPayload }, jsonReplacer)) as JsonRecord);
}

/**
 * @name errorResponse
 * @description Wraps SNS failures in an MCP error response without throwing through the transport.
 */
function errorResponse(error: unknown): SnsToolResult {
  return createToolFamilyPipelineResult({
    success: false,
    error: error instanceof Error ? error.message : 'Unknown SNS error',
  }, undefined, { isError: true });
}

// ============================================================================
// Input parsing helpers
// ============================================================================

/**
 * @name requiredString
 * @description Reads a required string field from MCP input.
 */
function requiredString(input: JsonRecord, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

/**
 * @name requiredPublicKey
 * @description Reads a required base58 public key from MCP input.
 */
function requiredPublicKey(input: JsonRecord, field: string): PublicKey {
  return new PublicKey(requiredString(input, field));
}

/**
 * @name optionalStringArray
 * @description Reads an optional string array from MCP input.
 */
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

// ============================================================================
// Domain and record helpers
// ============================================================================

/**
 * @name normalizeDomain
 * @description Strips .sol suffix and lowercases for SDK methods that expect bare names.
 */
function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  return trimmed.endsWith('.sol') ? trimmed.slice(0, -4) : trimmed;
}

/**
 * @name ensureFullDomain
 * @description Ensures a domain name has the .sol suffix for SNS calls.
 */
function ensureFullDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  return trimmed.endsWith('.sol') ? trimmed : `${trimmed}.sol`;
}

/**
 * @name parseSnsRecordType
 * @description Parses SNS record type names or values into canonical record values.
 */
function parseSnsRecordType(input: JsonRecord, field: string): SnsRecordType {
  const raw = requiredString(input, field).toLowerCase();
  const entries = Object.entries(SNS_RECORD_VALUE_BY_KEY);
  const match = entries.find(([key, value]) => key.toLowerCase() === raw || String(value).toLowerCase() === raw);
  if (!match) {
    throw new Error(`${field} must be one of: ${entries.map(([key]) => key).join(', ')}`);
  }
  return match[1];
}

// ============================================================================
// Solana Name Service helpers
// ============================================================================

/**
 * @name snsUnavailable
 * @description Fails unsafe SNS write paths before any payment or transaction attempt.
 */
function snsUnavailable(): never {
  throw new Error(SNS_UNAVAILABLE_MESSAGE);
}

/**
 * @name hashSnsName
 * @description Reproduces the SPL Name Service SHA-256 name hash.
 */
function hashSnsName(name: string): Buffer {
  return createHash('sha256').update(`${SNS_HASH_PREFIX}${name}`, 'utf8').digest();
}

/**
 * @name deriveSnsNameKey
 * @description Derives an SPL Name Service account PDA from name hash, class, and parent.
 */
function deriveSnsNameKey(name: string, parent?: PublicKey, nameClass?: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      hashSnsName(name),
      nameClass?.toBuffer() ?? ZERO_PUBLIC_KEY_BUFFER,
      parent?.toBuffer() ?? ZERO_PUBLIC_KEY_BUFFER,
    ],
    SNS_NAME_PROGRAM_ID,
  )[0];
}

/**
 * @name deriveSnsDomainKey
 * @description Derives the SNS domain PDA for a .sol domain or subdomain using the legacy SPL Name Service layout.
 */
function deriveSnsDomainKey(domain: string): { pubkey: PublicKey; parent?: PublicKey; isSubdomain: boolean } {
  const bare = normalizeDomain(domain);
  const labels = bare.split('.').filter(Boolean);

  if (labels.length === 0) {
    throw new Error('domain is required');
  }

  if (labels.length === 1) {
    return {
      pubkey: deriveSnsNameKey(labels[0], SNS_ROOT_DOMAIN_ACCOUNT),
      parent: SNS_ROOT_DOMAIN_ACCOUNT,
      isSubdomain: false,
    };
  }

  if (labels.length === 2) {
    const root = deriveSnsNameKey(labels[1], SNS_ROOT_DOMAIN_ACCOUNT);
    return {
      pubkey: deriveSnsNameKey(`${SNS_SUBDOMAIN_PREFIX}${labels[0]}`, root),
      parent: root,
      isSubdomain: true,
    };
  }

  throw new Error('Only .sol domains and one-level SNS subdomains are supported by this reader');
}

/**
 * @name deriveSnsRecordKey
 * @description Derives an SNS record PDA for a domain using the legacy V1 record namespace.
 */
function deriveSnsRecordKey(domain: string, recordType: SnsRecordType): PublicKey {
  const bare = normalizeDomain(domain);
  const labels = bare.split('.').filter(Boolean);

  if (labels.length !== 1) {
    throw new Error('SNS record PDA derivation currently supports root .sol domains only');
  }

  const tld = deriveSnsNameKey('sol', SNS_ROOT_DOMAIN_ACCOUNT);
  const domainKey = deriveSnsNameKey(`${SNS_SUBDOMAIN_PREFIX}${labels[0]}`, tld);
  return deriveSnsNameKey(`${SNS_RECORD_V1_PREFIX}${recordType}`, domainKey);
}

/**
 * @name readSnsOwner
 * @description Reads the owner field from an SPL Name Service account header.
 */
async function readSnsOwner(connection: Connection, nameAccount: PublicKey): Promise<PublicKey | null> {
  const accountInfo = await connection.getAccountInfo(nameAccount);
  if (!accountInfo || accountInfo.data.length < SNS_REGISTRY_HEADER_LEN) {
    return null;
  }
  return new PublicKey(accountInfo.data.subarray(32, 64));
}

/**
 * @name readSnsRecord
 * @description Reads and decodes a text-like SNS record value without the historical Bonfida package.
 */
async function readSnsRecord(
  connection: Connection,
  domain: string,
  recordType: SnsRecordType,
): Promise<string | null> {
  const recordKey = deriveSnsRecordKey(domain, recordType);
  const accountInfo = await connection.getAccountInfo(recordKey);
  if (!accountInfo || accountInfo.data.length <= SNS_REGISTRY_HEADER_LEN) {
    return null;
  }

  const registryData = accountInfo.data.subarray(SNS_REGISTRY_HEADER_LEN);
  const valueData = registryData.length > 10 ? registryData.subarray(recordType === 'TXT' ? 8 : 10) : registryData;
  const compact = Buffer.from(valueData).filter((byte) => byte !== 0);

  if (recordType === 'SOL' && compact.length === 32) {
    return new PublicKey(compact).toBase58();
  }

  const decoded = Buffer.from(compact).toString('utf8').trim();
  return decoded.length > 0 ? decoded : null;
}

/**
 * @name readSnsDomainRecords
 * @description Fetches known SNS records for a .sol domain with bounded parallelism.
 */
async function readSnsDomainRecords(connection: Connection, domain: string): Promise<Record<string, string>> {
  const records: Record<string, string> = {};
  const entries = Object.entries(SNS_RECORD_VALUE_BY_KEY);

  await Promise.all(entries.map(async ([key, value]) => {
    try {
      const record = await readSnsRecord(connection, domain, value);
      if (record) {
        records[key] = record;
      }
    } catch {
      // Unsupported record namespaces should not fail the full domain record read.
    }
  }));

  return records;
}

/**
 * @name resolveSnsWallet
 * @description Resolves a .sol domain to its SOL record first, then domain owner as fallback.
 */
async function resolveSnsWallet(connection: Connection, domain: string): Promise<string | null> {
  try {
    const solRecord = await readSnsRecord(connection, domain, 'SOL');
    if (solRecord) {
      return solRecord;
    }
  } catch {
    // Fall through to owner lookup for domains without a readable SOL record.
  }

  const { pubkey } = deriveSnsDomainKey(domain);
  return (await readSnsOwner(connection, pubkey))?.toBase58() ?? null;
}

/**
 * @name checkSnsAvailability
 * @description Checks whether an SNS domain account is absent on-chain.
 */
async function checkSnsAvailability(connection: Connection, domain: string): Promise<boolean> {
  const { pubkey } = deriveSnsDomainKey(domain);
  return (await connection.getAccountInfo(pubkey)) === null;
}

/**
 * @name validateSnsRecords
 * @description Returns a compact SAP compatibility view of common SNS records.
 */
async function validateSnsRecords(connection: Connection, domain: string): Promise<JsonRecord> {
  const records = await readSnsDomainRecords(connection, domain);
  const warnings: string[] = [];

  if (!records.Pic) {
    warnings.push('Pic record is missing; agent marketplaces may not show an avatar.');
  }

  if (!records.TXT) {
    warnings.push('TXT record is missing; SAP capability metadata cannot be discovered from SNS.');
  }

  if (records.SOL) {
    try {
      new PublicKey(records.SOL);
    } catch {
      warnings.push('SOL record is present but is not a valid base58 public key.');
    }
  }

  return {
    domain: ensureFullDomain(domain),
    valid: warnings.length === 0,
    records,
    warnings,
  };
}

// ============================================================================
// Tool registration helper
// ============================================================================

/**
 * @name registerSnsTool
 * @description Registers a single SNS MCP tool with standard error handling.
 */
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

/**
 * @name createSnsTools
 * @description Creates all SNS tool registrations against the current SAP MCP context.
 *
 * Read tools use local SPL Name Service PDA/account helpers. Write builders are
 * deliberately unavailable until SAP MCP has a current SNS SDK path with E2E tests.
 */
function createSnsTools(context: SapMcpContext): SnsToolRegistration[] {
  return [
    // --- SNS reads: availability checks ---
    {
      name: 'sap_sns_check_domain',
      title: 'Check SNS Domain',
      description: 'Check whether a .sol domain is available by deriving its Solana Name Service PDA and checking whether the account exists on-chain. This is a read-only helper and does not require the historical Bonfida npm package.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to check for availability (with or without .sol suffix)' } },
      handler: async (input) => ({ available: await checkSnsAvailability(context.connection, requiredString(input, 'domain')) }),
    },
    {
      name: 'sap_sns_batch_check_domains',
      title: 'Batch Check SNS Domains',
      description: 'Check availability for multiple .sol domains (up to 25) by deriving each SNS PDA and checking account existence on-chain. This is read-only and safe for hosted mode.',
      inputSchema: { domains: { type: 'array', items: { type: 'string', description: 'A .sol domain name to check (with or without .sol suffix)' }, description: 'Array of .sol domain names to batch-check for availability (1-25 domains)' } },
      handler: async (input) => {
        const domains = optionalStringArray(input, 'domains');
        if (!domains || domains.length === 0) {
          throw new Error('domains must contain at least one domain');
        }
        if (domains.length > 25) {
          throw new Error('domains supports at most 25 items per call');
        }
        const entries = await Promise.all(domains.map(async (domain) => [
          ensureFullDomain(domain),
          await checkSnsAvailability(context.connection, domain),
        ] as const));
        return { availability: Object.fromEntries(entries) };
      },
    },

    // --- SNS reads: domain resolution ---
    {
      name: 'sap_sns_resolve_domain',
      title: 'Resolve SAP SNS Domain',
      description: 'Resolve a .sol domain to its wallet/owner and configured SNS records using direct Solana Name Service account reads. Agents should treat TXT/Pic/Url records as optional metadata and fall back to the wallet owner when no SOL record exists.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to resolve to SAP agent identity and SNS records' } },
      handler: async (input) => {
        const domain = requiredString(input, 'domain');
        return {
          resolution: {
            domain: ensureFullDomain(domain),
            wallet: await resolveSnsWallet(context.connection, domain),
            records: await readSnsDomainRecords(context.connection, domain),
          },
        };
      },
    },
    {
      name: 'sap_sns_validate_records',
      title: 'Validate SAP SNS Records',
      description: 'Validate SNS records for SAP agent compatibility (checks SOL, Pic, TXT records on-chain).',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name whose SNS records should be validated for SAP agent compatibility' } },
      handler: async (input) => await validateSnsRecords(context.connection, requiredString(input, 'domain')),
    },

    // --- SNS reads: PDA derivation ---
    {
      name: 'sap_sns_get_domain_pda',
      title: 'Get SNS Domain PDA',
      description: 'Derive the Solana Name Service domain PDA for a .sol domain. This helper is deterministic, read-only, and does not require any external SNS SDK.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to derive the SNS domain PDA for' } },
      handler: async (input) => ({ domainPda: deriveSnsDomainKey(requiredString(input, 'domain')).pubkey }),
    },
    {
      name: 'sap_sns_get_record_pda',
      title: 'Get SNS Record PDA',
      description: 'Derive the Solana Name Service record PDA for a root .sol domain and record type such as SOL, TXT, Pic, Url, or IPFS.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to derive the record PDA for' }, recordType: { type: 'string', description: 'The SNS record type for the PDA derivation (e.g. SOL, TXT, Url, IPFS, ETH, BTC, etc.)' } },
      handler: async (input) => ({
        recordPda: deriveSnsRecordKey(requiredString(input, 'domain'), parseSnsRecordType(input, 'recordType')),
      }),
    },

    // --- SNS writes: unavailable until migrated to a current SDK path ---
    {
      name: 'sap_sns_register_agent_domain',
      title: 'Register SAP Agent SNS Domain',
      description: 'Temporarily unavailable. SAP MCP does not currently publish an SNS registration write path because the historical Bonfida SNS npm package is not installable from npmjs. Use this tool only to receive the fail-fast status before any payment or signing attempt.',
      inputSchema: {
        domain: { type: 'string', description: 'The .sol domain name to register for the SAP agent (with or without .sol suffix)' },
        agentWallet: { type: 'string', description: 'The Solana public key (base58) of the SAP agent wallet that will own the domain' },
        pic: { type: 'string', description: 'Profile picture URL for the SNS Pic record (required if not provided in records.Pic)' },
        records: { type: 'object', description: 'Optional map of SNS record key-value pairs to set during registration (e.g. { "Url": "https://...", "Twitter": "@handle" }). Note: SOL record is skipped during registration.' },
        sapData: { type: 'object', description: 'Optional structured SAP metadata to embed in the domain TXT record (capabilities, protocols, endpoints, etc.)' },
        capabilities: { type: 'array', items: { type: 'string', description: 'A SAP capability identifier (e.g. "jupiter:swap")' }, description: 'Optional list of SAP capability IDs to advertise in the domain TXT record' },
        protocols: { type: 'array', items: { type: 'string', description: 'A protocol identifier (e.g. "sap", "mcp")' }, description: 'Optional list of protocol IDs the agent supports' },
        setAsPrimary: { type: 'boolean', description: 'Whether to set this domain as the agent primary .sol domain' },
        durationYears: { type: 'number', description: 'Registration duration in years (default: 1)' },
        space: { type: 'number', description: 'Storage space in bytes for the domain name account (default: 600)' },
      },
      handler: async () => snsUnavailable(),
    },

    // --- SNS reads: record fetching ---
    {
      name: 'sap_sns_get_domain_records',
      title: 'Get SNS Domain Records',
      description: 'Fetch known SNS records for a .sol domain using direct Solana Name Service account reads. Returns a key-value map for records that exist and can be decoded.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to fetch all configured SNS records for' } },
      handler: async (input) => ({ records: await readSnsDomainRecords(context.connection, requiredString(input, 'domain')) }),
    },
    {
      name: 'sap_sns_get_record',
      title: 'Get SNS Record',
      description: 'Fetch a single SNS record value for a .sol domain using direct Solana Name Service account reads. Returns null if the record account is absent or empty.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to fetch a record from' }, recordType: { type: 'string', description: 'The SNS record type to fetch (e.g. SOL, TXT, Url, IPFS, ETH, BTC, etc.)' } },
      handler: async (input) => ({
        record: await readSnsRecord(context.connection, requiredString(input, 'domain'), parseSnsRecordType(input, 'recordType')),
      }),
    },

    // --- SNS reads: domain queries ---
    {
      name: 'sap_sns_resolve_wallet',
      title: 'Resolve SNS Wallet',
      description: 'Resolve a .sol domain to a wallet public key. The tool prefers the SOL record when available and falls back to the domain owner field from the SNS account header.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to resolve to its owner wallet public key' } },
      handler: async (input) => ({ wallet: await resolveSnsWallet(context.connection, requiredString(input, 'domain')) }),
    },
    {
      name: 'sap_sns_check_ownership',
      title: 'Check SNS Ownership',
      description: 'Check whether a wallet matches the resolved SNS wallet for a .sol domain. This uses the SOL record when present and the domain owner as fallback.',
      inputSchema: {
        domain: { type: 'string', description: 'The .sol domain name to check ownership of' },
        owner: { type: 'string', description: 'Canonical field: Solana public key (base58) of the wallet to verify as the domain owner' },
        wallet: { type: 'string', description: 'Alias for owner, accepted for agent ergonomics when the user says wallet.' },
      },
      handler: async (input) => ({
        ownsDomain: (await resolveSnsWallet(context.connection, requiredString(input, 'domain'))) ===
          (input.owner === undefined ? requiredPublicKey(input, 'wallet') : requiredPublicKey(input, 'owner')).toBase58(),
      }),
    },

    // --- SNS writes: unavailable until migrated to a current SDK path ---
    {
      name: 'sap_sns_build_manage_record_transaction',
      title: 'Build SNS Manage Record Transaction',
      description: 'Temporarily unavailable. SAP MCP does not currently publish an SNS record write builder because the historical Bonfida SNS npm package is not installable from npmjs. The tool fails fast before payment or signing.',
      inputSchema: {
        domain: { type: 'string', description: 'The .sol domain name whose record should be created, updated, or deleted' },
        recordType: { type: 'string', description: 'The SNS record type to manage (e.g. TXT, Url, IPFS, ETH, BTC, etc.)' },
        value: { type: ['string', 'null'], description: 'The new record value as a string, or null to delete the record' },
        owner: { type: 'string', description: 'The Solana public key (base58) of the domain owner authorizing the record change' },
      },
      handler: async () => snsUnavailable(),
    },
    {
      name: 'sap_sns_build_set_primary_domain_transaction',
      title: 'Build SNS Set Primary Domain Transaction',
      description: 'Temporarily unavailable. Setting primary SNS domains is disabled in SAP MCP until the SNS write path is migrated to a current installable SDK and covered by end-to-end tests.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to set as primary for the owner' }, owner: { type: 'string', description: 'The Solana public key (base58) of the domain owner setting their primary domain' } },
      handler: async () => snsUnavailable(),
    },
  ];
}

// ============================================================================
// Registration entry point
// ============================================================================

/**
 * @name registerSapSnsTools
 * @description Registers production SNS integration tools.
 *
 * Uses local SPL Name Service helpers for reads. SNS write paths are disabled
 * until a current installable SNS SDK path is migrated and tested.
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
