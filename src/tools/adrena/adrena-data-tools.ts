/**
 * @name tools/adrena/adrena-data-tools
 * @description Data API and on-chain market reader tool registrations for Adrena.
 *
 * @module tools/adrena/adrena-data-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey } from '@solana/web3.js';
import type { SapMcpContext } from '../../core/types.js';
import { createTextResponse, createUiCardResponse } from '../../adapters/mcp/tool-response.js';
import type { UiCardContext } from '../../ui/ui-resources.js';
import { registerTool } from '../../adapters/mcp/sdk-compat.js';
import {
  adrenaDataApi,
} from '../../perps/adrena/index.js';
import { ADRENA_CUSTODIES, ADRENA_MAIN_POOL_ADDRESS, ADRENA_COMMODITIES_POOL_ADDRESS } from '../../perps/adrena/adrena-constants.js';
import {
  getConnection,
} from './adrena-helpers.js';

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
  registerTool(server, 'sap_adrena_get_positions', {
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
      return createTextResponse(JSON.stringify({ error: 'wallet is required' }), { isError: true });
    }
    const positions = await adrenaDataApi.getPositions(wallet);
    if (positions === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch positions from Adrena Data API', wallet }), { isError: true });
    }
    const data = { wallet, positions, count: positions.length };
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
      return createUiCardResponse(data, cardCtx);
    }
    return createTextResponse(JSON.stringify(data, null, 2));
  });

  // Get pool info — reads directly from on-chain Pool account (Data API endpoint is broken)
  registerTool(server, 'sap_adrena_get_pool_info', {
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
        return createTextResponse(JSON.stringify({ error: `Pool account ${poolAddress} not found or too small` }), { isError: true });
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

      return createTextResponse(JSON.stringify({
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
      }, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({ error: 'Failed to read pool info from on-chain account', message: err instanceof Error ? err.message : 'Unknown error' }), { isError: true });
    }
  });

  // Get custody info
  registerTool(server, 'sap_adrena_get_custody_info', {
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
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch custody info from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify({ custodies, count: custodies.length }, null, 2));
  });

  // Get trader info
  registerTool(server, 'sap_adrena_get_trader_info', {
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
      return createTextResponse(JSON.stringify({ error: 'wallet is required' }), { isError: true });
    }
    const trader = await adrenaDataApi.getTraderInfo(wallet);
    if (trader === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch trader info from Adrena Data API', wallet }), { isError: true });
    }
    return createTextResponse(JSON.stringify(trader, null, 2));
  });

  // Get trader leaderboard
  registerTool(server, 'sap_adrena_get_trader_leaderboard', {
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
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch trader leaderboard from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify({ traders, count: traders.length }, null, 2));
  });

  // Get mutagen points
  registerTool(server, 'sap_adrena_get_mutagen', {
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
      return createTextResponse(JSON.stringify({ error: 'wallet is required' }), { isError: true });
    }
    const mutagen = await adrenaDataApi.getMutagen(wallet);
    if (mutagen === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch mutagen points from Adrena Data API', wallet }), { isError: true });
    }
    return createTextResponse(JSON.stringify(mutagen, null, 2));
  });

  // Get mutagen leaderboard
  registerTool(server, 'sap_adrena_get_mutagen_leaderboard', {
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
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch mutagen leaderboard from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify({ leaderboard, count: leaderboard.length }, null, 2));
  });

  // Get prices (ADX/ALP)
  registerTool(server, 'sap_adrena_get_prices', {
    description: 'Fetch current ADX and ALP token prices from the Adrena Data API.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  }, async () => {
    const prices = await adrenaDataApi.getPrice();
    if (prices === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch prices from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify(prices, null, 2));
  });

  // Get last trading prices
  registerTool(server, 'sap_adrena_get_trading_prices', {
    description: 'Fetch latest oracle trading prices for all Adrena assets. Returns price and custody address for each traded asset.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  }, async () => {
    const prices = await adrenaDataApi.getLastTradingPrices();
    if (prices === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch trading prices from Adrena Data API' }), { isError: true });
    }
    return createTextResponse(JSON.stringify({ prices, count: prices.length }, null, 2));
  });

  // Get position status (live P&L)
  registerTool(server, 'sap_adrena_get_position_status', {
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
      return createTextResponse(JSON.stringify({ error: 'wallet and principalToken are required' }), { isError: true });
    }
    const positions = await adrenaDataApi.getPositions(wallet);
    if (positions === null) {
      return createTextResponse(JSON.stringify({ error: 'Failed to fetch positions from Adrena Data API' }), { isError: true });
    }
    const matching = positions.filter(p =>
      p.principalToken?.toUpperCase() === principalToken &&
      p.side?.toLowerCase() === side,
    );
    if (matching.length === 0) {
      return createTextResponse(JSON.stringify({ wallet, principalToken, side, status: 'no_open_position', message: `No ${side} position found for ${principalToken}` }));
    }
    return createTextResponse(JSON.stringify({ wallet, principalToken, side, positions: matching, count: matching.length }, null, 2));
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
  registerTool(server, 'sap_adrena_get_markets', {
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

      return createTextResponse(JSON.stringify({
        poolFilter: poolFilter ?? 'all',
        marketCount: markets.length,
        markets,
      }, null, 2));
    } catch (err) {
      return createTextResponse(JSON.stringify({
        error: 'Failed to read Adrena markets from on-chain custody accounts',
        message: err instanceof Error ? err.message : 'Unknown error',
      }), { isError: true });
    }
  });
}