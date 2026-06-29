/**
 * Logger utility for SAP MCP Server
 * 
 * Provides structured logging with:
 * - Configurable log levels
 * - JSON or pretty format
 * - File output support
 * - Timestamp and context
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Type alias for log level values used by the SAP MCP runtime.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Type alias for log format values used by the SAP MCP runtime.
 */
export type LogFormat = 'json' | 'pretty';

/**
 * Contract describing log options data used by the SAP MCP runtime.
 */
export interface LogOptions {
  level?: LogLevel;
  format?: LogFormat;
  file?: string;
}

/**
 * Internal contract describing log entry data.
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  context?: {
    pid: number;
    mode?: string;
  };
}

let currentLevel: LogLevel = 'info';
let currentFormat: LogFormat = 'pretty';
let logFile: string | undefined;

/**
 * Initialize logger with options
 */
export function initLogger(options: LogOptions = {}) {
  if (options.level) currentLevel = options.level;
  if (options.format) currentFormat = options.format;
  if (options.file) {
    logFile = options.file;
    ensureLogFile(logFile);
  }
}

/**
 * Ensure log file directory exists
 */
function ensureLogFile(filePath: string) {
  const dir = join(filePath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Format log entry based on format setting
 */
function formatLog(entry: LogEntry): string {
  if (currentFormat === 'json') {
    return JSON.stringify(entry);
  }
  
  // Pretty format
  const timestamp = new Date(entry.timestamp).toISOString();
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${dataStr}`;
}

/**
 * Write log to console and/or file
 */
function writeLog(entry: LogEntry) {
  const formatted = formatLog(entry);
  
  // Always write to stderr (for MCP stdio compatibility)
  console.error(formatted);
  
  // Write to file if configured
  if (logFile) {
    appendFileSync(logFile, formatted + '\n');
  }
}

/**
 * Create log entry with context
 */
function createLogEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
    context: {
      pid: process.pid,
      mode: process.env.SAP_MCP_MODE,
    },
  };
}

/**
 * Check if message should be logged based on level
 */
function shouldLog(level: LogLevel): boolean {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const currentLevelIndex = levels.indexOf(currentLevel);
  const messageLevelIndex = levels.indexOf(level);
  return messageLevelIndex >= currentLevelIndex;
}

/**
 * Logger instance
 */
export const logger = {
  debug(message: string, data?: unknown) {
    if (shouldLog('debug')) {
      writeLog(createLogEntry('debug', message, data));
    }
  },
  
  info(message: string, data?: unknown) {
    if (shouldLog('info')) {
      writeLog(createLogEntry('info', message, data));
    }
  },
  
  warn(message: string, data?: unknown) {
    if (shouldLog('warn')) {
      writeLog(createLogEntry('warn', message, data));
    }
  },
  
  error(message: string, data?: unknown) {
    if (shouldLog('error')) {
      writeLog(createLogEntry('error', message, data));
    }
  },
  
  /**
   * Log startup banner
   */
  startup(config: { mode: string; rpcUrl: string; programId: string; version?: string }) {
    const banner = `
╔══════════════════════════════════════════════════════════╗
║             SAP MCP Server                               ║
║             Enterprise Edition                           ║
╚══════════════════════════════════════════════════════════╝
    `.trim();
    
    console.error(banner);
    console.error(`Version: ${config.version || '0.1.0'}`);
    console.error(`Mode: ${config.mode}`);
    console.error(`RPC: ${config.rpcUrl}`);
    console.error(`Program: ${config.programId}`);
    console.error(`PID: ${process.pid}`);
    console.error('────────────────────────────────────────────────────────');
  },
};

/**
 * Set log level dynamically
 */
export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

/**
 * Set log format dynamically
 */
export function setLogFormat(format: LogFormat) {
  currentFormat = format;
}

/**
 * Set log file dynamically
 */
export function setLogFile(file: string | undefined) {
  logFile = file;
  if (file) {
    ensureLogFile(file);
  }
}

/**
 * Get current logger configuration
 */
export function getLoggerConfig(): LogOptions {
  return {
    level: currentLevel,
    format: currentFormat,
    file: logFile,
  };
}
