/**
 * @name perps/perp-decoders
 * @description Adrena account decoders for Pool, Custody, and Position accounts.
 *
 * All decoders use the official Adrena release/39 ABI layout and read directly
 * from raw account data buffers returned by Solana RPC `getProgramAccounts`.
 *
 * @module perps/perp-decoders
 */

import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

import type { SapMcpContext } from '../core/types.js';
import {
  ADRENA_BPS_DECIMALS,
  ADRENA_CUSTODY_OFFSETS,
  ADRENA_MAINNET_MARKETS_BY_CUSTODY,
  ADRENA_MAINNET_POOLS,
  ADRENA_POOL_OFFSETS,
  ADRENA_POSITION_OFFSETS,
  ADRENA_PRICE_DECIMALS,
  ADRENA_USD_DECIMALS,
  DISC_CUSTODY,
  DISC_POOL,
  DISC_POSITION,
  getPerpsConfig,
  type DecodedAdrenaCustody,
  type DecodedAdrenaPool,
  type DecodedAdrenaPosition,
  type PerpMarketProviderRecord,
  type PerpMarketsProviderPayload,
} from './perp-constants.js';

/* ═══════════════════════════════════════════════════════════════════
 *  Low-level buffer readers
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name readU64LE
 * @description Read a u64 little-endian value from a Buffer and return as a JS number.
 *
 * @param buf    — Source buffer.
 * @param offset — Read offset.
 * @returns The value as a JavaScript number.
 *
 * @internal
 */
function readU64LE(buf: Buffer, offset: number): number {
  return Number(buf.readBigUInt64LE(offset));
}

/**
 * @name readI64LE
 * @description Read an i64 little-endian value from a Buffer and return as a JS number.
 *
 * @param buf    — Source buffer.
 * @param offset — Read offset.
 * @returns The signed value as a JavaScript number.
 *
 * @internal
 */
function readI64LE(buf: Buffer, offset: number): number {
  return Number(buf.readBigInt64LE(offset));
}

function readU128Split(buf: Buffer, offset: number): bigint {
  const high = buf.readBigUInt64LE(offset);
  const low = buf.readBigUInt64LE(offset + 8);
  return (high << 64n) + low;
}

export function readPublicKey(buf: Buffer, offset: number): string {
  return new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
}

function scaleNumber(raw: number | bigint, decimals: number): number {
  return Number(raw) / (10 ** decimals);
}

function readUsd(buf: Buffer, offset: number): number {
  return scaleNumber(buf.readBigUInt64LE(offset), ADRENA_USD_DECIMALS);
}

function readPrice(buf: Buffer, offset: number): number {
  return scaleNumber(buf.readBigUInt64LE(offset), ADRENA_PRICE_DECIMALS);
}

/* ═══════════════════════════════════════════════════════════════════
 *  Public decoder exports
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name discToBase58
 * @description Convert an 8-byte discriminator Buffer to a base58 string for
 *              use in `getProgramAccounts` memcmp filters.
 *
 * @param disc — 8-byte discriminator Buffer.
 * @returns Base58-encoded string.
 *
 * @internal
 */
export function discToBase58(disc: Buffer): string {
  return bs58.encode(disc);
}

/**
 * @name readAdrenaLimitedString
 * @description Read Adrena `LimitedString` (31-byte value + 1-byte length)
 *              from an account data buffer.
 *
 * @param buf    — Source buffer.
 * @param offset — Offset to the LimitedString field.
 * @returns Decoded symbol string, or empty string on failure.
 *
 * @internal
 */
