/**
 * @name perps/phoenix/phoenix-builder-trading
 * @description Trading instruction builders for Phoenix perps using the rise SDK.
 *
 * Uses createPhoenixClient to access client.ixs for building unsigned transactions:
 *   place limit order, place market order, cancel orders by id, cancel all,
 *   place stop loss, cancel stop loss, place position conditional order.
 *
 * ALL builders return UnsignedTransactionResult — NO signing happens server-side.
 *
 * @module perps/phoenix/phoenix-builder-trading
 */

import { PublicKey, type Connection } from '@solana/web3.js';
import {
  createPhoenixClient,
  Side,
  Direction,
  StopLossOrderKind,
  SelfTradeBehavior,
  
} from '@ellipsis-labs/rise';

import {
  buildFromPhoenixIx,
  
  type PhoenixSide,
  type PhoenixDirection,
  type PhoenixStopLossOrderKind,
  type UnsignedTransactionResult,
} from './phoenix-builder-core.js';
import { PHOENIX_PROGRAM_ID } from './phoenix-constants.js';

/**
 * Create a Phoenix client with exchange metadata for instruction building.
 * The client caches exchange metadata (markets, addresses) for PDA resolution.
 *
 * @param connection — Solana RPC connection (used for exchange metadata fallback).
 * @returns Phoenix client with .ixs builder surface.
 */
export async function getPhoenixClient(connection: Connection) {
  const rpcUrl = connection.rpcEndpoint;
  return createPhoenixClient({ rpcUrl });
}

/**
 * Convert a PhoenixSide ('bid' | 'ask') to the SDK Side enum.
 */
function toSide(side: PhoenixSide): Side {
  return side === 'bid' ? Side.Bid : Side.Ask;
}

/**
 * Convert a PhoenixDirection to the SDK Direction enum.
 */
function toDirection(dir: PhoenixDirection): Direction {
  return dir === 'greater-than' ? Direction.GreaterThan : Direction.LessThan;
}

/**
 * Convert a PhoenixStopLossOrderKind to the SDK StopLossOrderKind enum.
 */
function toStopLossOrderKind(kind: PhoenixStopLossOrderKind): StopLossOrderKind {
  return kind === 'ioc' ? StopLossOrderKind.IOC : StopLossOrderKind.Limit;
}

// ─── Trading Builders ─────────────────────────────────────────────────────────

/**
 * Build a place limit order transaction.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Trader wallet public key (fee payer and signer).
 * @param symbol — Market symbol (e.g. "SOL-PERP").
 * @param side — Order side: 'bid' (buy) or 'ask' (sell).
 * @param priceInTicks — Price in ticks (bigint).
 * @param numBaseLots — Size in base lots (bigint).
 * @param clientOrderId — Client order ID for tracking (bigint).
 * @param options — Optional: selfTradeBehavior, matchLimit, lastValidSlot, traderPdaIndex.
 * @returns UnsignedTransactionResult with base64-serialized unsigned transaction.
 */
export async function buildPlaceLimitOrder(
  connection: Connection,
  owner: PublicKey,
  symbol: string,
  side: PhoenixSide,
  priceInTicks: bigint,
  numBaseLots: bigint,
  clientOrderId: bigint,
  options?: {
    selfTradeBehavior?: SelfTradeBehavior;
    matchLimit?: bigint | null;
    lastValidSlot?: bigint | null;
    traderPdaIndex?: number;
    traderSubaccountIndex?: number;
  },
): Promise<UnsignedTransactionResult> {
  const client = await getPhoenixClient(connection);
  const ix = await client.ixs.buildPlaceLimitOrder({
    authority: owner.toBase58() as never,
    symbol: symbol as never,
    orderPacket: {
      side: toSide(side),
      priceInTicks: priceInTicks as never,
      numBaseLots: numBaseLots as never,
      selfTradeBehavior: options?.selfTradeBehavior ?? SelfTradeBehavior.Abort,
      matchLimit: options?.matchLimit ?? null,
      clientOrderId,
      lastValidSlot: options?.lastValidSlot ?? null,
      orderFlags: 0,
      cancelExisting: false,
    },
    traderPdaIndex: options?.traderPdaIndex,
    traderSubaccountIndex: options?.traderSubaccountIndex,
  });

  return buildFromPhoenixIx(connection, owner, ix, PHOENIX_PROGRAM_ID, 'placeLimitOrder');
}

/**
 * Build a place market order (IOC) transaction.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Trader wallet public key (fee payer and signer).
 * @param symbol — Market symbol.
 * @param side — Order side: 'bid' (buy) or 'ask' (sell).
 * @param numBaseLots — Size in base lots (bigint).
 * @param options — Optional: priceInTicks (null = market), numQuoteLots, minBaseLotsToFill, minQuoteLotsToFill, traderPdaIndex.
 * @returns UnsignedTransactionResult with base64-serialized unsigned transaction.
 */
