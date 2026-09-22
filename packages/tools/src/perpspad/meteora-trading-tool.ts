import { getMint } from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import {
  DynamicBondingCurveClient,
  deriveDammV2PoolAddress,
  getCurrentPoint,
  SwapMode,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, getTokenProgram as getDammTokenProgram } from '@meteora-ag/cp-amm-sdk';
import { getConnection } from '../phoenix/phoenix-helpers.js';
import { isValidSolanaAddress } from './perpspad-escrow.js';
import {
  perpspadPipelineException,
  perpspadPipelineOk,
  registerPerpspadPipelineTool,
} from './perpspad-pipeline.js';

type TradeSide = 'buy' | 'sell';
type MeteoraStage = 'bonding_curve' | 'migration_pending' | 'graduated_damm_v2';

interface ResolvedMarket {
  stage: MeteoraStage;
  dbcPool: PublicKey;
  tradePool: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseDecimals: number;
  quoteDecimals: number;
  dbcPoolState: Awaited<ReturnType<DynamicBondingCurveClient['state']['getPool']>>;
  dbcConfig: NonNullable<Awaited<ReturnType<DynamicBondingCurveClient['state']['getPoolConfig']>>>;
  dammPoolState?: Awaited<ReturnType<CpAmm['fetchPoolState']>>;
}

