/**
 * Server metadata
 */

export const SERVER_METADATA = {
  name: 'sap-mcp-server',
  version: '0.2.1',
  description: 'Official MCP gateway for OOBE Protocol SAP',
  author: 'OOBE Protocol Labs',
  license: 'MIT',
  homepage: 'https://github.com/oobe-protocol/sap-mcp-server',
  repository: 'https://github.com/oobe-protocol/sap-mcp-server',
  bugs: 'https://github.com/oobe-protocol/sap-mcp-server/issues',
};

/**
 * Shared capabilities definition used by the SAP MCP runtime.
 */
export const CAPABILITIES = {
  tools: {
    count: 248,
    categories: {
      sap: 75,
      sns: 13,
      agentKit: 110,
      compatibilityRpc: 1,
      networkStats: 1,
      transactions: 4,
      profiles: 4,
      skills: 3,
      chat: 8,
    },
  },
};
