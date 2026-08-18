/**
 * @module profile-tools
 * @description MCP tools for inspecting and switching SAP MCP profiles without exposing keypair paths or secret bytes.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpConfig, SapMcpContext } from '../../core/src/types.js';
import {
  getActiveProfile,
  getProfileConfigPath,
  listProfiles,
  loadProfileConfig,
  profileExists,
  setActiveProfile,
} from '../../config-runtime/src/profiles.js';
import { createSapClient } from '../../sap/src/sap-client-manager.js';
import { resolveSigner } from '../../signer/src/signer-resolver.js';
import { PolicyEngine } from '../../policy/src/policy-engine.js';
import { loadConfig } from '../../config-runtime/src/env.js';
import { redactSensitiveString } from '../../core/src/logger.js';
import {
  registerToolFamilyPipelineTool,
  type ToolFamilyPipelineDefinition,
  type ToolFamilyPipelineHandlerResult,
} from './tool-family-pipeline.js';

const HOSTED_MCP_URL = 'https://mcp.sap.oobeprotocol.ai/mcp';

interface ProfilePipelineToolDefinition extends ToolFamilyPipelineDefinition {
  readonly name: string;
  readonly execute: (input: { readonly input: unknown }) => Promise<ToolFamilyPipelineHandlerResult> | ToolFamilyPipelineHandlerResult;
}

function registerProfilePipelineTool(
  server: Server,
  context: SapMcpContext,
  definition: ProfilePipelineToolDefinition,
): void {
  const { name, execute, ...toolDefinition } = definition;
  registerToolFamilyPipelineTool(server, context, name, toolDefinition, async (input) => execute({ input }));
}

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
 * @name HostedAccountlessProfileSummary
 * @description Hosted remote profile metadata for the non-custodial gateway, which cannot see local user profiles.
 */
interface HostedAccountlessProfileSummary {
  name: null;
  configPath: null;
  exists: false;
  isActive: false;
  isLoaded: false;
  mode: 'hosted-api';
  rpcUrl?: string;
  network?: string;
  programId?: string;
  agentPubkey: null;
  signerConfigured: false;
  accountModel: 'hosted-remote-accountless';
  localProfileVisibility: 'not-visible-to-hosted-server';
  localProfileStatus: 'unknown-to-hosted-server-not-missing';
  localProfileTool: 'sap_payments.sap_payments_profile_current';
  secretMaterial: 'never-exposed';
}

/**
 * @name CurrentProfileSummary
 * @description Profile summary returned by profile tools for local or hosted accountless runtimes.
 */
type CurrentProfileSummary = ProfileSummary | HostedAccountlessProfileSummary;

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
 * @name HostedRemoteRuntimeSummary
 * @description Explains the non-custodial hosted MCP signing and payment boundary to agents.
 */
