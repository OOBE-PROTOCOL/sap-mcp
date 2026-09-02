/**
 * @name perps/phoenix/phoenix-builder-collateral
 * @description Collateral builders for Phoenix perps: deposit, withdraw, register trader.
 *
 * All builders produce unsigned serialized transactions — NO signing happens server-side.
 *
 * @module perps/phoenix/phoenix-builder-collateral
 */

import { PublicKey, type Connection } from '@solana/web3.js';
import { createPhoenixClient, MarginType } from '@ellipsis-labs/rise';
import { logger } from '../../../core/src/logger.js';
import {
  buildPhoenixResult,
  serializeUnsignedPhoenixTx,
  phoenixIxToTransactionInstruction,
  type UnsignedTransactionResult,
} from './phoenix-builder-core.js';
import { PHOENIX_PROGRAM_ID } from './phoenix-constants.js';

/**
 * Build an unsigned deposit transaction for USDC collateral into a Phoenix trader account.
 *
 * @param connection — Solana RPC connection.
 * @param authority — Trader authority public key.
 * @param feePayer — Fee payer public key.
 * @param amountUsdc — Amount in human-readable USDC (e.g. 100 = 100 USDC).
 * @param traderPdaIndex — Trader PDA index (default 0).
 * @param traderSubaccountIndex — Trader subaccount index (default 0).
 * @returns UnsignedTransactionResult with the deposit instructions.
 */
export async function buildDeposit(
  connection: Connection,
  authority: PublicKey,
  feePayer: PublicKey,
  amountUsdc: bigint,
  traderPdaIndex = 0,
  traderSubaccountIndex = 0,
): Promise<UnsignedTransactionResult> {
  const client = await createPhoenixClient({
    rpcUrl: connection.rpcEndpoint,
  });

  const depositIxs = await client.ixs.buildDepositIxs({
    authority: authority.toBase58() as never,
    amount: amountUsdc,
    traderPdaIndex,
    traderSubaccountIndex,
  });

  const ixs = depositIxs.instructions.map((ix) =>
    phoenixIxToTransactionInstruction(
      ix as never,
      PHOENIX_PROGRAM_ID,
    ),
  );

  const serialized = await serializeUnsignedPhoenixTx(connection, feePayer, ixs);
  logger.debug('Phoenix deposit builder', { authority: authority.toBase58() as never, amountUsdc: amountUsdc.toString() });

  return buildPhoenixResult(serialized.transactionBase64, feePayer, ['buildDepositIxs']);
}

/**
 * Build an unsigned withdraw transaction for USDC collateral from a Phoenix trader account.
 *
 * @param connection — Solana RPC connection.
 * @param authority — Trader authority public key.
 * @param feePayer — Fee payer public key.
 * @param amountUsdc — Amount in human-readable USDC.
 * @param traderPdaIndex — Trader PDA index (default 0).
 * @param traderSubaccountIndex — Trader subaccount index (default 0).
 * @returns UnsignedTransactionResult with the withdraw instructions.
 */
export async function buildWithdraw(
  connection: Connection,
  authority: PublicKey,
  feePayer: PublicKey,
  amountUsdc: bigint,
  traderPdaIndex = 0,
  traderSubaccountIndex = 0,
): Promise<UnsignedTransactionResult> {
  const client = await createPhoenixClient({
    rpcUrl: connection.rpcEndpoint,
  });

  const withdrawIxs = await client.ixs.buildWithdrawIxs({
    authority: authority.toBase58() as never,
    amount: amountUsdc,
    traderPdaIndex,
    traderSubaccountIndex,
  });

  const ixs = withdrawIxs.instructions.map((ix) =>
    phoenixIxToTransactionInstruction(
      ix as never,
      PHOENIX_PROGRAM_ID,
    ),
  );

  const serialized = await serializeUnsignedPhoenixTx(connection, feePayer, ixs);
  logger.debug('Phoenix withdraw builder', { authority: authority.toBase58() as never, amountUsdc: amountUsdc.toString() });

  return buildPhoenixResult(serialized.transactionBase64, feePayer, ['buildWithdrawIxs']);
}

/**
 * Build an unsigned register trader transaction for Phoenix onboarding.
 *
 * @param connection — Solana RPC connection.
 * @param authority — Trader authority public key.
 * @param feePayer — Fee payer public key.
 * @param maxPositions — Maximum positions (default 8).
 * @returns UnsignedTransactionResult with the register trader instruction.
 */
export async function buildRegisterTrader(
  connection: Connection,
  authority: PublicKey,
  feePayer: PublicKey,
  maxPositions = 8,
): Promise<UnsignedTransactionResult> {
  const client = await createPhoenixClient({
    rpcUrl: connection.rpcEndpoint,
  });

  const registerIx = await client.ixs.buildRegisterTrader({
    authority: authority.toBase58() as never,
    marginType: MarginType.Cross,
    maxPositions: BigInt(maxPositions),
  } as never);

  const ix = phoenixIxToTransactionInstruction(
    registerIx as never,
    PHOENIX_PROGRAM_ID,
  );

  const serialized = await serializeUnsignedPhoenixTx(connection, feePayer, [ix]);
  logger.debug('Phoenix register trader builder', { authority: authority.toBase58() as never });

  return buildPhoenixResult(serialized.transactionBase64, feePayer, ['buildRegisterTrader']);
}