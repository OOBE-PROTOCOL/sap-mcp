/**
 * @name phoenix-builder-cu-limit.test
 * @description Regression guard: every unsigned Phoenix transaction MUST carry an
 * explicit SetComputeUnitLimit instruction. Without it the RPC default is 200k CU,
 * which Phoenix Eternal collateral flows exceed — the simulation then fails with
 * ComputationalBudgetExceeded and the approval gate blocks the user from signing
 * (2026-09-09 user report, verified live on mainnet: the same TX consumed
 * 200000/200000 CU and failed without the limit, passed with it).
 */

import { describe, expect, it } from 'vitest';
import { ComputeBudgetProgram, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';
import { serializeUnsignedPhoenixTx } from './phoenix-builder-core.js';

const FEE_PAYER = PublicKey.default;
const PROBE_IX: TransactionInstruction = {
  programId: new PublicKey('EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih'),
  keys: [],
  data: Buffer.from([0x75, 0xf3, 0xe0, 0xa7]),
};

describe('serializeUnsignedPhoenixTx compute-unit limit', () => {
  it('prepends SetComputeUnitLimit to every built transaction', async () => {
    const connection = {
      getLatestBlockhash: async () => ({
        blockhash: '11111111111111111111111111111111',
        lastValidBlockHeight: 9_999_999,
      }),
      // Simulation is best-effort; the probe instruction is not real.
      simulateTransaction: async () => ({ value: { err: null, logs: [] } }),
    } as never;
    const { transactionBase64 } = await serializeUnsignedPhoenixTx(
      connection, FEE_PAYER, [PROBE_IX],
    );
    const tx = Transaction.from(Buffer.from(transactionBase64, 'base64'));
    const budget = tx.instructions.filter(
      (ix) => ix.programId.toBase58() === ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 }).programId.toBase58(),
    );
    expect(budget.length).toBeGreaterThanOrEqual(1);
    // SetComputeUnitLimit: u8 tag (2) + u32 LE units.
    const limitIx = budget[0];
    expect(limitIx.data[0]).toBe(2);
    expect(limitIx.data.readUInt32LE(1)).toBe(1_400_000);
  });

  it('keeps the priority-fee instruction AFTER the CU limit when configured', async () => {
    process.env['SAP_MCP_PRIORITY_FEE_MICRO_LAMPORTS'] = '50_000'.replace(/_/g, '');
    const connection = {
      getLatestBlockhash: async () => ({
        blockhash: '11111111111111111111111111111111',
        lastValidBlockHeight: 9_999_999,
      }),
      simulateTransaction: async () => ({ value: { err: null, logs: [] } }),
    } as never;
    const { transactionBase64 } = await serializeUnsignedPhoenixTx(
      connection, FEE_PAYER, [PROBE_IX],
    );
    delete process.env['SAP_MCP_PRIORITY_FEE_MICRO_LAMPORTS'];
    const tx = Transaction.from(Buffer.from(transactionBase64, 'base64'));
    expect(tx.instructions.length).toBe(3);
    expect(tx.instructions[0].data[0]).toBe(2); // SetComputeUnitLimit first
    expect(tx.instructions[1].data[0]).toBe(3); // SetComputeUnitPrice second
  });
});