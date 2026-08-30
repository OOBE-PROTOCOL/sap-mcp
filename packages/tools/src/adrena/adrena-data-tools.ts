/**
 * @name tools/adrena/adrena-data-tools
 * @description Data API and on-chain market reader tool registrations for Adrena.
 *
 * @module tools/adrena/adrena-data-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey } from '@solana/web3.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import type { UiCardContext } from '../../../ui-cards/src/ui-resources.js';
import {
  adrenaPipelineError,
  adrenaPipelineOk,
  registerAdrenaPipelineTool,
} from './adrena-pipeline.js';
import {
  adrenaDataApi,
  readAdrenaOracleReadiness,
  readPositionRequiredOracleSymbols,
  type AdrenaPool,
} from '../../../perps/src/adrena/index.js';
import { ADRENA_CUSTODIES, ADRENA_MAIN_POOL_ADDRESS, ADRENA_COMMODITIES_POOL_ADDRESS } from '../../../perps/src/adrena/adrena-constants.js';
import type { AdrenaPositionRecord } from '../../../perps/src/adrena/adrena-data-api.js';
import {
  getConnection,
} from './adrena-helpers.js';
import { withAdrenaConnectionFallback } from './adrena-rpc-fallback.js';

/**
 * Read a wallet's open Adrena positions directly on-chain (PDA derivation +
 * getMultipleAccountsInfo) when the upstream Data API is unavailable. The
 * Data API (datapi.adrena.trade) has changed contract / returns 400 on every
 * path, so this path keeps the tool functional with live position state.
 * @param context — SAP MCP context with the primary Solana RPC.
 * @param wallet — Owner wallet public key.
 * @returns Position records in the Data API shape, or null when the read fails.
 */
