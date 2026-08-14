/**
 * @module memory/hermes-bridge
 * @description Cross-session integration with Hermes Agent session database.
 *
 * If the user has Hermes Agent installed (detected via ~/.hermes/ directory),
 * the memory subsystem can query Hermes session history for cross-session
 * context. This enables the agent to recall relevant conversations from
 * previous Hermes sessions while keeping the data local.
 *
 * If Hermes is not installed, all bridge functions return empty results —
 * the memory subsystem operates standalone.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createRequire } from 'module';
import { logger } from '../core/logger.js';

const require = createRequire(import.meta.url);

/**
 * @name HermesBridge
 * @description Bridges the SAP MCP memory subsystem with Hermes Agent session data.
 *
 * Detection: checks for ~/.hermes/ directory. If present, the bridge can query
 * the Hermes SQLite session database for relevant past conversations.
 */
export class HermesBridge {
  private readonly hermesDir: string;
  private readonly legacyDbPath: string;
  private readonly stateDbPath: string;
  private available: boolean | null = null;

  constructor(hermesDir = join(homedir(), '.hermes')) {
    this.hermesDir = hermesDir;
    this.legacyDbPath = join(this.hermesDir, 'sessions.db');
    this.stateDbPath = join(this.hermesDir, 'state.db');
  }

  /**
   * @name isAvailable
   * @description Checks whether Hermes Agent is installed on this machine.
   * Caches the result to avoid repeated filesystem checks.
   */
  isAvailable(): boolean {
    if (this.available !== null) return this.available;
    this.available = existsSync(this.hermesDir);
    if (this.available) {
      logger.info('Hermes Agent detected — cross-session bridge enabled', {
        hermesDir: this.hermesDir,
      });
    }
    return this.available;
  }

  /**
   * @name getHermesDir
   * @description Returns the Hermes installation directory.
   */
  getHermesDir(): string {
    return this.hermesDir;
  }

  /**
   * @name searchSessions
   * @description Searches Hermes session history for relevant past conversations.
   *
   * This is a lightweight bridge — it reads the Hermes session database using
   * the same better-sqlite3 driver (opening a read-only connection). The query
   * uses FTS5 if the Hermes DB has it, otherwise falls back to LIKE search.
   *
   * @param query - Search query (natural language).
   * @param limit - Max results. Default 5.
   * @returns Array of session snippets with timestamps.
   */
  searchSessions(query: string, limit = 5): Array<{ sessionId: string; title: string; snippet: string; timestamp: string }> {
    if (!this.isAvailable()) return [];
    const dbPath = this.getReadableDbPath();
    if (!dbPath) return [];

    try {
      // Use dynamic import to avoid loading better-sqlite3 if Hermes is not present.
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });

