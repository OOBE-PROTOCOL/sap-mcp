/**
 * Explain Proof of Execution Prompt
 * 
 * Explains proof-of-execution cryptography, hash chains, and audit trail verification.
 * NO STUBS — Real implementation with cryptographic details.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';

/**
 * Executes the explain proof of execution prompt operation.
 */
export function explainProofOfExecutionPrompt(server: Server, _context: SapMcpContext) {
  registerPrompt(server, 'explain-proof-of-execution', {}, {
    description: 'Explain proof-of-execution cryptography, hash chains, and audit trail verification for AI agent calls',
    arguments: [
      {
        name: 'executionHash',
        description: 'Execution hash to analyze',
        required: false,
      },
      {
        name: 'agentWallet',
        description: 'Agent wallet for context',
        required: false,
      },
      {
        name: 'includeCode',
        description: 'Include code examples: "rust", "typescript", "both" (default: "typescript")',
        required: false,
      },
    ],
  }, async (args) => {
    const executionHash = args.executionHash as string | undefined;
    const agentWallet = args.agentWallet as string | undefined;
    const includeCode = (args.includeCode as string) || 'typescript';
    
    logger.info('Explaining proof of execution', { executionHash, agentWallet, includeCode });
    
    const content = [
      '# Proof of Execution - Technical Deep Dive',
      '',
      '## Overview',
      '',
      'Proof of Execution (PoE) is a cryptographic system that guarantees:',
      '- **Integrity**: Execution cannot be altered',
      '- **Non-repudiation**: Agent cannot deny execution',
      '- **Verifiability**: Anyone can verify execution',
      '- **Immutability**: Proof is recorded on-chain',
      '',
      '## Hash Chain Architecture',
      '',
      'Each execution generates a hash including:',
      '```',
      'execution_hash = SHA256(',
      '  agent_wallet ||',
      '  tool_name ||',
      '  input_hash ||',
      '  output_hash ||',
      '  timestamp ||',
      '  previous_hash',
      ')',
      '```',
      '',
      'This creates a **hash chain** where each execution is linked to the previous one.',
      '',
      '## Verification Process',
      '',
      '1. **Fetch Proof**: Get proof on-chain',
      '2. **Verify Hash**: Compute hash and compare',
      '3. **Check Signature**: Verify agent signature',
      '4. **Validate Chain**: Ensure chain continuity',
      '',
    ];
    
    if (executionHash) {
      content.push(
        '## Analysis of Specific Hash',
        '',
        '**Hash**: `' + executionHash + '`',
        '',
        'To analyze this hash:',
        '',
        '```bash',
        '# 1. Fetch proof on-chain',
        'solana account <PDA_ADDRESS> --output json',
        '',
        '# 2. Verify hash locally',
        'echo -n "data" | sha256sum',
        '```',
        '',
      );
    }
    
    if (agentWallet) {
      content.push(
        '## Agent Context',
        '',
        '**Wallet**: `' + agentWallet + '`',
        '',
        'To verify executions by this agent:',
        '',
        '```bash',
        '# Fetch all executions by this agent',
        'solana program-accounts <PROGRAM_ID> \\',
        '  --filter "base58:' + agentWallet + '" \\',
        '  --output json',
        '```',
        '',
      );
    }
    
    if (includeCode === 'typescript' || includeCode === 'both') {
      content.push(
        '## TypeScript Implementation',
        '',
        '```typescript',
        "import { createHash } from 'crypto';",
        '',
        'function computeExecutionHash(params: {',
        '  agentWallet: string;',
        '  toolName: string;',
        '  input: unknown;',
        '  output: unknown;',
        '  timestamp: number;',
        '  previousHash?: string;',
        '}): string {',
        '  const hash = createHash(\'sha256\');',
        '  ',
        '  hash.update(params.agentWallet);',
        '  hash.update(params.toolName);',
        '  hash.update(JSON.stringify(params.input));',
        '  hash.update(JSON.stringify(params.output));',
        '  hash.update(params.timestamp.toString());',
        '  ',
        '  if (params.previousHash) {',
        '    hash.update(params.previousHash);',
        '  }',
        '  ',
        '  return hash.digest(\'hex\');',
        '}',
        '',
        '// Usage',
        'const proof = {',
        "  agentWallet: 'AgentPubkey...',",
        "  toolName: 'swap',",
        '  input: { amount: 1, token: \'SOL\' },',
        '  output: { received: 145, token: \'USDC\' },',
        '  timestamp: Date.now(),',
        "  previousHash: 'previous_execution_hash',",
        '};',
        '',
        'const executionHash = computeExecutionHash(proof);',
        "console.log('Execution hash:', executionHash);",
        '```',
        '',
      );
    }
    
    if (includeCode === 'rust' || includeCode === 'both') {
      content.push(
        '## Rust Implementation (On-Chain)',
        '',
        '```rust',
        'use sha2::{Sha256, Digest};',
        'use solana_program::pubkey::Pubkey;',
        '',
        'pub struct ExecutionProof {',
        '    pub agent_wallet: Pubkey,',
        '    pub tool_name: String,',
        '    pub input_hash: [u8; 32],',
        '    pub output_hash: [u8; 32],',
        '    pub timestamp: u64,',
        '    pub previous_hash: Option<[u8; 32]>,',
        '}',
        '',
        'impl ExecutionProof {',
        '    pub fn compute_hash(&self) -> [u8; 32] {',
        '        let mut hasher = Sha256::new();',
        '        ',
        '        hasher.update(&self.agent_wallet.to_bytes());',
        '        hasher.update(self.tool_name.as_bytes());',
        '        hasher.update(&self.input_hash);',
        '        hasher.update(&self.output_hash);',
        '        hasher.update(&self.timestamp.to_le_bytes());',
        '        ',
        '        if let Some(prev) = self.previous_hash {',
        '            hasher.update(&prev);',
        '        }',
        '        ',
        '        hasher.finalize().into()',
        '    }',
        '    ',
        '    pub fn verify(&self, expected_hash: [u8; 32]) -> bool {',
        '        self.compute_hash() == expected_hash',
        '    }',
        '}',
        '```',
        '',
      );
    }
    
    content.push(
      '## On-Chain Storage',
      '',
      'Proofs are stored on-chain in a PDA:',
      '',
      '```',
      'PDA Seeds: ["execution_proof", agent_wallet, execution_hash]',
      'Program ID: SAP Program',
      '```',
      '',
      'Account Layout:',
      '```',
      '0-32:   agent_wallet (Pubkey)',
      '32-64:  execution_hash (Hash)',
      '64-96:  input_hash (Hash)',
      '96-128: output_hash (Hash)',
      '128-136: timestamp (u64)',
      '136-144: previous_hash_exists (bool)',
      '144-176: previous_hash (Hash, optional)',
      '```',
      '',
      '## Security Considerations',
      '',
      '1. **Hash Collisions**: SHA-256 is collision-resistant',
      '2. **Replay Attacks**: Timestamp prevents replay',
      '3. **Data Availability**: Hash on-chain, data off-chain (IPFS/Arweave)',
      '4. **Privacy**: Only hash on-chain, sensitive data off-chain',
      '',
      '## Resources',
      '',
      '- SAP SDK Docs: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk',
      '- Solana Cookbook: https://solanacookbook.com',
      '- SHA-256 Spec: https://csrc.nist.gov/publications/detail/fips/180/2/final',
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
  
  logger.info('Explain Proof of Execution prompt registered');
}
