/**
 * @module memory/database
 * @description Thread-safe SQLite database manager for the SAP MCP agent memory subsystem.
 *
 * Uses better-sqlite3 (synchronous, native, FTS5-enabled) with WAL mode for
 * concurrent read access. The database is a singleton — one connection per process.
 *
 * Design principles:
 * - Synchronous I/O: better-sqlite3 is synchronous, no async overhead, no callback hell.
 * - WAL mode: readers don't block writers, crash-safe via WAL journal.
 * - Prepared statements: cached for performance, reused across calls.
 * - FTS5: inverted full-text index for relevance-ranked retrieval.
 * - Schema versioning: idempotent migrations on init.
 * - Graceful degradation: if the DB can't be opened, tools return empty results.
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { mkdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '@oobe-protocol-labs/sap-mcp-core/logger';
import { getMemoryDir } from '@oobe-protocol-labs/sap-mcp-config-runtime/paths';
import type { MemoryConfig } from './types.js';

/**
 * @name SCHEMA_VERSION
 * @description Current schema version. Increment when the schema changes.
 * The database tracks this in the `_meta` table and runs migrations as needed.
 */
const SCHEMA_VERSION = 1;

/**
 * @name DEFAULT_CONFIG
 * @description Default memory configuration. The DB is stored in
 * ~/.config/mcp-sap/memory/ which is the standard SAP MCP config directory.
 */
export const DEFAULT_CONFIG: MemoryConfig = {
  dbPath: join(getMemoryDir(), 'agent-memory.db'),
  enableWal: true,
  maxPayloadBytes: 8192,
  relevanceDecayPerDay: 0.01,
  minRelevanceThreshold: 0.05,
  toolCallRetentionDays: 90,
  maxStreamBufferSize: 10_000,
};

/**
 * @name MemoryDatabase
 * @description Thread-safe singleton managing the SQLite connection for agent memory.
 *
 * The class lazily initializes the database on first access and caches prepared
 * statements for performance. All methods are synchronous (better-sqlite3 is
 * synchronous by design). The database runs in WAL mode for concurrent reads.
 *
 * If the database cannot be opened (e.g. disk full, permissions), the instance
 * enters a degraded mode where all queries return empty results instead of
 * crashing the MCP server.
 */
export class MemoryDatabase {
  private db: DatabaseType | null = null;
  private readonly config: MemoryConfig;
  private degraded = false;
  private initialized = false;
  private statements: Map<string, Statement> = new Map();

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * @name init
   * @description Initializes the database connection, creates the schema, and
   * enables WAL mode. Called lazily on first query.
   */
  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      // Ensure the directory exists.
      const dir = dirname(this.config.dbPath);
      mkdirSync(dir, { recursive: true });

      // Open the database with better-sqlite3.
      this.db = new Database(this.config.dbPath);

      // Enable WAL mode for concurrent read access and crash safety.
      if (this.config.enableWal) {
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('wal_autocheckpoint = 1000');
      }

      // Set busy timeout to 5 seconds for concurrent access.
      this.db.pragma('busy_timeout = 5000');

      // Run schema migrations.
      this.runMigrations();

      // Prepare cached statements.
      this.prepareStatements();

