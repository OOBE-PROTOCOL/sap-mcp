/**
 * @name payments/prepaid-credit-store
 * @description In-memory + file-persisted prepaid credit store for x402 sessions.
 *
 * Allows agents to prepay a USDC balance once (via standard x402 challenge →
 * sign → settle) and then make multiple tool calls without per-call 402
 * challenges. The server checks the prepaid balance in `onProtectedRequest`
 * and grants access by returning `{ grantAccess: true }` (standard x402
 * Lifecycle Hooks extension) when sufficient balance exists.
 *
 * The store is backed by a JSON file at ~/.config/mcp-sap/payments/prepaid.json
 * so credits survive server restarts. An in-memory Map provides fast lookups.
 *
 * @module payments/prepaid-credit-store
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../../core/src/logger.js';
import { getPreferredConfigDir } from '../../config-runtime/src/paths.js';

/** Prepaid credit entry for a wallet. */
export interface PrepaidCredit {
  /** Unique session ID used as the X-SAP-Prepaid-Session header value. */
  sessionId: string;
  /** Wallet address that funded the session (payer). */
  wallet: string;
  /** Total USDC deposited when the session was created. */
  totalUsd: number;
  /** Remaining USDC balance. */
  remainingUsd: number;
  /** Per-call cost deducted on each granted request. */
  perCallCostUsd: number;
  /** ISO timestamp when the session was created. */
  createdAt: string;
  /** ISO timestamp when the session expires. */
  expiresAt: string;
  /** Number of calls made using this session. */
  callCount: number;
}

/** Result of checking prepaid credit. */
export interface PrepaidCheckResult {
  /** True if the session has enough balance for a call. */
  hasCredit: boolean;
  /** The session that was checked, if found. */
  sessionId?: string;
  /** Remaining balance after this call (if hasCredit). */
  remainingUsd?: number;
  /** Reason if no credit. */
  reason?: string;
}

/**
 * Prepaid credit store with file persistence.
 * Uses a Map for fast lookups and a JSON file for durability.
 */
export class PrepaidCreditStore {
  private readonly credits = new Map<string, PrepaidCredit>();
  private readonly filePath: string;
  private dirty = false;

  constructor(configDir?: string) {
    const dir = configDir ?? getPreferredConfigDir();
    this.filePath = join(dir, 'payments', 'prepaid.json');
    this.load();
    this.startSyncTimer();
  }

  /**
   * Create a new prepaid session. Called after a successful x402 settlement
   * for the `sap_payments_fund_prepaid` hosted tool.
   *
   * @param wallet — Payer wallet address.
   * @param amountUsd — Total USDC deposited.
   * @param perCallCostUsd — Cost per call that will be deducted.
   * @param ttlHours — Session TTL in hours (default 24).
   * @returns The created PrepaidCredit entry.
   */
  public createSession(
    wallet: string,
    amountUsd: number,
    perCallCostUsd: number,
    ttlHours: number = 24,
  ): PrepaidCredit {
    const now = new Date();
    const expires = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
    const credit: PrepaidCredit = {
      sessionId: randomUUID(),
      wallet,
      totalUsd: amountUsd,
      remainingUsd: amountUsd,
      perCallCostUsd,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      callCount: 0,
    };
    this.credits.set(credit.sessionId, credit);
    this.dirty = true;
    logger.info('Prepaid session created', {
      sessionId: credit.sessionId,
      wallet,
      totalUsd: amountUsd,
      perCallCostUsd,
    });
    return credit;
  }

