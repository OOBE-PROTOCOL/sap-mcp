/**
 * SAP Reputation Resource
 * 
 * Agent reputation and attestation data.
 * REAL IMPLEMENTATION — Fetches from on-chain PDA
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { PublicKey } from '@solana/web3.js';

/**
 * Executes the sap reputation resource operation.
 */
export function sapReputationResource(server: Server, context: SapMcpContext) {
  registerResourceTemplate(
    server,
    'sap://reputation/{pubkey}',
    {},
    {
      name: 'SAP Reputation',
      description: 'Agent reputation and attestation data',
      mimeType: 'application/json',
    },
    async (uri: string, args: Record<string, unknown>) => {
      const pubkey = String(args.pubkey ?? '');
      logger.debug('Reading reputation resource', { pubkey });
      
      try {
        const connection = context.connection;
        const programId = new PublicKey(context.config.programId);
        
        // Derive reputation PDA
        const [reputationPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('sap_reputation'), new PublicKey(pubkey).toBuffer()],
          programId
        );
        
        const accountInfo = await connection.getAccountInfo(reputationPda);
        
        if (!accountInfo) {
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                pubkey,
                status: 'not_found',
                description: 'Reputation data not initialized',
                reputationPda: reputationPda.toBase58(),
              }),
            }],
          };
        }
        
        const reputationData = {
          pubkey,
          status: 'success',
          description: 'Agent reputation and attestation data',
          reputationPda: reputationPda.toBase58(),
          lamports: accountInfo.lamports,
          data: accountInfo.data.toString('base64'),
          timestamp: new Date().toISOString(),
        };
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(reputationData),
          }],
        };
      } catch (error) {
        logger.error('Error reading reputation resource', { error, pubkey });
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to fetch reputation data',
              pubkey,
              status: 'error',
            }),
          }],
        };
      }
    }
  );
  
  logger.debug('SAP Reputation resource registered');
}
