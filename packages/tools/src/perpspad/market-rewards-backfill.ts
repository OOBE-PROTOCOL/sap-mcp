import { PublicKey } from '@solana/web3.js';
import type { BalanceEvent } from './market-rewards-indexer.js';
import { allocateRewardExact, buildCumulativeRewardTree, replayBalanceSeconds } from './market-rewards-indexer.js';

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export interface MarketRewardsCheckpoint {
  mint: string;
  throughSlot: number;
  throughTimestamp: number;
  balances: Record<string, string>;
  cumulativeAllocations: Record<string, string>;
  trackedTokenAccounts?: string[];
}

export interface BackfillResult {
  events: BalanceEvent[];
  holdersScanned: number;
  pagesFetched: number;
  throughSlot: number;
}

export interface MintAccountDiscovery {
  owners: string[];
  tokenAccounts: string[];
}

export interface PreparedMarketRewardEpoch {
  root: Buffer;
  datasetHash: Buffer;
  cumulativeTotal: bigint;
  leaves: Array<{ owner: string; cumulativeAllocation: bigint; proof: Buffer[] }>;
  stagedCheckpoint: MarketRewardsCheckpoint;
  backfill: BackfillResult;
}

type FetchLike = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;

function assertRpcUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('market rewards RPC URL must use HTTPS');
  return url;
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[], fetchImpl: FetchLike, sleep: Sleep): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetchImpl(assertRpcUrl(rpcUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) throw new Error(`${method} HTTP ${response.status}`);
        throw Object.assign(new Error(`${method} HTTP ${response.status}`), { retryable: true });
      }
      const body = await response.json() as { result?: T; error?: { code?: number; message?: string } };
      if (body.error || body.result === undefined) {
        const error = Object.assign(new Error(`${method}: ${body.error?.message ?? 'missing result'}`), {
          retryable: body.error?.code === -32005,
        });
        throw error;
      }
      return body.result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable = (error as { retryable?: boolean }).retryable === true || error instanceof TypeError;
      if (!retryable || attempt === 3) break;
      await sleep(250 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error(`${method} failed`);
}

function decodeOwner(base64Data: string): string {
  const data = Buffer.from(base64Data, 'base64');
  if (data.length < 64) throw new Error('invalid SPL token account data');
  return new PublicKey(data.subarray(32, 64)).toBase58();
}

export async function discoverMintAccounts(params: {
  rpcUrl: string;
  mint: string;
  checkpointOwners?: Iterable<string>;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
  tokenProgramIds?: string[];
}): Promise<MintAccountDiscovery> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const sleep = params.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const mint = new PublicKey(params.mint).toBase58();
  const owners = new Set(params.checkpointOwners ?? []);
  const tokenAccounts = new Set<string>();
  const programs = params.tokenProgramIds ?? [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  for (const program of programs) {
    const result = await rpc<Array<{ pubkey: string; account: { data: [string, string] } }>>(
      params.rpcUrl,
      'getProgramAccounts',
      [program, { commitment: 'finalized', encoding: 'base64', dataSlice: { offset: 0, length: 72 }, filters: [{ memcmp: { offset: 0, bytes: mint } }] }],
      fetchImpl,
      sleep,
    );
    for (const row of result) {
      owners.add(decodeOwner(row.account.data[0]));
      tokenAccounts.add(new PublicKey(row.pubkey).toBase58());
    }
  }
  return { owners: [...owners].sort(), tokenAccounts: [...tokenAccounts].sort() };
}

export async function discoverMintHolders(params: Parameters<typeof discoverMintAccounts>[0]): Promise<string[]> {
  return (await discoverMintAccounts(params)).owners;
}

export async function backfillMarketRewardTransfers(params: {
  rpcUrl: string;
  mint: string;
  tokenAccounts: string[];
  fromSlot: number;
  throughSlot: number;
  pageLimit?: number;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
}): Promise<BackfillResult> {
  if (!Number.isSafeInteger(params.fromSlot) || !Number.isSafeInteger(params.throughSlot) || params.throughSlot < params.fromSlot) {
    throw new Error('invalid backfill slot range');
  }
  const fetchImpl = params.fetchImpl ?? fetch;
  const sleep = params.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const pageLimit = params.pageLimit ?? 1_000;
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 1_000) throw new Error('pageLimit must be between 1 and 1000');
  const signatures = new Map<string, { signature: string; slot: number; blockTime: number | null }>();
  let pagesFetched = 0;
  for (const tokenAccount of [...new Set(params.tokenAccounts)].sort()) {
    let before: string | undefined;
    do {
      const result = await rpc<Array<{ signature: string; slot: number; blockTime: number | null; err: unknown }>>(params.rpcUrl, 'getSignaturesForAddress', [tokenAccount, {
        commitment: 'finalized', limit: pageLimit, ...(before ? { before } : {}),
      }], fetchImpl, sleep);
      pagesFetched++;
      for (const item of result) if (!item.err && item.slot >= params.fromSlot && item.slot <= params.throughSlot) signatures.set(item.signature, item);
      before = result.at(-1)?.signature;
      if (result.length === 0 || result.length < pageLimit || result.at(-1)!.slot < params.fromSlot) before = undefined;
    } while (before);
  }
  const events: BalanceEvent[] = [];
  for (const item of [...signatures.values()].sort((a, b) => a.slot - b.slot || a.signature.localeCompare(b.signature))) {
    const transaction = await rpc<{
      slot: number; blockTime: number | null;
      meta: { err: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null;
    } | null>(params.rpcUrl, 'getTransaction', [item.signature, {
      commitment: 'finalized', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0,
    }], fetchImpl, sleep);
    if (!transaction?.meta || transaction.meta.err || transaction.blockTime === null) continue;
    const pre = balancesByOwner(transaction.meta.preTokenBalances ?? [], params.mint);
    const post = balancesByOwner(transaction.meta.postTokenBalances ?? [], params.mint);
    const owners = [...new Set([...pre.keys(), ...post.keys()])].sort();
    owners.forEach((owner, index) => {
      const deltaRaw = (post.get(owner) ?? 0n) - (pre.get(owner) ?? 0n);
      if (deltaRaw !== 0n) events.push({ signature: item.signature, eventIndex: index, slot: transaction.slot, timestamp: transaction.blockTime!, owner, deltaRaw });
    });
  }
  return {
    events,
    holdersScanned: new Set(params.tokenAccounts).size,
    pagesFetched,
    throughSlot: params.throughSlot,
  };
}

