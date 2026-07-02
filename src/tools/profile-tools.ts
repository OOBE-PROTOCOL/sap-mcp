/**
 * @module profile-tools
 * @description MCP tools for inspecting and switching SAP MCP profiles without exposing keypair paths or secret bytes.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import type { SapMcpConfig, SapMcpContext } from '../core/types.js';
import {
  getActiveProfile,
  getProfileConfigPath,
  listProfiles,
  loadProfileConfig,
  profileExists,
  setActiveProfile,
} from '../config/profiles.js';
import { createSapClient } from '../sap/sap-client-manager.js';
import { resolveSigner } from '../signer/signer-resolver.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { loadConfig } from '../config/env.js';
import { redactSensitiveString } from '../core/logger.js';

/**
 * @name ProfileToolInput
 * @description Common input accepted by profile MCP tools.
 */
interface ProfileToolInput {
  profileName?: string;
  confirm?: boolean;
}

/**
 * @name ProfileSummary
 * @description Redacted profile metadata safe to expose to MCP clients.
 */
interface ProfileSummary {
  name: string;
  configPath: string;
  exists: boolean;
  isActive: boolean;
  isLoaded: boolean;
  mode?: SapMcpConfig['mode'];
  rpcUrl?: string;
  network?: string;
  programId?: string;
  agentPubkey?: string;
  signerConfigured: boolean;
  secretMaterial: 'never-exposed';
}

/**
 * @name PolicyRuntimeSummary
 * @description Redacted runtime policy status safe to expose to MCP clients.
 */
interface PolicyRuntimeSummary {
  mode: string;
  bentoConfigured: boolean;
  bentoAvailable: boolean;
  localEngineActive: boolean;
}

/**
 * @name IdentityConsistencySummary
 * @description Redacted consistency check between configured identity and loaded signer public key.
 */
interface IdentityConsistencySummary {
  configuredAgentPubkey?: string;
  signerPublicKey?: string;
  matchesSigner: boolean | null;
  status: 'consistent' | 'mismatch' | 'not-checkable';
}

/**
 * @name ProfileSwitchResponse
 * @description Result returned by the profile switch tool.
 */
interface ProfileSwitchResponse {
  success: boolean;
  previousProfile: string;
  loadedProfile: string;
  profile: ProfileSummary;
  runtimeReloaded: boolean;
  message: string;
}

/**
 * @name getLoadedProfileName
 * @description Returns the profile name represented by the current process/runtime.
 */
function getLoadedProfileName(): string {
  return process.env.SAP_MCP_PROFILE || getActiveProfile();
}

/**
 * @name getNetworkFromRpcUrl
 * @description Derives a user-friendly Solana network label from an RPC URL.
 */
function getNetworkFromRpcUrl(rpcUrl: string | undefined): string | undefined {
  if (!rpcUrl) {
    return undefined;
  }
  if (rpcUrl.includes('mainnet-beta') || rpcUrl.includes('mainnet')) {
    return 'mainnet-beta';
  }
  if (rpcUrl.includes('testnet')) {
    return 'testnet';
  }
  if (rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localnet')) {
    return 'localnet';
  }
  return 'devnet';
}

/**
 * @name assertProfileName
 * @description Validates profile names before they are used to resolve config paths.
 */
function assertProfileName(profileName: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(profileName)) {
    throw new Error('Invalid profileName. Use only letters, numbers, hyphens, and underscores.');
  }
}

/**
 * @name buildProfileSummary
 * @description Builds redacted profile metadata suitable for MCP responses.
 */
function buildProfileSummary(profileName: string, context: SapMcpContext): ProfileSummary {
  const config = loadProfileConfig(profileName);
  const loadedProfile = getLoadedProfileName();
  return {
    name: profileName,
    configPath: getProfileConfigPath(profileName),
    exists: Boolean(config),
    isActive: profileName === getActiveProfile(),
    isLoaded: profileName === loadedProfile,
    mode: config?.mode,
    rpcUrl: config?.rpcUrl ? redactSensitiveString(config.rpcUrl) : undefined,
    network: getNetworkFromRpcUrl(config?.rpcUrl),
    programId: config?.programId,
    agentPubkey: config?.agentPubkey,
    signerConfigured: Boolean(config?.walletPath || config?.externalSignerUrl || context.signer),
    secretMaterial: 'never-exposed',
  };
}

/**
 * @name writeRuntimeProfileEnv
 * @description Pins the current process to the selected profile for subsequent config/resource reads.
 */
function writeRuntimeProfileEnv(profileName: string): void {
  process.env.SAP_MCP_PROFILE = profileName;
  process.env.SAP_MCP_CONFIG_PATH = getProfileConfigPath(profileName);
  process.env.SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = 'false';
}

/**
 * @name buildIdentityConsistency
 * @description Compares public identifiers without reading or exposing keypair bytes.
 */
function buildIdentityConsistency(context: SapMcpContext): IdentityConsistencySummary {
  const signerPublicKey = context.signer?.publicKey.toBase58();
  const configuredAgentPubkey = context.config.agentPubkey;
  if (!signerPublicKey || !configuredAgentPubkey) {
    return {
      configuredAgentPubkey,
      signerPublicKey,
      matchesSigner: null,
      status: 'not-checkable',
    };
  }

  const matchesSigner = configuredAgentPubkey === signerPublicKey;
  return {
    configuredAgentPubkey,
    signerPublicKey,
    matchesSigner,
    status: matchesSigner ? 'consistent' : 'mismatch',
  };
}

