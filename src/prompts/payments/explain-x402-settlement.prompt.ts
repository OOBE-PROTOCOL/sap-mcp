/**
 * Explain x402 Settlement Prompt
 * 
 * Explains x402 payment protocol and settlement flows.
 * REAL IMPLEMENTATION — Comprehensive technical documentation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';

/**
 * Executes the explain x402 settlement prompt operation.
 */
export function explainX402SettlementPrompt(server: Server, _context: SapMcpContext) {
  registerPrompt(server, 'explain-x402-settlement', {}, {
    description: 'Explain x402 payment protocol, settlement flows, and escrow mechanics for AI agent payments',
    arguments: [
      {
        name: 'includeCode',
        description: 'Include current SAP MCP JSON tool-call examples: "typescript", "both", or omit for default examples.',
        required: false,
      },
      {
        name: 'detailed',
        description: 'Include detailed cryptographic proofs: "yes", "no" (default: "no")',
        required: false,
      },
    ],
  }, async (args) => {
    const includeCode = (args.includeCode as string) || 'typescript';
    const detailed = (args.detailed as string) === 'yes';
    
    logger.info('Explaining x402 settlement', { includeCode, detailed });
    
    const content = [
      '# x402 Payment Protocol - Technical Deep Dive',
      '',
      '## Overview',
      '',
      'x402 is a micropayment protocol for AI agent services on Solana. It enables:',
      '- **Pay-per-call**: Pay for each AI agent tool execution',
      '- **Escrow settlement**: Funds held in escrow until execution proof',
      '- **Dispute resolution**: On-chain arbitration for failed executions',
      '- **Reputation tracking**: Payment history affects agent reputation',
      '',
      '## Payment Flow',
      '',
      '1. **Hosted MCP** returns an HTTP 402 x402/pay.sh challenge for paid tools',
      '2. **Local payer** signs the payment proof with the user-controlled SAP profile or external signer',
      '3. **Client** retries the same paid tool call with `PAYMENT-SIGNATURE`',
      '4. **Facilitator** verifies and settles the payment, then returns a receipt header',
      '5. **SAP MCP** executes the requested tool and binds the receipt to the output/audit trail',
      '',
      '## Escrow Structure',
      '',
      '```',
      'Escrow Account:',
      '  - depositor: Client wallet',
      '  - agent: Agent wallet',
      '  - amount: Payment in escrow token smallest units',
      '  - token_mint: Optional SPL mint; USDC uses EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      '  - settlement_security: CoSigned(1) or DisputeWindow(2)',
      '  - nonce: Escrow nonce used in PDA derivation',
      '  - state: pending | executed | disputed | settled',
      '  - execution_hash: Hash of tool execution',
      '  - created_at: Timestamp',
      '  - expires_at: Timeout for execution',
      '```',
      '',
    ];
    
    if (includeCode === 'typescript' || includeCode === 'both') {
      content.push(
        '## Current SAP MCP Tool Flow',
        '',
        'Hosted SAP MCP paid calls should use the local payment bridge when the runtime cannot replay x402 challenges natively:',
        '',
        '```json',
        '{',
        '  "tool": "sap_payments_call_paid_tool",',
        '  "arguments": {',
        '    "toolName": "sap_list_all_agents",',
        '    "arguments": { "limit": 5 },',
        '    "maxPriceUsd": 0.02,',
        '    "confirm": true',
        '  }',
        '}',
        '```',
        '',
        'Escrow writes are V2-only. Use `sap_create_escrow_v2`; V1 write tools are deprecated and not part of recommended paths:',
        '',
        '```json',
        '{',
        '  "tool": "sap_create_escrow_v2",',
        '  "arguments": {',
        '    "agentWallet": "<agent-owner-wallet>",',
        '    "pricePerCall": "8000",',
        '    "maxCalls": "100",',
        '    "initialDeposit": "800000",',
        '    "nonce": "0",',
        '    "tokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",',
        '    "tokenDecimals": 6,',
        '    "settlementSecurity": 2,',
        '    "disputeWindowSlots": "2160"',
        '  }',
        '}',
        '```',
        '',
      );
    }
    
    if (detailed) {
      content.push(
        '## Cryptographic Proofs',
        '',
        'Execution proof uses hash chains:',
        '',
        '```',
        'execution_hash = SHA256(',
        '  agent_wallet ||',
        '  tool_name ||',
        '  input_hash ||',
        '  output_hash ||',
        '  timestamp ||',
        '  escrow_pda',
        ')',
        '```',
        '',
        'This ensures:',
        '- **Integrity**: Execution cannot be altered',
        '- **Non-repudiation**: Agent cannot deny execution',
        '- **Linkability**: Proof linked to specific escrow',
        '',
      );
    }
    
    content.push(
      '## Settlement Mechanics',
      '',
      '### Automatic Settlement',
      '',
      'If no dispute within 24 hours:',
      '1. Protocol verifies execution_hash matches escrow',
      '2. Funds transferred from escrow to agent',
      '3. Escrow account closed',
      '',
      '### Dispute Resolution',
      '',
      'If client disputes:',
      '1. Funds frozen in escrow',
      '2. Arbitrator reviews execution proof',
      '3. Decision: refund client OR pay agent',
      '4. Reputation updated based on outcome',
      '',
      '## Resources',
      '',
      '- x402 Spec: https://github.com/OOBE-PROTOCOL/x402',
      '- SAP SDK: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk',
      '- Solana Payments: https://solanacookbook.com/references/token',
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
  
  logger.debug('Explain x402 Settlement prompt registered');
}