interface TokenBalance { mint: string; owner?: string; uiTokenAmount: { amount: string } }

function balancesByOwner(rows: TokenBalance[], mint: string): Map<string, bigint> {
  const balances = new Map<string, bigint>();
  for (const row of rows) {
    if (row.mint !== mint || !row.owner || !/^\d+$/.test(row.uiTokenAmount.amount)) continue;
    balances.set(row.owner, (balances.get(row.owner) ?? 0n) + BigInt(row.uiTokenAmount.amount));
  }
  return balances;
}

export function checkpointMaps(checkpoint: MarketRewardsCheckpoint): {
  balances: Map<string, bigint>;
  cumulativeAllocations: Map<string, bigint>;
} {
  return {
    balances: new Map(Object.entries(checkpoint.balances).map(([owner, amount]) => [owner, BigInt(amount)])),
    cumulativeAllocations: new Map(Object.entries(checkpoint.cumulativeAllocations).map(([owner, amount]) => [owner, BigInt(amount)])),
  };
}

export async function prepareMarketRewardEpoch(params: {
  rpcUrl: string;
  checkpoint: MarketRewardsCheckpoint;
  throughSlot: number;
  throughTimestamp: number;
  rewardAmount: bigint;
  excludedOwners?: ReadonlySet<string>;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
}): Promise<PreparedMarketRewardEpoch> {
  if (params.checkpoint.mint !== new PublicKey(params.checkpoint.mint).toBase58()) throw new Error('invalid checkpoint mint');
  if (params.throughTimestamp <= params.checkpoint.throughTimestamp) throw new Error('epoch timestamp must advance');
  const previous = checkpointMaps(params.checkpoint);
  const discovery = await discoverMintAccounts({
    rpcUrl: params.rpcUrl,
    mint: params.checkpoint.mint,
    checkpointOwners: previous.balances.keys(),
    fetchImpl: params.fetchImpl,
    sleep: params.sleep,
  });
  const backfill = await backfillMarketRewardTransfers({
    rpcUrl: params.rpcUrl,
    mint: params.checkpoint.mint,
    tokenAccounts: [...new Set([...(params.checkpoint.trackedTokenAccounts ?? []), ...discovery.tokenAccounts])],
    fromSlot: params.checkpoint.throughSlot + 1,
    throughSlot: params.throughSlot,
    fetchImpl: params.fetchImpl,
    sleep: params.sleep,
    pageLimit: Number(process.env.MARKET_REWARDS_BACKFILL_PAGE_LIMIT ?? 1_000),
  });
  const replay = replayBalanceSeconds({
    events: backfill.events,
    startTimestamp: params.checkpoint.throughTimestamp,
    endTimestamp: params.throughTimestamp,
    initialBalances: previous.balances,
    excludedOwners: params.excludedOwners,
  });
  const epochAllocations = allocateRewardExact(replay.weights, params.rewardAmount);
  const tree = buildCumulativeRewardTree({
    tokenMint: new PublicKey(params.checkpoint.mint),
    previousAllocations: previous.cumulativeAllocations,
    epochAllocations,
  });
  return {
    ...tree,
    backfill,
    stagedCheckpoint: {
      mint: params.checkpoint.mint,
      throughSlot: params.throughSlot,
      throughTimestamp: params.throughTimestamp,
      balances: Object.fromEntries([...replay.endBalances].map(([owner, amount]) => [owner, amount.toString()])),
      cumulativeAllocations: Object.fromEntries(tree.leaves.map((leaf) => [leaf.owner, leaf.cumulativeAllocation.toString()])),
      trackedTokenAccounts: [...new Set([...(params.checkpoint.trackedTokenAccounts ?? []), ...discovery.tokenAccounts])].sort(),
    },
  };
}
