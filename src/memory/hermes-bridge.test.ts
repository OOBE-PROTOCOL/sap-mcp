import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { HermesBridge } from './hermes-bridge.js';

let tempDirs: string[] = [];

function makeHermesDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sap-hermes-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('HermesBridge', () => {
  it('searches modern Hermes state.db sessions', () => {
    const hermesDir = makeHermesDir();
    const db = new Database(join(hermesDir, 'state.db'));
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        display_name TEXT,
        started_at REAL NOT NULL,
        last_activity_at REAL
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        content TEXT,
        api_content TEXT,
        timestamp REAL NOT NULL
      );
      CREATE VIRTUAL TABLE messages_fts USING fts5(content);
    `);
    db.prepare(
      `INSERT INTO sessions (id, title, started_at, last_activity_at)
       VALUES (?, ?, ?, ?)`
    ).run('20260806_144508_0e27f7', 'SAP MCP profile check', 1786000000, 1786000100);
    const message = db.prepare(
      `INSERT INTO messages (session_id, content, timestamp) VALUES (?, ?, ?)`
    ).run('20260806_144508_0e27f7', 'Connect to SAP MCP and show active profile', 1786000050);
    db.prepare(`INSERT INTO messages_fts (rowid, content) VALUES (?, ?)`)
      .run(Number(message.lastInsertRowid), 'Connect to SAP MCP and show active profile');
    db.close();

    const bridge = new HermesBridge(hermesDir);
    const results = bridge.searchSessions('SAP MCP', 5);

    expect(results).toEqual([
      {
        sessionId: '20260806_144508_0e27f7',
        title: 'SAP MCP profile check',
        snippet: 'Connect to SAP MCP and show active profile',
        timestamp: '2026-08-06T07:08:20.000Z',
      },
    ]);
  });

  it('returns recent sessions from modern Hermes state.db', () => {
    const hermesDir = makeHermesDir();
    const db = new Database(join(hermesDir, 'state.db'));
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        display_name TEXT,
        started_at REAL NOT NULL,
        last_activity_at REAL
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        content TEXT,
        timestamp REAL NOT NULL
      );
    `);
    db.prepare(`INSERT INTO sessions (id, title, started_at, last_activity_at) VALUES (?, ?, ?, ?)`)
      .run('older', 'Older', 1786000000, 1786000100);
    db.prepare(`INSERT INTO sessions (id, title, started_at, last_activity_at) VALUES (?, ?, ?, ?)`)
      .run('newer', 'Newer', 1786000000, 1786000200);
    db.close();

    const bridge = new HermesBridge(hermesDir);

    expect(bridge.getRecentSessions(1)).toEqual([
      {
        sessionId: 'newer',
        title: 'Newer',
        timestamp: '2026-08-06T07:10:00.000Z',
      },
    ]);
  });

  it('falls back to legacy sessions.db', () => {
    const hermesDir = makeHermesDir();
    const db = new Database(join(hermesDir, 'sessions.db'));
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at TEXT
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        content TEXT
      );
    `);
    db.prepare(`INSERT INTO sessions (id, title, created_at) VALUES (?, ?, ?)`)
      .run('legacy-session', null, '2026-08-06T12:00:00.000Z');
    db.prepare(`INSERT INTO messages (session_id, content) VALUES (?, ?)`)
      .run('legacy-session', 'SAP MCP legacy Hermes memory');
    db.close();

    const bridge = new HermesBridge(hermesDir);

    expect(bridge.searchSessions('SAP MCP', 5)).toEqual([
      {
        sessionId: 'legacy-session',
        title: 'Untitled',
        snippet: 'SAP MCP legacy Hermes memory',
        timestamp: '2026-08-06T12:00:00.000Z',
      },
    ]);
  });
});
