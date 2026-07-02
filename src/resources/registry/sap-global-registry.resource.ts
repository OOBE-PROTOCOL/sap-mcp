/**
 * SAP Global Registry Resource
 * 
 * Global registry of all SAP agents.
 * REAL IMPLEMENTATION — Fetches from on-chain PDA
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { PublicKey } from '@solana/web3.js';

/**
 * Executes the sap global registry resource operation.
 */
export function sapGlobalRegistryResource(server: Server, context: SapMcpContext) {
  registerResourceTemplate(
    server,
    'sap://registry/global',
    {},
    {
      name: 'SAP Global Registry',
      description: 'Global registry of all SAP agents',
      mimeType: 'application/json',
    },
    async (uri: string) => {
      logger.debug('Reading global registry resource');
      
      try {
        const connection = context.connection;
        const programId = new PublicKey(context.config.programId);
        
        // Derive global registry PDA
        const [registryPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('sap_global_registry')],
          programId
        );
        
        const accountInfo = await connection.getAccountInfo(registryPda);
        
        if (!accountInfo) {
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                status: 'not_found',
                description: 'Global registry not initialized',
                registryPda: registryPda.toBase58(),
              }),
            }],
          };
        }
        
        const registryData = {
          status: 'success',
          description: 'Global registry of all SAP agents',
          registryPda: registryPda.toBase58(),
          lamports: accountInfo.lamports,
          data: accountInfo.data.toString('base64'),
          timestamp: new Date().toISOString(),
        };
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(registryData),
          }],
        };
      } catch (error) {
        logger.error('Error reading global registry resource', { error });
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to fetch registry data',
              status: 'error',
            }),
          }],
        };
      }
    }
  );
  
  logger.debug('SAP Global Registry resource registered');
}
