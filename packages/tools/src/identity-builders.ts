/**
 * Hosted-safe unsigned builders for SAP agent identity and registry writes.
 *
 * Hosted SAP MCP is accountless: it cannot sign user-owned writes, and
 * `hosted_local_signer_required` blocks direct `sap_register_agent`,
 * `sap_update_agent`, `sap_deactivate_agent`, `sap_reactivate_agent`,
 * `sap_close_agent`, `sap_migrate_pricing_menu`, `sap_report_calls`,
 * `sap_update_reputation_metrics`, and `sap_sns_register_agent_domain`
 * before monetization. Browser runtimes (Steve) have no local keypair
 * file, so the only non-custodial path for them is the one already used
 * by escrow: a hosted unsigned builder, browser-side preview + policy +
 * owner approval, local signature, then `sap_payments_finalize_transaction`
 * or the Steve signed-transaction submit relay.
 *
 * Every builder here returns base64 TX with the owner wallet as the sole
 * required signer (fee payer). Keypair bytes never leave the user device.
 *
 * @module tools/identity-builders
 */

import { PublicKey, SystemProgram } from '@solana/web3.js';
import BN from 'bn.js';
import { Pda } from '@oobe-protocol-labs/synapse-sap-sdk';
import type { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import { parseCapabilities, parsePricingTiers, parseProtocols } from './sap-sdk-parsers.js';

/** JSON object shape used across MCP tool input/output surfaces. */
type JsonRecord = Record<string, unknown>;

/** Solana system program — required account on every identity instruction. */
const SYSTEM_PROGRAM_ID = SystemProgram.programId;

/**
 * SAP protocol treasury (SAP protocol constants). The registry program
 * credits its platform fee to this writable remaining account.
 */
const TREASURY_WALLET = new PublicKey('J7PyZAGKvprCz4SQ5DKBLAHstJxgVqZcz6kguUoWpP7P');

interface IdentityBuilderResult {
  action: string;
  transactionBase64: string;
  encoding: 'base64';
  requiredSigner: string;
  requiredSignerRole: 'agentWallet';
  submitWith: 'sap_payments_finalize_transaction';
  nextStep: string;
  accounts: JsonRecord;
  warnings?: string[];
}

type AnchorInstructionBuilder = {
  accounts(accounts: JsonRecord): {
    instruction(): Promise<unknown>;
    remainingAccounts?(accounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>): {
      instruction(): Promise<unknown>;
    };
  };
  accountsPartial?(accounts: JsonRecord): { instruction(): Promise<unknown> };
};

type AnchorMethods = Record<string, (...args: unknown[]) => AnchorInstructionBuilder>;

function ownerWalletOf(input: JsonRecord): PublicKey {
  const raw = input['ownerWallet'] ?? input['walletAddress'];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error('ownerWallet is required (base58) — the wallet that will sign locally.');
  }
  return new PublicKey(raw.trim());
}

async function serializeIdentityTx(
  client: SapClient,
  feePayer: PublicKey,
  instruction: unknown,
): Promise<IdentityBuilderResult['transactionBase64']> {
  const tx = await (client as unknown as {
    buildTransaction(ixs: unknown[], payer: PublicKey): Promise<{ serialize(): Uint8Array }>;
  }).buildTransaction([instruction], feePayer);
  return Buffer.from(tx.serialize()).toString('base64');
}

function identityBuilderResponse(params: {
  action: string;
  transactionBase64: string;
  requiredSigner: PublicKey;
  accounts: JsonRecord;
  warnings?: string[];
}): IdentityBuilderResult {
  return {
    action: params.action,
    transactionBase64: params.transactionBase64,
    encoding: 'base64',
    requiredSigner: params.requiredSigner.toBase58(),
    requiredSignerRole: 'agentWallet',
    submitWith: 'sap_payments_finalize_transaction',
    nextStep: 'Sign locally with the owner wallet (owner approval required) and submit. Do not create temporary signing scripts and do not read keypair JSON.',
    accounts: params.accounts,
    ...(params.warnings && params.warnings.length > 0 ? { warnings: params.warnings } : {}),
  };
}

function identityPdas(client: SapClient, ownerWallet: PublicKey) {
  const [agentPda] = Pda.deriveAgent(ownerWallet, client.programId);
  const [agentStats] = Pda.deriveAgentStats(agentPda, client.programId);
  const [pricingMenu] = Pda.derivePricingMenu(agentPda, client.programId);
  const [globalRegistry] = Pda.deriveGlobalRegistry(client.programId);
  return { agentPda, agentStats, pricingMenu, globalRegistry };
}