export function parseUiAmount(value: string, decimals: number): BN {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error('amount must be a positive decimal string');
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) throw new Error(`amount supports at most ${decimals} decimal places`);
  const raw = `${whole}${fraction.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, '');
  const amount = new BN(raw || '0');
  if (amount.isZero()) throw new Error('amount must be greater than zero');
  return amount;
}

export function formatRawAmount(value: BN, decimals: number): string {
  const raw = value.toString().padStart(decimals + 1, '0');
  const whole = raw.slice(0, -decimals) || '0';
  const fraction = decimals ? raw.slice(-decimals).replace(/0+$/, '') : '';
  return fraction ? `${whole}.${fraction}` : whole;
}

function readAmount(input: Record<string, unknown>, decimals: number): BN {
  const raw = typeof input.amountRaw === 'string' ? input.amountRaw.trim() : '';
  const ui = typeof input.amount === 'string' ? input.amount : '';
  if (raw && ui) throw new Error('provide amount or amountRaw, not both');
  if (raw) {
    if (!/^\d+$/.test(raw)) throw new Error('amountRaw must be a positive base-unit integer string');
    const amount = new BN(raw);
    if (amount.isZero()) throw new Error('amountRaw must be greater than zero');
    return amount;
  }
  if (!ui) throw new Error('amount or amountRaw is required');
  return parseUiAmount(ui, decimals);
}

async function resolveMarket(context: Parameters<typeof registerPerpspadPipelineTool>[1], poolAddress: string): Promise<ResolvedMarket> {
  if (!isValidSolanaAddress(poolAddress)) throw new Error('poolAddress must be a valid Meteora DBC pool address');
  const connection = getConnection(context);
  const dbcClient = DynamicBondingCurveClient.create(connection, 'confirmed');
  const dbcPool = new PublicKey(poolAddress);
  const pool = await dbcClient.state.getPool(dbcPool);
  if (!pool) throw new Error('Meteora DBC pool not found');
  const config = await dbcClient.state.getPoolConfig(pool.poolState.config);
  if (!config) throw new Error('Meteora DBC config not found');

  const baseMint = pool.poolState.baseMint;
  const quoteMint = config.quoteMint;
  const [baseMintAccount, quoteMintAccount] = await Promise.all([
    connection.getAccountInfo(baseMint),
    connection.getAccountInfo(quoteMint),
  ]);
  if (!baseMintAccount || !quoteMintAccount) throw new Error('Meteora pool mint account not found');
  const [baseMintState, quoteMintState] = await Promise.all([
    getMint(connection, baseMint, 'confirmed', baseMintAccount.owner),
    getMint(connection, quoteMint, 'confirmed', quoteMintAccount.owner),
  ]);

  if (!pool.poolState.isMigrated) {
    const stage = pool.poolState.quoteReserve.gte(config.migrationQuoteThreshold)
      ? 'migration_pending'
      : 'bonding_curve';
    return {
      stage, dbcPool, tradePool: dbcPool, baseMint, quoteMint,
      baseDecimals: baseMintState.decimals, quoteDecimals: quoteMintState.decimals,
      dbcPoolState: pool, dbcConfig: config,
    };
  }

  const cpAmm = new CpAmm(connection);
  const derivedPool = deriveDammV2PoolAddress(pool.poolState.config, baseMint, quoteMint);
  let tradePool = derivedPool;
  let dammPoolState: Awaited<ReturnType<CpAmm['fetchPoolState']>> | undefined;
  try {
    dammPoolState = await cpAmm.fetchPoolState(derivedPool);
  } catch {
    const candidates = await cpAmm.fetchPoolStatesByTokenMint(baseMint);
    const match = candidates.find(({ account }) =>
      (account.tokenAMint.equals(baseMint) && account.tokenBMint.equals(quoteMint)) ||
      (account.tokenAMint.equals(quoteMint) && account.tokenBMint.equals(baseMint)));
    if (!match) throw new Error('DBC is migrated but its Meteora DAMM v2 pool is not available yet');
    tradePool = match.publicKey;
    dammPoolState = match.account;
  }

  return {
    stage: 'graduated_damm_v2', dbcPool, tradePool, baseMint, quoteMint,
    baseDecimals: baseMintState.decimals, quoteDecimals: quoteMintState.decimals,
    dbcPoolState: pool, dbcConfig: config, dammPoolState,
  };
}

function marketJson(market: ResolvedMarket) {
  const state = market.dbcPoolState!.poolState;
  const threshold = market.dbcConfig.migrationQuoteThreshold;
  const remaining = BN.max(threshold.sub(state.quoteReserve), new BN(0));
  return {
    stage: market.stage,
    protocol: market.stage === 'graduated_damm_v2' ? 'meteora_damm_v2' : 'meteora_dbc',
    dbcPoolAddress: market.dbcPool.toBase58(),
    tradePoolAddress: market.tradePool.toBase58(),
    baseMint: market.baseMint.toBase58(),
    quoteMint: market.quoteMint.toBase58(),
    baseDecimals: market.baseDecimals,
    quoteDecimals: market.quoteDecimals,
    migration: {
      isMigrated: Boolean(state.isMigrated),
      quoteReserveRaw: state.quoteReserve.toString(),
      quoteReserve: formatRawAmount(state.quoteReserve, market.quoteDecimals),
      quoteThresholdRaw: threshold.toString(),
      quoteThreshold: formatRawAmount(threshold, market.quoteDecimals),
      quoteRemainingRaw: remaining.toString(),
      quoteRemaining: formatRawAmount(remaining, market.quoteDecimals),
      readyToMigrate: state.quoteReserve.gte(threshold),
    },
  };
}

function approvedDammV2Config(value: string): PublicKey {
  const approved = (process.env.METEORA_DAMM_V2_CONFIGS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (approved.length === 0) {
    throw new Error('Meteora migration is not configured on this gateway');
  }
  if (!approved.includes(value)) {
    throw new Error('dammConfig is not approved by this gateway');
  }
  return new PublicKey(value);
}

async function getQuote(
  context: Parameters<typeof registerPerpspadPipelineTool>[1],
  market: ResolvedMarket,
  side: TradeSide,
  amountIn: BN,
  slippageBps: number,
) {
  const connection = getConnection(context);
  if (market.stage === 'migration_pending') {
    throw new Error('bonding curve is complete and migration to Meteora DAMM v2 is being finalized');
  }
  if (market.stage === 'bonding_curve') {
    const client = DynamicBondingCurveClient.create(connection, 'confirmed');
    const currentPoint = await getCurrentPoint(connection, market.dbcConfig.activationType);
    const quote = client.pool.swapQuote2({
      virtualPool: market.dbcPoolState!,
      config: market.dbcConfig,
      swapBaseForQuote: side === 'sell',
      swapMode: side === 'buy' ? SwapMode.PartialFill : SwapMode.ExactIn,
      amountIn,
      slippageBps,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: true,
      currentPoint,
    });
    const amountLeft = quote.amountLeft ?? new BN(0);
    const consumedAmountIn = BN.max(amountIn.sub(amountLeft), new BN(0));
    if (consumedAmountIn.isZero()) {
      throw new Error('bonding curve has no executable capacity remaining; migration is being finalized');
    }
    return {
      amountOut: quote.outputAmount,
      minimumAmountOut: quote.minimumAmountOut ?? quote.outputAmount,
      consumedAmountIn,
      amountLeft,
      partialFill: amountLeft.gt(new BN(0)),
      priceImpact: null as string | null,
    };
  }

  const cpAmm = new CpAmm(connection);
  const poolState = market.dammPoolState!;
  const currentSlot = await connection.getSlot('confirmed');
  const blockTime = await connection.getBlockTime(currentSlot);
  const quote = cpAmm.getQuote({
    inAmount: amountIn,
    inputTokenMint: side === 'buy' ? market.quoteMint : market.baseMint,
    slippage: slippageBps,
    poolState,
    currentTime: blockTime ?? Math.floor(Date.now() / 1000),
    currentSlot,
    tokenADecimal: poolState.tokenAMint.equals(market.baseMint) ? market.baseDecimals : market.quoteDecimals,
    tokenBDecimal: poolState.tokenBMint.equals(market.quoteMint) ? market.quoteDecimals : market.baseDecimals,
    hasReferral: false,
  });
  return {
    amountOut: quote.swapOutAmount,
    minimumAmountOut: quote.minSwapOutAmount,
    consumedAmountIn: amountIn,
    amountLeft: new BN(0),
    partialFill: false,
    priceImpact: quote.priceImpact.toString(),
  };
}

const BASE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    poolAddress: { type: 'string', description: 'Original Meteora DBC pool address. The tool follows migration to DAMM v2 automatically.' },
    side: { type: 'string', enum: ['buy', 'sell'] },
    amount: { type: 'string', description: 'Exact-in amount as a decimal string in quote units for buy or base-token units for sell.' },
    amountRaw: { type: 'string', description: 'Alternative exact-in amount in base units. Mutually exclusive with amount.' },
    slippageBps: { type: 'number', minimum: 1, maximum: 5000 },
  },
  required: ['poolAddress', 'side'],
} as const;

export function registerMeteoraTradingTools(
  server: Parameters<typeof registerPerpspadPipelineTool>[0],
  context: Parameters<typeof registerPerpspadPipelineTool>[1],
): void {
  registerPerpspadPipelineTool(server, context, 'sap_meteora_launchpad_state', {
    description: 'Resolve one launch from its original DBC pool to the currently executable Meteora venue. Returns bonding-curve reserves/capacity or the migrated DAMM v2 pool.',
    inputSchema: { type: 'object', properties: { poolAddress: { type: 'string' } }, required: ['poolAddress'] },
  }, async (input) => {
    try {
      const market = await resolveMarket(context, String(input.poolAddress ?? ''));
      return perpspadPipelineOk({ success: true, market: marketJson(market) });
    } catch (error) {
      return perpspadPipelineException('Failed to resolve Meteora launchpad market', error);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_meteora_launchpad_quote', {
    description: 'Quote an exact-in buy or sell on the active Meteora DBC curve or its graduated DAMM v2 pool. Amounts are strings to preserve token precision.',
    inputSchema: BASE_INPUT_SCHEMA,
  }, async (input) => {
    try {
      const market = await resolveMarket(context, String(input.poolAddress ?? ''));
      const side = input.side === 'sell' ? 'sell' : input.side === 'buy' ? 'buy' : null;
      if (!side) throw new Error('side must be buy or sell');
      const inputDecimals = side === 'buy' ? market.quoteDecimals : market.baseDecimals;
      const outputDecimals = side === 'buy' ? market.baseDecimals : market.quoteDecimals;
      const amountIn = readAmount(input, inputDecimals);
      const slippageBps = typeof input.slippageBps === 'number' ? input.slippageBps : 100;
      const quote = await getQuote(context, market, side, amountIn, slippageBps);
      return perpspadPipelineOk({
        success: true, market: marketJson(market), side, slippageBps,
        inputMint: (side === 'buy' ? market.quoteMint : market.baseMint).toBase58(),
        outputMint: (side === 'buy' ? market.baseMint : market.quoteMint).toBase58(),
        amountInRaw: amountIn.toString(), amountIn: formatRawAmount(amountIn, inputDecimals),
        consumedAmountInRaw: quote.consumedAmountIn.toString(),
        consumedAmountIn: formatRawAmount(quote.consumedAmountIn, inputDecimals),
        unusedAmountInRaw: quote.amountLeft.toString(),
        unusedAmountIn: formatRawAmount(quote.amountLeft, inputDecimals),
        partialFill: quote.partialFill,
        amountOutRaw: quote.amountOut.toString(), amountOut: formatRawAmount(quote.amountOut, outputDecimals),
        minimumAmountOutRaw: quote.minimumAmountOut.toString(),
        minimumAmountOut: formatRawAmount(quote.minimumAmountOut, outputDecimals),
        priceImpactPercent: quote.priceImpact,
      });
    } catch (error) {
      return perpspadPipelineException('Failed to quote Meteora launchpad trade', error);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_meteora_build_launchpad_migration', {
    description: 'Build an unsigned official Meteora DBC to DAMM v2 migration after the curve reaches its threshold. The destination must be server-allowlisted. Position NFT ephemerals are co-signed; the payer remains the only external signer. Never broadcasts.',
    inputSchema: {
      type: 'object',
      properties: {
        poolAddress: { type: 'string', description: 'Original Meteora DBC pool address.' },
        payer: { type: 'string', description: 'Wallet paying for and authorizing migration.' },
        dammConfig: { type: 'string', description: 'Meteora DAMM v2 config address. Must appear in METEORA_DAMM_V2_CONFIGS.' },
        latestBlockhash: { type: 'string', description: 'Fresh Solana blockhash supplied by the caller.' },
      },
      required: ['poolAddress', 'payer', 'dammConfig', 'latestBlockhash'],
    },
  }, async (input) => {
    try {
      const payer = String(input.payer ?? '');
      const latestBlockhash = String(input.latestBlockhash ?? '');
      if (!isValidSolanaAddress(payer)) throw new Error('payer must be a valid Solana address');
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(latestBlockhash)) throw new Error('latestBlockhash must be a fresh Solana blockhash');
      const dammConfig = approvedDammV2Config(String(input.dammConfig ?? ''));

      const market = await resolveMarket(context, String(input.poolAddress ?? ''));
      if (market.stage === 'graduated_damm_v2') {
        return perpspadPipelineOk({ success: true, alreadyMigrated: true, market: marketJson(market) });
      }
      if (market.stage !== 'migration_pending') {
        throw new Error('bonding curve has not reached its migration threshold');
      }

      const client = DynamicBondingCurveClient.create(getConnection(context), 'confirmed');
      const migration = await client.migration.migrateToDammV2({
        payer: new PublicKey(payer), pool: market.dbcPool, dammConfig,
      });
      migration.transaction.recentBlockhash = latestBlockhash;
      migration.transaction.feePayer = new PublicKey(payer);
      migration.transaction.partialSign(migration.firstPositionNftKeypair, migration.secondPositionNftKeypair);

      return perpspadPipelineOk({
        success: true,
        market: marketJson(market),
        transactionBase64: migration.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        signing: { signer: payer, ephemeralPositionSignersIncluded: 2, broadcasts: false },
      });
    } catch (error) {
      return perpspadPipelineException('Failed to build Meteora launchpad migration', error);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_meteora_build_launchpad_trade', {
    description: 'Build an unsigned exact-in Meteora buy or sell. Routes automatically between an active DBC curve and its graduated DAMM v2 pool; never broadcasts or signs.',
    inputSchema: {
      ...BASE_INPUT_SCHEMA,
      properties: {
        ...BASE_INPUT_SCHEMA.properties,
        owner: { type: 'string', description: 'Wallet that signs and pays for the swap.' },
        latestBlockhash: { type: 'string', description: 'Fresh mainnet blockhash supplied by the caller.' },
      },
      required: ['poolAddress', 'owner', 'side', 'latestBlockhash'],
    },
  }, async (input) => {
    try {
      const owner = String(input.owner ?? '');
      const latestBlockhash = String(input.latestBlockhash ?? '');
      if (!isValidSolanaAddress(owner)) throw new Error('owner must be a valid Solana address');
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(latestBlockhash)) throw new Error('latestBlockhash must be a fresh Solana blockhash');
      const market = await resolveMarket(context, String(input.poolAddress ?? ''));
      const side = input.side === 'sell' ? 'sell' : input.side === 'buy' ? 'buy' : null;
      if (!side) throw new Error('side must be buy or sell');
      const inputDecimals = side === 'buy' ? market.quoteDecimals : market.baseDecimals;
      const outputDecimals = side === 'buy' ? market.baseDecimals : market.quoteDecimals;
      const amountIn = readAmount(input, inputDecimals);
      const slippageBps = typeof input.slippageBps === 'number' ? input.slippageBps : 100;
      const quote = await getQuote(context, market, side, amountIn, slippageBps);
      const payer = new PublicKey(owner);
      let tx: Transaction;

      if (market.stage === 'bonding_curve') {
        const client = DynamicBondingCurveClient.create(getConnection(context), 'confirmed');
        tx = await client.pool.swap2({
          owner: payer, pool: market.dbcPool,
          swapMode: side === 'buy' ? SwapMode.PartialFill : SwapMode.ExactIn,
          amountIn,
          minimumAmountOut: quote.minimumAmountOut,
          swapBaseForQuote: side === 'sell', referralTokenAccount: null,
        });
      } else {
        const pool = market.dammPoolState!;
        const inputMint = side === 'buy' ? market.quoteMint : market.baseMint;
        const outputMint = side === 'buy' ? market.baseMint : market.quoteMint;
        tx = await new CpAmm(getConnection(context)).swap({
          payer, pool: market.tradePool, inputTokenMint: inputMint, outputTokenMint: outputMint,
          amountIn, minimumAmountOut: quote.minimumAmountOut,
          tokenAMint: pool.tokenAMint, tokenBMint: pool.tokenBMint,
          tokenAVault: pool.tokenAVault, tokenBVault: pool.tokenBVault,
          tokenAProgram: getDammTokenProgram(pool.tokenAFlag),
          tokenBProgram: getDammTokenProgram(pool.tokenBFlag),
          referralTokenAccount: null, poolState: pool,
        });
      }

      tx.recentBlockhash = latestBlockhash;
      tx.feePayer = payer;
      return perpspadPipelineOk({
        success: true, market: marketJson(market), side, slippageBps,
        amountInRaw: amountIn.toString(), amountIn: formatRawAmount(amountIn, inputDecimals),
        consumedAmountInRaw: quote.consumedAmountIn.toString(),
        consumedAmountIn: formatRawAmount(quote.consumedAmountIn, inputDecimals),
        unusedAmountInRaw: quote.amountLeft.toString(),
        unusedAmountIn: formatRawAmount(quote.amountLeft, inputDecimals),
        partialFill: quote.partialFill,
        minimumAmountOutRaw: quote.minimumAmountOut.toString(),
        minimumAmountOut: formatRawAmount(quote.minimumAmountOut, outputDecimals),
        transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        signing: { signer: owner, broadcasts: false },
      });
    } catch (error) {
      return perpspadPipelineException('Failed to build Meteora launchpad trade', error);
    }
  });
}