  /**
   * Check if a session has enough credit for a call and deduct it if so.
   * This is called by the monetization gate's `onProtectedRequest` hook.
   *
   * @param sessionId — Session ID from the X-SAP-Prepaid-Session header.
   * @param costUsd — Cost to deduct (defaults to session's perCallCostUsd).
   * @returns PrepaidCheckResult with hasCredit and remaining balance.
   */
  public checkAndDeduct(sessionId: string, costUsd?: number): PrepaidCheckResult {
    const credit = this.credits.get(sessionId);
    if (!credit) {
      return { hasCredit: false, reason: 'session_not_found' };
    }
    if (new Date(credit.expiresAt).getTime() < Date.now()) {
      this.credits.delete(sessionId);
      this.dirty = true;
      return { hasCredit: false, reason: 'session_expired' };
    }
    const cost = costUsd ?? credit.perCallCostUsd;
    if (credit.remainingUsd < cost) {
      return {
        hasCredit: false,
        sessionId: credit.sessionId,
        reason: 'insufficient_balance',
        remainingUsd: credit.remainingUsd,
      };
    }
    credit.remainingUsd = Math.round((credit.remainingUsd - cost) * 1e6) / 1e6;
    credit.callCount += 1;
    this.dirty = true;
    logger.debug('Prepaid credit deducted', {
      sessionId,
      cost,
      remaining: credit.remainingUsd,
      callCount: credit.callCount,
    });
    return {
      hasCredit: true,
      sessionId: credit.sessionId,
      remainingUsd: credit.remainingUsd,
    };
  }

  /**
   * Get the remaining balance for a session without deducting.
   * @param sessionId — Session ID.
   * @returns PrepaidCredit or null if not found.
   */
  public getBalance(sessionId: string): PrepaidCredit | null {
    const credit = this.credits.get(sessionId);
    if (!credit) return null;
    if (new Date(credit.expiresAt).getTime() < Date.now()) {
      this.credits.delete(sessionId);
      this.dirty = true;
      return null;
    }
    return { ...credit };
  }

  /**
   * Get all active sessions for a wallet.
   * @param wallet — Wallet address.
   * @returns Array of PrepaidCredit entries.
   */
  public getSessionsByWallet(wallet: string): PrepaidCredit[] {
    const result: PrepaidCredit[] = [];
    for (const credit of this.credits.values()) {
      if (credit.wallet === wallet && new Date(credit.expiresAt).getTime() >= Date.now()) {
        result.push({ ...credit });
      }
    }
    return result;
  }

  /**
   * Manually close a session (refund unused balance is out of scope —
   * the balance simply becomes unavailable).
   * @param sessionId — Session ID to close.
   */
  public closeSession(sessionId: string): boolean {
    const existed = this.credits.delete(sessionId);
    if (existed) this.dirty = true;
    return existed;
  }

  /**
   * Prune expired sessions. Called periodically.
   */
  public pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [id, credit] of this.credits) {
      if (new Date(credit.expiresAt).getTime() < now) {
        this.credits.delete(id);
        pruned++;
      }
    }
    if (pruned > 0) this.dirty = true;
    return pruned;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private load(): void {
    try {
      if (!existsSync(this.filePath)) return;
      const raw = readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as PrepaidCredit[];
      for (const credit of data) {
        // Don't load expired sessions
        if (new Date(credit.expiresAt).getTime() >= Date.now()) {
          this.credits.set(credit.sessionId, credit);
        }
      }
      logger.debug('Prepaid credits loaded', { count: this.credits.size });
    } catch (error) {
      logger.warn('Failed to load prepaid credits', { error });
    }
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
      const data = Array.from(this.credits.values());
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.dirty = false;
    } catch (error) {
      logger.warn('Failed to save prepaid credits', { error });
    }
  }

  private startSyncTimer(): void {
    const timer = setInterval(() => {
      this.pruneExpired();
      this.save();
    }, 30_000);
    timer.unref?.();
  }
}

// ─── Global singleton for tool access ─────────────────────────────────────
// The monetization gate creates its own PrepaidCreditStore instance, but the
// free local tools (sap_payments_prepaid_balance, sap_payments_start_prepaid)
// also need to access the store. We use a module-level singleton that is shared
// between the gate and the tools so both see the same sessions.

let globalPrepaidStore: PrepaidCreditStore | undefined;

/**
 * Get the global PrepaidCreditStore singleton used by free payment tools.
 * Lazily creates the store on first access.
 */
export function getGlobalPrepaidStore(): PrepaidCreditStore {
  if (!globalPrepaidStore) {
    globalPrepaidStore = new PrepaidCreditStore();
  }
  return globalPrepaidStore;
}

/**
 * Set the global PrepaidCreditStore singleton. Called by the server when the
 * monetization gate is initialized so the tools share the same store instance.
 */
export function setGlobalPrepaidStore(store: PrepaidCreditStore): void {
  globalPrepaidStore = store;
}