function methodsOf(client: SapClient): AnchorMethods {
  // client.program is the Anchor Program wrapper; the method builders live
  // under .methods. Fall back to the program itself for proxied layouts.
  const program = client.program as unknown as { methods?: AnchorMethods };
  return program.methods ?? (client.program as unknown as AnchorMethods);
}

/**
 * Resolves an Anchor method builder from the program's methods namespace.
 * Anchor camelCases IDL instruction names (register_agent → registerAgent);
 * when the loaded IDL is stale or the namespace is proxied, the lookup can
 * return undefined — fail with an explicit, actionable message instead of
 * "is not a function".
 */
function requireAnchorMethod(methods: AnchorMethods, snakeName: string, camelName: string): AnchorMethods[string] {
  const candidate = methods[camelName] ?? methods[snakeName];
  if (typeof candidate !== 'function') {
    throw new Error(
      `SAP IDL mismatch: neither '${camelName}' nor '${snakeName}' is exposed by the loaded program IDL. ` +
      `The gateway is running with a stale or incompatible @oobe-protocol-labs/synapse-sap-sdk install — re-run pnpm install on the server so the bundled IDL (${idlSummary()}) matches the SDK.`,
    );
  }
  return candidate;
}

let cachedIdlSummary: string | null = null;
function idlSummary(): string {
  if (cachedIdlSummary) return cachedIdlSummary;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRequire } = require('node:module') as typeof import('node:module');
    const req = createRequire(`${process.cwd()}/package.json`);
    const idl = req('@oobe-protocol-labs/synapse-sap-sdk/idl/synapse_agent_sap.json') as {
      metadata?: { version?: string };
      instructions: Array<{ name: string }>;
    };
    cachedIdlSummary = `v${idl.metadata?.version ?? '?'}, ${idl.instructions.length} instructions`;
    return cachedIdlSummary;
  } catch {
    return 'unknown IDL';
  }
}

// ─── Builders ─────────────────────────────────────────────────────────

export async function buildAgentRegisterTransaction(
  input: JsonRecord,
  client: SapClient,
): Promise<IdentityBuilderResult> {
  const ownerWallet = ownerWalletOf(input);
  const name = typeof input['name'] === 'string' && input['name'].trim()
    ? input['name'].trim()
    : (() => { throw new Error('name is required'); })();
  const description = typeof input['description'] === 'string' && input['description'].trim()
    ? input['description'].trim()
    : (() => { throw new Error('description is required'); })();
  const capabilities = parseCapabilities(input['capabilities'] ?? []);
  const pricing = parsePricingTiers(input['pricing'] ?? []);
  const identity = {
    name,
    description,
    capabilities,
    pricing,
    protocols: parseProtocols(input['protocols']),
    agentId: typeof input['agentId'] === 'string' ? input['agentId'] : null,
    agentUri: typeof input['agentUri'] === 'string'
      ? input['agentUri']
      : typeof input['metadataUri'] === 'string' ? input['metadataUri'] : null,
    x402Endpoint: typeof input['x402Endpoint'] === 'string' ? input['x402Endpoint'] : null,
  };
  const pdas = identityPdas(client, ownerWallet);
  const methods = methodsOf(client);
  const anchorBuilder = requireAnchorMethod(methods, 'register_agent', 'registerAgent')(
    identity.name,
    identity.description,
    identity.capabilities,
    identity.pricing,
    identity.protocols,
    identity.agentId,
    identity.agentUri,
    identity.x402Endpoint,
  ).accounts({
    wallet: ownerWallet,
    agent: pdas.agentPda,
    agentStats: pdas.agentStats,
    pricingMenu: pdas.pricingMenu,
    globalRegistry: pdas.globalRegistry,
    systemProgram: SYSTEM_PROGRAM_ID,
  });
  const instruction = await (
    anchorBuilder.remainingAccounts
      ? anchorBuilder.remainingAccounts([
        // The on-chain program credits a platform fee to the treasury via a
        // writable remaining account (mirrors SapClient.agent.register()).
        { pubkey: TREASURY_WALLET, isSigner: false, isWritable: true },
      ])
      : anchorBuilder
  ).instruction();
  const transactionBase64 = await serializeIdentityTx(client, ownerWallet, instruction);
  return identityBuilderResponse({
    action: 'register_agent',
    transactionBase64,
    requiredSigner: ownerWallet,
    accounts: {
      ownerWallet: ownerWallet.toBase58(),
      agentPda: pdas.agentPda.toBase58(),
      agentStats: pdas.agentStats.toBase58(),
      pricingMenu: pdas.pricingMenu.toBase58(),
      globalRegistry: pdas.globalRegistry.toBase58(),
    },
    warnings: ['Registration pays the 0.1 SOL SAP protocol registration fee from the signing wallet.'],
  });
}

