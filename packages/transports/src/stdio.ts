/**
 * @name transports/stdio
 * @description stdio transport for local MCP clients (Claude Desktop, Codex, Cursor, Windsurf, etc.).
 *
 * @flow
 *   1. Creates a `StdioServerTransport` from the MCP SDK.
 *   2. Connects the transport to the server, which starts handling JSON-RPC requests immediately.
 *   3. Registers SIGINT/SIGTERM handlers for graceful shutdown.
 *
 * @module transports/stdio
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '@oobe-protocol-labs/sap-mcp-core/logger';
import { clearSessionCache } from '@oobe-protocol-labs/sap-mcp-payments/mcp-session-cache';
import { releasePaymentBridgeProcessLock } from '@oobe-protocol-labs/sap-mcp-runtime/payment-bridge-process';

/**
 * @name startStdioTransport
 * @description Starts the MCP server with a stdio transport for local client communication.
 *
 * CRITICAL: All capabilities (tools, resources, prompts) MUST be registered BEFORE
 * calling this function. The transport starts handling requests immediately.
 *
 * @param server — The configured MCP `Server` instance with all capabilities registered.
 * @throws If the transport connection fails.
 *
 * @usedBy CLI entry point for local MCP server mode.
 */
export async function startStdioTransport(
  server: Server,
): Promise<void> {
  logger.info('Starting stdio transport');
  
  const transport = new StdioServerTransport();
  let shuttingDown = false;

  const shutdown = async (reason: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info('Shutting down stdio transport...', { reason });
    clearSessionCache();
    releasePaymentBridgeProcessLock();

    try {
      await server.close();
    } catch (error) {
      logger.warn('Error while closing stdio MCP server', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    process.exit(exitCode);
  };
  
  // Connect transport - this starts handling JSON-RPC requests immediately
  await server.connect(transport);
  
  logger.info('stdio transport started successfully');
  
  // Handle graceful shutdown
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('disconnect', () => void shutdown('parent-disconnect'));
  process.stdin.on('end', () => void shutdown('stdin-end'));
  process.stdin.on('close', () => void shutdown('stdin-close'));
  process.on('beforeExit', () => {
    clearSessionCache();
    releasePaymentBridgeProcessLock();
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception in stdio transport', {
      error: error instanceof Error ? error.message : String(error),
    });
    void shutdown('uncaughtException', 1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection in stdio transport', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    void shutdown('unhandledRejection', 1);
  });
}
