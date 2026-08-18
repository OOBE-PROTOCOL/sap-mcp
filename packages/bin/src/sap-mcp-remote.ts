#!/usr/bin/env node
/**
 * @name sap-mcp-remote
 * @description npx-safe bootstrap for the SAP MCP Streamable HTTP server.
 */
import { installPackageNodePath } from '@oobe-protocol-labs/sap-mcp-runtime/module-resolution';

installPackageNodePath(import.meta.url);
const { startRemoteMcpServerProcess } = await import('../../hosted-gateway/src/server.js');
await startRemoteMcpServerProcess();