      try {
        if (this.hasModernStateSchema(db)) {
          return this.searchModernStateDb(db, query, limit);
        }
        return this.searchLegacySessionsDb(db, query, limit);
      } finally {
        db.close();
      }
    } catch (error) {
      logger.debug('Hermes bridge query failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * @name getRecentSessions
   * @description Returns recent Hermes sessions for context injection.
   * @param limit - Max sessions. Default 3.
   */
  getRecentSessions(limit = 3): Array<{ sessionId: string; title: string; timestamp: string }> {
    if (!this.isAvailable()) return [];
    const dbPath = this.getReadableDbPath();
    if (!dbPath) return [];

    try {
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });

      try {
        if (this.hasModernStateSchema(db)) {
          const results = db.prepare(
            `SELECT
               id,
               COALESCE(NULLIF(title, ''), NULLIF(display_name, ''), 'Untitled') AS title,
               COALESCE(last_activity_at, started_at) AS timestamp
             FROM sessions
             ORDER BY COALESCE(last_activity_at, started_at) DESC
             LIMIT ?`
          ).all(limit) as Array<{ id: string; title: string; timestamp: number | string | null }>;

          return results.map(r => ({
            sessionId: r.id,
            title: r.title,
            timestamp: this.formatTimestamp(r.timestamp),
          }));
        }

        const results = db.prepare(
          `SELECT id, title, created_at FROM sessions
           ORDER BY created_at DESC LIMIT ?`
        ).all(limit) as Array<{ id: string; title: string | null; created_at: string }>;

        return results.map(r => ({
          sessionId: r.id,
          title: r.title ?? 'Untitled',
          timestamp: r.created_at,
        }));
      } finally {
        db.close();
      }
    } catch {
      return [];
    }
  }

  private getReadableDbPath(): string | null {
    if (existsSync(this.stateDbPath)) return this.stateDbPath;
    if (existsSync(this.legacyDbPath)) return this.legacyDbPath;
    return null;
  }

  private hasModernStateSchema(db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown } }): boolean {
    const sessions = db.prepare(
      `SELECT 1 FROM sqlite_master WHERE name = 'sessions' LIMIT 1`
    ).get();
    const messages = db.prepare(
      `SELECT 1 FROM sqlite_master WHERE name = 'messages' LIMIT 1`
    ).get();
    const startedAt = db.prepare(
      `SELECT 1 FROM pragma_table_info('sessions') WHERE name = 'started_at' LIMIT 1`
    ).get();
    const sessionId = db.prepare(
      `SELECT 1 FROM pragma_table_info('messages') WHERE name = 'session_id' LIMIT 1`
    ).get();
    return Boolean(sessions && messages && startedAt && sessionId);
  }

  private searchModernStateDb(
    db: { prepare: (sql: string) => { all: (...args: unknown[]) => unknown[]; get: (...args: unknown[]) => unknown } },
    query: string,
    limit: number,
  ): Array<{ sessionId: string; title: string; snippet: string; timestamp: string }> {
    if (this.hasTable(db, 'messages_fts')) {
      try {
        const rows = db.prepare(
          `SELECT
             s.id,
             COALESCE(NULLIF(s.title, ''), NULLIF(s.display_name, ''), 'Untitled') AS title,
             substr(COALESCE(m.content, m.api_content, ''), 1, 200) AS snippet,
             COALESCE(s.last_activity_at, s.started_at, m.timestamp) AS timestamp
           FROM messages_fts f
           JOIN messages m ON m.id = f.rowid
           JOIN sessions s ON s.id = m.session_id
           WHERE messages_fts MATCH ?
           GROUP BY s.id
           ORDER BY COALESCE(s.last_activity_at, s.started_at, m.timestamp) DESC
           LIMIT ?`
        ).all(this.toFtsPhrase(query), limit) as Array<{ id: string; title: string; snippet: string | null; timestamp: number | string | null }>;

        if (rows.length > 0) {
          return rows.map(r => ({
            sessionId: r.id,
            title: r.title,
            snippet: r.snippet ?? '',
            timestamp: this.formatTimestamp(r.timestamp),
          }));
        }
      } catch {
        // Fall back to LIKE below when the local Hermes FTS table is absent,
        // stale, or uses a tokenizer that rejects the raw user query.
      }
    }

    const rows = db.prepare(
      `SELECT
         s.id,
         COALESCE(NULLIF(s.title, ''), NULLIF(s.display_name, ''), 'Untitled') AS title,
         substr(COALESCE(m.content, m.api_content, ''), 1, 200) AS snippet,
         COALESCE(s.last_activity_at, s.started_at, m.timestamp) AS timestamp
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE COALESCE(m.content, m.api_content, '') LIKE ?
       GROUP BY s.id
       ORDER BY COALESCE(s.last_activity_at, s.started_at, m.timestamp) DESC
       LIMIT ?`
    ).all(`%${query}%`, limit) as Array<{ id: string; title: string; snippet: string | null; timestamp: number | string | null }>;

    return rows.map(r => ({
      sessionId: r.id,
      title: r.title,
      snippet: r.snippet ?? '',
      timestamp: this.formatTimestamp(r.timestamp),
    }));
  }

  private searchLegacySessionsDb(
    db: { prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] } },
    query: string,
    limit: number,
  ): Array<{ sessionId: string; title: string; snippet: string; timestamp: string }> {
    try {
      const ftsResults = db.prepare(
        `SELECT s.id, s.title, substr(m.content, 1, 200) as snippet, s.created_at
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE m.content MATCH ?
         ORDER BY s.created_at DESC
         LIMIT ?`
      ).all(query, limit) as Array<{ id: string; title: string | null; snippet: string | null; created_at: string }>;

      return ftsResults.map(r => ({
        sessionId: r.id,
        title: r.title ?? 'Untitled',
        snippet: r.snippet ?? '',
        timestamp: r.created_at,
      }));
    } catch {
      const likeResults = db.prepare(
        `SELECT s.id, s.title, substr(m.content, 1, 200) as snippet, s.created_at
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE m.content LIKE ?
         ORDER BY s.created_at DESC
         LIMIT ?`
      ).all(`%${query}%`, limit) as Array<{ id: string; title: string | null; snippet: string | null; created_at: string }>;

      return likeResults.map(r => ({
        sessionId: r.id,
        title: r.title ?? 'Untitled',
        snippet: r.snippet ?? '',
        timestamp: r.created_at,
      }));
    }
  }

  private hasTable(db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown } }, table: string): boolean {
    return Boolean(db.prepare(
      `SELECT 1 FROM sqlite_master WHERE name = ? LIMIT 1`
    ).get(table));
  }

  private toFtsPhrase(query: string): string {
    const trimmed = query.trim().replaceAll('"', '""');
    return trimmed ? `"${trimmed}"` : '""';
  }

  private formatTimestamp(value: number | string | null): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value * 1000).toISOString();
    }
    if (typeof value === 'string') return value;
    return '';
  }
}

/**
 * @name hermesBridge
 * @description Singleton instance of the Hermes bridge.
 */
export const hermesBridge = new HermesBridge();
