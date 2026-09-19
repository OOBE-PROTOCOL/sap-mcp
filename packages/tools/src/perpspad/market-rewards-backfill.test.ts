import { Keypair } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { backfillMarketRewardTransfers, discoverMintHolders, prepareMarketRewardEpoch, transfersToBalanceEvents } from './market-rewards-backfill.js';

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
    const fetchImpl = async () => jsonResponse([{ account: { data: [data.toString('base64'), 'base64'] } }]);
    const owners = await discoverMintHolders({ rpcUrl: 'https://rpc.example', mint, checkpointOwners: [exited], fetchImpl: fetchImpl as typeof fetch });
    expect(owners).toEqual([current.toBase58(), exited].sort());
  });

  it('paginates in ascending slot order and deduplicates transfers seen for both wallets', async () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const alice = Keypair.generate().publicKey.toBase58();
    const bob = Keypair.generate().publicKey.toBase58();
    const transfer = { signature: 'sig', slot: 12, blockTime: 120, type: 'transfer', fromUserAccount: alice, toUserAccount: bob, mint, amount: '9', confirmationStatus: 'finalized', instructionIdx: 2 };
    const requests: unknown[] = [];
    const fetchImpl = async (_url: URL | RequestInfo, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { params: [string, { paginationToken?: string }] };
      requests.push(request);
      if (request.params[0] === alice && !request.params[1].paginationToken) return jsonResponse({ data: [transfer], paginationToken: 'next' });
      return jsonResponse({ data: [transfer] });
    };
    const result = await backfillMarketRewardTransfers({ heliusRpcUrl: 'https://mainnet.helius-rpc.com/?api-key=test', mint, holders: [bob, alice, alice], fromSlot: 10, throughSlot: 20, fetchImpl: fetchImpl as typeof fetch });
    expect(result.pagesFetched).toBe(3);
    expect(result.holdersScanned).toBe(2);
    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.deltaRaw).sort()).toEqual([-9n, 9n]);
    expect(requests).toHaveLength(3);
  });

  it('keeps only finalized transfers for the requested mint', () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const owner = Keypair.generate().publicKey.toBase58();
    const base = { signature: 'a', slot: 1, blockTime: 1, type: 'mint', fromUserAccount: null, toUserAccount: owner, mint, amount: '5', confirmationStatus: 'finalized' };
    expect(transfersToBalanceEvents([base, { ...base, signature: 'b', confirmationStatus: 'confirmed' }, { ...base, signature: 'c', mint: Keypair.generate().publicKey.toBase58() }], mint)).toHaveLength(1);
  });

  it('retries rate limits without duplicating a partially fetched page', async () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const owner = Keypair.generate().publicKey.toBase58();
    let attempts = 0;
    const delays: number[] = [];
    const fetchImpl = async () => {
      attempts++;
      if (attempts === 1) return new Response('', { status: 429 });
      return jsonResponse({ data: [{ signature: 'mint', slot: 4, blockTime: 40, type: 'mint', fromUserAccount: null, toUserAccount: owner, mint, amount: '1', confirmationStatus: 'finalized' }] });
    };
    const result = await backfillMarketRewardTransfers({
      heliusRpcUrl: 'https://mainnet.helius-rpc.com/?api-key=test', mint, holders: [owner], fromSlot: 1, throughSlot: 5,
      fetchImpl: fetchImpl as typeof fetch, sleep: async (milliseconds) => { delays.push(milliseconds); },
    });
    expect(attempts).toBe(2);
    expect(delays).toEqual([250]);
    expect(result.events).toHaveLength(1);
  });

  it('stages an exact cumulative epoch checkpoint without persisting it', async () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const owner = Keypair.generate().publicKey;
    const account = Buffer.alloc(72);
    owner.toBuffer().copy(account, 32);
    const fetchImpl = async (_url: URL | RequestInfo, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string };
      if (request.method === 'getProgramAccounts') return jsonResponse([{ account: { data: [account.toString('base64'), 'base64'] } }]);
      return jsonResponse({ data: [{
        signature: 'mint', slot: 2, blockTime: 110, type: 'mint', fromUserAccount: null,
        toUserAccount: owner.toBase58(), mint, amount: '100', confirmationStatus: 'finalized',
      }] });
    };
    const prepared = await prepareMarketRewardEpoch({
      rpcUrl: 'https://rpc.example', heliusRpcUrl: 'https://mainnet.helius-rpc.com/?api-key=test',
      checkpoint: { mint, throughSlot: 1, throughTimestamp: 100, balances: {}, cumulativeAllocations: {} },
      throughSlot: 3, throughTimestamp: 200, rewardAmount: 17n, fetchImpl: fetchImpl as typeof fetch,
    });
    expect(prepared.cumulativeTotal).toBe(17n);
    expect(prepared.stagedCheckpoint.balances[owner.toBase58()]).toBe('100');
    expect(prepared.stagedCheckpoint.cumulativeAllocations[owner.toBase58()]).toBe('17');
    expect(prepared.backfill.holdersScanned).toBe(1);
  });
});
