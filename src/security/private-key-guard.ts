/**
 * @name security/private-key-guard
 * @description Prevents private key material from leaking through SAP MCP tool responses.
 *
 * Scans serialized data for common private key patterns (secret keys, mnemonics,
 * seed phrases) and rejects responses that contain them.
 *
 * @flow
 *   1. Tool handlers call `privateKeyGuard` on response data before returning.
 *   2. If a private key pattern is detected, the response is blocked.
 *
 * @module security/private-key-guard
 */

/** @description Regex patterns that match common private key material names. */
const PRIVATE_KEY_PATTERNS = [
  /secret[_-]?key/i,
  /private[_-]?key/i,
  /mnemonic/i,
  /seed[_-]?phrase/i,
];

/**
 * @name privateKeyGuard
 * @description Scans data for potential private key material and returns a safety verdict.
 *
 * @param data — Arbitrary data to scan (will be JSON-stringified for pattern matching).
 * @returns `{ safe: true }` if no private key patterns are found; `{ safe: false, reason }` otherwise.
 *
 * @usedBy Tool handlers across the SAP MCP runtime.
 */
export function privateKeyGuard(data: unknown): { safe: boolean; reason?: string } {
  const str = JSON.stringify(data);
  
  for (const pattern of PRIVATE_KEY_PATTERNS) {
    if (pattern.test(str)) {
      return { safe: false, reason: 'Potential private key detected' };
    }
  }
  
  return { safe: true };
}