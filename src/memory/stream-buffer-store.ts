/**
 * @module memory/stream-buffer-store
 * @description Store for buffering stream events locally in SQLite.
 *
 * Premium stream events (Pyth price ticks, meme alerts, volatility signals) are
 * persisted locally so the agent can consume them without paid polls. Events
 * are deduplicated by (streamType, eventId) and consumed in FIFO order.
 */

import { memoryDatabase } from './database.js';
import type { StreamBufferRecord } from './types.js';

/**
 * @name StreamBufferStore
 * @description Manages local stream event buffering with FIFO consumption.
 */
export class StreamBufferStore {
  /**
   * @name buffer
   * @description Buffers a stream event. Deduplicates by (streamType, eventId).
   * @param record - Event to buffer.
   * @returns The row ID, or -1 if the event was already buffered (dedup).
   */
  buffer(record: Omit<StreamBufferRecord, 'id' | 'consumed' | 'createdAt'>): number {
    if (memoryDatabase.isDegraded()) return -1;
    memoryDatabase.init();

    const stmt = memoryDatabase.getStatement('insert_stream_event');
    if (!stmt) return -1;

    try {
      const result = stmt.run({
        streamType: record.streamType,
        eventId: record.eventId,
        eventType: record.eventType,
        payload: record.payload,
      });
      return result.lastInsertRowid as number;
    } catch {
      // INSERT OR IGNORE — dedup case, event already exists.
      return -1;
    }
  }

  /**
   * @name consume
   * @description Returns unconsumed events for a stream type and marks them consumed.
   * FIFO order (oldest first). Returns up to `limit` events.
   * @param streamType - Stream type to consume (e.g. 'pyth-price').
   * @param limit - Maximum events to consume. Default 20.
   * @returns Consumed events.
   */
  consume(streamType: string, limit = 20): StreamBufferRecord[] {
    if (memoryDatabase.isDegraded()) return [];
    memoryDatabase.init();

    const db = memoryDatabase.getDb();
    try {
      const events = db.prepare(
        `SELECT * FROM stream_buffers
         WHERE stream_type = ? AND consumed = 0
         ORDER BY id ASC
         LIMIT ?`
      ).all(streamType, limit) as StreamBufferRecord[];

      if (events.length === 0) return [];

      // Mark as consumed.
      const lastId = events[events.length - 1].id;
      if (lastId !== undefined) {
        const consumeStmt = memoryDatabase.getStatement('consume_stream_events');
        consumeStmt?.run(streamType, lastId);
      }

      return events;
    } catch {
      return [];
    }
  }

  /**
   * @name peek
   * @description Returns unconsumed events without marking them consumed.
   * Used for preview/inspection.
   */
  peek(streamType: string, limit = 20): StreamBufferRecord[] {
    if (memoryDatabase.isDegraded()) return [];
    memoryDatabase.init();

    const db = memoryDatabase.getDb();
    try {
      return db.prepare(
        `SELECT * FROM stream_buffers
         WHERE stream_type = ? AND consumed = 0
         ORDER BY id ASC
         LIMIT ?`
      ).all(streamType, limit) as StreamBufferRecord[];
    } catch {
      return [];
    }
  }

  /**
   * @name replay
   * @description Returns all events (consumed + unconsumed) for a stream type
   * within a time range. Used for backtest/analysis.
   * @param streamType - Stream type to replay.
   * @param since - ISO 8601 timestamp. Events created after this time.
   * @param limit - Maximum events. Default 100.
   */
  replay(streamType: string, since?: string, limit = 100): StreamBufferRecord[] {
    if (memoryDatabase.isDegraded()) return [];
    memoryDatabase.init();

    const db = memoryDatabase.getDb();
    try {
      if (since) {
        return db.prepare(
          `SELECT * FROM stream_buffers
           WHERE stream_type = ? AND created_at >= ?
           ORDER BY id ASC LIMIT ?`
        ).all(streamType, since, limit) as StreamBufferRecord[];
      }
      return db.prepare(
        `SELECT * FROM stream_buffers
         WHERE stream_type = ?
         ORDER BY id ASC LIMIT ?`
      ).all(streamType, limit) as StreamBufferRecord[];
    } catch {
      return [];
    }
  }

  /**
   * @name pendingCount
   * @description Returns the number of unconsumed events.
   */
  pendingCount(): number {
    if (memoryDatabase.isDegraded()) return 0;
    memoryDatabase.init();
    const stmt = memoryDatabase.getStatement('count_pending_streams');
    if (!stmt) return 0;
    return (stmt.get() as { count: number }).count;
  }

  /**
   * @name evict
   * @description Evicts old consumed events to keep the buffer bounded.
   * @param maxPerType - Maximum events per stream type. Default 10000.
   * @returns Number of events evicted.
   */
  evict(maxPerType = 10_000): number {
    if (memoryDatabase.isDegraded()) return 0;
    memoryDatabase.init();
    const db = memoryDatabase.getDb();
    try {
      // Delete oldest consumed events that exceed the per-type limit.
      const result = db.prepare(
        `DELETE FROM stream_buffers
         WHERE consumed = 1 AND id NOT IN (
           SELECT id FROM stream_buffers
           WHERE stream_type = (SELECT stream_type FROM stream_buffers s2 WHERE s2.id = stream_buffers.id)
           ORDER BY id DESC LIMIT ?
         )`
      ).run(maxPerType);
      return result.changes;
    } catch {
      return 0;
    }
  }

  /**
   * @name clear
   * @description Clears all events for a stream type.
   */
  clear(streamType: string): number {
    if (memoryDatabase.isDegraded()) return 0;
    memoryDatabase.init();
    const db = memoryDatabase.getDb();
    try {
      const result = db.prepare(
        'DELETE FROM stream_buffers WHERE stream_type = ?'
      ).run(streamType);
      return result.changes;
    } catch {
      return 0;
    }
  }
}

/**
 * @name streamBufferStore
 * @description Singleton instance of the stream buffer store.
 */
export const streamBufferStore = new StreamBufferStore();