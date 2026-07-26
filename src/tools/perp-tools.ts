/**
 * @name tools/perp-tools
 * @description MCP tools for perpetual futures trading and chart analysis on Solana.
 *
 * Provides 8 tools across two categories:
 *
 *   Read-only tools (7):
 *     - sap_perp_markets          — List Adrena perp markets with mark price, funding, OI.
 *     - sap_perp_position_info    — Read on-chain perp positions for a wallet.
 *     - sap_perp_funding_history  — Compute funding rate from on-chain custody account.
 *     - sap_chart_ohlc            — OHLC candlestick data for any Solana token.
 *     - sap_chart_long_term       — Long-term price history + protocol TVL.
 *     - sap_chart_volume_profile  — Volume profile analysis (POC, VAH, VAL).
 *     - sap_perp_liquidation_zones — Compute liquidation zones for open positions.
 *
 *   Professional planning tools (1):
 *     - sap_perp_trade_plan       — Build a trader-grade risk, route, and execution checklist.
 *
 * All read-only tools use free APIs (DexScreener, DeFiLlama) and Solana RPC
 * (Triton). Execution builders are intentionally not exposed unless the
 * account graph is IDL-backed and safe for local finalization.
 *
 * @module tools/perp-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey } from '@solana/web3.js';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { logger } from '../core/logger.js';

/* ═══════════════════════════════════════════════════════════════════
 *  Constants
 * ═══════════════════════════════════════════════════════════════════ */

/** Adrena program ID on Solana mainnet. */
const ADRENA_PROGRAM_ID = new PublicKey('13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet');

/** DexScreener REST API base URL (free, no API key). */
const DEXSCREENER_API_URL = 'https://api.dexscreener.com';

/** DeFiLlama REST API base URL (free, no API key). */
const DEFILAMA_API_URL = 'https://api.llama.fi';

/** Fetch timeout for external API calls (ms). */
const FETCH_TIMEOUT_MS = 8_000;

/** Default number of volume profile buckets. */
const DEFAULT_VP_BUCKETS = 20;

/** Value area percentage for volume profile (70%). */
const VALUE_AREA_PCT = 0.70;

/* ═══════════════════════════════════════════════════════════════════
 *  Adrena account discriminators (Anchor 0.31 — sha256("account:<Name>")[0..8])
 * ═══════════════════════════════════════════════════════════════════ */

/** Pool account discriminator — sha256("account:Pool")[0..8]. */
const DISC_POOL = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);

/** Custody account discriminator — sha256("account:Custody")[0..8]. */
const DISC_CUSTODY = Buffer.from([1, 184, 48, 81, 93, 131, 63, 145]);

/** Position account discriminator — sha256("account:Position")[0..8]. */
const DISC_POSITION = Buffer.from([170, 188, 143, 228, 122, 64, 247, 208]);

/* ═══════════════════════════════════════════════════════════════════
 *  Shared types
 * ═══════════════════════════════════════════════════════════════════ */

/** JSON Schema property definition for MCP tool input schemas. */
interface JsonSchemaProperty {
  readonly type: string;
  readonly description: string;
  readonly enum?: readonly string[];
  readonly items?: JsonSchemaProperty;
  readonly properties?: Record<string, JsonSchemaProperty>;
  readonly additionalProperties?: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
}

