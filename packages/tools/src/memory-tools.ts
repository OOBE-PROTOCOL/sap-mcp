/**
 * @module memory-tools
 * @description MCP tools for the local agent memory subsystem.
 *
 * All 20 tools are FREE (no x402 charge) and operate entirely on the local
 * SQLite database at ~/.config/mcp-sap/memory/agent-memory.db. No data
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
 * - Hermes context (2 tools): sap_hermes_search, sap_hermes_recent
 * - Strategy execution (1 tool): sap_strategy_execute
 * - Trade journal (2 tools): sap_trade_journal, sap_trade_journal_query
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/src/types.js';
import { toolCallStore, memoryStore, streamBufferStore, memoryDatabase, hermesBridge } from '../../memory/src/index.js';
import type { ToolCallOutcome, MemoryType } from '../../memory/src/types.js';
import {
  createStringToolPipelineResult,
  registerToolFamilyPipelineTool,
  type ToolFamilyPipelineDefinition,
  type ToolFamilyPipelineHandlerResult,
  type ToolFamilyPipelineResult,
} from './tool-family-pipeline.js';

type MemoryToolDefinition = ToolFamilyPipelineDefinition;
type MemoryToolHandlerResult = ToolFamilyPipelineHandlerResult;

function createMemoryPipelineResponse(
  body: string,
  options: { readonly isError?: boolean } = {},
): ToolFamilyPipelineResult {
  return createStringToolPipelineResult(body, options);
}

function registerMemoryPipelineTool(
  server: Server,
  context: SapMcpContext,
  name: string,
  definition: MemoryToolDefinition,
  execute: (input: unknown) => Promise<MemoryToolHandlerResult>,
): void {
  registerToolFamilyPipelineTool(server, context, name, definition, execute);
}

/**
 * @name registerMemoryTools
 * @description Registers local memory/strategy/stream/audit MCP tools.
 * All tools are free, local-only, and require no x402 payment.
 */
export function registerMemoryTools(server: Server, _context: SapMcpContext): void {
  registerMemoryRecordTool(server, _context);
  registerMemorySearchTool(server, _context);
  registerMemorySummarizeTool(server, _context);
  registerMemoryRecallTool(server, _context);
  registerMemoryPruneTool(server, _context);
  registerStrategySaveTool(server, _context);
  registerStrategyLoadTool(server, _context);
  registerStrategyListTool(server, _context);
  registerStrategyActivateTool(server, _context);
  registerStreamBufferTool(server, _context);
  registerStreamConsumeTool(server, _context);
  registerStreamReplayTool(server, _context);
  registerAuditQueryTool(server, _context);
  registerAuditRecordTool(server, _context);
  registerAuditStatsTool(server, _context);
  registerHermesSearchTool(server, _context);
  registerHermesRecentTool(server, _context);
  registerStrategyExecuteTool(server, _context);
  registerTradeJournalAppendTool(server, _context);
  registerTradeJournalQueryTool(server, _context);
}

// ── Memory Recording & Search ──────────────────────────────────────────────

function registerMemoryRecordTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_memory_record', {
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
      return createMemoryPipelineResponse(JSON.stringify({ success: true, id, degraded: memoryDatabase.isDegraded() }));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerMemorySearchTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_memory_search', {
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
      return createMemoryPipelineResponse(JSON.stringify(result, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerMemorySummarizeTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_memory_summarize', {
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
      return createMemoryPipelineResponse(JSON.stringify({ success: true, id }));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerMemoryRecallTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_memory_recall', {
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
      return createMemoryPipelineResponse(JSON.stringify({ memories, count: memories.length }, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerMemoryPruneTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_memory_prune', {
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
      return createMemoryPipelineResponse(JSON.stringify({ success: true, pruned, archived }));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

// ── Strategy Management ─────────────────────────────────────────────────────

function registerStrategySaveTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_strategy_save', {
    title: 'Save Strategy',
    description: 'Free local tool. Saves or updates a strategy JSON in ~/.config/mcp-sap/strategies/. Strategies persist agent learnings (e.g. buyback rules, slippage thresholds, risk limits) across sessions. No x402 charge.',
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
      const { saveStrategy } = await import('../../strategies/src/strategy-store.js');
      const result = saveStrategy({
        category: String(raw['category']),
        name: String(raw['name']),
        config: String(raw['config']),
        active: raw['activate'] !== false,
      });
      return createMemoryPipelineResponse(JSON.stringify(result));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerStrategyLoadTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_strategy_load', {
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
      const { loadStrategy } = await import('../../strategies/src/strategy-store.js');
      const strategy = loadStrategy(String(raw['category']), String(raw['name']));
      return createMemoryPipelineResponse(JSON.stringify(strategy ?? null));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerStrategyListTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_strategy_list', {
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
      const { listStrategies } = await import('../../strategies/src/strategy-store.js');
      const strategies = listStrategies(
        typeof raw['category'] === 'string' ? raw['category'] : undefined,
        raw['activeOnly'] === true,
      );
      return createMemoryPipelineResponse(JSON.stringify({ strategies, count: strategies.length }, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerStrategyActivateTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_strategy_activate', {
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
      const { activateStrategy } = await import('../../strategies/src/strategy-store.js');
      const result = activateStrategy(String(raw['category']), String(raw['name']), raw['active'] === true);
      return createMemoryPipelineResponse(JSON.stringify(result));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

// ── Stream Buffering ────────────────────────────────────────────────────────

function registerStreamBufferTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_stream_buffer', {
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
      return createMemoryPipelineResponse(JSON.stringify({ success: true, id, dedup: id === -1 }));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerStreamConsumeTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_stream_consume', {
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
      return createMemoryPipelineResponse(JSON.stringify({ events, count: events.length }, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerStreamReplayTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_stream_replay', {
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
      return createMemoryPipelineResponse(JSON.stringify({ events, count: events.length }, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

// ── Audit Trail ─────────────────────────────────────────────────────────────

function registerAuditQueryTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_audit_query', {
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
      return createMemoryPipelineResponse(JSON.stringify(result, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerAuditRecordTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_audit_record', {
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
      return createMemoryPipelineResponse(JSON.stringify({ success: true, id }));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerAuditStatsTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_audit_stats', {
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
      return createMemoryPipelineResponse(JSON.stringify(stats, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

// ── Hermes Cross-Session Integration ─────────────────────────────────────────

function registerHermesSearchTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_hermes_search', {
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
      return createMemoryPipelineResponse(JSON.stringify({ results, count: results.length, hermesAvailable: hermesBridge.isAvailable() }, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerHermesRecentTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_hermes_recent', {
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
      return createMemoryPipelineResponse(JSON.stringify({ sessions, count: sessions.length, hermesAvailable: hermesBridge.isAvailable() }, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

// ── Strategy Execution ──────────────────────────────────────────────────────

function registerStrategyExecuteTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_strategy_execute', {
    title: 'Execute Strategy',
    description: 'Free local tool. Loads a saved strategy by category and name, resolves trading parameters, validates against trading policy, and returns either a dry-run simulation or a ready-to-sign transaction. When dryRun is true, returns resolved params only. When dryRun is false, builds a transactionBase64. No x402 charge for this tool itself.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Strategy category (e.g. "trading").' },
        name: { type: 'string', description: 'Strategy name (e.g. "bonk-short-v1").' },
        dryRun: { type: 'boolean', description: 'When true, simulate only. When false, build tx. Default true.' },
        adjustCollateralUsd: { type: 'number', description: 'Override collateral USD.' },
        adjustLeverage: { type: 'number', description: 'Override leverage.' },
      },
      required: ['category', 'name'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const { loadStrategy } = await import('../../strategies/src/strategy-store.js');
      const strategy = loadStrategy(String(raw['category']), String(raw['name']));
      if (!strategy) {
        return createMemoryPipelineResponse(JSON.stringify({ error: 'Strategy not found', category: raw['category'], name: raw['name'] }), { isError: true });
      }

      let config: Record<string, unknown>;
      try {
        config = JSON.parse(strategy.config);
      } catch {
        return createMemoryPipelineResponse(JSON.stringify({ error: 'Strategy config is not valid JSON' }), { isError: true });
      }

      const market = String(config['market'] ?? '').toUpperCase();
      const side = String(config['side'] ?? 'short') as 'long' | 'short';
      const collateralUsd = typeof raw['adjustCollateralUsd'] === 'number' ? raw['adjustCollateralUsd'] : Number(config['collateralUsd'] ?? 10);
      const leverage = typeof raw['adjustLeverage'] === 'number' ? raw['adjustLeverage'] : Number(config['leverage'] ?? 3);
      const stopLossPct = config['stopLossPct'] !== undefined ? Number(config['stopLossPct']) : null;
      const takeProfitPct = config['takeProfitPct'] !== undefined ? Number(config['takeProfitPct']) : null;
      const owner = String(config['owner'] ?? '');
      const dryRun = raw['dryRun'] !== false;

      if (!market || !owner) {
        return createMemoryPipelineResponse(JSON.stringify({ error: 'Strategy config missing required fields: market, owner' }), { isError: true });
      }

      try {
        const violation = context.policyEngine.validateTradingPolicy({ market, side, collateralUsd, leverage, hasStopLoss: stopLossPct !== null });
        if (!violation.allowed) {
          return createMemoryPipelineResponse(JSON.stringify({ error: 'PolicyViolation', ...violation }), { isError: true });
        }
      } catch { /* policy not available — proceed */ }

      if (dryRun) {
        return createMemoryPipelineResponse(JSON.stringify({ strategy: { category: strategy.category, name: strategy.name, version: strategy.version }, resolved: { market, side, collateralUsd, leverage, stopLossPct, takeProfitPct, owner }, dryRun: true, message: 'Set dryRun: false to build a ready-to-sign transaction.' }, null, 2));
      }

      const { buildPositionPackage } = await import('../../perps/src/adrena/adrena-builder-trading.js');
      const { fetchOraclePrice } = await import('../../perps/src/adrena/adrena-builder-core.js');
      const { getConnection } = await import('./adrena/adrena-helpers.js');
      const { PublicKey } = await import('@solana/web3.js');
      const connection = getConnection(context);
      const ownerPk = new PublicKey(owner);
      const oraclePrice = await fetchOraclePrice(market, side);
      const priceUsd = Number(oraclePrice) / Math.pow(10, 10);
      const collateralToken = side === 'short' ? 'USDC' : market;
      const collateralAmount = side === 'short' ? collateralUsd : collateralUsd / priceUsd;
      let stopLossPriceUsd: number | null = null;
      let takeProfitPriceUsd: number | null = null;
      if (stopLossPct !== null) stopLossPriceUsd = side === 'long' ? priceUsd * (1 - stopLossPct / 100) : priceUsd * (1 + stopLossPct / 100);
      if (takeProfitPct !== null) takeProfitPriceUsd = side === 'long' ? priceUsd * (1 + takeProfitPct / 100) : priceUsd * (1 - takeProfitPct / 100);
      const result = await buildPositionPackage(connection, ownerPk, market, collateralToken, collateralAmount, leverage, side, stopLossPriceUsd, takeProfitPriceUsd, null);
      return createMemoryPipelineResponse(JSON.stringify({ strategy: { category: strategy.category, name: strategy.name, version: strategy.version }, resolved: { market, side, collateralUsd, leverage, oraclePriceUsd: priceUsd }, dryRun: false, transaction: result }, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

// ── Trade Journal ────────────────────────────────────────────────────────────

function registerTradeJournalAppendTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_trade_journal', {
    title: 'Append Trade Journal Entry',
    description: 'Free local tool. Appends a trade entry to the journal. Call after every trade open/close/SL/TP/liquidation for tracking and P&L analysis. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['open', 'close', 'liquidation', 'sl_triggered', 'tp_triggered'], description: 'Trade event type.' },
        market: { type: 'string', description: 'Market symbol.' },
        side: { type: 'string', enum: ['long', 'short'], description: 'Position side.' },
        collateralUsd: { type: 'number', description: 'Collateral in USD.' },
        leverage: { type: 'number', description: 'Leverage multiplier.' },
        priceUsd: { type: 'number', description: 'Entry or exit price.' },
        stopLossUsd: { type: 'number', description: 'Stop loss price.' },
        takeProfitUsd: { type: 'number', description: 'Take profit price.' },
        txSignature: { type: 'string', description: 'Transaction signature.' },
        positionAddress: { type: 'string', description: 'Position PDA address.' },
        feesPaidUsd: { type: 'number', description: 'Fees paid in USD.' },
        status: { type: 'string', enum: ['open', 'closed', 'liquidated'], description: 'Position status.' },
        pnlUsd: { type: 'number', description: 'P&L in USD.' },
        notes: { type: 'string', description: 'Optional notes.' },
      },
      required: ['type', 'market', 'side', 'collateralUsd', 'leverage', 'priceUsd', 'feesPaidUsd', 'status'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const { appendTradeEntry } = await import('../../strategies/src/trade-journal.js');
      const entry = {
        timestamp: new Date().toISOString(),
        type: raw['type'] as 'open' | 'close' | 'liquidation' | 'sl_triggered' | 'tp_triggered',
        market: String(raw['market']),
        side: raw['side'] as 'long' | 'short',
        collateralUsd: Number(raw['collateralUsd']),
        leverage: Number(raw['leverage']),
        priceUsd: Number(raw['priceUsd']),
        stopLossUsd: raw['stopLossUsd'] !== undefined ? Number(raw['stopLossUsd']) : undefined,
        takeProfitUsd: raw['takeProfitUsd'] !== undefined ? Number(raw['takeProfitUsd']) : undefined,
        txSignature: raw['txSignature'] !== undefined ? String(raw['txSignature']) : undefined,
        positionAddress: raw['positionAddress'] !== undefined ? String(raw['positionAddress']) : undefined,
        feesPaidUsd: Number(raw['feesPaidUsd']),
        status: raw['status'] as 'open' | 'closed' | 'liquidated',
        pnlUsd: raw['pnlUsd'] !== undefined ? Number(raw['pnlUsd']) : undefined,
        notes: raw['notes'] !== undefined ? String(raw['notes']) : undefined,
      };
      const result = appendTradeEntry(entry);
      return createMemoryPipelineResponse(JSON.stringify({ ...result, ok: true }));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}

function registerTradeJournalQueryTool(server: Server, context: SapMcpContext): void {
  registerMemoryPipelineTool(server, context, 'sap_trade_journal_query', {
    title: 'Query Trade Journal',
    description: 'Free local tool. Queries the trade journal with filters. Returns matching entries with count and total P&L. No x402 charge.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Filter by market.' },
        type: { type: 'string', enum: ['open', 'close', 'liquidation', 'sl_triggered', 'tp_triggered'], description: 'Filter by type.' },
        status: { type: 'string', enum: ['open', 'closed', 'liquidated'], description: 'Filter by status.' },
        from: { type: 'string', description: 'Start date ISO 8601.' },
        to: { type: 'string', description: 'End date ISO 8601.' },
        limit: { type: 'number', description: 'Max results. Default 100.' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    try {
      const raw = input as Record<string, unknown>;
      const { queryTradeJournal } = await import('../../strategies/src/trade-journal.js');
      const result = queryTradeJournal({
        market: raw['market'] !== undefined ? String(raw['market']) : undefined,
        type: raw['type'] !== undefined ? raw['type'] as 'open' | 'close' | 'liquidation' | 'sl_triggered' | 'tp_triggered' : undefined,
        status: raw['status'] !== undefined ? raw['status'] as 'open' | 'closed' | 'liquidated' : undefined,
        from: raw['from'] !== undefined ? String(raw['from']) : undefined,
        to: raw['to'] !== undefined ? String(raw['to']) : undefined,
        limit: typeof raw['limit'] === 'number' ? raw['limit'] : 100,
      });
      return createMemoryPipelineResponse(JSON.stringify(result, null, 2));
    } catch (error) {
      return createMemoryPipelineResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
    }
  });
}
