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

import { PublicKey } from '@solana/web3.js';
import { Pda } from '@oobe-protocol-labs/synapse-sap-sdk';
import type { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import { parseCapabilities, parsePricingTiers, parseProtocols } from './sap-sdk-tools.js';

/** JSON object shape used across MCP tool input/output surfaces. */
type JsonRecord = Record<string, unknown>;

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
  accounts(accounts: JsonRecord): { instruction(): Promise<unknown> };
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
  return client.program as unknown as AnchorMethods;
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
  const instruction = await methods.registerAgent(
    identity.name,
    identity.description,
    identity.capabilities,
    identity.pricing,
    identity.protocols,
    identity.agentId,
    identity.agentUri,
    identity.x402Endpoint,
  ).accounts({
    signer: ownerWallet,
    wallet: ownerWallet,
    agent: pdas.agentPda,
    agentStats: pdas.agentStats,
    pricingMenu: pdas.pricingMenu,
    globalRegistry: pdas.globalRegistry,
  }).instruction();
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
  const instruction = await methods.updateAgent(
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
  const builder = methods[action].length >= 4
    ? methods[action]()
    : methods[action]();
  const ctx: JsonRecord = action === 'close_agent'
    ? {
      signer: ownerWallet,
      wallet: ownerWallet,
      agent: pdas.agentPda,
      agentStats: pdas.agentStats,
      vaultCheck: pdas.agentPda,
      pricingMenu: pdas.pricingMenu,
      stake: pdas.agentPda,
      globalRegistry: pdas.globalRegistry,
    }
    : {
      signer: ownerWallet,
      wallet: ownerWallet,
      agent: pdas.agentPda,
      agentStats: pdas.agentStats,
      pricingMenu: pdas.pricingMenu,
      globalRegistry: pdas.globalRegistry,
    };
  const accountArgs = action === 'close_agent'
    ? ctx
    : action === 'migrate_pricing_menu'
      ? { signer: ownerWallet, wallet: ownerWallet, agent: pdas.agentPda, pricingMenu: pdas.pricingMenu }
      : ctx;
  const instruction = await builder.accounts(accountArgs).instruction();
  const transactionBase64 = await serializeIdentityTx(client, ownerWallet, instruction);
  return identityBuilderResponse({
    action,
    transactionBase64,
    requiredSigner: ownerWallet,
    accounts: {
      ownerWallet: ownerWallet.toBase58(),
      agentPda: pdas.agentPda.toBase58(),
      pricingMenu: pdas.pricingMenu.toBase58(),
    },
  });
}

export async function buildAgentReportCallsTransaction(
  input: JsonRecord,
  client: SapClient,
): Promise<IdentityBuilderResult> {
  const ownerWallet = ownerWalletOf(input);
  const callsServed = typeof input['callsServed'] === 'number' && Number.isFinite(input['callsServed'])
    ? input['callsServed']
    : (() => { throw new Error('callsServed (number) is required'); })();
  const pdas = identityPdas(client, ownerWallet);
  const methods = methodsOf(client);
  const instruction = await methods.reportCalls(callsServed).accounts({
    signer: ownerWallet,
    wallet: ownerWallet,
    agent: pdas.agentPda,
    agentStats: pdas.agentStats,
    globalRegistry: pdas.globalRegistry,
  }).instruction();
  const transactionBase64 = await serializeIdentityTx(client, ownerWallet, instruction);
  return identityBuilderResponse({
    action: 'report_calls',
    transactionBase64,
    requiredSigner: ownerWallet,
    accounts: {
      ownerWallet: ownerWallet.toBase58(),
      agentPda: pdas.agentPda.toBase58(),
      agentStats: pdas.agentStats.toBase58(),
    },
  });
}