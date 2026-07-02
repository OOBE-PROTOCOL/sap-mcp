/**
 * SAP Execution Record Resource
 * 
 * Proof of execution records and audit trails.
 * REAL IMPLEMENTATION — Fetches from on-chain PDA
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { PublicKey } from '@solana/web3.js';

/**
 * Executes the sap execution record resource operation.
 */
export function sapExecutionRecordResource(server: Server, context: SapMcpContext) {
  registerResourceTemplate(
    server,
    'sap://execution-proof/{hash}',
    {},
    {
      name: 'SAP Execution Record',
      description: 'Proof of execution records and audit trails',
      mimeType: 'application/json',
    },
    async (uri: string, args: Record<string, unknown>) => {
      const hash = String(args.hash ?? '');
      logger.debug('Reading execution record resource', { hash });
      
      try {
        const connection = context.connection;
        const programId = new PublicKey(context.config.programId);
        
        // Derive execution proof PDA
        const [proofPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('execution_proof'), Buffer.from(hash)],
          programId
        );
        
        const accountInfo = await connection.getAccountInfo(proofPda);
        
        if (!accountInfo) {
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                hash,
                status: 'not_found',
                description: 'Execution proof not registered',
                proofPda: proofPda.toBase58(),
              }),
            }],
          };
        }
        
        const proofData = {
          hash,
          status: 'success',
          description: 'Proof of execution record and audit trail',
          proofPda: proofPda.toBase58(),
          lamports: accountInfo.lamports,
          data: accountInfo.data.toString('base64'),
          timestamp: new Date().toISOString(),
        };
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(proofData),
          }],
        };
      } catch (error) {
        logger.error('Error reading execution record resource', { error, hash });
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to fetch execution proof',
              hash,
              status: 'error',
            }),
          }],
        };
      }
    }
  );
  
  logger.debug('SAP Execution Record resource registered');
}
