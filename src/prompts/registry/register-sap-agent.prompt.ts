/**
 * Register SAP Agent Prompt
 * 
 * Guides users through SAP agent registration process.
 * REAL IMPLEMENTATION — Step-by-step wizard
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';

/**
 * Executes the register sap agent prompt operation.
 */
export function registerSapAgentPrompt(server: Server, _context: SapMcpContext) {
  registerPrompt(server, 'register-sap-agent', {}, {
    description: 'Step-by-step guide to register as SAP agent on Solana blockchain',
    arguments: [
      {
        name: 'agentType',
        description: 'Type of agent: "citizen", "merchant", "hybrid" (default: "citizen")',
        required: false,
      },
      {
        name: 'network',
        description: 'Solana network: "mainnet", "devnet", "testnet" (default: "devnet")',
        required: false,
      },
      {
        name: 'includeSNS',
        description: 'Register SNS domain: "yes", "no" (default: "no")',
        required: false,
      },
    ],
  }, async (args) => {
    const agentType = (args.agentType as string) || 'citizen';
    const network = (args.network as string) || 'devnet';
    const includeSNS = (args.includeSNS as string) === 'yes';
    
    logger.debug('Registering SAP agent', { agentType, network, includeSNS });
    
    const rpcUrl = network === 'mainnet' 
      ? 'https://api.mainnet-beta.solana.com'
      : network === 'testnet'
      ? 'https://api.testnet.solana.com'
      : 'https://api.devnet.solana.com';
    
    const content = [
      '# SAP Agent Registration Guide',
      '',
      '## Configuration',
      '',
      '- **Agent Type**: ' + agentType,
      '- **Network**: ' + network + ' (`' + rpcUrl + '`)',
      '- **SNS Domain**: ' + (includeSNS ? 'Yes (optional)' : 'No'),
      '',
      '## ⚡ Quick Start: Check Your Config',
      '',
      'Before registering, verify the local SAP profile and signer without reading keypair bytes:',
      '',
      '```bash',
      '# Check profile metadata only',
      'npx sap-mcp-config show',
      '```',
      '',
      'The on-chain SAP agent is owned by the wallet public key from the active local SAP profile.',
      'Never read or print keypair JSON bytes. Agents should use `sap_payments_profile_current` for local profile status when available.',
      '',
      '## Prerequisites',
      '',
      '1. **Solana Wallet** with SOL for fees',
      '2. **MCP Server** configured (run `npx sap-mcp-config wizard`)',
      '3. **Dedicated signer** configured by the SAP MCP profile',
      '4. **Local sap_payments bridge** ready when using hosted SAP MCP',
      '',
      '## Step 1: Configure MCP Server',
      '',
      '```bash',
      '# Run interactive wizard',
      'npx sap-mcp-config wizard',
      '',
      '# Select mode:',
      '#   - local-dev-keypair (development)',
      '#   - delegated-session (production)',
      '#   - external-signer (Ledger/Fireblocks)',
      '#   - hosted-api (remote HTTP)',
      '```',
      '',
      'After wizard completes, you\'ll see:',
      '```',
      '✓ Configuration saved to ~/.config/mcp-sap/config-gianni-market-nft-agent.json',
      '✓ Dedicated signer configured for profile gianni-market-nft-agent',
      '',
      '  Local signer public key: 8xKjPqN9vM2wR5tL3hF6yQ4sD7cB1aE9uY0pZ2iO3mX4',
      '  Use this wallet public key for profile checks and post-registration verification.',
      '```',
      '',
      '## Step 2: Fund Wallet',
      '',
      '```bash',
      '# Check balance',
      'solana balance --url ' + rpcUrl + '',
      '',
      '# Request airdrop (devnet only)',
      'solana airdrop 1 --url ' + rpcUrl + '',
      '```',
      '',
      '## Step 3: Register Agent On-Chain',
      '',
      'First call `sap_protocol_invariants` and `sap_agent_identity_plan` when available. Use `sap_register_agent` only when the active SAP MCP server is local or has an external signer. Hosted accountless SAP MCP cannot sign on-chain registration and will reject direct registration before x402 payment. If the user is connected to hosted SAP MCP, call local `sap_payments_register_agent` with the same fields and `confirm: true` instead of paying/retrying the hosted direct write.',
      '',
      'Do **not** read `SAP_WALLET_PATH`, do **not** open keypair JSON files, do **not** create temporary signing scripts, and do **not** print private key bytes.',
      '',
      'Tool input:',
      '```json',
      '{',
      '  "name": "My SAP Agent",',
      '  "description": "AI agent with SAP Protocol integration",',
      '  "capabilities": [',
      '    { "id": "identity:read", "description": null, "protocolId": "sap", "version": "1.0" },',
      '    { "id": "memory:write", "description": null, "protocolId": "sap", "version": "1.0" }',
      '  ],',
      '  "pricing": [],',
      '  "protocols": ["sap"],',
      '  "agentId": "' + agentType + '-agent",',
      '  "agentUri": "https://my-agent.example.com/agent.json",',
      '  "x402Endpoint": "https://my-agent.example.com/x402"',
      '}',
      '```',
      '',
      '## Step 4: Verify Registration',
      '',
      'After `sap_payments_register_agent`, verify:',
      '',
      '- `success: true` means the SAP agent account was confirmed on-chain and the source-level protocol registration fee invariant was verified.',
      '- `agentPda` is present and fetchable with `sap_get_agent_profile` by owner wallet.',
      '- `protocolFee.status` reports whether the source-level protocol registration fee was observed in the landed transaction.',
      '- `success: false` with `agentRegistered: true` means the account can exist, but SAP registration is not protocol-complete.',
      '- `protocolComplete: false` means the deployed program did not credit the expected protocol treasury fee or the fee audit could not verify it; do not retry automatically.',
      '',
    ];
    
    if (includeSNS) {
      content.push(
        '## Step 5 (Optional): Register SNS Domain',
        '',
        'Use `sap_sns_check_domain` to verify availability. Hosted accountless SAP MCP cannot directly register a .sol domain because the purchase requires the user wallet signature, so do not call hosted `sap_sns_register_agent_domain` after paying x402. Run `sap_sns_register_agent_domain` only from a local SAP MCP profile with `local-dev-keypair` or an external signer. For hosted record changes, use `sap_sns_build_manage_record_transaction`, preview the unsigned transaction, then finalize locally with `sap_payments_finalize_transaction`.',
        '',
      );
    }
    
    content.push(
      '## Step 6: Test Agent',
      '',
      '```bash',
      '# Start MCP server',
      'npx sap-mcp-server',
      '',
      '# In Claude Desktop or MCP client:',
      '# "Register me as SAP agent"',
      '# "Show my agent capabilities"',
      '# "Execute tool: swap SOL to USDC"',
      '```',
      '',
      '## Registration Fees',
      '',
      '| Network | Agent Registration | SNS Domain | Total |',
      '|---------|-------------------|------------|-------|',
      '| Devnet | ~0.001 SOL (test) | ~0.001 SOL | ~0.002 SOL |',
      '| Testnet | ~0.001 SOL (test) | ~0.001 SOL | ~0.002 SOL |',
      '| Mainnet | source-level invariant expects 0.1 SOL protocol fee, but agents must verify `protocolFee.status` on the returned registration audit | SNS fees are paid in USDC plus SOL rent/tx fees | audit first |',
      '',
      '## Post-Registration',
      '',
      'After registration:',
      '',
      '1. ✅ **Agent PDA** created on-chain',
      '2. ✅ **Capabilities** registered',
      '3. ✅ **Memory vault** initialized',
      '4. ✅ **Reputation tracking** enabled',
      '5. ⏳ **Build reputation** by executing tools successfully',
      '',
      '## Troubleshooting',
      '',
      '### "Insufficient funds"',
      '- Request airdrop (devnet): `solana airdrop 1`',
      '- Fund wallet with SOL (mainnet)',
      '',
      '### "Agent already registered"',
      '- Each wallet can register ONE agent',
      '- Close existing agent first: `agent_close` instruction',
      '',
      '### "Invalid capabilities"',
      '- Use valid capability strings',
      '- Check SAP SDK documentation',
      '',
      '## Resources',
      '',
      '- SAP SDK: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk',
      '- Documentation: https://oobeprotocol.ai/docs',
      '- Discord: https://discord.gg/oobeprotocol',
    );
    
    return {
      messages: [{
        role: 'assistant',
        content: {
          type: 'text',
          text: content.join('\n'),
        },
      }],
    };
  });
  
  logger.debug('Register SAP Agent prompt registered');
}
