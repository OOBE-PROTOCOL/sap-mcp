/**
 * @module memory/types
 * @description Type definitions for the SAP MCP local agent memory subsystem.
 *
 * The memory subsystem uses SQLite FTS5 to store and retrieve:
 * - Tool call history (input, output, outcome, cost, latency)
 * - Agent memories (LLM-compressed summaries of past interactions)
 * - Stream buffer events (premium stream data persisted locally)
 *
 * All types are designed for non-custodial, local-only operation — no data
 * leaves the user's machine. The memory DB is stored at
 * ~/.config/mcp-sap/memory/agent-memory.db.
 */

/**
 * @name ToolCallRecord
 * @description A single tool call execution record stored in the memory DB.
 */
export interface ToolCallRecord {
  /** Auto-increment primary key. */
  id?: number;
  /** MCP tool name (e.g. 'jupiter_getQuote', 'sap_build_sol_transfer'). */
  toolName: string;
  /** Session identifier from the MCP transport. */
  sessionId: string | null;
  /** Signer profile used for the call, if any. */
  callerProfile: string | null;
  /** JSON-serialized tool input. Truncated to 8KB. */
  input: string;
  /** JSON-serialized tool output. Truncated to 8KB. */
  output: string;
  /** Execution outcome classification. */
  outcome: ToolCallOutcome;
  /** x402 cost in USD, if the tool was paid. */
  costUsd: number | null;
  /** Solana transaction signature, if the tool produced one. */
  txSignature: string | null;
  /** Execution latency in milliseconds. */
  latencyMs: number | null;
  /** ISO 8601 timestamp of when the record was created. */
  createdAt: string;
  /** ISO 8601 timestamp of when the record was last updated. */
  updatedAt: string;
}

/**
 * @name ToolCallOutcome
 * @description Classification of a tool call's execution result.
 */
export type ToolCallOutcome = 'success' | 'error' | 'partial';

/**
 * @name AgentMemoryRecord
 * @description An LLM-generated summary of past agent interactions.
 *
 * Memories are compressed representations of tool call patterns, failures,
 * successes, and lessons learned. They decay over time via a relevance
 * score that decreases as memories age, ensuring the agent prioritizes
 * recent, high-signal knowledge.
 */
export interface AgentMemoryRecord {
  /** Auto-increment primary key. */
  id?: number;
  /** Type of memory — determines how it's used in prompt injection. */
  memoryType: MemoryType;
  /** Tool category this memory relates to (e.g. 'jupiter', 'adrena', 'premium'). */
  category: string;
  /** LLM-compressed summary text. Max 4KB. */
  summary: string;
  /** JSON array of tool_call IDs that were the source of this memory. */
  sourceToolCalls: string | null;
  /** Relevance score 0-1. Decays over time. Higher = more relevant. */
  relevanceScore: number;
  /** ISO 8601 timestamp of when the memory was created. */
  createdAt: string;
  /** ISO 8601 timestamp of when the memory expires. NULL = never expires. */
  expiresAt: string | null;
  /** ISO 8601 timestamp of when the memory was last accessed. */
  lastAccessedAt: string;
}

/**
 * @name MemoryType
 * @description Classification of agent memory entries.
 * - 'lesson': A learned pattern or rule (e.g. "Jupiter swaps fail when slippage < 50bps on low-liquidity pairs")
 * - 'pattern': A recurring behavior (e.g. "Agent consistently buys when SOL price drops > 2%")
 * - 'failure': A specific failure with root cause (e.g. "BlockhashNotFound after 90s — retry with fresh blockhash")
 * - 'success': A successful outcome worth remembering (e.g. "Arb opportunity on SOL/USDC at block 123456")
 */
export type MemoryType = 'lesson' | 'pattern' | 'failure' | 'success';

/**
 * @name StreamBufferRecord
 * @description A buffered stream event persisted locally for offline analysis.
 */
export interface StreamBufferRecord {
  /** Auto-increment primary key. */
  id?: number;
  /** Stream type identifier (e.g. 'pyth-price', 'meme-alerts', 'volatility'). */
  streamType: string;
  /** Unique event ID from the provider. */
  eventId: string;
  /** Event type from the provider (e.g. 'price.tick', 'volatility.breakout'). */
  eventType: string;
  /** JSON-serialized event payload. */
  payload: string;
  /** Whether the event has been consumed by the agent. */
  consumed: number;
  /** ISO 8601 timestamp of when the event was buffered. */
  createdAt: string;
}

/**
 * @name MemorySearchResult
 * @description A result from a full-text search across tool calls or agent memories.
 */
export interface MemorySearchResult<T = unknown> {
  /** The matching records. */
  results: T[];
  /** Total number of matching records (before pagination). */
  total: number;
  /** Whether there are more results available. */
  hasMore: boolean;
}

/**
 * @name MemoryQueryOptions
 * @description Options for searching the memory database.
 */
export interface MemoryQueryOptions {
  /** FTS5 search query (e.g. 'swap failure', 'jupiter slippage'). */
  query: string;
  /** Filter by tool name (tool_calls only). */
  toolName?: string;
  /** Filter by outcome (tool_calls only). */
  outcome?: ToolCallOutcome;
  /** Filter by memory type (agent_memory only). */
  memoryType?: MemoryType;
  /** Filter by category. */
  category?: string;
  /** Minimum relevance score (agent_memory only). */
  minRelevance?: number;
  /** Maximum number of results to return. Default 20. */
  limit?: number;
  /** Offset for pagination. Default 0. */
  offset?: number;
  /** Sort order. Default 'relevance' for FTS, 'newest' for time-based. */
  sort?: 'relevance' | 'newest' | 'oldest';
}

/**
 * @name MemoryStats
 * @description Aggregate statistics about the memory database.
 */
export interface MemoryStats {
  /** Total number of tool call records. */
  toolCallCount: number;
  /** Total number of agent memory records. */
  memoryCount: number;
  /** Total number of stream buffer records (unconsumed). */
  pendingStreamEvents: number;
  /** Total database size in bytes. */
  dbSizeBytes: number;
  /** Breakdown of tool calls by outcome. */
  outcomeBreakdown: Record<ToolCallOutcome, number>;
  /** Breakdown of agent memories by type. */
  memoryTypeBreakdown: Record<MemoryType, number>;
  /** Most recent tool call timestamp. */
  lastToolCallAt: string | null;
  /** Most recent memory timestamp. */
  lastMemoryAt: string | null;
}

/**
 * @name MemoryPruneResult
 * @description Result of pruning old, low-relevance memories.
 */
export interface MemoryPruneResult {
  /** Number of memories pruned. */
  pruned: number;
  /** Number of tool calls archived (old records). */
  archived: number;
  /** Database size reduction in bytes. */
  freedBytes: number;
}

/**
 * @name MemoryConfig
 * @description Configuration for the memory subsystem.
 */
export interface MemoryConfig {
  /** Path to the SQLite database file. */
  dbPath: string;
  /** Whether to enable WAL mode (recommended for concurrent access). */
  enableWal: boolean;
  /** Maximum size of tool call input/output stored. Default 8192 bytes. */
  maxPayloadBytes: number;
  /** Relevance decay rate per day. Default 0.01 (1% per day). */
  relevanceDecayPerDay: number;
  /** Minimum relevance score to keep a memory. Default 0.05. */
  minRelevanceThreshold: number;
  /** Number of days to keep tool call records. Default 90. */
  toolCallRetentionDays: number;
  /** Maximum number of stream buffer events per type. Default 10000. */
  maxStreamBufferSize: number;
}
