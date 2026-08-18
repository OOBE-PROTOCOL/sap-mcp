/**
 * @name task-manager
 * @description MCP experimental task support for long-running operations.
 * Wraps the SDK's experimental/tasks API to provide async task tracking
 * for operations like transaction submission, on-chain confirmation, and
 * premium stream processing.
 *
 * Tasks allow the client to poll status instead of blocking the tool call.
 * The client receives a task ID and can query progress until completion.
 *
 * @module tools/task-manager
 */

import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js';
import type { TaskStatus } from '@modelcontextprotocol/sdk/types.js';

/**
 * @name TaskState
 * @description Internal state tracked for each async task.
 */
interface TaskState {
  id: string;
  toolName: string;
  status: TaskStatus;
  progress: number;
  total: number;
  message: string;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * @name TaskManager
 * @description Manages async MCP tasks for long-running tool operations.
 * Uses an in-memory store for task state. In production with multiple
 * server instances, this should be replaced with a Redis-backed store.
 */
export class TaskManager {
  private static instance: TaskManager | undefined;
  private readonly tasks = new Map<string, TaskState>();
  private readonly store: InMemoryTaskStore;

  private constructor() {
    this.store = new InMemoryTaskStore();
  }

  /**
   * @name getInstance
   * @description Singleton accessor for the global task manager.
   */
  static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  /**
   * @name getStore
   * @description Returns the SDK task store for integration with the MCP server.
   */
  getStore(): InMemoryTaskStore {
    return this.store;
  }

  /**
   * @name createTask
   * @description Create a new async task for a long-running tool operation.
   * Returns the task ID that the client can use to poll status.
   */
  createTask(toolName: string, message: string, total: number = 100): string {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    this.tasks.set(id, {
      id,
      toolName,
      status: 'working',
      progress: 0,
      total,
      message,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  /**
   * @name updateProgress
   * @description Update task progress. Called by long-running operations
   * to report incremental progress to the client.
   */
  updateProgress(id: string, progress: number, message?: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.progress = Math.min(progress, task.total);
    task.status = task.progress >= task.total ? 'completed' : 'working';
    if (message) task.message = message;
    task.updatedAt = Date.now();
  }

  /**
   * @name completeTask
   * @description Mark a task as completed with the final result.
   */
  completeTask(id: string, result: unknown): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'completed';
    task.progress = task.total;
    task.result = result;
    task.updatedAt = Date.now();
  }

  /**
   * @name failTask
   * @description Mark a task as failed with an error message.
   */
  failTask(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'failed';
    task.error = error;
    task.updatedAt = Date.now();
  }

  /**
   * @name getTask
   * @description Get the current state of a task for client polling.
   */
  getTask(id: string): TaskState | undefined {
    return this.tasks.get(id);
  }

  /**
   * @name getTaskStatus
   * @description Get a lightweight status snapshot suitable for MCP task status notifications.
   */
  getTaskStatus(id: string): { status: TaskStatus; progress: number; message: string } | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    return {
      status: task.status,
      progress: task.progress,
      message: task.message,
    };
  }

  /**
   * @name cleanup
   * @description Remove completed/failed tasks older than the specified TTL (ms).
   */
  cleanup(ttlMs: number = 300_000): void {
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if ((task.status === 'completed' || task.status === 'failed') && (now - task.updatedAt) > ttlMs) {
        this.tasks.delete(id);
      }
    }
  }

  /**
   * @name isLongRunningTool
   * @description Check if a tool is a candidate for async task execution.
   * Tools that involve on-chain confirmation or premium streaming are
   * good candidates for task-based execution.
   */
  static isLongRunningTool(toolName: string): boolean {
    const longRunningPatterns = [
      'submit_signed_transaction',
      'sap_payments_finalize',
      'sap_payments_sign_challenge',
      'sap_adrena_build_position_package',
      'sap_adrena_simulate_position',
    ];
    return longRunningPatterns.some(p => toolName.includes(p));
  }
}