interface HostedRemoteRuntimeSummary {
  canonicalEndpoint: string;
  accountModel: 'hosted-remote-accountless';
  localProfileVisibility: 'not-visible-to-hosted-server';
  localProfileStatus: 'unknown-to-hosted-server-not-missing';
  localProfileTool: 'sap_payments.sap_payments_profile_current';
  serverRole: 'mcp-transport-payment-verifier-tool-executor';
  serverStoresUserKeypairs: false;
  serverSignerConfigured: boolean;
  signerStatus: 'server-non-custodial-user-signer-required';
  userSigningModel: 'local-sap-profile-or-external-signer';
  writeAccess: 'available-after-user-signature-and-payment-proof';
  userSignerRequiredFor: string[];
  paidToolBehavior: 'returns-402-x402-payment-required-before-execution';
  localFallbackPolicy: 'do-not-use-local-stdio-unless-user-explicitly-asks';
  doNotSummarizeAs: string[];
  agentInstruction: string;
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
 * @name HostedAccountlessConnectionSummary
 * @description Agent-facing summary that prevents confusing hosted accountless mode with a missing user profile.
 */
interface HostedAccountlessConnectionSummary {
  status: 'connected';
  endpoint: string;
  accountModel: 'hosted-remote-accountless';
  localProfileStatus: 'unknown-to-hosted-server-not-missing';
  localProfileVisibleToHostedServer: false;
  localProfileTool: 'sap_payments.sap_payments_profile_current';
  recommendedLocalProfileCheck: 'call sap_payments.sap_payments_profile_current when the local sap_payments bridge is available';
  userMessage: string;
}

/**
 * @name getLoadedProfileName
 * @description Returns the profile name represented by the current process/runtime.
 */
function getLoadedProfileName(): string {
  return process.env.SAP_MCP_PROFILE || getActiveProfile();
}

/**
 * @name isHostedAccountlessRuntime
 * @description Returns true when the hosted remote server is operating as a non-custodial accountless gateway.
 */
function isHostedAccountlessRuntime(context: SapMcpContext): boolean {
  return context.config.mode === 'hosted-api' && !context.signer;
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
 * @name buildHostedAccountlessProfileSummary
 * @description Builds explicit accountless hosted profile metadata so agents do not report a fake default local profile.
 */
function buildHostedAccountlessProfileSummary(context: SapMcpContext): HostedAccountlessProfileSummary {
  return {
    name: null,
    configPath: null,
    exists: false,
    isActive: false,
    isLoaded: false,
    mode: 'hosted-api',
    rpcUrl: redactSensitiveString(context.config.rpcUrl),
    network: getNetworkFromRpcUrl(context.config.rpcUrl),
    programId: context.config.programId,
    agentPubkey: null,
    signerConfigured: false,
    accountModel: 'hosted-remote-accountless',
    localProfileVisibility: 'not-visible-to-hosted-server',
    localProfileStatus: 'unknown-to-hosted-server-not-missing',
    localProfileTool: 'sap_payments.sap_payments_profile_current',
    secretMaterial: 'never-exposed',
  };
}

/**
 * @name buildHostedAccountlessConnectionSummary
 * @description Builds the first field returned by hosted profile tools so agents describe remote mode correctly.
 */
function buildHostedAccountlessConnectionSummary(): HostedAccountlessConnectionSummary {
  return {
    status: 'connected',
    endpoint: HOSTED_MCP_URL,
    accountModel: 'hosted-remote-accountless',
    localProfileStatus: 'unknown-to-hosted-server-not-missing',
    localProfileVisibleToHostedServer: false,
    localProfileTool: 'sap_payments.sap_payments_profile_current',
    recommendedLocalProfileCheck: 'call sap_payments.sap_payments_profile_current when the local sap_payments bridge is available',
    userMessage: 'Hosted SAP MCP is connected and intentionally accountless. This response cannot prove whether the user local SAP profile exists; use the local sap_payments bridge for the real wallet/profile/signer status.',
  };
}

/**
 * @name buildCurrentProfileSummary
 * @description Returns local profile metadata or hosted accountless metadata for the current runtime.
 */
function buildCurrentProfileSummary(context: SapMcpContext): CurrentProfileSummary {
  return isHostedAccountlessRuntime(context)
    ? buildHostedAccountlessProfileSummary(context)
    : buildProfileSummary(getLoadedProfileName(), context);
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
 * @name buildHostedRemoteRuntime
 * @description Builds hosted-mode guidance so agents do not confuse non-custodial remote execution with missing setup.
 */
function buildHostedRemoteRuntime(context: SapMcpContext): HostedRemoteRuntimeSummary | undefined {
  if (context.config.mode !== 'hosted-api') {
    return undefined;
  }

  return {
    canonicalEndpoint: HOSTED_MCP_URL,
    accountModel: 'hosted-remote-accountless',
    localProfileVisibility: 'not-visible-to-hosted-server',
    localProfileStatus: 'unknown-to-hosted-server-not-missing',
    localProfileTool: 'sap_payments.sap_payments_profile_current',
    serverRole: 'mcp-transport-payment-verifier-tool-executor',
    serverStoresUserKeypairs: false,
    serverSignerConfigured: Boolean(context.signer),
    signerStatus: 'server-non-custodial-user-signer-required',
    userSigningModel: 'local-sap-profile-or-external-signer',
    writeAccess: 'available-after-user-signature-and-payment-proof',
    userSignerRequiredFor: [
      'x402/pay.sh payment proofs',
      'value-moving Solana transactions',
      'SAP registry, SNS, escrow, settlement, and swap submissions',
    ],
    paidToolBehavior: 'returns-402-x402-payment-required-before-execution',
    localFallbackPolicy: 'do-not-use-local-stdio-unless-user-explicitly-asks',
    doNotSummarizeAs: [
      'signer not configured',
      'read-only only',
      'writes unavailable',
      'remote MCP broken',
    ],
    agentInstruction: 'When connected to hosted SAP MCP, report that the hosted server is accountless and OOBE does not custody user keys. Do not say the local profile is missing or not loaded based on hosted sap_profile_current; the hosted server cannot see local user profiles. Do not report profile "default" as the user local profile. If the user asks for their local profile, wallet, or signer status, call the local sap_payments.sap_payments_profile_current bridge when available. Read tools are immediately available; paid and value-moving tools are available through x402/pay.sh plus the user local SAP profile or external signer. Do not switch to local stdio unless the user explicitly asks.',
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
  registerProfilePipelineTool(
    server,
    context,
    {
      name: 'sap_profile_current',
      title: 'Show Current SAP MCP Profile',
      description: 'Return the currently loaded SAP MCP profile and redacted signer/config metadata.',
      inputSchema: {},
      execute: async () => {
        const hostedAccountless = isHostedAccountlessRuntime(context);
        return {
          connectionSummary: hostedAccountless ? buildHostedAccountlessConnectionSummary() : {
            status: 'connected',
            accountModel: 'local-profile-managed',
            localProfileStatus: 'visible-to-this-process',
          },
          loadedProfile: hostedAccountless ? null : getLoadedProfileName(),
          activeProfile: hostedAccountless ? null : getActiveProfile(),
          accountModel: hostedAccountless ? 'hosted-remote-accountless' : 'local-profile-managed',
          runtime: {
            mode: context.config.mode,
            rpcUrl: redactSensitiveString(context.config.rpcUrl),
            network: getNetworkFromRpcUrl(context.config.rpcUrl),
            programId: context.config.programId,
            signerPublicKey: context.signer?.publicKey.toBase58(),
            signerConfigured: Boolean(context.signer),
            signerStatus: hostedAccountless
              ? 'server-non-custodial-user-signer-required'
              : context.signer
                ? 'server-signer-configured'
                : 'no-signer-configured',
            writeAccess: context.config.mode === 'hosted-api'
              ? 'available-through-user-signed-x402-pay.sh-and-tool-specific-signing-flows'
              : context.signer
                ? 'available-through-configured-signer-and-policy'
                : 'not-available-without-configured-signer',
            localProfileVisibleToHostedServer: !hostedAccountless,
            localProfileStatus: hostedAccountless ? 'unknown-to-hosted-server-not-missing' : 'visible-to-this-process',
            localProfileTool: hostedAccountless ? 'sap_payments.sap_payments_profile_current' : undefined,
            important: hostedAccountless
              ? 'loadedProfile is null because the hosted gateway is non-custodial and cannot inspect the caller machine. It does not mean the user local SAP profile is missing.'
              : undefined,
            secretMaterial: 'never-exposed',
          },
          identityConsistency: buildIdentityConsistency(context),
          hostedRemote: buildHostedRemoteRuntime(context),
          policy: context.policyEngine.getRuntimeStatus() satisfies PolicyRuntimeSummary,
          profile: buildCurrentProfileSummary(context),
        };
      },
    },
  );

  registerProfilePipelineTool(
    server,
    context,
    {
      name: 'sap_profile_list',
      title: 'List SAP MCP Profiles',
      description: 'List available SAP MCP profiles with redacted signer metadata and no wallet paths.',
      inputSchema: {},
      execute: async () => {
        if (isHostedAccountlessRuntime(context)) {
          return {
            connectionSummary: buildHostedAccountlessConnectionSummary(),
            loadedProfile: null,
            activeProfile: null,
            accountModel: 'hosted-remote-accountless',
            profiles: [],
            hostedRemote: buildHostedRemoteRuntime(context),
            instruction: 'Hosted SAP MCP cannot see the caller local profiles. Do not report that no local profile is configured based on this hosted response. Use the local sap_payments.sap_payments_profile_current bridge to inspect the user SAP profile, wallet, and signer status.',
          };
        }

        return {
          loadedProfile: getLoadedProfileName(),
          activeProfile: getActiveProfile(),
          profiles: listProfiles().map((profile) => buildProfileSummary(profile.name, context)),
        };
      },
    },
  );

  registerProfilePipelineTool(
    server,
    context,
    {
      name: 'sap_profile_public_key',
      title: 'Show SAP MCP Profile Agent Public Key',
      description: 'Return the configured public agent key for a profile without reading or exposing keypair bytes.',
      inputSchema: {
        profileName: {
          type: 'string',
          description: 'Profile name. Defaults to the loaded profile.',
        },
      },
      execute: async ({ input }) => {
        if (isHostedAccountlessRuntime(context)) {
          return {
            profileName: null,
            agentPubkey: null,
            configured: false,
            mode: context.config.mode,
            rpcUrl: redactSensitiveString(context.config.rpcUrl),
            network: getNetworkFromRpcUrl(context.config.rpcUrl),
            accountModel: 'hosted-remote-accountless',
            localProfileVisibility: 'not-visible-to-hosted-server',
            localProfileTool: 'sap_payments.sap_payments_profile_current',
            instruction: 'Hosted SAP MCP is non-custodial and cannot read the caller local profile public key. Call the local sap_payments.sap_payments_profile_current bridge for the user wallet and agent public key.',
            secretMaterial: 'never-exposed',
          };
        }

        const profileName = parseInput(input).profileName || getLoadedProfileName();
        assertProfileName(profileName);
        const profile = buildProfileSummary(profileName, context);
        if (!profile.exists) {
          throw new Error(`Profile "${profileName}" does not exist.`);
        }

        return {
          profileName,
          agentPubkey: profile.agentPubkey || null,
          configured: Boolean(profile.agentPubkey),
          mode: profile.mode,
          rpcUrl: profile.rpcUrl,
          network: profile.network,
          secretMaterial: 'never-exposed',
        };
      },
    },
  );

  registerProfilePipelineTool(
    server,
    context,
    {
      name: 'sap_profile_switch',
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
      execute: async ({ input }) => {
        const parsed = parseInput(input);
        if (!parsed.profileName) {
          throw new Error('profileName is required.');
        }
        assertProfileName(parsed.profileName);

        // When the server is hosted-accountless, it cannot see or switch
        // local profiles. Provide explicit guidance instead of a bare error.
        if (isHostedAccountlessRuntime(context)) {
          return {
            success: false,
            accountModel: 'hosted-remote-accountless',
            reason: 'The hosted SAP MCP gateway is non-custodial and cannot see, list, or switch local profiles on the caller machine.',
            requestedProfile: parsed.profileName,
            instruction: 'Profile switching is a local operation. Options: (1) Use the local sap_payments bridge if it exposes a profile switch tool. (2) Edit ~/.config/mcp-sap/.active-profile manually and set it to the profile name. (3) Run: sap-mcp-config switch-profile <profileName> on the machine where the local bridge runs.',
            localProfileTool: 'sap_payments.sap_payments_profile_current',
            warning: 'After switching .active-profile, restart the local sap_payments bridge to avoid stale signer cache. The bridge caches the active profile signer at startup and does not re-read .active-profile on every call.',
          };
        }

        if (!profileExists(parsed.profileName)) {
          throw new Error(`Profile "${parsed.profileName}" does not exist. Available profiles: ${listProfiles().map(p => p.name).join(', ') || '(none)'}.`);
        }

        const previousProfile = getLoadedProfileName();
        const profile = buildProfileSummary(parsed.profileName, context);
        if (!parsed.confirm) {
          return {
            success: false,
            requiresConfirmation: true,
            message: 'Profile switch can change signer, network, and policy. Call again with confirm: true to reload runtime.',
            previousProfile,
            targetProfile: profile,
          };
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

        return response as unknown as Record<string, unknown>;
      },
    },
  );
}