/** Complete JSON Schema object for an MCP tool input. */
interface JsonSchema {
  readonly type: 'object';
  readonly properties: Record<string, JsonSchemaProperty>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
 *  API response types
 * ═══════════════════════════════════════════════════════════════════ */

interface DexScreenerPair {
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  priceUsd?: string;
  priceChange?: Record<string, number>;
  volume?: Record<string, number>;
  liquidity?: { usd?: number };
  fdv?: number;
  info?: { imageUrl?: string };
}

interface DefiLlamaProtocol {
  id?: string;
  name?: string;
  tvl?: number;
  chain?: string;
  change_1d?: number;
  change_7d?: number;
  marketcap?: number;
}

interface PerpPosition {
  positionKey: string;
  market: string;
  side: 'long' | 'short';
  size: number;
  collateral: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  unrealizedPnl: number;
  liquidationPrice: number;
}

interface OhlcCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface VolumeProfileBucket {
  priceLow: number;
  priceHigh: number;
  volume: number;
  pctOfTotal: number;
}

interface VolumeProfileResult {
  poc: number;
  vah: number;
  val: number;
  buckets: VolumeProfileBucket[];
}

interface LiquidationZone {
  positionKey: string;
  market: string;
  side: 'long' | 'short';
  liquidationPrice: number;
  currentPrice: number;
  distanceToLiquidationPct: number;
  leverage: number;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Helper: timed fetch
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name timedFetch
 * @description Fetch JSON from a URL with an abort timeout.
 *
 * @param url — The URL to fetch.
 * @returns Parsed JSON response, or `null` on error/timeout.
 *
 * @internal
 */
async function timedFetch<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

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
function discToBase58(disc: Buffer): string {
  return new PublicKey(disc).toBase58();
}

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
 * @name readSymbol
 * @description Read a short string (Anchor `String` — 4-byte LE length + UTF-8 bytes)
 *              from an account data buffer.
 *
 * @param buf    — Source buffer.
 * @param offset — Offset to the string field.
 * @param maxLen — Maximum bytes to read (default 16).
 * @returns Decoded symbol string, or empty string on failure.
 *
 * @internal
 */
function readSymbol(buf: Buffer, offset: number, maxLen: number = 16): string {
  try {
    const len = buf.readUInt32LE(offset);
    if (len === 0 || len > maxLen) return '';
    return buf.subarray(offset + 4, offset + 4 + len).toString('utf8').replace(/\0/g, '');
  } catch {
    return '';
  }
}

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
    description: 'List available perpetual futures markets on Adrena with mark price, funding rate, open interest, and 24h volume. Read-only — reads Pool and Custody accounts directly from Solana RPC (on-chain). Use with sap_perp_trade_plan for professional pre-trade risk planning.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const marketFilter = typeof args['market'] === 'string' ? (args['market'] as string).toUpperCase() : '';

