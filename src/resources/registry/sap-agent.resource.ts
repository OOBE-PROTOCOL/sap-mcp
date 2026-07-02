/**
 * SAP Agent Resource
 * 
 * Agent registration data and capabilities.
 * REAL IMPLEMENTATION — Fetches from on-chain PDA
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { PublicKey } from '@solana/web3.js';

/**
 * Executes the sap agent resource operation.
 */
export function sapAgentResource(server: Server, context: SapMcpContext) {
  registerResourceTemplate(
    server,
    'sap://registry/agent/{pubkey}',
    {},
    {
      name: 'SAP Agent',
      description: 'Agent registration data and capabilities',
      mimeType: 'application/json',
    },
    async (uri: string, args: Record<string, unknown>) => {
      const pubkey = String(args.pubkey ?? '');
      logger.debug('Reading agent resource', { pubkey });
      
      try {
        const connection = context.connection;
        const programId = new PublicKey(context.config.programId);
        
        // Derive agent PDA
        const [agentPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('sap_agent'), new PublicKey(pubkey).toBuffer()],
          programId
        );
        
        const accountInfo = await connection.getAccountInfo(agentPda);
        
        if (!accountInfo) {
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                pubkey,
                status: 'not_found',
                description: 'Agent not registered',
                agentPda: agentPda.toBase58(),
              }),
            }],
          };
        }
        
        const agentData = {
          pubkey,
          status: 'success',
          description: 'Agent registration info, capabilities, and metadata',
          agentPda: agentPda.toBase58(),
          lamports: accountInfo.lamports,
          data: accountInfo.data.toString('base64'),
          timestamp: new Date().toISOString(),
        };
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(agentData),
          }],
        };
      } catch (error) {
        logger.error('Error reading agent resource', { error, pubkey });
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to fetch agent data',
              pubkey,
              status: 'error',
            }),
          }],
        };
      }
    }
  );
  
  logger.debug('SAP Agent resource registered');
}
