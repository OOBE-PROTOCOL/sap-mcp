/**
 * @module memory
 * @description SAP MCP local agent memory subsystem — SQLite FTS5 backed.
 *
 * Exports all stores and types for use by the MCP tool registration layer.
 *
 * Architecture:
 * - database.ts: Thread-safe singleton SQLite connection with WAL mode + FTS5.
 * - tool-call-store.ts: Records and searches tool call history.
 * - memory-store.ts: Manages LLM-generated agent memories with relevance decay.
 * - stream-buffer-store.ts: Buffers premium stream events for offline consumption.
 * - types.ts: Type definitions.
 * - utils.ts: Utility functions (truncate, decay, expiry).
 */

export { MemoryDatabase, memoryDatabase, DEFAULT_CONFIG } from './database.js';
export { ToolCallStore, toolCallStore } from './tool-call-store.js';
export { MemoryStore, memoryStore } from './memory-store.js';
export { StreamBufferStore, streamBufferStore } from './stream-buffer-store.js';
export { AsyncMemoryProcessor, asyncMemoryProcessor } from './async-processor.js';
export { recordToolCall } from './auto-record.js';
export { HermesBridge, hermesBridge } from './hermes-bridge.js';
export type {
  ToolCallRecord,
  ToolCallOutcome,
  AgentMemoryRecord,
  MemoryType,
  StreamBufferRecord,
  MemorySearchResult,
  MemoryQueryOptions,
  MemoryStats,
  MemoryPruneResult,
  MemoryConfig,
} from './types.js';