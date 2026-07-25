/**
 * @module memory-tools
 * @description MCP tools for the local agent memory subsystem.
 *
 * All 15 tools are FREE (no x402 charge) and operate entirely on the local
 * SQLite database at ~/.config/sap-mcp/memory/agent-memory.db. No data
 * leaves the user's machine.
 *
 * Categories:
 * - Memory recording & search (5 tools): sap_memory_record, sap_memory_search,
 *   sap_memory_summarize, sap_memory_recall, sap_memory_prune
 * - Strategy management (4 tools): sap_strategy_save, sap_strategy_load,
 *   sap_strategy_list, sap_strategy_activate
 * - Stream buffering (3 tools): sap_stream_buffer, sap_stream_consume,
 *   sap_stream_replay
 * - Audit trail (3 tools): sap_audit_query, sap_audit_record, sap_audit_stats
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import type { SapMcpContext } from '../core/types.js';
import { toolCallStore, memoryStore, streamBufferStore, memoryDatabase, hermesBridge } from '../memory/index.js';
import type { ToolCallOutcome, MemoryType } from '../memory/types.js';

/**
 * @name registerMemoryTools
 * @description Registers all 15 local memory/strategy/stream/audit MCP tools.
 * All tools are free, local-only, and require no x402 payment.
 */
export function registerMemoryTools(server: Server, _context: SapMcpContext): void {
  registerMemoryRecordTool(server);
  registerMemorySearchTool(server);
  registerMemorySummarizeTool(server);
  registerMemoryRecallTool(server);
  registerMemoryPruneTool(server);
  registerStrategySaveTool(server);
  registerStrategyLoadTool(server);
  registerStrategyListTool(server);
  registerStrategyActivateTool(server);
  registerStreamBufferTool(server);
  registerStreamConsumeTool(server);
  registerStreamReplayTool(server);
  registerAuditQueryTool(server);
  registerAuditRecordTool(server);
  registerAuditStatsTool(server);
  registerHermesSearchTool(server);
  registerHermesRecentTool(server);
}

// ── Memory Recording & Search ──────────────────────────────────────────────

