/**
 * @name resource-templates
 * @description Dynamic MCP resource templates for SAP MCP Server.
 *
 * Resource templates allow the client to construct resource URIs with variable
 * parts. The server provides completion suggestions for each variable and
 * resolves the URI at read time.
 *
 * Templates exposed:
 *   - sap://agent/{pubkey}       Agent identity by pubkey
 *   - sap://domain/{domain}      SNS domain records
 *   - sap://position/{pubkey}    Adrena positions by wallet
 *   - sap://tx/{signature}       Transaction decode by signature
 *   - sap://memory/{key}         Agent memory entry by key
 *
 * @module resources/resource-templates
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../../core/src/logger.js';
import type { SapMcpContext } from '../../core/src/types.js';

/**
 * @name registerResourceTemplates
 * @description Registers dynamic resource templates with the MCP server.
 * These templates appear in `resources/templates/list` and clients can
 * construct URIs from them with autocompletion.
 */
export function registerResourceTemplates(server: Server, _context: SapMcpContext): void {
  logger.debug('Registering dynamic resource templates');

  // Template: sap://agent/{pubkey}
  // Client can autocomplete pubkeys from the agent registry
  const agentTemplate = new ResourceTemplate(
    'sap://agent/{pubkey}',
    {
      list: undefined,
      complete: {
        pubkey: (value: string) => {
          // Suggest known agent pubkeys from context
          if (!value || value.length < 8) return [];
          // Return partial matches - the full implementation would
          // query the SAP agent registry for known pubkeys
          return [value];
        },
      },
    },
  );

  // Template: sap://domain/{domain}
  // Client can autocomplete .sol domain names
  const domainTemplate = new ResourceTemplate(
    'sap://domain/{domain}',
    {
      list: undefined,
      complete: {
        domain: (value: string) => {
          const suggestions = ['oobe.sol', 'sap.sol', 'synapse.sol', 'solana.sol'];
          if (!value) return suggestions;
          return suggestions.filter(d => d.startsWith(value.toLowerCase()));
        },
      },
    },
  );

  // Template: sap://position/{pubkey}
  // Client can look up Adrena positions for a wallet
  const positionTemplate = new ResourceTemplate(
    'sap://position/{pubkey}',
    {
      list: undefined,
      complete: {
        pubkey: (value: string) => {
          if (!value || value.length < 8) return [];
          return [value];
        },
      },
    },
  );

  // Template: sap://tx/{signature}
  // Client can decode a specific transaction by signature
  const txTemplate = new ResourceTemplate(
    'sap://tx/{signature}',
    {
      list: undefined,
      complete: {
        signature: (value: string) => {
          if (!value || value.length < 16) return [];
          return [value];
        },
      },
    },
  );

  // Template: sap://memory/{key}
  // Client can read a specific memory entry by key
  const memoryTemplate = new ResourceTemplate(
    'sap://memory/{key}',
    {
      list: undefined,
      complete: {
        key: (value: string) => {
          // Suggest common memory keys
          const keys = ['agent_start', 'last_transaction', 'session_context', 'trade_journal'];
          if (!value) return keys;
          return keys.filter(k => k.startsWith(value.toLowerCase()));
        },
      },
    },
  );

  // Register all templates with the server.
  // Use the deprecated `resource()` method since it's what the current
  // SDK version exposes for template registration. The handler reads
  // the URI variables and resolves the resource.
  // Guard: some test mocks use the low-level Server without `resource()`.
  const serverWithResource = server as unknown as {
    resource?: (
      name: string,
      template: ResourceTemplate,
      readCallback: (uri: URL, variables: Record<string, string>) => Promise<{ contents: Array<{ uri: string; text: string; mimeType?: string }> }>,
    ) => unknown;
  };

  if (typeof serverWithResource.resource !== 'function') {
    logger.debug('Server does not support resource() method, skipping template registration');
    return;
  }

  serverWithResource.resource('sap-agent', agentTemplate, async (uri, variables) => {
    const pubkey = variables.pubkey ?? '';
    logger.debug('Resource template read: agent', { pubkey });
    return {
      contents: [{
        uri: uri.toString(),
        text: JSON.stringify({
          type: 'agent',
          pubkey,
          uri: uri.toString(),
          message: 'Use sap_agent_start or sap_agent_runtime_status for full agent details.',
        }),
        mimeType: 'application/json',
      }],
    };
  });

  serverWithResource.resource('sap-domain', domainTemplate, async (uri, variables) => {
    const domain = variables.domain ?? '';
    logger.debug('Resource template read: domain', { domain });
    return {
      contents: [{
        uri: uri.toString(),
        text: JSON.stringify({
          type: 'domain',
          domain,
          uri: uri.toString(),
          message: 'Use sap_sns_resolve_domain for full domain records.',
        }),
        mimeType: 'application/json',
      }],
    };
  });

  serverWithResource.resource('sap-position', positionTemplate, async (uri, variables) => {
    const pubkey = variables.pubkey ?? '';
    logger.debug('Resource template read: position', { pubkey });
    return {
      contents: [{
        uri: uri.toString(),
        text: JSON.stringify({
          type: 'position',
          pubkey,
          uri: uri.toString(),
          message: 'Use sap_adrena_get_positions for full position details.',
        }),
        mimeType: 'application/json',
      }],
    };
  });

  serverWithResource.resource('sap-tx', txTemplate, async (uri, variables) => {
    const signature = variables.signature ?? '';
    logger.debug('Resource template read: tx', { signature });
    return {
      contents: [{
        uri: uri.toString(),
        text: JSON.stringify({
          type: 'transaction',
          signature,
          uri: uri.toString(),
          message: 'Use sap_decode_transaction for full transaction decode.',
        }),
        mimeType: 'application/json',
      }],
    };
  });

  serverWithResource.resource('sap-memory', memoryTemplate, async (uri, variables) => {
    const key = variables.key ?? '';
    logger.debug('Resource template read: memory', { key });
    return {
      contents: [{
        uri: uri.toString(),
        text: JSON.stringify({
          type: 'memory',
          key,
          uri: uri.toString(),
          message: 'Use the memory tools (sap_memory_recall, sap_memory_search) for full memory access.',
        }),
        mimeType: 'application/json',
      }],
    };
  });

  logger.debug('Resource templates registered', { count: 5 });
}