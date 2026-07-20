/**
 * SAP MCP Agent Context Prompt
 * 
 * Provides complete context about the current SAP MCP configuration,
 * active profile, wallet, and available capabilities.
 * 
 * Agents should call this prompt before executing any SAP-related operations
 * to understand their operating context and constraints.
 * 
 * @module prompts/context/sap-agent-context
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger, redactSensitiveString } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { getActiveProfile, loadProfileConfig, getCurrentProfileInfo, listProfiles, getProfileConfigPath } from '../../config/profiles.js';
import { getPreferredConfigDir } from '../../config/paths.js';

const HOSTED_MCP_URL = 'https://mcp.sap.oobeprotocol.ai/mcp';
const WIZARD_DESCRIPTOR_URL = 'https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json';
const WIZARD_INSTALL_SCRIPT_URL = 'https://mcp.sap.oobeprotocol.ai/wizard/install.sh';
const WIZARD_NPM_COMMAND = 'npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard';

/**
 * Prompt arguments for agent context.
 */
interface AgentContextArgs {
  /** Include redacted wallet status (default: false) */
  includeWallet?: string;
  /** Include list of all available profiles (default: true) */
  includeProfiles?: string;
}

/**
 * Arguments passed to prompt handler.
 */
type PromptArgs = Record<string, unknown> | undefined;

/**
 * Registers the agent context prompt.
 * 
 * This prompt provides a comprehensive, human-readable overview of the
 * current SAP MCP configuration, including:
 * - Active profile and agent identity
 * - Operating mode and connection settings
 * - Redacted signer status
 * - Security limits and policy settings
 * - Feature flags and logging configuration
 * - Available profiles and management commands
 * 
 * Agents should call this prompt at the start of a session or before
 * performing any SAP operations to ensure they have accurate context.
 * 
 * @param server - MCP server instance
 * @param context - SAP MCP execution context
 * 
 * @example
 * ```typescript
 * // Agent calls the prompt
 * const result = await mcp.getPrompt('sap-agent-context', {
 *   includeWallet: 'true',
 *   includeProfiles: 'true',
 * });
 * ```
 * 
 * @example
 * ```markdown
 * // Output includes:
 * ## 🎯 SAP MCP Agent Context
 * 
 * ### 📋 Active Profile
 * - Name: citizen-support-agent
 * - Agent Pubkey: HZreoFG...
 * 
 * ### 🔐 Operating Mode
 * - Mode: local-dev-keypair
 * - RPC URL: https://api.devnet.solana.com
 * 
 * ### 💳 Wallet Configuration
 * - Managed by profile: yes
 * - Secret material: never exposed through MCP
 * 
 * ### 🛡️ Security Limits
 * - Max TX Value: 1.0 SOL
 * - Daily Limit: 10.0 SOL
 * ```
 */
export function sapAgentContextPrompt(server: Server, _context: SapMcpContext): void {
  registerPrompt(
    server,
    'sap-agent-context',
    {},
    {
          description: 'Get complete context about the current SAP MCP configuration, active profile, redacted signer status, and available capabilities. Use this before any SAP operations.',
      arguments: [
        {
          name: 'includeWallet',
          description: 'Include redacted signer status only; keypair paths and bytes are never exposed (default: false)',
          required: false,
        },
        {
          name: 'includeProfiles',
          description: 'Include list of all available profiles (default: true)',
          required: false,
        },
      ],
    },
    async (args: PromptArgs) => {
      try {
        const parsedArgs = (args as AgentContextArgs) || {};
        const includeWallet = parsedArgs.includeWallet === 'true';
        const includeProfiles = parsedArgs.includeProfiles !== 'false';
        
        const activeProfile = getActiveProfile();
        const config = loadProfileConfig(activeProfile);
        const profileInfo = getCurrentProfileInfo();
        const configDir = getPreferredConfigDir();
        const allProfiles = includeProfiles ? listProfiles() : [];

        // Handle missing configuration
        if (!config) {
          logger.warn('Agent context requested but config not found', { profile: activeProfile });
          
          return {
            description: 'SAP MCP configuration not found',
            messages: [
              {
                role: 'user' as const,
                content: {
                  type: 'text' as const,
                  text: buildMissingConfigMessage(activeProfile, configDir),
                },
              },
            ],
          };
        }

        // Build comprehensive context message
        const contextText = buildContextMessage({
          activeProfile,
          config: config as NonNullable<typeof config>,
          profileInfo,
          configDir,
          includeWallet,
          includeProfiles,
          allProfiles,
        });

        logger.debug('Agent context prompt generated', { 
          profile: activeProfile,
          includeWallet,
          includeProfiles,
          profileCount: allProfiles.length,
        });

        return {
          description: 'Complete SAP MCP agent context',
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: contextText,
              },
            },
          ],
        };
      } catch (error) {
        logger.error('Failed to generate agent context prompt', { error });
        
        return {
          description: 'Error generating agent context',
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: buildErrorMessage(error),
              },
            },
          ],
        };
      }
    }
  );
  
  logger.debug('Agent context prompt registered');
}