export async function buildPlaceMarketOrder(
  connection: Connection,
  owner: PublicKey,
  symbol: string,
  side: PhoenixSide,
  numBaseLots: bigint,
  options?: {
    priceInTicks?: bigint | null;
    numQuoteLots?: bigint | null;
    minBaseLotsToFill?: bigint;
    minQuoteLotsToFill?: bigint;
    clientOrderId?: bigint;
    traderPdaIndex?: number;
    traderSubaccountIndex?: number;
  },
): Promise<UnsignedTransactionResult> {
  const client = await getPhoenixClient(connection);
  const ix = await client.ixs.buildPlaceMarketOrder({
    authority: owner.toBase58() as never,
    symbol: symbol as never,
    orderPacket: {
      side: toSide(side),
      priceInTicks: (options?.priceInTicks ?? null) as never,
      numBaseLots: numBaseLots as never,
      numQuoteLots: (options?.numQuoteLots ?? null) as never,
      minBaseLotsToFill: (options?.minBaseLotsToFill ?? 0n) as never,
      minQuoteLotsToFill: (options?.minQuoteLotsToFill ?? 0n) as never,
      clientOrderId: options?.clientOrderId ?? 0n,
      lastValidSlot: null,
      matchLimit: null,
      selfTradeBehavior: SelfTradeBehavior.Abort, cancelExisting: false,
      orderFlags: 0,
    },
    traderPdaIndex: options?.traderPdaIndex,
    traderSubaccountIndex: options?.traderSubaccountIndex,
  });

  return buildFromPhoenixIx(connection, owner, ix, PHOENIX_PROGRAM_ID, 'placeMarketOrder');
}

/**
 * Build a cancel orders by ID transaction.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Trader wallet public key.
 * @param symbol — Market symbol.
 * @param orders — Array of orders to cancel (priceInTicks + orderSequenceNumber).
 * @param options — Optional: traderPdaIndex, traderSubaccountIndex.
 * @returns UnsignedTransactionResult.
 */
export async function buildCancelOrdersById(
  connection: Connection,
  owner: PublicKey,
  symbol: string,
  orders: Array<{ priceInTicks: bigint | number | string; orderSequenceNumber: string | number | bigint }>,
  options?: { traderPdaIndex?: number; traderSubaccountIndex?: number },
): Promise<UnsignedTransactionResult> {
  const client = await getPhoenixClient(connection);
  const ix = await client.ixs.buildCancelOrdersById({
    authority: owner.toBase58() as never,
    symbol: symbol as never,
    orders,
    traderPdaIndex: options?.traderPdaIndex,
    traderSubaccountIndex: options?.traderSubaccountIndex,
  });

  return buildFromPhoenixIx(connection, owner, ix, PHOENIX_PROGRAM_ID, 'cancelOrdersById');
}

/**
 * Build a cancel all orders transaction for a market.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Trader wallet public key.
 * @param symbol — Market symbol.
 * @param options — Optional: traderPdaIndex, traderSubaccountIndex, positionAuthority.
 * @returns UnsignedTransactionResult.
 */
export async function buildCancelAll(
  connection: Connection,
  owner: PublicKey,
  symbol: string,
  options?: {
    traderPdaIndex?: number;
    traderSubaccountIndex?: number;
    positionAuthority?: string;
  },
): Promise<UnsignedTransactionResult> {
  const client = await getPhoenixClient(connection);
  const ix = await client.ixs.buildCancelAll({
    authority: owner.toBase58() as never,
    symbol: symbol as never,
    traderPdaIndex: options?.traderPdaIndex,
    traderSubaccountIndex: options?.traderSubaccountIndex,
    positionAuthority: options?.positionAuthority as never,
  });

  return buildFromPhoenixIx(connection, owner, ix, PHOENIX_PROGRAM_ID, 'cancelAll');
}

/**
 * Build a place stop loss order transaction.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Trader wallet public key.
 * @param symbol — Market symbol.
 * @param triggerPrice — Trigger price in ticks (bigint).
 * @param tradeSide — Side of the position being protected: 'bid' or 'ask'.
 * @param executionDirection — Direction: 'greater-than' or 'less-than'.
 * @param orderKind — Stop loss order kind: 'ioc' or 'limit'.
 * @param options — Optional: executionPrice, slippageBps, traderPdaIndex.
 * @returns UnsignedTransactionResult.
 */
export async function buildPlaceStopLoss(
  connection: Connection,
  owner: PublicKey,
  symbol: string,
  triggerPrice: bigint,
  tradeSide: PhoenixSide,
  executionDirection: PhoenixDirection,
  orderKind: PhoenixStopLossOrderKind,
  options?: {
    executionPrice?: bigint;
    slippageBps?: number | null;
    traderPdaIndex?: number;
    traderSubaccountIndex?: number;
  },
): Promise<UnsignedTransactionResult> {
  const client = await getPhoenixClient(connection);
  const ix = await client.ixs.buildPlaceStopLoss({
    authority: owner.toBase58() as never,
    symbol: symbol as never,
    triggerPrice,
    tradeSide: toSide(tradeSide),
    executionDirection: toDirection(executionDirection),
    orderKind: toStopLossOrderKind(orderKind),
    executionPrice: options?.executionPrice,
    slippageBps: options?.slippageBps,
    traderPdaIndex: options?.traderPdaIndex,
    traderSubaccountIndex: options?.traderSubaccountIndex,
  });

  return buildFromPhoenixIx(connection, owner, ix, PHOENIX_PROGRAM_ID, 'placeStopLoss');
}

