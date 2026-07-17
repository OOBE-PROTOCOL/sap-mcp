import { describe, expect, it } from 'vitest';
import { normalizeAgentKitToolInput } from './client-sdk-tools.js';

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
    expect(normalizeAgentKitToolInput('das_getAssetsByOwner', input)).toBe(input);
  });
});
