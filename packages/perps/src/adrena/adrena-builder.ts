/**
 * @name perps/adrena/adrena-builder
 * @description Barrel re-export for the Adrena perps builder modules.
 *
 * The original monolithic builder has been split into focused modules:
 *   - adrena-builder-core.ts       — types, IDL loading, helpers, utilities
 *   - adrena-builder-trading.ts    — position open/close, SL/TP, limit orders
 *   - adrena-builder-liquidity.ts  — add/remove liquidity, swap
 *   - adrena-builder-staking.ts    — staking init, liquid/locked stake, claim
 *   - adrena-builder-commodity.ts  — commodity (XAU/XAG/WTI) positions
 *
 * This barrel preserves the original public API — `export * from './adrena-builder.js'`
 * in index.ts continues to re-export everything.
 *
 * @module perps/adrena/adrena-builder
 */

export * from './adrena-builder-core.js';
export * from './adrena-builder-trading.js';
export * from './adrena-builder-liquidity.js';
export * from './adrena-builder-staking.js';
export * from './adrena-builder-commodity.js';