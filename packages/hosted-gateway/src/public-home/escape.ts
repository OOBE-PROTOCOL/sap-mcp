/**
 * @name escapeHtml
 * @description Escapes dynamic values before embedding them in public HTML.
 */
export function escapeHtml(value: string | number | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * @name escapeJsonForHtml
 * @description Escapes JSON-LD so script tags cannot be broken by embedded data.
 */
export function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}
