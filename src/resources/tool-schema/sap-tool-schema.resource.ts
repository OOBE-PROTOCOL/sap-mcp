/**
 * SAP Tool Schema Resource
 * 
 * Tool schema definitions and metadata.
 * REAL IMPLEMENTATION — Fetches from on-chain PDA
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { PublicKey } from '@solana/web3.js';

/**
 * Executes the sap tool schema resource operation.
 */
export function sapToolSchemaResource(server: Server, context: SapMcpContext) {
  registerResourceTemplate(
    server,
    'sap://tool-schema/{toolName}',
    {},
    {
      name: 'SAP Tool Schema',
      description: 'Tool schema definitions and metadata',
      mimeType: 'application/json',
    },
    async (uri: string, args: Record<string, unknown>) => {
      const toolName = String(args.toolName ?? '');
      logger.debug('Reading tool schema resource', { toolName });
      
      try {
        const connection = context.connection;
        const programId = new PublicKey(context.config.programId);
        
        // Derive tool schema PDA
        const [schemaPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('sap_tool_schema'), Buffer.from(toolName)],
          programId
        );
        
        const accountInfo = await connection.getAccountInfo(schemaPda);
        
        if (!accountInfo) {
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                toolName,
                status: 'not_found',
                description: 'Tool schema not registered',
                schemaPda: schemaPda.toBase58(),
              }),
            }],
          };
        }
        
        const schemaData = {
          toolName,
          status: 'success',
          description: 'Tool schema definitions and metadata',
          schemaPda: schemaPda.toBase58(),
          lamports: accountInfo.lamports,
          data: accountInfo.data.toString('base64'),
          timestamp: new Date().toISOString(),
        };
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(schemaData),
          }],
        };
      } catch (error) {
        logger.error('Error reading tool schema resource', { error, toolName });
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to fetch tool schema',
              toolName,
              status: 'error',
            }),
          }],
        };
      }
    }
  );
  
  logger.debug('SAP Tool Schema resource registered');
}
