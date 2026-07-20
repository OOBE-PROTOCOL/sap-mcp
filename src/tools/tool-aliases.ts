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

const CLIENT_NORMALIZED_EXACT_ALIASES: Readonly<Record<string, string>> = {
  sol_getBalance: 'sol_get_balance',
};

/**
 * @name canonicalizeToolName
 * @description Maps known client-normalized tool aliases back to the registered SAP MCP tool name.
 */
export function canonicalizeToolName(toolName: string): string {
  const exactAlias = CLIENT_NORMALIZED_EXACT_ALIASES[toolName];
  if (exactAlias) {
    return exactAlias;
  }

  for (const [aliasPrefix, canonicalPrefix] of CLIENT_NORMALIZED_PREFIX_ALIASES) {
    if (toolName.startsWith(aliasPrefix)) {
      return `${canonicalPrefix}${toolName.slice(aliasPrefix.length)}`;
    }
  }

  return toolName;
}
