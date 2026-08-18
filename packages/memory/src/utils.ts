/**
 * @module memory/utils
 * @description Utility functions for the memory subsystem.
 */

/**
 * @name truncate
 * @description Truncates a string to the specified byte length, ensuring it
 * doesn't end in the middle of a multi-byte UTF-8 sequence.
 * @param str - The string to truncate.
 * @param maxBytes - Maximum byte length.
 * @returns The truncated string.
 */
export function truncate(str: string, maxBytes: number): string {
  if (!str) return '';
  const buf = Buffer.from(str, 'utf-8');
  if (buf.length <= maxBytes) return str;
  return buf.subarray(0, maxBytes).toString('utf-8');
}

/**
 * @name decayRelevance
 * @description Computes the decayed relevance score based on days since creation.
 * @param initialScore - Initial relevance score (0-1).
 * @param createdAt - ISO 8601 timestamp of creation.
 * @param decayPerDay - Decay rate per day (e.g. 0.01 = 1% per day).
 * @returns Decayed relevance score, clamped to [0, 1].
 */
export function decayRelevance(
  initialScore: number,
  createdAt: string,
  decayPerDay: number,
): number {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const daysSince = (now - created) / (1000 * 60 * 60 * 24);
  const decayed = initialScore * Math.pow(1 - decayPerDay, daysSince);
  return Math.max(0, Math.min(1, decayed));
}

/**
 * @name isExpired
 * @description Checks if a memory record has expired.
 * @param expiresAt - ISO 8601 timestamp or null (null = never expires).
 * @returns True if the memory has expired.
 */
export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}