/**
 * Builds context message for successful config load.
 */
function buildContextMessage(options: {
  activeProfile: string;
  config: NonNullable<ReturnType<typeof loadProfileConfig>>;
  profileInfo: ReturnType<typeof getCurrentProfileInfo>;
  configDir: string;
  includeWallet: boolean;
  includeProfiles: boolean;
  allProfiles: ReturnType<typeof listProfiles>;
}): string {
  const { activeProfile, config, includeWallet, includeProfiles, allProfiles } = options;
  
  let contextText = `## 🎯 SAP MCP Agent Context

### 📋 Active Profile
- **Name:** \`${activeProfile}\`
- **Config Path:** \`${getProfileConfigPath(activeProfile)}\`
- **Agent Pubkey:** \`${config.agentPubkey || 'Not configured'}\`

### 🗣️ Response Language
- Answer in the same natural language as the user's latest request.
- If the user asks in English, answer in English even when previous context or tool data contains Italian.
- Keep SAP/Solana tool names, protocol IDs, addresses, and error strings unchanged.

### 🔐 Operating Mode
- **Mode:** \`${config.mode}\`
- **RPC URL:** \`${redactSensitiveString(config.rpcUrl)}\`
- **Commitment:** \`${config.commitment}\`
- **Program ID:** \`${config.programId}\`

`;

  if (includeWallet) {
    contextText += `### 💳 Signer Configuration
- **Managed By Profile:** ${config.walletPath ? 'Yes' : 'No'}
- **Type:** ${config.mode === 'local-dev-keypair' ? 'Keypair File' : config.mode}
- **Secret Material:** Never exposed through MCP context
- **Instruction:** Do not read wallet/keypair files; use MCP signing tools only

`;
  }

  contextText += `### 🛡️ Security Limits
- **Max TX Value:** ${config.maxTxValueSol} SOL
- **Daily Limit:** ${config.dailyLimitSol} SOL
- **Approval Required:** Above ${config.requireApprovalAboveSol} SOL
- **Policy Mode:** ${config.policy?.mode || 'local-only'}

### 🧰 Hosted Wizard Recovery
- If this agent cannot see \`${options.configDir}\`, \`~/.config/mcp-sap\`, or the current OS profile config, do not guess wallet paths and do not read keypair files.
- Ask the user to install/run the SAP MCP wizard from \`${WIZARD_DESCRIPTOR_URL}\` or \`${WIZARD_INSTALL_SCRIPT_URL}\`.
- Hosted MCP URL: \`${HOSTED_MCP_URL}\`
- Wizard command: \`${WIZARD_NPM_COMMAND}\`
- The wizard creates the user SAP profile, dedicated wallet path or external signer, policy limits, and optional MCP client injection.

### 🌐 Hosted Remote MCP
- Canonical endpoint: \`${HOSTED_MCP_URL}\`
- Protocol: MCP Streamable HTTP, protocol version \`2025-06-18\`
- Public metadata: \`https://mcp.sap.oobeprotocol.ai/server.json\`
- Auth: bearerless public agent mode; paid tools require x402 payment proof.
- Security: hosted SAP MCP never stores user keypairs and never exposes keypair bytes.
- Non-custodial signer rule: hosted \`signerConfigured: false\` means the OOBE server is not holding the user's wallet. It does **not** mean the hosted tool surface is unusable.
- When summarizing hosted mode, say: "server is non-custodial; user signatures come from the local SAP profile or external signer." Do **not** say "signer not configured", "read-only only", "writes unavailable", or "remote MCP broken" unless a specific tool call returns that explicit error.
- Hosted writes are available only after the user completes the required x402/pay.sh payment proof and tool-specific signing flow. The hosted server must never be described as holding or needing the user's private key.
- Hosted paid tools should be paid through x402/pay.sh from the user's local SAP profile or external signer. Do not silently switch to local stdio just to avoid payment.
- Hosted remote is accountless: if \`sap_profile_current\` returns \`accountModel: hosted-remote-accountless\`, do not report \`default\` as the user's local profile. To inspect the user's local wallet/profile, call the local \`sap_payments.sap_payments_profile_current\` bridge when it is available.
- Local stdio is a developer fallback only when the user explicitly asks for local execution or the MCP client cannot perform remote/x402 calls.
- For Hermes global \`~/.hermes/mcp.json\`, use a flat \`sap: { url, transport }\` entry, not a nested \`mcpServers.sap\` object.
- For Hermes profile YAML, use \`mcp_servers.sap.url\` and \`mcp_servers.sap.transport\`.

### ✅ Connection Check Behavior
- If the user only asks whether SAP MCP is connected, keep the answer short: connected yes/no, endpoint, mode, non-custodial status, and the next useful action.
- Do not list all tools, protocols, or categories unless the user asks what tools are available.
- Do not use startup logs alone as proof that tools are callable in the current runtime. If \`tools/list\` succeeds but runtime-injected tool functions are missing, report a runtime reload issue, not a SAP MCP server failure.
- Do not say the hosted server is "read-only" just because hosted \`signerConfigured\` is false. Paid/write tools use x402/pay.sh plus the local SAP profile or external signer.

### ⚙️ Features
- **HTTP API:** ${config.enableHttp ? `Enabled (port ${config.httpPort})` : config.mode === 'hosted-api' ? `Hosted remote (${HOSTED_MCP_URL})` : 'Disabled'}
- **Metrics:** ${config.enableMetrics ? 'Enabled' : 'Disabled'}
- **Bento Guard:** ${config.bento?.enabled ? 'Enabled' : 'Disabled'}
- **Logging:** ${config.logLevel} (${config.logFormat})

### 🧭 SAP Tool Selection
- Use \`sap_profile_current\`, \`sap_profile_list\`, and \`sap_network_stats\` before operational work.
- Use \`sap_get_network_overview\` for live ecosystem counters.
- Use \`sap_discover_agents\` for targeted paid hosted directory reads. Prefer \`query\`, \`wallet\`, \`agentPda\`, \`protocol\`, \`capability\`, \`capabilities\`, \`hasX402Endpoint\`, and small \`limit\` values before broad scans.
- Use \`sap_list_all_agents\` when the user asks for every current SAP ecosystem agent. It enumerates on-chain \`AgentAccount\` PDAs, can include protocol index summaries, and returns \`pagination.nextCursor\` for the next page.
- Use \`sap_list_agents\` as a compatibility alias for \`sap_discover_agents\`.
- Use \`sap_fetch_protocol_index\` when a specific protocol ID is known and the user wants protocol-index membership.
- If a capability-filtered lookup returns zero rows, retry with \`query\` or \`wallet\` before saying an agent is absent; the on-chain AgentAccount directory is canonical and indexes can lag.
- Never claim that global enumeration is impossible without first trying \`sap_list_all_agents\`.

### 🔗 Solana Protocol Tool Routing
Some MCP clients display tool names as \`mcp_sap_<tool>\`; inside this server the callable names omit that client prefix.
Use the exact names returned by \`tools/list\`. Do not replace hyphens with underscores: for example, the SPL token tools are named \`spl-token_*\`, not \`spl_token_*\`.

| Need | Preferred Tools |
| --- | --- |
| SOL/SPL balances and transfers | \`sol_get_balance\`, \`spl-token_getBalance\`, \`spl-token_getTokenAccounts\`, \`spl-token_transfer\`, \`spl-token_transferSol\` |
| Jupiter swaps and quotes | \`jupiter_getQuote\`, \`jupiter_swap\`, \`jupiter_swapInstructions\`, \`jupiter_smartSwap\`, \`jupiter_getOrder\`, \`jupiter_executeOrder\` |
| Jupiter token intelligence | \`jupiter_searchTokens\`, \`jupiter_getTokenInfo\`, \`jupiter_getTokenList\`, \`jupiter_shield\`, \`jupiter_getHoldings\` |
| DEX, perps, liquidity | \`drift_*\`, \`adrena_*\`, \`orca_*\`, \`raydium-pools_*\`, \`meteora_*\`, \`openbook_*\`, \`manifest_*\` |
| Price and market data | \`pyth_getPrice\`, \`pyth_getPriceHistory\`, \`pyth_listPriceFeeds\`, \`coingecko_getTokenPrice\`, \`coingecko_getTokenInfo\` |
| NFTs and domains | \`metaplex-nft_*\`, \`3land_*\`, \`sap_sns_*\`, \`sns_*\`, \`alldomains_*\` |
| Bridges, staking, actions | \`bridging_*\`, \`staking_*\`, \`jito_*\`, \`blinks_*\`, \`lulo_*\` |

### SNS Domain Registration — Hosted/Local Safe Flow
- **Availability checks are free:** use \`sap_sns_check_domain\` for one .sol domain and \`sap_sns_batch_check_domains\` only when batch discovery is needed.
- **Do not call \`sns_registerDomain\`** (AgentKit) for real registration. It returns instruction metadata and is not the SAP MCP registration path.
- **Do not call hosted \`sap_sns_register_agent_domain\` from an accountless remote server.** Hosted SAP MCP cannot sign user-owned SNS purchases and will reject the request before any x402 charge.
- **Use \`sap_sns_register_agent_domain\` only on a local SAP MCP profile** with \`local-dev-keypair\` or an external signer, after user confirmation.
- **Hosted record updates use builder/finalizer flow:** call \`sap_sns_build_manage_record_transaction\`, preview the returned unsigned transaction, then finalize locally with \`sap_payments_finalize_transaction\`.
- If an SNS operation has no unsigned builder, stop and tell the user to run it through the local SAP MCP profile or wizard-managed local signer. Do not pay/retry a hosted direct write.
- SNS domain registration fees are paid in **USDC** (not SOL). SOL is still required for rent-exempt accounts and transaction fees.

For transactions, preview first with \`sap_preview_transaction\`; sign only with \`sap_sign_transaction\` after policy checks and user approval when required.

### ⚡ x402 Hosted Payment Fast Path
- Local stdio MCP tools are free; do not create x402 payment payloads for local stdio calls.
- SAP MCP skill bootstrap tools are free: use \`sap_skills_list\`, \`sap_skills_bundle\`, and \`sap_skills_install\` directly. Do not route skill installation through \`sap_x402_paid_call\`.
- Basic wallet balance reads are free hosted tools: call \`sol_get_balance\`, \`spl-token_getBalance\`, and \`spl-token_getTokenAccounts\` directly on hosted SAP MCP. Do not route them through \`sap_payments_call_paid_tool\` or describe balance failures as x402 facilitator failures unless a paid tool actually returned the error.
- Hosted paid \`tools/call\` requests return HTTP \`402\` with \`PAYMENT-REQUIRED\` instructions.
- Treat \`402 Payment Required\` as the expected hosted payment handshake, not as a tool failure.
- Before any hosted paid/write workflow, call local \`sap_payments_readiness\` when the \`sap_payments\` bridge is available. It reports hosted MCP connectivity, local profile, signer, SOL/USDC payment balance, policy limits, and next action without exposing keypair bytes.
- Reuse the initialized MCP session and retry the same MCP method with the same params after payment; the x402 receipt is bound to method and params, not to JSON-RPC id.
- Prefer \`PAYMENT-SIGNATURE\` for the payment proof header; accept \`X-PAYMENT\` only when the client runtime requires it.
- Capture \`PAYMENT-RESPONSE\` or \`X-PAYMENT-RESPONSE\` as the settlement receipt bound to the tool output.
- x402/pay.sh payment payloads must be signed by the user's wizard-created SAP profile wallet or external signer, never by the hosted server.
- Prefer the local \`sap_payments_call_paid_tool\` bridge with \`maxAttempts\` for hosted paid/write tools when readiness is ready/degraded and the runtime cannot natively replay x402 challenges. \`sap_x402_paid_call\` is a legacy alias.
- If a hosted paid/write tool returns \`transactionBase64\`, \`transaction\`, or an unsigned transaction object, call local \`sap_payments_finalize_transaction\` to preview, sign, and optionally submit with the active local SAP profile.
- If hosted \`sap_register_agent\` returns \`hosted_local_signer_required\`, treat it as a no-charge routing guard and call local \`sap_payments_register_agent\` with the same registration fields plus \`confirm: true\`. Do not retry hosted \`sap_register_agent\`.
- If hosted \`sap_update_agent\` returns \`hosted_local_signer_required\`, treat it as a no-charge routing guard and call local \`sap_payments_update_agent\` with the intended replacement fields plus \`confirm: true\`. Do not retry hosted \`sap_update_agent\`.
- For Escrow V2 hosted flows, use the matching \`sap_escrow_build_*_transaction\` tool and finalize locally with \`sap_payments_finalize_transaction\`; use direct escrow write tools only from a local SAP MCP profile with signer.
- If another hosted write returns \`hosted_local_signer_required\`, treat it as a no-charge routing guard: the requested tool needs a local user signature or is not available as a hosted unsigned builder. Switch to a local SAP MCP profile or a hosted builder plus \`sap_payments_finalize_transaction\` when one exists.
- Do not create \`.js\` or \`.mjs\` signing scripts, do not read keypair JSON, do not pass keypair bytes through env vars, and do not call hosted \`sap_sign_transaction\` for user-owned signing.
- Use low-level \`sap_payments_prepare_challenge\`, \`sap_payments_sign_challenge\`, and \`sap_payments_verify_receipt\` only for custom x402 clients or troubleshooting; normal paid tool execution should go through \`sap_payments_call_paid_tool\`.
- If x402 returns \`BlockhashNotFound\`, \`transaction_simulation_failed\`, \`node is behind\`, or another retryable facilitator/RPC error, do not declare SAP MCP down and do not reuse the old signed payment payload. Re-run the local \`sap_payments_call_paid_tool\` helper or create a fresh payment challenge/payload with the same MCP method and params.
- If the current client runtime cannot produce x402 payment headers, use the local SAP MCP \`sap_payments_call_paid_tool\` bridge when available. If it is missing, ask the user to run the SAP MCP wizard to repair the local \`sap_payments\` MCP entry. Do not ask for a separate x402 plugin first, and do not call the local free server as an implicit substitute.

`;

  if (includeProfiles && allProfiles.length > 0) {
    contextText += `### 📂 Available Profiles
| Profile | Active | Mode | Agent Pubkey |
|---------|--------|------|--------------|
`;
    for (const profile of allProfiles) {
      const activeMarker = profile.name === activeProfile ? '●' : '○';
      contextText += `| ${activeMarker} ${profile.name} | ${profile.name === activeProfile ? 'Yes' : 'No'} | ${profile.mode || 'unknown'} | ${profile.agentPubkey || 'N/A'} |
`;
    }
    
    contextText += `
**Profile Commands:**
\`\`\`bash
# Switch profile
npx sap-mcp-config profile <name>

# Create new profile
npx sap-mcp-config create-profile <name>

# List all profiles
npx sap-mcp-config profiles

# Show current profile info
npx sap-mcp-config profile-info
\`\`\`

`;
  }

  contextText += `### 🚀 Quick Commands
\`\`\`bash
# Check config
npx sap-mcp-config info

# Check pubkey
npx sap-mcp-config pubkey

# Modify settings
npx sap-mcp-config set <field> <value>
\`\`\`

Hosted MCP endpoint: \`${HOSTED_MCP_URL}\`

---

**Ready for SAP operations!** ✅
`;

  return contextText;
}