export async function buildAgentUpdateTransaction(
  input: JsonRecord,
  client: SapClient,
): Promise<IdentityBuilderResult> {
  const ownerWallet = ownerWalletOf(input);
  const pdas = identityPdas(client, ownerWallet);
  const methods = methodsOf(client);
  const instruction = await requireAnchorMethod(methods, 'update_agent', 'updateAgent')(
    typeof input['name'] === 'string' ? input['name'] : null,
    typeof input['description'] === 'string' ? input['description'] : null,
    input['capabilities'] === undefined ? null : parseCapabilities(input['capabilities']),
    input['pricing'] === undefined ? null : parsePricingTiers(input['pricing']),
    input['protocols'] === undefined ? null : parseProtocols(input['protocols']),
    typeof input['agentId'] === 'string' ? input['agentId'] : null,
    typeof input['agentUri'] === 'string'
      ? input['agentUri']
      : typeof input['metadataUri'] === 'string' ? input['metadataUri'] : null,
    typeof input['x402Endpoint'] === 'string' ? input['x402Endpoint'] : null,
  ).accounts({
    signer: ownerWallet,
    wallet: ownerWallet,
    agent: pdas.agentPda,
    pricingMenu: pdas.pricingMenu,
  }).instruction();
  const transactionBase64 = await serializeIdentityTx(client, ownerWallet, instruction);
  return identityBuilderResponse({
    action: 'update_agent',
    transactionBase64,
    requiredSigner: ownerWallet,
    accounts: {
      ownerWallet: ownerWallet.toBase58(),
      agentPda: pdas.agentPda.toBase58(),
      pricingMenu: pdas.pricingMenu.toBase58(),
    },
  });
}

export async function buildAgentLifecycleTransaction(
  action: 'deactivate_agent' | 'reactivate_agent' | 'close_agent' | 'migrate_pricing_menu',
  input: JsonRecord,
  client: SapClient,
): Promise<IdentityBuilderResult> {
  const ownerWallet = ownerWalletOf(input);
  const pdas = identityPdas(client, ownerWallet);
  const methods = methodsOf(client);
  const actionMethod = requireAnchorMethod(methods, action, action.replace(/_([a-z0-9])/g, (_match, c) => c.toUpperCase()));
  const builder = actionMethod();
  // Account sets mirror the SDK AgentModule exactly (verified against the
  // deployed mainnet bytecode): no `signer` key (wallet is the signer),
  // systemProgram present, and close_agent uses the real stake/vault PDAs
  // plus the writable treasury remaining account.
  const [stakePda] = Pda.deriveStake(pdas.agentPda, client.programId);
  const [vaultPda] = Pda.deriveVault(pdas.agentPda, client.programId);
  const accountsByAction: Record<typeof action, JsonRecord> = {
    close_agent: {
      wallet: ownerWallet,
      agent: pdas.agentPda,
      agentStats: pdas.agentStats,
      vaultCheck: vaultPda,
      pricingMenu: pdas.pricingMenu,
      stake: stakePda,
      globalRegistry: pdas.globalRegistry,
    },
    deactivate_agent: {
      wallet: ownerWallet,
      agent: pdas.agentPda,
      agentStats: pdas.agentStats,
      globalRegistry: pdas.globalRegistry,
    },
    reactivate_agent: {
      wallet: ownerWallet,
      agent: pdas.agentPda,
      agentStats: pdas.agentStats,
      globalRegistry: pdas.globalRegistry,
    },
    migrate_pricing_menu: {
      wallet: ownerWallet,
      agent: pdas.agentPda,
      pricingMenu: pdas.pricingMenu,
      systemProgram: SYSTEM_PROGRAM_ID,
    },
  };
  const accountArgs = accountsByAction[action];
  const anchored = builder.accounts(accountArgs) as {
    instruction(): Promise<unknown>;
    remainingAccounts?(
      accounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>,
    ): { instruction(): Promise<unknown> };
  };
  // close_agent settles remaining rent flows through the treasury.
  const settled = anchored.remainingAccounts && action === 'close_agent'
    ? anchored.remainingAccounts([{ pubkey: TREASURY_WALLET, isSigner: false, isWritable: true }])
    : anchored;
  const instruction = await settled.instruction();
  const transactionBase64 = await serializeIdentityTx(client, ownerWallet, instruction);
  return identityBuilderResponse({
    action,
    transactionBase64,
    requiredSigner: ownerWallet,
    accounts: {
      ownerWallet: ownerWallet.toBase58(),
      agentPda: pdas.agentPda.toBase58(),
      pricingMenu: pdas.pricingMenu.toBase58(),
      ...(action === 'close_agent' ? { stake: stakePda.toBase58(), vaultCheck: vaultPda.toBase58() } : {}),
    },
    ...(action === 'migrate_pricing_menu'
      ? { warnings: ['migrate_pricing_menu is NOT present in the currently deployed mainnet program bytecode — this transaction will fail until the program is redeployed with that instruction.'] }
      : {}),
  });
}

