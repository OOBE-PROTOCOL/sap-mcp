/**
 * MagicBlock MCP Tools
 *
 * Registers 20 MagicBlock tools across 3 protocol domains:
 *   - mb-router   (6 read-only ER Router JSON-RPC tools)
 *   - mb-payments (12 Private Payment API REST tools)
 *   - mb-vrf      (2 Solana VRF tools — on-chain via @solana/web3.js)
 *
 * Pricing:
 *   READ  = hosted read-premium tier — lightweight discovery, quote, and state tools.
 *   BUILD = hosted builder/value-action tiers — transaction-building or value-moving tools.
 *
 * Write tools (deposit, transfer, withdraw, swap, initializeMint) return
 * unsigned transactions. Agents must use sap_preview_transaction,
 * sap_sign_transaction, and sap_submit_signed_transaction. Do not create
 * temporary signing scripts or read local keypair files.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey, TransactionInstruction, Transaction, SystemProgram } from '@solana/web3.js';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { logger } from '../core/logger.js';

// ═══════════════════════════════════════════════════════════════════
//  Shared Types
// ═══════════════════════════════════════════════════════════════════

type RouterEndpoint = 'mainnet' | 'devnet';
type Visibility = 'public' | 'private';
type BalanceLocation = 'base' | 'ephemeral';
type SwapMode = 'ExactIn' | 'ExactOut';
type Encoding = 'base64' | 'base64+zstd';

/** JSON Schema property definition for MCP tool input schemas. */
interface JsonSchemaProperty {
  readonly type: string;
  readonly description: string;
  readonly enum?: readonly string[];
  readonly items?: JsonSchemaProperty;
  readonly properties?: Record<string, JsonSchemaProperty>;
  readonly additionalProperties?: boolean;
}

/** Complete JSON Schema object for an MCP tool input. */
interface JsonSchema {
  readonly type: 'object';
  readonly properties: Record<string, JsonSchemaProperty>;
  readonly required?: readonly string[];
}

/** VRF callback account metadata. */
interface CallbackAccountMeta {
  readonly pubkey: string;
  readonly isSigner?: boolean;
  readonly isWritable?: boolean;
}

// ─── ER Router Response Types ─────────────────────────────────────

interface ErRoute {
  readonly identity: string;
  readonly fqdn: string;
  readonly baseFee: number;
  readonly blockTimeMs: number;
  readonly countryCode: string;
}

interface ErIdentity {
  readonly identity: string;
  readonly fqdn: string;
}

interface DelegationRecord {
  readonly authority: string;
  readonly owner: string;
  readonly delegationSlot: number;
  readonly lamports: number;
}

interface DelegationStatus {
  readonly isDelegated: boolean;
  readonly fqdn?: string;
  readonly delegationRecord?: DelegationRecord;
}

interface AccountInfoValue {
  readonly data: readonly string[];
  readonly executable: boolean;
  readonly lamports: number;
  readonly owner: string;
  readonly rentEpoch: string;
  readonly space: number;
}

interface AccountInfoResponse {
  readonly context: { readonly apiVersion: string; readonly slot: number };
  readonly value: AccountInfoValue;
}

interface BlockhashResponse {
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
}

interface SignatureStatusEntry {
  readonly confirmationStatus?: 'finalized' | 'confirmed' | 'processed';
  readonly confirmations?: number | null;
  readonly err?: unknown;
  readonly slot?: number;
}

interface SignatureStatusesResponse {
  readonly context: { readonly apiVersion: string; readonly slot: number };
  readonly value: readonly SignatureStatusEntry[];
}

// ─── Private Payment API Response Types ───────────────────────────

interface HealthResponse {
  readonly status: string;
}

interface ChallengeResponse {
  readonly challenge: string;
}

interface LoginResponse {
  readonly token: string;
}

interface BalanceResponse {
  readonly address: string;
  readonly mint: string;
  readonly ata: string;
  readonly location: BalanceLocation;
  readonly balance: string;
}

interface UnsignedTransactionResponse {
  readonly kind: string;
  readonly version: 'legacy' | 'v0';
  readonly transactionBase64: string;
  readonly sendTo: 'base' | 'ephemeral';
  readonly recentBlockhash: string;
  readonly lastValidBlockHeight: number;
  readonly instructionCount: number;
  readonly requiredSigners: readonly string[];
  readonly validator?: string;
}

interface SwapQuoteResponse {
  readonly inputMint: string;
  readonly inAmount: string;
  readonly outputMint: string;
  readonly outAmount: string;
  readonly otherAmountThreshold: string;
  readonly swapMode: SwapMode;
  readonly slippageBps: number;
  readonly priceImpactPct: string;
  readonly routePlan: readonly unknown[];
  readonly contextSlot: number;
  readonly timeTaken: number;
  readonly [key: string]: unknown;
}

interface SwapTransactionResponse {
  readonly swapTransaction: string;
  readonly lastValidBlockHeight: number;
  readonly prioritizationFeeLamports?: number;
  readonly privateTransfer?: {
    readonly stashAta: string;
    readonly hydraCrankPda: string;
    readonly shuttleId: number;
  };
  readonly [key: string]: unknown;
}

interface MintInitStatusResponse {
  readonly initialized: boolean;
}

// ─── VRF Response Types ───────────────────────────────────────────

interface VrfRequestResult {
  readonly requestKey: string;
  readonly vrfProgramId: string;
  readonly oracleQueue: string;
  readonly transactionBase64: string;
  readonly sendTo: 'base';
  readonly callbackProgramId: string;
  readonly callerSeedHash: string;
  readonly note: string;
}

