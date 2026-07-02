/**
 * Analyze SAP Agent Prompt
 * 
 * Analyzes SAP agent registration, capabilities, and reputation.
 * REAL IMPLEMENTATION — Comprehensive analysis workflow
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';

/**
 * Executes the analyze sap agent prompt operation.
 */
export function analyzeSapAgentPrompt(server: Server, _context: SapMcpContext) {
  registerPrompt(server, 'analyze-sap-agent', {}, {
    description: 'Analyze SAP agent registration, capabilities, reputation, and on-chain activity',
    arguments: [
      {
        name: 'agentWallet',
        description: 'Agent wallet address to analyze',
        required: true,
      },
      {
        name: 'includeTransactions',
        description: 'Include transaction history: "yes", "no" (default: "no")',
        required: false,
      },
      {
        name: 'detailed',
        description: 'Include detailed PDA analysis: "yes", "no" (default: "no")',
        required: false,
      },
    ],
  }, async (args) => {
    const agentWallet = args.agentWallet as string;
    const includeTransactions = (args.includeTransactions as string) === 'yes';
    const detailed = (args.detailed as string) === 'yes';
    
    logger.info('Analyzing SAP agent', { agentWallet, includeTransactions, detailed });
    
    const content = [
      '# SAP Agent Analysis Report',
      '',
      '## Agent Identity',
      '',
      '**Wallet**: `' + agentWallet + '`',
      '',
      '## Registration Status',
      '',
      'To verify agent registration on SAP Protocol:',
      '',
      '```bash',
      '# Fetch agent PDA',
      'solana program-accounts SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ \\',
      '  --filter "base58:' + agentWallet + '" \\',
      '  --output json',
      '```',
      '',
      '## Capabilities Analysis',
      '',
      'Registered capabilities determine what tools the agent can execute:',
      '',
      '### Tool Categories',
      '',
      '- **SAP Protocol Tools** (74 tools): Identity, Registry, Reputation, Memory, Payments, Proof',
      '- **Synapse AgentKit Tools** (110 tools): Tokens, NFTs, DAS, DeFi, ecosystem integrations, Blinks',
      '- **Transaction Tools** (4 tools): Decode, preview, sign, and submit serialized Solana transactions',
      '',
    ];
    
    if (detailed) {
      content.push(
        '## PDA Analysis',
        '',
        'Agent PDAs derived from wallet:',
        '',
        '```',
        'Agent PDA: ["sap_agent", ' + agentWallet + ']',
        'Memory PDA: ["sap_memory", ' + agentWallet + ']',
        'Reputation PDA: ["sap_reputation", ' + agentWallet + ']',
        '```',
        '',
        'To fetch PDA data:',
        '',
        '```bash',
        '# Agent account',
        'solana account <AGENT_PDA> --output json',
        '',
        '# Memory vault',
        'solana account <MEMORY_PDA> --output json',
        '',
        '# Reputation',
        'solana account <REPUTATION_PDA> --output json',
        '```',
        '',
      );
    }
    
    if (includeTransactions) {
      content.push(
        '## Transaction History',
        '',
        'Recent agent activity on-chain:',
        '',
        '```bash',
        '# Get transaction history',
        'solana signatures ' + agentWallet + ' --limit 50',
        '',
        '# Analyze specific transaction',
        'solana transaction <SIGNATURE> --output json',
        '```',
        '',
        '### Key Metrics',
        '',
        '- Total transactions: (fetch from RPC)',
        '- Agent registrations: (count from SAP program)',
        '- Tool executions: (count execution proofs)',
        '- Payments settled: (sum x402 escrows)',
        '',
      );
    }
    
    content.push(
      '## Reputation Score',
      '',
      'Agent reputation based on:',
      '- **Execution success rate**: % of successful tool calls',
      '- **Payment history**: Settled vs disputed payments',
      '- **User ratings**: Feedback from citizens/merchants',
      '- **Attestations**: Third-party verifications',
      '',
      '### Reputation Tiers',
      '',
      '| Tier | Score | Benefits |',
      '|------|-------|----------|',
      '| Bronze | 0-100 | Basic access |',
      '| Silver | 100-500 | Reduced fees |',
      '| Gold | 500-1000 | Priority support |',
      '| Platinum | 1000+ | Premium features |',
      '',
      '## Security Checks',
      '',
      'Before interacting with this agent:',
      '',
      '1. ✅ **Verify registration** on SAP Protocol',
      '2. ✅ **Check reputation score** and history',
      '3. ✅ **Review tool permissions** and capabilities',
      '4. ✅ **Validate payment terms** (if applicable)',
      '5. ✅ **Test with small amount** first',
      '',
      '## Next Steps',
      '',
      '- Register as agent: `npx sap-mcp-config wizard`',
      '- View capabilities: `sap://registry/agent/' + agentWallet + '`',
      '- Check reputation: `sap://reputation/' + agentWallet + '`',
      '- Analyze memory: `sap://memory/' + agentWallet + '`',
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
  
  logger.debug('Analyze SAP Agent prompt registered');
}
