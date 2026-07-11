/**
 * MagicBlock MCP Tools
 *
 * Registers 20 MagicBlock tools across 3 protocol domains:
 *   - mb-router   (6 read-only ER Router JSON-RPC tools)
 *   - mb-payments (12 Private Payment API REST tools)
 *   - mb-vrf      (2 Solana VRF tools — scaffolded, throws until SDK is installed)
 *
 * Pricing:
 *   READ  = $0.01/call (10_000 USDC base units) — 14 read-only tools
 *   WRITE = $0.05/call (50_000 USDC base units) — 6 transaction-building tools
 *
 * Write tools (deposit, transfer, withdraw, swap, initializeMint) return
 * unsigned transactions. The caller must sign with sap_sign_transaction
 * and submit with sap_submit_signed_transaction to the RPC indicated by
 * the `sendTo` field ("base" or "ephemeral").
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { logger } from '../core/logger.js';

// ═══════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════

const ROUTER_ENDPOINTS = {
  mainnet: 'https://router.magicblock.app',
  devnet: 'https://devnet-router.magicblock.app',
} as const;

const PAYMENTS_ENDPOINT = 'https://payments.magicblock.app';
const JSONRPC_VERSION = '2.0';

/** $0.01 in USDC base units (6 decimals). */
const READ_PRICE_USDC = 10_000n;
/** $0.05 in USDC base units (6 decimals). */
const WRITE_PRICE_USDC = 50_000n;

// ═══════════════════════════════════════════════════════════════════
//  Pricing
// ═══════════════════════════════════════════════════════════════════

const READ_TOOLS = new Set([
  'magicblock_getRoutes',
  'magicblock_getIdentity',
  'magicblock_getDelegationStatus',
  'magicblock_getAccountInfo',
  'magicblock_getBlockhashForAccounts',
  'magicblock_getSignatureStatuses',
  'magicblock_health',
  'magicblock_challenge',
  'magicblock_login',
  'magicblock_balance',
  'magicblock_privateBalance',
  'magicblock_swapQuote',
  'magicblock_isMintInitialized',
  'magicblock_getRandomnessResult',
]);

const WRITE_TOOLS = new Set([
  'magicblock_deposit',
  'magicblock_transfer',
  'magicblock_withdraw',
  'magicblock_swap',
  'magicblock_initializeMint',
  'magicblock_requestRandomness',
]);

function getPriceForTool(toolName: string): bigint {
  if (READ_TOOLS.has(toolName)) return READ_PRICE_USDC;
  if (WRITE_TOOLS.has(toolName)) return WRITE_PRICE_USDC;
  throw new Error(`No pricing defined for tool: ${toolName}`);
}

// ═══════════════════════════════════════════════════════════════════
//  HTTP Helpers (stateless — zero external deps, uses global fetch)
// ═══════════════════════════════════════════════════════════════════

async function rpcCall<T>(
  endpoint: 'mainnet' | 'devnet',
  method: string,
  params: unknown[],
): Promise<T> {
  const url = ROUTER_ENDPOINTS[endpoint];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: JSONRPC_VERSION, id: 1, method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MagicBlock Router ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { result?: T; error?: { code: number; message: string } };
  if (json.error) throw new Error(`JSON-RPC error ${json.error.code}: ${json.error.message}`);
  return json.result as T;
}

