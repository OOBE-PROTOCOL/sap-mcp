/**
 * @name resources/reputation/sap-reputation-resource
 * @description MCP resource template for SAP agent reputation and attestation data.
 *
 * REAL IMPLEMENTATION — Fetches reputation data from the on-chain PDA derived
 * from the `sap_reputation` seed and the agent's public key.
 *
 * @flow
 *   1. Registers a resource template at `sap://reputation/{pubkey}` on the MCP server.
 *   2. When a client reads the resource, derives the reputation PDA from the program ID and pubkey.
 *   3. Fetches the on-chain account data and returns it as a JSON resource content.
 *
 * @module resources/reputation/sap-reputation-resource
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { PublicKey } from '@solana/web3.js';

/**
 * @name sapReputationResource
 * @description Registers the SAP reputation resource template on the MCP server.
 *
 * @param server  — The MCP `Server` instance to register the resource on.
 * @param context — SAP MCP runtime context with connection and config.
 *
 * @usedBy `resources/register-resources.ts`.
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