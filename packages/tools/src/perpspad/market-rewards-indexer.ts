import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';

export interface BalanceEvent {
  signature: string;
  eventIndex: number;
  slot: number;
  timestamp: number;
  owner: string;
  deltaRaw: bigint;
}

export interface HolderWeight {
  owner: string;
  balanceSeconds: bigint;
}

export interface RewardLeaf {
  owner: string;
  cumulativeAllocation: bigint;
  hash: Buffer;
  proof: Buffer[];
}

const LEAF_DOMAIN = Buffer.from('oobe_market_rewards_v1');

function sha256(...parts: Buffer[]): Buffer {
  const hash = createHash('sha256');
  parts.forEach((part) => hash.update(part));
  return hash.digest();
}

export function rewardLeafHash(tokenMint: PublicKey, owner: PublicKey, allocation: bigint): Buffer {
  const amount = Buffer.alloc(8);
  amount.writeBigUInt64LE(allocation);
  return sha256(LEAF_DOMAIN, tokenMint.toBuffer(), owner.toBuffer(), amount);
}

export function computeBalanceSeconds(params: {
  events: BalanceEvent[];
  startTimestamp: number;
  endTimestamp: number;
  initialBalances?: ReadonlyMap<string, bigint>;
  excludedOwners?: ReadonlySet<string>;
}): HolderWeight[] {
  if (!Number.isInteger(params.startTimestamp) || !Number.isInteger(params.endTimestamp) || params.endTimestamp <= params.startTimestamp) {
    throw new Error('invalid snapshot window');
  }
  const balances = new Map(params.initialBalances ?? []);
  const lastTimestamp = new Map<string, number>();
  const weights = new Map<string, bigint>();
  for (const owner of balances.keys()) lastTimestamp.set(owner, params.startTimestamp);
  const seen = new Set<string>();
  const events = [...params.events].sort((a, b) => a.slot - b.slot || a.eventIndex - b.eventIndex || a.signature.localeCompare(b.signature));
  for (const event of events) {
    const id = `${event.signature}:${event.eventIndex}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!Number.isInteger(event.timestamp) || event.timestamp < params.startTimestamp || event.timestamp > params.endTimestamp) continue;
    if (params.excludedOwners?.has(event.owner)) continue;
    const previousTime = lastTimestamp.get(event.owner) ?? params.startTimestamp;
    const balance = balances.get(event.owner) ?? 0n;
    weights.set(event.owner, (weights.get(event.owner) ?? 0n) + balance * BigInt(event.timestamp - previousTime));
    const next = balance + event.deltaRaw;
    if (next < 0n) throw new Error(`negative balance for ${event.owner} at ${id}`);
    balances.set(event.owner, next);
    lastTimestamp.set(event.owner, event.timestamp);
  }
  for (const [owner, balance] of balances) {
    if (params.excludedOwners?.has(owner)) continue;
    const previousTime = lastTimestamp.get(owner) ?? params.startTimestamp;
    weights.set(owner, (weights.get(owner) ?? 0n) + balance * BigInt(params.endTimestamp - previousTime));
  }
  return [...weights]
    .filter(([, value]) => value > 0n)
    .map(([owner, balanceSeconds]) => ({ owner, balanceSeconds }))
    .sort((a, b) => a.owner.localeCompare(b.owner));
}

export function allocateRewardExact(weights: HolderWeight[], amount: bigint): Map<string, bigint> {
  if (amount <= 0n) throw new Error('reward amount must be positive');
  const totalWeight = weights.reduce((sum, item) => sum + item.balanceSeconds, 0n);
  if (totalWeight <= 0n) throw new Error('snapshot has no eligible holder weight');
  const ranked = weights.map((item) => {
    const numerator = item.balanceSeconds * amount;
    return { ...item, allocation: numerator / totalWeight, remainder: numerator % totalWeight };
  });
  let distributed = ranked.reduce((sum, item) => sum + item.allocation, 0n);
  ranked.sort((a, b) => a.remainder === b.remainder ? a.owner.localeCompare(b.owner) : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; distributed < amount; index++, distributed++) ranked[index % ranked.length]!.allocation += 1n;
  return new Map(ranked.map((item) => [item.owner, item.allocation]));
}

export function buildCumulativeRewardTree(params: {
  tokenMint: PublicKey;
  previousAllocations?: ReadonlyMap<string, bigint>;
  epochAllocations: ReadonlyMap<string, bigint>;
}): { root: Buffer; datasetHash: Buffer; leaves: RewardLeaf[]; cumulativeTotal: bigint } {
  const owners = new Set([...(params.previousAllocations?.keys() ?? []), ...params.epochAllocations.keys()]);
  const leaves = [...owners].sort().map((owner) => {
    const cumulativeAllocation = (params.previousAllocations?.get(owner) ?? 0n) + (params.epochAllocations.get(owner) ?? 0n);
    return { owner, cumulativeAllocation, hash: rewardLeafHash(params.tokenMint, new PublicKey(owner), cumulativeAllocation), proof: [] as Buffer[] };
  }).filter((leaf) => leaf.cumulativeAllocation > 0n);
  if (leaves.length === 0) throw new Error('cannot build an empty reward tree');
  let level = leaves.map((leaf, index) => ({ hash: leaf.hash, indexes: [index] }));
  while (level.length > 1) {
    const next: typeof level = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index]!;
      const right = level[index + 1] ?? left;
      if (left !== right) {
        left.indexes.forEach((leafIndex) => leaves[leafIndex]!.proof.push(right.hash));
        right.indexes.forEach((leafIndex) => leaves[leafIndex]!.proof.push(left.hash));
      } else {
        left.indexes.forEach((leafIndex) => leaves[leafIndex]!.proof.push(left.hash));
      }
      const [first, second] = Buffer.compare(left.hash, right.hash) <= 0 ? [left.hash, right.hash] : [right.hash, left.hash];
      next.push({ hash: sha256(first, second), indexes: left === right ? [...left.indexes] : [...left.indexes, ...right.indexes] });
    }
    level = next;
  }
  const dataset = Buffer.concat(leaves.flatMap((leaf) => {
    const amount = Buffer.alloc(8); amount.writeBigUInt64LE(leaf.cumulativeAllocation);
    return [new PublicKey(leaf.owner).toBuffer(), amount];
  }));
  return {
    root: level[0]!.hash,
    datasetHash: sha256(dataset),
    leaves,
    cumulativeTotal: leaves.reduce((sum, leaf) => sum + leaf.cumulativeAllocation, 0n),
  };
}