async function apiGet<T>(
  path: string,
  query?: Record<string, string | null | undefined>,
  authToken?: string,
): Promise<T> {
  const url = new URL(PAYMENTS_ENDPOINT + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null) url.searchParams.set(key, value);
    }
  }
  const headers: Record<string, string> = {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(url.toString(), { method: 'GET', headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`MagicBlock API ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
  authToken?: string,
): Promise<T> {
  const url = PAYMENTS_ENDPOINT + path;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`MagicBlock API ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

function stripNullish(
  obj: Record<string, unknown> | undefined,
  exclude: readonly string[] = [],
): Record<string, unknown> {
  if (!obj) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value != null && !exclude.includes(key)) result[key] = value;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
//  Tool Schema Definitions (JSON Schema for MCP)
// ═══════════════════════════════════════════════════════════════════

type JsonSchema = Record<string, unknown>;

function schema(properties: JsonSchema, required?: string[]): JsonSchema {
  return {
    type: 'object',
    properties,
    ...(required && required.length > 0 ? { required } : {}),
  };
}

const pubkeyField = (desc: string): JsonSchema => ({ type: 'string', description: desc });
const stringField = (desc: string): JsonSchema => ({ type: 'string', description: desc });
const numberField = (desc: string): JsonSchema => ({ type: 'number', description: desc });
const booleanField = (desc: string): JsonSchema => ({ type: 'boolean', description: desc });
const enumField = (desc: string, values: string[]): JsonSchema => ({
  type: 'string',
  enum: values,
  description: desc,
});
const arrayField = (desc: string, items: JsonSchema): JsonSchema => ({
  type: 'array',
  items,
  description: desc,
});

const endpointField = enumField("MagicBlock Router endpoint: 'mainnet' or 'devnet'", ['mainnet', 'devnet']);

// ═══════════════════════════════════════════════════════════════════
//  Registration
// ═══════════════════════════════════════════════════════════════════

/**
 * @name registerMagicBlockTools
 * @description Registers 20 MagicBlock tools (ER Router, Private Payments, VRF)
 *   with the MCP server. Each tool is priced at $0.01 (read) or $0.05 (write).
 * @param server - MCP server receiving tool definitions and handlers.
 * @param _context - Shared runtime context (unused — MagicBlock APIs are stateless).
 */
export function registerMagicBlockTools(server: Server, _context: SapMcpContext): void {
  logger.debug('Registering MagicBlock tools');

  let registered = 0;

  // ─── Helper to register a single tool ───────────────────────────
  function tool(
    name: string,
    description: string,
    inputSchema: JsonSchema,
    handler: (input: Record<string, unknown>) => Promise<unknown>,
  ): void {
    registerTool(server, name, { title: name.replace(/_/g, ' '), description, inputSchema }, handler);
    registered++;
  }

  // ─── Helper for error handling ──────────────────────────────────
  function handleError(toolName: string, error: unknown) {
    logger.error(`MagicBlock tool failed: ${toolName}`, { error });
    return createTextResponse(
      JSON.stringify({
        error: `MagicBlock tool ${toolName} failed`,
        message: error instanceof Error ? error.message : 'Unknown error',
      }, null, 2),
      { isError: true },
    );
  }

  // ─── Helper to format success responses ─────────────────────────
  function success(data: unknown, toolName: string) {
    const price = getPriceForTool(toolName);
    const priceUsd = Number(price) / 1e6;
    const response = {
      success: true,
      tool: toolName,
      priceUsd: `$${priceUsd.toFixed(2)}`,
      priceBaseUnits: price.toString(),
      data,
    };
    return createTextResponse(JSON.stringify(response, null, 2));
  }

  // ═══════════════════════════════════════════════════════════════
  //  ER Router (6 read-only tools)
  // ═══════════════════════════════════════════════════════════════

  tool('magicblock_getRoutes',
    'List available Ephemeral Rollup nodes from the Magic Router (identity, FQDN, fee, block time, country). Price: $0.01.',
    schema({ endpoint: endpointField }),
    async (input) => {
      try {
        const endpoint = (input.endpoint as 'mainnet' | 'devnet') ?? 'devnet';
        const routes = await rpcCall<unknown[]>(endpoint, 'getRoutes', []);
        return success({ routes }, 'magicblock_getRoutes');
      } catch (e) { return handleError('magicblock_getRoutes', e); }
    },
  );

  tool('magicblock_getIdentity',
    'Get the identity and FQDN of the current ER Validator node. Price: $0.01.',
    schema({ endpoint: endpointField }),
    async (input) => {
      try {
        const endpoint = (input.endpoint as 'mainnet' | 'devnet') ?? 'devnet';
        const identity = await rpcCall<{ identity: string; fqdn: string }>(endpoint, 'getIdentity', []);
        return success(identity, 'magicblock_getIdentity');
      } catch (e) { return handleError('magicblock_getIdentity', e); }
    },
  );

  tool('magicblock_getDelegationStatus',
    'Check whether a Solana account is delegated to an Ephemeral Rollup. Returns authority, owner, delegation slot, and lamports. Price: $0.01.',
    schema({ account: pubkeyField('Account pubkey to check delegation status for'), endpoint: endpointField }, ['account']),
    async (input) => {
      try {
        const endpoint = (input.endpoint as 'mainnet' | 'devnet') ?? 'devnet';
        const status = await rpcCall(endpoint, 'getDelegationStatus', [input.account]);
        return success(status, 'magicblock_getDelegationStatus');
      } catch (e) { return handleError('magicblock_getDelegationStatus', e); }
    },
  );

  tool('magicblock_getAccountInfo',
    'Fetch account information (data, lamports, owner, executable, space) via the Magic Router. Price: $0.01.',
    schema({
      account: pubkeyField('Account pubkey to fetch info for'),
      encoding: enumField('Encoding for account data', ['base64', 'base64+zstd']),
      endpoint: endpointField,
    }, ['account']),
    async (input) => {
      try {
        const endpoint = (input.endpoint as 'mainnet' | 'devnet') ?? 'devnet';
        const encoding = (input.encoding as string) ?? 'base64';
        const info = await rpcCall(endpoint, 'getAccountInfo', [input.account, { encoding }]);
        return success(info, 'magicblock_getAccountInfo');
      } catch (e) { return handleError('magicblock_getAccountInfo', e); }
    },
  );

  tool('magicblock_getBlockhashForAccounts',
    'Get a blockhash and last valid block height for a batch of account addresses (max 100). Price: $0.01.',
    schema({
      accounts: arrayField('Array of account addresses (max 100)', pubkeyField('Account pubkey')),
      endpoint: endpointField,
    }, ['accounts']),
    async (input) => {
      try {
        const endpoint = (input.endpoint as 'mainnet' | 'devnet') ?? 'devnet';
        const accounts = input.accounts as string[];
        const blockhash = await rpcCall(endpoint, 'getBlockhashForAccounts', [accounts]);
        return success(blockhash, 'magicblock_getBlockhashForAccounts');
      } catch (e) { return handleError('magicblock_getBlockhashForAccounts', e); }
    },
  );

  tool('magicblock_getSignatureStatuses',
    'Check the confirmation status (processed/confirmed/finalized) of one or more transaction signatures. Price: $0.01.',
    schema({
      signatures: arrayField('Array of transaction signatures', stringField('Transaction signature (base58)')),
      endpoint: endpointField,
    }, ['signatures']),
    async (input) => {
      try {
        const endpoint = (input.endpoint as 'mainnet' | 'devnet') ?? 'devnet';
        const signatures = input.signatures as string[];
        const statuses = await rpcCall(endpoint, 'getSignatureStatuses', [signatures]);
        return success(statuses, 'magicblock_getSignatureStatuses');
      } catch (e) { return handleError('magicblock_getSignatureStatuses', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  Private Payment API — Meta & Auth (3 tools)
  // ═══════════════════════════════════════════════════════════════

  tool('magicblock_health',
    'Check the health status of the MagicBlock Private Payments API. Price: $0.01.',
    schema({}),
    async () => {
      try {
        const health = await apiGet<{ status: string }>('/health');
        return success(health, 'magicblock_health');
      } catch (e) { return handleError('magicblock_health', e); }
    },
  );

  tool('magicblock_challenge',
    'Generate a challenge string for the wallet to sign (step 1 of the PER auth flow). Price: $0.01.',
    schema({
      pubkey: pubkeyField('Wallet pubkey that will sign the challenge'),
      cluster: stringField("Cluster: 'mainnet', 'devnet', or custom RPC URL"),
      mock: booleanField('Use a mock challenge for testing (default false)'),
    }, ['pubkey']),
    async (input) => {
      try {
        const result = await apiGet<{ challenge: string }>('/v1/spl/challenge', {
          pubkey: input.pubkey as string,
          cluster: input.cluster as string | undefined,
          mock: input.mock ? 'true' : undefined,
        });
        return success(result, 'magicblock_challenge');
      } catch (e) { return handleError('magicblock_challenge', e); }
    },
  );

  tool('magicblock_login',
    'Exchange a signed challenge for a bearer token (step 2 of PER auth flow). The token is used for private-balance and private transfers. Price: $0.01.',
    schema({
      pubkey: pubkeyField('Wallet pubkey that signed the challenge'),
      challenge: stringField('Challenge string from magicblock_challenge'),
      signature: stringField('Wallet signature over the challenge string'),
      cluster: stringField("Cluster: 'mainnet', 'devnet', or custom RPC URL"),
      mock: booleanField('Use mock login flow (default false)'),
    }, ['pubkey', 'challenge', 'signature']),
    async (input) => {
      try {
        const result = await apiPost<{ token: string }>('/v1/spl/login', {
          pubkey: input.pubkey,
          challenge: input.challenge,
          signature: input.signature,
          cluster: input.cluster,
          mock: input.mock || undefined,
        });
        return success(result, 'magicblock_login');
      } catch (e) { return handleError('magicblock_login', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  Private Payment API — Balance (2 tools)
  // ═══════════════════════════════════════════════════════════════

  tool('magicblock_balance',
    'Read the base-chain SPL token balance for an address (public, no auth required). Price: $0.01.',
    schema({
      address: pubkeyField('Owner wallet pubkey'),
      mint: stringField('SPL mint pubkey'),
      cluster: stringField("Cluster: 'mainnet', 'devnet', or custom RPC URL"),
    }, ['address', 'mint']),
    async (input) => {
      try {
        const result = await apiGet('/v1/spl/balance', {
          address: input.address as string,
          mint: input.mint as string,
          cluster: input.cluster as string | undefined,
        });
        return success(result, 'magicblock_balance');
      } catch (e) { return handleError('magicblock_balance', e); }
    },
  );

  tool('magicblock_privateBalance',
    'Read the ephemeral-rollup SPL token balance for an address (requires bearer token from login). Price: $0.01.',
    schema({
      address: pubkeyField('Owner wallet pubkey'),
      mint: stringField('SPL mint pubkey'),
      cluster: stringField("Cluster: 'mainnet', 'devnet', or custom RPC URL"),
      authToken: stringField('Bearer token from magicblock_login (required for private reads)'),
    }, ['address', 'mint', 'authToken']),
    async (input) => {
      try {
        const result = await apiGet('/v1/spl/private-balance', {
          address: input.address as string,
          mint: input.mint as string,
          cluster: input.cluster as string | undefined,
        }, input.authToken as string);
        return success(result, 'magicblock_privateBalance');
      } catch (e) { return handleError('magicblock_privateBalance', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  Private Payment API — SPL Token Flows (3 write tools)
  // ═══════════════════════════════════════════════════════════════

  tool('magicblock_deposit',
    'Build an unsigned transaction to deposit SPL tokens from Solana into an Ephemeral Rollup. Sign with sap_sign_transaction and submit to the RPC indicated by sendTo. Price: $0.05.',
    schema({
      owner: pubkeyField('Wallet pubkey that owns the tokens and will sign'),
      amount: numberField('Base-unit amount to deposit (integer, minimum 1)'),
      mint: stringField('SPL mint. Defaults to USDC (mainnet) or devnet USDC'),
      cluster: stringField("Cluster: 'mainnet', 'devnet', or custom RPC URL"),
      validator: stringField('Optional ER validator pubkey. Defaults to the selected ephemeral RPC identity.'),
      initIfMissing: booleanField('Initialize the transfer queue if missing (default true)'),
      initVaultIfMissing: booleanField('Initialize the vault if missing (default true)'),
      initAtasIfMissing: booleanField('Initialize associated token accounts if missing (default true)'),
      idempotent: booleanField('Use idempotent variants for preparatory init instructions (default true)'),
    }, ['owner', 'amount']),
    async (input) => {
      try {
        const result = await apiPost('/v1/spl/deposit', {
          owner: input.owner,
          amount: input.amount,
          ...stripNullish({
            mint: input.mint,
            cluster: input.cluster,
            validator: input.validator,
            initIfMissing: input.initIfMissing,
            initVaultIfMissing: input.initVaultIfMissing,
            initAtasIfMissing: input.initAtasIfMissing,
            idempotent: input.idempotent,
          }),
        });
        return success(result, 'magicblock_deposit');
      } catch (e) { return handleError('magicblock_deposit', e); }
    },
  );

  tool('magicblock_transfer',
    'Build an unsigned SPL token transfer (public or private) through an Ephemeral Rollup. Supports base/ephemeral source and destination, delayed settlement, split transfers, and gasless mode. Price: $0.05.',
    schema({
      from: pubkeyField('Sender wallet pubkey'),
      to: pubkeyField('Recipient wallet pubkey'),
      mint: stringField('SPL mint pubkey'),
      amount: numberField('Base-unit amount to transfer (integer, minimum 1)'),
      visibility: enumField("'public' = transparent SPL transfer, 'private' = routed through Private ER with delayed+split settlement", ['public', 'private']),
      fromBalance: enumField("Where the sender's balance is held", ['base', 'ephemeral']),
      toBalance: enumField('Where the recipient should receive funds', ['base', 'ephemeral']),
      cluster: stringField("Cluster: 'mainnet', 'devnet', or custom RPC URL"),
      validator: stringField('Optional ER validator pubkey'),
      authToken: stringField('Bearer token from login (required for private transfers)'),
      initIfMissing: booleanField('Initialize transfer queue if missing (default true)'),
      initAtasIfMissing: booleanField('Initialize recipient ATA if missing (default true)'),
      initVaultIfMissing: booleanField('Initialize vault if missing (default false)'),
      memo: stringField('Optional memo appended to the transaction'),
      minDelayMs: stringField("Private only. Earliest (ms) the queued transfer may settle. Default '0'"),
      maxDelayMs: stringField('Private only. Latest (ms) the queued transfer may settle (<= 600000)'),
      clientRefId: stringField('Private only. Encrypted client reference ID for payment confirmation'),
      split: numberField('Private only. Number of queue entries to split across (1-15, default 1)'),
      gasless: booleanField('When true, uses configured sponsor as fee payer (default false)'),
      legacy: booleanField('Skip lookup-table compilation, return a legacy transaction (default false)'),
    }, ['from', 'to', 'mint', 'amount', 'visibility', 'fromBalance', 'toBalance']),
    async (input) => {
      try {
        const authToken = input.authToken as string | undefined;
        const body: Record<string, unknown> = {
          from: input.from,
          to: input.to,
          mint: input.mint,
          amount: input.amount,
          visibility: input.visibility,
          fromBalance: input.fromBalance,
          toBalance: input.toBalance,
          ...stripNullish({
            cluster: input.cluster,
            validator: input.validator,
            initIfMissing: input.initIfMissing,
            initAtasIfMissing: input.initAtasIfMissing,
            initVaultIfMissing: input.initVaultIfMissing,
            memo: input.memo,
            minDelayMs: input.minDelayMs,
            maxDelayMs: input.maxDelayMs,
            clientRefId: input.clientRefId,
            split: input.split,
            gasless: input.gasless,
            legacy: input.legacy,
          }, ['authToken']),
        };
        const result = await apiPost('/v1/spl/transfer', body, authToken);
        return success(result, 'magicblock_transfer');
      } catch (e) { return handleError('magicblock_transfer', e); }
    },
  );

  tool('magicblock_withdraw',
    'Build an unsigned transaction to withdraw SPL tokens from an Ephemeral Rollup back to Solana. Price: $0.05.',
    schema({
      owner: pubkeyField('Wallet pubkey that owns the tokens and will sign'),
      mint: stringField('SPL mint on Solana'),
      amount: numberField('Base-unit amount to withdraw (integer, minimum 1)'),
      cluster: stringField("Cluster: 'mainnet', 'devnet', or custom RPC URL"),
      validator: stringField('Optional ER validator pubkey'),
      initIfMissing: booleanField('Initialize transfer queue if missing (default true)'),
      initAtasIfMissing: booleanField('Initialize ATAs if missing (default true)'),
      escrowIndex: numberField('Optional escrow index for the withdrawal'),
      idempotent: booleanField('Use idempotent variants for preparatory init instructions (default true)'),
    }, ['owner', 'mint', 'amount']),
    async (input) => {
      try {
        const result = await apiPost('/v1/spl/withdraw', {
          owner: input.owner,
          mint: input.mint,
          amount: input.amount,
          ...stripNullish({
            cluster: input.cluster,
            validator: input.validator,
            initIfMissing: input.initIfMissing,
            initAtasIfMissing: input.initAtasIfMissing,
            escrowIndex: input.escrowIndex,
            idempotent: input.idempotent,
          }),
        });
        return success(result, 'magicblock_withdraw');
      } catch (e) { return handleError('magicblock_withdraw', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  Private Payment API — Swap (2 tools: 1 read + 1 write)
  // ═══════════════════════════════════════════════════════════════

  tool('magicblock_swapQuote',
    'Get a swap quote between two SPL mints (proxies Triton Metis swap API). Pass the result into magicblock_swap. Price: $0.01.',
    schema({
      inputMint: stringField('Input token mint address'),
      outputMint: stringField('Output token mint address'),
      amount: stringField("Raw amount to swap (unsigned integer string, e.g. '1000000')"),
      slippageBps: numberField('Slippage threshold in basis points (e.g. 50 = 0.5%)'),
      swapMode: enumField('Swap mode: fixed input or fixed output amount', ['ExactIn', 'ExactOut']),
      onlyDirectRoutes: booleanField('Limit routing to a single hop (default false)'),
      restrictIntermediateTokens: booleanField('Restrict intermediate tokens to a more stable set (default false)'),
      platformFeeBps: numberField('Optional platform fee in basis points'),
      maxAccounts: numberField('Approximate maximum account budget for the route (default 64)'),
    }, ['inputMint', 'outputMint', 'amount']),
    async (input) => {
      try {
        const result = await apiGet('/v1/swap/quote', {
          inputMint: input.inputMint as string,
          outputMint: input.outputMint as string,
          amount: input.amount as string,
          slippageBps: input.slippageBps != null ? String(input.slippageBps) : undefined,
          swapMode: input.swapMode as string | undefined,
          onlyDirectRoutes: input.onlyDirectRoutes ? 'true' : undefined,
          restrictIntermediateTokens: input.restrictIntermediateTokens ? 'true' : undefined,
          platformFeeBps: input.platformFeeBps != null ? String(input.platformFeeBps) : undefined,
          maxAccounts: input.maxAccounts != null ? String(input.maxAccounts) : undefined,
        });
        return success(result, 'magicblock_swapQuote');
      } catch (e) { return handleError('magicblock_swapQuote', e); }
    },
  );

  tool('magicblock_swap',
    "Build an unsigned swap transaction from a quote. 'public' mode passes through Jupiter, 'private' mode routes output through a scheduled private transfer with delay and split. Price: $0.05.",
    schema({
      userPublicKey: pubkeyField('Wallet that will sign the swap transaction'),
      quoteResponse: { type: 'object', description: 'Quote response object from magicblock_swapQuote (pass as-is)', additionalProperties: true },
      visibility: enumField("'public' = transparent Jupiter pass-through, 'private' = output routed through scheduled private transfer", ['public', 'private']),
      destination: pubkeyField("Final private-transfer recipient (required when visibility='private')"),
      minDelayMs: stringField("Private only. Earliest (ms) the queued transfer may settle"),
      maxDelayMs: stringField("Private only. Latest (ms) the queued transfer may settle (<= 600000)"),
      split: numberField('Private only. Number of queue entries to split across (1-14)'),
      clientRefId: stringField('Private only. Optional u64 client correlation ID'),
      validator: stringField('Optional validator pubkey for the transfer-queue PDA'),
      wrapAndUnwrapSol: booleanField('Auto wrap/unwrap native SOL when needed (default true)'),
      asLegacyTransaction: booleanField('Build a legacy transaction (not allowed when visibility=private, default false)'),
    }, ['userPublicKey', 'quoteResponse']),
    async (input) => {
      try {
        const result = await apiPost('/v1/swap/swap', {
          userPublicKey: input.userPublicKey,
          quoteResponse: input.quoteResponse,
          ...stripNullish({
            visibility: input.visibility,
            destination: input.destination,
            minDelayMs: input.minDelayMs,
            maxDelayMs: input.maxDelayMs,
            split: input.split,
            clientRefId: input.clientRefId,
            validator: input.validator,
            wrapAndUnwrapSol: input.wrapAndUnwrapSol,
            asLegacyTransaction: input.asLegacyTransaction,
          }),
        });
        return success(result, 'magicblock_swap');
      } catch (e) { return handleError('magicblock_swap', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  Private Payment API — Mint Init (2 tools: 1 write + 1 read)
  // ═══════════════════════════════════════════════════════════════

  tool('magicblock_initializeMint',
    'Build an unsigned transaction that initializes a validator-scoped transfer queue for a mint. Price: $0.05.',
    schema({
      owner: pubkeyField('Wallet pubkey that will sign the transaction'),
      mint: stringField('SPL mint to initialize a transfer queue for'),
      cluster: stringField("Cluster: 'mainnet', 'devnet', or custom RPC URL"),
      validator: stringField('Optional ER validator pubkey'),
    }, ['owner', 'mint']),
    async (input) => {
      try {
        const result = await apiPost('/v1/spl/initialize-mint', {
          owner: input.owner,
          mint: input.mint,
          ...stripNullish({
            cluster: input.cluster,
            validator: input.validator,
          }),
        });
        return success(result, 'magicblock_initializeMint');
      } catch (e) { return handleError('magicblock_initializeMint', e); }
    },
  );

  tool('magicblock_isMintInitialized',
    'Check whether a mint has a validator-scoped transfer queue on the ephemeral RPC. Price: $0.01.',
    schema({
      mint: stringField('SPL mint to check'),
      cluster: stringField("Cluster: 'mainnet', 'devnet', or custom RPC URL"),
      validator: stringField('Optional ER validator pubkey'),
    }, ['mint']),
    async (input) => {
      try {
        const result = await apiGet<{ initialized: boolean }>('/v1/spl/is-mint-initialized', {
          mint: input.mint as string,
          cluster: input.cluster as string | undefined,
          validator: input.validator as string | undefined,
        });
        return success(result, 'magicblock_isMintInitialized');
      } catch (e) { return handleError('magicblock_isMintInitialized', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  VRF (2 tools — scaffolded, throws until SDK is installed)
  // ═══════════════════════════════════════════════════════════════

  tool('magicblock_requestRandomness',
    'Request provably fair on-chain randomness from the MagicBlock VRF oracle. Specify a seed, callback discriminator, and callback accounts. Price: $0.05. NOTE: Requires @magicblock-labs/ephemeral-vrf-sdk to be installed.',
    schema({
      callerSeed: stringField('Seed string for the VRF request (committed before randomness is produced)'),
      callbackDiscriminator: stringField('Base58 discriminator for the callback instruction in your program'),
      callbackAccounts: arrayField('Accounts to pass to the callback instruction', pubkeyField('Account pubkey')),
      endpoint: endpointField,
    }, ['callerSeed', 'callbackDiscriminator', 'callbackAccounts']),
    async () => {
      return createTextResponse(JSON.stringify({
        error: 'VRF requestRandomness not yet implemented',
        message: 'Install @magicblock-labs/ephemeral-vrf-sdk and wire it into the tool handler.',
      }, null, 2), { isError: true });
    },
  );

  tool('magicblock_getRandomnessResult',
    'Check whether a VRF request has been fulfilled and retrieve the random bytes and cryptographic proof. Price: $0.01. NOTE: Requires @magicblock-labs/ephemeral-vrf-sdk to be installed.',
    schema({
      requestKey: stringField('VRF request key from magicblock_requestRandomness'),
      endpoint: endpointField,
    }, ['requestKey']),
    async () => {
      return createTextResponse(JSON.stringify({
        error: 'VRF getRandomnessResult not yet implemented',
        message: 'Install @magicblock-labs/ephemeral-vrf-sdk and wire it into the tool handler.',
      }, null, 2), { isError: true });
    },
  );

  logger.debug('MagicBlock tools registered', { count: registered });
}