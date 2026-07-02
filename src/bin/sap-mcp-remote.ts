#!/usr/bin/env node
/**
 * @name sap-mcp-remote
 * @description npx-safe bootstrap for the SAP MCP Streamable HTTP server.
 */
import { installPackageNodePath } from '../runtime/module-resolution.js';

installPackageNodePath(import.meta.url);
const { startRemoteMcpServerProcess } = await import('../remote/server.js');
await startRemoteMcpServerProcess();
