import { createHash } from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import {
  allocateRewardExact,
  buildCumulativeRewardTree,
  computeBalanceSeconds,
  rewardLeafHash,
} from './market-rewards-indexer.js';

function parent(left: Buffer, right: Buffer): Buffer {
  const [first, second] = Buffer.compare(left, right) <= 0 ? [left, right] : [right, left];
  return createHash('sha256').update(first).update(second).digest();
}

describe('Market Rewards balance-seconds indexer', () => {
  it('deduplicates finalized events and integrates balances over time', () => {
    const alice = Keypair.generate().publicKey.toBase58();
    const bob = Keypair.generate().publicKey.toBase58();
    const event = { signature: 'sig-a', eventIndex: 0, slot: 10, timestamp: 110, owner: alice, deltaRaw: 100n };
    const weights = computeBalanceSeconds({
      startTimestamp: 100,
      endTimestamp: 200,
      events: [event, event, { signature: 'sig-b', eventIndex: 0, slot: 20, timestamp: 150, owner: bob, deltaRaw: 50n }],
    });
    expect(new Map(weights.map((item) => [item.owner, item.balanceSeconds])).get(alice)).toBe(9_000n);
    expect(new Map(weights.map((item) => [item.owner, item.balanceSeconds])).get(bob)).toBe(2_500n);
  });

  it('conserves every raw reward unit with deterministic remainder handling', () => {
    const a = Keypair.generate().publicKey.toBase58();
    const b = Keypair.generate().publicKey.toBase58();
    const allocations = allocateRewardExact([
      { owner: a, balanceSeconds: 2n },
      { owner: b, balanceSeconds: 1n },
    ], 10n);
    expect([...allocations.values()].reduce((sum, value) => sum + value, 0n)).toBe(10n);
    expect(allocations.get(a)).toBe(7n);
    expect(allocations.get(b)).toBe(3n);
  });

  it('builds cumulative proofs compatible with the on-chain sorted-pair verifier', () => {
    const mint = Keypair.generate().publicKey;
    const owners = [Keypair.generate().publicKey, Keypair.generate().publicKey, Keypair.generate().publicKey];
    const tree = buildCumulativeRewardTree({
      tokenMint: mint,
      previousAllocations: new Map([[owners[0]!.toBase58(), 4n]]),
      epochAllocations: new Map(owners.map((owner, index) => [owner.toBase58(), BigInt(index + 1)])),
    });
    expect(tree.cumulativeTotal).toBe(10n);
    for (const leaf of tree.leaves) {
      let node = rewardLeafHash(mint, new PublicKey(leaf.owner), leaf.cumulativeAllocation);
      for (const sibling of leaf.proof) node = parent(node, sibling);
      expect(node.equals(tree.root)).toBe(true);
    }
  });

  it('rejects negative reconstructed balances', () => {
    expect(() => computeBalanceSeconds({
      startTimestamp: 100,
      endTimestamp: 200,
      events: [{ signature: 'bad', eventIndex: 0, slot: 1, timestamp: 110, owner: Keypair.generate().publicKey.toBase58(), deltaRaw: -1n }],
    })).toThrow(/negative balance/);
  });
});
