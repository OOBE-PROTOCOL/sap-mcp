/**
 * SAP SNS MCP tools.
 *
 * Wraps the SNS integration from `@oobe-protocol-labs/synapse-sap-sdk@0.21.x` and
 * `@bonfida/spl-name-service`.
 *
 * Architecture (v0.21.0 — Free Choice Record System):
 * - `SnsModule` (modules/sns) is the primary SDK module for SAP agent domain operations:
 *   registration, resolution, availability, validation, PDA derivation.
 * - Bonfida SDK functions are used directly for record management and domain queries
 *   not covered by SnsModule.
 * - `sns-standalone` (SnsSdk) is DEPRECATED and removed in v0.21.0.
 *
 * Tool groups:
 * - Registration: `sap_sns_register_agent_domain` (SnsModule — signs + submits with USDC)
 * - Availability: `sap_sns_check_domain`, `sap_sns_batch_check_domains` (SnsModule)
 * - Resolution: `sap_sns_resolve_domain` (SnsModule), `sap_sns_resolve_wallet` (Bonfida)
 * - Records: `sap_sns_get_domain_records`, `sap_sns_get_record` (Bonfida)
 * - Ownership: `sap_sns_check_ownership` (Bonfida)
 * - PDA: `sap_sns_get_domain_pda`, `sap_sns_get_record_pda` (SnsModule)
 * - Validation: `sap_sns_validate_records` (SnsModule)
 * - Record management: `sap_sns_build_manage_record_transaction`, `sap_sns_build_set_primary_domain_transaction` (Bonfida)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey, Transaction } from '@solana/web3.js';
import { SnsModule, Record as SnsRecord } from '@oobe-protocol-labs/synapse-sap-sdk/modules/sns';
import {
  getDomainKeySync,
  getRecordKeySync,
  getRecord as bonfidaGetRecord,
  getRecords as bonfidaGetRecords,
  createRecordInstruction as bonfidaCreateRecordInstruction,
  deleteNameRegistry,
  getNameOwner,
  Record as BonfidaRecord,
} from '@bonfida/spl-name-service';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { loadKeypairFromFile } from '../signer/load-keypair.js';
import { logger } from '../core/logger.js';

type JsonRecord = Record<string, unknown>;
type SnsRegistrationParams = Parameters<SnsModule['registerAgentDomain']>[0];
type SnsRecordMap = SnsRegistrationParams['records'];
type SnsRecordKey = keyof SnsRecordMap;
type SnsRecordType = Parameters<SnsModule['getRecordPda']>[1];
type SnsToolHandler = (input: JsonRecord) => Promise<unknown>;

interface SnsToolRegistration {
  name: string;
  title: string;
  description: string;
  inputSchema: unknown;
  handler: SnsToolHandler;
}

const SNS_RECORD_KEYS: readonly SnsRecordKey[] = [
  'SOL',
  'Pic',
  'TXT',
  'Url',
  'Twitter',
  'Discord',
  'Telegram',
  'Github',
  'Email',
  'IPFS',
  'ARWV',
  'IPNS',
  'ETH',
  'BTC',
  'BSC',
  'Injective',
  'LTC',
  'DOGE',
  'A',
  'AAAA',
  'CNAME',
  'Reddit',
  'Background',
  'Backpack',
  'POINT',
  'BASE',
  'SHDW',
];

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
function ok(payload: unknown) {
  const objectPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as JsonRecord
    : { result: payload };

  return createTextResponse(JSON.stringify({ success: true, ...objectPayload }, jsonReplacer, 2));
}

/**
 * @name errorResponse
 * @description Wraps SNS failures in an MCP error response without throwing through the transport.
 */
