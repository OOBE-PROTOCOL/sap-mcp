/**
 * @name strategies/trade-journal
 * @description File-based trade journal for automatic trade tracking.
 *
 * Stores trade entries as JSON in ~/.config/mcp-sap/journal/YYYY-MM-DD.json.
 * Each entry captures: timestamp, type (open/close), market, side, collateral,
 * leverage, entry/exit price, SL/TP, tx signature, position address, fees, status.
 *
 * @module strategies/trade-journal
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { getPreferredConfigDir } from '../../config-runtime/src/paths.js';
import { logger } from '../../core/src/logger.js';

/** Trade journal entry. */
export interface TradeJournalEntry {
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Trade type: open, close, liquidation, sl_triggered, tp_triggered. */
  type: 'open' | 'close' | 'liquidation' | 'sl_triggered' | 'tp_triggered';
  /** Market symbol (e.g. BONK-PERP). */
  market: string;
  /** Position side: long or short. */
  side: 'long' | 'short';
  /** Collateral in USD. */
  collateralUsd: number;
  /** Leverage multiplier. */
  leverage: number;
  /** Entry or exit price in USD. */
  priceUsd: number;
  /** Stop loss price in USD (if set). */
  stopLossUsd?: number;
  /** Take profit price in USD (if set). */
  takeProfitUsd?: number;
  /** Transaction signature. */
  txSignature?: string;
  /** Position PDA address. */
  positionAddress?: string;
  /** Fees paid in USD (x402 + gas). */
  feesPaidUsd: number;
  /** Current status: open, closed, liquidated. */
  status: 'open' | 'closed' | 'liquidated';
  /** Optional P&L in USD (for close entries). */
  pnlUsd?: number;
  /** Optional notes. */
  notes?: string;
}

/** Query filters for the trade journal. */
export interface JournalQuery {
  /** Filter by market symbol. */
  market?: string;
  /** Filter by type. */
  type?: TradeJournalEntry['type'];
  /** Filter by status. */
  status?: TradeJournalEntry['status'];
  /** Start date (ISO 8601). */
  from?: string;
  /** End date (ISO 8601). */
  to?: string;
  /** Max number of results. */
  limit?: number;
}

/** Journal query result. */
export interface JournalQueryResult {
  entries: TradeJournalEntry[];
  count: number;
  totalPnlUsd?: number;
}

const JOURNAL_DIR = join(getPreferredConfigDir(), 'journal');

function ensureJournalDir(): void {
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true, mode: 0o700 });
  }
}

function getJournalFilePath(date: string): string {
  return join(JOURNAL_DIR, `${date}.jsonl`);
}

/**
 * Append a trade entry to the journal.
 * Entries are stored as JSONL (one JSON object per line) for append-only efficiency.
 */
export function appendTradeEntry(entry: TradeJournalEntry): { success: boolean; path: string } {
  ensureJournalDir();
  const date = entry.timestamp.slice(0, 10);
  const filePath = getJournalFilePath(date);
  const line = JSON.stringify(entry) + '\n';
  appendFileSync(filePath, line, 'utf-8');
  logger.info('Trade journal entry added', { type: entry.type, market: entry.market, path: filePath });
  return { success: true, path: filePath };
}

/**
 * Query the trade journal with filters.
 * Reads all journal files in the date range and filters entries.
 */
export function queryTradeJournal(query: JournalQuery): JournalQueryResult {
  ensureJournalDir();

  const files = readdirSync(JOURNAL_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse();

  const entries: TradeJournalEntry[] = [];
  const limit = query.limit ?? 100;

  for (const file of files) {
    if (entries.length >= limit) break;

    // Date filter: skip files outside range.
    const fileDate = file.replace('.jsonl', '');
    if (query.from && fileDate < query.from.slice(0, 10)) continue;
    if (query.to && fileDate > query.to.slice(0, 10)) continue;

    const filePath = join(JOURNAL_DIR, file);
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      if (entries.length >= limit) break;
      try {
        const entry = JSON.parse(line) as TradeJournalEntry;

        if (query.market && entry.market !== query.market) continue;
        if (query.type && entry.type !== query.type) continue;
        if (query.status && entry.status !== query.status) continue;
        if (query.from && entry.timestamp < query.from) continue;
        if (query.to && entry.timestamp > query.to) continue;

        entries.push(entry);
      } catch {
        // Skip malformed lines.
      }
    }
  }

  const totalPnlUsd = entries
    .filter(e => e.pnlUsd !== undefined)
    .reduce((sum, e) => sum + (e.pnlUsd ?? 0), 0);

  return {
    entries,
    count: entries.length,
    totalPnlUsd: totalPnlUsd !== 0 ? Math.round(totalPnlUsd * 1e6) / 1e6 : undefined,
  };
}