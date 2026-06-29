/**
 * SAP MCP Active Profile Resource
 * 
 * Exposes the current active profile and available profiles via MCP resources.
 * Agents can query this to understand profile state and switch contexts.
 * 
 * @module resources/profile/sap-active-profile
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { getActiveProfile, listProfiles, getProfileConfigPath } from '../../config/profiles.js';
import { getPreferredConfigDir } from '../../config/paths.js';

/**
 * Profile metadata exposed to agents.
 */
interface ProfileMetadata {
  /** Profile name */
  name: string;
  /** Whether this profile is currently active */
  isActive: boolean;
  /** Path to profile config file */
  configPath: string;
  /** Agent public key (base58) */
  agentPubkey: string;
  /** Operating mode */
  mode: string;
  /** Whether this profile owns signer configuration */
  signerConfigured: boolean;
}

/**
 * Active profile data structure.
 */
interface ActiveProfileData {
  /** Currently active profile */
  active: {
    /** Profile name */
    name: string;
    /** Path to config file */
    configPath: string;
  };
  /** List of all available profiles */
  available: ProfileMetadata[];
  /** CLI commands for profile management */
  commands: {
    /** Switch to a different profile */
    switch: string;
    /** Create a new profile */
    create: string;
    /** Delete an existing profile */
    delete: string;
    /** List all profiles */
    list: string;
    /** Show current profile info */
    info: string;
  };
  /** File system paths */
  paths: {
    /** Configuration directory */
    configDir: string;
    /** Active profile marker file */
    activeProfileFile: string;
  };
  /** Sensitive material handling contract */
  security: {
    /** Wallet paths and private key bytes are not exposed through MCP context */
    keypairMaterial: 'redacted';
  };
}

/**
 * Error response for profile resource.
 */
interface ProfileError {
  /** Error indicator */
  error: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Registers the active profile resource template.
 * 
 * Provides agents with information about the current active profile
 * and all available profiles. Includes CLI commands for profile management.
 * Wallet file paths and keypair bytes are intentionally redacted from MCP context.
 * 
 * @param server - MCP server instance
 * @param context - SAP MCP execution context
 * 
 * @example
 * ```typescript
 * // Agent reads active profile
 * const result = await mcp.readResource('sap://profile/active');
 * // Returns: ActiveProfileData or ProfileError
 * ```
 * 
 * @example
 * ```typescript
 * // Response structure
 * {
 *   "active": {
 *     "name": "citizen-support-agent",
 *     "configPath": "~/.config/mcp-sap/config-citizen-support-agent.json"
 *   },
 *   "available": [
 *     {
 *       "name": "citizen-support-agent",
 *       "isActive": true,
 *       "agentPubkey": "HZreoFG...",
 *       "mode": "local-dev-keypair"
 *     }
 *   ],
 *   "commands": {
 *     "switch": "npx sap-mcp-config profile <name>"
 *   }
 * }
 * ```
 */
export function sapActiveProfileResource(server: Server, _context: SapMcpContext): void {
  registerResourceTemplate(
    server,
    'sap://profile/active',
    {},
    {
      name: 'Active SAP MCP Profile',
      description: 'The currently active agent profile and list of all available profiles.',
      mimeType: 'application/json',
    },
    async (uri: string, _args: Record<string, unknown>) => {
      try {
        const activeProfile = getActiveProfile();
        const allProfiles = listProfiles();
        const configDir = getPreferredConfigDir();

        const profileData: ActiveProfileData = {
          active: {
            name: activeProfile,
            configPath: getProfileConfigPath(activeProfile),
          },
          available: allProfiles.map(p => ({
            name: p.name,
            isActive: p.name === activeProfile,
            configPath: p.path,
            agentPubkey: p.agentPubkey || 'Not configured',
            mode: p.mode || 'unknown',
            signerConfigured: Boolean(p.walletPath),
          })),
          commands: {
            switch: 'npx sap-mcp-config profile <name>',
            create: 'npx sap-mcp-config create-profile <name>',
            delete: 'npx sap-mcp-config delete-profile <name>',
            list: 'npx sap-mcp-config profiles',
            info: 'npx sap-mcp-config profile-info',
          },
          paths: {
            configDir,
            activeProfileFile: `${configDir}/.active-profile`,
          },
          security: {
            keypairMaterial: 'redacted',
          },
        };

        logger.debug('Active profile resource read', { 
          activeProfile, 
          profileCount: allProfiles.length 
        });

        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(profileData, null, 2),
          }],
        };
      } catch (error) {
        logger.error('Failed to read active profile resource', { error });
        
        const errorResponse: ProfileError = {
          error: 'Failed to load profile information',
          message: error instanceof Error ? error.message : 'Unknown error',
        };

        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(errorResponse, null, 2),
          }],
        };
      }
    }
  );
  
  logger.info('Active profile resource registered');
}