function registerMemoryRecordTool(server: Server): void {
  registerTool(server, 'sap_memory_record', {
    title: 'Record Tool Call',
    description: 'Free local tool. Records a tool call execution in the agent memory database (SQLite FTS5). Auto-call after any paid or significant tool call to build searchable history. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'MCP tool name that was called.' },
        sessionId: { type: 'string', description: 'Optional session identifier.' },
        callerProfile: { type: 'string', description: 'Optional signer profile used.' },
        input: { type: 'string', description: 'JSON-serialized tool input.' },
        output: { type: 'string', description: 'JSON-serialized tool output (truncated to 8KB).' },
        outcome: { type: 'string', enum: ['success', 'error', 'partial'], description: 'Execution outcome.' },
        costUsd: { type: 'number', description: 'x402 cost in USD if the tool was paid.' },
        txSignature: { type: 'string', description: 'Solana transaction signature if applicable.' },
        latencyMs: { type: 'number', description: 'Execution latency in milliseconds.' },
      },
      required: ['toolName', 'outcome'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const id = toolCallStore.record({
        toolName: String(raw['toolName'] ?? ''),
        sessionId: typeof raw['sessionId'] === 'string' ? raw['sessionId'] : null,
        callerProfile: typeof raw['callerProfile'] === 'string' ? raw['callerProfile'] : null,
        input: typeof raw['input'] === 'string' ? raw['input'] : '',
        output: typeof raw['output'] === 'string' ? raw['output'] : '',
        outcome: String(raw['outcome'] ?? 'success') as ToolCallOutcome,
        costUsd: typeof raw['costUsd'] === 'number' ? raw['costUsd'] : null,
        txSignature: typeof raw['txSignature'] === 'string' ? raw['txSignature'] : null,
        latencyMs: typeof raw['latencyMs'] === 'number' ? raw['latencyMs'] : null,
      });
      return createTextResponse(JSON.stringify({ success: true, id, degraded: memoryDatabase.isDegraded() }));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerMemorySearchTool(server: Server): void {
  registerTool(server, 'sap_memory_search', {
    title: 'Search Tool Call History',
    description: 'Free local tool. Full-text search (FTS5) across tool call history. Find patterns, failures, and successes by natural language query. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'FTS5 search query (e.g. "swap failure slippage").' },
        toolName: { type: 'string', description: 'Filter by tool name.' },
        outcome: { type: 'string', enum: ['success', 'error', 'partial'], description: 'Filter by outcome.' },
        limit: { type: 'number', description: 'Max results. Default 20, max 100.' },
        offset: { type: 'number', description: 'Pagination offset.' },
        sort: { type: 'string', enum: ['relevance', 'newest', 'oldest'], description: 'Sort order. Default relevance.' },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const result = toolCallStore.search({
        query: String(raw['query'] ?? ''),
        toolName: typeof raw['toolName'] === 'string' ? raw['toolName'] : undefined,
        outcome: typeof raw['outcome'] === 'string' ? raw['outcome'] as ToolCallOutcome : undefined,
        limit: typeof raw['limit'] === 'number' ? raw['limit'] : 20,
        offset: typeof raw['offset'] === 'number' ? raw['offset'] : 0,
        sort: typeof raw['sort'] === 'string' ? raw['sort'] as 'relevance' | 'newest' | 'oldest' : 'relevance',
      });
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerMemorySummarizeTool(server: Server): void {
  registerTool(server, 'sap_memory_summarize', {
    title: 'Create Agent Memory',
    description: 'Free local tool. Creates an LLM-compressed summary memory from tool call patterns. The agent calls this after analyzing search results to persist lessons, patterns, failures, or successes. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        memoryType: { type: 'string', enum: ['lesson', 'pattern', 'failure', 'success'], description: 'Type of memory.' },
        category: { type: 'string', description: 'Tool category (e.g. "jupiter", "adrena", "premium").' },
        summary: { type: 'string', description: 'LLM-compressed summary text. Max 4KB.' },
        sourceToolCalls: { type: 'string', description: 'JSON array of tool_call IDs that were the source.' },
        relevance: { type: 'number', description: 'Initial relevance score 0-1. Default 0.8.' },
        expiresAt: { type: 'string', description: 'ISO 8601 expiry. Null = never expires.' },
      },
      required: ['memoryType', 'category', 'summary'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const id = memoryStore.record({
        memoryType: String(raw['memoryType']) as MemoryType,
        category: String(raw['category']),
        summary: String(raw['summary']),
        sourceToolCalls: typeof raw['sourceToolCalls'] === 'string' ? raw['sourceToolCalls'] : null,
        expiresAt: typeof raw['expiresAt'] === 'string' ? raw['expiresAt'] : null,
      }, typeof raw['relevance'] === 'number' ? raw['relevance'] : 0.8);
      return createTextResponse(JSON.stringify({ success: true, id }));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerMemoryRecallTool(server: Server): void {
  registerTool(server, 'sap_memory_recall', {
    title: 'Recall Agent Memories',
    description: 'Free local tool. Returns the most relevant memories for a category, ordered by decayed relevance. Use this for prompt injection — the agent gets top N memories for the task at hand. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Tool category to recall memories for.' },
        limit: { type: 'number', description: 'Max memories. Default 5.' },
      },
      required: ['category'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const memories = memoryStore.recall(
        String(raw['category']),
        typeof raw['limit'] === 'number' ? raw['limit'] : 5,
      );
      return createTextResponse(JSON.stringify({ memories, count: memories.length }, null, 2));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerMemoryPruneTool(server: Server): void {
  registerTool(server, 'sap_memory_prune', {
    title: 'Prune Old Memories',
    description: 'Free local tool. Removes expired memories and memories with relevance below threshold after decay. Also archives tool call records older than retention period. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        minRelevance: { type: 'number', description: 'Minimum decayed relevance to keep. Default 0.05.' },
        archiveDays: { type: 'number', description: 'Archive tool calls older than N days. Default 90.' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const pruned = memoryStore.prune(typeof raw['minRelevance'] === 'number' ? raw['minRelevance'] : 0.05);
      const archived = toolCallStore.archive(typeof raw['archiveDays'] === 'number' ? raw['archiveDays'] : 90);
      return createTextResponse(JSON.stringify({ success: true, pruned, archived }));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

// ── Strategy Management ─────────────────────────────────────────────────────

function registerStrategySaveTool(server: Server): void {
  registerTool(server, 'sap_strategy_save', {
    title: 'Save Strategy',
    description: 'Free local tool. Saves or updates a strategy JSON in ~/.config/sap-mcp/strategies/. Strategies persist agent learnings (e.g. buyback rules, slippage thresholds, risk limits) across sessions. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Strategy category (defi, trading, meme, payments, premium).' },
        name: { type: 'string', description: 'Strategy name (e.g. "volatility-breakout").' },
        config: { type: 'string', description: 'JSON strategy configuration.' },
        activate: { type: 'boolean', description: 'Whether to activate the strategy immediately. Default true.' },
      },
      required: ['category', 'name', 'config'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const { saveStrategy } = await import('../strategies/strategy-store.js');
      const result = saveStrategy({
        category: String(raw['category']),
        name: String(raw['name']),
        config: String(raw['config']),
        active: raw['activate'] !== false,
      });
      return createTextResponse(JSON.stringify(result));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerStrategyLoadTool(server: Server): void {
  registerTool(server, 'sap_strategy_load', {
    title: 'Load Strategy',
    description: 'Free local tool. Loads a strategy JSON by category and name. Returns the full strategy config including version and active status. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Strategy category.' },
        name: { type: 'string', description: 'Strategy name.' },
      },
      required: ['category', 'name'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const { loadStrategy } = await import('../strategies/strategy-store.js');
      const strategy = loadStrategy(String(raw['category']), String(raw['name']));
      return createTextResponse(JSON.stringify(strategy));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerStrategyListTool(server: Server): void {
  registerTool(server, 'sap_strategy_list', {
    title: 'List Strategies',
    description: 'Free local tool. Lists all strategies, optionally filtered by category and active status. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional category filter.' },
        activeOnly: { type: 'boolean', description: 'Only return active strategies. Default false.' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const { listStrategies } = await import('../strategies/strategy-store.js');
      const strategies = listStrategies(
        typeof raw['category'] === 'string' ? raw['category'] : undefined,
        raw['activeOnly'] === true,
      );
      return createTextResponse(JSON.stringify({ strategies, count: strategies.length }, null, 2));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerStrategyActivateTool(server: Server): void {
  registerTool(server, 'sap_strategy_activate', {
    title: 'Activate/Deactivate Strategy',
    description: 'Free local tool. Activates or deactivates a strategy by category and name. Inactive strategies are skipped during agent execution. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Strategy category.' },
        name: { type: 'string', description: 'Strategy name.' },
        active: { type: 'boolean', description: 'True to activate, false to deactivate.' },
      },
      required: ['category', 'name', 'active'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const { activateStrategy } = await import('../strategies/strategy-store.js');
      const result = activateStrategy(String(raw['category']), String(raw['name']), raw['active'] === true);
      return createTextResponse(JSON.stringify(result));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

// ── Stream Buffering ────────────────────────────────────────────────────────

function registerStreamBufferTool(server: Server): void {
  registerTool(server, 'sap_stream_buffer', {
    title: 'Buffer Stream Event',
    description: 'Free local tool. Buffers a premium stream event in the local SQLite database for offline consumption. Deduplicates by (streamType, eventId). No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        streamType: { type: 'string', description: 'Stream type (e.g. "pyth-price", "meme-alerts", "volatility").' },
        eventId: { type: 'string', description: 'Unique event ID from the provider.' },
        eventType: { type: 'string', description: 'Event type (e.g. "price.tick", "volatility.breakout").' },
        payload: { type: 'string', description: 'JSON-serialized event payload.' },
      },
      required: ['streamType', 'eventId', 'eventType', 'payload'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const id = streamBufferStore.buffer({
        streamType: String(raw['streamType']),
        eventId: String(raw['eventId']),
        eventType: String(raw['eventType']),
        payload: String(raw['payload']),
      });
      return createTextResponse(JSON.stringify({ success: true, id, dedup: id === -1 }));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerStreamConsumeTool(server: Server): void {
  registerTool(server, 'sap_stream_consume', {
    title: 'Consume Stream Events',
    description: 'Free local tool. Returns unconsumed stream events for a stream type (FIFO order) and marks them consumed. Use this instead of sap_premium_stream_poll for local offline access. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        streamType: { type: 'string', description: 'Stream type to consume.' },
        limit: { type: 'number', description: 'Max events to consume. Default 20.' },
      },
      required: ['streamType'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const events = streamBufferStore.consume(
        String(raw['streamType']),
        typeof raw['limit'] === 'number' ? raw['limit'] : 20,
      );
      return createTextResponse(JSON.stringify({ events, count: events.length }, null, 2));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerStreamReplayTool(server: Server): void {
  registerTool(server, 'sap_stream_replay', {
    title: 'Replay Stream Events',
    description: 'Free local tool. Returns all events (consumed + unconsumed) for a stream type within a time range. Used for backtest and analysis. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        streamType: { type: 'string', description: 'Stream type to replay.' },
        since: { type: 'string', description: 'ISO 8601 timestamp. Events created after this time.' },
        limit: { type: 'number', description: 'Max events. Default 100.' },
      },
      required: ['streamType'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const events = streamBufferStore.replay(
        String(raw['streamType']),
        typeof raw['since'] === 'string' ? raw['since'] : undefined,
        typeof raw['limit'] === 'number' ? raw['limit'] : 100,
      );
      return createTextResponse(JSON.stringify({ events, count: events.length }, null, 2));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

// ── Audit Trail ─────────────────────────────────────────────────────────────

function registerAuditQueryTool(server: Server): void {
  registerTool(server, 'sap_audit_query', {
    title: 'Query Audit Trail',
    description: 'Free local tool. Queries the immutable audit trail for x402 settlements and transaction signatures. Search by tool name, outcome, or time range. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'FTS5 search query.' },
        outcome: { type: 'string', enum: ['success', 'error', 'partial'], description: 'Filter by outcome.' },
        limit: { type: 'number', description: 'Max results. Default 20.' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const result = toolCallStore.search({
        query: String(raw['query'] ?? ''),
        outcome: typeof raw['outcome'] === 'string' ? raw['outcome'] as ToolCallOutcome : undefined,
        limit: typeof raw['limit'] === 'number' ? raw['limit'] : 20,
      });
      return createTextResponse(JSON.stringify(result, null, 2));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerAuditRecordTool(server: Server): void {
  registerTool(server, 'sap_audit_record', {
    title: 'Record Audit Entry',
    description: 'Free local tool. Records a manual audit entry in the tool call history. Use this to log custom events (e.g. manual interventions, external transactions, policy decisions). No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'Label for the audit entry.' },
        input: { type: 'string', description: 'JSON details.' },
        output: { type: 'string', description: 'JSON result.' },
        outcome: { type: 'string', enum: ['success', 'error', 'partial'], description: 'Outcome.' },
        txSignature: { type: 'string', description: 'Transaction signature if applicable.' },
      },
      required: ['toolName', 'outcome'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const id = toolCallStore.record({
        toolName: String(raw['toolName']),
        sessionId: null,
        callerProfile: null,
        input: typeof raw['input'] === 'string' ? raw['input'] : '',
        output: typeof raw['output'] === 'string' ? raw['output'] : '',
        outcome: String(raw['outcome']) as ToolCallOutcome,
        costUsd: null,
        txSignature: typeof raw['txSignature'] === 'string' ? raw['txSignature'] : null,
        latencyMs: null,
      });
      return createTextResponse(JSON.stringify({ success: true, id }));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerAuditStatsTool(server: Server): void {
  registerTool(server, 'sap_audit_stats', {
    title: 'Memory & Audit Stats',
    description: 'Free local tool. Returns aggregate statistics about the memory database: tool call counts, memory counts, stream buffer counts, outcome breakdown, DB size. No x402 charge.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    try {
      const stats = {
        toolCallCount: toolCallStore.count(),
        memoryCount: memoryStore.count(),
        pendingStreamEvents: streamBufferStore.pendingCount(),
        dbSizeBytes: memoryDatabase.getDbSize(),
        outcomeBreakdown: toolCallStore.outcomeBreakdown(),
        memoryTypeBreakdown: memoryStore.memoryTypeBreakdown(),
        lastToolCallAt: toolCallStore.lastToolCallAt(),
        lastMemoryAt: memoryStore.lastMemoryAt(),
        degraded: memoryDatabase.isDegraded(),
        hermesAvailable: hermesBridge.isAvailable(),
      };
      return createTextResponse(JSON.stringify(stats, null, 2));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

// ── Hermes Cross-Session Integration ─────────────────────────────────────────

function registerHermesSearchTool(server: Server): void {
  registerTool(server, 'sap_hermes_search', {
    title: 'Search Hermes Sessions',
    description: 'Free local tool. Searches Hermes Agent session history for relevant past conversations. Enables cross-session context recall. If Hermes is not installed, returns empty results. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query.' },
        limit: { type: 'number', description: 'Max results. Default 5.' },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const results = hermesBridge.searchSessions(
        String(raw['query'] ?? ''),
        typeof raw['limit'] === 'number' ? raw['limit'] : 5,
      );
      return createTextResponse(JSON.stringify({ results, count: results.length, hermesAvailable: hermesBridge.isAvailable() }, null, 2));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerHermesRecentTool(server: Server): void {
  registerTool(server, 'sap_hermes_recent', {
    title: 'Recent Hermes Sessions',
    description: 'Free local tool. Returns recent Hermes Agent sessions for context injection. Use this at session start to recall what the agent worked on recently. If Hermes is not installed, returns empty results. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max sessions. Default 3.' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const sessions = hermesBridge.getRecentSessions(
        typeof raw['limit'] === 'number' ? raw['limit'] : 3,
      );
      return createTextResponse(JSON.stringify({ sessions, count: sessions.length, hermesAvailable: hermesBridge.isAvailable() }, null, 2));
    } catch (error) {
      return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}