/**
 * @name tools/sunrise/sunrise-data-tools
 * @description Sunrise asset-gateway tools: canonical token discovery, swap
 *   quotes, and swap execution over the public Sunrise API. Reads are free;
 *   quote/execute tools are BUILDER tier (pricing in payments/pricing.ts).
 *
 * @module tools/sunrise/sunrise-data-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import { logger } from '../../../core/src/logger.js';
import {
  SunriseApiClient,
  SUNRISE_CORE_MINTS,
  type SunriseToken,
} from './sunrise-client.js';
import {
  registerSunrisePipelineTool,
  sunrisePipelineOk,
  sunrisePipelineException,
  sunrisePipelineError,
} from './sunrise-pipeline.js';

const CANONICAL_MINT_WARNING = 'Canonical-mint warning: always resolve mints via sap_sunrise_list_tokens or sap_sunrise_resolve_token; never trust mints from social media or DEX search results — spoofed tokens appear within hours of hyped launches.';

let cachedClient: SunriseApiClient | null = null;

function getClient(): SunriseApiClient {
  if (!cachedClient) cachedClient = new SunriseApiClient();
  return cachedClient;
}

/** Core-asset lookup by symbol (USDC/USDT/WETH/WBTC — not in /v1/tokens). */
function findCoreMint(symbolOrMint: string): SunriseToken | undefined {
  const upper = symbolOrMint.trim().toUpperCase();
  const core = Object.values(SUNRISE_CORE_MINTS).find((entry) => entry.symbol === upper || entry.address === symbolOrMint.trim());
  if (!core) return undefined;
  return {
    chain: 'solana',
    address: core.address,
    symbol: core.symbol,
    name: `${core.symbol} (Sunrise core asset)`,
    decimals: core.decimals,
    platform: 'svm',
    assetClass: 'crypto',
    issuer: null,
    icon: null,
    tokenProgram: 'spl-token',
    stock: null,
  };
}

/** Resolves a symbol or mint against the token list plus core assets. */
async function resolveToken(symbolOrMint: string): Promise<SunriseToken | undefined> {
  const client = getClient();
  const tokens = await client.listTokens({ limit: 200 });
  const trimmed = symbolOrMint.trim();
  const bySymbol = tokens.tokens.find((t) => t.symbol.toUpperCase() === trimmed.toUpperCase());
  if (bySymbol) return bySymbol;
  const byMint = tokens.tokens.find((t) => t.address === trimmed);
  if (byMint) return byMint;
  return findCoreMint(symbolOrMint);
}

const NEXT_STEP_WITH_WALLET = 'Sign the unsignedTransaction locally with the user wallet, then call sap_sunrise_execute_quote with {signedTransaction, quoteId, routeName, providerRequestId}.';
const NEXT_STEP_WITHOUT_WALLET = 'Add fromAddress and toAddress to receive a signable unsignedTransaction for this quote.';

