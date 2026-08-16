/**
 * @name resources/tool-schema/sap-tool-schema-resource
 * @description MCP resource template for SAP tool schema definitions and metadata.
 *
 * REAL IMPLEMENTATION — Fetches tool schema data from the on-chain PDA derived
 * from the `sap_tool_schema` seed and the tool name.
 *
 * @flow
 *   1. Registers a resource template at `sap://tool-schema/{toolName}` on the MCP server.
 *   2. When a client reads the resource, derives the tool schema PDA from the program ID and tool name.
 *   3. Fetches the on-chain account data and returns it as a JSON resource content.
 *
 * @module resources/tool-schema/sap-tool-schema-resource
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '@oobe-protocol-labs/sap-mcp-mcp-adapter/sdk-compat';
import { logger } from '@oobe-protocol-labs/sap-mcp-core/logger';
import type { SapMcpContext } from '@oobe-protocol-labs/sap-mcp-core/types';
import { PublicKey } from '@solana/web3.js';

/**
 * @name sapToolSchemaResource
 * @description Registers the SAP tool schema resource template on the MCP server.
 *
 * @param server  — The MCP `Server` instance to register the resource on.
 * @param context — SAP MCP runtime context with connection and config.
 *
 * @usedBy `resources/register-resources.ts`.
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