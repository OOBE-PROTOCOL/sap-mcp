#!/usr/bin/env node
/**
 * @name sap-mcp-server
 * @description npx-safe bootstrap for the SAP MCP local server CLI.
 */
import { installPackageNodePath } from '@oobe-protocol-labs/sap-mcp-runtime/module-resolution';

installPackageNodePath(import.meta.url);
await import('../../../src/cli.js');
