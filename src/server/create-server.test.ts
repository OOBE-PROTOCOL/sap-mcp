import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createSapMcpServer } from './create-server.js';
import type { SapMcpConfig } from '../core/types.js';
import { getPermissionMappedTools, getRequiredPermission } from '../security/tool-permissions.js';
import { MCP_SERVER_INSTRUCTIONS, MCP_SERVER_VERSION } from '../core/constants.js';

interface ToolDefinitionForTest {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: {
    type?: string;
    description?: string;
    properties?: Record<string, { description?: string; title?: string }>;
  };
  outputSchema?: unknown;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

interface ToolResponseForTest {
  content: Array<{ text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type ToolHandlerForTest = (input: Record<string, unknown>) => Promise<ToolResponseForTest>;

interface RegisteredServerForTest extends Server {
  tools?: ToolDefinitionForTest[];
  toolHandlers?: Record<string, ToolHandlerForTest>;
  _requestHandlers?: Map<string, (request: unknown, extra: unknown) => Promise<ToolResponseForTest>>;
}

function baseConfig(overrides: Partial<SapMcpConfig> = {}): SapMcpConfig {
  return {
    mode: 'readonly',
    rpcUrl: 'https://api.devnet.solana.com',
    commitment: 'confirmed',
    programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
    enableHttp: false,
    httpPort: 8787,
    httpHost: '127.0.0.1',
    logLevel: 'error',
    maxTxValueSol: 10,
    requireApprovalAboveSol: 1,
    dailyLimitSol: 100,
    allowedTools: 'all',
    externalSignerTimeoutMs: 30000,
    ...overrides,
  };
}

function registeredServer(server: Server): RegisteredServerForTest {
  return server as RegisteredServerForTest;
}

describe('createSapMcpServer', () => {
  it('registers the complete MCP tool surface without duplicates', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const names = (server.tools ?? []).map((tool) => tool.name);

    expect(names).toHaveLength(289);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('sol_get_balance');
    expect(names).toContain('coingecko_getTokenPrice');
    expect(names).toContain('jupiter_getQuote');
    expect(names).toContain('jupiter_swap');
    expect(names).toContain('jupiter_swapInstructions');
    expect(names).toContain('jupiter_smartSwap');
    expect(names).toContain('sap_skills_upgrade_plan');
    expect(names).toContain('sap_runtime_repair_plan');
    expect(names).toContain('sap_protocol_invariants');
    expect(names).toContain('sap_agent_identity_plan');
    expect(names).toContain('sap_agent_runtime_status');
    expect(names).toContain('sap_agent_context');
    expect(names).toContain('sap_agent_next_action');
    expect(names).toContain('sap_pricing_catalog');
    expect(names).toContain('bridging_bridgeWormhole');
    expect(names).toContain('bridging_bridgeWormholeStatus');
    expect(names).toContain('bridging_bridgeDeBridge');
    expect(names).toContain('bridging_bridgeDeBridgeStatus');
    expect(names).toContain('metaplex-nft_deployCollection');
    expect(names).toContain('metaplex-nft_mintNFT');
    expect(names).toContain('metaplex-nft_updateMetadata');
    expect(names).toContain('metaplex-nft_verifyCreator');
    expect(names).toContain('metaplex-nft_verifyCollection');
    expect(names).toContain('metaplex-nft_setAndVerifyCollection');
    expect(names).toContain('metaplex-nft_delegateAuthority');
    expect(names).toContain('metaplex-nft_revokeAuthority');
    expect(names).toContain('metaplex-nft_configureRoyalties');
    expect(names).toContain('sap_get_network_overview');
    expect(names).toContain('sap_discover_agents');
    expect(names).toContain('sap_list_all_agents');
    expect(names).toContain('sap_get_global_state');
    expect(names).toContain('sap_sns_check_domain');
    expect(names).toContain('sap_sns_resolve_domain');
    expect(names).toContain('sap_sns_register_agent_domain');
    expect(names).toContain('sap_decode_transaction');
    expect(names).toContain('sap_preview_transaction');
    expect(names).toContain('sap_sign_transaction');
    expect(names).toContain('sap_submit_signed_transaction');
    expect(names).toContain('sap_profile_current');
    expect(names).toContain('sap_profile_list');
    expect(names).toContain('sap_profile_public_key');
    expect(names).toContain('sap_profile_switch');
    expect(names).toContain('sap_agent_start');
    expect(names).toContain('sap_agent_runtime_status');
    expect(names).toContain('sap_pricing_catalog');
    expect(names).toContain('sap_skills_list');
    expect(names).toContain('sap_skills_bundle');
    expect(names).toContain('sap_skills_install');
    expect(names).toContain('sap_x402_estimate_cost');
    expect(names).toContain('sap_payments_profile_current');
    expect(names).toContain('sap_payments_readiness');
    expect(names).toContain('sap_payments_call_paid_tool');
    expect(names).toContain('sap_payments_call_external_x402');
    expect(names).toContain('sap_payments_register_agent');
    expect(names).toContain('sap_payments_update_agent');
    expect(names).toContain('sap_payments_finalize_transaction');
    expect(names).toContain('sap_payments_prepare_challenge');
    expect(names).toContain('sap_payments_sign_challenge');
    expect(names).toContain('sap_payments_verify_receipt');
    expect(names).toContain('sap_x402_paid_call');
    expect(names).toContain('sap_x402_build_headers_from_escrow');
    expect(names).toContain('sap_x402_fetch_escrow');
    expect(names).toContain('sap_x402_settle_batch');
    expect(names).not.toContain('sap_create_escrow');
    expect(names).not.toContain('sap_deposit_escrow');
    expect(names).not.toContain('sap_settle_escrow');
    expect(names).not.toContain('sap_settle_escrow_batch');
    expect(names).not.toContain('sap_withdraw_escrow');
    expect(names).not.toContain('sap_close_escrow');
    expect(names).toContain('sap_create_escrow_v2');
    expect(names).toContain('sap_deposit_escrow_v2');
    expect(names).toContain('sap_settle_escrow_v2');
    expect(names).toContain('sap_escrow_build_create_transaction');
    expect(names).toContain('sap_escrow_build_deposit_transaction');
    expect(names).toContain('sap_escrow_build_settle_transaction');
    expect(names).toContain('sap_escrow_build_finalize_transaction');
    expect(names).toContain('sap_escrow_build_withdraw_transaction');
    expect(names).toContain('sap_escrow_build_close_transaction');
    expect(names).toContain('sap_chat_derive_room');
    expect(names).toContain('sap_chat_start_room');
    expect(names).toContain('sap_chat_send_message');
    expect(names).toContain('sap_chat_publish_manifest');
    expect(names).toContain('sap_chat_read_latest');
    expect(names).toContain('sap_chat_read_all');
    expect(names).toContain('sap_chat_status');
    expect(names).toContain('sap_chat_seal_room');
  });

  it('publishes concise SAP MCP startup guidance through initialize instructions', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig())) as RegisteredServerForTest & {
      _instructions?: string;
    };

    expect(server._instructions).toBe(MCP_SERVER_INSTRUCTIONS);
    expect(server._instructions).toContain('sap_agent_start');
    expect(server._instructions).toContain('sap_skills_bundle');
    expect(server._instructions).toContain('sap_payments_call_paid_tool');
    expect(server._instructions).toContain('Escrow writes are V2-only');
    expect(server._instructions).not.toContain('280 tools');
    expect(server._instructions).not.toContain('248 tools');
  });