      logger.info('Memory database initialized', {
        path: this.config.dbPath,
        wal: this.config.enableWal,
        schemaVersion: SCHEMA_VERSION,
      });
    } catch (error) {
      logger.error('Memory database initialization failed — entering degraded mode', {
        error: error instanceof Error ? error.message : String(error),
        path: this.config.dbPath,
      });
      this.degraded = true;
    }
  }

  /**
   * @name getDb
   * @description Returns the underlying Database instance. Throws if degraded.
   * @internal
   */
  public getDb(): DatabaseType {
    if (this.degraded || !this.db) {
      throw new Error('Memory database is in degraded mode — queries return empty results.');
    }
    return this.db;
  }

  /**
   * @name isDegraded
   * @description Returns true if the database is in degraded mode (init failed).
   */
  public isDegraded(): boolean {
    return this.degraded;
  }

  /**
   * @name getStatement
   * @description Returns a cached prepared statement by key.
   * @internal
   */
  public getStatement(key: string): Statement | undefined {
    return this.statements.get(key);
  }

  /**
   * @name close
   * @description Closes the database connection gracefully.
   */
  public close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Best-effort close.
      }
      this.db = null;
    }
    this.statements.clear();
    this.initialized = false;
  }

  /**
   * @name getDbSize
   * @description Returns the database file size in bytes.
   */
  public getDbSize(): number {
    try {
      return statSync(this.config.dbPath).size;
    } catch {
      return 0;
    }
  }

  // ── Schema Migrations ──────────────────────────────────────────────────────

  /**
   * @name runMigrations
   * @description Runs idempotent schema migrations. Each migration checks if
   * the current schema version is below the target and applies changes.
   * @internal
   */
  private runMigrations(): void {
    if (!this.db) return;

    // Create _meta table if it doesn't exist.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Get current schema version.
    const versionRow = this.db.prepare(
      'SELECT value FROM _meta WHERE key = ?'
    ).get('schema_version') as { value: string } | undefined;

    const currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;

    if (currentVersion < 1) {
      this.migrateToV1();
    }

    // Update schema version.
    this.db.prepare(
      'INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)'
    ).run('schema_version', SCHEMA_VERSION.toString());
  }

  /**
   * @name migrateToV1
   * @description Creates the initial schema: tool_calls, agent_memory,
   * stream_buffers, and their FTS5 indexes.
   * @internal
   */
  private migrateToV1(): void {
    if (!this.db) return;

    this.db.exec(`
      -- Tool call history
      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        session_id TEXT,
        caller_profile TEXT,
        input TEXT,
        output TEXT,
        outcome TEXT NOT NULL DEFAULT 'success',
        cost_usd REAL DEFAULT 0,
        tx_signature TEXT,
        latency_ms INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_tool_calls_tool ON tool_calls(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_outcome ON tool_calls(outcome);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_created ON tool_calls(created_at);

      -- FTS5 inverted index for tool call search
      CREATE VIRTUAL TABLE IF NOT EXISTS tool_calls_fts USING fts5(
        tool_name,
        input,
        output,
        content='tool_calls',
        content_rowid='id'
      );

      -- Triggers to keep FTS index in sync with tool_calls
      CREATE TRIGGER IF NOT EXISTS tool_calls_ai AFTER INSERT ON tool_calls BEGIN
        INSERT INTO tool_calls_fts(rowid, tool_name, input, output)
        VALUES (new.id, new.tool_name, new.input, new.output);
      END;

      CREATE TRIGGER IF NOT EXISTS tool_calls_ad AFTER DELETE ON tool_calls BEGIN
        INSERT INTO tool_calls_fts(tool_calls_fts, rowid, tool_name, input, output)
        VALUES ('delete', old.id, old.tool_name, old.input, old.output);
      END;

      CREATE TRIGGER IF NOT EXISTS tool_calls_au AFTER UPDATE ON tool_calls BEGIN
        INSERT INTO tool_calls_fts(tool_calls_fts, rowid, tool_name, input, output)
        VALUES ('delete', old.id, old.tool_name, old.input, old.output);
        INSERT INTO tool_calls_fts(rowid, tool_name, input, output)
        VALUES (new.id, new.tool_name, new.input, new.output);
      END;

      -- Agent memory — LLM-generated summaries
      CREATE TABLE IF NOT EXISTS agent_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_type TEXT NOT NULL,
        category TEXT NOT NULL,
        summary TEXT NOT NULL,
        source_tool_calls TEXT,
        relevance_score REAL DEFAULT 0.5,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT,
        last_accessed_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_agent_memory_category ON agent_memory(category);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_relevance ON agent_memory(relevance_score);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_type ON agent_memory(memory_type);

      -- FTS5 inverted index for agent memory search
      CREATE VIRTUAL TABLE IF NOT EXISTS agent_memory_fts USING fts5(
        memory_type,
        category,
        summary,
        content='agent_memory',
        content_rowid='id'
      );

      -- Triggers to keep FTS index in sync with agent_memory
      CREATE TRIGGER IF NOT EXISTS agent_memory_ai AFTER INSERT ON agent_memory BEGIN
        INSERT INTO agent_memory_fts(rowid, memory_type, category, summary)
        VALUES (new.id, new.memory_type, new.category, new.summary);
      END;

      CREATE TRIGGER IF NOT EXISTS agent_memory_ad AFTER DELETE ON agent_memory BEGIN
        INSERT INTO agent_memory_fts(agent_memory_fts, rowid, memory_type, category, summary)
        VALUES ('delete', old.id, old.memory_type, old.category, old.summary);
      END;

      CREATE TRIGGER IF NOT EXISTS agent_memory_au AFTER UPDATE ON agent_memory BEGIN
        INSERT INTO agent_memory_fts(agent_memory_fts, rowid, memory_type, category, summary)
        VALUES ('delete', old.id, old.memory_type, old.category, old.summary);
        INSERT INTO agent_memory_fts(rowid, memory_type, category, summary)
        VALUES (new.id, new.memory_type, new.category, new.summary);
      END;

      -- Stream buffer events
      CREATE TABLE IF NOT EXISTS stream_buffers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_type TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        consumed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_stream_buffers_type ON stream_buffers(stream_type);
      CREATE INDEX IF NOT EXISTS idx_stream_buffers_consumed ON stream_buffers(consumed);
      CREATE INDEX IF NOT EXISTS idx_stream_buffers_created ON stream_buffers(created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_buffers_event ON stream_buffers(stream_type, event_id);
    `);
  }

  /**
   * @name prepareStatements
   * @description Pre-compiles and caches frequently used SQL statements.
   * @internal
   */
  private prepareStatements(): void {
    if (!this.db) return;

    // Tool calls
    this.statements.set('insert_tool_call', this.db.prepare(
      `INSERT INTO tool_calls (tool_name, session_id, caller_profile, input, output, outcome, cost_usd, tx_signature, latency_ms)
       VALUES (@toolName, @sessionId, @callerProfile, @input, @output, @outcome, @costUsd, @txSignature, @latencyMs)`
    ));

    this.statements.set('count_tool_calls', this.db.prepare(
      'SELECT COUNT(*) as count FROM tool_calls'
    ));

    this.statements.set('count_tool_calls_by_outcome', this.db.prepare(
      'SELECT outcome, COUNT(*) as count FROM tool_calls GROUP BY outcome'
    ));

    this.statements.set('last_tool_call_at', this.db.prepare(
      'SELECT created_at FROM tool_calls ORDER BY id DESC LIMIT 1'
    ));

    // Agent memory
    this.statements.set('insert_memory', this.db.prepare(
      `INSERT INTO agent_memory (memory_type, category, summary, source_tool_calls, relevance_score, expires_at)
       VALUES (@memoryType, @category, @summary, @sourceToolCalls, @relevanceScore, @expiresAt)`
    ));

    this.statements.set('count_memory', this.db.prepare(
      'SELECT COUNT(*) as count FROM agent_memory'
    ));

    this.statements.set('count_memory_by_type', this.db.prepare(
      'SELECT memory_type, COUNT(*) as count FROM agent_memory GROUP BY memory_type'
    ));

    this.statements.set('last_memory_at', this.db.prepare(
      'SELECT created_at FROM agent_memory ORDER BY id DESC LIMIT 1'
    ));

    this.statements.set('update_memory_access', this.db.prepare(
      'UPDATE agent_memory SET last_accessed_at = datetime(\'now\') WHERE id = ?'
    ));

    // Stream buffers
    this.statements.set('count_pending_streams', this.db.prepare(
      'SELECT COUNT(*) as count FROM stream_buffers WHERE consumed = 0'
    ));

    this.statements.set('insert_stream_event', this.db.prepare(
      `INSERT OR IGNORE INTO stream_buffers (stream_type, event_id, event_type, payload, consumed)
       VALUES (@streamType, @eventId, @eventType, @payload, 0)`
    ));

    this.statements.set('consume_stream_events', this.db.prepare(
      'UPDATE stream_buffers SET consumed = 1 WHERE stream_type = ? AND id <= ?'
    ));
  }
}

/**
 * @name memoryDatabase
 * @description Singleton instance of the memory database.
 * Lazily initialized on first access. Shared across all memory tools.
 */
export const memoryDatabase = new MemoryDatabase();
