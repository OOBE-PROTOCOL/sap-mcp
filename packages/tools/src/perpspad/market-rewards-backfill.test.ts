import { Keypair } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { backfillMarketRewardTransfers, discoverMintHolders, prepareMarketRewardEpoch } from './market-rewards-backfill.js';

function jsonResponse(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('Market Rewards pull backfill', () => {
  it('discovers finalized token-account owners and preserves checkpoint owners', async () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const current = Keypair.generate().publicKey;
    const exited = Keypair.generate().publicKey.toBase58();
    const data = Buffer.alloc(72);
    current.toBuffer().copy(data, 32);
    const fetchImpl = async () => jsonResponse([{ pubkey: Keypair.generate().publicKey.toBase58(), account: { data: [data.toString('base64'), 'base64'] } }]);
    const owners = await discoverMintHolders({ rpcUrl: 'https://rpc.example', mint, checkpointOwners: [exited], fetchImpl: fetchImpl as typeof fetch });
    expect(owners).toEqual([current.toBase58(), exited].sort());
  });

  it('deduplicates signatures and derives exact owner deltas from token balances', async () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const alice = Keypair.generate().publicKey.toBase58();
    const bob = Keypair.generate().publicKey.toBase58();
    const accounts = [Keypair.generate().publicKey.toBase58(), Keypair.generate().publicKey.toBase58()];
    const requests: unknown[] = [];
    const fetchImpl = async (_url: URL | RequestInfo, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      requests.push(request);
      if (request.method === 'getSignaturesForAddress') return jsonResponse([{ signature: 'sig', slot: 12, blockTime: 120, err: null }]);
      return jsonResponse({ slot: 12, blockTime: 120, meta: {
        err: null,
        preTokenBalances: [{ mint, owner: alice, uiTokenAmount: { amount: '9' } }],
        postTokenBalances: [{ mint, owner: bob, uiTokenAmount: { amount: '9' } }],
      } });
    };
    const result = await backfillMarketRewardTransfers({ rpcUrl: 'https://rpc.example', mint, tokenAccounts: [...accounts, accounts[0]!], fromSlot: 10, throughSlot: 20, fetchImpl: fetchImpl as typeof fetch });
    expect(result.pagesFetched).toBe(2);
    expect(result.holdersScanned).toBe(2);
    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.deltaRaw).sort()).toEqual([-9n, 9n]);
    expect(requests).toHaveLength(3);
  });

  it('retries rate limits without duplicating a partially fetched page', async () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const owner = Keypair.generate().publicKey.toBase58();
    let attempts = 0;
    const delays: number[] = [];
    const fetchImpl = async () => {
      attempts++;
      if (attempts === 1) return new Response('', { status: 429 });
      if (attempts === 2) return jsonResponse([{ signature: 'mint', slot: 4, blockTime: 40, err: null }]);
      return jsonResponse({ slot: 4, blockTime: 40, meta: { err: null, preTokenBalances: [], postTokenBalances: [{ mint, owner, uiTokenAmount: { amount: '1' } }] } });
    };
    const result = await backfillMarketRewardTransfers({
      rpcUrl: 'https://rpc.example', mint, tokenAccounts: [Keypair.generate().publicKey.toBase58()], fromSlot: 1, throughSlot: 5,
      fetchImpl: fetchImpl as typeof fetch, sleep: async (milliseconds) => { delays.push(milliseconds); },
    });
    expect(attempts).toBe(3);
    expect(delays).toEqual([250]);
    expect(result.events).toHaveLength(1);
  });

  it('stages an exact cumulative epoch checkpoint without persisting it', async () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const owner = Keypair.generate().publicKey;
    const tokenAccount = Keypair.generate().publicKey.toBase58();
    const account = Buffer.alloc(72);
    owner.toBuffer().copy(account, 32);
    const fetchImpl = async (_url: URL | RequestInfo, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string };
      if (request.method === 'getProgramAccounts') return jsonResponse([{ pubkey: tokenAccount, account: { data: [account.toString('base64'), 'base64'] } }]);
      if (request.method === 'getSignaturesForAddress') return jsonResponse([{ signature: 'mint', slot: 2, blockTime: 110, err: null }]);
      return jsonResponse({ slot: 2, blockTime: 110, meta: { err: null, preTokenBalances: [], postTokenBalances: [{ mint, owner: owner.toBase58(), uiTokenAmount: { amount: '100' } }] } });
    };
    const prepared = await prepareMarketRewardEpoch({
      rpcUrl: 'https://rpc.example',
      checkpoint: { mint, throughSlot: 1, throughTimestamp: 100, balances: {}, cumulativeAllocations: {} },
      throughSlot: 3, throughTimestamp: 200, rewardAmount: 17n, fetchImpl: fetchImpl as typeof fetch,
    });
    expect(prepared.cumulativeTotal).toBe(17n);
    expect(prepared.stagedCheckpoint.balances[owner.toBase58()]).toBe('100');
    expect(prepared.stagedCheckpoint.cumulativeAllocations[owner.toBase58()]).toBe('17');
    expect(prepared.backfill.holdersScanned).toBe(1);
  });
});