interface VrfRandomnessResult {
  readonly fulfilled: boolean;
  readonly requestKey: string;
  readonly randomness: readonly number[] | null;
  readonly randomnessHex: string | null;
  readonly callerSeed: string;
  readonly owner: string;
  readonly lamports: number;
  readonly executable: boolean;
  readonly rentEpoch: number | undefined;
  readonly dataLength: number;
  readonly message: string;
}

// ─── Tool Input Interfaces ────────────────────────────────────────

interface EndpointInput { readonly endpoint?: RouterEndpoint }
interface AccountInput { readonly account: string; readonly endpoint?: RouterEndpoint }
interface AccountsInput { readonly accounts: readonly string[]; readonly endpoint?: RouterEndpoint }
interface SignaturesInput { readonly signatures: readonly string[]; readonly endpoint?: RouterEndpoint }
interface AccountInfoInput { readonly account: string; readonly encoding?: Encoding; readonly endpoint?: RouterEndpoint }

interface ChallengeInput { readonly pubkey: string; readonly cluster?: string }
interface LoginInput { readonly pubkey: string; readonly challenge: string; readonly signature: string; readonly cluster?: string }
interface BalanceInput { readonly address: string; readonly mint: string; readonly cluster?: string }
interface PrivateBalanceInput { readonly address: string; readonly mint: string; readonly cluster?: string; readonly authToken: string }

interface DepositInput {
  readonly owner: string;
  readonly amount: number;
  readonly mint?: string;
  readonly cluster?: string;
  readonly validator?: string;
  readonly initIfMissing?: boolean;
  readonly initVaultIfMissing?: boolean;
  readonly initAtasIfMissing?: boolean;
  readonly idempotent?: boolean;
}

interface TransferInput {
  readonly from: string;
  readonly to: string;
  readonly mint: string;
  readonly amount: number;
  readonly visibility: Visibility;
  readonly fromBalance: BalanceLocation;
  readonly toBalance: BalanceLocation;
  readonly cluster?: string;
  readonly validator?: string;
  readonly authToken?: string;
  readonly initIfMissing?: boolean;
  readonly initAtasIfMissing?: boolean;
  readonly initVaultIfMissing?: boolean;
  readonly memo?: string;
  readonly minDelayMs?: string;
  readonly maxDelayMs?: string;
  readonly clientRefId?: string;
  readonly split?: number;
  readonly gasless?: boolean;
  readonly legacy?: boolean;
}

interface WithdrawInput {
  readonly owner: string;
  readonly mint: string;
  readonly amount: number;
  readonly cluster?: string;
  readonly validator?: string;
  readonly initIfMissing?: boolean;
  readonly initAtasIfMissing?: boolean;
  readonly escrowIndex?: number;
  readonly idempotent?: boolean;
}

interface SwapQuoteInput {
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amount: string;
  readonly slippageBps?: number;
  readonly swapMode?: SwapMode;
  readonly onlyDirectRoutes?: boolean;
  readonly restrictIntermediateTokens?: boolean;
  readonly platformFeeBps?: number;
  readonly maxAccounts?: number;
}

interface SwapInput {
  readonly userPublicKey: string;
  readonly quoteResponse: SwapQuoteResponse;
  readonly visibility?: Visibility;
  readonly destination?: string;
  readonly minDelayMs?: string;
  readonly maxDelayMs?: string;
  readonly split?: number;
  readonly clientRefId?: string;
  readonly validator?: string;
  readonly wrapAndUnwrapSol?: boolean;
  readonly asLegacyTransaction?: boolean;
}

interface InitializeMintInput {
  readonly owner: string;
  readonly mint: string;
  readonly cluster?: string;
  readonly validator?: string;
}

interface IsMintInitializedInput {
  readonly mint: string;
  readonly cluster?: string;
  readonly validator?: string;
}

interface VrfRequestInput {
  readonly payer: string;
  readonly callbackProgramId: string;
  readonly callbackDiscriminator: string;
  readonly callerSeed: string;
  readonly callbackAccounts: readonly CallbackAccountMeta[];
  readonly ephemeral?: boolean;
  readonly endpoint?: RouterEndpoint;
}

interface VrfResultInput {
  readonly requestKey: string;
  readonly endpoint?: RouterEndpoint;
}

// ─── Pricing Response ─────────────────────────────────────────────

interface ToolSuccessResponse<T> {
  readonly success: true;
  readonly tool: string;
  readonly hostedPricing: string;
  readonly data: T;
}

interface ToolErrorResponse {
  readonly error: string;
  readonly message: string;
}

// ═══════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════

const ROUTER_ENDPOINTS: Readonly<Record<RouterEndpoint, string>> = {
  mainnet: 'https://router.magicblock.app',
  devnet: 'https://devnet-router.magicblock.app',
};

const PAYMENTS_ENDPOINT = 'https://payments.magicblock.app';
const JSONRPC_VERSION = '2.0';

// ─── VRF Program Constants (from ephemeral_vrf_sdk::consts) ───────

const VRF_PROGRAM_ID = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
const VRF_PROGRAM_IDENTITY = new PublicKey('9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw');
const DEFAULT_QUEUE = new PublicKey('Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh');
const DEFAULT_EPHEMERAL_QUEUE = new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc');

const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

// ═══════════════════════════════════════════════════════════════════
//  HTTP Helpers (stateless — zero external deps, uses global fetch)
// ═══════════════════════════════════════════════════════════════════

interface JsonRpcResponse<T> {
  readonly result?: T;
  readonly error?: { readonly code: number; readonly message: string };
}

