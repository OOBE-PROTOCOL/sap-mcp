/**
 * SAP MCP Current Config Resource
 * 
 * Exposes the current active configuration via MCP resources.
 * Agents can read this to understand their operating context.
 * 
 * @module resources/current/sap-current-config
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '../../adapters/mcp/sdk-compat.js';
import { logger, redactSensitiveString } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { getActiveProfile, getProfileConfigPath, loadProfileConfig } from '../../config/profiles.js';
import { fullConfigSchema, type FullConfig } from '../../config/secure-config.js';
import { existsSync, readFileSync } from 'fs';

const HOSTED_MCP_URL = 'https://mcp.sap.oobeprotocol.ai/mcp';

/**
 * Sanitized configuration data exposed to agents.
 * Excludes sensitive information (private keys, secrets).
 */
interface SanitizedConfig {
  /** Profile information */
  profile: {
    /** Active profile name */
    name: string;
    /** Path to config file */
    configPath: string;
    /** Whether this profile is currently active */
    isActive: boolean;
  };
  /** Agent identity and mode */
	  agent: {
	    /** Agent public key (base58) */
	    pubkey: string;
	    /** Operating mode (readonly, local-dev-keypair, etc.) */
	    mode: string;
	    /** Loaded signer public key when a signer is configured */
	    signerPublicKey?: string;
	    /** Whether configured pubkey matches loaded signer pubkey */
	    identityMatchesSigner: boolean | null;
	  };
  /** Connection settings */
  connection: {
    /** Solana RPC endpoint */
    rpcUrl: string;
    /** Commitment level */
    commitment: string;
    /** SAP program ID */
    programId: string;
  };
  /** Wallet configuration */
  wallet: {
    /** Whether the wallet path is managed by the active profile */
    managedByProfile: boolean;
    /** Whether wallet file exists */
    exists: boolean;
    /** Wallet type (keypair-file, external, etc.) */
    type: string;
    /** Sensitive material exposure status */
    secretMaterial: 'never-exposed';
  };
  /** Security limits */
	  security: {
	    /** Maximum transaction value in SOL */
	    maxTxValueSol: number;
	    /** Daily spending limit in SOL */
	    dailyLimitSol: number;
	    /** Approval threshold in SOL */
	    requireApprovalAboveSol: number;
	    /** Policy enforcement mode */
	    policyMode: string;
	    /** Runtime policy engine status */
	    policyRuntime: {
	      /** Runtime mode currently loaded by the policy engine */
	      mode: string;
	      /** Whether Bento credentials are configured in this runtime */
	      bentoConfigured: boolean;
	      /** Whether Bento was reachable during the latest runtime availability check */
	      bentoAvailable: boolean;
	      /** Whether deterministic local guardrails are active */
	      localEngineActive: boolean;
	    };
	  };
  /** Feature flags */
  features: {
    /** HTTP API enabled */
    httpEnabled: boolean;
    /** HTTP server port */
    httpPort: number;
    /** Metrics collection enabled */
    metricsEnabled: boolean;
    /** Bento guard enabled */
    bentoEnabled: boolean;
  };
  /** Hosted remote MCP boundary */
  hostedRemote?: {
    /** Canonical OOBE hosted MCP endpoint */
    canonicalEndpoint: string;
    /** Hosted server is not a customer wallet custodian */
    serverStoresUserKeypairs: false;
    /** Whether the hosted server process itself has a signer loaded */
    serverSignerConfigured: boolean;
    /** Non-custodial signer state for hosted MCP */
    signerStatus: 'server-non-custodial-user-signer-required';
    /** Where user signatures must come from */
    userSigningModel: 'local-sap-profile-or-external-signer';
    /** Hosted write availability semantics */
    writeAccess: 'available-after-user-signature-and-payment-proof';
    /** How paid hosted calls behave */
    paidToolBehavior: 'returns-402-x402-payment-required-before-execution';
    /** Whether agents may silently switch to local stdio */
    localFallbackPolicy: 'do-not-use-local-stdio-unless-user-explicitly-asks';
    /** Summaries agents should avoid because they misrepresent hosted mode */
    doNotSummarizeAs: string[];
    /** Human-readable instruction for LLM clients */
    agentInstruction: string;
  };
  /** Logging configuration */
  logging: {
    /** Log level */
    level: string;
    /** Log format */
    format: string;
  };
}

/**
 * Error response for config resource.
 */
interface ConfigError {
  /** Error indicator */
  error: string;
  /** Active profile name */
  profile: string;
  /** Human-readable error message */
  message?: string;
}

/**
 * Loads the profile config used for display-only metadata such as agentPubkey.
 */
function loadDisplayConfig(profileName: string, configPath: string): FullConfig | null {
  if (process.env.SAP_MCP_CONFIG_PATH && existsSync(configPath)) {
    const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf-8'));
    return fullConfigSchema.parse(parsed);
  }

  return loadProfileConfig(profileName);
}

