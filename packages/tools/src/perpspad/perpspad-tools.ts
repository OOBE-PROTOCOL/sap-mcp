/**
 * @name tools/perpspad/perpspad-tools
 * @description PerpsPad launchpad tools: perp markets, launched tokens,
 *   token events, launch status, platform stats, stock pairs, and the launch
 *   builder (returns unsigned transactions — never broadcasts). Reads are
 *   free; the launch builder is BUILDER tier.
 *
 * @module tools/perpspad/perpspad-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import { logger } from '../../../core/src/logger.js';
import { PerpspadApiClient, type PerpspadLaunchBody } from './perpspad-client.js';
import { deriveEscrowPda, isValidSolanaAddress } from '../oobe-launchpad/escrow.js';
import { registerDbcLaunchTool } from '../oobe-launchpad/dbc-launch-tool.js';
import { registerPerpspadDbcConfigPreviewTool } from '../oobe-launchpad/dbc-config-preview.js';
import { registerMeteoraTradingTools } from '../oobe-launchpad/meteora-trading-tool.js';
import {
  registerPerpspadPipelineTool,
  perpspadPipelineOk,
  perpspadPipelineException,
  perpspadPipelineError,
} from './perpspad-pipeline.js';

let cachedClient: PerpspadApiClient | null = null;

function getClient(): PerpspadApiClient {
  if (!cachedClient) cachedClient = new PerpspadApiClient();
  return cachedClient;
}

/** Registers every sap_perpspad_* tool on the MCP server. */
export function registerPerpspadTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering PerpsPad launchpad tools');

  registerMeteoraTradingTools(server, context);

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_get_markets', {
    description: 'List PerpsPad supported underlying perp markets with leverage caps (e.g. BTC 1-40x, SOL 1-25x, OIL 1-20x, memecoins 1-3x). Every PerpsPad coin is backed by a leveraged perp position on one of these markets. Free read.',
    inputSchema: { type: 'object', properties: {} },
  }, async () => {
    try {
      const markets = await getClient().getMarkets();
      return perpspadPipelineOk({ success: true, count: markets.length, markets });
    } catch (err) {
      return perpspadPipelineException('Failed to get PerpsPad markets', err);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_get_tokens', {
    description: 'List PerpsPad launched tokens: ticker, name, mint, backing perp (underlying, leverage, direction), quote token, SOL raised, migration status, pool addresses. Sort: newest (default), oldest, or raised (most SOL raised first). Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        sort: { type: 'string', description: 'Sort order', enum: ['newest', 'oldest', 'raised'] },
        limit: { type: 'number', description: 'Max tokens per page', minimum: 1, maximum: 100 },
        offset: { type: 'number', description: 'Pagination offset', minimum: 0 },
      },
    },
  }, async (input) => {
    try {
      const tokens = await getClient().getTokens({
        sort: typeof input.sort === 'string' ? (input.sort as 'newest' | 'oldest' | 'raised') : undefined,
        limit: typeof input.limit === 'number' ? input.limit : undefined,
        offset: typeof input.offset === 'number' ? input.offset : undefined,
      });
      return perpspadPipelineOk({ success: true, count: tokens.length, tokens });
    } catch (err) {
      return perpspadPipelineException('Failed to list PerpsPad tokens', err);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_get_token', {
    description: 'Fetch one PerpsPad token by UUID or mint address: full metadata including backing perp (underlying, leverage, direction), pool addresses, SOL raised, and migration status. Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Token UUID or base58 mint address' },
      },
      required: ['id'],
    },
  }, async (input) => {
    try {
      const id = typeof input.id === 'string' ? input.id.trim() : '';
      if (!id) {
        return perpspadPipelineError({ error: 'invalid_input', message: 'id is required (token UUID or mint address).' });
      }
      const token = await getClient().getToken(id);
      return perpspadPipelineOk({ success: true, token });
    } catch (err) {
      return perpspadPipelineException('Failed to get PerpsPad token', err);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_get_token_events', {
    description: 'Fetch buyback / burn / fee transaction events for one PerpsPad token (its backing perp PnL drives buybacks and burns). Optional kind filter (comma-separated: buyback, external_buyback, burn, claim, creator_payout; default buyback+external_buyback+burn) and paging. Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Token UUID or mint address' },
        kind: { type: 'string', description: 'Comma-separated event kinds filter (e.g. "buyback,burn")' },
        limit: { type: 'number', description: 'Max events per page', minimum: 1, maximum: 100 },
        offset: { type: 'number', description: 'Pagination offset', minimum: 0 },
      },
      required: ['id'],
    },
  }, async (input) => {
    try {
      const id = typeof input.id === 'string' ? input.id.trim() : '';
      if (!id) {
        return perpspadPipelineError({ error: 'invalid_input', message: 'id is required (token UUID or mint address).' });
      }
      const data = await getClient().getTokenEvents(id, {
        kind: typeof input.kind === 'string' ? input.kind : undefined,
        limit: typeof input.limit === 'number' ? input.limit : undefined,
        offset: typeof input.offset === 'number' ? input.offset : undefined,
      });
      return perpspadPipelineOk({ success: true, events: data });
    } catch (err) {
      return perpspadPipelineException('Failed to get PerpsPad token events', err);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_get_launch_status', {
    description: "Poll a PerpsPad launch status by token id. A launch is 'live' once its backing pool confirms on-chain (no callback needed — poll this after signing and sending the launch transactions). Free read.",
    inputSchema: {
      type: 'object',
      properties: {
        tokenId: { type: 'string', description: 'Token UUID returned by the launch builder' },
      },
      required: ['tokenId'],
    },
  }, async (input) => {
    try {
      const tokenId = typeof input.tokenId === 'string' ? input.tokenId.trim() : '';
      if (!tokenId) {
        return perpspadPipelineError({ error: 'invalid_input', message: 'tokenId is required.' });
      }
      const status = await getClient().getLaunchStatus(tokenId);
      return perpspadPipelineOk({ success: true, launch: status });
    } catch (err) {
      return perpspadPipelineException('Failed to get PerpsPad launch status', err);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_get_stock_pairs', {
    description: 'List stock mints pairable for PerpsPad stock-paired launches (token paired against a tokenized stock). Use with the stock launch builder flow. Free read.',
    inputSchema: { type: 'object', properties: {} },
  }, async () => {
    try {
      const pairs = await getClient().getStockPairs();
      return perpspadPipelineOk({ success: true, pairs });
    } catch (err) {
      return perpspadPipelineException('Failed to get PerpsPad stock pairs', err);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_get_stats', {
    description: 'PerpsPad platform-wide stats: SOL price, KPIs (live tokens, total, graduated, OI USD, collateral USD, fees, raised USD, burn events, buyback USD), distributions, series, and leaderboards. Optional include filter (comma-separated subset). Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        include: { type: 'string', description: 'Optional comma-separated subset: kpis, distributions, series, leaderboards' },
      },
    },
  }, async (input) => {
    try {
      const include = typeof input.include === 'string' ? input.include : undefined;
      const stats = await getClient().getStats(include);
      return perpspadPipelineOk({ success: true, stats });
    } catch (err) {
      return perpspadPipelineException('Failed to get PerpsPad stats', err);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_build_launch', {
    description: 'Build a PerpsPad token launch backed by a leveraged perp: returns the UNSIGNED config + pool transactions. This tool does NOT broadcast anything — sign and send BOTH transactions from the user wallet (pays rent, dev-buy 0.1-5 SOL or 5-5000 USDC, and the 0.01 SOL fee), then poll sap_perpspad_get_launch_status until live. Backing: underlying+leverage+direction (single) or 2-leg basket. Validate leverage against sap_perpspad_get_markets. BUILDER tier.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Coin ticker, A-Z 0-9 only (e.g. MOON)' },
        name: { type: 'string', description: 'Coin display name' },
        creatorAddress: { type: 'string', description: 'Creator wallet: signer, payer, buyer, dev-buy recipient' },
        devBuy: { type: 'number', description: 'Dev-buy in quote units (SOL 0.1-5, USDC 5-5000)' },
        underlying: { type: 'string', description: 'Single-perp market backing the coin (e.g. SOL, BTC, OIL — see sap_perpspad_get_markets). Provide underlying+leverage+direction OR legs.' },
        leverage: { type: 'number', description: 'Leverage of the backing perp (1..market cap)' },
        direction: { type: 'string', description: 'Side of the backing perp', enum: ['long', 'short'] },
        legs: {
          type: 'array',
          description: 'Optional 2-leg basket instead of single underlying (e.g. NVDA long + SOL short). Each leg: {underlying, leverage, direction}.',
          items: {
            type: 'object',
            properties: {
              underlying: { type: 'string', description: 'Perp market symbol' },
              leverage: { type: 'number', description: 'Leg leverage (1..market cap)' },
              direction: { type: 'string', description: 'Leg side', enum: ['long', 'short'] },
            },
            required: ['underlying', 'leverage', 'direction'],
          },
        },
        quote: { type: 'string', description: 'Pairing token: SOL (default), USDC, or CUSTOM', enum: ['SOL', 'USDC', 'CUSTOM'] },
        quoteMint: { type: 'string', description: 'CUSTOM only: the SPL mint to pair against (verified server-side)' },
        quoteDecimals: { type: 'number', description: 'CUSTOM only: decimals hint (server uses on-chain decimals)' },
        imageUrl: { type: 'string', description: 'Optional coin image URL' },
        websiteUrl: { type: 'string', description: 'Optional website URL' },
        twitterUrl: { type: 'string', description: 'Optional X/Twitter URL' },
      },
      required: ['ticker', 'name', 'creatorAddress', 'devBuy'],
    },
  }, async (input) => {
    try {
      const body: PerpspadLaunchBody = {
        ticker: String(input.ticker ?? ''),
        name: String(input.name ?? ''),
        creatorAddress: String(input.creatorAddress ?? ''),
        devBuy: typeof input.devBuy === 'number' ? input.devBuy : Number.NaN,
        ...(input.underlying !== undefined ? { underlying: String(input.underlying) } : {}),
        ...(input.leverage !== undefined ? { leverage: Number(input.leverage) } : {}),
        ...(input.direction === 'long' || input.direction === 'short' ? { direction: input.direction } : {}),
        ...(Array.isArray(input.legs) ? { legs: input.legs as PerpspadLaunchBody['legs'] } : {}),
        ...(input.quote === 'SOL' || input.quote === 'USDC' || input.quote === 'CUSTOM' ? { quote: input.quote } : {}),
        ...(typeof input.quoteMint === 'string' ? { quoteMint: input.quoteMint } : {}),
        ...(typeof input.quoteDecimals === 'number' ? { quoteDecimals: input.quoteDecimals } : {}),
        ...(typeof input.imageUrl === 'string' ? { imageUrl: input.imageUrl } : {}),
        ...(typeof input.websiteUrl === 'string' ? { websiteUrl: input.websiteUrl } : {}),
        ...(typeof input.twitterUrl === 'string' ? { twitterUrl: input.twitterUrl } : {}),
      };
      const unsigned = await getClient().buildLaunch(body);
      return perpspadPipelineOk({
        success: true,
        tokenId: unsigned.tokenId,
        mint: unsigned.mint,
        configAddress: unsigned.configAddress,
        poolAddress: unsigned.poolAddress,
        protocolFeeSol: unsigned.protocolFeeSol,
        transactions: unsigned.transactions,
        unsignedTransactions: {
          config: unsigned.transactions.find((t) => t.label === 'config')?.base64 ?? null,
          pool: unsigned.transactions.find((t) => t.label === 'pool')?.base64 ?? null,
        },
        nextStep: `These transactions were NOT broadcast. Sign and send BOTH transactions (config first, then pool) from the creator wallet ${body.creatorAddress} (pays rent, dev-buy, and the ${unsigned.protocolFeeSol} SOL protocol fee), then poll sap_perpspad_get_launch_status with tokenId '${unsigned.tokenId}' until status is live.`,
        _note: 'This tool returns unsigned transactions only. It never signs or sends.',
      });
    } catch (err) {
      return perpspadPipelineException('Failed to build PerpsPad launch', err);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_build_escrow_launch', {
    description: "Build an escrow-backed PerpsPad launch (creator-split Option B): derives the trustless escrow PDA from the NEW token mint, swaps the launch creatorAddress to that PDA, and returns the unsigned config + pool + initialize_escrow transactions. The hourly creator_payout then lands on the escrow PDA, which hard-splits 70% to the agent wallet / 30% to the OOBE treasury on-chain — non-custodial, permissionless. The mint keypair is generated by the CALLER (agent flow) and passed as mintKeypairSecret (64-byte array); the config tx materializes that exact mint. Agent wallet (70% destination) is stored immutably. Sign and send: initialize_escrow FIRST (agent wallet signs), then config, then pool. BUILDER tier.",
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Coin ticker, A-Z 0-9 only (e.g. MOON)' },
        name: { type: 'string', description: 'Coin display name' },
        agentWallet: { type: 'string', description: "Agent wallet that receives the 70% share (stored immutably as the escrow's distribute destination)" },
        mintKeypairSecret: {
          type: 'array',
          description: '64-byte secret key of the NEW mint keypair (generated client-side, never persisted server-side). The escrow PDA derives from this mint.',
          items: { type: 'number' },
        },
        payerWallet: { type: 'string', description: 'Wallet that signs the transactions and pays rent + dev-buy. Usually the same as agentWallet.' },
        devBuy: { type: 'number', description: 'Dev-buy in quote units (SOL 0.1-5, USDC 5-5000)' },
        underlying: { type: 'string', description: 'Single-perp market backing the coin (e.g. SOL, BTC, OIL). Provide underlying+leverage+direction OR legs.' },
        leverage: { type: 'number', description: 'Leverage of the backing perp (1..market cap)' },
        direction: { type: 'string', description: 'Side of the backing perp', enum: ['long', 'short'] },
        legs: {
          type: 'array',
          description: 'Optional 2-leg basket instead of single underlying.',
          items: {
            type: 'object',
            properties: {
              underlying: { type: 'string', description: 'Perp market symbol' },
              leverage: { type: 'number', description: 'Leg leverage (1..market cap)' },
              direction: { type: 'string', description: 'Leg side', enum: ['long', 'short'] },
            },
            required: ['underlying', 'leverage', 'direction'],
          },
        },
        quote: { type: 'string', description: 'Pairing token: SOL (default), USDC, or CUSTOM', enum: ['SOL', 'USDC', 'CUSTOM'] },
        quoteMint: { type: 'string', description: 'CUSTOM only: the SPL mint to pair against' },
        quoteDecimals: { type: 'number', description: 'CUSTOM only: decimals hint' },
        imageUrl: { type: 'string', description: 'Optional coin image URL' },
        websiteUrl: { type: 'string', description: 'Optional website URL' },
        twitterUrl: { type: 'string', description: 'Optional X/Twitter URL' },
      },
      required: ['ticker', 'name', 'agentWallet', 'mintKeypairSecret', 'devBuy'],
    },
  }, async (input) => {
    try {
      const agentWallet = String(input.agentWallet ?? '');
      const payerWallet = String(input.payerWallet ?? agentWallet);
      if (!isValidSolanaAddress(agentWallet)) {
        return perpspadPipelineException('Invalid escrow launch input', new Error('invalid_agentWallet: agentWallet must be a valid Solana address'));
      }
      if (!isValidSolanaAddress(payerWallet)) {
        return perpspadPipelineException('Invalid escrow launch input', new Error('invalid_payerWallet: payerWallet must be a valid Solana address'));
      }
      const secret = Array.isArray(input.mintKeypairSecret) ? input.mintKeypairSecret : [];
      if (secret.length !== 64 || secret.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) {
        return perpspadPipelineException('Invalid escrow launch input', new Error('invalid_mintKeypairSecret: must be a 64-byte array (never persisted server-side)'));
      }

      // Derive the mint from the caller-supplied keypair (client-side
      // generated; the server derives the pubkey and DISCARDS the secret).
      const { Keypair } = await import('@solana/web3.js');
      const mintKeypair = Keypair.fromSecretKey(Uint8Array.from(secret as number[]));
      const tokenMint = mintKeypair.publicKey;

      const { escrowPda, bump } = deriveEscrowPda(tokenMint);

      const launchBody: PerpspadLaunchBody = {
        ticker: String(input.ticker ?? ''),
        name: String(input.name ?? ''),
        creatorAddress: escrowPda.toBase58(),
        devBuy: typeof input.devBuy === 'number' ? input.devBuy : Number.NaN,
        ...(input.underlying !== undefined ? { underlying: String(input.underlying) } : {}),
        ...(input.leverage !== undefined ? { leverage: Number(input.leverage) } : {}),
        ...(input.direction === 'long' || input.direction === 'short' ? { direction: input.direction } : {}),
        ...(Array.isArray(input.legs) ? { legs: input.legs as PerpspadLaunchBody['legs'] } : {}),
        ...(input.quote === 'SOL' || input.quote === 'USDC' || input.quote === 'CUSTOM' ? { quote: input.quote } : {}),
        ...(typeof input.quoteMint === 'string' ? { quoteMint: String(input.quoteMint) } : {}),
        ...(typeof input.quoteDecimals === 'number' ? { quoteDecimals: Number(input.quoteDecimals) } : {}),
        ...(typeof input.imageUrl === 'string' ? { imageUrl: String(input.imageUrl) } : {}),
        ...(typeof input.websiteUrl === 'string' ? { websiteUrl: String(input.websiteUrl) } : {}),
        ...(typeof input.twitterUrl === 'string' ? { twitterUrl: String(input.twitterUrl) } : {}),
      };

      const unsigned = await getClient().buildLaunch(launchBody);
      const configTx = unsigned.transactions.find((t) => t.label === 'config')?.base64 ?? null;
      const poolTx = unsigned.transactions.find((t) => t.label === 'pool')?.base64 ?? null;

      return perpspadPipelineOk({
        success: true,
        escrowMode: true,
        escrowPda: escrowPda.toBase58(),
        escrowBump: bump,
        escrowProgramId: 'ENpvWhtTtnveMZ3WHpGKHMEYDrPHHc5v6JjjVUWFNYgA',
        tokenMint: tokenMint.toBase58(),
        agentWallet,
        split: { agentBps: 7000, oobeBps: 3000, oobeTreasury: 'BiHdXQqNXTgMrNikZxw4CMnD1z1t6K2tmtwyXgSWSKqR' },
        tokenId: unsigned.tokenId,
        mint: unsigned.mint,
        configAddress: unsigned.configAddress,
        poolAddress: unsigned.poolAddress,
        protocolFeeSol: unsigned.protocolFeeSol,
        transactions: {
          // Signed by the AGENT WALLET (payer): materializes the escrow PDA
          // account. MUST be sent FIRST (before config).
          initializeEscrow: {
            programId: 'ENpvWhtTtnveMZ3WHpGKHMEYDrPHHc5v6JjjVUWFNYgA',
            accounts: {
              escrowPda: escrowPda.toBase58(),
              tokenMint: tokenMint.toBase58(),
              agentWallet,
              payer: payerWallet,
              systemProgram: '11111111111111111111111111111111',
            },
            data: [0],
            note: 'Build with buildInitializeEscrowInstruction (oobe-launchpad/escrow.ts) client-side; sign with the payer wallet.',
          },
          config: configTx,
          pool: poolTx,
        },
        signingOrder: ['initializeEscrow', 'config', 'pool'],
        nextStep: `Send initializeEscrow FIRST (payer ${payerWallet} signs; creates the escrow PDA account), then config, then pool. After the pool confirms, poll sap_perpspad_get_launch_status with tokenId '${unsigned.tokenId}'. Hourly creator payouts land on escrow ${escrowPda.toBase58()} and split 70/30 automatically.`,
        _note: 'Unsigned transactions only — never signs or sends. The mintKeypairSecret is used to derive the pubkey and discarded.',
      });
    } catch (err) {
      return perpspadPipelineException('Failed to build escrow-backed PerpsPad launch', err);
    }
  });

  // Steve-native DBC launch builder. Legacy sap_perpspad_* IDs remain aliases.
  registerDbcLaunchTool(server, context);
  // Pre-launch economics preview — SDK-verified DBC config + dev-buy math
  // (single source of truth for the Steve Launchpad simulation panel).
  registerPerpspadDbcConfigPreviewTool(server, context);

  logger.debug('PerpsPad launchpad tools registered', { count: 14 });
}
