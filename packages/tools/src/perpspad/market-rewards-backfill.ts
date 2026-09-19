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
}

export interface HeliusTransfer {
  signature: string;
  slot: number;
  blockTime: number;
  type: 'transfer' | 'transferFee' | 'mint' | 'burn' | string;
  fromUserAccount: string | null;
  toUserAccount: string | null;
  mint: string;
  amount: string;
  confirmationStatus: string;
  transactionIdx?: number;
  instructionIdx?: number;
  innerInstructionIdx?: number;
}

export interface BackfillResult {
  events: BalanceEvent[];
  holdersScanned: number;
  pagesFetched: number;
  throughSlot: number;
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

export async function discoverMintHolders(params: {
  rpcUrl: string;
  mint: string;
  checkpointOwners?: Iterable<string>;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
  tokenProgramIds?: string[];
}): Promise<string[]> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const sleep = params.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const mint = new PublicKey(params.mint).toBase58();
  const owners = new Set(params.checkpointOwners ?? []);
  const programs = params.tokenProgramIds ?? [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  for (const program of programs) {
    const result = await rpc<Array<{ account: { data: [string, string] } }>>(
      params.rpcUrl,
      'getProgramAccounts',
      [program, { commitment: 'finalized', encoding: 'base64', dataSlice: { offset: 0, length: 72 }, filters: [{ memcmp: { offset: 0, bytes: mint } }] }],
      fetchImpl,
      sleep,
    );
    for (const row of result) owners.add(decodeOwner(row.account.data[0]));
  }
  return [...owners].sort();
}

function eventIndex(transfer: HeliusTransfer, side: 0 | 1): number {
  const transaction = transfer.transactionIdx ?? 0;
  const instruction = transfer.instructionIdx ?? 0;
  const inner = transfer.innerInstructionIdx ?? 0;
  return transaction * 2_000_000 + instruction * 2_000 + inner * 2 + side;
}

export function transfersToBalanceEvents(transfers: HeliusTransfer[], expectedMint: string): BalanceEvent[] {
  const events: BalanceEvent[] = [];
  for (const transfer of transfers) {
    if (transfer.mint !== expectedMint || transfer.confirmationStatus !== 'finalized') continue;
    if (!/^\d+$/.test(transfer.amount)) throw new Error(`invalid raw transfer amount in ${transfer.signature}`);
    const amount = BigInt(transfer.amount);
    if (amount === 0n) continue;
    if (transfer.fromUserAccount) events.push({
      signature: transfer.signature, eventIndex: eventIndex(transfer, 0), slot: transfer.slot,
      timestamp: transfer.blockTime, owner: transfer.fromUserAccount, deltaRaw: -amount,
    });
    if (transfer.toUserAccount) events.push({
      signature: transfer.signature, eventIndex: eventIndex(transfer, 1), slot: transfer.slot,
      timestamp: transfer.blockTime, owner: transfer.toUserAccount, deltaRaw: amount,
    });
  }
  return events;
}

export async function backfillMarketRewardTransfers(params: {
  heliusRpcUrl: string;
  mint: string;
  holders: string[];
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
  const pageLimit = params.pageLimit ?? 100;
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) throw new Error('pageLimit must be between 1 and 100');
  const transfers = new Map<string, HeliusTransfer>();
  let pagesFetched = 0;
  for (const holder of [...new Set(params.holders)].sort()) {
    let paginationToken: string | undefined;
    do {
      const result = await rpc<{ data: HeliusTransfer[]; paginationToken?: string }>(params.heliusRpcUrl, 'getTransfersByAddress', [holder, {
        mint: params.mint,
        sortOrder: 'asc',
        limit: pageLimit,
        ...(paginationToken ? { paginationToken } : {}),
        filters: { slot: { gte: params.fromSlot, lte: params.throughSlot }, status: 'succeeded' },
      }], fetchImpl, sleep);
      pagesFetched++;
      for (const transfer of result.data) {
        const key = [transfer.signature, transfer.transactionIdx ?? 0, transfer.instructionIdx ?? 0, transfer.innerInstructionIdx ?? 0, transfer.type].join(':');
        transfers.set(key, transfer);
      }
      paginationToken = result.paginationToken;
    } while (paginationToken);
  }
  return {
    events: transfersToBalanceEvents([...transfers.values()], params.mint),
    holdersScanned: new Set(params.holders).size,
    pagesFetched,
    throughSlot: params.throughSlot,
  };
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
  heliusRpcUrl: string;
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
  const holders = await discoverMintHolders({
    rpcUrl: params.rpcUrl,
    mint: params.checkpoint.mint,
    checkpointOwners: previous.balances.keys(),
    fetchImpl: params.fetchImpl,
    sleep: params.sleep,
  });
  const backfill = await backfillMarketRewardTransfers({
    heliusRpcUrl: params.heliusRpcUrl,
    mint: params.checkpoint.mint,
    holders,
    fromSlot: params.checkpoint.throughSlot + 1,
    throughSlot: params.throughSlot,
    fetchImpl: params.fetchImpl,
    sleep: params.sleep,
    pageLimit: Number(process.env.MARKET_REWARDS_BACKFILL_PAGE_LIMIT ?? 100),
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
    },
  };
}
