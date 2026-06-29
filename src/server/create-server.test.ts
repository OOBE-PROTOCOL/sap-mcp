import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createSapMcpServer } from './create-server.js';
import type { SapMcpConfig } from '../core/types.js';
import { getPermissionMappedTools } from '../security/tool-permissions.js';

interface ToolDefinitionForTest {
  name: string;
}

interface ToolResponseForTest {
  content: Array<{ text: string }>;
}

type ToolHandlerForTest = (input: Record<string, unknown>) => Promise<ToolResponseForTest>;

interface RegisteredServerForTest extends Server {
  tools?: ToolDefinitionForTest[];
  toolHandlers?: Record<string, ToolHandlerForTest>;
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

    expect(names).toHaveLength(240);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('sol_get_balance');
    expect(names).toContain('coingecko_getTokenPrice');
    expect(names).toContain('jupiter_getQuote');
    expect(names).toContain('jupiter_swap');
    expect(names).toContain('jupiter_swapInstructions');
    expect(names).toContain('jupiter_smartSwap');
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
    expect(names).toContain('sap_skills_list');
    expect(names).toContain('sap_skills_bundle');
    expect(names).toContain('sap_skills_install');
    expect(names).toContain('sap_x402_estimate_cost');
    expect(names).toContain('sap_x402_build_headers_from_escrow');
    expect(names).toContain('sap_x402_fetch_escrow');
    expect(names).toContain('sap_x402_settle_batch');
  });

  it('keeps explicit permission mappings aligned with registered tools', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const names = new Set((server.tools ?? []).map((tool) => tool.name));
    const staleMappings = getPermissionMappedTools().filter((toolName) => !names.has(toolName));

    expect(staleMappings).toEqual([]);
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
});
