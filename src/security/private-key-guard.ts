/**
 * Private key guard - prevents key exposure
 */

const PRIVATE_KEY_PATTERNS = [
  /secret[_-]?key/i,
  /private[_-]?key/i,
  /mnemonic/i,
  /seed[_-]?phrase/i,
];

/**
 * Executes the private key guard operation.
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
