import { describe, expect, it } from 'vitest';
import { normalizeAgentKitToolInput, normalizeJupiterProtocolToolInput } from './client-sdk-tools.js';

describe('AgentKit tool input normalization', () => {
  it('accepts common wallet aliases for SPL token account reads', () => {
    expect(normalizeAgentKitToolInput('spl-token_getTokenAccounts', {
      owner: 'Wallet111111111111111111111111111111111111',
      mint: 'Mint1111111111111111111111111111111111111',
    })).toEqual({
      owner: 'Wallet111111111111111111111111111111111111',
      wallet: 'Wallet111111111111111111111111111111111111',
      mint: 'Mint1111111111111111111111111111111111111',
    });
  });

  it('does not override canonical wallet input', () => {
    expect(normalizeAgentKitToolInput('spl-token_getBalance', {
      owner: 'WrongWallet1111111111111111111111111111111',
      wallet: 'RightWallet111111111111111111111111111111',
    })).toEqual({
      owner: 'WrongWallet1111111111111111111111111111111',
      wallet: 'RightWallet111111111111111111111111111111',
    });
  });

  it('leaves unrelated tool inputs unchanged', () => {
    const input = { owner: 'abc' };
    const result = normalizeAgentKitToolInput('das_getAssetsByOwner', input);
    expect(result).toEqual(input);
  });

  it('accepts common Jupiter price aliases before SDK schema validation', () => {
    expect(normalizeJupiterProtocolToolInput('jupiter_getPrice', {
      mint: 'So11111111111111111111111111111111111111112',
    })).toEqual({
      mint: 'So11111111111111111111111111111111111111112',
      ids: ['So11111111111111111111111111111111111111112'],
    });
  });

  it('does not override canonical Jupiter ids input', () => {
    expect(normalizeJupiterProtocolToolInput('jupiter_getPrice', {
      mint: 'WrongMint111111111111111111111111111111111',
      ids: ['RightMint111111111111111111111111111111111'],
    })).toEqual({
      mint: 'WrongMint111111111111111111111111111111111',
      ids: ['RightMint111111111111111111111111111111111'],
    });
  });
});