async function readOpenPositionsOnChain(
  context: SapMcpContext,
  wallet: string,
): Promise<AdrenaPositionRecord[] | null> {
  try {
    const { derivePositionPda } = await import('../../../perps/src/adrena/adrena-pda.js');
    const { decodeAdrenaPositionAccount, readAdrenaMarketsByCustody } = await import('../../../perps/src/perp-decoders.js');
    const custodyEntries = Object.entries(ADRENA_CUSTODIES);
    const sides: Array<'long' | 'short'> = ['long', 'short'];

    const pdaChecks = custodyEntries.flatMap(([symbol, custody]) => {
      const poolPk = new PublicKey(custody.pool);
      const custodyPk = new PublicKey(custody.address);
      return sides.map((side) => ({
        symbol,
        side,
        pda: derivePositionPda(new PublicKey(wallet), poolPk, custodyPk, side),
      }));
    });

    const decodedMarkets = await withAdrenaConnectionFallback(
      context,
      (connection) => readAdrenaMarketsByCustody(context, connection),
      'Adrena markets read',
    );

    const accounts = await withAdrenaConnectionFallback(
      context,
      (connection) => connection.getMultipleAccountsInfo(
        pdaChecks.map((c) => c.pda),
        'confirmed',
      ),
      'Adrena positions read',
    );

    const positions: AdrenaPositionRecord[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const check = pdaChecks[i];
      if (!account?.data || !check) continue;
      const decoded = decodeAdrenaPositionAccount(check.pda, account.data, decodedMarkets);
      if (!decoded) continue;
      const marketSymbol = decoded.market === 'unknown' ? check.symbol : decoded.market;
      positions.push({
        wallet,
        principalToken: marketSymbol,
        collateralToken: 'USDC',
        side: decoded.side,
        sizeUsd: decoded.size,
        collateralUsd: decoded.collateral,
        leverage: decoded.leverage,
        entryPrice: decoded.entryPrice,
        exitPrice: null,
        pnlUsd: decoded.unrealizedPnl,
        openTime: decoded.openTime,
        closeTime: null,
        status: 'open',
      });
    }
    return positions;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
 *  Data API Tools
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaDataApiTools
 * @description Register Adrena Data API (REST) tools for market data and analytics.
 * @internal
 */
export function registerAdrenaDataApiTools(server: Server, context: SapMcpContext): void {
  // Get positions
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_positions', {
    description: 'Fetch position history for a wallet from the Adrena Data API. Returns closed and open positions with P&L, entry/exit prices, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Wallet public key (base58).' },
      },
      required: ['wallet'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const wallet = String(args['wallet'] ?? '').trim();
    if (!wallet) {
      return adrenaPipelineError({ error: 'wallet is required' });
    }
    let positions = await adrenaDataApi.getPositions(wallet);
    let source: 'data-api' | 'on-chain-pda-fallback' = 'data-api';
    if (positions === null) {
      // Data API is down (returning 400 on every path) — fall back to the
      // on-chain Position PDA read so the tool stays functional.
      positions = await readOpenPositionsOnChain(context, wallet);
      if (positions === null) {
        return adrenaPipelineError({ error: 'Failed to fetch positions from Adrena Data API and on-chain fallback', wallet });
      }
      source = 'on-chain-pda-fallback';
    }
    const data = { wallet, positions, count: positions.length, source };
    const openPosition = positions.find((p) => p.status === 'open');
    const cardCtx: UiCardContext | undefined = openPosition
      ? {
          kind: 'position',
          market: openPosition.principalToken,
          side: openPosition.side === 'long' ? 'long' : 'short',
          size: openPosition.sizeUsd,
          entryPrice: openPosition.entryPrice,
          markPrice: openPosition.exitPrice ?? openPosition.entryPrice,
          leverage: openPosition.leverage,
          pnlUsd: openPosition.pnlUsd ?? 0,
          pnlPct: openPosition.sizeUsd > 0 ? ((openPosition.pnlUsd ?? 0) / openPosition.sizeUsd) * 100 : 0,
          walletAddress: wallet,
        }
      : undefined;
    if (cardCtx) {
      return adrenaPipelineOk(data, cardCtx);
    }
    return adrenaPipelineOk(data);
  }, { uiCard: true });

  // Get pool info — reads directly from on-chain Pool account (Data API endpoint is broken)
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_pool_info', {
    description: 'Read Adrena pool statistics directly from the on-chain Pool account. Returns TVL (AUM), LP token price, pool name, custody list, trade/swap flags, and fees debt. Reads from Solana mainnet via RPC. Use this before opening positions to check pool health and available custodies.',
    inputSchema: {
      type: 'object',
      properties: {
        poolName: { type: 'string', description: 'Pool name. Supported: main-pool (default), commodities-pool.', enum: ['main-pool', 'commodities-pool'] },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const poolName = args['poolName'] === 'commodities-pool' ? 'commodities-pool' : 'main-pool';
      const connection = getConnection(context);
      const poolAddress = poolName === 'commodities-pool'
        ? ADRENA_COMMODITIES_POOL_ADDRESS
        : ADRENA_MAIN_POOL_ADDRESS;
      const accountInfo = await connection.getAccountInfo(new PublicKey(poolAddress), 'confirmed');
      if (!accountInfo || !accountInfo.data || accountInfo.data.length < 48) {
        return adrenaPipelineError({ error: `Pool account ${poolAddress} not found or too small` });
      }
      const d = accountInfo.data;
      // Pool layout (release/39): 8 disc + 1 bump + 1 lpBump + 1 nbStable + 1 init + 1 allowTrade + 1 allowSwap + 1 liqState + 1 custodyCount + 32 name + 256 custodies(8×32) + ...
      const allowTrade = d[12] === 1;
      const allowSwap = d[13] === 1;
      const custodyCount = d[15];
      // Name is a LimitedString at offset 16 (31 bytes + 1 length byte at offset 47)
      const nameLen = d[47];
      const name = d.subarray(16, 16 + Math.min(nameLen, 31)).toString('utf8').replace(/\0/g, '');
      // Custodies array at offset 48 (8 × 32 bytes = 256 bytes)
      const custodies: string[] = [];
      for (let i = 0; i < Math.min(custodyCount, 8); i++) {
        const off = 48 + i * 32;
        if (off + 32 > d.length) break;
        custodies.push(new PublicKey(d.subarray(off, off + 32)).toBase58());
      }
      // LP token price at offset 328 (u64, USD 6 decimals)
      const lpTokenPriceUsd = Number(d.readBigUInt64LE(328)) / 1e6;
      // AUM at offset 448 (u64, USD 6 decimals)
      const aumUsd = Number(d.readBigUInt64LE(448)) / 1e6;
      // Fees debt at offset 304 (u64)
      const feesDebtUsd = Number(d.readBigUInt64LE(304)) / 1e6;
      // Referrers fee debt at offset 312
      const referrersFeeDebtUsd = Number(d.readBigUInt64LE(312)) / 1e6;

      return adrenaPipelineOk({
        poolName: name || poolName,
        poolAddress,
        allowTrade,
        allowSwap,
        custodyCount,
        custodies,
        lpTokenPriceUsd,
        aumUsd,
        tvlUsd: aumUsd,
        feesDebtUsd,
        referrersFeeDebtUsd,
        dataLength: d.length,
        source: 'on-chain-rpc',
      });
    } catch (err) {
      return adrenaPipelineError({ error: 'Failed to read pool info from on-chain account', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get custody info
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_custody_info', {
    description: 'Fetch per-asset custody statistics from the Adrena Data API. Returns open interest, utilization, volume, and fees for each custody.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional symbol filter (e.g. JITOSOL, WBTC).' },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const symbol = typeof args['symbol'] === 'string' ? args['symbol'] : undefined;
    const custodies = await adrenaDataApi.getCustodyInfo(symbol);
    if (custodies === null) {
      return adrenaPipelineError({ error: 'Failed to fetch custody info from Adrena Data API' });
    }
    return adrenaPipelineOk({ custodies, count: custodies.length });
  });

  // Get trader info
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_trader_info', {
    description: 'Fetch trader performance metrics from the Adrena Data API. Returns total volume, P&L, fees, win rate, and rank.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Trader wallet public key (base58).' },
      },
      required: ['wallet'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const wallet = String(args['wallet'] ?? '').trim();
    if (!wallet) {
      return adrenaPipelineError({ error: 'wallet is required' });
    }
    let trader = await adrenaDataApi.getTraderInfo(wallet);
    if (trader === null) {
      // Data API is down — derive live trader metrics from the on-chain
      // Position PDA read (open positions only; closed history is not
      // reconstructable without the indexed API).
      const positions = await readOpenPositionsOnChain(context, wallet);
      if (positions !== null) {
        const openPositions = positions.filter((p) => p.status === 'open');
        trader = {
          wallet,
          totalVolumeUsd: openPositions.reduce((sum, p) => sum + p.sizeUsd, 0),
          totalPnlUsd: openPositions.reduce((sum, p) => sum + (p.pnlUsd ?? 0), 0),
          totalFeesPaid: 0,
          positionsCount: openPositions.length,
          winRate: 0,
          rank: null,
        };
      }
    }
    if (trader === null) {
      return adrenaPipelineError({ error: 'Failed to fetch trader info from Adrena Data API and on-chain fallback', wallet });
    }
    return adrenaPipelineOk(trader);
  });

  // Get trader leaderboard
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_trader_leaderboard', {
    description: 'Fetch trader leaderboard from the Adrena Data API. Returns top traders by volume and P&L.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Optional limit. Default 50.', minimum: 1, maximum: 500 },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const limit = typeof args['limit'] === 'number' ? args['limit'] : undefined;
    const traders = await adrenaDataApi.getTraderProfiles(limit);
    if (traders === null) {
      return adrenaPipelineError({ error: 'Failed to fetch trader leaderboard from Adrena Data API' });
    }
    return adrenaPipelineOk({ traders, count: traders.length });
  });

  // Get mutagen points
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_mutagen', {
    description: 'Fetch Mutagen points for a wallet from the Adrena Data API. Returns total points, rank, and breakdown.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Wallet public key (base58).' },
      },
      required: ['wallet'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const wallet = String(args['wallet'] ?? '').trim();
    if (!wallet) {
      return adrenaPipelineError({ error: 'wallet is required' });
    }
    const mutagen = await adrenaDataApi.getMutagen(wallet);
    if (mutagen === null) {
      return adrenaPipelineError({ error: 'Failed to fetch mutagen points from Adrena Data API', wallet });
    }
    return adrenaPipelineOk(mutagen);
  });

  // Get mutagen leaderboard
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_mutagen_leaderboard', {
    description: 'Fetch Mutagen points leaderboard from the Adrena Data API. Returns top wallets by points.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Optional limit. Default 50.', minimum: 1, maximum: 500 },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const limit = typeof args['limit'] === 'number' ? args['limit'] : undefined;
    const leaderboard = await adrenaDataApi.getMutagenLeaderboard(limit);
    if (leaderboard === null) {
      return adrenaPipelineError({ error: 'Failed to fetch mutagen leaderboard from Adrena Data API' });
    }
    return adrenaPipelineOk({ leaderboard, count: leaderboard.length });
  });

  // Get prices (ADX/ALP)
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_prices', {
    description: 'Fetch current ADX and ALP token prices from the Adrena Data API.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  }, async () => {
    const prices = await adrenaDataApi.getPrice();
    if (prices === null) {
      return adrenaPipelineError({ error: 'Failed to fetch prices from Adrena Data API' });
    }
    return adrenaPipelineOk(prices);
  });

  // Get last trading prices
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_trading_prices', {
    description: 'Fetch latest oracle trading prices for all Adrena assets. Returns price and custody address for each traded asset.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  }, async () => {
    const prices = await adrenaDataApi.getLastTradingPrices();
    if (prices === null) {
      return adrenaPipelineError({ error: 'Failed to fetch trading prices from Adrena Data API' });
    }
    return adrenaPipelineOk({ prices, count: prices.length });
  });

  registerAdrenaPipelineTool(server, context, 'sap_adrena_oracle_readiness', {
    description: 'Free Adrena execution readiness check for an exact market/pool/collateral route. Reads on-chain pool, custody, and oracle accounts and returns whether each required oracle symbol has enough fresh prices for Adrena minAgree. Use this before any sap_adrena_build_* open-position tool. If ready=false, do not show approval and do not call sap_payments_finalize_transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        principalToken: { type: 'string', description: 'Market symbol to trade, for example WBTC, JITOSOL, BONK, XAU, XAG, WTI.' },
        collateralToken: { type: 'string', description: 'Collateral symbol. USDC for shorts and commodities; same token for main-pool longs.' },
        poolName: { type: 'string', description: 'Adrena pool. Default main-pool; use commodities-pool for XAU/XAG/WTI.', enum: ['main-pool', 'commodities-pool'] },
        requiredSymbols: {
          type: 'array',
          description: 'Optional explicit oracle symbols to check. If omitted, SAP MCP derives them from principal/collateral custody accounts.',
          items: { type: 'string' },
        },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const poolName = (args['poolName'] === 'commodities-pool' ? 'commodities-pool' : 'main-pool') as AdrenaPool;
      const principalToken = String(args['principalToken'] ?? '').trim().toUpperCase();
      const collateralToken = String(args['collateralToken'] ?? '').trim().toUpperCase();
      const requiredSymbolsArg = Array.isArray(args['requiredSymbols'])
        ? args['requiredSymbols'].map(value => String(value).trim().toUpperCase()).filter(Boolean)
        : [];
      const requiredSymbols = requiredSymbolsArg.length > 0
        ? requiredSymbolsArg
        : await withAdrenaConnectionFallback(
            context,
            (connection) => readPositionRequiredOracleSymbols(connection, principalToken, collateralToken, poolName),
            'Adrena oracle symbols read',
          );
      if (requiredSymbols.length === 0) {
        return adrenaPipelineError({ error: 'principalToken/collateralToken or requiredSymbols are required' });
      }
      return adrenaPipelineOk(await withAdrenaConnectionFallback(
        context,
        (connection) => readAdrenaOracleReadiness(connection, poolName, requiredSymbols),
        'Adrena oracle readiness read',
      ));
    } catch (err) {
      return adrenaPipelineError({
        error: 'Failed to read Adrena oracle readiness',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // Get position status (live P&L)
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_position_status', {
    description: 'Fetch live position status (P&L, size, liquidation price, entry price, oracle price) from the Adrena Data API for a specific wallet and token.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Wallet public key (base58).' },
        principalToken: { type: 'string', description: 'Principal token symbol (e.g. JITOSOL, WBTC, BONK, XAU).' },
        side: { type: 'string', description: 'Position side.', enum: ['long', 'short'] },
      },
      required: ['wallet', 'principalToken', 'side'],
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    const wallet = String(args['wallet'] ?? '').trim();
    const principalToken = String(args['principalToken'] ?? '').trim().toUpperCase();
    const side = args['side'] === 'short' ? 'short' : 'long';
    if (!wallet || !principalToken) {
      return adrenaPipelineError({ error: 'wallet and principalToken are required' });
    }
    const positions = await adrenaDataApi.getPositions(wallet)
      ?? await readOpenPositionsOnChain(context, wallet);
    if (positions === null) {
      return adrenaPipelineError({ error: 'Failed to fetch positions from Adrena Data API (on-chain fallback also unavailable)' });
    }
    const matching = positions.filter(p =>
      p.principalToken?.toUpperCase() === principalToken &&
      p.side?.toLowerCase() === side,
    );
    if (matching.length === 0) {
      return adrenaPipelineOk({ wallet, principalToken, side, status: 'no_open_position', message: `No ${side} position found for ${principalToken}` });
    }
    return adrenaPipelineOk({ wallet, principalToken, side, positions: matching, count: matching.length });
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  On-chain Markets Reader
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerAdrenaGetMarketsTool
 * @description Register sap_adrena_get_markets — reads all custody accounts on-chain
 * and returns real market data: mint, decimals, max leverage, trade/swap flags,
 * oracle feed IDs, open interest, and collateral stats.
 * @internal
 */
export function registerAdrenaGetMarketsTool(server: Server, context: SapMcpContext): void {
  registerAdrenaPipelineTool(server, context, 'sap_adrena_get_markets', {
    description: 'Read all Adrena custody accounts directly from Solana mainnet and return real market data for every supported asset: mint address, decimals, max initial leverage, max leverage, allowTrade/allowSwap flags, oracle feed IDs, open interest (long/short USD), locked amounts, borrow rates, and funding rates. This is the authoritative source for what markets Adrena supports and their current on-chain parameters. Use this before opening positions to verify leverage limits and trade availability.',
    inputSchema: {
      type: 'object',
      properties: {
        poolName: {
          type: 'string',
          description: 'Optional pool filter. Supported: main-pool, commodities-pool. Omit for all pools.',
          enum: ['main-pool', 'commodities-pool'],
        },
      },
      additionalProperties: false,
    },
  }, async (args: Record<string, unknown>) => {
    try {
      const poolFilter = args['poolName'] === 'commodities-pool'
        ? 'commodities-pool'
        : args['poolName'] === 'main-pool'
          ? 'main-pool'
          : null;

      const connection = getConnection(context);
      const allCustodies = Object.entries(ADRENA_CUSTODIES).map(([symbol, info]) => ({
        symbol,
        address: info.address,
        pool: info.pool === ADRENA_MAIN_POOL_ADDRESS ? 'main-pool' : 'commodities-pool',
        kind: info.kind,
      }));

      const markets = [];
      for (const cust of allCustodies) {
        if (poolFilter && cust.pool !== poolFilter) continue;

        try {
          const accountInfo = await connection.getAccountInfo(new PublicKey(cust.address), 'confirmed');
          if (!accountInfo || !accountInfo.data || accountInfo.data.length < 916) {
            markets.push({
              symbol: cust.symbol,
              custodyAddress: cust.address,
              pool: cust.pool,
              kind: cust.kind,
              error: 'Custody account not found or too small',
            });
            continue;
          }

          const d = accountInfo.data;
          const mintRaw = new PublicKey(d.subarray(48, 80)).toBase58();
          const tokenAccount = new PublicKey(d.subarray(80, 112)).toBase58();

          // Leverage values are in BPS: divide by 10000 for human-readable
          const maxInitialLeverageBps = d.readUInt32LE(176);
          const maxLeverageBps = d.readUInt32LE(180);
          const maxPositionLockedUsd = Number(d.readBigUInt64LE(184)) / 1e6; // USD 6 decimals

          // Open interest
          const longOiUsd = Number(d.readBigUInt64LE(408)) / 1e6;
          const shortOiUsd = Number(d.readBigUInt64LE(608)) / 1e6;

          // Collateral
          const longCollateralUsd = Number(d.readBigUInt64LE(472)) / 1e6;
          const shortCollateralUsd = Number(d.readBigUInt64LE(672)) / 1e6;

          // Locked amounts
          const longLockedRaw = d.readBigUInt64LE(424).toString();
          const shortLockedRaw = d.readBigUInt64LE(624).toString();

          // Position counts
          const longCount = Number(d.readBigUInt64LE(400));
          const shortCount = Number(d.readBigUInt64LE(600));

          // Borrow rate
          const borrowRateRaw = d.readBigUInt64LE(800).toString();
          const borrowRateLastUpdate = Number(d.readBigUInt64LE(808));

          // Funding
          const fundingLongToShortRaw = d.readBigUInt64LE(864).toString();
          const fundingLastUpdate = Number(d.readBigUInt64LE(872));
          const fundingMaxHourlyRateRaw = d.readBigUInt64LE(840).toString();
          const minTotalOiUsd = Number(d.readBigUInt64LE(848)) / 1e6;
          const imbalanceSensitivityBps = d.readUInt32LE(856);

          // Flags
          const allowTrade = d[10] === 1;
          const allowSwap = d[11] === 1;
          const oracleFeedId = d[914];
          const tradeOracleFeedId = d[915];

          // Assets
          const assetsCollateralRaw = d.readBigUInt64LE(376).toString();
          const assetsOwnedRaw = d.readBigUInt64LE(384).toString();
          const assetsLockedRaw = d.readBigUInt64LE(392).toString();

          const isSystemMint = mintRaw === '11111111111111111111111111111111';

          markets.push({
            symbol: cust.symbol,
            custodyAddress: cust.address,
            pool: cust.pool,
            kind: cust.kind,
            mint: isSystemMint ? null : mintRaw,
            mintIsSynthetic: isSystemMint,
            decimals: d[12],
            tokenAccount,
            allowTrade,
            allowSwap,
            maxInitialLeverage: maxInitialLeverageBps / 10000,
            maxLeverage: maxLeverageBps / 10000,
            maxInitialLeverageBps,
            maxLeverageBps,
            maxPositionLockedUsd,
            openInterest: {
              longUsd: longOiUsd,
              shortUsd: shortOiUsd,
              longPositions: longCount,
              shortPositions: shortCount,
            },
            collateral: {
              longUsd: longCollateralUsd,
              shortUsd: shortCollateralUsd,
            },
            lockedAmounts: {
              longRaw: longLockedRaw,
              shortRaw: shortLockedRaw,
            },
            assets: {
              collateralRaw: assetsCollateralRaw,
              ownedRaw: assetsOwnedRaw,
              lockedRaw: assetsLockedRaw,
            },
            borrowRate: {
              raw: borrowRateRaw,
              lastUpdate: borrowRateLastUpdate,
            },
            funding: {
              currentLongToShortRaw: fundingLongToShortRaw,
              maxHourlyRateRaw: fundingMaxHourlyRateRaw,
              lastUpdate: fundingLastUpdate,
              minTotalOiUsd,
              imbalanceSensitivityBps,
            },
            oracle: {
              feedId: oracleFeedId,
              tradeFeedId: tradeOracleFeedId,
            },
          });
        } catch (err) {
          markets.push({
            symbol: cust.symbol,
            custodyAddress: cust.address,
            pool: cust.pool,
            kind: cust.kind,
            error: err instanceof Error ? err.message : 'Failed to read custody account',
          });
        }
      }

      return adrenaPipelineOk({
        poolFilter: poolFilter ?? 'all',
        marketCount: markets.length,
        markets,
      });
    } catch (err) {
      return adrenaPipelineError({
        error: 'Failed to read Adrena markets from on-chain custody accounts',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });
}
