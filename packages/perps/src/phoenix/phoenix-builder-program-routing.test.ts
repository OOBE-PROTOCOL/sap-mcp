/**
 * @name phoenix-builder-program-routing.test
 * @description Regression guard: converted Phoenix SDK instructions MUST keep the
 * programAddress reported by the SDK (the perps program), never be re-routed to a
 * different Phoenix program. Sending perps instruction data to the wrong program
 * fails on-chain with InvalidInstructionData.
 */

import { describe, expect, it } from 'vitest';
import { phoenixIxToTransactionInstruction } from './phoenix-builder-core.js';
import { PHOENIX_PROGRAM_ID } from './phoenix-constants.js';

const PERPS_PROGRAM = 'EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih';
const WALLET = '4emrGb1fhQk8bQqheXhnFXxWT8XxwHCiC1zECc1FXVYD';
const PDA = '5vPU3rVCMRq8qjv5teTaveFnHZcBp5VACFXYhtGVLZwB';

function fakeSdkIx(programAddress: string): never {
  return {
    programAddress,
    accounts: [
      { address: WALLET, role: 3 },
      { address: PDA, role: 1 },
      { address: '11111111111111111111111111111111', role: 0 },
    ],
    data: new Uint8Array([75, 243, 224, 167, 1, 5, 51, 32, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  } as never;
}

describe('phoenixIxToTransactionInstruction program routing', () => {
  it('keeps the SDK programAddress when present (perps program)', () => {
    const converted = phoenixIxToTransactionInstruction(
      fakeSdkIx(PERPS_PROGRAM),
      PHOENIX_PROGRAM_ID,
    );
    expect(converted.programId.toBase58()).toBe(PERPS_PROGRAM);
  });

  it('falls back to the provided program id when SDK omits programAddress', () => {
    const converted = phoenixIxToTransactionInstruction(
      fakeSdkIx(undefined as unknown as string),
      PHOENIX_PROGRAM_ID,
    );
    expect(converted.programId.toBase58()).toBe(PHOENIX_PROGRAM_ID);
  });
});