import {
  MCP_SERVER_DESCRIPTION,
  MCP_SERVER_ICON_URL,
  MCP_SERVER_NAME,
  MCP_SERVER_TITLE,
  MCP_SERVER_VERSION,
  MCP_SERVER_WEBSITE_URL,
} from '../core/constants.js';

export const SERVER_METADATA = {
  name: MCP_SERVER_NAME,
  title: MCP_SERVER_TITLE,
  version: MCP_SERVER_VERSION,
  description: MCP_SERVER_DESCRIPTION,
  author: 'OOBE Protocol Labs',
  license: 'MIT',
  homepage: MCP_SERVER_WEBSITE_URL,
  repository: 'https://github.com/OOBE-PROTOCOL/sap-mcp',
  bugs: 'https://github.com/OOBE-PROTOCOL/sap-mcp/issues',
  icon: MCP_SERVER_ICON_URL,
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
