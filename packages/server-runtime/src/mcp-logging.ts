/**
 * @name mcp-logging
 * @description MCP protocol-level structured logging via `notifications/message`.
 * Sends log messages directly to the connected MCP client (Claude Desktop, Cursor,
 * Hermes, etc.) using the SDK's `sendLoggingMessage` API.
 *
 * This is distinct from the server's internal logger (which writes to stdout/files).
 * MCP logging pushes structured notifications to the client UI so the user can see
 * real-time progress during tool execution.
 *
 * @module server-runtime/mcp-logging
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { LoggingLevel } from '@modelcontextprotocol/sdk/types.js';

/**
 * @name McpLogLevel
 * @description MCP logging levels as defined by the protocol spec.
 * Ordered by severity: debug < info < notice < warning < error.
 */
export type McpLogLevel = LoggingLevel;

/**
 * @name McpLogContext
 * @description Structured context attached to each log message.
 */
export interface McpLogContext {
  toolName?: string;
  taskId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

/**
 * @name McpLogger
 * @description Wrapper around the MCP server's `sendLoggingMessage` method.
 * Provides typed, structured logging that appears in the client's UI.
 *
 * Usage:
 * ```ts
 * const mcpLog = new McpLogger(server);
 * mcpLog.info('Confirming transaction on-chain...', { toolName: 'sap_submit_signed_transaction' });
 * mcpLog.debug('RPC response received', { durationMs: 1200 });
 * ```
 */
export class McpLogger {
  private server: Server | undefined;
  private minLevel: McpLogLevel = 'info';

  /**
   * @name attach
   * @description Attach to an MCP server instance to enable client-side logging.
   * Call this after the server is created and before tool registration.
   */
  attach(server: Server): void {
    this.server = server;
  }

  /**
   * @name setLevel
   * @description Set the minimum log level to send to the client.
   * Messages below this level are silently dropped.
   */
  setLevel(level: McpLogLevel): void {
    this.minLevel = level;
  }

  /**
   * @name debug
   * @description Send a debug-level log message to the client.
   */
  debug(message: string, context?: McpLogContext): void {
    this.send('debug', message, context);
  }

  /**
   * @name info
   * @description Send an info-level log message to the client.
   */
  info(message: string, context?: McpLogContext): void {
    this.send('info', message, context);
  }

  /**
   * @name notice
   * @description Send a notice-level log message to the client.
   */
  notice(message: string, context?: McpLogContext): void {
    this.send('notice', message, context);
  }

  /**
   * @name warning
   * @description Send a warning-level log message to the client.
   */
  warning(message: string, context?: McpLogContext): void {
    this.send('warning', message, context);
  }

  /**
   * @name error
   * @description Send an error-level log message to the client.
   */
  error(message: string, context?: McpLogContext): void {
    this.send('error', message, context);
  }

  /**
   * @name send
   * @description Internal method to send a structured log notification to the client.
   * Silently drops the message if no server is attached or the level is below minimum.
   */
  private send(level: McpLogLevel, message: string, context?: McpLogContext): void {
    if (!this.server) return;
    if (!shouldLog(level, this.minLevel)) return;

    const logger = this.server as unknown as {
      sendLoggingMessage?: (params: {
        level: McpLogLevel;
        data: unknown;
        logger?: string;
      }) => Promise<void>;
    };

    if (typeof logger.sendLoggingMessage === 'function') {
      void logger.sendLoggingMessage({
        level,
        data: context ? { message, ...context } : message,
        logger: 'sap-mcp',
      }).catch(() => {
        // Silently ignore: client may not support logging notifications
      });
    }
  }
}

/**
 * @name shouldLog
 * @description Check if a log level should be sent given the minimum threshold.
 */
function shouldLog(level: McpLogLevel, minLevel: McpLogLevel): boolean {
  const levels: McpLogLevel[] = ['debug', 'info', 'notice', 'warning', 'error'];
  return levels.indexOf(level) >= levels.indexOf(minLevel);
}

/**
 * @name mcpLogger
 * @description Global singleton instance for convenience access throughout the server.
 */
export const mcpLogger = new McpLogger();