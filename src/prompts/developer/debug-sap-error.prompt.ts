/**
 * Debug SAP Error Prompt
 * 
 * Provides structured debugging workflow for SAP-related errors.
 * NO STUBS — Real implementation with error analysis.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';

/**
 * Executes the debug sap error prompt operation.
 */
export function debugSapErrorPrompt(server: Server, _context: SapMcpContext) {
  registerPrompt(server, 'debug-sap-error', {}, {
    description: 'Systematic debugging workflow for SAP SDK errors, transaction failures, and on-chain issues',
    arguments: [
      {
        name: 'errorMessage',
        description: 'The error message or transaction error code',
        required: true,
      },
      {
        name: 'transactionSignature',
        description: 'Optional transaction signature for on-chain lookup',
        required: false,
      },
      {
        name: 'cluster',
        description: 'Solana cluster where the error occurred',
        required: false,
      },
    ],
  }, async (args) => {
    const errorMessage = (args.errorMessage as string) || 'Unknown error';
    const txSignature = args.transactionSignature as string | undefined;
    const cluster = (args.cluster as string) || 'devnet';
    
    logger.info('Debugging SAP error', { errorMessage, txSignature, cluster });
    
    const rpcUrls: Record<string, string> = {
      'mainnet-beta': 'https://api.mainnet-beta.solana.com',
      'devnet': 'https://api.devnet.solana.com',
      'testnet': 'https://api.testnet.solana.com',
    };
    
    const rpcUrl = rpcUrls[cluster] || rpcUrls.devnet;
    
    const debugSteps = [
      `# SAP Error Debugging Report`,
      '',
      '## Error Summary',
      `- **Error**: ${errorMessage}`,
      `- **Cluster**: ${cluster}`,
      `- **Timestamp**: ${new Date().toISOString()}`,
      '',
    ];
    
    // Add transaction analysis if signature provided
    if (txSignature) {
      debugSteps.push(
        '## Transaction Analysis',
        `**Signature**: \`${txSignature}\``,
        '',
        '### Steps to Investigate',
        '',
        '1. **Check Transaction Status**',
        '```bash',
        `solana confirm ${txSignature} --url ${rpcUrl} --verbose`,
        '```',
        '',
        '2. **View Transaction Details**',
        '```bash',
        `solana transaction ${txSignature} --url ${rpcUrl}`,
        '```',
        '',
        '3. **Check Solana Explorer**',
        `- ${getExplorerLink(txSignature, cluster)}`,
        '',
      );
    }
    
    debugSteps.push(
      '## Common SAP Errors',
      '',
      '### 1. Program Not Found',
      '- **Cause**: SAP program not deployed to this cluster',
      '- **Fix**: Verify PROGRAM_ID matches the cluster',
      '',
      '### 2. Account Not Initialized',
      '- **Cause**: PDA not created before use',
      '- **Fix**: Call `agent.register()` before other operations',
      '',
      '### 3. Insufficient Funds',
      '- **Cause**: Not enough SOL for rent or fees',
      '- **Fix**: Airdrop on devnet or fund wallet on mainnet',
      '```bash',
      'solana airdrop 1 YOUR_WALLET --url ' + rpcUrl,
      '```',
      '',
      '### 4. Signer Required',
      '- **Cause**: Transaction requires signature',
      '- **Fix**: Ensure wallet is connected and signer is set',
      '',
      '### 5. Invalid PDA',
      '- **Cause**: Incorrect seeds or program ID',
      '- **Fix**: Verify PDA derivation matches SDK',
      '```typescript',
      'const [pda, bump] = PublicKey.findProgramAddressSync(',
      '  [Buffer.from(\'sap_agent\'), ownerPublicKey.toBuffer()],',
      '  programId',
      ');',
      '```',
      '',
      '## Debugging Commands',
      '',
      '### Check Account State',
      '```bash',
      'solana account <PDA_ADDRESS> --url ' + rpcUrl + ' --output json',
      '```',
      '',
      '### Check Program Logs',
      '```bash',
      'solana logs --url ' + rpcUrl + ' --filter "SAPProgramID"',
      '```',
      '',
      '### Simulate Transaction',
      '```typescript',
      'const simulation = await connection.simulateTransaction(transaction);',
      'console.log(\'Logs:\', simulation.value.logs);',
      'console.log(\'Error:\', simulation.value.err);',
      '```',
      '',
      '## Next Steps',
      '',
      '1. Run the commands above to gather more information',
      '2. Check SAP SDK documentation for specific error codes',
      '3. If issue persists, provide full error log and transaction signature',
      '',
      '## Resources',
      '',
      '- SAP SDK Docs: https://github.com/OOBE-PROTOCOL/synapse-sap-sdk',
      '- Solana Docs: https://docs.solana.com',
      `- Solana Explorer: ${getExplorerLink('', cluster)}`,
    );
    
    const content = debugSteps.join('\n');
    
    return {
      messages: [{
        role: 'assistant',
        content: {
          type: 'text',
          text: content,
        },
      }],
    };
  });
  
  logger.debug('Debug SAP Error prompt registered');
}

/**
 * Internal helper for the get explorer link operation.
 */
function getExplorerLink(signatureOrEmpty: string, cluster: string): string {
  const clusterPrefix = cluster === 'mainnet-beta' ? '' : `${cluster}.`;
  const path = signatureOrEmpty ? `tx/${signatureOrEmpty}` : '';
  return `https://explorer.solana.com/${path}?cluster=${clusterPrefix}solana`;
}
