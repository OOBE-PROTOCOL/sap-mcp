/**
 * MagicBlock tools smoke test
 *
 * Verifies that all 20 MagicBlock tools are registered correctly
 * and that the registration function completes without errors.
 */

import { describe, expect, it } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerMagicBlockTools } from '../magicblock-tools.js';
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

  it('every tool has a description with price info', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const mbTools = getMagicBlockTools(server);
    expect(mbTools).toHaveLength(20);
    for (const tool of mbTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.description).toMatch(/\$0\.\d{2}/);
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

  it('READ tools have $0.01 in description (14 tools)', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const readTools = getMagicBlockTools(server).filter((t) => t.description.includes('$0.01'));
    expect(readTools).toHaveLength(14);
  });

  it('WRITE tools have $0.05 in description (6 tools)', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const writeTools = getMagicBlockTools(server).filter((t) => t.description.includes('$0.05'));
    expect(writeTools).toHaveLength(6);
  });

  it('every tool has a handler registered', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());
    const handlers = getMagicBlockHandlers(server);
    expect(Object.keys(handlers)).toHaveLength(20);
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