/**
 * Builds error message for missing configuration.
 */
function buildMissingConfigMessage(activeProfile: string, configDir: string): string {
  return `⚠️ **SAP MCP Configuration Not Found**

The configuration for profile "${activeProfile}" does not exist.

**Quick Setup:**
\`\`\`bash
${WIZARD_NPM_COMMAND}
\`\`\`

**Hosted Wizard Endpoint:**
- Descriptor: ${WIZARD_DESCRIPTOR_URL}
- Install script: ${WIZARD_INSTALL_SCRIPT_URL}
- Hosted MCP URL: ${HOSTED_MCP_URL}

This will guide you through:
1. Choosing/creating a profile name (e.g., citizen-support-agent)
2. Selecting server mode (readonly, local-dev-keypair, etc.)
3. Configuring Solana RPC endpoint
4. Creating or linking a dedicated wallet without exposing keypair bytes to agents
5. Setting security limits

If this agent cannot access the user's OS config directory, tell the user to run the wizard locally. Do not ask for keypair bytes, do not inspect \`~/.config/solana/id.json\`, and do not invent a wallet path. Do not create temporary signing scripts, do not run \`cat <keypair>.json\`, and do not pass keypair bytes through environment variables such as \`KEYPAIR_BYTES\`. For unsigned transactions use \`sap_preview_transaction\`, \`sap_sign_transaction\`, and \`sap_submit_signed_transaction\`; if the transaction format is unsupported, stop and report that limitation.

**Current Profile:** ${activeProfile}
**Config Directory:** ${configDir}
`;
}

/**
 * Builds error message for prompt failures.
 */
function buildErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  
  return `⚠️ **Error Loading SAP MCP Context**

${errorMessage}

**Troubleshooting:**
1. Check if configuration exists: \`npx sap-mcp-config info\`
2. Verify profile: \`npx sap-mcp-config profile-info\`
3. Re-run wizard if needed: \`${WIZARD_NPM_COMMAND}\`
4. If the agent cannot see local OS config, use \`${WIZARD_DESCRIPTOR_URL}\` or \`${WIZARD_INSTALL_SCRIPT_URL}\`
`;
}
