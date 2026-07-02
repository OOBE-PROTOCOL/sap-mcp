/**
 * Verify Execution Proof Prompt
 * 
 * Provides workflow for verifying execution proofs and audit trails.
 * NO STUBS — Real implementation with verification steps.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';

/**
 * Executes the verify execution proof prompt operation.
 */
export function verifyExecutionProofPrompt(server: Server, _context: SapMcpContext) {
  registerPrompt(server, 'verify-execution-proof', {}, {
    description: 'Verify execution proofs, validate hash chains, and audit AI agent call histories on-chain',
    arguments: [
      {
        name: 'proofData',
        description: 'Proof data or receipt JSON to verify',
        required: true,
      },
      {
        name: 'agentWallet',
        description: 'Agent wallet that generated the proof',
        required: false,
      },
      {
        name: 'expectedHash',
        description: 'Expected execution hash for comparison',
        required: false,
      },
      {
        name: 'onChain',
        description: 'Verify on-chain: "yes", "no" (default: "yes")',
        required: false,
      },
    ],
  }, async (args) => {
    const proofData = args.proofData as string | object;
    const agentWallet = args.agentWallet as string | undefined;
    const expectedHash = args.expectedHash as string | undefined;
    const onChain = (args.onChain as string) !== 'no';
    
    logger.info('Verifying execution proof', { agentWallet, onChain });
    
    const proofStr = typeof proofData === 'string' ? proofData : JSON.stringify(proofData, null, 2);
    
    const content = [
      '# Execution Proof Verification Report',
      '',
      '## Proof Data',
      '',
      '```json',
      proofStr,
      '```',
      '',
      '## Verification Steps',
      '',
      '### 1. Parse Proof Data',
      '',
      'The proof must contain:',
      '- `agentWallet`: Agent public key',
      '- `toolName`: Tool name executed',
      '- `input`: Tool input',
      '- `output`: Tool output',
      '- `timestamp`: Execution timestamp',
      '- `executionHash`: Execution hash',
      '- `signature`: Agent signature',
      '',
    ];
    
    if (expectedHash) {
      content.push(
        '### 2. Compare Expected Hash',
        '',
        '**Expected**: `' + expectedHash + '`',
        '',
        'To verify:',
        '',
        '```typescript',
        "import { createHash } from 'crypto';",
        '',
        'const proof = ' + proofStr + ';',
        '',
        'function computeHash(proof: unknown): string {',
        '  const hash = createHash(\'sha256\');',
        '  hash.update(proof.agentWallet);',
        '  hash.update(proof.toolName);',
        '  hash.update(JSON.stringify(proof.input));',
        '  hash.update(JSON.stringify(proof.output));',
        '  hash.update(proof.timestamp.toString());',
        '  return hash.digest(\'hex\');',
        '}',
        '',
        'const computedHash = computeHash(proof);',
        "const isValid = computedHash === '" + expectedHash + "';",
        "console.log('Hash valid:', isValid);",
        '```',
        '',
      );
    } else {
      content.push(
        '### 2. Compute Hash',
        '',
        '```typescript',
        "import { createHash } from 'crypto';",
        '',
        'const proof = ' + proofStr + ';',
        '',
        "const hash = createHash('sha256');",
        'hash.update(proof.agentWallet);',
        'hash.update(proof.toolName);',
        'hash.update(JSON.stringify(proof.input));',
        'hash.update(JSON.stringify(proof.output));',
        'hash.update(proof.timestamp.toString());',
        '',
        "const executionHash = hash.digest('hex');",
        "console.log('Computed hash:', executionHash);",
        '```',
        '',
      );
    }
    
    content.push(
      '### 3. Verify Agent Signature',
      '',
      'Agent signature guarantees:',
      '- Agent actually executed the action',
      '- Data was not altered',
      '- No replay attack occurred',
      '',
      '```typescript',
      "import { verify } from '@noble/ed25519';",
      '',
      'const signature = proof.signature;',
      'const message = proof.executionHash;',
      'const publicKey = proof.agentWallet;',
      '',
      'const isValid = await verify(signature, message, publicKey);',
      "console.log('Signature valid:', isValid);",
      '```',
      '',
    );
    
    if (onChain) {
      const cluster = 'devnet';
      const rpcUrl = 'https://api.' + cluster + '.solana.com';
      
      content.push(
        '### 4. On-Chain Verification',
        '',
        'Verify proof is registered on-chain:',
        '',
        '```bash',
        '# Fetch proof account',
        'solana account <PROOF_PDA> --url ' + rpcUrl + ' --output json',
        '',
        '# Verify account owner',
        'solana account <PROOF_PDA> --url ' + rpcUrl + ' | grep Owner',
        '```',
        '',
        'The proof PDA is derived from:',
        '',
        '```typescript',
        "const [proofPda, bump] = PublicKey.findProgramAddressSync(",
        '  [',
        "    Buffer.from('execution_proof'),",
        '    new PublicKey(proof.agentWallet).toBuffer(),',
        "    Buffer.from(proof.executionHash, 'hex'),",
        '  ],',
        '  programId',
        ');',
        '',
        "console.log('Proof PDA:', proofPda.toBase58());",
        '```',
        '',
      );
    }
    
    content.push(
      '### 5. Hash Chain Validation',
      '',
      'If proof includes `previousHash`, validate the chain:',
      '',
      '```typescript',
      'async function verifyHashChain(proof: unknown): Promise<boolean> {',
      '  if (!proof.previousHash) {',
      '    return true; // First execution',
      '  }',
      '  ',
      '  // Fetch previous proof',
      '  const previousProof = await fetchProof(proof.previousHash);',
      '  ',
      '  // Verify chain continuity',
      '  const computedPreviousHash = computeHash(previousProof);',
      '  return computedPreviousHash === proof.previousHash;',
      '}',
      '```',
      '',
      '## Verification Summary',
      '',
      '| Check | Status |',
      '|-------|--------|',
      '| Proof Parsing | Manual verification required |',
      '| Hash Computation | Run code above |',
      '| Signature Verification | Run code above |',
      onChain ? '| On-Chain Registration | Run commands above |' : '| On-Chain Registration | Skipped |',
      '| Hash Chain Validation | Run code above |',
      '',
      '## Next Steps',
      '',
      '1. Run TypeScript code to verify hash and signature',
      '2. If onChain=true, verify proof is registered',
      '3. Check hash chain continuity',
      '4. If all valid, proof is authentic',
      '',
      '## Common Issues',
      '',
      '- **Hash Mismatch**: Data was altered',
      '- **Invalid Signature**: Signature does not match agent',
      '- **Missing On-Chain**: Proof not registered',
      '- **Broken Chain**: Previous hash does not match',
      '',
    );
    
    if (agentWallet) {
      content.push(
        '## Agent History',
        '',
        'To see all executions by `' + agentWallet + '`:',
        '',
        '```bash',
        'solana program-accounts <PROGRAM_ID> \\',
        '  --filter "base58:' + agentWallet + '" \\',
        '  --output json',
        '```',
        '',
      );
    }
    
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
  
  logger.debug('Verify Execution Proof prompt registered');
}
