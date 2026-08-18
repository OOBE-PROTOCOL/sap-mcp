/**
 * @name server/server-metadata
 * @description Static server metadata and capability counts for the SAP MCP server.
 *
 * Provides the package-level metadata (name, version, author, license, repository)
 * and a summary of registered capability counts by category.
 *
 * @module server/server-metadata
 */

import {
  MCP_SERVER_DESCRIPTION,
  MCP_SERVER_ICON_URL,
  MCP_SERVER_NAME,
  MCP_SERVER_TITLE,
  MCP_SERVER_VERSION,
  MCP_SERVER_WEBSITE_URL,
} from '@oobe-protocol-labs/sap-mcp-core/constants';

/**
 * @name SERVER_METADATA
 * @description Static metadata describing the SAP MCP server package.
 *
 * @property name        — Server identifier name.
 * @property title       — Human-readable server title.
 * @property version     — Semver version string.
 * @property description — Server description for MCP clients.
 * @property author      — Author or organization name.
 * @property license     — SPDX license identifier.
 * @property homepage    — Homepage URL.
 * @property repository  — Source code repository URL.
 * @property bugs        — Issue tracker URL.
 * @property icon        — Icon URL for MCP client display.
 *
 * @usedBy `server/index.ts`, health and info endpoints.
 */
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
 * @name CAPABILITIES
 * @description Summary of registered MCP capabilities and their category counts.
 *
 * @property tools.count       — Total number of registered tools.
 * @property tools.categories  — Tool counts by category (sap, sns, agentKit, etc.).
 *
 * @usedBy `server/index.ts`, monitoring and health endpoints.
 */
/**
 * @name CAPABILITIES
 * @description Summary of registered MCP capabilities and their category counts.
 *
 * `tools.count` is a static fallback used when the server is not yet
 * initialized. For the real count, use `getDynamicToolCount(server)`.
 *
 * @property tools.count       — Total number of registered tools (static fallback).
 * @property tools.categories  — Tool counts by category (sap, sns, agentKit, etc.).
 *
 * @usedBy `server/index.ts`, monitoring and health endpoints.
 */
export const CAPABILITIES = {
  tools: {
    /** Static fallback count. Use getDynamicToolCount() for the real count. */
    count: 365,
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
      premium: 17,
      quickContext: 1,
      perps: 9,
      adrena: 36,
    },
  },
};
