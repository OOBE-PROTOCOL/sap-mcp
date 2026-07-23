/**
 * @name PaymentUsageLedger
 * @description Append-only JSONL audit ledger for remote MCP payment decisions and settlements.
 */

import { createHash } from 'crypto';
import { mkdir, appendFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { SettleResponse } from '@x402/core/types';
import { Redis } from 'ioredis';
import { getDataDir } from '../config/env.js';
import { logger } from '../core/logger.js';
import type { PaymentDecision } from './pricing.js';

/**
 * @name PaymentLedgerEventType
 * @description Supported audit event types emitted by the monetization gate.
 */
export type PaymentLedgerEventType =
  | 'payment_required'
  | 'payment_challenge_returned'
  | 'payment_eligibility_blocked'
  | 'payment_verified'
  | 'payment_verification_failed'
  | 'payment_settled'
  | 'payment_failed'
  | 'payment_canceled';

/**
 * @name PaymentLedgerEvent
 * @description Durable audit record for a monetized MCP request without storing private key material or payment payloads.
 */
export interface PaymentLedgerEvent {
  event: PaymentLedgerEventType;
  timestamp: string;
  requestHash: string;
  method: string;
  path: string;
  toolNames: string[];
  priceUsd?: number;
  paymentHeaderPresent: boolean;
  remoteAddress?: string;
  userAgent?: string;
  transaction?: string;
  network?: string;
  amount?: string;
  payer?: string;
  challengeTransport?: 'mcp-json-rpc' | 'http-402';
  errorReason?: string;
  errorMessage?: string;
}

/**
 * @name PaymentRequestMetadata
 * @description Public request metadata that is safe to persist for payment auditability.
 */
export interface PaymentRequestMetadata {
  requestHash: string;
  method: string;
  path: string;
  remoteAddress?: string;
  userAgent?: string;
  paymentHeaderPresent: boolean;
}

/**
 * @name UsageLedger
 * @description Writes MCP payment events to an append-only local JSONL ledger.
 */
export class UsageLedger {
  private readonly ledgerPath: string;
  private readonly redis?: InstanceType<typeof Redis>;
  private readonly redisStreamKey: string;
  private readonly buffer: PaymentLedgerEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private readonly flushIntervalMs = 5_000;
  private readonly maxBufferSize = 100;
  private flushing = false;

  public constructor(
    ledgerPath = join(getDataDir(), 'payments', 'usage-ledger.jsonl'),
    redis?: InstanceType<typeof Redis>,
    redisStreamKey = 'sap-mcp:payments:ledger',
  ) {
    this.ledgerPath = ledgerPath;
    this.redis = redis;
    this.redisStreamKey = redisStreamKey;
    this.startFlushTimer();
  }

  /**
   * @name createFromEnv
   * @description Creates the payment usage ledger and optionally attaches a Redis Stream sink for clustered hosted deployments.
   */
  public static async createFromEnv(): Promise<UsageLedger> {
    const useRedis = ['true', '1', 'yes', 'on'].includes(
      (process.env.SAP_MCP_USE_REDIS || '').trim().toLowerCase(),
    );
    if (!useRedis) {
      return new UsageLedger();
    }

    const redis = new Redis(process.env.SAP_MCP_REDIS_URL || 'redis://127.0.0.1:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    redis.on('error', (error: Error) => {
      logger.warn('Payment usage ledger Redis error', { error });
    });
    await redis.connect();
    logger.info('Payment usage ledger using Redis stream backend');

    return new UsageLedger(
      join(getDataDir(), 'payments', 'usage-ledger.jsonl'),
      redis,
      process.env.SAP_MCP_PAYMENT_LEDGER_REDIS_STREAM || 'sap-mcp:payments:ledger',
    );
  }

  /**
   * @name append
   * @description Buffers a payment audit event. Flushes to disk when the buffer
   *   is full or the periodic timer fires (5s). Redis stream is written immediately
   *   for real-time consumers.
   */
  public async append(event: PaymentLedgerEvent): Promise<void> {
    this.buffer.push(event);

    // Redis stream is written immediately for real-time monitoring
    await this.redis?.xadd(
      this.redisStreamKey,
      'MAXLEN',
      '~',
      '100000',
      '*',
      'event',
      event.event,
      'requestHash',
      event.requestHash,
      'payload',
      JSON.stringify(event),
    ).catch(() => undefined); // don't block on Redis errors

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * @name flush
   * @description Flushes buffered events to disk in a single write.
   */
  public async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) {
      return;
    }
    this.flushing = true;

    const toWrite = this.buffer.splice(0, this.buffer.length);
    try {
      await mkdir(dirname(this.ledgerPath), { recursive: true });
      const lines = toWrite.map(event => JSON.stringify(event)).join('\n') + '\n';
      await appendFile(this.ledgerPath, lines, 'utf-8');
    } catch (error) {
      // Put events back at the front on failure — don't lose audit data
      this.buffer.unshift(...toWrite);
      logger.warn('Usage ledger flush failed, events buffered for retry', { error, pending: this.buffer.length });
    } finally {
      this.flushing = false;
    }
  }

  /**
   * @name close
   * @description Stops periodic flushing and forces any buffered events to disk.
   */
  public async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
    await this.redis?.quit().catch(() => undefined);
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush().catch(() => undefined);
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();
  }

  /**
   * @name recordDecision
   * @description Records that a request requires payment.
   */
  public async recordDecision(metadata: PaymentRequestMetadata, decision: PaymentDecision): Promise<void> {
    if (!decision.required) {
      return;
    }

    await this.append({
      event: 'payment_required',
      timestamp: new Date().toISOString(),
      requestHash: metadata.requestHash,
      method: metadata.method,
      path: metadata.path,
      toolNames: decision.toolNames,
      priceUsd: decision.priceUsd,
      paymentHeaderPresent: metadata.paymentHeaderPresent,
      remoteAddress: metadata.remoteAddress,
      userAgent: metadata.userAgent,
    });
  }

  /**
   * @name recordChallengeReturned
   * @description Records that SAP MCP returned a standards-compatible x402 challenge before any payment was signed.
   */
  public async recordChallengeReturned(
    metadata: PaymentRequestMetadata,
    decision: PaymentDecision,
    challengeTransport: 'mcp-json-rpc' | 'http-402',
  ): Promise<void> {
    if (!decision.required) {
      return;
    }

    await this.append({
      event: 'payment_challenge_returned',
      timestamp: new Date().toISOString(),
      requestHash: metadata.requestHash,
      method: metadata.method,
      path: metadata.path,
      toolNames: decision.toolNames,
      priceUsd: decision.priceUsd,
      paymentHeaderPresent: metadata.paymentHeaderPresent,
      remoteAddress: metadata.remoteAddress,
      userAgent: metadata.userAgent,
      challengeTransport,
    });
  }

  /**
   * @name recordEligibilityBlocked
   * @description Records a hosted accountless write rejected before monetization, proving that no x402 fee was charged.
   */
  public async recordEligibilityBlocked(
    metadata: PaymentRequestMetadata,
    toolNames: string[],
    reason: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.append({
      event: 'payment_eligibility_blocked',
      timestamp: new Date().toISOString(),
      requestHash: metadata.requestHash,
      method: metadata.method,
      path: metadata.path,
      toolNames,
      paymentHeaderPresent: metadata.paymentHeaderPresent,
      remoteAddress: metadata.remoteAddress,
      userAgent: metadata.userAgent,
      errorReason: reason,
      errorMessage,
    });
  }

  /**
   * @name recordVerified
   * @description Records that an x402 payment was accepted before handler execution.
   */
  public async recordVerified(metadata: PaymentRequestMetadata, decision: PaymentDecision): Promise<void> {
    if (!decision.required) {
      return;
    }

    await this.append({
      event: 'payment_verified',
      timestamp: new Date().toISOString(),
      requestHash: metadata.requestHash,
      method: metadata.method,
      path: metadata.path,
      toolNames: decision.toolNames,
      priceUsd: decision.priceUsd,
      paymentHeaderPresent: metadata.paymentHeaderPresent,
      remoteAddress: metadata.remoteAddress,
      userAgent: metadata.userAgent,
    });
  }

  /**
   * @name recordVerificationFailed
   * @description Records that a supplied x402 payment header failed before tool execution or settlement.
   */
  public async recordVerificationFailed(
    metadata: PaymentRequestMetadata,
    decision: PaymentDecision,
    reason: string,
    errorMessage?: string,
  ): Promise<void> {
    if (!decision.required) {
      return;
    }

    await this.append({
      event: 'payment_verification_failed',
      timestamp: new Date().toISOString(),
      requestHash: metadata.requestHash,
      method: metadata.method,
      path: metadata.path,
      toolNames: decision.toolNames,
      priceUsd: decision.priceUsd,
      paymentHeaderPresent: metadata.paymentHeaderPresent,
      remoteAddress: metadata.remoteAddress,
      userAgent: metadata.userAgent,
      errorReason: reason,
      errorMessage,
    });
  }

  /**
   * @name recordCanceled
   * @description Records that a verified payment was canceled because MCP execution did not complete successfully.
   */
  public async recordCanceled(
    metadata: PaymentRequestMetadata,
    decision: PaymentDecision,
    reason: string,
    errorMessage?: string,
  ): Promise<void> {
    if (!decision.required) {
      return;
    }

    await this.append({
      event: 'payment_canceled',
      timestamp: new Date().toISOString(),
      requestHash: metadata.requestHash,
      method: metadata.method,
      path: metadata.path,
      toolNames: decision.toolNames,
      priceUsd: decision.priceUsd,
      paymentHeaderPresent: metadata.paymentHeaderPresent,
      remoteAddress: metadata.remoteAddress,
      userAgent: metadata.userAgent,
      errorReason: reason,
      errorMessage,
    });
  }

  /**
   * @name recordSettlement
   * @description Records successful or failed x402 settlement without storing payment payload bytes.
   */
  public async recordSettlement(
    metadata: PaymentRequestMetadata,
    decision: PaymentDecision,
    settlement: SettleResponse,
  ): Promise<void> {
    if (!decision.required) {
      return;
    }

    await this.append({
      event: settlement.success ? 'payment_settled' : 'payment_failed',
      timestamp: new Date().toISOString(),
      requestHash: metadata.requestHash,
      method: metadata.method,
      path: metadata.path,
      toolNames: decision.toolNames,
      priceUsd: decision.priceUsd,
      paymentHeaderPresent: metadata.paymentHeaderPresent,
      remoteAddress: metadata.remoteAddress,
      userAgent: metadata.userAgent,
      transaction: settlement.transaction,
      network: settlement.network,
      amount: settlement.amount,
      payer: settlement.payer,
      errorReason: settlement.errorReason,
      errorMessage: settlement.errorMessage,
    });
  }
}

