/**
 * @name core/index
 * @description Barrel export for the SAP MCP core module.
 *
 * Re-exports the logger, shared types, error classes, result utilities,
 * constants, and type guards.
 *
 * @module core/index
 */

export { logger, setLogLevel } from './logger.js';
export type { LogLevel } from './logger.js';

export * from './types.js';
export * from './errors.js';
export * from './result.js';
export * from './constants.js';
export * from './guards.js';