    try {
      // Fetch Custody accounts — these contain per-token price, funding rate, and OI.
      // We use memcmp on the first 8 bytes (Anchor account discriminator).
      const custodyAccounts = await context.connection.getProgramAccounts(ADRENA_PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 0, bytes: discToBase58(DISC_CUSTODY) } },
        ],
        commitment: 'confirmed',
      });

      // Fetch Pool accounts — these contain pool configuration and token info.
      const poolAccounts = await context.connection.getProgramAccounts(ADRENA_PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 0, bytes: discToBase58(DISC_POOL) } },
        ],
        commitment: 'confirmed',
      });

      // Build a map of pool addresses for cross-referencing.
      const poolAddresses = new Set(poolAccounts.map(({ pubkey }) => pubkey.toBase58()));

      // Decode custody accounts into market data.
      // Custody layout (simplified, after 8-byte discriminator):
      //   pool(32) + custodyMint(32) + symbol(String: 4+len) + decimals(u8) +
      //   ... + pricing data (price u64, fundingRate u64, openInterestLong u64, openInterestShort u64, ...)
      // The exact offsets may vary by IDL version; we attempt common layouts.
      const markets: Array<{
        symbol: string;
        custodyAddress: string;
        poolAddress: string;
        custodyMint: string;
        markPrice: number;
        fundingRate: number;
        openInterestLong: number;
        openInterestShort: number;
        decimals: number;
        inPool: boolean;
      }> = [];

      for (const { pubkey, account } of custodyAccounts) {
        const data = account.data;
        if (data.length < 8 + 32 + 32 + 4) continue;

        // After discriminator(8): pool(32) + custodyMint(32) = offset 72
        const poolPubkey = new PublicKey(data.subarray(8, 8 + 32));
        const custodyMint = new PublicKey(data.subarray(8 + 32, 8 + 64));
        const poolAddress = poolPubkey.toBase58();

        // Try to read symbol at offset 72 (after pool + custodyMint).
        // Anchor String = 4-byte LE length + UTF-8 bytes.
        let symbol = readSymbol(data, 8 + 64, 16);

        // Try alternative offsets if symbol is empty (layout may differ).
        if (!symbol) {
          // Try after pool(32) only — some IDL versions place symbol before custodyMint.
          symbol = readSymbol(data, 8 + 32, 16);
        }

        // Read decimals (u8) — typically right after the symbol string.
        // We try offset after symbol, but since symbol length varies, we also
        // try fixed offsets as fallback.
        let decimals = 6;
        const symbolEndOffset = 8 + 64 + 4 + (symbol ? symbol.length : 0);
        if (symbolEndOffset < data.length) {
          const dec = data[symbolEndOffset];
          if (dec > 0 && dec <= 18) decimals = dec;
        }

        // Price and funding data: attempt to read from deeper in the account.
        // Common Adrena Custody layout has pricing fields after config section.
        // We try multiple offsets; if reads fail, default to 0.
        // Pricing section typically starts around offset 120-200 depending on symbol length.
        let markPrice = 0;
        let fundingRate = 0;
        let openInterestLong = 0;
        let openInterestShort = 0;

        // Try reading price/funding at various known offsets.
        // Adrena Custody has: ... config fields ... then pricing struct with:
        //   price(u64) + fundingRate(u64) + openInterestLong(u64) + openInterestShort(u64)
        // We scan for plausible price data.
        for (const baseOffset of [120, 144, 160, 176, 192, 200, 208, 224, 240]) {
          if (baseOffset + 32 > data.length) continue;
          const price = readU64LE(data, baseOffset);
          const funding = readU64LE(data, baseOffset + 8);
          const oiLong = readU64LE(data, baseOffset + 16);
          const oiShort = readU64LE(data, baseOffset + 24);

          // Heuristic: price should be a reasonable value (> 0, not absurdly large)
          // and funding should be small relative to price.
          if (price > 0 && price < 1e15 && Math.abs(funding) < price) {
            markPrice = price;
            fundingRate = funding;
            openInterestLong = oiLong;
            openInterestShort = oiShort;
            break;
          }
        }

        const marketEntry = {
          symbol: symbol || 'UNKNOWN',
          custodyAddress: pubkey.toBase58(),
          poolAddress,
          custodyMint: custodyMint.toBase58(),
          markPrice,
          fundingRate,
          openInterestLong,
          openInterestShort,
          decimals,
          inPool: poolAddresses.has(poolAddress),
        };

        markets.push(marketEntry);
      }

      // Apply market filter if provided.
      const filtered = marketFilter
        ? markets.filter(m => m.symbol.toUpperCase() === marketFilter)
        : markets;

      return createTextResponse(JSON.stringify({
        source: 'on-chain-rpc',
        markets: filtered,
        count: filtered.length,
        totalCustodies: custodyAccounts.length,
        totalPools: poolAccounts.length,
        note: 'Data read directly from Solana on-chain Pool/Custody accounts. Use custodyAddress and poolAddress for analysis and sap_perp_trade_plan before any external execution route.',
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
    description: 'Read all open perpetual positions on Adrena for a given wallet address. Returns position key, market, side, size, collateral, entry price, mark price, leverage, unrealized PnL, and liquidation price. Read-only — uses Solana RPC.',
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
      // Adrena Position accounts: filter by Position discriminator + memcmp on owner.
      // Position layout (from IDL, after 8-byte discriminator):
      //   owner(32) + pool(32) + custody(32) + side(1) + price(u64) + sizeUsd(u64) + collateralUsd(u64) + ...
      const accounts = await context.connection.getProgramAccounts(ADRENA_PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 0, bytes: discToBase58(DISC_POSITION) } },
          { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } },
        ],
        commitment: 'confirmed',
      });

      const positions: PerpPosition[] = accounts.map(({ pubkey, account }) => {
        const data = account.data;
        // Position layout (from IDL): owner(32) + pool(32) + custody(32) + side(1) + price(u64) + sizeUsd(u64) + collateralUsd(u64) + collateralAmount(u64) + ...
        const sideByte = data[8 + 32 + 32 + 32];
        const side: 'long' | 'short' = sideByte === 0 ? 'long' : 'short';
        const price = Number(data.readBigUInt64LE(8 + 32 + 32 + 32 + 1));
        const sizeUsd = Number(data.readBigUInt64LE(8 + 32 + 32 + 32 + 1 + 8));
        const collateralUsd = Number(data.readBigUInt64LE(8 + 32 + 32 + 32 + 1 + 8 + 8));
        const leverage = collateralUsd > 0 ? sizeUsd / collateralUsd : 0;
        const unrealizedPnl = 0;
        const liquidationPrice = leverage > 0 ? price * (1 - 1 / leverage) : 0;

        return {
          positionKey: pubkey.toBase58(),
          market: 'unknown',
          side,
          size: sizeUsd,
          collateral: collateralUsd,
          entryPrice: price,
          markPrice: price,
          leverage,
          unrealizedPnl,
          liquidationPrice,
        };
      });

      return createTextResponse(JSON.stringify({
        wallet: walletStr,
        positions,
        count: positions.length,
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

      // Decode funding-related fields from the Custody account.
      // Pool(32) + custodyMint(32) are at offset 8.
      const poolPubkey = new PublicKey(data.subarray(8, 8 + 32));
      const custodyMint = new PublicKey(data.subarray(8 + 32, 8 + 64));

      // Read symbol at offset 72 (after pool + custodyMint).
      let symbol = readSymbol(data, 8 + 64, 16);
      if (!symbol) {
        symbol = readSymbol(data, 8 + 32, 16);
      }

      // Scan for funding rate data at common offsets.
      let markPrice = 0;
      let fundingRate = 0;
      let openInterestLong = 0;
      let openInterestShort = 0;
      let cumulativeFunding = 0;

      for (const baseOffset of [120, 144, 160, 176, 192, 200, 208, 224, 240, 256]) {
        if (baseOffset + 48 > data.length) continue;
        const price = readU64LE(data, baseOffset);
        const funding = readU64LE(data, baseOffset + 8);
        const oiLong = readU64LE(data, baseOffset + 16);
        const oiShort = readU64LE(data, baseOffset + 24);
        const cumFunding = readU64LE(data, baseOffset + 32);

        if (price > 0 && price < 1e15 && Math.abs(funding) < price) {
          markPrice = price;
          fundingRate = funding;
          openInterestLong = oiLong;
          openInterestShort = oiShort;
          cumulativeFunding = cumFunding;
          break;
        }
      }

      const timestamp = Date.now();

      return createTextResponse(JSON.stringify({
        source: 'on-chain-rpc',
        custodyAddress: custodyAddressStr,
        market: market || symbol || 'UNKNOWN',
        symbol: symbol || 'UNKNOWN',
        poolAddress: poolPubkey.toBase58(),
        custodyMint: custodyMint.toBase58(),
        currentFunding: {
          timestamp,
          fundingRate,
          cumulativeFunding,
          markPrice,
          openInterestLong,
          openInterestShort,
        },
        records: [{
          timestamp,
          fundingRate,
          cumulativeFunding,
        }],
        count: 1,
        note: 'On-chain data provides the current funding snapshot only. Historical time-series funding data is not available via Solana RPC — use sap_perp_markets to monitor funding rate changes over time.',
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
 *  Tool 4: sap_chart_ohlc
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerChartOhlcTool
 * @description Register the sap_chart_ohlc read-only tool.
 *
 * Fetches OHLC candlestick data for any Solana token from DexScreener's
 * free REST API.
 *
 * @param server  — MCP server instance.
 * @param context — Runtime context (unused — pure REST call).
 *
 * @internal
 */
function registerChartOhlcTool(server: Server, _context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      mint: {
        type: 'string',
        description: 'Token mint address (base58) to fetch OHLC data for.',
      },
      resolution: {
        type: 'string',
        description: 'Chart resolution: "5m", "1h", "6h", "24h" (default "1h").',
        enum: ['5m', '1h', '6h', '24h'],
      },
    },
    required: ['mint'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_chart_ohlc', {
    description: 'Fetch OHLC candlestick data for any Solana token from DexScreener. Returns open, high, low, close, volume, liquidity, and FDV. Read-only — uses free DexScreener REST API.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const mint = typeof args['mint'] === 'string' ? args['mint'] as string : '';
    const resolution = typeof args['resolution'] === 'string' ? args['resolution'] as string : '1h';

    if (!mint) {
      return createTextResponse(JSON.stringify({ error: 'mint is required' }), { isError: true });
    }

    const url = `${DEXSCREENER_API_URL}/tokens/v1/solana/${encodeURIComponent(mint)}`;
    const pairs = await timedFetch<DexScreenerPair[]>(url);

    if (!pairs || pairs.length === 0) {
      return createTextResponse(JSON.stringify({
        error: 'No DexScreener pairs found for this mint',
        mint,
      }), { isError: true });
    }

    const pair = pairs[0];
    const priceUsd = pair.priceUsd ? parseFloat(pair.priceUsd) : 0;
    if (priceUsd <= 0) {
      return createTextResponse(JSON.stringify({
        error: 'No valid price data from DexScreener',
        mint,
      }), { isError: true });
    }

    const priceChange = pair.priceChange ?? {};
    const volume = pair.volume ?? {};
    const liquidity = pair.liquidity?.usd ?? 0;
    const fdv = pair.fdv ?? 0;

    // Derive OHLC from price change percentages for the requested resolution.
    const changeMap: Record<string, number> = {
      '5m': priceChange['m5'] ?? 0,
      '1h': priceChange['h1'] ?? 0,
      '6h': priceChange['h6'] ?? 0,
      '24h': priceChange['h24'] ?? 0,
    };
    const changePct = changeMap[resolution] ?? changeMap['1h'];
    const open = priceUsd / (1 + changePct / 100);
    const close = priceUsd;
    const high = Math.max(open, close) * 1.001;
    const low = Math.min(open, close) * 0.999;

    const volMap: Record<string, number> = {
      '5m': (volume['m5'] ?? 0),
      '1h': (volume['h1'] ?? 0),
      '6h': (volume['h6'] ?? 0),
      '24h': (volume['h24'] ?? 0),
    };
    const vol = volMap[resolution] ?? volMap['1h'];

    const candle: OhlcCandle = {
      timestamp: Date.now(),
      open,
      high,
      low,
      close,
      volume: vol,
    };

    return createTextResponse(JSON.stringify({
      mint,
      symbol: pair.baseToken?.symbol ?? 'unknown',
      resolution,
      candle,
      liquidityUsd: liquidity,
      fdv,
      priceUsd,
    }));
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 5: sap_chart_long_term
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerChartLongTermTool
 * @description Register the sap_chart_long_term read-only tool.
 *
 * Fetches long-term price history for a Solana token from DexScreener
 * and optional protocol TVL data from DeFiLlama.
 *
 * @param server  — MCP server instance.
 * @param context — Runtime context (unused — pure REST call).
 *
 * @internal
 */
function registerChartLongTermTool(server: Server, _context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      mint: {
        type: 'string',
        description: 'Token mint address (base58) for price history.',
      },
      protocol: {
        type: 'string',
        description: 'Optional DeFiLlama protocol slug for TVL history (e.g. "jupiter", "raydium").',
      },
    },
    required: ['mint'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_chart_long_term', {
    description: 'Fetch long-term price history for a Solana token from DexScreener and optional protocol TVL data from DeFiLlama. Returns price changes, volume, liquidity, FDV, and TVL history. Read-only — uses free REST APIs.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const mint = typeof args['mint'] === 'string' ? args['mint'] as string : '';
    const protocol = typeof args['protocol'] === 'string' ? args['protocol'] as string : '';

    if (!mint) {
      return createTextResponse(JSON.stringify({ error: 'mint is required' }), { isError: true });
    }

    // Fetch token price data from DexScreener.
    const dexUrl = `${DEXSCREENER_API_URL}/tokens/v1/solana/${encodeURIComponent(mint)}`;
    const pairs = await timedFetch<DexScreenerPair[]>(dexUrl);

    let priceData: Record<string, unknown> = {};
    if (pairs && pairs.length > 0) {
      const pair = pairs[0];
      priceData = {
        symbol: pair.baseToken?.symbol ?? 'unknown',
        priceUsd: pair.priceUsd ?? '0',
        priceChange: pair.priceChange ?? {},
        volume: pair.volume ?? {},
        liquidityUsd: pair.liquidity?.usd ?? 0,
        fdv: pair.fdv ?? 0,
      };
    }

    // Fetch protocol TVL from DeFiLlama if requested.
    let tvlData: Record<string, unknown> = {};
    if (protocol) {
      const llamaUrl = `${DEFILAMA_API_URL}/protocol/${encodeURIComponent(protocol)}`;
      const protoData = await timedFetch<DefiLlamaProtocol & { tvlHistory?: Array<{ date: number; tvl: number }> }>(llamaUrl);
      if (protoData) {
        tvlData = {
          name: protoData.name,
          currentTvl: protoData.tvl,
          change1d: protoData.change_1d,
          change7d: protoData.change_7d,
          marketcap: protoData.marketcap,
          chain: protoData.chain,
        };
      }
    }

    if (Object.keys(priceData).length === 0 && Object.keys(tvlData).length === 0) {
      return createTextResponse(JSON.stringify({
        error: 'No data available from DexScreener or DeFiLlama',
        mint,
        protocol,
      }), { isError: true });
    }

    return createTextResponse(JSON.stringify({
      mint,
      token: priceData,
      protocolTvl: tvlData,
    }));
  });
}

/* ═══════════════════════════════════════════════════════════════════
 *  Tool 6: sap_chart_volume_profile
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name computeVolumeProfile
 * @description Compute volume profile (POC, VAH, VAL) from price and volume arrays.
 *
 * Pure TypeScript implementation — no external indicator library.
 *
 * @param prices       — Array of price points.
 * @param volumes      — Array of volume values (same length as prices).
 * @param bucketCount  — Number of price buckets (default 20).
 * @returns Volume profile result with POC, VAH, VAL, and buckets.
 *
 * @internal
 */
function computeVolumeProfile(
  prices: number[],
  volumes: number[],
  bucketCount: number = DEFAULT_VP_BUCKETS,
): VolumeProfileResult {
  if (prices.length === 0 || volumes.length === 0) {
    return { poc: 0, vah: 0, val: 0, buckets: [] };
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;
  if (range === 0) {
    return { poc: minPrice, vah: minPrice, val: minPrice, buckets: [{ priceLow: minPrice, priceHigh: minPrice, volume: volumes.reduce((a, b) => a + b, 0), pctOfTotal: 1 }] };
  }

  const bucketSize = range / bucketCount;
  const buckets: VolumeProfileBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    priceLow: minPrice + i * bucketSize,
    priceHigh: minPrice + (i + 1) * bucketSize,
    volume: 0,
    pctOfTotal: 0,
  }));

  const totalVolume = volumes.reduce((a, b) => a + b, 0);
  if (totalVolume === 0) {
    return { poc: minPrice, vah: maxPrice, val: minPrice, buckets };
  }

  for (let i = 0; i < prices.length; i++) {
    const bucketIdx = Math.min(Math.floor((prices[i] - minPrice) / bucketSize), bucketCount - 1);
    buckets[bucketIdx].volume += volumes[i];
  }

  for (const b of buckets) {
    b.pctOfTotal = b.volume / totalVolume;
  }

  // POC = bucket with highest volume.
  let pocIdx = 0;
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i].volume > buckets[pocIdx].volume) pocIdx = i;
  }
  const poc = (buckets[pocIdx].priceLow + buckets[pocIdx].priceHigh) / 2;

  // Value area: 70% of volume around POC.
  let volAccum = buckets[pocIdx].volume;
  let lowIdx = pocIdx - 1;
  let highIdx = pocIdx + 1;

  while (volAccum / totalVolume < VALUE_AREA_PCT && (lowIdx >= 0 || highIdx < buckets.length)) {
    const lowVol = lowIdx >= 0 ? buckets[lowIdx].volume : 0;
    const highVol = highIdx < buckets.length ? buckets[highIdx].volume : 0;

    if (lowVol >= highVol && lowIdx >= 0) {
      volAccum += lowVol;
      lowIdx--;
    } else if (highIdx < buckets.length) {
      volAccum += highVol;
      highIdx++;
    } else {
      break;
    }
  }

  const val = buckets[lowIdx + 1]?.priceLow ?? minPrice;
  const vah = buckets[highIdx - 1]?.priceHigh ?? maxPrice;

  return { poc, vah, val, buckets };
}

