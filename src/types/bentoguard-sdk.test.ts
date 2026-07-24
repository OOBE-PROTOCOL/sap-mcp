import { describe, expectTypeOf, it } from 'vitest';
import type { BentoClient } from '@bentoguard/sdk';

describe('@bentoguard/sdk type declarations', () => {
  it('BentoClient type is importable', () => {
    // The ambient .d.ts declares this class — verifying it resolves
    expectTypeOf<BentoClient>().not.toBeNever();
  });
});