/**
 * @name hashRequestBody
 * @description Computes a deterministic SHA-256 hash for request correlation without persisting raw arguments.
 */
export function hashRequestBody(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

/**
 * @name hashPaymentRequest
 * @description Computes the x402 payment binding hash for an MCP request.
 *
 * The hash intentionally ignores JSON-RPC transport metadata such as `id` and
 * `jsonrpc`, while preserving `method` and `params`. This binds a receipt to
 * the paid operation and arguments without breaking legitimate agent retries
 * that replay the same tool call with a different request id.
 */
export function hashPaymentRequest(rawBody: Buffer, parsedBody: unknown): string {
  const canonical = canonicalizePaymentRequest(parsedBody);
  if (canonical === undefined) {
    return hashRequestBody(rawBody);
  }

  return createHash('sha256').update(canonical).digest('hex');
}

function canonicalizePaymentRequest(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const requests = value.map(canonicalizeSingleRequest).filter((request): request is PaymentRequestIdentity => {
      return request !== undefined;
    });
    return requests.length > 0 ? stableJson(requests) : undefined;
  }

  const request = canonicalizeSingleRequest(value);
  return request ? stableJson(request) : undefined;
}

interface PaymentRequestIdentity {
  method: string;
  params?: unknown;
}

function canonicalizeSingleRequest(value: unknown): PaymentRequestIdentity | undefined {
  if (!isPlainRecord(value) || typeof value.method !== 'string') {
    return undefined;
  }

  return {
    method: value.method,
    ...(Object.prototype.hasOwnProperty.call(value, 'params') ? { params: value.params } : {}),
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const fields = Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`);
  return `{${fields.join(',')}}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
