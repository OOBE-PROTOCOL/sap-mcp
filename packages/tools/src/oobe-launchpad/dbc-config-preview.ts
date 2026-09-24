/**
 * sap_steve_launch_preview_dbc — DBC launch economics straight from the
 * exact config the gateway bakes on-chain (PERPSPAD_CONFIG_ARGS scaled per
 * quote decimals by buildConfigArgsForQuote), with the dev-buy output
 * computed by the OFFICIAL @meteora-ag/dynamic-bonding-curve-sdk swap math
 * (getNextSqrtPriceFromQuoteAmountInRoundingDown + getDeltaAmountBaseUnsigned
 * — the same formulas the on-chain program executes). No hardcoded numbers
 * live in the frontend: the UI calls this tool and renders the result.
 */
import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
import {
  getNextSqrtPriceFromQuoteAmountInRoundingDown,
  getDeltaAmountBaseUnsigned,
  getCurveBreakdown,
  Rounding,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import {
  buildConfigArgsForQuote,
  getQuoteDecimals,
} from './dbc-launch.js';
import { getConnection } from '../phoenix/phoenix-helpers.js';
import {
  registerPerpspadPipelineTool,
  perpspadPipelineOk,
  perpspadPipelineException,
} from '../perpspad/perpspad-pipeline.js';

/** 283-byte ConfigParameters: curve.len @215 (u32), curve[i] @219+i*32 (u128 sqrt_price, u128 liquidity). */
const CURVE_OFFSET_BASE = 219;
const CURVE_ENTRY_SIZE = 32;
/** sqrt_start_price @77 (u128). */
const SQRT_START_PRICE_OFFSET = 77;
/** token_supply preset: 1e15 raw @ 6-dec token = 1,000,000,000 tokens. */
const TOKEN_SUPPLY_TOKENS = 1_000_000_000n;
/** The token side of every DBC pool is a 6-dec SPL legacy mint (preset ground truth). */
const BASE_DECIMALS = 6n;

function readU128(buf: Buffer, offset: number): bigint {
  return (buf.readBigUInt64LE(offset + 8) << 64n) | buf.readBigUInt64LE(offset);
}

/**
 * Exact DBC dev-buy simulation: sweep the curve bands with the SDK's
 * rounding-verified formulas until the quote amount is consumed. Band edge
 * quote = L·(hi−lo)/(hi·lo); base out per step via the SDK's
 * getDeltaAmountBaseUnsigned (Rounding.Down, program-identical).
 */
export function simulateDevBuy(
  config: Buffer,
  amountInRaw: bigint,
): { outputAmountRaw: bigint; nextSqrtPriceRaw: bigint; supplyExhausted: boolean } {
  const curveLen = config.readUInt32LE(215);
  let currentSqrtPrice = readU128(config, SQRT_START_PRICE_OFFSET);
  let amountLeft = amountInRaw;
  let totalBaseOut = 0n;
  for (let i = 0; i < curveLen && amountLeft > 0n; i++) {
    const o = CURVE_OFFSET_BASE + i * CURVE_ENTRY_SIZE;
    const bandSqrtPrice = readU128(config, o);
    const liquidity = readU128(config, o + 16);
    if (liquidity === 0n || bandSqrtPrice <= currentSqrtPrice) continue;
    // Max quote consumed crossing this band to its edge: Δquote = L·(hi−lo)/(hi·lo).
    // L is Q64-denominated, so multiply back by Q64. Rounding UP keeps the
    // estimate conservative (never overstates base out).
    const dNum = liquidity * (bandSqrtPrice - currentSqrtPrice);
    const maxQuoteIn = dNum / ((bandSqrtPrice * currentSqrtPrice) / 2n ** 64n) + 1n;
    const quoteIntoBand = amountLeft < maxQuoteIn ? amountLeft : maxQuoteIn;
    const nextSqrtPrice = getNextSqrtPriceFromQuoteAmountInRoundingDown(
      new BN(currentSqrtPrice.toString()),
      new BN(liquidity.toString()),
      new BN(quoteIntoBand.toString()),
    );
    const baseOut = getDeltaAmountBaseUnsigned(
      new BN(currentSqrtPrice.toString()),
      nextSqrtPrice,
      new BN(liquidity.toString()),
      Rounding.Down,
    );
    totalBaseOut += BigInt(baseOut.toString());
    amountLeft -= quoteIntoBand;
    currentSqrtPrice = BigInt(nextSqrtPrice.toString());
  }
  return {
    outputAmountRaw: totalBaseOut,
    nextSqrtPriceRaw: currentSqrtPrice,
    supplyExhausted: totalBaseOut >= TOKEN_SUPPLY_TOKENS * 10n ** BASE_DECIMALS,
  };
}

interface DbcConfigPreviewInput {
  /** Quote mint address (SOL passes the wrapped-SOL mint; CUSTOM passes the verified mint). */
  quoteMint: string;
  /** Human dev-buy amount in quote units (e.g. 1 for 1 SOL, 1000 for 1000 OOBE). */
  devBuyAmount?: number;
  /** Dev-buy slippage in bps as the UI submits (default 300). */
  slippageBps?: number;
  quotePriceUsd?: number;
  solPriceUsd?: number;
}

export function resolveQuoteUnitsPerSol(quoteMint: string, quotePriceUsd?: number, solPriceUsd?: number): number {
  if (quoteMint === 'So11111111111111111111111111111111111111112') return 1;
  if (!Number.isFinite(quotePriceUsd) || Number(quotePriceUsd) <= 0) {
    throw new Error('A live positive quotePriceUsd is required for non-SOL quote mints.');
  }
  if (!Number.isFinite(solPriceUsd) || Number(solPriceUsd) <= 0) {
    throw new Error('A live positive solPriceUsd is required for non-SOL quote mints.');
  }
  return Number(solPriceUsd) / Number(quotePriceUsd);
}

/**
 * Registers `sap_steve_launch_preview_dbc` — the pre-launch economics
 * readout the Steve Launchpad UI renders in its simulation panel. Every
 * number is derived from the config bytes the gateway actually signs, and
 * the dev-buy output uses the official SDK swap formulas (program-identical
 * rounding). No UI-side hardcoded curve constants.
 */
export function registerPerpspadDbcConfigPreviewTool(
  server: Parameters<typeof registerPerpspadPipelineTool>[0],
  context: Parameters<typeof registerPerpspadPipelineTool>[1],
): void {
  for (const toolName of ['sap_steve_launch_preview_dbc', 'sap_perpspad_dbc_config_preview'] as const) {
  registerPerpspadPipelineTool(server, context, toolName, {
    description:
      `${toolName === 'sap_perpspad_dbc_config_preview' ? 'DEPRECATED alias; use sap_steve_launch_preview_dbc. ' : ''}PRE-LAUNCH DBC economics readout: decodes the exact Meteora DBC config the gateway will sign (scaled per quote decimals) and simulates the dev-buy with the official SDK swap math. Returns migration threshold, start price, curve breakdown, tokens out (supply-capped) and min-out after slippage. Call this instead of estimating locally — the frontend renders these values verbatim.`,
    inputSchema: {
      type: 'object',
      properties: {
        quoteMint: { type: 'string', description: 'Quote mint address (SOL = wrapped SOL mint, CUSTOM = the verified mint)' },
        devBuyAmount: { type: 'number', description: 'Human dev-buy amount in quote units (e.g. 1 SOL, 1000 OOBE). 0/omitted = curve facts only.' },
        slippageBps: { type: 'number', description: 'Dev-buy slippage in bps (default 300)' },
        quotePriceUsd: { type: 'number', description: 'Live USD price of one quote token; required for non-SOL quotes.' },
        solPriceUsd: { type: 'number', description: 'Live SOL/USD reference; required for non-SOL quotes.' },
      },
      required: ['quoteMint'],
    } as const,
  }, async (rawInput: Record<string, unknown>) => {
    const input = rawInput as unknown as DbcConfigPreviewInput;
    try {
      const quoteMintStr = String(input.quoteMint ?? '');
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(quoteMintStr)) {
        throw new Error('quoteMint must be a valid base58 mint address.');
      }
      const devBuyAmount = typeof input.devBuyAmount === 'number' && Number.isFinite(input.devBuyAmount) && input.devBuyAmount > 0
        ? input.devBuyAmount
        : 0;
      const slippageBps = typeof input.slippageBps === 'number' && Number.isFinite(input.slippageBps)
        ? Math.max(0, Math.min(10_000, Math.round(input.slippageBps)))
        : 300;

      const connection = getConnection(context);
      const quoteMint = new PublicKey(quoteMintStr);
      const decimals = await getQuoteDecimals(connection, quoteMint);
      const quoteUnitsPerSol = resolveQuoteUnitsPerSol(quoteMintStr, input.quotePriceUsd, input.solPriceUsd);
      const config = buildConfigArgsForQuote(decimals, 100, quoteUnitsPerSol);

      // ── Decode the scaled config (BigInt, verified offsets) ────────────
      const migrationThresholdRaw = config.readBigUInt64LE(69);
      const curveLen = config.readUInt32LE(215);
      const curve: Array<{ sqrtPrice: string; liquidity: string }> = [];
      for (let i = 0; i < curveLen; i++) {
        const o = CURVE_OFFSET_BASE + i * CURVE_ENTRY_SIZE;
        curve.push({
          sqrtPrice: readU128(config, o).toString(),
          liquidity: readU128(config, o + 16).toString(),
        });
      }

      // Curve facts via the SDK's own breakdown (tokenomics ground truth).
      const breakdown = getCurveBreakdown(
        new BN(migrationThresholdRaw.toString()),
        new BN(readU128(config, SQRT_START_PRICE_OFFSET).toString()),
        curve.map((p) => ({ sqrtPrice: new BN(p.sqrtPrice), liquidity: new BN(p.liquidity) })),
      );

      // Price in RAW quote per RAW base at the start (DLMM convention), then
      // human units: whole token = 10^6 base-raw, human quote = 10^dec raw.
      const Q64 = 2n ** 64n;
      const sqrtStart = readU128(config, SQRT_START_PRICE_OFFSET);
      const startPriceRawRatio = Number(sqrtStart) / Number(Q64);
      const quotePerToken = startPriceRawRatio * startPriceRawRatio * Number(10n ** BASE_DECIMALS) / 10 ** decimals;

      // ── Dev-buy simulation (SDK swap formulas) ─────────────────────────
      const amountInRaw = BigInt(Math.round(devBuyAmount * 10 ** decimals));
      const buy = simulateDevBuy(config, amountInRaw);
      const minOutRaw = buy.outputAmountRaw * BigInt(10_000 - slippageBps) / 10_000n;

      return perpspadPipelineOk({
        success: true,
        quoteMint: quoteMintStr,
        quoteDecimals: decimals,
        quoteUnitsPerSol,
        tokenSupplyTokens: TOKEN_SUPPLY_TOKENS.toString(),
        migrationThresholdRaw: migrationThresholdRaw.toString(),
        migrationThresholdHuman: Number(migrationThresholdRaw) / 10 ** decimals,
        startPriceQuotePerToken: quotePerToken,
        tokensPerQuoteUnit: quotePerToken > 0 ? 1 / quotePerToken : null,
        curve,
        curveSegments: breakdown.segmentAmounts.map((b) => b.toString()),
        finalSqrtPrice: breakdown.finalSqrtPrice.toString(),
        totalCurveBaseRaw: breakdown.totalAmount.toString(),
        devBuy: {
          amountIn: devBuyAmount,
          amountInRaw: amountInRaw.toString(),
          tokensOutRaw: buy.outputAmountRaw.toString(),
          tokensOut: Number(buy.outputAmountRaw) / Number(10n ** BASE_DECIMALS),
          supplyExhausted: buy.supplyExhausted,
          minTokensOut: Number(minOutRaw) / Number(10n ** BASE_DECIMALS),
          slippageBps,
        },
      });
    } catch (err) {
      return perpspadPipelineException('DBC config preview failed', err);
    }
  });
  }
}
