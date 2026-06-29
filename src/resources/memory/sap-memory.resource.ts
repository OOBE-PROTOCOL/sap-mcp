/**
 * SAP Memory Resource
 * 
 * Access agent memory vault and session ledger data.
 * REAL IMPLEMENTATION — Fetches from on-chain PDA
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { PublicKey } from '@solana/web3.js';

/**
 * Executes the sap memory resource operation.
 */
export function sapMemoryResource(server: Server, context: SapMcpContext) {
  registerResourceTemplate(
    server,
    'sap://memory/{agent}',
    {},
    {
      name: 'SAP Memory Vault',
      description: 'Access agent memory vault and session ledger data',
      mimeType: 'application/json',
    },
    async (uri: string, args: Record<string, unknown>) => {
      const agent = String(args.agent ?? '');
      logger.debug('Reading memory resource', { agent });
      
      try {
        // Fetch memory PDA data from chain
        const connection = context.connection;
        const programId = new PublicKey(context.config.programId);
        
        // Derive memory vault PDA
        const [memoryPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('sap_memory'), new PublicKey(agent).toBuffer()],
          programId
        );
        
        const accountInfo = await connection.getAccountInfo(memoryPda);
        
        if (!accountInfo) {
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                agent,
                status: 'not_found',
                description: 'Memory vault not initialized for this agent',
                memoryPda: memoryPda.toBase58(),
              }),
            }],
          };
        }
        
        // Parse memory account data
        const memoryData = {
          agent,
          status: 'success',
          description: 'Memory vault data with session ledger',
          memoryPda: memoryPda.toBase58(),
          lamports: accountInfo.lamports,
          data: accountInfo.data.toString('base64'),
          timestamp: new Date().toISOString(),
        };
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(memoryData),
          }],
        };
      } catch (error) {
        logger.error('Error reading memory resource', { error, agent });
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to fetch memory data',
              agent,
              status: 'error',
            }),
          }],
        };
      }
    }
  );
  
  logger.info('SAP Memory resource registered');
}
