/**
 * Generate SAP Integration Prompt
 * 
 * Provides structured guidance for integrating SAP SDK into projects.
 * NO STUBS — Real implementation with SDK integration steps.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';

/**
 * Executes the generate sap integration prompt operation.
 */
export function generateSapIntegrationPrompt(server: Server, _context: SapMcpContext) {
  registerPrompt(server, 'generate-sap-integration', {}, {
    description: 'Generate code snippets and configuration for integrating SAP SDK into a TypeScript project',
    arguments: [
      {
        name: 'projectType',
        description: 'Type of project: "nodejs", "browser", "nextjs", "tauri"',
        required: true,
      },
      {
        name: 'features',
        description: 'Comma-separated features: "agent", "escrow", "vault", "tools", "attestation"',
        required: false,
      },
      {
        name: 'cluster',
        description: 'Solana cluster: "mainnet-beta", "devnet", "testnet" (default: "devnet")',
        required: false,
      },
    ],
  }, async (args) => {
    const projectType = (args.projectType as string) || 'nodejs';
    const features = ((args.features as string) || 'agent').split(',').map(f => f.trim());
    const cluster = (args.cluster as string) || 'devnet';
    
    logger.info('Generating SAP integration', { projectType, features, cluster });
    
    const rpcUrls: Record<string, string> = {
      'mainnet-beta': 'https://api.mainnet-beta.solana.com',
      'devnet': 'https://api.devnet.solana.com',
      'testnet': 'https://api.testnet.solana.com',
    };
    
    const integrationSteps = [
      `# SAP SDK Integration — ${projectType.toUpperCase()}`,
      '',
      '## 1. Install Dependencies',
      '```bash',
      'pnpm add @oobe-protocol-labs/synapse-sap-sdk@1.0.2',
      'pnpm add @coral-xyz/anchor @solana/web3.js',
      '```',
      '',
      '## 2. Configure Environment',
      '```bash',
      `RPC_URL=${rpcUrls[cluster] || rpcUrls.devnet}`,
      'PROGRAM_ID=SAPProgramIDxxxxxxxxxxxxxxxxxxxxxxxxx',
      '```',
      '',
      '## 3. Initialize SAP Client',
      '```typescript',
      'import { createSapClient } from \'@oobe-protocol-labs/synapse-sap-sdk\';',
      '',
      'const rpcUrl = process.env.RPC_URL;',
      '// Provide a secure application signer or wallet adapter.',
      '// Do not read or print local keypair JSON bytes in agent context.',
      '',
      'const sapClient = createSapClient(rpcUrl, wallet);',
      '```',
      '',
      '## 4. Register Agent',
      '```typescript',
      'const signature = await sapClient.agent.register({',
      "  name: 'my-agent',",
      "  description: 'SAP-enabled agent',",
      `  capabilities: [${features.map(f => `{ id: '${f}', description: null, protocolId: 'sap', version: '1.0' }`).join(', ')}],`,
      '  pricing: [],',
      "  protocols: ['sap'],",
      "  agentId: 'my-agent',",
      "  agentUri: 'https://example.com/agent.json',",
      "  x402Endpoint: 'https://example.com/x402',",
      '});',
      '',
      'console.log(\'Agent registration tx:\', signature);',
      '```',
      '',
      '## 5. Use Features',
      ...features.map((feature, i) => [
        '',
        `### ${i + 1}. ${feature.charAt(0).toUpperCase() + feature.slice(1)}`,
        getFeatureExample(feature),
      ]).flat(),
      '',
      '## 6. Error Handling',
      '```typescript',
      'import { SapError } from \'@oobe-protocol-labs/synapse-sap-sdk\';',
      '',
      'try {',
      '  // SAP operations',
      '} catch (error) {',
      '  if (error instanceof SapError) {',
      '    console.error(\'SAP error:\', error.code, error.message);',
      '  } else {',
      '    console.error(\'Unknown error:\', error);',
      '  }',
      '}',
      '```',
    ];
    
    const content = integrationSteps.join('\n');
    
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
  
  logger.debug('Generate SAP Integration prompt registered');
}

/**
 * Internal helper for the get feature example operation.
 */
function getFeatureExample(feature: string): string {
  const examples: Record<string, string> = {
    agent: '```typescript\nconst agentInfo = await sapClient.agent.get(agentPda);\nconsole.log(\'Agent reputation:\', agentInfo.reputation);\n```',
    escrow: '```typescript\nconst escrow = await sapClient.escrow.create({\n  amount: 100,\n  token: \'USDC\',\n  beneficiary: beneficiaryPda,\n  timeout: 86400, // 24 hours\n});\n```',
    vault: '```typescript\nconst vault = await sapClient.vault.create({\n  initialDeposit: 1.0, // SOL\n  owner: ownerPda,\n});\n```',
    tools: '```typescript\nconst tool = await sapClient.tools.publish({\n  name: \'swap\',\n  schema: { /* JSON Schema */ },\n  pricing: { fee: \'0.1%\' },\n});\n```',
    attestation: '```typescript\nconst attestation = await sapClient.attestation.submit({\n  target: targetPda,\n  type: \'identity_verified\',\n  metadata: { verifiedBy: \'my-service\' },\n});\n```',
  };
  
  return examples[feature] || [
    'Unsupported feature requested.',
    'Use one of: agent, escrow, vault, tools, attestation.',
    'Do not generate generic integration code for unknown SAP features.',
  ].join('\n');
}
