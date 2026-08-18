/**
 * @module memory/tool-call-store
 * @description Store for recording and searching tool call history.
 *
 * All methods are synchronous (better-sqlite3 is synchronous). FTS5 search
 * returns relevance-ranked results using the inverted index.
 */

import { memoryDatabase } from './database.js';
import { truncate } from './utils.js';
import type { ToolCallRecord, ToolCallOutcome, MemorySearchResult, MemoryQueryOptions } from './types.js';

/**
 * @name ToolCallStore
 * @description Records and queries tool call execution history.
 *
 * Every tool call (paid or free) is recorded with its input, output, outcome,
 * cost, and latency. The FTS5 index enables full-text search across all
 * recorded calls for pattern detection and failure analysis.
 */
export class ToolCallStore {
  /**
   * @name record
   * @description Records a tool call execution in the memory database.
   * @param record - Tool call data to record.
   * @returns The auto-incremented ID of the inserted record, or -1 if degraded.
   */
  record(record: Omit<ToolCallRecord, 'id' | 'createdAt' | 'updatedAt'>): number {
    if (memoryDatabase.isDegraded()) return -1;
    memoryDatabase.init();

    const stmt = memoryDatabase.getStatement('insert_tool_call');
    if (!stmt) return -1;

    const maxBytes = 8192;

    const result = stmt.run({
      toolName: record.toolName,
      sessionId: record.sessionId,
      callerProfile: record.callerProfile,
      input: truncate(record.input, maxBytes),
      output: truncate(record.output, maxBytes),
      outcome: record.outcome,
      costUsd: record.costUsd ?? null,
      txSignature: record.txSignature ?? null,
      latencyMs: record.latencyMs ?? null,
    });

    return result.lastInsertRowid as number;
  }

  /**
   * @name search
   * @description Full-text search across tool call history using FTS5.
   * @param options - Search options including query, filters, and pagination.
   * @returns Search results with relevance ranking.
   */
  search(options: MemoryQueryOptions): MemorySearchResult<ToolCallRecord> {
    if (memoryDatabase.isDegraded()) {
      return { results: [], total: 0, hasMore: false };
    }
    memoryDatabase.init();

    const db = memoryDatabase.getDb();
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    // Build FTS5 query with optional filters.
    let whereClause = '';
    const params: Record<string, unknown> = { limit, offset };

    if (options.toolName) {
      whereClause += ' AND t.tool_name = @toolName';
      params['toolName'] = options.toolName;
    }
    if (options.outcome) {
      whereClause += ' AND t.outcome = @outcome';
      params['outcome'] = options.outcome;
    }

    // FTS5 MATCH query — use bm25 ranking for relevance.
    const ftsQuery = this.buildFtsQuery(options.query);

    const sql = `
      SELECT t.id, t.tool_name, t.session_id, t.caller_profile, t.input, t.output,
             t.outcome, t.cost_usd, t.tx_signature, t.latency_ms,
             t.created_at, t.updated_at
      FROM tool_calls_fts fts
      JOIN tool_calls t ON t.id = fts.rowid
      WHERE tool_calls_fts MATCH @ftsQuery
      ${whereClause}
      ORDER BY ${options.sort === 'newest' ? 't.created_at DESC' : options.sort === 'oldest' ? 't.created_at ASC' : 'bm25(tool_calls_fts)'}
      LIMIT @limit OFFSET @offset
    `;

    params['ftsQuery'] = ftsQuery;

    try {
      const results = db.prepare(sql).all(params) as ToolCallRecord[];
      const countSql = `
        SELECT COUNT(*) as total
        FROM tool_calls_fts fts
        JOIN tool_calls t ON t.id = fts.rowid
        WHERE tool_calls_fts MATCH @ftsQuery ${whereClause}
      `;
      const countResult = db.prepare(countSql).get(params) as { total: number } | undefined;
      const total = countResult?.total ?? 0;

      return {
        results,
        total,
        hasMore: offset + results.length < total,
      };
    } catch {
      return { results: [], total: 0, hasMore: false };
    }
  }

  /**
   * @name count
   * @description Returns the total number of tool call records.
   */
  count(): number {
    if (memoryDatabase.isDegraded()) return 0;
    memoryDatabase.init();
    const stmt = memoryDatabase.getStatement('count_tool_calls');
    if (!stmt) return 0;
    return (stmt.get() as { count: number }).count;
  }

  /**
   * @name outcomeBreakdown
   * @description Returns counts grouped by outcome.
   */
  outcomeBreakdown(): Record<ToolCallOutcome, number> {
    if (memoryDatabase.isDegraded()) {
      return { success: 0, error: 0, partial: 0 };
    }
    memoryDatabase.init();
    const stmt = memoryDatabase.getStatement('count_tool_calls_by_outcome');
    if (!stmt) return { success: 0, error: 0, partial: 0 };

    const rows = stmt.all() as Array<{ outcome: ToolCallOutcome; count: number }>;
    const result: Record<ToolCallOutcome, number> = { success: 0, error: 0, partial: 0 };
    for (const row of rows) {
      result[row.outcome] = row.count;
    }
    return result;
  }

  /**
   * @name lastToolCallAt
   * @description Returns the timestamp of the most recent tool call.
   */
  lastToolCallAt(): string | null {
    if (memoryDatabase.isDegraded()) return null;
    memoryDatabase.init();
    const stmt = memoryDatabase.getStatement('last_tool_call_at');
    if (!stmt) return null;
    const row = stmt.get() as { created_at: string } | undefined;
    return row?.created_at ?? null;
  }

  /**
   * @name archive
   * @description Archives tool call records older than the retention period.
   * @param retentionDays - Number of days to keep records. Default 90.
   * @returns Number of records archived.
   */
  archive(retentionDays = 90): number {
    if (memoryDatabase.isDegraded()) return 0;
    memoryDatabase.init();
    const db = memoryDatabase.getDb();
    const result = db.prepare(
      `DELETE FROM tool_calls WHERE created_at < datetime('now', ?)`
    ).run(`-${retentionDays} days`);
    return result.changes;
  }

  /**
   * @name buildFtsQuery
   * @description Converts a natural language query into a FTS5 MATCH expression.
   * Handles multi-word queries by quoting phrases and prefixing with OR for
   * broader recall.
   * @internal
   */
  private buildFtsQuery(query: string): string {
    // Escape FTS5 special characters and wrap in quotes for phrase matching.
    const escaped = query.replace(/["'*:]/g, ' ').trim();
    if (!escaped) return '*';

    // For multi-word queries, use OR to match any word (broader recall).
    const words = escaped.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 1) return `"${words[0]}"*`;
    return words.map(w => `"${w}"*`).join(' OR ');
  }
}

/**
 * @name toolCallStore
 * @description Singleton instance of the tool call store.
 */
export const toolCallStore = new ToolCallStore();