async function rpcCall<T>(
  endpoint: RouterEndpoint,
  method: string,
  params: readonly unknown[],
): Promise<T> {
  const url = ROUTER_ENDPOINTS[endpoint];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: JSONRPC_VERSION, id: 1, method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MagicBlock Router ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as JsonRpcResponse<T>;
  if (json.error) throw new Error(`JSON-RPC error ${json.error.code}: ${json.error.message}`);
  if (!json.result) throw new Error(`JSON-RPC response missing result for ${method}`);
  return json.result;
}

type QueryParams = Record<string, string | undefined>;

async function apiGet<T>(path: string, query?: QueryParams, authToken?: string): Promise<T> {
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

async function apiPost<T>(path: string, body: object, authToken?: string): Promise<T> {
  const url = PAYMENTS_ENDPOINT + path;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`MagicBlock API ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

/** Strip nullish values from an object. Returns a new object with only non-null values. */
function stripNullish<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj) as [keyof T, T[keyof T]][]) {
    if (value != null) result[key] = value;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
//  JSON Schema Helpers
// ═══════════════════════════════════════════════════════════════════

function schema(properties: Record<string, JsonSchemaProperty>, required?: readonly string[]): JsonSchema {
  return {
    type: 'object',
    properties,
    ...(required && required.length > 0 ? { required } : {}),
  };
}

const f = {
  pubkey: (d: string): JsonSchemaProperty => ({ type: 'string', description: d }),
  string: (d: string): JsonSchemaProperty => ({ type: 'string', description: d }),
  number: (d: string): JsonSchemaProperty => ({ type: 'number', description: d }),
  boolean: (d: string): JsonSchemaProperty => ({ type: 'boolean', description: d }),
  enum: (d: string, values: readonly string[]): JsonSchemaProperty => ({ type: 'string', enum: values, description: d }),
  array: (d: string, items: JsonSchemaProperty): JsonSchemaProperty => ({ type: 'array', items, description: d }),
  object: (d: string, props: Record<string, JsonSchemaProperty>): JsonSchemaProperty => ({ type: 'object', properties: props, description: d }),
};

const endpointField = f.enum("MagicBlock Router endpoint: 'mainnet' or 'devnet'", ['mainnet', 'devnet']);
const clusterField = f.string("Cluster: 'mainnet', 'devnet', or custom RPC URL");
const validatorField = f.string('Optional ER validator pubkey. Defaults to the selected ephemeral RPC identity.');

function requireValidPubkey(value: string | undefined, fieldName: string): void {
  if (!value) {
    throw new Error(`missing_required_field: ${fieldName}`);
  }

  try {
    void new PublicKey(value);
  } catch {
    throw new Error(`invalid_solana_pubkey: ${fieldName}`);
  }
}

function requirePositiveSafeInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer in token base units`);
  }
}

function isWrappedSolMint(mint: string | undefined): boolean {
  return mint === WRAPPED_SOL_MINT;
}

function validateMagicBlockTransferInput(input: TransferInput): void {
  requireValidPubkey(input.from, 'from');
  requireValidPubkey(input.to, 'to');
  requireValidPubkey(input.mint, 'mint');
  requirePositiveSafeInteger(input.amount, 'amount');

  if (input.visibility === 'private' && !input.authToken) {
    throw new Error('magicblock_private_transfer_auth_required: call magicblock_challenge and magicblock_login first, then pass authToken.');
  }
}