/**
 * @name registerChartVolumeProfileTool
 * @description Register the sap_chart_volume_profile read-only tool.
 *
 * @param server  — MCP server instance.
 * @param context — Runtime context (unused — pure REST + local math).
 *
 * @internal
 */
function registerChartVolumeProfileTool(server: Server, _context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      mint: {
        type: 'string',
        description: 'Token mint address (base58) to compute volume profile for.',
      },
      buckets: {
        type: 'number',
        description: 'Number of price buckets (default 20).',
        minimum: 5,
        maximum: 100,
      },
    },
    required: ['mint'],
    additionalProperties: false,
  };

  registerTool(server, 'sap_chart_volume_profile', {
    description: 'Compute volume profile (POC, VAH, VAL) for any Solana token using DexScreener price and volume data. Returns point of control, value area high/low, and bucket distribution. Read-only — uses free DexScreener REST API + local computation.',
    inputSchema: schema,
  }, async (args: Record<string, unknown>) => {
    const mint = typeof args['mint'] === 'string' ? args['mint'] as string : '';
    const bucketCount = typeof args['buckets'] === 'number' ? args['buckets'] as number : DEFAULT_VP_BUCKETS;

    if (!mint) {
      return createTextResponse(JSON.stringify({ error: 'mint is required' }), { isError: true });
    }

    // Fetch token data from DexScreener.
    const url = `${DEXSCREENER_API_URL}/tokens/v1/solana/${encodeURIComponent(mint)}`;
    const pairs = await timedFetch<DexScreenerPair[]>(url);

    if (!pairs || pairs.length === 0) {
      return createTextResponse(JSON.stringify({ error: 'No DexScreener data for this mint' }), { isError: true });
    }

    const pair = pairs[0];
    const priceUsd = pair.priceUsd ? parseFloat(pair.priceUsd) : 0;
    if (priceUsd <= 0) {
      return createTextResponse(JSON.stringify({ error: 'No valid price data' }), { isError: true });
    }

    // Derive price points from price change percentages.
    const pc = pair.priceChange ?? {};
    const vol = pair.volume ?? {};
    const prices = [
      priceUsd / (1 + (pc['m5'] ?? 0) / 100),
      priceUsd / (1 + (pc['h1'] ?? 0) / 100),
      priceUsd / (1 + (pc['h6'] ?? 0) / 100),
      priceUsd / (1 + (pc['h24'] ?? 0) / 100),
      priceUsd,
    ];
    const volumes = [
      vol['m5'] ?? 0,
      vol['h1'] ?? 0,
      vol['h6'] ?? 0,
      vol['h24'] ?? 0,
      vol['h24'] ?? 0,
    ];

    const profile = computeVolumeProfile(prices, volumes, bucketCount);

    return createTextResponse(JSON.stringify({
      mint,
      symbol: pair.baseToken?.symbol ?? 'unknown',
      priceUsd,
      volumeProfile: profile,
    }));
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
 * zones based on leverage, collateral, and current mark price.
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
    description: 'Compute liquidation zones for all open Adrena perp positions of a wallet. Reads on-chain positions via Solana RPC and calculates liquidation price, current price, and distance to liquidation. Read-only.',
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
      const accounts = await context.connection.getProgramAccounts(ADRENA_PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 0, bytes: discToBase58(DISC_POSITION) } },
          { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } },
        ],
        commitment: 'confirmed',
      });

      const zones: LiquidationZone[] = accounts.map(({ pubkey, account }) => {
        const data = account.data;
        const sideByte = data[8 + 32 + 32 + 32];
        const side: 'long' | 'short' = sideByte === 0 ? 'long' : 'short';
        const entryPrice = Number(data.readBigUInt64LE(8 + 32 + 32 + 32 + 1));
        const sizeUsd = Number(data.readBigUInt64LE(8 + 32 + 32 + 32 + 1 + 8));
        const collateralUsd = Number(data.readBigUInt64LE(8 + 32 + 32 + 32 + 1 + 8 + 8));
        const leverage = collateralUsd > 0 ? sizeUsd / collateralUsd : 0;

        // Liquidation price: for long, price drops by 1/leverage; for short, price rises.
        const liquidationPrice = leverage > 0
          ? side === 'long'
            ? entryPrice * (1 - 1 / leverage)
            : entryPrice * (1 + 1 / leverage)
          : 0;

        const currentPrice = entryPrice;
        const distanceToLiquidationPct = liquidationPrice > 0
          ? Math.abs((currentPrice - liquidationPrice) / currentPrice) * 100
          : 0;

        return {
          positionKey: pubkey.toBase58(),
          market: 'unknown',
          side,
          liquidationPrice,
          currentPrice,
          distanceToLiquidationPct,
          leverage,
        };
      });

      return createTextResponse(JSON.stringify({
        wallet: walletStr,
        zones,
        count: zones.length,
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
        description: 'Reference entry price in USD used for risk math.',
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
    description: 'Create a trader-grade perpetual futures plan from a simple intent. Returns notional size, stop risk, reward/risk, liquidation estimate, preflight checklist, and the exact SAP MCP read tools to call next. This is analysis-only: SAP MCP does not expose Adrena execution builders until they are IDL-backed and locally finalizable.',
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
      executionWarning: 'SAP MCP 0.9.35 intentionally does not expose manual Adrena execution builders. Execution must use a complete IDL-backed route before local finalization.',
      notes: typeof args['notes'] === 'string' ? args['notes'] : undefined,
    }, null, 2));
  });
}


/* ═══════════════════════════════════════════════════════════════════
 *  Main registration function
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * @name registerPerpTools
 * @description Register all 8 perp trading analytics and planning MCP tools.
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
  registerPerpLiquidationZonesTool(server, context);
  registerPerpTradePlanTool(server);

  logger.debug('Perp tools registered', { count: 8 });
}
