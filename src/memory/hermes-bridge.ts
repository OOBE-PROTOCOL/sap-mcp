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
  private readonly hermesDbPath: string;
  private available: boolean | null = null;

  constructor() {
    this.hermesDir = join(homedir(), '.hermes');
    this.hermesDbPath = join(this.hermesDir, 'sessions.db');
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
    if (!existsSync(this.hermesDbPath)) return [];

    try {
      // Use dynamic import to avoid loading better-sqlite3 if Hermes is not present.
      const Database = require('better-sqlite3');
      const db = new Database(this.hermesDbPath, { readonly: true });

      try {
        // Try FTS5 search first (if Hermes has it).
        const ftsResults = db.prepare(
          `SELECT s.id, s.title, substr(m.content, 1, 200) as snippet, s.created_at
           FROM messages m
           JOIN sessions s ON s.id = m.session_id
           WHERE m.content MATCH ?
           ORDER BY s.created_at DESC
           LIMIT ?`
        ).all(query, limit) as Array<{ id: string; title: string; snippet: string; created_at: string }>;

        return ftsResults.map(r => ({
          sessionId: r.id,
          title: r.title ?? 'Untitled',
          snippet: r.snippet,
          timestamp: r.created_at,
        }));
      } catch {
        // FTS not available — try LIKE search.
        const likeResults = db.prepare(
          `SELECT s.id, s.title, substr(m.content, 1, 200) as snippet, s.created_at
           FROM messages m
           JOIN sessions s ON s.id = m.session_id
           WHERE m.content LIKE ?
           ORDER BY s.created_at DESC
           LIMIT ?`
        ).all(`%${query}%`, limit) as Array<{ id: string; title: string; snippet: string; created_at: string }>;

        return likeResults.map(r => ({
          sessionId: r.id,
          title: r.title ?? 'Untitled',
          snippet: r.snippet,
          timestamp: r.created_at,
        }));
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
    if (!existsSync(this.hermesDbPath)) return [];

    try {
      const Database = require('better-sqlite3');
      const db = new Database(this.hermesDbPath, { readonly: true });

      try {
        const results = db.prepare(
          `SELECT id, title, created_at FROM sessions
           ORDER BY created_at DESC LIMIT ?`
        ).all(limit) as Array<{ id: string; title: string; created_at: string }>;

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
}

/**
 * @name hermesBridge
 * @description Singleton instance of the Hermes bridge.
 */
export const hermesBridge = new HermesBridge();