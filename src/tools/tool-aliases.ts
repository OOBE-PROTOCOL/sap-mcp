/**
 * @name ToolAliases
 * @description Canonicalizes MCP tool names that some clients normalize by replacing hyphens with underscores.
 */

const CLIENT_NORMALIZED_PREFIX_ALIASES: readonly [aliasPrefix: string, canonicalPrefix: string][] = [
  ['spl_token_', 'spl-token_'],
  ['metaplex_nft_', 'metaplex-nft_'],
  ['send_arcade_', 'send-arcade_'],
  ['raydium_pools_', 'raydium-pools_'],
];

/**
 * @name canonicalizeToolName
 * @description Maps known client-normalized tool aliases back to the registered SAP MCP tool name.
 */
export function canonicalizeToolName(toolName: string): string {
  for (const [aliasPrefix, canonicalPrefix] of CLIENT_NORMALIZED_PREFIX_ALIASES) {
    if (toolName.startsWith(aliasPrefix)) {
      return `${canonicalPrefix}${toolName.slice(aliasPrefix.length)}`;
    }
  }

  return toolName;
}
