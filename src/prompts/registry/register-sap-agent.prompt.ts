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
    
    logger.info('Registering SAP agent', { agentType, network, includeSNS });
    
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
      'Before registering, verify your agent identity:',
      '',
      '```bash',
      '# Check public agent identity only',
      'npx sap-mcp-config pubkey',
      '```',
      '',
      'Your **agentPubkey** is automatically extracted from your wallet and saved in config.',
      'This is the public key that will be registered on-chain. Never read or print keypair JSON bytes.',
      '',
      '## Prerequisites',
      '',
      '1. **Solana Wallet** with SOL for fees',
      '2. **MCP Server** configured (run `npx sap-mcp-config wizard`)',
      '3. **Dedicated signer** configured by the SAP MCP profile',
      '4. **Agent Pubkey** visible in config (`agentPubkey` field)',
      '',
      '## Step 1: Configure MCP Server',
      '',
      '```bash',
      '# Run interactive wizard (auto-extracts agentPubkey)',
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
      '  Agent Public Key: 8xKjPqN9vM2wR5tL3hF6yQ4sD7cB1aE9uY0pZ2iO3mX4',
      '  Save this pubkey for your agent registration!',
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
      'Use the MCP tool `sap_register_agent`. The SAP MCP server will sign with the configured profile signer internally.',
      '',
      'Do **not** read `SAP_WALLET_PATH`, do **not** open keypair JSON files, and do **not** print private key bytes.',
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
      '```bash',
      '# Fetch agent PDA',
      'solana account <AGENT_PDA> --url ' + rpcUrl + ' --output json',
      '',
      '# Or use resource endpoint',
      'curl sap://registry/agent/<YOUR_WALLET>',
      '```',
      '',
    ];
    
    if (includeSNS) {
      content.push(
        '## Step 5 (Optional): Register SNS Domain',
        '',
        'Use `sap_sns_check_domain` to verify availability, then `sap_sns_build_register_domain_transaction` for unsigned registration or `sap_sns_register_agent_domain` when the MCP profile is in `local-dev-keypair` mode.',
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
      '| Mainnet | ~0.01 SOL | ~0.1 SOL | ~0.11 SOL |',
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
  
  logger.info('Register SAP Agent prompt registered');
}
