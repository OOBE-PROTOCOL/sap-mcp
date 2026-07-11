/**
 * MagicBlock tools smoke test
 *
 * Verifies that all 20 MagicBlock tools are registered correctly
 * and that the registration function completes without errors.
 * Tool execution is tested via integration tests with a running server.
 */

import { describe, expect, it } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerMagicBlockTools } from '../magicblock-tools.js';
import type { SapMcpContext } from '../../core/types.js';

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

    // The sdk-compat layer stores tools on the server instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (server as any);
    const tools = store.tools ?? [];
    const mbTools = tools.filter((t: { name: string }) => t.name.startsWith('magicblock_'));
    expect(mbTools).toHaveLength(20);
  });

  it('registers all 6 ER Router tools', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any).tools ?? [];
    const names = tools.map((t: { name: string }) => t.name);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any).tools ?? [];
    const names = tools.map((t: { name: string }) => t.name);
    const expected = [
      'magicblock_health',
      'magicblock_challenge',
      'magicblock_login',
      'magicblock_balance',
      'magicblock_privateBalance',
      'magicblock_deposit',
      'magicblock_transfer',
      'magicblock_withdraw',
      'magicblock_swapQuote',
      'magicblock_swap',
      'magicblock_initializeMint',
      'magicblock_isMintInitialized',
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('registers 2 VRF tools', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any).tools ?? [];
    const names = tools.map((t: { name: string }) => t.name);
    expect(names).toContain('magicblock_requestRandomness');
    expect(names).toContain('magicblock_getRandomnessResult');
  });

  it('every tool has a description with price info', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any).tools ?? [];
    const mbTools = tools.filter((t: { name: string }) => t.name.startsWith('magicblock_'));
    expect(mbTools).toHaveLength(20);

    for (const tool of mbTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
      // Every description must include a price ($0.01 or $0.05)
      expect(tool.description).toMatch(/\$0\.\d{2}/);
    }
  });

  it('every tool has an inputSchema with type: object', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any).tools ?? [];
    const mbTools = tools.filter((t: { name: string }) => t.name.startsWith('magicblock_'));
    for (const tool of mbTools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it('READ tools have $0.01 in description (14 tools)', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any).tools ?? [];
    const readTools = tools.filter((t: { name: string; description: string }) =>
      t.name.startsWith('magicblock_') && t.description.includes('$0.01'),
    );
    expect(readTools).toHaveLength(14);
  });

  it('WRITE tools have $0.05 in description (6 tools)', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any).tools ?? [];
    const writeTools = tools.filter((t: { name: string; description: string }) =>
      t.name.startsWith('magicblock_') && t.description.includes('$0.05'),
    );
    expect(writeTools).toHaveLength(6);
  });

  it('every tool has a handler registered', () => {
    const server = createServer();
    registerMagicBlockTools(server, createMockContext());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (server as any);
    const handlers = store.toolHandlers ?? {};
    const mbHandlerNames = Object.keys(handlers).filter((n) => n.startsWith('magicblock_'));
    expect(mbHandlerNames).toHaveLength(20);
  });
});