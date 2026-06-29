/**
 * Backwards-compatible config schema barrel.
 *
 * The authoritative runtime environment schema lives in `env.ts`; this module
 * only re-exports it so older imports keep receiving the current shape.
 */

export { envSchema } from './env.js';
export type { SapEnvConfig } from './env.js';