export async function buildAgentReportCallsTransaction(
  input: JsonRecord,
  client: SapClient,
): Promise<IdentityBuilderResult> {
  // On-chain the legacy "report calls" concept is settle_calls_v2:
  // args (escrowNonce: u64, callsToSettle: u64, serviceHash: [u8;32]),
  // accounts { wallet, agent, agentStats, escrow, systemProgram }.
  // The escrow PDA is per (agent, depositor, nonce) — the depositor whose
  // calls are being settled must be provided.
  const ownerWallet = ownerWalletOf(input);
  const depositor = (() => {
    const raw = input['depositorWallet'] ?? input['depositor'];
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Error('depositorWallet is required (base58) — the consumer whose escrow funds this settlement.');
    }
    return new PublicKey(raw.trim());
  })();
  const callsServed = typeof input['callsServed'] === 'number' && Number.isFinite(input['callsServed'])
    ? input['callsServed']
    : (() => { throw new Error('callsServed (number) is required'); })();
  const escrowNonce = typeof input['escrowNonce'] === 'number' && Number.isInteger(input['escrowNonce'])
    ? input['escrowNonce']
    : 0;
  const serviceHashRaw = input['serviceHash'];
  const serviceHash = (() => {
    // Anchor borsh [u8;32] encodes from a plain JS number array in this SDK
    // runtime — Buffer/Uint8Array inputs fail with "toArrayLike is not a
    // function" inside BNLayout.encode. Verified on-chain (mainnet sim).
    if (typeof serviceHashRaw === 'string' && /^[0-9a-fA-F]{64}$/.test(serviceHashRaw)) {
      return Array.from(Buffer.from(serviceHashRaw, 'hex'));
    }
    throw new Error('serviceHash is required — 64-char hex sha256 of the served payload.');
  })();
  // u64 args must be BN instances: plain numbers lack toArrayLike and crash
  // the borsh encoder (verified against mainnet — BN(0), BN(1) encode fine).
  const [agentPda] = Pda.deriveAgent(ownerWallet, client.programId);
  const [agentStats] = Pda.deriveAgentStats(agentPda, client.programId);
  const [escrowPda] = Pda.deriveEscrowV2(agentPda, depositor, escrowNonce, client.programId);
  const methods = methodsOf(client);
  const instruction = await requireAnchorMethod(methods, 'settle_calls_v2', 'settleCallsV2')(
    new BN(escrowNonce),
    new BN(Math.trunc(callsServed)),
    serviceHash,
  ).accounts({
    wallet: ownerWallet,
    agent: agentPda,
    agentStats,
    escrow: escrowPda,
    systemProgram: SYSTEM_PROGRAM_ID,
  }).instruction();
  const transactionBase64 = await serializeIdentityTx(client, ownerWallet, instruction);
  return identityBuilderResponse({
    action: 'report_calls',
    transactionBase64,
    requiredSigner: ownerWallet,
    accounts: {
      ownerWallet: ownerWallet.toBase58(),
      depositorWallet: depositor.toBase58(),
      agentPda: agentPda.toBase58(),
      agentStats: agentStats.toBase58(),
      escrow: escrowPda.toBase58(),
    },
    warnings: [
      'settle_calls_v2 moves real escrow funds. DisputeWindow escrows also initialize a PendingSettlement PDA in remaining accounts — a full treasury/SPL settlement flow is coming; this builder covers the plain CoSigned path with an existing escrow.',
    ],
  });
}