export function readAdrenaLimitedString(buf: Buffer, offset: number): string {
  try {
    const len = buf[offset + 31] ?? 0;
    if (len === 0 || len > 31) return '';
    return buf.subarray(offset, offset + len).toString('utf8').replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

function inferAdrenaSymbolFromOracle(oracle: string, fallback: string): string {
  const normalized = oracle.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const candidate of ['JITOSOL', 'WBTC', 'BONK', 'USDC', 'XAU', 'WTI', 'XAG', 'SOL', 'BTC']) {
    if (normalized.includes(candidate)) {
      return candidate;
    }
  }
  return fallback;
}

export function decodeAdrenaPoolAccount(pubkey: PublicKey, data: Buffer): DecodedAdrenaPool | null {
  if (data.length < ADRENA_POOL_OFFSETS.custodies + 32) {
    return null;
  }
  if (!data.subarray(0, 8).equals(DISC_POOL)) {
    return null;
  }

  const poolAddress = pubkey.toBase58();
  const registeredCustodyCount = data[ADRENA_POOL_OFFSETS.registeredCustodyCount] ?? 0;
  const custodies: string[] = [];
  const custodyCount = Math.min(registeredCustodyCount, 8);
  for (let i = 0; i < custodyCount; i++) {
    custodies.push(readPublicKey(data, ADRENA_POOL_OFFSETS.custodies + i * 32));
  }

  const manifestPool = ADRENA_MAINNET_POOLS[poolAddress];
  return {
    poolAddress,
    name: readAdrenaLimitedString(data, ADRENA_POOL_OFFSETS.name) || manifestPool?.name || 'unknown-pool',
    type: manifestPool?.type,
    allowTrade: data[ADRENA_POOL_OFFSETS.allowTrade] !== 0,
    allowSwap: data[ADRENA_POOL_OFFSETS.allowSwap] !== 0,
    registeredCustodyCount,
    custodies,
    lpTokenPriceUsd: readUsd(data, ADRENA_POOL_OFFSETS.lpTokenPriceUsd),
    aumUsd: scaleNumber(readU128Split(data, ADRENA_POOL_OFFSETS.aumUsd), ADRENA_USD_DECIMALS),
  };
}

export function decodeAdrenaCustodyAccount(pubkey: PublicKey, data: Buffer, pool?: DecodedAdrenaPool): DecodedAdrenaCustody | null {
  if (data.length < ADRENA_CUSTODY_OFFSETS.version + 1) {
    return null;
  }
  if (!data.subarray(0, 8).equals(DISC_CUSTODY)) {
    return null;
  }

  const custodyAddress = pubkey.toBase58();
  const manifest = ADRENA_MAINNET_MARKETS_BY_CUSTODY[custodyAddress];
  const poolAddress = readPublicKey(data, ADRENA_CUSTODY_OFFSETS.pool);
  const custodyMint = readPublicKey(data, ADRENA_CUSTODY_OFFSETS.mint);
  const oracle = readAdrenaLimitedString(data, ADRENA_CUSTODY_OFFSETS.oracle);
  const tradeOracle = readAdrenaLimitedString(data, ADRENA_CUSTODY_OFFSETS.tradeOracle);
  const inferredSymbol = inferAdrenaSymbolFromOracle(tradeOracle || oracle, custodyMint.slice(0, 6).toUpperCase());
  const symbol = manifest?.symbol ?? inferredSymbol;
  const isSynthetic = data[ADRENA_CUSTODY_OFFSETS.isSynthetic] !== 0;
  const kind = manifest?.kind ?? (isSynthetic ? 'synthetic-perp' : 'unknown');

  return {
    symbol,
    market: manifest?.market ?? (kind === 'collateral' ? symbol : `${symbol}-PERP`),
    custodyAddress,
    poolAddress,
    poolName: pool?.name ?? manifest?.poolName ?? ADRENA_MAINNET_POOLS[poolAddress]?.name,
    poolType: pool?.type ?? ADRENA_MAINNET_POOLS[poolAddress]?.type,
    custodyMint,
    tokenAccount: readPublicKey(data, ADRENA_CUSTODY_OFFSETS.tokenAccount),
    oracle,
    tradeOracle,
    oracleFeedId: data[ADRENA_CUSTODY_OFFSETS.oracleFeedId] ?? 0,
    tradeOracleFeedId: data[ADRENA_CUSTODY_OFFSETS.tradeOracleFeedId] ?? 0,
    decimals: data[ADRENA_CUSTODY_OFFSETS.decimals] ?? 0,
    allowTrade: data[ADRENA_CUSTODY_OFFSETS.allowTrade] !== 0,
    allowSwap: data[ADRENA_CUSTODY_OFFSETS.allowSwap] !== 0,
    isStable: data[13] !== 0,
    isSynthetic,
    version: data[ADRENA_CUSTODY_OFFSETS.version] ?? 0,
    kind,
    markPrice: null,
    markPriceSource: 'not_in_custody_account',
    maxInitialLeverage: data.readUInt32LE(ADRENA_CUSTODY_OFFSETS.maxInitialLeverage) / (10 ** ADRENA_BPS_DECIMALS),
    maxLeverage: data.readUInt32LE(ADRENA_CUSTODY_OFFSETS.maxLeverage) / (10 ** ADRENA_BPS_DECIMALS),
    maxPositionLockedUsd: readUsd(data, ADRENA_CUSTODY_OFFSETS.maxPositionLockedUsd),
    openInterestLong: readUsd(data, ADRENA_CUSTODY_OFFSETS.longPositionsSizeUsd),
    openInterestShort: readUsd(data, ADRENA_CUSTODY_OFFSETS.shortPositionsSizeUsd),
    openPositionsLong: readU64LE(data, ADRENA_CUSTODY_OFFSETS.longPositionsOpenCount),
    openPositionsShort: readU64LE(data, ADRENA_CUSTODY_OFFSETS.shortPositionsOpenCount),
    borrowSizeLongUsd: readUsd(data, ADRENA_CUSTODY_OFFSETS.longPositionsBorrowSizeUsd),
    borrowSizeShortUsd: readUsd(data, ADRENA_CUSTODY_OFFSETS.shortPositionsBorrowSizeUsd),
    collateralLongUsd: readUsd(data, ADRENA_CUSTODY_OFFSETS.longPositionsCollateralUsd),
    collateralShortUsd: readUsd(data, ADRENA_CUSTODY_OFFSETS.shortPositionsCollateralUsd),
    lockedAmountLongRaw: data.readBigUInt64LE(ADRENA_CUSTODY_OFFSETS.longPositionsLockedAmount).toString(),
    lockedAmountShortRaw: data.readBigUInt64LE(ADRENA_CUSTODY_OFFSETS.shortPositionsLockedAmount).toString(),
    tradeOiLongUsd: readUsd(data, ADRENA_CUSTODY_OFFSETS.tradeOiLongUsd),
    tradeOiShortUsd: readUsd(data, ADRENA_CUSTODY_OFFSETS.tradeOiShortUsd),
    cumulativeOpenPositionUsd: readUsd(data, ADRENA_CUSTODY_OFFSETS.volumeOpenPositionUsd),
    assetsRaw: {
      collateral: data.readBigUInt64LE(ADRENA_CUSTODY_OFFSETS.assetsCollateral).toString(),
      owned: data.readBigUInt64LE(ADRENA_CUSTODY_OFFSETS.assetsOwned).toString(),
      locked: data.readBigUInt64LE(ADRENA_CUSTODY_OFFSETS.assetsLocked).toString(),
    },
    borrowRate: {
      currentRateRaw: data.readBigUInt64LE(ADRENA_CUSTODY_OFFSETS.borrowRateCurrent).toString(),
      lastUpdate: readI64LE(data, ADRENA_CUSTODY_OFFSETS.borrowRateLastUpdate),
    },
    funding: {
      currentRateLongToShortRaw: data.readBigInt64LE(ADRENA_CUSTODY_OFFSETS.virtualFundingCurrentLongToShort).toString(),
      lastUpdate: readI64LE(data, ADRENA_CUSTODY_OFFSETS.virtualFundingLastUpdate),
      cumulativeLongToShortRaw: readU128Split(data, ADRENA_CUSTODY_OFFSETS.virtualFundingCumulativeLongToShort).toString(),
      cumulativeShortToLongRaw: readU128Split(data, ADRENA_CUSTODY_OFFSETS.virtualFundingCumulativeShortToLong).toString(),
      maxHourlyFundingRateRaw: data.readBigUInt64LE(ADRENA_CUSTODY_OFFSETS.virtualFundingMaxHourlyRate).toString(),
      minTotalOiUsd: readUsd(data, ADRENA_CUSTODY_OFFSETS.virtualFundingMinTotalOiUsd),
      imbalanceSensitivityBps: data.readUInt16LE(ADRENA_CUSTODY_OFFSETS.virtualFundingImbalanceSensitivityBps),
    },
  };
}

function sideFromAdrenaByte(sideByte: number): 'long' | 'short' | null {
  if (sideByte === 1) return 'long';
  if (sideByte === 2) return 'short';
  return null;
}

export function decodeAdrenaPositionAccount(
  pubkey: PublicKey,
  data: Buffer,
  marketsByCustody: Map<string, DecodedAdrenaCustody> = new Map(),
): DecodedAdrenaPosition | null {
  if (data.length < ADRENA_POSITION_OFFSETS.unrealizedFundingReceivedUsd + 8) {
    return null;
  }
  if (!data.subarray(0, 8).equals(DISC_POSITION)) {
    return null;
  }

  const sideRaw = data[ADRENA_POSITION_OFFSETS.side] ?? 0;
  const side = sideFromAdrenaByte(sideRaw);
  if (!side) {
    return null;
  }

  const custodyAddress = readPublicKey(data, ADRENA_POSITION_OFFSETS.custody);
  const market = marketsByCustody.get(custodyAddress)?.market ?? 'unknown';
  const entryPrice = readPrice(data, ADRENA_POSITION_OFFSETS.price);
  const sizeUsd = readUsd(data, ADRENA_POSITION_OFFSETS.sizeUsd);
  const collateralUsd = readUsd(data, ADRENA_POSITION_OFFSETS.collateralUsd);
  const leverage = collateralUsd > 0 ? sizeUsd / collateralUsd : 0;
  const liquidationPrice = leverage > 0
    ? side === 'long'
      ? entryPrice * (1 - 1 / leverage)
      : entryPrice * (1 + 1 / leverage)
    : 0;
  const takeProfitLimitPrice = readPrice(data, ADRENA_POSITION_OFFSETS.takeProfitLimitPrice);
  const stopLossLimitPrice = readPrice(data, ADRENA_POSITION_OFFSETS.stopLossLimitPrice);
  const stopLossClosePositionPrice = readPrice(data, ADRENA_POSITION_OFFSETS.stopLossClosePositionPrice);

  return {
    positionKey: pubkey.toBase58(),
    market,
    side,
    sideRaw,
    owner: readPublicKey(data, ADRENA_POSITION_OFFSETS.owner),
    poolAddress: readPublicKey(data, ADRENA_POSITION_OFFSETS.pool),
    custodyAddress,
    collateralCustodyAddress: readPublicKey(data, ADRENA_POSITION_OFFSETS.collateralCustody),
    openTime: readI64LE(data, ADRENA_POSITION_OFFSETS.openTime),
    updateTime: readI64LE(data, ADRENA_POSITION_OFFSETS.updateTime),
    entryPrice,
    entryPriceRaw: data.readBigUInt64LE(ADRENA_POSITION_OFFSETS.price).toString(),
    size: sizeUsd,
    collateral: collateralUsd,
    borrowSizeUsd: readUsd(data, ADRENA_POSITION_OFFSETS.borrowSizeUsd),
    leverage,
    unrealizedPnl: 0,
    unrealizedInterestUsd: readUsd(data, ADRENA_POSITION_OFFSETS.unrealizedInterestUsd),
    unrealizedFundingPaidUsd: readUsd(data, ADRENA_POSITION_OFFSETS.unrealizedFundingPaidUsd),
    unrealizedFundingReceivedUsd: readUsd(data, ADRENA_POSITION_OFFSETS.unrealizedFundingReceivedUsd),
    lockedAmountRaw: data.readBigUInt64LE(ADRENA_POSITION_OFFSETS.lockedAmount).toString(),
    collateralAmountRaw: data.readBigUInt64LE(ADRENA_POSITION_OFFSETS.collateralAmount).toString(),
    liquidationPrice,
    takeProfitLimitPrice: takeProfitLimitPrice > 0 ? takeProfitLimitPrice : null,
    stopLossLimitPrice: stopLossLimitPrice > 0 ? stopLossLimitPrice : null,
    stopLossClosePositionPrice: stopLossClosePositionPrice > 0 ? stopLossClosePositionPrice : null,
    id: data.readBigUInt64LE(ADRENA_POSITION_OFFSETS.id).toString(),
  };
}

/* ═══════════════════════════════════════════════════════════════════
 *  Shared RPC helpers
 * ═══════════════════════════════════════════════════════════════════ */

export async function readAdrenaMarketsByCustody(context: SapMcpContext): Promise<Map<string, DecodedAdrenaCustody>> {
  const { PublicKey } = await import('@solana/web3.js');
  const adrenaProgramId = new PublicKey(getPerpsConfig(context).adrenaProgramId || '13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet');
  const [poolAccounts, custodyAccounts] = await Promise.all([
    context.connection.getProgramAccounts(adrenaProgramId, {
      filters: [{ memcmp: { offset: 0, bytes: discToBase58(DISC_POOL) } }],
      commitment: 'confirmed',
    }),
    context.connection.getProgramAccounts(adrenaProgramId, {
      filters: [{ memcmp: { offset: 0, bytes: discToBase58(DISC_CUSTODY) } }],
      commitment: 'confirmed',
    }),
  ]);

  const pools = new Map<string, DecodedAdrenaPool>();
  for (const { pubkey, account } of poolAccounts) {
    const decoded = decodeAdrenaPoolAccount(pubkey, account.data);
    if (decoded) {
      pools.set(decoded.poolAddress, decoded);
    }
  }

  const markets = new Map<string, DecodedAdrenaCustody>();
  for (const { pubkey, account } of custodyAccounts) {
    const poolAddress = account.data.length >= ADRENA_CUSTODY_OFFSETS.pool + 32
      ? readPublicKey(account.data, ADRENA_CUSTODY_OFFSETS.pool)
      : '';
    const decoded = decodeAdrenaCustodyAccount(pubkey, account.data, pools.get(poolAddress));
    if (decoded) {
      markets.set(decoded.custodyAddress, decoded);
    }
  }

  return markets;
}

export function getAdrenaProgramId(context: SapMcpContext): PublicKey {
  return new PublicKey(getPerpsConfig(context).adrenaProgramId || '13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet');
}

/* ═══════════════════════════════════════════════════════════════════
 *  Provider fetch helpers
 * ═══════════════════════════════════════════════════════════════════ */

export async function fetchConfiguredPerpMarkets(
  context: SapMcpContext,
  marketFilter: string,
): Promise<{
  markets: PerpMarketProviderRecord[];
  source: string;
  timestamp?: number;
} | null> {
  const perps = getPerpsConfig(context);
  if (!perps.marketsUrl) {
    return null;
  }

  const { timedFetch, appendQuery, perpsProviderHeaders, normalizePerpProviderMarkets } = await import('./perp-constants.js');
  const url = appendQuery(perps.marketsUrl, { market: marketFilter || undefined });
  const payload = await timedFetch<PerpMarketsProviderPayload | PerpMarketProviderRecord[]>(url, {
    headers: perpsProviderHeaders(),
    timeoutMs: perps.timeoutMs,
  });

  if (!payload) {
    return null;
  }

  return {
    markets: normalizePerpProviderMarkets(payload, marketFilter),
    source: Array.isArray(payload) ? 'configured-perps-provider' : payload.source ?? payload.venue ?? 'configured-perps-provider',
    timestamp: Array.isArray(payload) ? Date.now() : payload.timestamp,
  };
}