/** Registers every sap_sunrise_* tool on the MCP server. */
export function registerSunriseDataTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Sunrise gateway tools');

  registerSunrisePipelineTool(server, context, 'sap_sunrise_list_tokens', {
    description: `List all Sunrise-supported tokens on Solana with canonical mint addresses: symbol, name, decimals, assetClass (stock|crypto|commodity), tokenProgram (spl-token|token-2022), issuer, icon. Optional filters: assetClass, symbol substring, limit (max 200), cursor. USDC/USDT/WETH/WBTC are core assets NOT in this list but quotable. ${CANONICAL_MINT_WARNING} Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        assetClass: { type: 'string', description: 'Optional filter: stock, crypto, or commodity', enum: ['stock', 'crypto', 'commodity'] },
        symbol: { type: 'string', description: 'Optional case-insensitive symbol substring filter (e.g. MON)' },
        limit: { type: 'number', description: 'Max tokens per upstream page (1-200, default 200)', minimum: 1, maximum: 200 },
        cursor: { type: 'string', description: 'Pagination cursor from a previous call' },
      },
    },
  }, async (input) => {
    try {
      const data = await getClient().listTokens({
        cursor: typeof input.cursor === 'string' ? input.cursor : undefined,
        limit: typeof input.limit === 'number' ? input.limit : undefined,
      });
      const assetClass = typeof input.assetClass === 'string' ? input.assetClass.toLowerCase() : undefined;
      const symbol = typeof input.symbol === 'string' ? input.symbol.toUpperCase() : undefined;
      const filtered = data.tokens.filter((t) => {
        if (assetClass && t.assetClass !== assetClass) return false;
        if (symbol && t.symbol.toUpperCase() !== symbol) return false;
        return true;
      });
      return sunrisePipelineOk({
        success: true,
        count: filtered.length,
        upstreamCount: data.count,
        tokens: filtered,
        pagination: { nextCursor: data.nextCursor },
        _note: CANONICAL_MINT_WARNING,
      });
    } catch (err) {
      return sunrisePipelineException('Failed to list Sunrise tokens', err);
    }
  });

  registerSunrisePipelineTool(server, context, 'sap_sunrise_resolve_token', {
    description: `Resolve a Sunrise token by symbol or mint address: returns the canonical mint, decimals, assetClass, and tokenProgram. Knows the core assets (USDC, USDT, WETH, WBTC) even though they are absent from the token list. Use this instead of trusting third-party mint lists. Free read.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbolOrMint: { type: 'string', description: 'Token symbol (e.g. MON, USDC) or Solana mint address' },
      },
      required: ['symbolOrMint'],
    },
  }, async (input) => {
    try {
      const symbolOrMint = typeof input.symbolOrMint === 'string' ? input.symbolOrMint : '';
      if (!symbolOrMint) {
        return sunrisePipelineError({ error: 'invalid_input', message: 'symbolOrMint is required.' });
      }
      const token = await resolveToken(symbolOrMint);
      if (!token) {
        return sunrisePipelineError({
          error: 'token_not_found',
          message: `No Sunrise token matches symbol or mint '${symbolOrMint}'. ${CANONICAL_MINT_WARNING}`,
        });
      }
      return sunrisePipelineOk({ success: true, token, _note: CANONICAL_MINT_WARNING });
    } catch (err) {
      return sunrisePipelineException('Failed to resolve Sunrise token', err);
    }
  });

  registerSunrisePipelineTool(server, context, 'sap_sunrise_get_quote', {
    description: `Get Sunrise swap quotes between two canonical mints. fromToken/toToken are MINT ADDRESSES (resolve symbols first with sap_sunrise_resolve_token); fromAmount is a STRING in base units ('1000000' = 1 USDC at 6 decimals — numbers are rejected). Without wallet addresses you get a price-only quote (no unsignedTransaction); include fromAddress+toAddress to receive a signable transaction. BUILDER tier.`,
    inputSchema: {
      type: 'object',
      properties: {
        fromToken: { type: 'string', description: 'Input token MINT address (from sap_sunrise_resolve_token)' },
        toToken: { type: 'string', description: 'Output token MINT address' },
        fromAmount: { type: 'string', description: 'Input amount as STRING in base units (e.g. 1000000 for 1 USDC at 6 decimals)' },
        fromAddress: { type: 'string', description: 'Optional wallet address sending the input token — include to receive unsignedTransaction' },
        toAddress: { type: 'string', description: 'Optional wallet address receiving the output token' },
      },
      required: ['fromToken', 'toToken', 'fromAmount'],
    },
  }, async (input) => {
    try {
      const fromAmount = typeof input.fromAmount === 'string' ? input.fromAmount : undefined;
      if (fromAmount === undefined || !/^\d+(\.\d+)?$/.test(fromAmount)) {
        return sunrisePipelineError({
          error: 'invalid_amount',
          message: "fromAmount must be a string in base units matching /^\\d+(\\.\\d+)?$/ (e.g. '1000000' for 1 USDC at 6 decimals). Numbers are rejected to avoid float precision loss.",
        });
      }
      const body = {
        fromToken: String(input.fromToken),
        toToken: typeof input.toToken === 'string' ? input.toToken : '',
        fromAmount,
        ...(typeof input.fromAddress === 'string' ? { fromAddress: input.fromAddress } : {}),
        ...(typeof input.toAddress === 'string' ? { toAddress: input.toAddress } : {}),
      };
      const quotes = await getClient().getQuote(body);
      const best = quotes[0];
      const hasTransaction = Boolean(best?.unsignedTransaction);
      return sunrisePipelineOk({
        success: true,
        quotes,
        bestQuote: best ?? null,
        nextStep: hasTransaction ? NEXT_STEP_WITH_WALLET : NEXT_STEP_WITHOUT_WALLET,
      });
    } catch (err) {
      return sunrisePipelineException('Failed to get Sunrise quote', err);
    }
  });

  registerSunrisePipelineTool(server, context, 'sap_sunrise_execute_quote', {
    description: `Execute a signed Sunrise swap: submits the user-signed transaction from sap_sunrise_get_quote. Poll by re-calling with IDENTICAL arguments while status is 'SUBMITTED'; stop at 'CONFIRMED' and report the txHash. If polling times out, check the wallet activity FIRST — blind retries cause duplicate swaps. BUILDER tier.`,
    inputSchema: {
      type: 'object',
      properties: {
        signedTransaction: { type: 'string', description: 'Base64 transaction signed by the user wallet (from the quote unsignedTransaction, signed locally)' },
        quoteId: { type: 'string', description: 'quoteId from sap_sunrise_get_quote' },
        routeName: { type: 'string', description: 'routeName from sap_sunrise_get_quote (e.g. titan)' },
        providerRequestId: { type: 'string', description: 'Optional providerRequestId from the quote' },
      },
      required: ['signedTransaction', 'quoteId', 'routeName'],
    },
  }, async (input) => {
    try {
      const body = {
        signedTransaction: typeof input.signedTransaction === 'string' ? input.signedTransaction : '',
        quoteId: typeof input.quoteId === 'string' ? input.quoteId : '',
        routeName: typeof input.routeName === 'string' ? input.routeName : '',
        ...(typeof input.providerRequestId === 'string' ? { providerRequestId: input.providerRequestId } : {}),
      };
      if (!body.signedTransaction || !body.quoteId || !body.routeName) {
        return sunrisePipelineError({ error: 'invalid_input', message: 'signedTransaction, quoteId and routeName are required.' });
      }
      const result = await getClient().executeQuote(body);
      if (result.status === 'SUBMITTED') {
        return sunrisePipelineOk({
          success: true,
          txHash: result.txHash,
          status: result.status,
          nextStep: 'Re-call sap_sunrise_execute_quote with the IDENTICAL arguments until status is CONFIRMED. Do NOT re-quote or change arguments between polls.',
        });
      }
      return sunrisePipelineOk({
        success: true,
        txHash: result.txHash,
        status: result.status,
        explorer: `https://solscan.io/tx/${result.txHash}`,
        nextStep: 'Transaction CONFIRMED. Verify on Solscan before reporting success to the user.',
      });
    } catch (err) {
      return sunrisePipelineException('Failed to execute Sunrise quote', err);
    }
  });

  registerSunrisePipelineTool(server, context, 'sap_sunrise_swap_intent', {
    description: `One-call Sunrise swap intent: resolves both token SYMBOLS to canonical mints, then fetches a quote with the user's wallets and returns the unsignedTransaction + quoteId + routeName + providerRequestId. The transaction is NOT broadcast — sign it locally and execute with sap_sunrise_execute_quote. BUILDER tier.`,
    inputSchema: {
      type: 'object',
      properties: {
        fromSymbol: { type: 'string', description: 'Input token symbol (e.g. USDC, MON)' },
        toSymbol: { type: 'string', description: 'Output token symbol' },
        fromAmount: { type: 'string', description: 'Input amount as STRING in base units of the FROM token' },
        fromAddress: { type: 'string', description: 'Wallet address sending the input token' },
        toAddress: { type: 'string', description: 'Wallet address receiving the output token' },
      },
      required: ['fromSymbol', 'toSymbol', 'fromAmount', 'fromAddress', 'toAddress'],
    },
  }, async (input) => {
    try {
      const fromSymbol = typeof input.fromSymbol === 'string' ? input.fromSymbol : '';
      const toSymbol = typeof input.toSymbol === 'string' ? input.toSymbol : '';
      const fromAddress = typeof input.fromAddress === 'string' ? input.fromAddress : '';
      const toAddress = typeof input.toAddress === 'string' ? input.toAddress : '';
      const fromAmount = typeof input.fromAmount === 'string' ? input.fromAmount : '';
      if (!fromSymbol || !toSymbol || !fromAddress || !toAddress) {
        return sunrisePipelineError({ error: 'invalid_input', message: 'fromSymbol, toSymbol, fromAddress and toAddress are required.' });
      }
      if (!/^\d+(\.\d+)?$/.test(fromAmount)) {
        return sunrisePipelineError({
          error: 'invalid_amount',
          message: "fromAmount must be a string in base units matching /^\\d+(\\.\\d+)?$/ (e.g. '1000000' for 1 USDC at 6 decimals).",
        });
      }
      const [fromToken, toToken] = await Promise.all([resolveToken(fromSymbol), resolveToken(toSymbol)]);
      if (!fromToken || !toToken) {
        return sunrisePipelineError({
          error: 'token_not_found',
          message: `Could not resolve ${!fromToken ? 'fromSymbol' : 'toSymbol'} '${!fromToken ? fromSymbol : toSymbol}' to a canonical Sunrise mint. ${CANONICAL_MINT_WARNING}`,
        });
      }
      const quotes = await getClient().getQuote({
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAmount,
        fromAddress,
        toAddress,
      });
      const best = quotes[0];
      if (!best?.unsignedTransaction) {
        return sunrisePipelineError({
          error: 'no_transaction_returned',
          message: 'Sunrise returned a quote without an unsignedTransaction despite wallet addresses. Re-try the quote or use a different pair/amount.',
          quote: best ?? null,
        });
      }
      return sunrisePipelineOk({
        success: true,
        fromToken: { symbol: fromToken.symbol, address: fromToken.address, decimals: fromToken.decimals },
        toToken: { symbol: toToken.symbol, address: toToken.address, decimals: toToken.decimals },
        quote: best,
        unsignedTransaction: best.unsignedTransaction,
        quoteId: best.quoteId,
        routeName: best.routeName,
        providerRequestId: best.providerRequestId ?? null,
        _note: 'This transaction was NOT broadcast. Sign and execute it with sap_sunrise_execute_quote.',
      });
    } catch (err) {
      return sunrisePipelineException('Failed to build Sunrise swap intent', err);
    }
  });

  logger.debug('Sunrise gateway tools registered', { count: 5 });
}

/** Registers every Sunrise tool (alias kept symmetric with Backpack naming). */
export function registerSunriseTools(server: Server, context: SapMcpContext): void {
  registerSunriseDataTools(server, context);
}