/**
 * Registers the current config resource template.
 * 
 * Provides agents with read-only access to the active configuration,
 * including profile, connection, security settings, and feature flags.
 * Wallet paths and all sensitive data (private keys, seeds, secret bytes, API keys)
 * are intentionally excluded from MCP context.
 * 
 * @param server - MCP server instance
 * @param context - SAP MCP execution context
 * 
 * @example
 * ```typescript
 * // Agent reads current config
 * const result = await mcp.readResource('sap://config/current');
 * // Returns: SanitizedConfig or ConfigError
 * ```
 */
export function sapCurrentConfigResource(server: Server, context: SapMcpContext): void {
  registerResourceTemplate(
    server,
    'sap://config/current',
    {},
    {
      name: 'Current SAP MCP Configuration',
      description: 'The active configuration for this SAP MCP server instance, including profile, wallet, and security settings.',
      mimeType: 'application/json',
    },
    async (uri: string, _args: Record<string, unknown>) => {
      try {
        const activeProfile = process.env.SAP_MCP_PROFILE || getActiveProfile();
        const configPath = process.env.SAP_MCP_CONFIG_PATH || getProfileConfigPath(activeProfile);
        const config = loadDisplayConfig(activeProfile, configPath);

        // Handle missing configuration
        if (!config) {
          const errorResponse: ConfigError = {
            error: 'Configuration not found',
            profile: activeProfile,
            message: 'Run "npx sap-mcp-config wizard" to create initial configuration',
          };

          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(errorResponse, null, 2),
            }],
          };
        }

        // Build sanitized config (exclude sensitive data)
        const sanitizedConfig: SanitizedConfig = {
          profile: {
            name: activeProfile,
            configPath,
            isActive: true,
          },
	          agent: {
	            pubkey: config.agentPubkey || 'Not configured',
	            mode: context.config.mode,
	            signerPublicKey: context.signer?.publicKey.toBase58(),
	            identityMatchesSigner: config.agentPubkey && context.signer
	              ? config.agentPubkey === context.signer.publicKey.toBase58()
	              : null,
	          },
          connection: {
            rpcUrl: redactSensitiveString(context.config.rpcUrl),
            commitment: context.config.commitment,
            programId: context.config.programId,
          },
          wallet: {
            managedByProfile: Boolean(context.config.walletPath),
            exists: context.config.walletPath ? existsSync(context.config.walletPath) : false,
            type: context.config.walletPath ? 'keypair-file' : context.config.mode,
            secretMaterial: 'never-exposed',
          },
          security: {
            maxTxValueSol: context.config.maxTxValueSol,
	            dailyLimitSol: context.config.dailyLimitSol ?? config.dailyLimitSol,
	            requireApprovalAboveSol: context.config.requireApprovalAboveSol,
	            policyMode: context.config.policy?.mode || 'local-only',
	            policyRuntime: context.policyEngine.getRuntimeStatus(),
	          },
          features: {
            httpEnabled: context.config.enableHttp,
            httpPort: context.config.httpPort,
            metricsEnabled: config.enableMetrics,
            bentoEnabled: context.config.bento?.enabled ?? false,
          },
          hostedRemote: context.config.mode === 'hosted-api'
            ? {
                canonicalEndpoint: HOSTED_MCP_URL,
                serverStoresUserKeypairs: false,
                serverSignerConfigured: Boolean(context.signer),
                signerStatus: 'server-non-custodial-user-signer-required',
                userSigningModel: 'local-sap-profile-or-external-signer',
                writeAccess: 'available-after-user-signature-and-payment-proof',
                paidToolBehavior: 'returns-402-x402-payment-required-before-execution',
                localFallbackPolicy: 'do-not-use-local-stdio-unless-user-explicitly-asks',
                doNotSummarizeAs: [
                  'signer not configured',
                  'read-only only',
                  'writes unavailable',
                  'remote MCP broken',
                ],
                agentInstruction: 'Hosted SAP MCP is non-custodial: OOBE does not hold the user wallet. Read tools are immediately available; paid and value-moving tools are available through x402/pay.sh plus the user local SAP profile or external signer. Do not switch to local stdio unless the user explicitly asks.',
              }
            : undefined,
          logging: {
            level: context.config.logLevel,
            format: config.logFormat,
          },
        };

        logger.debug('Current config resource read', { 
          profile: activeProfile, 
          mode: config.mode,
          pubkey: config.agentPubkey ? '[REDACTED]' : 'Not configured' 
        });

        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(sanitizedConfig, null, 2),
          }],
        };
      } catch (error) {
        logger.error('Failed to read current config resource', { error });
        
        const errorResponse: ConfigError = {
          error: 'Failed to load configuration',
          profile: getActiveProfile(),
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
  
  logger.debug('Current config resource registered');
}
