/**
 * @name perps/perp-analytics-tools
 * @description Perp analytics tool registrations: markets, position info, funding history,
 *              liquidation zones, trade plan, builder status, and optional order builder.
 *
 * @module perps/perp-analytics-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey } from '@solana/web3.js';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { logger } from '../core/logger.js';
import {
  ADRENA_CUSTODY_OFFSETS,
  DISC_CUSTODY,
  DISC_POOL,
  DISC_POSITION,
  getPerpsConfig,
  perpsProviderHeaders,
  timedFetch,
  type DecodedAdrenaPool,
  type JsonSchema,
  type LiquidationZone,
  type PerpBuilderProviderPayload,
  type PerpPosition,
} from './perp-constants.js';
import {
  decodeAdrenaCustodyAccount,
  decodeAdrenaPoolAccount,
  decodeAdrenaPositionAccount,
  discToBase58,
  readAdrenaMarketsByCustody,
  readPublicKey,
  fetchConfiguredPerpMarkets,
  getAdrenaProgramId,
} from './perp-decoders.js';
import {
  registerChartOhlcTool,
  registerChartLongTermTool,
  registerChartVolumeProfileTool,
} from './chart-tools.js';
import { registerChartMultiOhlcTool, registerChartIndicatorsTool } from './chart-indicators.js';

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 1: sap_perp_markets
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerPerpMarketsTool
 * @description Register the sap_perp_markets read-only tool.
 *
 * Reads Pool and Custody accounts directly from Solana RPC using
 * `getProgramAccounts` with memcmp discriminator filters. Decodes symbol,
 * price, funding rate, and open interest from raw account data.
 *
 * @param server  — MCP server instance.
 * @param context — Runtime context with Solana RPC connection.
 *
 * @internal
 */
function registerPerpMarketsTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      market: {
        type: 'string',
        description: 'Optional market symbol filter (e.g. "SOL", "BTC"). Empty = all markets.',
      },
    },
    additionalProperties: false,
  };

  registerTool(server, 'sap_perp_markets', {
    description: 'List available Adrena perpetual futures markets from Pool/Custody accounts with funding/accounting fields, open interest, leverage caps, and oracle identifiers. Read-only analysis tool. Custody accounts do not expose a ready mark price, so markPrice is null until an oracle/feed decoder or configured Adrena data runtime is available. If markets are empty, treat it as data unavailable, not proof that markets do not exist. SAP MCP exposes execution only when sap_perp_builder_status reports a verified hosted unsigned builder.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const marketFilter = typeof args['market'] === 'string' ? (args['market'] as string).toUpperCase() : '';

    try {
      const providerMarkets = await fetchConfiguredPerpMarkets(context, marketFilter);
      if (providerMarkets) {
        return createTextResponse(JSON.stringify({
          source: providerMarkets.source,
          markets: providerMarkets.markets,
          count: providerMarkets.markets.length,
          timestamp: providerMarkets.timestamp ?? Date.now(),
          dataAvailability: {
            status: providerMarkets.markets.length > 0 ? 'available' : 'empty_from_provider',
            reason: providerMarkets.markets.length > 0
              ? 'Configured perps market provider returned market data.'
              : 'Configured perps market provider responded but returned no matching markets for the requested filter.',
            agentAction: providerMarkets.markets.length > 0
              ? 'Use these records for professional planning. Before execution, call sap_perp_builder_status to verify whether a hosted unsigned builder is configured.'
              : 'Do not infer that the venue has no markets. Try a broader market filter or check provider status before planning execution.',
          },
          recommendedNextTools: [
            'sap_perp_builder_status',
            'sap_chart_ohlc',
            'sap_chart_volume_profile',
            'sap_perp_trade_plan',
          ],
          executionStatus: getPerpsConfig(context).builderUrl
            ? 'hosted_unsigned_builder_configured'
            : 'analysis_only_no_hosted_builder',
          note: 'Market data came from the configured hosted perps provider, not heuristic account decoding. Execution still requires a typed unsigned builder and local finalization.',
        }, null, 2));
      }

      const adrenaProgramId = getAdrenaProgramId(context);

      // Fetch Custody accounts — these contain per-token price, funding rate, and OI.
      // We use memcmp on the first 8 bytes (Anchor account discriminator).
      const custodyAccounts = await context.connection.getProgramAccounts(adrenaProgramId, {
        filters: [
          { memcmp: { offset: 0, bytes: discToBase58(DISC_CUSTODY) } },
        ],
        commitment: 'confirmed',
      });

      // Fetch Pool accounts — these contain pool configuration and token info.
      const poolAccounts = await context.connection.getProgramAccounts(adrenaProgramId, {
        filters: [
          { memcmp: { offset: 0, bytes: discToBase58(DISC_POOL) } },
        ],
        commitment: 'confirmed',
      });

      const poolInfoByAddress = new Map<string, DecodedAdrenaPool>();
      for (const { pubkey, account } of poolAccounts) {
        const decoded = decodeAdrenaPoolAccount(pubkey, account.data);
        if (decoded) {
          poolInfoByAddress.set(decoded.poolAddress, decoded);
        }
      }

      const markets = custodyAccounts
        .map(({ pubkey, account }) => {
          const poolAddress = account.data.length >= ADRENA_CUSTODY_OFFSETS.pool + 32
            ? readPublicKey(account.data, ADRENA_CUSTODY_OFFSETS.pool)
            : '';
          return decodeAdrenaCustodyAccount(pubkey, account.data, poolInfoByAddress.get(poolAddress));
        })
        .filter((market): market is NonNullable<typeof market> => Boolean(market));

      // Apply market filter if provided.
      const filtered = marketFilter
        ? markets.filter(m => m.symbol.toUpperCase() === marketFilter || m.market.toUpperCase() === marketFilter)
        : markets;
      const scannedAccounts = custodyAccounts.length + poolAccounts.length;
      const dataAvailability = scannedAccounts === 0
        ? {
            status: 'rpc_scan_empty',
            reason: 'No configured perps provider is set and no Adrena Pool/Custody accounts were returned by getProgramAccounts using Anchor account discriminators. On an indexed/full-history RPC this usually means the program ID or account type discriminators are stale, not that perps do not exist.',
            agentAction: 'Do not infer that no perp markets exist and do not retry in a loop. Operator should verify ADRENA_PROGRAM_ID and account discriminators against the current deployed program/IDL, or configure SAP_MCP_PERPS_MARKETS_URL with an IDL-backed provider. Use sap_chart_ohlc/sap_chart_volume_profile for market context, then stop before execution until sap_perp_builder_status says a builder is available.',
          }
        : filtered.length === 0
          ? {
              status: 'decoded_no_matching_markets',
              reason: 'The configured RPC returned Adrena Pool/Custody accounts, but no decoded market matched the requested filter. This is usually a market-filter issue.',
              agentAction: 'Retry once with an empty market filter to inspect all decoded symbols. If markets decode but markPrice is null, use oracle/chart tools for live price and do not pretend custody contains a spot mark price.',
            }
        : {
            status: 'available',
            reason: 'Adrena account scan returned on-chain accounts from the configured RPC.',
            agentAction: 'Use custodyAddress and poolAddress only for analysis. Call sap_perp_builder_status before any execution attempt.',
          };

      return createTextResponse(JSON.stringify({
        source: 'on-chain-rpc',
        markets: filtered,
        count: filtered.length,
        totalCustodies: custodyAccounts.length,
        totalPools: poolAccounts.length,
        scan: {
          programId: adrenaProgramId.toBase58(),
          custodyDiscriminator: discToBase58(DISC_CUSTODY),
          poolDiscriminator: discToBase58(DISC_POOL),
        },
        dataAvailability,
        recommendedNextTools: [
          'sap_perp_builder_status',
          'sap_chart_ohlc',
          'sap_chart_volume_profile',
          'sap_perp_trade_plan',
        ],
        executionStatus: getPerpsConfig(context).builderUrl
          ? 'hosted_unsigned_builder_configured'
          : 'analysis_only_no_hosted_builder',
        priceNote: 'Adrena Custody accounts expose market configuration, OI, funding/accounting, and oracle identifiers. They do not expose a ready-to-use mark price. markPrice is null until SAP MCP adds a typed oracle/feed decoder or configured Adrena data runtime.',
        note: 'Data read directly from Solana on-chain Pool/Custody accounts using the official Adrena release/39 ABI layout. Use custodyAddress and poolAddress for analysis only. Do not execute perps unless SAP MCP exposes a typed unsigned builder or a local signer tool for that exact action.',
      }));
    } catch (err) {
      return createTextResponse(JSON.stringify({
        error: 'Failed to fetch perp markets from Solana RPC',
        message: err instanceof Error ? err.message : 'Unknown error',
      }), { isError: true });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 2: sap_perp_position_info
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerPerpPositionInfoTool
 * @description Register the sap_perp_position_info read-only tool.
 *
 * Reads on-chain Adrena position accounts for a given wallet using
 * `getProgramAccounts` with a memcmp filter on the owner field.
 *
 * @param server  — MCP server instance.
 * @param context — Runtime context with Solana RPC connection.
 *
 * @internal
 */
function registerPerpPositionInfoTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      wallet: {
        type: 'string',
        description: 'Wallet public key (base58) to read positions for.',
      },
    },
    required: ['wallet'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_perp_position_info', {
    description: 'Read all open perpetual positions on Adrena for a given wallet address. Returns position key, market, side, size, collateral, entry price, leverage, unrealized PnL, and liquidation price from the on-chain Position account. markPrice mirrors entryPrice until SAP MCP has a live oracle/feed price decoder. Read-only — uses Solana RPC with PDA derivation (works on public RPC without getProgramAccounts).',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const walletStr = typeof args['wallet'] === 'string' ? args['wallet'] as string : '';
    if (!walletStr) {
      return createTextResponse(JSON.stringify({ error: 'wallet is required' }), { isError: true });
    }

    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(walletStr);
    } catch {
      return createTextResponse(JSON.stringify({ error: 'Invalid wallet address' }), { isError: true });
    }

    try {
      // Derive Position PDAs directly instead of using getProgramAccounts.
      // Public RPC (api.mainnet-beta.solana.com) does not reliably support
      // getProgramAccounts with memcmp filters — returns 0 results even when
      // accounts exist. PDA derivation + getAccountInfo is deterministic and
      // works on any RPC.
      const { derivePositionPda } = await import('../perps/adrena/adrena-pda.js');
      const { ADRENA_CUSTODIES } = await import('../perps/adrena/adrena-constants.js');
      const { PublicKey: PK } = await import('@solana/web3.js');

      // Build all possible position PDAs: each custody x each side (long/short).
      const custodyEntries = Object.entries(ADRENA_CUSTODIES);
      const sides: Array<'long' | 'short'> = ['long', 'short'];
      const pdaChecks: Array<{ pda: PublicKey; custody: string; side: 'long' | 'short'; pool: string }> = [];

      for (const [, custody] of custodyEntries) {
        const poolPk = new PK(custody.pool);
        const custodyPk = new PK(custody.address);
        for (const side of sides) {
          const pda = derivePositionPda(walletPubkey, poolPk, custodyPk, side);
          pdaChecks.push({ pda, custody: custody.symbol, side, pool: custody.pool });
        }
      }

      // Batch fetch all PDAs with getMultipleAccountsInfo.
      const accounts = await context.connection.getMultipleAccountsInfo(
        pdaChecks.map((c) => c.pda),
        'confirmed',
      );

      // Read markets for enrichment.
      const marketsByCustody = await readAdrenaMarketsByCustody(context);

      const positions: PerpPosition[] = [];
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        if (!account || !account.data) continue;
        const check = pdaChecks[i];
        if (!check) continue;

        const position = decodeAdrenaPositionAccount(check.pda, account.data, marketsByCustody);
        if (position) {
          positions.push({
            positionKey: position.positionKey,
            market: position.market,
            side: position.side,
            size: position.size,
            collateral: position.collateral,
            entryPrice: position.entryPrice,
            markPrice: position.entryPrice,
            leverage: position.leverage,
            unrealizedPnl: position.unrealizedPnl,
            liquidationPrice: position.liquidationPrice,
          });
        }
      }

      return createTextResponse(JSON.stringify({
        wallet: walletStr,
        positions,
        count: positions.length,
        scan: {
          method: 'PDA derivation + getMultipleAccountsInfo',
          checkedPdas: pdaChecks.length,
          programId: getAdrenaProgramId(context).toBase58(),
        },
        note: 'Positions are decoded from the official Adrena release/39 Position account layout. markPrice mirrors entryPrice until a live oracle/feed price decoder is available.',
      }));
    } catch (err) {
      return createTextResponse(JSON.stringify({
        error: 'Failed to read on-chain positions',
        message: err instanceof Error ? err.message : 'Unknown error',
      }), { isError: true });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 3: sap_perp_funding_history
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerPerpFundingHistoryTool
 * @description Register the sap_perp_funding_history read-only tool.
 *
 * Computes the current funding rate from on-chain Custody account data.
 * The agent obtains the custody address from `sap_perp_markets` and passes
 * it here. Historical funding rate snapshots are not available on-chain
 * (only the current rate embedded in the custody account); the tool returns
 * the current funding state and a clear error if the custody address is
 * missing or invalid.
 *
 * @param server  — MCP server instance.
 * @param context — Runtime context with Solana RPC connection.
 *
 * @internal
 */
function registerPerpFundingHistoryTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      custodyAddress: {
        type: 'string',
        description: 'Custody account public key (base58). Obtain from sap_perp_markets output — the custodyAddress field.',
      },
      market: {
        type: 'string',
        description: 'Optional market symbol (e.g. "SOL", "BTC") for display purposes.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of funding records to return (default 100). On-chain mode returns the current funding snapshot only.',
        minimum: 1,
        maximum: 1000,
      },
    },
    required: ['custodyAddress'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_perp_funding_history', {
    description: 'Compute the current funding rate for an Adrena perpetual market from on-chain Custody account data. Pass the custodyAddress from sap_perp_markets. Returns current funding rate, cumulative funding, and open interest. Read-only — reads Custody account directly from Solana RPC (on-chain). Note: on-chain data provides the current funding snapshot only, not historical time-series.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const custodyAddressStr = typeof args['custodyAddress'] === 'string' ? args['custodyAddress'] as string : '';
    const market = typeof args['market'] === 'string' ? args['market'] as string : '';

    if (!custodyAddressStr) {
      return createTextResponse(JSON.stringify({
        error: 'custodyAddress is required. Use sap_perp_markets to get the custody address for the desired market.',
      }), { isError: true });
    }

    let custodyPubkey: PublicKey;
    try {
      custodyPubkey = new PublicKey(custodyAddressStr);
    } catch {
      return createTextResponse(JSON.stringify({
        error: 'Invalid custody address',
        custodyAddress: custodyAddressStr,
      }), { isError: true });
    }

    try {
      const accountInfo = await context.connection.getAccountInfo(custodyPubkey, 'confirmed');
      if (!accountInfo) {
        return createTextResponse(JSON.stringify({
          error: 'Custody account not found on-chain',
          custodyAddress: custodyAddressStr,
          message: 'The custody account does not exist or has been closed. Use sap_perp_markets to find valid custody addresses.',
        }), { isError: true });
      }

      const data = accountInfo.data;
      if (data.length < 8 + 32 + 32) {
        return createTextResponse(JSON.stringify({
          error: 'Account data too short to be a valid Custody account',
          custodyAddress: custodyAddressStr,
          dataLength: data.length,
        }), { isError: true });
      }

      // Verify discriminator matches Custody.
      const disc = data.subarray(0, 8);
      if (!disc.equals(DISC_CUSTODY)) {
        return createTextResponse(JSON.stringify({
          error: 'Account discriminator does not match Custody type',
          custodyAddress: custodyAddressStr,
          expectedDisc: Array.from(DISC_CUSTODY),
          actualDisc: Array.from(disc),
          message: 'The provided address is not a Custody account. Use sap_perp_markets to get the correct custodyAddress.',
        }), { isError: true });
      }

      const poolAddress = readPublicKey(data, ADRENA_CUSTODY_OFFSETS.pool);
      const poolsByAddress = new Map<string, DecodedAdrenaPool>();
      const poolInfo = await context.connection.getAccountInfo(new PublicKey(poolAddress), 'confirmed');
      if (poolInfo) {
        const decodedPool = decodeAdrenaPoolAccount(new PublicKey(poolAddress), poolInfo.data);
        if (decodedPool) poolsByAddress.set(poolAddress, decodedPool);
      }
      const decoded = decodeAdrenaCustodyAccount(custodyPubkey, data, poolsByAddress.get(poolAddress));
      if (!decoded) {
        return createTextResponse(JSON.stringify({
          error: 'Unable to decode Adrena Custody account with release/39 ABI layout',
          custodyAddress: custodyAddressStr,
        }), { isError: true });
      }

      const timestamp = Date.now();

      return createTextResponse(JSON.stringify({
        source: 'on-chain-rpc',
        custodyAddress: custodyAddressStr,
        market: market || decoded.market,
        symbol: decoded.symbol,
        poolAddress: decoded.poolAddress,
        custodyMint: decoded.custodyMint,
        oracle: decoded.oracle,
        tradeOracle: decoded.tradeOracle,
        currentFunding: {
          timestamp,
          fundingRateRaw: decoded.funding.currentRateLongToShortRaw,
          cumulativeLongToShortRaw: decoded.funding.cumulativeLongToShortRaw,
          cumulativeShortToLongRaw: decoded.funding.cumulativeShortToLongRaw,
          maxHourlyFundingRateRaw: decoded.funding.maxHourlyFundingRateRaw,
          fundingLastUpdate: decoded.funding.lastUpdate,
          markPrice: decoded.markPrice,
          markPriceSource: decoded.markPriceSource,
          openInterestLong: decoded.openInterestLong,
          openInterestShort: decoded.openInterestShort,
        },
        records: [{
          timestamp,
          fundingRateRaw: decoded.funding.currentRateLongToShortRaw,
          cumulativeLongToShortRaw: decoded.funding.cumulativeLongToShortRaw,
          cumulativeShortToLongRaw: decoded.funding.cumulativeShortToLongRaw,
        }],
        count: 1,
        note: 'On-chain Adrena Custody data provides the current funding/accounting snapshot only. Historical time-series funding data is not available via Solana RPC; use repeated snapshots or an indexed Adrena data runtime for history.',
      }));
    } catch (err) {
      return createTextResponse(JSON.stringify({
        error: 'Failed to read funding data from on-chain custody account',
        custodyAddress: custodyAddressStr,
        message: err instanceof Error ? err.message : 'Unknown error',
      }), { isError: true });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 7: sap_perp_liquidation_zones
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerPerpLiquidationZonesTool
 * @description Register the sap_perp_liquidation_zones read-only tool.
 *
 * Reads on-chain Adrena positions for a wallet and computes liquidation
 * zones from account geometry. Live current price requires a separate
 * oracle/feed decoder.
 *
 * @param server  — MCP server instance.
 * @param context — Runtime context with Solana RPC connection.
 *
 * @internal
 */
function registerPerpLiquidationZonesTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      wallet: {
        type: 'string',
        description: 'Wallet public key (base58) to compute liquidation zones for.',
      },
    },
    required: ['wallet'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_perp_liquidation_zones', {
    description: 'Compute liquidation zones for all open Adrena perp positions of a wallet. Reads on-chain positions via Solana RPC and calculates liquidation geometry from entry price, leverage, and liquidation price. currentPrice mirrors entryPrice until SAP MCP has a live oracle/feed price decoder. Read-only.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const walletStr = typeof args['wallet'] === 'string' ? args['wallet'] as string : '';
    if (!walletStr) {
      return createTextResponse(JSON.stringify({ error: 'wallet is required' }), { isError: true });
    }

    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(walletStr);
    } catch {
      return createTextResponse(JSON.stringify({ error: 'Invalid wallet address' }), { isError: true });
    }

    try {
      // Derive Position PDAs directly (same fix as sap_perp_position_info).
      const { derivePositionPda } = await import('../perps/adrena/adrena-pda.js');
      const { ADRENA_CUSTODIES } = await import('../perps/adrena/adrena-constants.js');
      const { PublicKey: PK } = await import('@solana/web3.js');

      const custodyEntries = Object.entries(ADRENA_CUSTODIES);
      const sides: Array<'long' | 'short'> = ['long', 'short'];
      const pdaChecks: Array<{ pda: PublicKey }> = [];

      for (const [, custody] of custodyEntries) {
        const poolPk = new PK(custody.pool);
        const custodyPk = new PK(custody.address);
        for (const side of sides) {
          pdaChecks.push({ pda: derivePositionPda(walletPubkey, poolPk, custodyPk, side) });
        }
      }

      const accounts = await context.connection.getMultipleAccountsInfo(
        pdaChecks.map((c) => c.pda),
        'confirmed',
      );

      const marketsByCustody = await readAdrenaMarketsByCustody(context);
      const zones: LiquidationZone[] = [];
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        if (!account || !account.data) continue;
        const check = pdaChecks[i];
        if (!check) continue;

        const position = decodeAdrenaPositionAccount(check.pda, account.data, marketsByCustody);
        if (!position) continue;

        const currentPrice = position.entryPrice;
        const distanceToLiquidationPct = position.liquidationPrice > 0 && currentPrice > 0
          ? Math.abs((currentPrice - position.liquidationPrice) / currentPrice) * 100
          : 0;

        zones.push({
          positionKey: position.positionKey,
          market: position.market,
          side: position.side,
          liquidationPrice: position.liquidationPrice,
          currentPrice,
          distanceToLiquidationPct,
          leverage: position.leverage,
        });
      }

      return createTextResponse(JSON.stringify({
        wallet: walletStr,
        zones,
        count: zones.length,
        scan: {
          method: 'PDA derivation + getMultipleAccountsInfo',
          checkedPdas: pdaChecks.length,
          programId: getAdrenaProgramId(context).toBase58(),
        },
        note: 'Liquidation zones use entryPrice as currentPrice until SAP MCP has a live Adrena oracle/feed price decoder. Treat the output as risk geometry, not a liquidation alert feed.',
      }));
    } catch (err) {
      return createTextResponse(JSON.stringify({
        error: 'Failed to read on-chain positions for liquidation zones',
        message: err instanceof Error ? err.message : 'Unknown error',
      }), { isError: true });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 8: sap_perp_trade_plan
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerPerpTradePlanTool
 * @description Register the professional perps planning tool.
 *
 * This tool does not build a transaction. It turns an intent into a compact
 * risk, sizing, and execution checklist so agents can act like traders while
 * avoiding fake or incomplete unsigned transaction builders.
 *
 * @param server — MCP server instance.
 *
 * @internal
 */
function registerPerpTradePlanTool(server: Server): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      market: {
        type: 'string',
        description: 'Perp market symbol or pair, for example SOL-PERP, BTC-PERP, or ETH-PERP.',
      },
      side: {
        type: 'string',
        description: 'Intended direction for the trade.',
        enum: ['long', 'short'],
      },
      collateralAmountUsd: {
        type: 'number',
        description: 'Collateral to allocate in USD. This is the margin budget, not notional size.',
        minimum: 0,
      },
      leverage: {
        type: 'number',
        description: 'Requested leverage multiplier. Keep conservative unless user policy explicitly allows more.',
        minimum: 1,
        maximum: 100,
      },
      entryPrice: {
        type: 'number',
        description: 'Reference entry price in USD used for risk math. Required. Get the current price from sap_adrena_get_trading_prices or sap_adrena_get_prices before calling this tool.',
        minimum: 0,
      },
      stopLossPrice: {
        type: 'number',
        description: 'Optional stop loss price in USD. Strongly recommended before execution.',
        minimum: 0,
      },
      takeProfitPrice: {
        type: 'number',
        description: 'Optional take profit price in USD used to compute reward/risk.',
        minimum: 0,
      },
      maxAccountRiskPct: {
        type: 'number',
        description: 'Maximum account risk percentage allowed by local policy. Default 1%.',
        minimum: 0,
        maximum: 100,
      },
      maxSlippageBps: {
        type: 'number',
        description: 'Maximum execution slippage in basis points. Default 50 bps.',
        minimum: 0,
        maximum: 10_000,
      },
      timeframe: {
        type: 'string',
        description: 'Trading horizon such as scalp, intraday, swing, or hedge.',
      },
      notes: {
        type: 'string',
        description: 'Optional user notes, catalyst, invalidation thesis, or strategy context.',
      },
    },
    required: ['market', 'side', 'collateralAmountUsd', 'leverage', 'entryPrice'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_perp_trade_plan', {
    description: 'Create a trader-grade perpetual futures plan from a simple intent. Returns notional size, stop risk, reward/risk, liquidation estimate, preflight checklist, and the exact SAP MCP read tools to call next. This is analysis-only: SAP MCP does not expose Adrena execution builders until they are IDL-backed and locally finalizable. Required fields: market, side, collateralAmountUsd, leverage, entryPrice. Get entryPrice from sap_adrena_get_trading_prices or sap_adrena_get_prices before calling this tool.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const market = String(args['market'] ?? '').trim().toUpperCase();
    const side = args['side'] === 'short' ? 'short' : 'long';
    const collateralAmountUsd = typeof args['collateralAmountUsd'] === 'number' ? args['collateralAmountUsd'] : 0;
    const leverage = typeof args['leverage'] === 'number' ? args['leverage'] : 1;
    const entryPrice = typeof args['entryPrice'] === 'number' ? args['entryPrice'] : 0;
    const stopLossPrice = typeof args['stopLossPrice'] === 'number' ? args['stopLossPrice'] : null;
    const takeProfitPrice = typeof args['takeProfitPrice'] === 'number' ? args['takeProfitPrice'] : null;
    const maxAccountRiskPct = typeof args['maxAccountRiskPct'] === 'number' ? args['maxAccountRiskPct'] : 1;
    const maxSlippageBps = typeof args['maxSlippageBps'] === 'number' ? args['maxSlippageBps'] : 50;

    if (!market || collateralAmountUsd <= 0 || leverage <= 0 || entryPrice <= 0) {
      return createTextResponse(JSON.stringify({
        error: 'market, collateralAmountUsd, leverage, and entryPrice are required and must be positive.',
      }), { isError: true });
    }

    const notionalUsd = collateralAmountUsd * leverage;
    const stopMovePct = stopLossPrice && stopLossPrice > 0
      ? Math.abs((entryPrice - stopLossPrice) / entryPrice) * 100
      : null;
    const takeProfitMovePct = takeProfitPrice && takeProfitPrice > 0
      ? Math.abs((takeProfitPrice - entryPrice) / entryPrice) * 100
      : null;
    const estimatedStopRiskUsd = stopMovePct === null ? null : notionalUsd * (stopMovePct / 100);
    const estimatedRewardUsd = takeProfitMovePct === null ? null : notionalUsd * (takeProfitMovePct / 100);
    const rewardRisk = estimatedStopRiskUsd && estimatedRewardUsd
      ? estimatedRewardUsd / estimatedStopRiskUsd
      : null;
    const liquidationEstimate = side === 'long'
      ? entryPrice * (1 - (1 / leverage))
      : entryPrice * (1 + (1 / leverage));

    const riskFlags: string[] = [];
    if (!stopLossPrice) riskFlags.push('missing_stop_loss');
    if (estimatedStopRiskUsd !== null && estimatedStopRiskUsd > collateralAmountUsd * (maxAccountRiskPct / 100)) {
      riskFlags.push('stop_risk_exceeds_policy');
    }
    if (leverage > 10) riskFlags.push('high_leverage_requires_explicit_user_confirmation');
    if (maxSlippageBps > 100) riskFlags.push('slippage_above_1_percent');

    return createTextResponse(JSON.stringify({
      market,
      side,
      executionStatus: 'analysis_only',
      collateralAmountUsd,
      leverage,
      notionalUsd,
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      maxAccountRiskPct,
      maxSlippageBps,
      liquidationEstimate,
      estimatedStopRiskUsd,
      estimatedRewardUsd,
      rewardRisk,
      riskFlags,
      professionalChecklist: [
        'Call sap_perp_markets for current market/custody data before execution.',
        'Call sap_chart_ohlc and sap_chart_volume_profile to validate trend, liquidity, POC, VAH, and VAL.',
        'Call sap_perp_position_info and sap_perp_liquidation_zones for the user wallet before increasing exposure.',
        'Show the user one compact preview: side, notional, margin, leverage, stop, take profit, liquidation estimate, slippage, and risk flags.',
        'Use native Adrena UI/SDK or a future SAP MCP IDL-backed builder for execution. Do not create temporary signing scripts or hand-roll Adrena transactions.',
      ],
      recommendedReadTools: [
        'sap_perp_markets',
        'sap_chart_ohlc',
        'sap_chart_volume_profile',
        'sap_perp_position_info',
        'sap_perp_liquidation_zones',
      ],
      executionWarning: 'SAP MCP intentionally does not expose manual Adrena execution builders. Execution must use a complete IDL-backed route before local finalization. If a hosted direct Adrena signer tool returns hosted_local_signer_required, do not route it through sap_payments_call_paid_tool; no x402 fee should be charged and there is no unsigned transaction to finalize.',
      notes: typeof args['notes'] === 'string' ? args['notes'] : undefined,
    }, null, 2));
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 9: sap_perp_builder_status
 * ═══════════════════════════════════════════════════════════════════ */

function registerPerpBuilderStatusTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      venue: {
        type: 'string',
        description: 'Optional perp venue to check, for example "adrena" or "sap-perps-provider".',
      },
    },
    additionalProperties: false,
  };

  registerTool(server, 'sap_perp_builder_status', {
    description: 'Free readiness check for perps execution. Returns whether SAP MCP has native Adrena perps builders (available since 0.9.38) or a configured hosted unsigned transaction builder. If builderAvailable is false, agents must stop before execution and must not route direct signer-only perps tools through x402 paid-call replay.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const perps = getPerpsConfig(context);
    const venue = typeof args['venue'] === 'string' ? args['venue'] : 'configured-perps-provider';

    return createTextResponse(JSON.stringify({
      venue,
      marketsProviderConfigured: Boolean(perps.marketsUrl),
      positionsProviderConfigured: Boolean(perps.positionsUrl),
      builderAvailable: true,
      adrenaProgramId: perps.adrenaProgramId,
      rpcScanMode: 'anchor-discriminator-getProgramAccounts',
      scanDiscriminators: {
        pool: discToBase58(DISC_POOL),
        custody: discToBase58(DISC_CUSTODY),
        position: discToBase58(DISC_POSITION),
      },
      builderMode: perps.builderUrl ? 'hosted_unsigned_transaction_builder' : 'not_configured',
      nativeAdrenaDecoder: {
        available: true,
        source: 'official Adrena release/39 ABI layout',
        sdkPackage: 'adrena-sdk@beta (types only, no runtime JS — using vendored IDL with @coral-xyz/anchor instead)',
      },
      nativeAdrenaBuilder: {
        available: true,
        source: 'vendored Adrena IDL (release/39) + @coral-xyz/anchor',
        operations: [
          'sap_adrena_build_open_long',
          'sap_adrena_build_open_short',
          'sap_adrena_build_close_long',
          'sap_adrena_build_close_short',
          'sap_adrena_build_set_stop_loss',
          'sap_adrena_build_set_take_profit',
          'sap_adrena_build_cancel_stop_loss',
          'sap_adrena_build_cancel_take_profit',
          'sap_adrena_build_add_limit_order',
          'sap_adrena_build_cancel_limit_order',
          'sap_adrena_build_open_commodity_long',
          'sap_adrena_build_open_commodity_short',
          'sap_adrena_build_close_commodity_long',
          'sap_adrena_build_close_commodity_short',
          'sap_adrena_build_add_liquidity',
          'sap_adrena_build_remove_liquidity',
          'sap_adrena_build_swap',
          'sap_adrena_build_init_user_staking',
          'sap_adrena_build_add_liquid_stake',
          'sap_adrena_build_remove_liquid_stake',
          'sap_adrena_build_add_locked_stake',
          'sap_adrena_build_claim_stakes',
        ],
        dataApi: [
          'sap_adrena_get_positions',
          'sap_adrena_get_pool_info',
          'sap_adrena_get_custody_info',
          'sap_adrena_get_trader_info',
          'sap_adrena_get_trader_leaderboard',
          'sap_adrena_get_mutagen',
          'sap_adrena_get_mutagen_leaderboard',
          'sap_adrena_get_prices',
          'sap_adrena_get_trading_prices',
          'sap_adrena_get_position_status',
        ],
        signerPolicy: 'All builder tools return unsigned base64 transactions. Sign locally via sap_payments_finalize_transaction. SAP MCP never signs user-owned Adrena transactions.',
      },
      signerPolicy: 'Use sap_adrena_build_* tools to construct unsigned transactions, then sign locally with sap_payments_finalize_transaction.',
      paymentPolicy: 'Adrena builder tools (sap_adrena_build_*) are paid builder calls at $0.006 each. Data API tools (sap_adrena_get_*) are micro-read at $0.001 each. Finalization via sap_payments_finalize_transaction is free.',
      nextAction: 'Use sap_adrena_get_pool_info + sap_adrena_get_trading_prices for market data, then sap_adrena_build_open_long (or short), then sap_payments_finalize_transaction with submit:true after user confirmation.',
    }, null, 2));
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Optional Tool 10: sap_perp_build_order_transaction
 * ═══════════════════════════════════════════════════════════════════ */

function registerPerpOrderBuilderTool(server: Server, context: SapMcpContext): boolean {
  const perps = getPerpsConfig(context);
  if (!perps.builderUrl) {
    return false;
  }

  const schema: JsonSchema = {
    type: 'object',
    properties: {
      venue: {
        type: 'string',
        description: 'Perps venue supported by the configured builder, for example "adrena".',
      },
      owner: {
        type: 'string',
        description: 'User wallet public key that will sign and own the perp order/position.',
      },
      market: {
        type: 'string',
        description: 'Market symbol or provider market id, for example SOL-PERP.',
      },
      side: {
        type: 'string',
        description: 'Trade side for the order.',
        enum: ['long', 'short'],
      },
      orderType: {
        type: 'string',
        description: 'Order type supported by the provider. Use "market" unless the provider explicitly supports limit/trigger orders.',
        enum: ['market', 'limit', 'trigger'],
      },
      collateralMint: {
        type: 'string',
        description: 'Collateral token mint. Use USDC mint for USDC-margined perps unless the provider says otherwise.',
      },
      collateralAmount: {
        type: 'string',
        description: 'Collateral amount in smallest token units, for example micro-USDC for USDC.',
      },
      leverage: {
        type: 'number',
        description: 'Requested leverage multiplier after local policy checks.',
        minimum: 1,
        maximum: 100,
      },
      slippageBps: {
        type: 'number',
        description: 'Maximum slippage in basis points. Keep <= 100 unless user explicitly confirms higher risk.',
        minimum: 0,
        maximum: 10_000,
      },
      reduceOnly: {
        type: 'boolean',
        description: 'Set true only for reduce-only close/reduce flows.',
      },
      limitPrice: {
        type: 'number',
        description: 'Optional limit or trigger price in USD when orderType is limit or trigger.',
        minimum: 0,
      },
      clientOrderId: {
        type: 'string',
        description: 'Optional client id for idempotency/audit. Generate once and reuse on retries.',
      },
    },
    required: ['owner', 'market', 'side', 'orderType', 'collateralMint', 'collateralAmount', 'leverage'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_perp_build_order_transaction', {
    description: 'Build an unsigned perps order transaction using the configured hosted perps builder. This tool is registered only when SAP_MCP_PERPS_BUILDER_URL is configured. It must return an unsigned Solana transaction for local finalization; SAP MCP never signs user-owned perps transactions on hosted.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const payload = await timedFetch<PerpBuilderProviderPayload>(perps.builderUrl!, {
      method: 'POST',
      headers: perpsProviderHeaders(),
      body: JSON.stringify({
        ...args,
        requestedBy: 'sap-mcp-hosted',
        signerPolicy: 'local-finalization-required',
      }),
      timeoutMs: perps.timeoutMs,
    });

    const transactionBase64 = payload?.transactionBase64
      ?? payload?.unsignedTransactionBase64
      ?? payload?.transaction;

    if (!payload || typeof transactionBase64 !== 'string' || transactionBase64.length === 0) {
      return createTextResponse(JSON.stringify({
        error: 'perps_builder_invalid_response',
        message: 'Configured perps builder did not return transactionBase64/unsignedTransactionBase64. Execution stopped before local signing.',
        expectedNextStep: 'Fix SAP_MCP_PERPS_BUILDER_URL provider response. Do not create temporary signing scripts or hand-roll perps transactions.',
      }, null, 2), { isError: true });
    }

    return createTextResponse(JSON.stringify({
      success: true,
      venue: args['venue'] ?? 'configured-perps-provider',
      transactionBase64,
      lastValidBlockHeight: payload.lastValidBlockHeight,
      blockhash: payload.blockhash,
      feePayer: payload.feePayer,
      provider: payload.provider ?? 'configured-perps-builder',
      signerPolicy: 'local-finalization-required',
      nextTool: 'sap_payments_finalize_transaction',
      finalizeArgs: {
        transactionBase64,
        submit: false,
      },
      warnings: payload.warnings,
    }, null, 2));
  });

  return true;
}


/* ═══════════════════════════════════════════════════════════════════
 *  Main registration function
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerPerpTools
 * @description Register perp trading analytics, planning, and optional execution-builder tools.
 *
 * @param server  — MCP server instance.
 * @param context — Shared runtime context with SAP client, connection, and config.
 *
 * @usedBy `register-tools.ts`
 */
export function registerPerpTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering perp trading analytics and planning tools');

  registerPerpMarketsTool(server, context);
  registerPerpPositionInfoTool(server, context);
  registerPerpFundingHistoryTool(server, context);
  registerChartOhlcTool(server, context);
  registerChartLongTermTool(server, context);
  registerChartVolumeProfileTool(server, context);
  registerChartMultiOhlcTool(server, context);
  registerChartIndicatorsTool(server, context);
  registerPerpLiquidationZonesTool(server, context);
  registerPerpTradePlanTool(server);
  registerPerpBuilderStatusTool(server, context);
  const builderRegistered = registerPerpOrderBuilderTool(server, context);

  logger.debug('Perp tools registered', { count: builderRegistered ? 10 : 9, builderRegistered });
}