/**
 * Build a cancel stop loss order transaction.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Trader wallet public key.
 * @param symbol — Market symbol.
 * @param executionDirection — Direction: 'greater-than' or 'less-than'.
 * @param options — Optional: traderPdaIndex, traderSubaccountIndex, funder.
 * @returns UnsignedTransactionResult.
 */
export async function buildCancelStopLoss(
  connection: Connection,
  owner: PublicKey,
  symbol: string,
  executionDirection: PhoenixDirection,
  options?: {
    traderPdaIndex?: number;
    traderSubaccountIndex?: number;
    funder?: string;
  },
): Promise<UnsignedTransactionResult> {
  const client = await getPhoenixClient(connection);
  const ix = await client.ixs.buildCancelStopLoss({
    authority: owner.toBase58() as never,
    symbol: symbol as never,
    executionDirection: toDirection(executionDirection),
    traderPdaIndex: options?.traderPdaIndex,
    traderSubaccountIndex: options?.traderSubaccountIndex,
    funder: options?.funder as never,
  });

  return buildFromPhoenixIx(connection, owner, ix, PHOENIX_PROGRAM_ID, 'cancelStopLoss');
}

/**
 * Build a place position conditional order transaction (take-profit / stop-loss
 * attached to a position rather than a specific resting order).
 *
 * @param connection — Solana RPC connection.
 * @param owner — Trader wallet public key.
 * @param symbol — Market symbol.
 * @param options — Conditional order params: greaterTriggerOrder, lessTriggerOrder, sizeBaseLots, sizePercent, traderPdaIndex.
 * @returns UnsignedTransactionResult.
 */
export async function buildPlacePositionConditionalOrder(
  connection: Connection,
  owner: PublicKey,
  symbol: string,
  options: {
    greaterTriggerOrder?: {
      triggerDirection: PhoenixDirection;
      tradeSide: PhoenixSide;
      orderKind?: PhoenixStopLossOrderKind;
      triggerPrice: bigint;
      executionPrice?: bigint | null;
      slippageBps?: number | null;
    } | null;
    lessTriggerOrder?: {
      triggerDirection: PhoenixDirection;
      tradeSide: PhoenixSide;
      orderKind?: PhoenixStopLossOrderKind;
      triggerPrice: bigint;
      executionPrice?: bigint | null;
      slippageBps?: number | null;
    } | null;
    sizeBaseLots?: bigint | null;
    sizePercent?: number | null;
    traderPdaIndex?: number;
    traderSubaccountIndex?: number;
  },
): Promise<UnsignedTransactionResult> {
  const client = await getPhoenixClient(connection);
  const ix = await client.ixs.buildPlacePositionConditionalOrder({
    authority: owner.toBase58() as never,
    symbol: symbol as never,
    greaterTriggerOrder: options.greaterTriggerOrder
      ? {
          triggerDirection: toDirection(options.greaterTriggerOrder.triggerDirection),
          tradeSide: toSide(options.greaterTriggerOrder.tradeSide),
          orderKind: options.greaterTriggerOrder.orderKind
            ? toStopLossOrderKind(options.greaterTriggerOrder.orderKind)
            : undefined,
          triggerPrice: options.greaterTriggerOrder.triggerPrice as never,
          executionPrice: (options.greaterTriggerOrder.executionPrice ?? null) as never,
          slippageBps: options.greaterTriggerOrder.slippageBps ?? null,
        }
      : null,
    lessTriggerOrder: options.lessTriggerOrder
      ? {
          triggerDirection: toDirection(options.lessTriggerOrder.triggerDirection),
          tradeSide: toSide(options.lessTriggerOrder.tradeSide),
          orderKind: options.lessTriggerOrder.orderKind
            ? toStopLossOrderKind(options.lessTriggerOrder.orderKind)
            : undefined,
          triggerPrice: options.lessTriggerOrder.triggerPrice as never,
          executionPrice: (options.lessTriggerOrder.executionPrice ?? null) as never,
          slippageBps: options.lessTriggerOrder.slippageBps ?? null,
        }
      : null,
    sizeBaseLots: options.sizeBaseLots as never,
    sizePercent: options.sizePercent ?? null,
    traderPdaIndex: options.traderPdaIndex,
    traderSubaccountIndex: options.traderSubaccountIndex,
  });

  return buildFromPhoenixIx(connection, owner, ix, PHOENIX_PROGRAM_ID, 'placePositionConditionalOrder');
}