  it('keeps every root input parameter described for agent-safe schema use', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const missing: string[] = [];

    for (const tool of server.tools ?? []) {
      for (const [propertyName, propertySchema] of Object.entries(tool.inputSchema?.properties ?? {})) {
        if (!propertySchema.description && !propertySchema.title) {
          missing.push(`${tool.name}.${propertyName}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('exposes Escrow V2 as the active escrow write surface', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const toolsByName = new Map((server.tools ?? []).map((tool) => [tool.name, tool]));
    const createEscrowV2 = toolsByName.get('sap_create_escrow_v2');
    const schema = createEscrowV2?.inputSchema?.properties ?? {};

    expect(createEscrowV2?.description).toContain('SelfReport/0 is rejected');
    expect(schema).toHaveProperty('settlementSecurity');
    expect(schema).toHaveProperty('tokenMint');
    expect(schema).toHaveProperty('tokenDecimals');
    expect(schema).toHaveProperty('disputeWindowSlots');
    expect(schema).toHaveProperty('coSigner');
    expect(schema).toHaveProperty('arbiter');
    expect(schema).toHaveProperty('expiresAt');
    expect(schema).toHaveProperty('nonce');
    expect(schema.pricePerCall?.description).toContain('micro-USDC');
    expect(schema.initialDeposit?.description).toContain('smallest unit');
  });

  it('exposes hosted Escrow V2 builders with local finalizer guidance', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const toolsByName = new Map((server.tools ?? []).map((tool) => [tool.name, tool]));
    const builder = toolsByName.get('sap_escrow_build_create_transaction');
    const schema = builder?.inputSchema?.properties ?? {};

    expect(builder?.description).toContain('sap_payments_finalize_transaction');
    expect(builder?.description).toContain('Hosted-safe unsigned Escrow V2 builder');
    expect(schema).toHaveProperty('depositorWallet');
    expect(schema).toHaveProperty('agentWallet');
    expect(schema).toHaveProperty('initialDeposit');
    expect(schema.depositorWallet?.description).toContain('signs locally');
  });

  it('exposes paginated hosted SAP agent directory filters for paid discovery', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const toolsByName = new Map((server.tools ?? []).map((tool) => [tool.name, tool]));
    const discoverAgents = toolsByName.get('sap_discover_agents');
    const listAllAgents = toolsByName.get('sap_list_all_agents');
    const discoverSchema = discoverAgents?.inputSchema?.properties ?? {};
    const listAllSchema = listAllAgents?.inputSchema?.properties ?? {};

    expect(discoverAgents?.description).toContain('cursor pagination');
    expect(listAllAgents?.description).toContain('global SAP agent directory');

    for (const schema of [discoverSchema, listAllSchema]) {
      expect(schema).toHaveProperty('query');
      expect(schema).toHaveProperty('wallet');
      expect(schema).toHaveProperty('agentPda');
      expect(schema).toHaveProperty('protocol');
      expect(schema).toHaveProperty('capability');
      expect(schema).toHaveProperty('capabilities');
      expect(schema).toHaveProperty('capabilityMode');
      expect(schema).toHaveProperty('hasX402Endpoint');
      expect(schema).toHaveProperty('cursor');
      expect(schema).toHaveProperty('view');
      expect(schema).toHaveProperty('hydrate');
      expect(schema.query?.description).toContain('x402 endpoint');
      expect(schema.cursor?.description).toContain('pagination');
    }
  });

  it('describes SAP agent register/update schemas precisely for agent identity flows', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const toolsByName = new Map((server.tools ?? []).map((tool) => [tool.name, tool]));
    const propertiesOf = (value: unknown): Record<string, unknown> => (
      value && typeof value === 'object' && 'properties' in value
        ? ((value as { properties?: Record<string, unknown> }).properties ?? {})
        : {}
    );
    const itemsOf = (value: unknown): unknown => (
      value && typeof value === 'object' && 'items' in value ? (value as { items?: unknown }).items : undefined
    );
    const oneOf = (value: unknown): unknown[] => (
      value && typeof value === 'object' && 'oneOf' in value && Array.isArray((value as { oneOf?: unknown }).oneOf)
        ? (value as { oneOf: unknown[] }).oneOf
        : []
    );
    const descriptionOf = (value: unknown): string => (
      value && typeof value === 'object' && 'description' in value ? String((value as { description?: string }).description ?? '') : ''
    );
    const enumOf = (value: unknown): string[] => (
      value && typeof value === 'object' && 'enum' in value && Array.isArray((value as { enum?: unknown }).enum)
        ? (value as { enum: string[] }).enum
        : []
    );
    const registerSchema = toolsByName.get('sap_register_agent')?.inputSchema?.properties ?? {};
    const invariantsTool = toolsByName.get('sap_protocol_invariants');
    const identityPlanTool = toolsByName.get('sap_agent_identity_plan');
    const updateTool = toolsByName.get('sap_update_agent');
    const updateSchema = updateTool?.inputSchema?.properties ?? {};
    const localRegisterSchema = toolsByName.get('sap_payments_register_agent')?.inputSchema?.properties ?? {};
    const localUpdateSchema = toolsByName.get('sap_payments_update_agent')?.inputSchema?.properties ?? {};
    const capabilityObjectSchema = oneOf(itemsOf(registerSchema.capabilities))[1];
    const registerPricingSchema = propertiesOf(itemsOf(registerSchema.pricing));
    const localPricingSchema = propertiesOf(itemsOf(localRegisterSchema.pricing));

    expect(invariantsTool?.description).toContain('0.1 SOL registration fee');
    expect(identityPlanTool?.description).toContain('protocol fee verification checklist');
    expect(identityPlanTool?.inputSchema?.properties).toHaveProperty('metaplexAsset');
    expect(identityPlanTool?.inputSchema?.properties).toHaveProperty('snsDomain');
    expect(descriptionOf(propertiesOf(capabilityObjectSchema).id)).toContain('protocol:action');
    expect(enumOf(registerPricingSchema.tokenType)).toEqual(['sol', 'usdc', 'spl']);
    expect(enumOf(registerPricingSchema.settlementMode)).toEqual(['instant', 'escrow', 'batched', 'x402']);
    expect(descriptionOf(registerPricingSchema.pricePerCall)).toContain('micro-USDC');
    expect(updateTool?.description).toContain('sap_payments_update_agent');
    expect(updateTool?.inputSchema).not.toHaveProperty('additionalProperties');
    expect(descriptionOf(updateSchema.metadataUri)).toContain('never use a desktop file path');
    expect(descriptionOf(localRegisterSchema.confirm)).toContain('Must be true');
    expect(enumOf(localPricingSchema.settlementMode)).toContain('x402');
    expect(descriptionOf(localUpdateSchema.capabilities)).toContain('full replacement');
    expect(toolsByName.get('sap_payments_register_agent')?.description).toContain('0.1 SOL SAP protocol registration fee');
    expect(JSON.stringify(toolsByName.get('sap_payments_register_agent')?.outputSchema)).toContain('protocolFee');
    expect(JSON.stringify(toolsByName.get('sap_payments_register_agent')?.outputSchema)).toContain('protocolComplete');
  });

  it('limits the local sap_payments bridge process to payment helper tools', async () => {
    const previous = process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
    process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = 'true';
    try {
      const server = registeredServer(await createSapMcpServer(baseConfig()));
      const names = (server.tools ?? []).map((tool) => tool.name);

      expect(names).toEqual([
        'sap_payments_profile_current',
        'sap_payments_readiness',
        'sap_payments_call_paid_tool',
        'sap_payments_call_external_x402',
        'sap_payments_register_agent',
        'sap_payments_update_agent',
        'sap_payments_finalize_transaction',
        'sap_payments_prepare_challenge',
        'sap_payments_sign_challenge',
        'sap_payments_verify_receipt',
        'sap_x402_paid_call',
      ]);
      expect(names).not.toContain('jupiter_swap');
      expect(names).not.toContain('sap_register_agent');
      expect(names).not.toContain('sol_get_balance');
    } finally {
      if (previous === undefined) {
        delete process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
      } else {
        process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = previous;
      }
    }
  });

  it('lets hosted users register SAP agents through the local sap_payments bridge', async () => {
    const previous = process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
    process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = 'true';
    const keypair = Keypair.generate();
    const walletPath = join(mkdtempSync(join(tmpdir(), 'sap-mcp-payments-register-')), 'agent-keypair.json');
    writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)), 'utf-8');

    try {
      const server = registeredServer(await createSapMcpServer(baseConfig({
        mode: 'local-dev-keypair',
        walletPath,
      })));
      const tool = (server.tools ?? []).find((item) => item.name === 'sap_payments_register_agent');

      expect(tool?.description).toContain('hosted_local_signer_required');
      expect(tool?.description).toContain('confirm: true');
      expect(tool?.description).toContain('protocol registration fee');
      expect(JSON.stringify(tool?.outputSchema)).toContain('protocolFee');
      expect(tool?.inputSchema?.properties).toHaveProperty('name');
      expect(tool?.inputSchema?.properties).toHaveProperty('capabilities');
      expect(tool?.inputSchema?.properties).toHaveProperty('protocols');
      expect(tool?.inputSchema?.properties).toHaveProperty('confirm');

      const missingConfirm = await server.toolHandlers?.sap_payments_register_agent({
        name: 'Solking',
        description: 'Solana trading agent',
        capabilities: ['jupiter:swap'],
        protocols: ['sap', 'mcp', 'jupiter'],
        confirm: false,
      });

      expect(missingConfirm?.content[0]?.text).toContain('confirm: true is required');
      expect(missingConfirm?.content[0]?.text).toContain('hostedX402Charged');
      expect(missingConfirm?.content[0]?.text).toContain('sap_payments_register_agent');
    } finally {
      rmSync(walletPath, { force: true });
      if (previous === undefined) {
        delete process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
      } else {
        process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = previous;
      }
    }
  });

  it('lets hosted users update SAP agent metadata through the local sap_payments bridge', async () => {
    const previous = process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
    process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = 'true';
    const keypair = Keypair.generate();
    const walletPath = join(mkdtempSync(join(tmpdir(), 'sap-mcp-payments-update-')), 'agent-keypair.json');
    writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)), 'utf-8');

    try {
      const server = registeredServer(await createSapMcpServer(baseConfig({
        mode: 'local-dev-keypair',
        walletPath,
      })));
      const tool = (server.tools ?? []).find((item) => item.name === 'sap_payments_update_agent');

      expect(tool?.description).toContain('hosted_local_signer_required');
      expect(tool?.description).toContain('agent picture/profile metadata updates');
      expect(tool?.description).toContain('confirm: true');
      expect(tool?.inputSchema?.properties).toHaveProperty('agentUri');
      expect(tool?.inputSchema?.properties).toHaveProperty('metadataUri');
      expect(tool?.inputSchema?.properties).toHaveProperty('capabilities');
      expect(tool?.inputSchema?.properties).toHaveProperty('confirm');

      const missingConfirm = await server.toolHandlers?.sap_payments_update_agent({
        agentUri: 'https://kommodo.ai/i/DTcPUOAXmna57enD3pPG',
        confirm: false,
      });
      const missingField = await server.toolHandlers?.sap_payments_update_agent({
        confirm: true,
      });

      expect(missingConfirm?.content[0]?.text).toContain('confirm: true is required');
      expect(missingConfirm?.content[0]?.text).toContain('hostedX402Charged');
      expect(missingConfirm?.content[0]?.text).toContain('sap_payments_update_agent');
      expect(missingField?.content[0]?.text).toContain('At least one update field is required');
    } finally {
      rmSync(walletPath, { force: true });
      if (previous === undefined) {
        delete process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
      } else {
        process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = previous;
      }
    }
  });

  it('plans SAP agent identity writes without requiring a full registration payload', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const response = await server.toolHandlers?.sap_agent_identity_plan({
      intendedAction: 'update',
      metadataUri: 'https://kommodo.ai/i/DTcPUOAXmna57enD3pPG',
      imageUrl: 'https://kommodo.ai/i/DTcPUOAXmna57enD3pPG/image.png',
      snsDomain: 'solking.sol',
    });
    const plan = JSON.parse(response?.content[0]?.text ?? '{}');

    expect(plan.intendedAction).toBe('update');
    expect(plan.normalizedRegistration).toBeNull();
    expect(plan.normalizedUpdate.agentUri).toBe('https://kommodo.ai/i/DTcPUOAXmna57enD3pPG');
    expect(plan.nextTools.update).toBe('sap_payments_update_agent');
    expect(plan.nextTools.sns).toContain('sap_sns_check_domain');
    expect(plan.verificationChecklist).toContain('For update, verify every intended replacement field because arrays are full replacements.');
    expect(plan.forbiddenActions).toContain('Do not read keypair JSON.');
  });

  it('exposes SAP protocol invariants before registry writes', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const response = await server.toolHandlers?.sap_protocol_invariants({});
    const invariants = JSON.parse(response?.content[0]?.text ?? '{}');

    expect(invariants.protocol.programId).toBe('SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ');
    expect(invariants.registrationFee.sourceExpected).toBe(true);
    expect(invariants.registrationFee.treasury).toBe('J7PyZAGKvprCz4SQ5DKBLAHstJxgVqZcz6kguUoWpP7P');
    expect(invariants.registrationFee.lamports).toBe('100000000');
    expect(invariants.registrationFee.failureStatus).toBe('missing_or_underpaid');
    expect(invariants.hostedWritePolicy.noChargeRule).toContain('not a paid failure');
    expect(invariants.localSignerRoutes.registerAgent).toBe('sap_payments_register_agent');
    expect(invariants.localSignerRoutes.updateAgent).toBe('sap_payments_update_agent');
    expect(invariants.forbiddenActions).toContain('Do not read keypair JSON.');
  });

  it('lets the local sap_payments bridge finalize unsigned hosted transactions without scripts', async () => {
    const previous = process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
    process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = 'true';
    const keypair = Keypair.generate();
    const walletPath = join(mkdtempSync(join(tmpdir(), 'sap-mcp-payments-finalize-')), 'agent-keypair.json');
    writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)), 'utf-8');

    try {
      const server = registeredServer(await createSapMcpServer(baseConfig({
        mode: 'local-dev-keypair',
        walletPath,
      })));

      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: keypair.publicKey,
        lamports: 1,
      }));
      tx.recentBlockhash = '11111111111111111111111111111111';
      tx.feePayer = keypair.publicKey;

      const transactionBase64 = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }).toString('base64');

      const missingConfirm = await server.toolHandlers?.sap_payments_finalize_transaction({
        transactionBase64,
        confirm: false,
      });
      const finalized = await server.toolHandlers?.sap_payments_finalize_transaction({
        transactionBase64,
        confirm: true,
        submit: false,
        intentId: 'test-private-swap',
      });

      expect(missingConfirm?.content[0]?.text).toContain('confirm: true is required');
      const parsed = JSON.parse(finalized?.content[0]?.text ?? '{}');
      expect(parsed).toMatchObject({
        success: true,
        action: 'preview-sign',
        submitted: false,
        signerPublicKey: keypair.publicKey.toBase58(),
        encoding: 'base64',
        audit: {
          intentId: 'test-private-swap',
          signedLocally: true,
          secretMaterial: 'keypair-bytes-never-returned',
        },
      });
      expect(parsed.signedTransaction).toEqual(expect.any(String));
      expect(parsed.audit.rule).toContain('No temporary scripts');
    } finally {
      rmSync(walletPath, { force: true });
      if (previous === undefined) {
        delete process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
      } else {
        process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = previous;
      }
    }
  });

  it('adds SAP usage context to bridge, Metaplex, and agent registry tools', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const toolsByName = new Map((server.tools ?? []).map((tool) => [tool.name, tool]));

    expect(toolsByName.get('bridging_bridgeWormhole')?.description).toContain('SAP MCP context');
    expect(toolsByName.get('bridging_bridgeWormhole')?.description).toContain('cross-chain asset movement');
    expect(toolsByName.get('metaplex-nft_mintNFT')?.description).toContain('SAP MCP context');
    expect(toolsByName.get('metaplex-nft_mintNFT')?.description).toContain('sap_payments_register_agent');
    expect(toolsByName.get('sap_register_agent')?.description).toContain('Deprecated raw SDK wrapper');
    expect(toolsByName.get('sap_register_agent')?.description).toContain('sap_payments_register_agent');
  });

  it('exposes registry-grade tool metadata for discovery clients', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const tools = server.tools ?? [];

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.title, `${tool.name} title`).toBeTruthy();
      expect(tool.description, `${tool.name} description`).toBeTruthy();
      expect(tool.inputSchema, `${tool.name} inputSchema`).toMatchObject({ type: 'object' });
      expect(tool.outputSchema, `${tool.name} outputSchema`).toMatchObject({ type: 'object' });
      for (const [parameterName, parameterSchema] of Object.entries(tool.inputSchema?.properties ?? {})) {
        expect(
          parameterSchema.description ?? parameterSchema.title,
          `${tool.name}.${parameterName} parameter description`
        ).toBeTruthy();
      }
      expect(tool.annotations, `${tool.name} annotations`).toMatchObject({
        title: tool.title,
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        idempotentHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      });
    }
  });

  it('adds intent-level routing guidance to tool descriptions and input schemas', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const toolsByName = new Map((server.tools ?? []).map((tool) => [tool.name, tool]));

    const paidRead = toolsByName.get('jupiter_getHoldings');
    const hostedWrite = toolsByName.get('sap_register_agent');
    const localBridge = toolsByName.get('sap_payments_call_paid_tool');
    const builder = toolsByName.get('sap_escrow_build_create_transaction');

    expect(paidRead?.description).toContain('SAP MCP execution guidance');
    expect(paidRead?.description).toContain('paid read-premium');
    expect(paidRead?.description).toContain('sap_payments_call_paid_tool');
    expect(paidRead?.inputSchema?.description).toContain('Use exact field names');

    expect(hostedWrite?.description).toContain('Hosted accountless routing');
    expect(hostedWrite?.description).toContain('sap_payments_register_agent');
    expect(hostedWrite?.description).toContain('no x402 payment should be charged');

    expect(localBridge?.description).toContain('local sap_payments bridge');
    expect(localBridge?.description).toContain('must never expose keypair bytes');
    expect(localBridge?.inputSchema?.properties?.maxPriceUsd?.description).toContain('safety cap');

    expect(builder?.description).toContain('hosted-safe builder');
    expect(builder?.description).toContain('sap_payments_finalize_transaction');
    expect(builder?.description).toContain('never create temporary signing scripts');
  });

  it('maps bridge and Metaplex AgentKit writes to transaction permissions', async () => {
    await createSapMcpServer(baseConfig());

    expect(getRequiredPermission('bridging_bridgeWormholeStatus')).toBe('registry:read');
    expect(getRequiredPermission('bridging_bridgeDeBridgeStatus')).toBe('registry:read');
    expect(getRequiredPermission('bridging_bridgeWormhole')).toBe('transaction:submit');
    expect(getRequiredPermission('bridging_bridgeDeBridge')).toBe('transaction:submit');
    expect(getRequiredPermission('metaplex-nft_mintNFT')).toBe('transaction:submit');
    expect(getRequiredPermission('metaplex-nft_updateMetadata')).toBe('transaction:submit');
  });

  it('keeps explicit permission mappings aligned with registered tools', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const names = new Set((server.tools ?? []).map((tool) => tool.name));
    const staleMappings = getPermissionMappedTools().filter((toolName) => !names.has(toolName));

    expect(staleMappings).toEqual([]);
  });

  it('explains hosted remote signing as non-custodial instead of broken', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig({
      mode: 'hosted-api',
      enableHttp: false,
    })));

    const response = await server.toolHandlers?.sap_profile_current({});
    const profile = JSON.parse(response?.content[0]?.text ?? '{}') as {
      connectionSummary?: {
        status?: string;
        accountModel?: string;
        localProfileStatus?: string;
        localProfileVisibleToHostedServer?: boolean;
        localProfileTool?: string;
        userMessage?: string;
      };
      loadedProfile?: string | null;
      activeProfile?: string | null;
      accountModel?: string;
      runtime?: { signerConfigured?: boolean; localProfileStatus?: string; important?: string };
      profile?: {
        name?: string | null;
        configPath?: string | null;
        accountModel?: string;
        localProfileVisibility?: string;
        localProfileTool?: string;
      };
      hostedRemote?: {
        canonicalEndpoint?: string;
        accountModel?: string;
        localProfileVisibility?: string;
        localProfileStatus?: string;
        localProfileTool?: string;
        serverStoresUserKeypairs?: boolean;
        signerStatus?: string;
        writeAccess?: string;
        paidToolBehavior?: string;
        localFallbackPolicy?: string;
        doNotSummarizeAs?: string[];
      };
    };

    expect(profile.connectionSummary).toMatchObject({
      status: 'connected',
      accountModel: 'hosted-remote-accountless',
      localProfileStatus: 'unknown-to-hosted-server-not-missing',
      localProfileVisibleToHostedServer: false,
      localProfileTool: 'sap_payments.sap_payments_profile_current',
    });
    expect(profile.connectionSummary?.userMessage).toContain('cannot prove whether the user local SAP profile exists');
    expect(profile.loadedProfile).toBeNull();
    expect(profile.activeProfile).toBeNull();
    expect(profile.accountModel).toBe('hosted-remote-accountless');
    expect(profile.runtime?.signerConfigured).toBe(false);
    expect(profile.runtime?.localProfileStatus).toBe('unknown-to-hosted-server-not-missing');
    expect(profile.runtime?.important).toContain('does not mean the user local SAP profile is missing');
    expect(profile.profile).toMatchObject({
      name: null,
      configPath: null,
      accountModel: 'hosted-remote-accountless',
      localProfileVisibility: 'not-visible-to-hosted-server',
      localProfileTool: 'sap_payments.sap_payments_profile_current',
    });
    expect(profile.hostedRemote).toMatchObject({
      canonicalEndpoint: 'https://mcp.sap.oobeprotocol.ai/mcp',
      accountModel: 'hosted-remote-accountless',
      localProfileVisibility: 'not-visible-to-hosted-server',
      localProfileStatus: 'unknown-to-hosted-server-not-missing',
      localProfileTool: 'sap_payments.sap_payments_profile_current',
      serverStoresUserKeypairs: false,
      signerStatus: 'server-non-custodial-user-signer-required',
      writeAccess: 'available-after-user-signature-and-payment-proof',
      paidToolBehavior: 'returns-402-x402-payment-required-before-execution',
      localFallbackPolicy: 'do-not-use-local-stdio-unless-user-explicitly-asks',
    });
    expect(profile.hostedRemote?.doNotSummarizeAs).toContain('signer not configured');
    expect(profile.hostedRemote?.doNotSummarizeAs).toContain('read-only only');
    const toolNames = (server.tools ?? []).map((tool) => tool.name);
    expect(toolNames).not.toContain('sap_payments_profile_current');
    expect(toolNames).not.toContain('sap_payments_call_paid_tool');
    expect(toolNames).not.toContain('sap_payments_call_external_x402');
    expect(toolNames).not.toContain('sap_payments_register_agent');
    expect(toolNames).not.toContain('sap_payments_update_agent');
    expect(toolNames).not.toContain('sap_payments_prepare_challenge');
    expect(toolNames).not.toContain('sap_payments_sign_challenge');
    expect(toolNames).not.toContain('sap_payments_verify_receipt');
    expect(toolNames).not.toContain('sap_x402_paid_call');
  });

  it('previews and signs a Solana transaction with the dedicated local keypair signer', async () => {
    const keypair = Keypair.generate();
    const walletPath = join(mkdtempSync(join(tmpdir(), 'sap-mcp-test-')), 'agent-keypair.json');
    writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)), 'utf-8');

    const server = registeredServer(await createSapMcpServer(baseConfig({
      mode: 'local-dev-keypair',
      walletPath,
    })));

    const tx = new Transaction().add(SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: keypair.publicKey,
      lamports: 1,
    }));
    tx.recentBlockhash = '11111111111111111111111111111111';
    tx.feePayer = keypair.publicKey;

    const transaction = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');

    const preview = await server.toolHandlers?.sap_preview_transaction({
      transaction,
      encoding: 'base64',
    });
    const signed = await server.toolHandlers?.sap_sign_transaction({
      transaction,
      encoding: 'base64',
    });

    expect(preview).toBeDefined();
    expect(signed).toBeDefined();
    expect(JSON.parse(preview?.content[0]?.text ?? '{}')).toMatchObject({
      canSign: true,
      signer: keypair.publicKey.toBase58(),
    });
    expect(JSON.parse(signed?.content[0]?.text ?? '{}')).toMatchObject({
      success: true,
      publicKey: keypair.publicKey.toBase58(),
    });
  });

  it('blocks signing native SOL transfers that require approval', async () => {
    const keypair = Keypair.generate();
    const recipient = Keypair.generate();
    const walletPath = join(mkdtempSync(join(tmpdir(), 'sap-mcp-test-')), 'agent-keypair.json');
    writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)), 'utf-8');

    const server = registeredServer(await createSapMcpServer(baseConfig({
      mode: 'local-dev-keypair',
      walletPath,
      requireApprovalAboveSol: 1,
      maxTxValueSol: 10,
    })));

    const tx = new Transaction().add(SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: recipient.publicKey,
      lamports: 2_000_000_000,
    }));
    tx.recentBlockhash = '11111111111111111111111111111111';
    tx.feePayer = keypair.publicKey;

    const transaction = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');

    const signed = await server.toolHandlers?.sap_sign_transaction({
      transaction,
      encoding: 'base64',
    });

    expect(signed?.content[0]?.text).toContain('requires approval');
  });

  it('exposes profile tools without leaking local keypair paths', async () => {
    const originalEnv = { ...process.env };
    const configHome = mkdtempSync(join(tmpdir(), 'sap-mcp-profile-tools-'));
    const keypair = Keypair.generate();
    const walletPath = join(mkdtempSync(join(tmpdir(), 'sap-mcp-test-')), 'agent-keypair.json');
    writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)), 'utf-8');

    try {
      const configDir = join(configHome, 'mcp-sap');
      mkdirSync(configDir, { recursive: true });
      process.env.XDG_CONFIG_HOME = configHome;
      process.env.SAP_MCP_PROFILE = 'default';
      process.env.SAP_MCP_CONFIG_PATH = join(configDir, 'config.json');

      const server = registeredServer(await createSapMcpServer(baseConfig({
        mode: 'local-dev-keypair',
        walletPath,
      })));

      const current = await server.toolHandlers?.sap_profile_current({});
      const text = current?.content[0]?.text ?? '';

      expect(text).toContain('never-exposed');
      expect(text).not.toContain(walletPath);
      expect(text).not.toContain('agent-keypair.json');
      expect(text).not.toContain('walletPath');
      expect(text).not.toContain('secretKey');
    } finally {
      process.env = originalEnv;
      rmSync(configHome, { recursive: true, force: true });
    }
  });

  it('redacts RPC query secrets from profile metadata tools', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig({
      rpcUrl: 'https://rpc.example.com/?api_key=sk_live_super_secret&region=mainnet',
    })));

    const current = await server.toolHandlers?.sap_profile_current({});
    const text = current?.content[0]?.text ?? '';

    expect(text).toContain('api_key=%5BREDACTED%5D');
    expect(text).toContain('region=mainnet');
    expect(text).not.toContain('sk_live_super_secret');
  });

  it('exposes bundled skill tools with dry-run install by default', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));

    const list = await server.toolHandlers?.sap_skills_list({});
    const bundle = await server.toolHandlers?.sap_skills_bundle({ includeContents: false });
    const install = await server.toolHandlers?.sap_skills_install({
      agent: 'custom',
      targetDir: join(tmpdir(), 'sap-mcp-skills-test'),
      confirm: false,
    });

    const listText = list?.content[0]?.text ?? '';
    const bundleText = bundle?.content[0]?.text ?? '';
    const installText = install?.content[0]?.text ?? '';

    expect(listText).toContain('sap-mcp');
    expect(listText).toContain('sap-sns');
    expect(bundleText).toContain('TOOL_REFERENCE.md');
    expect(installText).toContain('"dryRun": true');
    expect(installText).toContain('requiresConfirmation');
  });

  it('exposes a free SAP MCP startup playbook for agent runtimes', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));

    const start = await server.toolHandlers?.sap_agent_start({ goal: 'check wallet balance' });
    const text = start?.content[0]?.text ?? '';

    expect(text).toContain('Start SAP MCP');
    expect(text).toContain('sap_skills_bundle');
    expect(text).toContain('sap_payments_readiness');
    expect(text).toContain('sap_payments_call_paid_tool');
    expect(text).toContain('sap_skills_upgrade_plan');
    expect(text).toContain('sap_runtime_repair_plan');
    expect(text).toContain('https://mcp.sap.oobeprotocol.ai/mcp');
    expect(text).toContain('connectionCheck');
    expect(text).toContain('Do not list all tools or categories');
    expect(start?.structuredContent?.success).toBe(true);
    expect(start?.structuredContent?.repairCommand).toContain('sap-mcp-config repair');
  });

  it('returns structured SAP startup content through the MCP tools/call handler', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const callTool = server._requestHandlers?.get('tools/call');

    expect(callTool).toBeDefined();

    const start = await callTool?.(
      {
        method: 'tools/call',
        params: {
          name: 'sap_agent_start',
          arguments: { goal: 'register an agent' },
        },
      },
      {},
    );

    expect(start?.structuredContent?.success).toBe(true);
    expect(start?.structuredContent).not.toHaveProperty('content');
    expect(start?.structuredContent?.immediateToolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'sap_protocol_invariants' }),
        expect.objectContaining({ tool: 'sap_agent_identity_plan' }),
      ]),
    );
  });

  it('exposes free maintenance plans for skill upgrades and runtime repair', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));

    const upgrade = await server.toolHandlers?.sap_skills_upgrade_plan({ agent: 'codex' });
    const repair = await server.toolHandlers?.sap_runtime_repair_plan({ agent: 'codex' });

    expect(upgrade?.structuredContent?.success).toBe(true);
    expect(upgrade?.structuredContent?.latestVersion).toBe(MCP_SERVER_VERSION);
    expect(upgrade?.content[0]?.text).toContain('sap_skills_bundle');
    expect(repair?.structuredContent?.repairCommand).toContain('sap-mcp-config repair');
    expect(repair?.content[0]?.text).toContain('sap_payments_call_paid_tool');
  });

  it('does not install skill files from hosted-api mode', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig({
      mode: 'hosted-api',
    })));

    const install = await server.toolHandlers?.sap_skills_install({
      agent: 'custom',
      targetDir: join(tmpdir(), 'sap-mcp-hosted-skills-test'),
      confirm: true,
    });

    const installText = install?.content[0]?.text ?? '';

    expect(install?.isError).toBe(true);
    expect(installText).toContain('Hosted SAP MCP cannot install files');
    expect(installText).toContain('sap_skills_bundle');
  });
});
