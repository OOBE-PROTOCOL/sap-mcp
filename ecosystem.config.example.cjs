/**
 * SAP MCP Server PM2 ecosystem shape example.
 *
 * This file is intentionally non-production and uses placeholders. Copy it into a
 * private infrastructure repository before adding real paths, ports, recipients,
 * RPC providers, auth tokens, or signer locations.
 */
module.exports = {
  apps: [
    {
      name: 'sap-mcp-remote',
      script: 'dist/remote/server.js',
      cwd: '<repo-root>',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        SAP_MCP_HOST: '<private-listener-host>',
        SAP_MCP_PORT: '<private-listener-port>',
        SAP_MCP_AUTH_TYPE: 'none',
        SAP_MCP_PROFILE: '<hosted-profile-name>',
        SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
        SAP_MCP_LOG_LEVEL: 'info',
        SAP_MCP_LOG_FORMAT: 'json',
        SAP_MCP_MONETIZATION_ENABLED: 'true',
        SAP_MCP_MONETIZATION_PROVIDER: 'x402',
        SAP_MCP_MONETIZATION_PAY_TO: '<revenue-recipient>',
        SAP_MCP_X402_FACILITATOR_URL: '<private-or-hosted-facilitator-url>',
        SAP_MCP_X402_FACILITATOR_AUTH_TOKEN: '<private-facilitator-auth-token>',
      },
    },
    {
      name: 'sap-mcp-facilitator',
      script: 'dist/payments/oobe-facilitator-server.js',
      args: 'start',
      cwd: '<repo-root>',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        SAP_MCP_FACILITATOR_HOST: '<private-listener-host>',
        SAP_MCP_FACILITATOR_PORT: '<private-listener-port>',
        SAP_MCP_FACILITATOR_PATH_PREFIX: '<facilitator-path-prefix>',
        SAP_MCP_FACILITATOR_NETWORKS: '<enabled-networks>',
        SAP_MCP_FACILITATOR_RPC_URL: '<private-rpc-url>',
        SAP_MCP_FACILITATOR_SIGNER_PATH: '<private-facilitator-signer-path>',
        SAP_MCP_FACILITATOR_AUTH_TOKEN: '<private-facilitator-auth-token>',
        SAP_MCP_LOG_LEVEL: 'info',
        SAP_MCP_LOG_FORMAT: 'json',
      },
    },
  ],
};