function errorResponse(error: unknown) {
  return createTextResponse(
    `Error: ${error instanceof Error ? error.message : 'Unknown SNS error'}`,
    { isError: true }
  );
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
 * @name optionalString
 * @description Reads an optional string field from MCP input.
 */
function optionalString(input: JsonRecord, field: string): string | undefined {
  const value = input[field];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * @name optionalBoolean
 * @description Reads an optional boolean field from MCP input.
 */
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

/**
 * @name optionalNumber
 * @description Reads an optional finite number field from MCP input.
 */
function optionalNumber(input: JsonRecord, field: string): number | undefined {
  const value = input[field];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  throw new Error(`${field} must be a finite number`);
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

/**
 * @name optionalRecord
 * @description Reads an optional object field from MCP input.
 */
function optionalRecord(input: JsonRecord, field: string): JsonRecord | undefined {
  const value = input[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonRecord;
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
 * @description Ensures a domain name has the .sol suffix for Bonfida SDK calls.
 */
function ensureFullDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  return trimmed.endsWith('.sol') ? trimmed : `${trimmed}.sol`;
}

/**
 * @name parseSnsRecordType
 * @description Parses SNS record type names or values into Bonfida record enum values.
 */
function parseSnsRecordType(input: JsonRecord, field: string): SnsRecordType {
  const raw = requiredString(input, field).toLowerCase();
  const entries = Object.entries(SnsRecord) as Array<[string, SnsRecordType]>;
  const match = entries.find(([key, value]) => key.toLowerCase() === raw || String(value).toLowerCase() === raw);
  if (!match) {
    throw new Error(`${field} must be one of: ${entries.map(([key]) => key).join(', ')}`);
  }
  return match[1];
}

/**
 * @name parseSapData
 * @description Builds optional SAP structured data for the SNS TXT record.
 */
function parseSapData(input: JsonRecord): JsonRecord | undefined {
  const sapData = optionalRecord(input, 'sapData');
  const capabilities = optionalStringArray(input, 'capabilities');
  const protocols = optionalStringArray(input, 'protocols');
  const x402Endpoint = optionalString(input, 'x402Endpoint');
  const agentUri = optionalString(input, 'agentUri');
  const metadataUri = optionalString(input, 'metadataUri');

  const merged: JsonRecord = {
    ...(sapData ?? {}),
    ...(capabilities ? { capabilities } : {}),
    ...(protocols ? { protocols } : {}),
    ...(x402Endpoint ? { x402Endpoint } : {}),
    ...(agentUri ? { agentUri } : {}),
    ...(metadataUri ? { metadataUri } : {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * @name assignSnsRecord
 * @description Assigns an optional SNS record field while preserving the SDK record map type.
 */
function assignSnsRecord(records: Partial<SnsRecordMap>, key: SnsRecordKey, value: unknown): void {
  if (typeof value === 'string' && value.trim() !== '') {
    records[key] = value.trim();
  }
}

/**
 * @name parseSnsRecordMap
 * @description Converts MCP input into the strongly typed SNS record map expected by the SDK.
 *
 * Note: SOL record is NOT included during registration — it requires createSolRecordInstruction
 * (with Ed25519 signature), not createRecordInstruction. Set it after registration using
 * sap_sns_build_manage_record_transaction with recordType "SOL".
 */
function parseSnsRecordMap(input: JsonRecord): SnsRecordMap {
  const recordsInput = optionalRecord(input, 'records');
  const pic = optionalString(input, 'pic') ?? (recordsInput?.Pic as string | undefined);

  if (!pic) {
    throw new Error('pic or records.Pic is required because SNS core records require Pic');
  }

  const records: Partial<SnsRecordMap> = {
    Pic: pic,
  };

  if (recordsInput) {
    for (const key of SNS_RECORD_KEYS) {
      // Skip SOL — set it after registration via buildManageRecordTx
      if (key === 'SOL') continue;
      assignSnsRecord(records, key, recordsInput[key as string]);
    }
  }

  const sapData = parseSapData(input);
  if (sapData) {
    records.TXT = JSON.stringify(sapData);
  }

  assignSnsRecord(records, 'Url', optionalString(input, 'url') ?? optionalString(input, 'endpoint'));
  assignSnsRecord(records, 'Twitter', optionalString(input, 'twitter'));
  assignSnsRecord(records, 'Discord', optionalString(input, 'discord'));
  assignSnsRecord(records, 'Telegram', optionalString(input, 'telegram'));
  assignSnsRecord(records, 'Github', optionalString(input, 'github'));
  assignSnsRecord(records, 'Email', optionalString(input, 'email'));
  assignSnsRecord(records, 'IPFS', optionalString(input, 'ipfs'));
  assignSnsRecord(records, 'ARWV', optionalString(input, 'arweave'));
  assignSnsRecord(records, 'IPNS', optionalString(input, 'ipns'));
  assignSnsRecord(records, 'ETH', optionalString(input, 'eth'));
  assignSnsRecord(records, 'BTC', optionalString(input, 'btc'));
  assignSnsRecord(records, 'BSC', optionalString(input, 'bsc'));
  assignSnsRecord(records, 'Injective', optionalString(input, 'injective'));
  assignSnsRecord(records, 'LTC', optionalString(input, 'ltc'));
  assignSnsRecord(records, 'DOGE', optionalString(input, 'doge'));
  assignSnsRecord(records, 'A', optionalString(input, 'a'));
  assignSnsRecord(records, 'AAAA', optionalString(input, 'aaaa'));
  assignSnsRecord(records, 'CNAME', optionalString(input, 'cname'));
  assignSnsRecord(records, 'Reddit', optionalString(input, 'reddit'));
  assignSnsRecord(records, 'Background', optionalString(input, 'background'));
  assignSnsRecord(records, 'Backpack', optionalString(input, 'backpack'));
  assignSnsRecord(records, 'POINT', optionalString(input, 'point'));
  assignSnsRecord(records, 'BASE', optionalString(input, 'base'));
  assignSnsRecord(records, 'SHDW', optionalString(input, 'shdw'));

  return records as SnsRecordMap;
}

// ============================================================================
// SDK module factory helpers
// ============================================================================

/**
 * @name createSnsModule
 * @description Creates the SAP SNS module (modules/sns) for agent domain registration and resolution.
 */
function createSnsModule(context: SapMcpContext): SnsModule {
  return new SnsModule({
    connection: context.connection,
    sapProgramId: context.config.programId,
    defaultCommitment: context.config.commitment,
  });
}

/**
 * @name requireLocalRegistrationSigner
 * @description Loads the configured local keypair for SNS registration and verifies the expected wallet.
 */
function requireLocalRegistrationSigner(context: SapMcpContext, agentWallet: PublicKey) {
  if (context.config.mode !== 'local-dev-keypair' || !context.config.walletPath) {
    throw new Error('SNS direct registration requires local-dev-keypair mode and a configured SAP_WALLET_PATH');
  }

  const keypair = loadKeypairFromFile(context.config.walletPath);
  if (!keypair.publicKey.equals(agentWallet)) {
    throw new Error(`Configured wallet ${keypair.publicKey.toBase58()} does not match agentWallet ${agentWallet.toBase58()}`);
  }

  return keypair;
}

// ============================================================================
// Bonfida SDK helpers (for operations not available in SnsModule)
// ============================================================================

/**
 * @name bonfidaGetDomainRecords
 * @description Fetches all configured SNS records for a domain using Bonfida SDK directly.
 *
 * This replaces the deprecated SnsSdk.getDomainRecords() method.
 */
async function bonfidaGetDomainRecords(
  connection: SapMcpContext['connection'],
  domain: string
): Promise<Record<string, string>> {
  const fullDomain = ensureFullDomain(domain);
  const recordEntries = Object.entries(BonfidaRecord) as Array<[string, BonfidaRecord]>;
  const recordKeys = recordEntries.map(([, value]) => value);

  const results = await bonfidaGetRecords(connection, fullDomain, recordKeys, true);
  const records: Record<string, string> = {};

  recordEntries.forEach(([key, _value], index) => {
    const result = results[index];
    if (result !== undefined && result !== null) {
      records[key] = result;
    }
  });

  return records;
}

/**
 * @name bonfidaBuildManageRecordTx
 * @description Builds an unsigned transaction for creating/updating/deleting an SNS record.
 *
 * This replaces the deprecated SnsSdk.buildManageRecordTx() method.
 * Uses createRecordInstruction from Bonfida SDK directly.
 *
 * Note: SOL record is not supported by createRecordInstruction — it requires
 * createSolRecordInstruction with an Ed25519 signature. This is an SDK limitation.
 */
async function bonfidaBuildManageRecordTx(
  connection: SapMcpContext['connection'],
  domain: string,
  recordType: BonfidaRecord,
  value: string | null,
  owner: PublicKey
): Promise<{ transactionBase64: string }> {
  if (value === null) {
    // Delete: use delete instruction
    // getRecordKeySync returns PublicKey directly (not an object with .pubkey)
    const recordKey = getRecordKeySync(ensureFullDomain(domain), recordType);
    void recordKey; // available for future use (e.g. streaming buffer checks)
    // getDomainKeySync returns { pubkey, hashed, parent }
    const { pubkey: _domainKey } = getDomainKeySync(ensureFullDomain(domain));
    void _domainKey;
    const deleteIx = await deleteNameRegistry(connection, `${ensureFullDomain(domain)}.${recordType}`, owner);
    const tx = new Transaction().add(deleteIx);
    tx.feePayer = owner;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    return { transactionBase64: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64') };
  }

  // Create/update: use createRecordInstruction
  const fullDomain = ensureFullDomain(domain);

  // SOL record is not supported by createRecordInstruction
  if (recordType === BonfidaRecord.SOL) {
    throw new Error(
      'SOL record cannot be created with createRecordInstruction. ' +
      'It requires createSolRecordInstruction with an Ed25519 signature. ' +
      'This is a Bonfida SDK limitation.'
    );
  }

  const ix = await bonfidaCreateRecordInstruction(connection, fullDomain, recordType, value, owner, owner);
  const tx = new Transaction().add(ix);
  tx.feePayer = owner;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return { transactionBase64: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64') };
}

/**
 * @name bonfidaResolveDomain
 * @description Resolves a .sol domain to its owner wallet using Bonfida SDK directly.
 *
 * This replaces the deprecated SnsSdk.resolveDomain() method.
 */
async function bonfidaResolveDomain(
  connection: SapMcpContext['connection'],
  domain: string
): Promise<string | null> {
  const { pubkey: domainKey } = getDomainKeySync(ensureFullDomain(domain));
  const owner = await getNameOwner(connection, domainKey);
  return owner?.registry?.owner?.toBase58() ?? null;
}

/**
 * @name bonfidaCheckOwnership
 * @description Checks if a wallet owns a .sol domain using Bonfida SDK directly.
 *
 * This replaces the deprecated SnsSdk.checkOwnership() method.
 */
async function bonfidaCheckOwnership(
  connection: SapMcpContext['connection'],
  domain: string,
  owner: PublicKey
): Promise<boolean> {
  const { pubkey: domainKey } = getDomainKeySync(ensureFullDomain(domain));
  const ownerInfo = await getNameOwner(connection, domainKey);
  if (!ownerInfo?.registry?.owner) {
    return false;
  }
  return ownerInfo.registry.owner.equals(owner);
}

// ============================================================================
// Tool registration helper
// ============================================================================

/**
 * @name registerSnsTool
 * @description Registers a single SNS MCP tool with standard error handling.
 */
function registerSnsTool(server: Server, tool: SnsToolRegistration): void {
  registerTool(
    server,
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (input: unknown) => {
      try {
        const args = input && typeof input === 'object' && !Array.isArray(input) ? input as JsonRecord : {};
        return ok(await tool.handler(args));
      } catch (error) {
        logger.error(`SAP SNS tool failed: ${tool.name}`, { error });
        return errorResponse(error);
      }
    }
  );
}

// ============================================================================
// Tool definitions
// ============================================================================

/**
 * @name createSnsTools
 * @description Creates all SNS tool registrations against the current SAP MCP context.
 *
 * Tools use SnsModule (modules/sns) as primary SDK and Bonfida SDK functions
 * for record management and queries not available in SnsModule.
 */
function createSnsTools(context: SapMcpContext): SnsToolRegistration[] {
  return [
    // --- SnsModule: Availability checks ---
    {
      name: 'sap_sns_check_domain',
      title: 'Check SNS Domain',
      description: 'Check whether a .sol domain is available for registration using the SAP SDK SnsModule.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to check for availability (with or without .sol suffix)' } },
      handler: async (input) => ({ available: await createSnsModule(context).checkAvailability(requiredString(input, 'domain')) }),
    },
    {
      name: 'sap_sns_batch_check_domains',
      title: 'Batch Check SNS Domains',
      description: 'Check availability for multiple .sol domains (up to 25) using the SAP SDK SnsModule.',
      inputSchema: { domains: { type: 'array', items: { type: 'string', description: 'A .sol domain name to check (with or without .sol suffix)' }, description: 'Array of .sol domain names to batch-check for availability (1-25 domains)' } },
      handler: async (input) => {
        const domains = optionalStringArray(input, 'domains');
        if (!domains || domains.length === 0) {
          throw new Error('domains must contain at least one domain');
        }
        return { availability: await createSnsModule(context).batchCheckAvailability(domains) };
      },
    },

    // --- SnsModule: Domain resolution ---
    {
      name: 'sap_sns_resolve_domain',
      title: 'Resolve SAP SNS Domain',
      description: 'Resolve a .sol domain to SAP agent identity, wallet, metadata, and SNS records using the SAP SDK SnsModule.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to resolve to SAP agent identity and SNS records' } },
      handler: async (input) => ({ resolution: await createSnsModule(context).resolveAgentDomain(requiredString(input, 'domain')) }),
    },
    {
      name: 'sap_sns_validate_records',
      title: 'Validate SAP SNS Records',
      description: 'Validate SNS records for SAP agent compatibility (checks SOL, Pic, TXT records on-chain).',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name whose SNS records should be validated for SAP agent compatibility' } },
      handler: async (input) => await createSnsModule(context).validateAgentRecords(requiredString(input, 'domain')),
    },

    // --- SnsModule: PDA derivation ---
    {
      name: 'sap_sns_get_domain_pda',
      title: 'Get SNS Domain PDA',
      description: 'Derive the SNS domain PDA for a .sol domain using the SAP SDK SnsModule.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to derive the SNS domain PDA for' } },
      handler: async (input) => ({ domainPda: createSnsModule(context).getDomainPda(requiredString(input, 'domain')) }),
    },
    {
      name: 'sap_sns_get_record_pda',
      title: 'Get SNS Record PDA',
      description: 'Derive the SNS record PDA for a domain and record type using the SAP SDK SnsModule.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to derive the record PDA for' }, recordType: { type: 'string', description: 'The SNS record type for the PDA derivation (e.g. SOL, TXT, Url, IPFS, ETH, BTC, etc.)' } },
      handler: async (input) => ({
        recordPda: createSnsModule(context).getRecordPda(requiredString(input, 'domain'), parseSnsRecordType(input, 'recordType')),
      }),
    },

    // --- SnsModule: Domain registration (the primary tool) ---
    {
      name: 'sap_sns_register_agent_domain',
      title: 'Register SAP Agent SNS Domain',
      description: 'Register a .sol domain for the configured local SAP agent wallet using the SAP SDK SnsModule. Builds, signs, and submits the full registration transaction with USDC payment in one call. Domain registration fees are paid in USDC plus SOL for rent and transaction fees. The SOL record is NOT set during registration (it requires a separate Ed25519 signature) — set it after using sap_sns_build_manage_record_transaction.',
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
      handler: async (input) => {
        const agentWallet = requiredPublicKey(input, 'agentWallet');
        const signer = requireLocalRegistrationSigner(context, agentWallet);
        return {
          registration: await createSnsModule(context).registerAgentDomain({
            agentWallet,
            domainName: normalizeDomain(requiredString(input, 'domain')),
            records: parseSnsRecordMap(input),
            signer,
            durationYears: optionalNumber(input, 'durationYears'),
            setAsPrimary: optionalBoolean(input, 'setAsPrimary'),
            commitment: context.config.commitment,
            space: optionalNumber(input, 'space'),
          }),
        };
      },
    },

    // --- Bonfida SDK: Record fetching ---
    {
      name: 'sap_sns_get_domain_records',
      title: 'Get SNS Domain Records',
      description: 'Fetch all configured SNS records for a .sol domain using the Bonfida SDK. Returns a key-value map of all records.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to fetch all configured SNS records for' } },
      handler: async (input) => ({ records: await bonfidaGetDomainRecords(context.connection, requiredString(input, 'domain')) }),
    },
    {
      name: 'sap_sns_get_record',
      title: 'Get SNS Record',
      description: 'Fetch a single SNS record value for a .sol domain using the Bonfida SDK.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to fetch a record from' }, recordType: { type: 'string', description: 'The SNS record type to fetch (e.g. SOL, TXT, Url, IPFS, ETH, BTC, etc.)' } },
      handler: async (input) => ({
        record: await bonfidaGetRecord(context.connection, ensureFullDomain(requiredString(input, 'domain')), parseSnsRecordType(input, 'recordType') as BonfidaRecord, true),
      }),
    },

    // --- Bonfida SDK: Domain queries ---
    {
      name: 'sap_sns_resolve_wallet',
      title: 'Resolve SNS Wallet',
      description: 'Resolve a .sol domain to its owner wallet public key using the Bonfida SDK.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to resolve to its owner wallet public key' } },
      handler: async (input) => ({ wallet: await bonfidaResolveDomain(context.connection, requiredString(input, 'domain')) }),
    },
    {
      name: 'sap_sns_check_ownership',
      title: 'Check SNS Ownership',
      description: 'Check whether a wallet owns a .sol domain using the Bonfida SDK.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to check ownership of' }, owner: { type: 'string', description: 'The Solana public key (base58) of the wallet to verify as the domain owner' } },
      handler: async (input) => ({
        ownsDomain: await bonfidaCheckOwnership(context.connection, requiredString(input, 'domain'), requiredPublicKey(input, 'owner')),
      }),
    },

    // --- Bonfida SDK: Record management (builds unsigned transactions) ---
    {
      name: 'sap_sns_build_manage_record_transaction',
      title: 'Build SNS Manage Record Transaction',
      description: 'Build an unsigned SNS record create/update/delete transaction using the Bonfida SDK. The returned transaction must be signed with sap_sign_transaction before submission. Use null value to delete a record. Note: SOL record is not supported — it requires a separate Ed25519 signature flow.',
      inputSchema: {
        domain: { type: 'string', description: 'The .sol domain name whose record should be created, updated, or deleted' },
        recordType: { type: 'string', description: 'The SNS record type to manage (e.g. TXT, Url, IPFS, ETH, BTC, etc.)' },
        value: { type: ['string', 'null'], description: 'The new record value as a string, or null to delete the record' },
        owner: { type: 'string', description: 'The Solana public key (base58) of the domain owner authorizing the record change' },
      },
      handler: async (input) => {
        const rawValue = input.value;
        if (rawValue !== null && rawValue !== undefined && typeof rawValue !== 'string') {
          throw new Error('value must be a string or null');
        }
        const recordValue: string | null = typeof rawValue === 'string' ? rawValue : null;
        return {
          transaction: await bonfidaBuildManageRecordTx(
            context.connection,
            requiredString(input, 'domain'),
            parseSnsRecordType(input, 'recordType') as BonfidaRecord,
            recordValue,
            requiredPublicKey(input, 'owner')
          ),
        };
      },
    },
    {
      name: 'sap_sns_build_set_primary_domain_transaction',
      title: 'Build SNS Set Primary Domain Transaction',
      description: 'Build an unsigned transaction to set a .sol domain as primary for the owner using the Bonfida SDK. The returned transaction must be signed with sap_sign_transaction before submission.',
      inputSchema: { domain: { type: 'string', description: 'The .sol domain name to set as primary for the owner' }, owner: { type: 'string', description: 'The Solana public key (base58) of the domain owner setting their primary domain' } },
      handler: async () => {
        throw new Error(
          'Setting primary domain requires the Bonfida SNS CLI or direct program interaction. ' +
          'This operation is not available via the Bonfida SDK JavaScript bindings.'
        );
      },
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
 * Uses SnsModule from synapse-sap-sdk v0.21.0 as primary SDK module and
 * Bonfida SDK functions for record management not covered by SnsModule.
 * sns-standalone (SnsSdk) is deprecated and removed.
 */
export function registerSapSnsTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering SAP SNS tools');

  let count = 0;
  for (const tool of createSnsTools(context)) {
    registerSnsTool(server, tool);
    count++;
  }

  logger.debug('SAP SNS tools registered', { count });
}
