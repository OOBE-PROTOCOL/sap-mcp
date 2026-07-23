/**
 * MagicBlock tools smoke test
 *
 * Verifies that all 20 MagicBlock tools are registered correctly
 * and that the registration function completes without errors.
 */

import { describe, expect, it } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerMagicBlockTools, sanitizeSwapQuoteResponse, type SwapQuoteResponse } from '../magicblock-tools.js';
import type { SapMcpContext } from '../../core/types.js';

// ─── Typed interface for the MCP server's internal tool store ─────

interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: string;
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[];
  };
}

interface RegisteredServer extends Server {
  tools?: RegisteredTool[];
  toolHandlers?: Record<string, (input: unknown) => Promise<unknown>>;
}

// ─── Mock context ────────────────────────────────────────────────

function createMockContext(): SapMcpContext {
  return {
    config: {
      rpcUrl: 'https://api.devnet.solana.com',
      commitment: 'confirmed',
      mode: 'local-dev-keypair',
      programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
      allowedTools: 'all',
      walletPath: undefined,
    },
    connection: {} as never,
    sapClient: {} as never,
    signer: null,
    policyEngine: {
      checkPermission: async () => ({ allowed: true }),
    } as never,
    session: null,
  } as unknown as SapMcpContext;
}

function createServer(): Server {
  return new Server(
    { name: 'test-server', version: '0.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );
}

function getMagicBlockTools(server: Server): RegisteredTool[] {
  const registered = server as RegisteredServer;
  return (registered.tools ?? []).filter((t) => t.name.startsWith('magicblock_'));
}

function getMagicBlockHandlers(server: Server): Record<string, (input: unknown) => Promise<unknown>> {
  const registered = server as RegisteredServer;
  const all = registered.toolHandlers ?? {};
  const mbHandlers: Record<string, (input: unknown) => Promise<unknown>> = {};
  for (const [name, handler] of Object.entries(all)) {
    if (name.startsWith('magicblock_')) mbHandlers[name] = handler;
  }
  return mbHandlers;
}

function responseText(response: unknown): string {
  const typed = response as { content?: Array<{ text?: string }> };
  return typed.content?.[0]?.text ?? '';
}

// ═══════════════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════════════

describe('MagicBlock tools registration', () => {
  it('registerMagicBlockTools completes without throwing', () => {
    const server = createServer();
    expect(() => registerMagicBlockTools(server, createMockContext())).not.toThrow();
  });

  it('registers tools in the server store (20 magicblock_ tools)', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    expect(getMagicBlockTools(server)).toHaveLength(20);
  });

  it('registers all 6 ER Router tools', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const names = getMagicBlockTools(server).map((t) => t.name);
    expect(names).toContain('magicblock_getRoutes');
    expect(names).toContain('magicblock_getIdentity');
    expect(names).toContain('magicblock_getDelegationStatus');
    expect(names).toContain('magicblock_getAccountInfo');
    expect(names).toContain('magicblock_getBlockhashForAccounts');
    expect(names).toContain('magicblock_getSignatureStatuses');
  });

  it('registers all 12 Private Payment API tools', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const names = getMagicBlockTools(server).map((t) => t.name);
    const expected = [
      'magicblock_health', 'magicblock_challenge', 'magicblock_login',
      'magicblock_balance', 'magicblock_privateBalance',
      'magicblock_deposit', 'magicblock_transfer', 'magicblock_withdraw',
      'magicblock_swapQuote', 'magicblock_swap',
      'magicblock_initializeMint', 'magicblock_isMintInitialized',
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('registers 2 VRF tools', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const names = getMagicBlockTools(server).map((t) => t.name);
    expect(names).toContain('magicblock_requestRandomness');
    expect(names).toContain('magicblock_getRandomnessResult');
  });

  it('every tool has a useful description without embedded price literals', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const mbTools = getMagicBlockTools(server);
    expect(mbTools).toHaveLength(20);
    for (const tool of mbTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.description).not.toMatch(/\$0\.\d{2}/);
    }
  });

  it('every tool has an inputSchema with type: object', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const mbTools = getMagicBlockTools(server);
    for (const tool of mbTools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it('does not hard-code stale hosted prices in tool descriptions', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    for (const tool of getMagicBlockTools(server)) {
      expect(tool.description).not.toContain('$0.01');
      expect(tool.description).not.toContain('$0.05');
      expect(tool.description).not.toContain('50_000');
      expect(tool.description).not.toContain('10_000');
    }
  });

  it('unsigned transaction builders point agents to SAP MCP transaction tools', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const unsignedBuilders = getMagicBlockTools(server).filter((tool) => [
      'magicblock_deposit',
      'magicblock_transfer',
      'magicblock_withdraw',
      'magicblock_swap',
      'magicblock_initializeMint',
      'magicblock_requestRandomness',
    ].includes(tool.name));

    expect(unsignedBuilders).toHaveLength(6);
    for (const tool of unsignedBuilders) {
      expect(tool.description).toContain('sap_preview_transaction');
      expect(tool.description).toContain('sap_sign_transaction');
      expect(tool.description).toContain('sap_submit_signed_transaction');
    }
  });

  it('every tool has a handler registered', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const handlers = getMagicBlockHandlers(server);
    expect(Object.keys(handlers)).toHaveLength(20);
  });

  it('documents required transfer routing fields and base-unit amount type', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const transfer = getMagicBlockTools(server).find((tool) => tool.name === 'magicblock_transfer');

    expect(transfer).toBeDefined();
    expect(transfer?.inputSchema.required).toEqual(expect.arrayContaining([
      'from',
      'to',
      'mint',
      'amount',
      'visibility',
      'fromBalance',
      'toBalance',
    ]));
    expect(transfer?.inputSchema.properties.from).toMatchObject({ type: 'string' });
    expect(transfer?.inputSchema.properties.to).toMatchObject({ type: 'string' });
    expect(transfer?.inputSchema.properties.amount).toMatchObject({ type: 'number' });
  });

  it('rejects private swaps without an explicit destination before calling MagicBlock', async () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const handler = getMagicBlockHandlers(server).magicblock_swap;

    const response = await handler({
      userPublicKey: '11111111111111111111111111111111',
      visibility: 'private',
      quoteResponse: {
        inputMint: 'EikyJKSVWPK28rX5FG8KyJcSzv3D2b2Qg7VodzqQoobe',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1000',
        outAmount: '1',
        otherAmountThreshold: '1',
        swapMode: 'ExactIn',
        slippageBps: 50,
        priceImpactPct: '0',
        routePlan: [],
        contextSlot: 1,
        timeTaken: 0,
      },
    });

    expect(responseText(response)).toContain('magicblock_private_swap_destination_required');
  });

  it('fails closed for private swaps that output wSOL because shuttle delivery is unsafe', async () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const handler = getMagicBlockHandlers(server).magicblock_swap;

    const response = await handler({
      userPublicKey: '11111111111111111111111111111111',
      destination: '11111111111111111111111111111111',
      visibility: 'private',
      quoteResponse: {
        inputMint: 'EikyJKSVWPK28rX5FG8KyJcSzv3D2b2Qg7VodzqQoobe',
        outputMint: 'So11111111111111111111111111111111111111112',
        inAmount: '1000',
        outAmount: '1',
        otherAmountThreshold: '1',
        swapMode: 'ExactIn',
        slippageBps: 50,
        priceImpactPct: '0',
        routePlan: [],
        contextSlot: 1,
        timeTaken: 0,
      },
    });

    expect(responseText(response)).toContain('magicblock_private_swap_wsol_output_blocked');
  });

  it('VRF tools have real descriptions without not-yet-implemented', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const vrfTools = getMagicBlockTools(server).filter((t) =>
      t.name === 'magicblock_requestRandomness' || t.name === 'magicblock_getRandomnessResult',
    );
    expect(vrfTools).toHaveLength(2);
    for (const t of vrfTools) {
      expect(t.description).not.toContain('not yet implemented');
      expect(t.description).not.toContain('Requires @magicblock-labs');
    }
    const reqTool = vrfTools.find((t) => t.name === 'magicblock_requestRandomness');
    expect(reqTool?.description).toContain('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
    const resTool = vrfTools.find((t) => t.name === 'magicblock_getRandomnessResult');
    expect(resTool?.description).toContain('RandomnessRequest');
  });
});

describe('MagicBlock quote sanitization', () => {
  function baseQuote(routePlan: readonly unknown[]): SwapQuoteResponse {
    return {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      inAmount: '1000',
      outAmount: '1',
      otherAmountThreshold: '1',
      swapMode: 'ExactIn',
      slippageBps: 50,
      priceImpactPct: '0',
      routePlan,
      contextSlot: 1,
      timeTaken: 0,
    };
  }

  it('derives null route bps from percent instead of inventing a fixed share', () => {
    const quote = sanitizeSwapQuoteResponse(baseQuote([{ percent: 67.25, bps: null }]));

    expect(quote.routePlan[0]).toMatchObject({ bps: 6725 });
  });

  it('uses full-share bps only for unambiguous single-hop routes', () => {
    const quote = sanitizeSwapQuoteResponse(baseQuote([{ bps: null }]));

    expect(quote.routePlan[0]).toMatchObject({ bps: 10_000 });
  });

  it('fails closed for ambiguous multi-hop routes with null bps', () => {
    expect(() => sanitizeSwapQuoteResponse(baseQuote([
      { label: 'A', bps: null },
      { label: 'B', bps: 5000 },
    ]))).toThrow('magicblock_swap_quote_bps_required');
  });
});