/**
 * @name reloadRuntimeProfile
 * @description Replaces the live MCP context config, SAP client, signer, connection, and policy engine.
 */
async function reloadRuntimeProfile(context: SapMcpContext, profileName: string): Promise<void> {
  const profileConfig = loadProfileConfig(profileName);
  if (!profileConfig) {
    throw new Error(`Profile "${profileName}" does not exist or has invalid config.`);
  }

  const nextConfig = loadConfig(getProfileConfigPath(profileName));
  const signerResult = await resolveSigner(nextConfig);
  const sapClient = await createSapClient(nextConfig);

  setActiveProfile(profileName);
  writeRuntimeProfileEnv(profileName);

  context.config = nextConfig;
  context.sapClient = sapClient;
  context.connection = sapClient.connection;
  context.signer = signerResult.signer;
  context.policyEngine = new PolicyEngine(nextConfig);
}

/**
 * @name parseInput
 * @description Narrows unknown MCP tool input into profile tool input.
 */
function parseInput(input: unknown): ProfileToolInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const record = input as Record<string, unknown>;
  return {
    profileName: typeof record.profileName === 'string' ? record.profileName : undefined,
    confirm: typeof record.confirm === 'boolean' ? record.confirm : undefined,
  };
}

/**
 * @name registerProfileTools
 * @description Registers profile inspection and runtime switching MCP tools.
 */
export function registerProfileTools(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_profile_current',
    {
      title: 'Show Current SAP MCP Profile',
      description: 'Return the currently loaded SAP MCP profile and redacted signer/config metadata.',
      inputSchema: {},
    },
    async () => createTextResponse(JSON.stringify({
      loadedProfile: getLoadedProfileName(),
      activeProfile: getActiveProfile(),
      runtime: {
        mode: context.config.mode,
        rpcUrl: redactSensitiveString(context.config.rpcUrl),
        network: getNetworkFromRpcUrl(context.config.rpcUrl),
        programId: context.config.programId,
        signerPublicKey: context.signer?.publicKey.toBase58(),
        signerConfigured: Boolean(context.signer),
        secretMaterial: 'never-exposed',
      },
      identityConsistency: buildIdentityConsistency(context),
      policy: context.policyEngine.getRuntimeStatus() satisfies PolicyRuntimeSummary,
      profile: buildProfileSummary(getLoadedProfileName(), context),
    }, null, 2))
  );

  registerTool(
    server,
    'sap_profile_list',
    {
      title: 'List SAP MCP Profiles',
      description: 'List available SAP MCP profiles with redacted signer metadata and no wallet paths.',
      inputSchema: {},
    },
    async () => createTextResponse(JSON.stringify({
      loadedProfile: getLoadedProfileName(),
      activeProfile: getActiveProfile(),
      profiles: listProfiles().map((profile) => buildProfileSummary(profile.name, context)),
    }, null, 2))
  );

  registerTool(
    server,
    'sap_profile_public_key',
    {
      title: 'Show SAP MCP Profile Agent Public Key',
      description: 'Return the configured public agent key for a profile without reading or exposing keypair bytes.',
      inputSchema: {
        profileName: {
          type: 'string',
          description: 'Profile name. Defaults to the loaded profile.',
        },
      },
    },
    async (input: unknown) => {
      try {
        const profileName = parseInput(input).profileName || getLoadedProfileName();
        assertProfileName(profileName);
        const profile = buildProfileSummary(profileName, context);
        if (!profile.exists) {
          throw new Error(`Profile "${profileName}" does not exist.`);
        }

        return createTextResponse(JSON.stringify({
          profileName,
          agentPubkey: profile.agentPubkey || null,
          configured: Boolean(profile.agentPubkey),
          mode: profile.mode,
          rpcUrl: profile.rpcUrl,
          network: profile.network,
          secretMaterial: 'never-exposed',
        }, null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );

  registerTool(
    server,
    'sap_profile_switch',
    {
      title: 'Switch Loaded SAP MCP Profile',
      description: 'Switch the live SAP MCP runtime to another existing profile and reload client, signer, connection, and policy.',
      inputSchema: {
        profileName: {
          type: 'string',
          description: 'Existing profile name to load.',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true because switching profile can change signer, network, and policy.',
        },
      },
    },
    async (input: unknown) => {
      try {
        const parsed = parseInput(input);
        if (!parsed.profileName) {
          throw new Error('profileName is required.');
        }
        assertProfileName(parsed.profileName);
        if (!profileExists(parsed.profileName)) {
          throw new Error(`Profile "${parsed.profileName}" does not exist.`);
        }

        const previousProfile = getLoadedProfileName();
        const profile = buildProfileSummary(parsed.profileName, context);
        if (!parsed.confirm) {
          return createTextResponse(JSON.stringify({
            success: false,
            requiresConfirmation: true,
            message: 'Profile switch can change signer, network, and policy. Call again with confirm: true to reload runtime.',
            previousProfile,
            targetProfile: profile,
          }, null, 2));
        }

        await reloadRuntimeProfile(context, parsed.profileName);
        const response: ProfileSwitchResponse = {
          success: true,
          previousProfile,
          loadedProfile: parsed.profileName,
          profile: buildProfileSummary(parsed.profileName, context),
          runtimeReloaded: true,
          message: `Loaded SAP MCP profile "${parsed.profileName}".`,
        };

        return createTextResponse(JSON.stringify(response, null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );
}