function validateMagicBlockSwapInput(input: SwapInput): void {
  requireValidPubkey(input.userPublicKey, 'userPublicKey');

  if (input.visibility !== 'private') {
    return;
  }

  requireValidPubkey(input.destination, 'destination');

  if (isWrappedSolMint(input.quoteResponse?.outputMint)) {
    throw new Error(
      'magicblock_private_swap_wsol_output_blocked: private swaps that output wSOL are disabled because live mainnet testing found Hydra delivery can leave wSOL stuck in the mixer pool. Use visibility="public", swap into a non-SOL SPL token, or wait for MagicBlock shuttle delivery recovery support.',
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Registration
// ═══════════════════════════════════════════════════════════════════

/**
 * @name registerMagicBlockTools
 * @description Registers 20 MagicBlock tools (ER Router, Private Payments, VRF)
 *   with the MCP server. Hosted pricing is resolved centrally by src/payments/pricing.ts.
 * @param server - MCP server receiving tool definitions and handlers.
 * @param context - Shared runtime context (VRF getRandomnessResult uses the Solana connection).
 */
export function registerMagicBlockTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering MagicBlock tools');
  let registered = 0;

  function register<TInput extends object>(
    name: string,
    description: string,
    inputSchema: JsonSchema,
    handler: (input: TInput) => Promise<unknown>,
  ): void {
    registerTool(server, name, { title: name.replace(/_/g, ' '), description, inputSchema }, handler);
    registered++;
  }

  function handleError(toolName: string, error: unknown) {
    logger.error(`MagicBlock tool failed: ${toolName}`, { error });
    const errorResponse: ToolErrorResponse = {
      error: `MagicBlock tool ${toolName} failed`,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    return createTextResponse(JSON.stringify(errorResponse, null, 2), { isError: true });
  }

  function success<T>(data: T, toolName: string) {
    const response: ToolSuccessResponse<T> = {
      success: true,
      tool: toolName,
      hostedPricing: 'Resolved by the SAP MCP x402/payment gate. Use sap_x402_estimate_cost or sap_payments_call_paid_tool maxPriceUsd; do not rely on MagicBlock response payload pricing.',
      data,
    };
    return createTextResponse(JSON.stringify(response, null, 2));
  }

  function parseInput<T extends object>(raw: unknown): T {
    return raw as T;
  }

  // ═══════════════════════════════════════════════════════════════
  //  ER Router (6 read-only tools)
  // ═══════════════════════════════════════════════════════════════

  register<EndpointInput>('magicblock_getRoutes',
    'List available Ephemeral Rollup nodes from the Magic Router (identity, FQDN, fee, block time, country)..',
    schema({ endpoint: endpointField }),
    async (raw) => {
      try {
        const { endpoint = 'devnet' } = parseInput<EndpointInput>(raw);
        const routes = await rpcCall<readonly ErRoute[]>(endpoint, 'getRoutes', []);
        return success({ routes }, 'magicblock_getRoutes');
      } catch (e) { return handleError('magicblock_getRoutes', e); }
    },
  );

  register<EndpointInput>('magicblock_getIdentity',
    'Get the identity and FQDN of the current ER Validator node..',
    schema({ endpoint: endpointField }),
    async (raw) => {
      try {
        const { endpoint = 'devnet' } = parseInput<EndpointInput>(raw);
        const identity = await rpcCall<ErIdentity>(endpoint, 'getIdentity', []);
        return success(identity, 'magicblock_getIdentity');
      } catch (e) { return handleError('magicblock_getIdentity', e); }
    },
  );

  register<AccountInput>('magicblock_getDelegationStatus',
    'Check whether a Solana account is delegated to an Ephemeral Rollup. Returns authority, owner, delegation slot, and lamports..',
    schema({ account: f.pubkey('Account pubkey to check delegation status for'), endpoint: endpointField }, ['account']),
    async (raw) => {
      try {
        const { account, endpoint = 'devnet' } = parseInput<AccountInput>(raw);
        const status = await rpcCall<DelegationStatus>(endpoint, 'getDelegationStatus', [account]);
        return success(status, 'magicblock_getDelegationStatus');
      } catch (e) { return handleError('magicblock_getDelegationStatus', e); }
    },
  );

  register<AccountInfoInput>('magicblock_getAccountInfo',
    'Fetch account information (data, lamports, owner, executable, space) via the Magic Router..',
    schema({ account: f.pubkey('Account pubkey to fetch info for'), encoding: f.enum('Encoding for account data', ['base64', 'base64+zstd']), endpoint: endpointField }, ['account']),
    async (raw) => {
      try {
        const { account, encoding = 'base64', endpoint = 'devnet' } = parseInput<AccountInfoInput>(raw);
        const info = await rpcCall<AccountInfoResponse>(endpoint, 'getAccountInfo', [account, { encoding }]);
        return success(info, 'magicblock_getAccountInfo');
      } catch (e) { return handleError('magicblock_getAccountInfo', e); }
    },
  );

  register<AccountsInput>('magicblock_getBlockhashForAccounts',
    'Get a blockhash and last valid block height for a batch of account addresses (max 100)..',
    schema({ accounts: f.array('Array of account addresses (max 100)', f.pubkey('Account pubkey')), endpoint: endpointField }, ['accounts']),
    async (raw) => {
      try {
        const { accounts, endpoint = 'devnet' } = parseInput<AccountsInput>(raw);
        const blockhash = await rpcCall<BlockhashResponse>(endpoint, 'getBlockhashForAccounts', [accounts]);
        return success(blockhash, 'magicblock_getBlockhashForAccounts');
      } catch (e) { return handleError('magicblock_getBlockhashForAccounts', e); }
    },
  );

  register<SignaturesInput>('magicblock_getSignatureStatuses',
    'Check the confirmation status (processed/confirmed/finalized) of one or more transaction signatures..',
    schema({ signatures: f.array('Array of transaction signatures', f.string('Transaction signature (base58)')), endpoint: endpointField }, ['signatures']),
    async (raw) => {
      try {
        const { signatures, endpoint = 'devnet' } = parseInput<SignaturesInput>(raw);
        const statuses = await rpcCall<SignatureStatusesResponse>(endpoint, 'getSignatureStatuses', [signatures]);
        return success(statuses, 'magicblock_getSignatureStatuses');
      } catch (e) { return handleError('magicblock_getSignatureStatuses', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  Private Payment API — Meta & Auth (3 tools)
  // ═══════════════════════════════════════════════════════════════

  register<Record<string, never>>('magicblock_health',
    'Check the health status of the MagicBlock Private Payments API..',
    schema({}),
    async () => {
      try {
        const health = await apiGet<HealthResponse>('/health');
        return success(health, 'magicblock_health');
      } catch (e) { return handleError('magicblock_health', e); }
    },
  );

  register<ChallengeInput>('magicblock_challenge',
    'Generate a challenge string for the wallet to sign (step 1 of the PER auth flow)..',
    schema({ pubkey: f.pubkey('Wallet pubkey that will sign the challenge'), cluster: clusterField }, ['pubkey']),
    async (raw) => {
      try {
        const { pubkey, cluster } = parseInput<ChallengeInput>(raw);
        const result = await apiGet<ChallengeResponse>('/v1/spl/challenge', {
          pubkey, cluster: cluster ?? undefined,
        });
        return success(result, 'magicblock_challenge');
      } catch (e) { return handleError('magicblock_challenge', e); }
    },
  );

  register<LoginInput>('magicblock_login',
    'Exchange a signed challenge for a bearer token (step 2 of PER auth flow). The token is used for private-balance and private transfers..',
    schema({ pubkey: f.pubkey('Wallet pubkey that signed the challenge'), challenge: f.string('Challenge string from magicblock_challenge'), signature: f.string('Wallet signature over the challenge string'), cluster: clusterField }, ['pubkey', 'challenge', 'signature']),
    async (raw) => {
      try {
        const { pubkey, challenge, signature, cluster } = parseInput<LoginInput>(raw);
        const result = await apiPost<LoginResponse>('/v1/spl/login', {
          pubkey, challenge, signature, cluster: cluster ?? undefined,
        });
        return success(result, 'magicblock_login');
      } catch (e) { return handleError('magicblock_login', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  Private Payment API — Balance (2 tools)
  // ═══════════════════════════════════════════════════════════════

  register<BalanceInput>('magicblock_balance',
    'Read the base-chain SPL token balance for an address (public, no auth required)..',
    schema({ address: f.pubkey('Owner wallet pubkey'), mint: f.string('SPL mint pubkey'), cluster: clusterField }, ['address', 'mint']),
    async (raw) => {
      try {
        const { address, mint, cluster } = parseInput<BalanceInput>(raw);
        const result = await apiGet<BalanceResponse>('/v1/spl/balance', { address, mint, cluster: cluster ?? undefined });
        return success(result, 'magicblock_balance');
      } catch (e) { return handleError('magicblock_balance', e); }
    },
  );

  register<PrivateBalanceInput>('magicblock_privateBalance',
    'Read the ephemeral-rollup SPL token balance for an address (requires bearer token from login)..',
    schema({ address: f.pubkey('Owner wallet pubkey'), mint: f.string('SPL mint pubkey'), cluster: clusterField, authToken: f.string('Bearer token from magicblock_login (required for private reads)') }, ['address', 'mint', 'authToken']),
    async (raw) => {
      try {
        const { address, mint, cluster, authToken } = parseInput<PrivateBalanceInput>(raw);
        const result = await apiGet<BalanceResponse>('/v1/spl/private-balance', { address, mint, cluster: cluster ?? undefined }, authToken);
        return success(result, 'magicblock_privateBalance');
      } catch (e) { return handleError('magicblock_privateBalance', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  Private Payment API — SPL Token Flows (3 write tools)
  // ═══════════════════════════════════════════════════════════════

  register<DepositInput>('magicblock_deposit',
    'Build an unsigned transaction to deposit SPL tokens from Solana into an Ephemeral Rollup. Then use sap_preview_transaction, sap_sign_transaction, and sap_submit_signed_transaction. Do not create local signing scripts. Builder fee applies.',
    schema({ owner: f.pubkey('Wallet pubkey that owns the tokens and will sign'), amount: f.number('Base-unit amount to deposit (integer, minimum 1)'), mint: f.string('SPL mint. Defaults to USDC (mainnet) or devnet USDC'), cluster: clusterField, validator: validatorField, initIfMissing: f.boolean('Initialize the transfer queue if missing (default true)'), initVaultIfMissing: f.boolean('Initialize the vault if missing (default true)'), initAtasIfMissing: f.boolean('Initialize associated token accounts if missing (default true)'), idempotent: f.boolean('Use idempotent variants for preparatory init instructions (default true)') }, ['owner', 'amount']),
    async (raw) => {
      try {
        const input = parseInput<DepositInput>(raw);
        const result = await apiPost<UnsignedTransactionResponse>('/v1/spl/deposit', {
          owner: input.owner, amount: input.amount, ...stripNullish({
            mint: input.mint, cluster: input.cluster, validator: input.validator,
            initIfMissing: input.initIfMissing, initVaultIfMissing: input.initVaultIfMissing,
            initAtasIfMissing: input.initAtasIfMissing, idempotent: input.idempotent,
          }),
        });
        return success(result, 'magicblock_deposit');
      } catch (e) { return handleError('magicblock_deposit', e); }
    },
  );

  register<TransferInput>('magicblock_transfer',
    'Build an unsigned SPL token transfer (public or private) through an Ephemeral Rollup. Supports base/ephemeral source and destination, delayed settlement, split transfers, and gasless mode. Then use sap_preview_transaction, sap_sign_transaction, and sap_submit_signed_transaction. Builder fee applies.',
    schema({
      from: f.pubkey('Sender wallet pubkey'), to: f.pubkey('Recipient wallet pubkey'), mint: f.string('SPL mint pubkey'),
      amount: f.number('Base-unit amount to transfer (integer, minimum 1)'),
      visibility: f.enum("'public' = transparent SPL transfer, 'private' = routed through Private ER with delayed+split settlement", ['public', 'private']),
      fromBalance: f.enum("Where the sender's balance is held", ['base', 'ephemeral']),
      toBalance: f.enum('Where the recipient should receive funds', ['base', 'ephemeral']),
      cluster: clusterField, validator: f.string('Optional ER validator pubkey'),
      authToken: f.string('Bearer token from login (required for private transfers)'),
      initIfMissing: f.boolean('Initialize transfer queue if missing (default true)'),
      initAtasIfMissing: f.boolean('Initialize recipient ATA if missing (default true)'),
      initVaultIfMissing: f.boolean('Initialize vault if missing (default false)'),
      memo: f.string('Optional memo appended to the transaction'),
      minDelayMs: f.string("Private only. Earliest (ms) the queued transfer may settle. Default '0'"),
      maxDelayMs: f.string('Private only. Latest (ms) the queued transfer may settle (<= 600000)'),
      clientRefId: f.string('Private only. Encrypted client reference ID for payment confirmation'),
      split: f.number('Private only. Number of queue entries to split across (1-15, default 1)'),
      gasless: f.boolean('When true, uses configured sponsor as fee payer (default false)'),
      legacy: f.boolean('Skip lookup-table compilation, return a legacy transaction (default false)'),
    }, ['from', 'to', 'mint', 'amount', 'visibility', 'fromBalance', 'toBalance']),
    async (raw) => {
      try {
        const input = parseInput<TransferInput>(raw);
        validateMagicBlockTransferInput(input);
        const result = await apiPost<UnsignedTransactionResponse>('/v1/spl/transfer', {
          from: input.from, to: input.to, mint: input.mint, amount: input.amount,
          visibility: input.visibility, fromBalance: input.fromBalance, toBalance: input.toBalance,
          ...stripNullish({
            cluster: input.cluster, validator: input.validator,
            initIfMissing: input.initIfMissing, initAtasIfMissing: input.initAtasIfMissing,
            initVaultIfMissing: input.initVaultIfMissing, memo: input.memo,
            minDelayMs: input.minDelayMs, maxDelayMs: input.maxDelayMs,
            clientRefId: input.clientRefId, split: input.split,
            gasless: input.gasless, legacy: input.legacy,
          }),
        }, input.authToken);
        return success(result, 'magicblock_transfer');
      } catch (e) { return handleError('magicblock_transfer', e); }
    },
  );

  register<WithdrawInput>('magicblock_withdraw',
    'Build an unsigned transaction to withdraw SPL tokens from an Ephemeral Rollup back to Solana. Then use sap_preview_transaction, sap_sign_transaction, and sap_submit_signed_transaction. Builder fee applies.',
    schema({ owner: f.pubkey('Wallet pubkey that owns the tokens and will sign'), mint: f.string('SPL mint on Solana'), amount: f.number('Base-unit amount to withdraw (integer, minimum 1)'), cluster: clusterField, validator: f.string('Optional ER validator pubkey'), initIfMissing: f.boolean('Initialize transfer queue if missing (default true)'), initAtasIfMissing: f.boolean('Initialize ATAs if missing (default true)'), escrowIndex: f.number('Optional escrow index for the withdrawal'), idempotent: f.boolean('Use idempotent variants for preparatory init instructions (default true)') }, ['owner', 'mint', 'amount']),
    async (raw) => {
      try {
        const input = parseInput<WithdrawInput>(raw);
        const result = await apiPost<UnsignedTransactionResponse>('/v1/spl/withdraw', {
          owner: input.owner, mint: input.mint, amount: input.amount,
          ...stripNullish({
            cluster: input.cluster, validator: input.validator,
            initIfMissing: input.initIfMissing, initAtasIfMissing: input.initAtasIfMissing,
            escrowIndex: input.escrowIndex, idempotent: input.idempotent,
          }),
        });
        return success(result, 'magicblock_withdraw');
      } catch (e) { return handleError('magicblock_withdraw', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  Private Payment API — Swap (2 tools)
  // ═══════════════════════════════════════════════════════════════

  register<SwapQuoteInput>('magicblock_swapQuote',
    'Get a swap quote between two SPL mints (proxies Triton Metis swap API). Pass the result into magicblock_swap. Lightweight read tier; use this before any value-moving swap.',
    schema({ inputMint: f.string('Input token mint address'), outputMint: f.string('Output token mint address'), amount: f.string("Raw amount to swap (unsigned integer string, e.g. '1000000')"), slippageBps: f.number('Slippage threshold in basis points (e.g. 50 = 0.5%)'), swapMode: f.enum('Swap mode: fixed input or fixed output amount', ['ExactIn', 'ExactOut']), onlyDirectRoutes: f.boolean('Limit routing to a single hop (default false)'), restrictIntermediateTokens: f.boolean('Restrict intermediate tokens to a more stable set (default false)'), platformFeeBps: f.number('Optional platform fee in basis points'), maxAccounts: f.number('Approximate maximum account budget for the route (default 64)') }, ['inputMint', 'outputMint', 'amount']),
    async (raw) => {
      try {
        const input = parseInput<SwapQuoteInput>(raw);
        const result = await apiGet<SwapQuoteResponse>('/v1/swap/quote', {
          inputMint: input.inputMint, outputMint: input.outputMint, amount: input.amount,
          slippageBps: input.slippageBps != null ? String(input.slippageBps) : undefined,
          swapMode: input.swapMode,
          onlyDirectRoutes: input.onlyDirectRoutes ? 'true' : undefined,
          restrictIntermediateTokens: input.restrictIntermediateTokens ? 'true' : undefined,
          platformFeeBps: input.platformFeeBps != null ? String(input.platformFeeBps) : undefined,
          maxAccounts: input.maxAccounts != null ? String(input.maxAccounts) : undefined,
        });
        return success(result, 'magicblock_swapQuote');
      } catch (e) { return handleError('magicblock_swapQuote', e); }
    },
  );

  register<SwapInput>('magicblock_swap',
    "Build an unsigned swap transaction from a quote. 'public' mode passes through Jupiter. 'private' mode routes output through scheduled private transfer with delay and split, requires destination, and currently rejects wSOL output because live mainnet testing found stuck-fund risk in MagicBlock shuttle delivery. Agents must continue with sap_preview_transaction, sap_sign_transaction, and sap_submit_signed_transaction; never write temporary signing scripts or read keypair JSON. Value-action fee applies.",
    schema({ userPublicKey: f.pubkey('Wallet that will sign the swap transaction'), quoteResponse: f.object('Quote response object from magicblock_swapQuote (pass as-is)', {}), visibility: f.enum("'public' = transparent Jupiter pass-through, 'private' = output routed through scheduled private transfer", ['public', 'private']), destination: f.pubkey("Final private-transfer recipient (required when visibility='private')"), minDelayMs: f.string("Private only. Earliest (ms) the queued transfer may settle"), maxDelayMs: f.string("Private only. Latest (ms) the queued transfer may settle (<= 600000)"), split: f.number('Private only. Number of queue entries to split across (1-14)'), clientRefId: f.string('Private only. Optional u64 client correlation ID'), validator: f.string('Optional validator pubkey for the transfer-queue PDA'), wrapAndUnwrapSol: f.boolean('Auto wrap/unwrap native SOL when needed (default true)'), asLegacyTransaction: f.boolean('Build a legacy transaction (not allowed when visibility=private, default false)') }, ['userPublicKey', 'quoteResponse']),
    async (raw) => {
      try {
        const input = parseInput<SwapInput>(raw);
        validateMagicBlockSwapInput(input);
        const result = await apiPost<SwapTransactionResponse>('/v1/swap/swap', {
          userPublicKey: input.userPublicKey, quoteResponse: input.quoteResponse,
          ...stripNullish({
            visibility: input.visibility, destination: input.destination,
            minDelayMs: input.minDelayMs, maxDelayMs: input.maxDelayMs,
            split: input.split, clientRefId: input.clientRefId,
            validator: input.validator, wrapAndUnwrapSol: input.wrapAndUnwrapSol,
            asLegacyTransaction: input.asLegacyTransaction,
          }),
        });
        return success(result, 'magicblock_swap');
      } catch (e) { return handleError('magicblock_swap', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  Private Payment API — Mint Init (2 tools)
  // ═══════════════════════════════════════════════════════════════

  register<InitializeMintInput>('magicblock_initializeMint',
    'Build an unsigned transaction that initializes a validator-scoped transfer queue for a mint. Then use sap_preview_transaction, sap_sign_transaction, and sap_submit_signed_transaction. Builder fee applies.',
    schema({ owner: f.pubkey('Wallet pubkey that will sign the transaction'), mint: f.string('SPL mint to initialize a transfer queue for'), cluster: clusterField, validator: f.string('Optional ER validator pubkey') }, ['owner', 'mint']),
    async (raw) => {
      try {
        const input = parseInput<InitializeMintInput>(raw);
        const result = await apiPost<UnsignedTransactionResponse>('/v1/spl/initialize-mint', {
          owner: input.owner, mint: input.mint, ...stripNullish({ cluster: input.cluster, validator: input.validator }),
        });
        return success(result, 'magicblock_initializeMint');
      } catch (e) { return handleError('magicblock_initializeMint', e); }
    },
  );

  register<IsMintInitializedInput>('magicblock_isMintInitialized',
    'Check whether a mint has a validator-scoped transfer queue on the ephemeral RPC..',
    schema({ mint: f.string('SPL mint to check'), cluster: clusterField, validator: f.string('Optional ER validator pubkey') }, ['mint']),
    async (raw) => {
      try {
        const input = parseInput<IsMintInitializedInput>(raw);
        const result = await apiGet<MintInitStatusResponse>('/v1/spl/is-mint-initialized', {
          mint: input.mint, cluster: input.cluster ?? undefined, validator: input.validator ?? undefined,
        });
        return success(result, 'magicblock_isMintInitialized');
      } catch (e) { return handleError('magicblock_isMintInitialized', e); }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  VRF (2 tools — on-chain via @solana/web3.js)
  // ═══════════════════════════════════════════════════════════════

  register<VrfRequestInput>('magicblock_requestRandomness',
    'Request provably fair on-chain randomness from the MagicBlock VRF oracle (Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz). Builds an unsigned transaction that invokes request_randomness on the VRF program. Use sap_preview_transaction, sap_sign_transaction, and sap_submit_signed_transaction; do not create local signing scripts. The oracle queue defaults to the base-layer queue (Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh); set ephemeral=true to use the ER queue for delegated programs. Builder fee applies.',
    schema({
      payer: f.pubkey('Wallet pubkey that will pay for the request and sign the transaction'),
      callbackProgramId: f.pubkey('Program ID of the callback program (the program that will consume the randomness)'),
      callbackDiscriminator: f.string('Base58 or hex discriminator for the callback instruction in your program'),
      callerSeed: f.string('Seed string for the VRF request — committed before randomness is produced. The seed is hashed to 32 bytes.'),
      callbackAccounts: f.array('Accounts to pass to the callback instruction', f.object('Callback account metadata', { pubkey: f.pubkey('Account pubkey'), isSigner: f.boolean('Whether the account is a signer'), isWritable: f.boolean('Whether the account is writable') })),
      ephemeral: f.boolean('Use the Ephemeral Rollup oracle queue instead of the base-layer queue (default false)'),
      endpoint: endpointField,
    }, ['payer', 'callbackProgramId', 'callbackDiscriminator', 'callerSeed', 'callbackAccounts']),
    async (raw) => {
      try {
        const input = parseInput<VrfRequestInput>(raw);
        const payer = new PublicKey(input.payer);
        const callbackProgramId = new PublicKey(input.callbackProgramId);
        const oracleQueue = input.ephemeral ? DEFAULT_EPHEMERAL_QUEUE : DEFAULT_QUEUE;

        const callerSeed = new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.callerSeed)),
        );

        // Parse callback discriminator: accept hex (0x-prefixed) or base58.
        let callbackDiscriminator: number[];
        if (input.callbackDiscriminator.startsWith('0x')) {
          callbackDiscriminator = Array.from(Buffer.from(input.callbackDiscriminator.slice(2), 'hex'));
        } else {
          const bs58 = await import('bs58');
          callbackDiscriminator = Array.from(bs58.default.decode(input.callbackDiscriminator));
        }

        // Build callback account metas
        const accountMetas = input.callbackAccounts.map((acc) => ({
          pubkey: new PublicKey(acc.pubkey),
          isSigner: acc.isSigner ?? false,
          isWritable: acc.isWritable ?? false,
        }));

        // Derive the request PDA
        const [requestKey] = PublicKey.findProgramAddressSync(
          [Buffer.from('vrf_request'), payer.toBuffer(), oracleQueue.toBuffer(), callerSeed],
          VRF_PROGRAM_ID,
        );

        // Build the request_randomness instruction data
        const data = Buffer.alloc(1024);
        let offset = 0;

        // Anchor instruction discriminator (first 8 bytes of sha256("global:request_randomness"))
        const discHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:request_randomness'));
        const discBytes = new Uint8Array(discHash).slice(0, 8);
        for (let i = 0; i < 8; i++) data.writeUInt8(discBytes[i], offset++);
        oracleQueue.toBuffer().copy(data, offset); offset += 32;
        callbackProgramId.toBuffer().copy(data, offset); offset += 32;
        data.writeUInt32LE(callbackDiscriminator.length, offset); offset += 4;
        Buffer.from(callbackDiscriminator).copy(data, offset); offset += callbackDiscriminator.length;
        Buffer.from(callerSeed).copy(data, offset); offset += 32;
        data.writeUInt32LE(accountMetas.length, offset); offset += 4;
        for (const meta of accountMetas) {
          meta.pubkey.toBuffer().copy(data, offset); offset += 32;
          data.writeUInt8(meta.isSigner ? 1 : 0, offset++);
          data.writeUInt8(meta.isWritable ? 1 : 0, offset++);
        }

        const ix = new TransactionInstruction({
          programId: VRF_PROGRAM_ID,
          keys: [
            { pubkey: payer, isSigner: true, isWritable: true },
            { pubkey: oracleQueue, isSigner: false, isWritable: true },
            { pubkey: requestKey, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: VRF_PROGRAM_IDENTITY, isSigner: false, isWritable: false },
          ],
          data: data.subarray(0, offset),
        });

        const tx = new Transaction();
        tx.add(ix);
        const serializedTx = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64');

        const result: VrfRequestResult = {
          requestKey: requestKey.toBase58(),
          vrfProgramId: VRF_PROGRAM_ID.toBase58(),
          oracleQueue: oracleQueue.toBase58(),
          transactionBase64: serializedTx,
          sendTo: 'base',
          callbackProgramId: callbackProgramId.toBase58(),
          callerSeedHash: Buffer.from(callerSeed).toString('hex'),
          note: 'Sign with sap_sign_transaction, then submit with sap_submit_signed_transaction. After submission, poll magicblock_getRandomnessResult with the requestKey until fulfilled=true.',
        };
        return success(result, 'magicblock_requestRandomness');
      } catch (e) { return handleError('magicblock_requestRandomness', e); }
    },
  );

  register<VrfResultInput>('magicblock_getRandomnessResult',
    'Check whether a VRF request has been fulfilled by reading the RandomnessRequest account on-chain. Returns fulfilled status, random bytes (if available), and the request metadata..',
    schema({ requestKey: f.pubkey('VRF request PDA key from magicblock_requestRandomness'), endpoint: endpointField }, ['requestKey']),
    async (raw) => {
      try {
        const { requestKey: requestKeyStr } = parseInput<VrfResultInput>(raw);
        const requestKey = new PublicKey(requestKeyStr);

        const accountInfo = await context.connection.getAccountInfo(requestKey, 'confirmed');

        if (!accountInfo) {
          const result: VrfRandomnessResult = {
            fulfilled: false, requestKey: requestKey.toBase58(),
            randomness: null, randomnessHex: null, callerSeed: '',
            owner: '', lamports: 0, executable: false, rentEpoch: 0, dataLength: 0,
            message: 'Request account not found. The request may not have been submitted yet, or the transaction has not been confirmed.',
          };
          return success(result, 'magicblock_getRandomnessResult');
        }

        const data = accountInfo.data;
        if (data.length < 73) {
          const result: VrfRandomnessResult = {
            fulfilled: false, requestKey: requestKey.toBase58(),
            randomness: null, randomnessHex: null, callerSeed: '',
            owner: accountInfo.owner.toBase58(), lamports: accountInfo.lamports,
            executable: accountInfo.executable, rentEpoch: accountInfo.rentEpoch, dataLength: data.length,
            message: 'Account data too short — request may be in an unexpected state.',
          };
          return success(result, 'magicblock_getRandomnessResult');
        }

        // Layout: 8-byte discriminator + 32-byte caller_seed + 32-byte randomness
        const discriminatorEnd = 8;
        const callerSeed = data.subarray(discriminatorEnd, discriminatorEnd + 32);
        const randomness = data.subarray(discriminatorEnd + 32, discriminatorEnd + 64);
        const isZero = randomness.every((byte) => byte === 0);
        const fulfilled = !isZero;

        const result: VrfRandomnessResult = {
          fulfilled, requestKey: requestKey.toBase58(),
          randomness: fulfilled ? Array.from(randomness) : null,
          randomnessHex: fulfilled ? Buffer.from(randomness).toString('hex') : null,
          callerSeed: Buffer.from(callerSeed).toString('hex'),
          owner: accountInfo.owner.toBase58(), lamports: accountInfo.lamports,
          executable: accountInfo.executable, rentEpoch: accountInfo.rentEpoch, dataLength: data.length,
          message: fulfilled
            ? 'Randomness has been produced and verified. Use the random bytes in your callback logic.'
            : 'Request submitted but not yet fulfilled. Poll again in a few seconds.',
        };
        return success(result, 'magicblock_getRandomnessResult');
      } catch (e) { return handleError('magicblock_getRandomnessResult', e); }
    },
  );

  logger.debug('MagicBlock tools registered', { count: registered });
}
