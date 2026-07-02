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
  | 'payment_verified'
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

  public constructor(
    ledgerPath = join(getDataDir(), 'payments', 'usage-ledger.jsonl'),
    redis?: InstanceType<typeof Redis>,
    redisStreamKey = 'sap-mcp:payments:ledger',
  ) {
    this.ledgerPath = ledgerPath;
    this.redis = redis;
    this.redisStreamKey = redisStreamKey;
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
   * @description Appends one payment audit event to the JSONL ledger.
   */
  public async append(event: PaymentLedgerEvent): Promise<void> {
    await mkdir(dirname(this.ledgerPath), { recursive: true });
    await appendFile(this.ledgerPath, `${JSON.stringify(event)}\n`, 'utf-8');
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
    );
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
