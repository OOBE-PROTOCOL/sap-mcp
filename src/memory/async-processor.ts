/**
 * @module memory/async-processor
 * @description Async background processor for memory maintenance tasks.
 *
 * Runs periodic maintenance on the memory database without blocking the main
 * event loop:
 * - Relevance decay application (every 1 hour)
 * - Stream buffer eviction (every 5 minutes)
 * - Tool call archiving (every 1 hour)
 * - Memory pruning (every 6 hours)
 * - WAL checkpoint (every 10 minutes)
 *
 * Uses setImmediate + setTimeout for non-blocking scheduling. The processor
 * is a singleton that starts when the MCP server boots and stops on shutdown.
 */

import { memoryDatabase } from './database.js';
import { toolCallStore } from './tool-call-store.js';
import { memoryStore } from './memory-store.js';
import { streamBufferStore } from './stream-buffer-store.js';
import { logger } from '../core/logger.js';

/**
 * @name MaintenanceSchedule
 * @description Interval configuration for each maintenance task.
 */
interface MaintenanceSchedule {
  /** Apply relevance decay to all memories. */
  decayIntervalMs: number;
  /** Evict old consumed stream events. */
  evictIntervalMs: number;
  /** Archive old tool call records. */
  archiveIntervalMs: number;
  /** Prune expired + low-relevance memories. */
  pruneIntervalMs: number;
  /** WAL checkpoint to prevent WAL file growth. */
  checkpointIntervalMs: number;
}

const DEFAULT_SCHEDULE: MaintenanceSchedule = {
  decayIntervalMs: 60 * 60 * 1000,       // 1 hour
  evictIntervalMs: 5 * 60 * 1000,         // 5 minutes
  archiveIntervalMs: 60 * 60 * 1000,       // 1 hour
  pruneIntervalMs: 6 * 60 * 60 * 1000,     // 6 hours
  checkpointIntervalMs: 10 * 60 * 1000,    // 10 minutes
};

/**
 * @name AsyncMemoryProcessor
 * @description Background processor for memory maintenance.
 *
 * Runs non-blocking periodic tasks using setTimeout chains (not setInterval,
 * to avoid overlapping executions). Each task catches its own errors and logs
 * them — a failure in one task doesn't stop the others.
 */
export class AsyncMemoryProcessor {
  private timers: Set<ReturnType<typeof setTimeout>> = new Set();
  private running = false;
  private readonly schedule: MaintenanceSchedule;

  constructor(schedule: Partial<MaintenanceSchedule> = {}) {
    this.schedule = { ...DEFAULT_SCHEDULE, ...schedule };
  }

  /**
   * @name start
   * @description Starts all background maintenance tasks.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.scheduleTask('decay', this.schedule.decayIntervalMs, () => this.runDecay());
    this.scheduleTask('evict', this.schedule.evictIntervalMs, () => this.runEvict());
    this.scheduleTask('archive', this.schedule.archiveIntervalMs, () => this.runArchive());
    this.scheduleTask('prune', this.schedule.pruneIntervalMs, () => this.runPrune());
    this.scheduleTask('checkpoint', this.schedule.checkpointIntervalMs, () => this.runCheckpoint());

    logger.info('Memory async processor started', {
      tasks: ['decay', 'evict', 'archive', 'prune', 'checkpoint'],
    });
  }

  /**
   * @name stop
   * @description Stops all background tasks and clears timers.
   */
  stop(): void {
    this.running = false;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    logger.info('Memory async processor stopped');
  }

  /**
   * @name isRunning
   * @description Returns whether the processor is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  // ── Task Scheduling ────────────────────────────────────────────────────────

  /**
   * @name scheduleTask
   * @description Schedules a recurring task using setTimeout chains.
   * Uses setImmediate for the first run to avoid blocking server startup.
   * @internal
   */
  private scheduleTask(name: string, intervalMs: number, task: () => void): void {
    const run = (): void => {
      if (!this.running) return;

      // Execute the task — errors are caught and logged, never propagated.
      try {
        task();
      } catch (error) {
        logger.warn(`Memory maintenance task "${name}" failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Schedule the next run.
      if (this.running) {
        const timer = setTimeout(run, intervalMs);
        this.timers.add(timer);
        // Auto-clean the timer reference when it fires.
        timer.unref?.();
      }
    };

    // First run after a short delay (don't block startup).
    const timer = setTimeout(run, 5000);
    this.timers.add(timer);
    timer.unref?.();
  }

  // ── Maintenance Tasks ──────────────────────────────────────────────────────

  /**
   * @name runDecay
   * @description Applies relevance decay to all agent memories.
   * The decay is computed in JS (better-sqlite3 is synchronous) and applied
   * as a batch UPDATE.
   * @internal
   */
  private runDecay(): void {
    if (memoryDatabase.isDegraded()) return;
    memoryDatabase.init();

    const db = memoryDatabase.getDb();
    const rows = db.prepare(
      'SELECT id, relevance_score, created_at FROM agent_memory WHERE expires_at IS NULL OR expires_at > datetime(\'now\')'
    ).all() as Array<{ id: number; relevance_score: number; created_at: string }>;

    let updated = 0;
    const updateStmt = db.prepare('UPDATE agent_memory SET relevance_score = ? WHERE id = ?');
    const now = Date.now();

    for (const row of rows) {
      const created = new Date(row.created_at).getTime();
      const daysSince = (now - created) / (1000 * 60 * 60 * 24);
      const decayed = row.relevance_score * Math.pow(0.99, daysSince);
      const clamped = Math.max(0, Math.min(1, decayed));

      if (Math.abs(clamped - row.relevance_score) > 0.001) {
        updateStmt.run(clamped, row.id);
        updated++;
      }
    }

    if (updated > 0) {
      logger.debug('Memory decay applied', { updated, total: rows.length });
    }
  }

  /**
   * @name runEvict
   * @description Evicts old consumed stream events to keep the buffer bounded.
   * @internal
   */
  private runEvict(): void {
    if (memoryDatabase.isDegraded()) return;
    const evicted = streamBufferStore.evict(10_000);
    if (evicted > 0) {
      logger.debug('Stream buffer evicted', { evicted });
    }
  }

  /**
   * @name runArchive
   * @description Archives tool call records older than the retention period.
   * @internal
   */
  private runArchive(): void {
    if (memoryDatabase.isDegraded()) return;
    const archived = toolCallStore.archive(90);
    if (archived > 0) {
      logger.debug('Tool calls archived', { archived });
    }
  }

  /**
   * @name runPrune
   * @description Prunes expired and low-relevance memories.
   * @internal
   */
  private runPrune(): void {
    if (memoryDatabase.isDegraded()) return;
    const pruned = memoryStore.prune(0.05);
    if (pruned > 0) {
      logger.debug('Memories pruned', { pruned });
    }
  }

  /**
   * @name runCheckpoint
   * @description Forces a WAL checkpoint to prevent the WAL file from growing
   * unbounded. Uses PASSIVE mode to avoid blocking readers.
   * @internal
   */
  private runCheckpoint(): void {
    if (memoryDatabase.isDegraded()) return;
    try {
      memoryDatabase.getDb().pragma('wal_checkpoint(PASSIVE)');
    } catch {
      // Best-effort checkpoint.
    }
  }
}

/**
 * @name asyncMemoryProcessor
 * @description Singleton instance of the async memory processor.
 */
export const asyncMemoryProcessor = new AsyncMemoryProcessor();