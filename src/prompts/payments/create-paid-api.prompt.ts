/**
 * Create Paid API Prompt
 * 
 * Guides creation of paid API endpoints with x402 payment protection.
 * REAL IMPLEMENTATION — Step-by-step wizard
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';

/**
 * Executes the create paid api prompt operation.
 */
export function createPaidApiPrompt(server: Server, _context: SapMcpContext) {
  registerPrompt(server, 'create-paid-api', {}, {
    description: 'Create paid API endpoint with x402 payment protection for AI agent services',
    arguments: [
      {
        name: 'serviceName',
        description: 'Name of the API service',
        required: true,
      },
      {
        name: 'priceSol',
        description: 'Price per call in SOL (e.g., 0.001)',
        required: true,
      },
      {
        name: 'endpoint',
        description: 'API endpoint path (e.g., /api/v1/analyze)',
        required: true,
      },
      {
        name: 'timeout',
        description: 'Execution timeout in seconds (default: 300)',
        required: false,
      },
    ],
  }, async (args) => {
    const serviceName = args.serviceName as string;
    const priceSol = args.priceSol as string;
    const endpoint = args.endpoint as string;
    const timeout = (args.timeout as string) || '300';
    
    logger.info('Creating paid API', { serviceName, priceSol, endpoint, timeout });
    
    const content = [
      '# Paid API Setup - ' + serviceName,
      '',
      '## Configuration',
      '',
      '- **Service**: ' + serviceName,
      '- **Price**: ' + priceSol + ' SOL per call',
      '- **Endpoint**: ' + endpoint,
      '- **Timeout**: ' + timeout + ' seconds',
      '',
      '## Step 1: Use SAP Program',
      '',
      'SAP x402 payments use the deployed SAP program and `sap.x402`; do not deploy a separate escrow program for this flow.',
      '',
      '## Step 2: Initialize Payment Gateway',
      '',
      '```typescript',
      "import { createSapClient } from '@oobe-protocol-labs/synapse-sap-sdk';",
      '',
      '// Use an application-owned signer or wallet adapter. Do not load keypair JSON in agent context.',
      'const sap = createSapClient(process.env.SAP_RPC_URL!, wallet);',
      'const payment = await sap.x402.preparePayment(agentWallet, {',
      "  pricePerCall: '" + Math.floor(Number(priceSol) * 1_000_000_000) + "',",
      "  deposit: '" + Math.floor(Number(priceSol) * 10 * 1_000_000_000) + "',",
      "  maxCalls: '10',",
      '});',
      '',
      "console.log('Escrow PDA:', payment.escrowPda.toBase58());",
      '```',
      '',
      '## Step 3: Integrate with API',
      '',
      '```typescript',
      "import { createSapClient } from '@oobe-protocol-labs/synapse-sap-sdk';",
      '',
      "app.post('" + endpoint + "', async (req, res) => {",
      '  const balance = await sap.x402.getBalance(agentWallet, depositorWallet);',
      '  if (!balance || balance.callsRemaining <= 0) {',
      "    return res.status(402).json({ error: 'Payment required', protocol: 'SAP-x402' });",
      '  }',
      '',
      '  // Execute service',
      '  const result = await ' + serviceName + '(req.body);',
      '',
      '  // Submit proof of execution',
      '  await submitExecutionProof(result);',
      '',
      '  res.json({ success: true, data: result });',
      '});',
      '```',
      '',
      '## Step 4: Test Payment Flow',
      '',
      '```bash',
      '# Test API call with payment',
      'curl -X POST https://api.example.com' + endpoint + ' \\',
      "  -H 'Content-Type: application/json' \\",
      "  -H 'x-payment-proof: <payment_proof>' \\",
      "  -d '{\"input\": \"test\"}'",
      '```',
      '',
      '## Step 5: Monitor Settlements',
      '',
      '```typescript',
      "import { createSapClient } from '@oobe-protocol-labs/synapse-sap-sdk';",
      '',
      'const balance = await sap.x402.getBalance(agentWallet, depositorWallet);',
      '',
      "console.log('Calls remaining:', balance?.callsRemaining ?? 0);",
      "console.log('Total deposited:', balance?.totalDeposited.toString() ?? '0');",
      "console.log('Total settled:', balance?.totalSettled.toString() ?? '0');",
      '```',
      '',
      '## Security Considerations',
      '',
      '1. **Validate payment proof** before executing service',
      '2. **Submit execution proof** to trigger settlement',
      '3. **Handle disputes** within 24h window',
      '4. **Monitor reputation** - affects future pricing',
      '',
      '## Next Steps',
      '',
      '- Configure webhook for payment notifications',
      '- Set up automatic withdrawal of settled funds',
      '- Implement rate limiting per user',
      '- Add analytics dashboard',
    ];
    
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
  
  logger.info('Create Paid API prompt registered');
}
