/**
 * SAP MCP Agent Intent Router Prompt
 *
 * Gives agent runtimes a compact decision tree for choosing hosted reads,
 * paid hosted calls, local user signing, unsigned builders, or repair flows.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';

interface IntentRouterArgs {
  userIntent?: string;
  lastError?: string;
  targetTool?: string;
}

type PromptArgs = Record<string, unknown> | undefined;

/**
 * @name sapAgentIntentRouterPrompt
 * @description Registers the compact SAP MCP intent routing prompt.
 */
export function sapAgentIntentRouterPrompt(server: Server, context: SapMcpContext): void {
  registerPrompt(
    server,
    'sap-agent-intent-router',
    {},
    {
      description:
        'Route a user SAP MCP request to the correct hosted/read, paid-call, local-signing, unsigned-builder, or repair flow. Use before paid/write operations and after routing errors.',
      arguments: [
        {
          name: 'userIntent',
          description:
            'Plain-language user goal, e.g. "check balance", "register my agent", "update metadata image", "swap SOL to USDC", "create escrow", or "is SAP connected?".',
          required: false,
        },
        {
          name: 'targetTool',
          description:
            'Optional exact MCP tool name being considered. Use exact names from tools/list; do not rewrite hyphenated names.',
          required: false,
        },
        {
          name: 'lastError',
          description:
            'Optional last error string or JSON-RPC error data. The router maps common SAP/x402/MCP errors to the next safe tool.',
          required: false,
        },
      ],
    },
    async (args: PromptArgs) => {
      const parsed = parseIntentRouterArgs(args);
      logger.debug('SAP agent intent router prompt generated', {
        mode: context.config.mode,
        userIntent: parsed.userIntent,
        targetTool: parsed.targetTool,
      });

      return {
        description: 'SAP MCP intent routing instructions',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: buildIntentRouterPrompt(context, parsed),
            },
          },
        ],
      };
    },
  );

  logger.debug('SAP agent intent router prompt registered');
}

function parseIntentRouterArgs(args: PromptArgs): IntentRouterArgs {
  const record = (args ?? {}) as Record<string, unknown>;
  return {
    userIntent: typeof record.userIntent === 'string' ? record.userIntent : undefined,
    targetTool: typeof record.targetTool === 'string' ? record.targetTool : undefined,
    lastError: typeof record.lastError === 'string' ? record.lastError : undefined,
  };
}

function buildIntentRouterPrompt(context: SapMcpContext, args: IntentRouterArgs): string {
  return `# SAP MCP Intent Router

Use this router to choose the next SAP MCP action with the least friction and no unsafe shortcuts.

## Current Request
- User intent: ${args.userIntent ? `\`${args.userIntent}\`` : 'not supplied'}
- Target tool: ${args.targetTool ? `\`${args.targetTool}\`` : 'not supplied'}
- Last error: ${args.lastError ? `\`${args.lastError}\`` : 'none'}
- Server mode visible to this prompt: \`${context.config.mode}\`

## Decision Tree

### 1. Connection/status only
If the user asks "are you connected?", "is SAP ready?", or similar:
1. Call \`sap_agent_start\`.
2. Call \`sap_agent_runtime_status\` with \`{"intent":"connection"}\`.
3. Answer briefly: endpoint, mode, hosted non-custodial status, local \`sap_payments\` readiness only if checked, and one next action.
Do not dump the full tool catalog.

### 2. Exact/base reads
For exact agent, wallet, balance, global-state, or compact directory orientation:
- Prefer free exact/base tools first:
  \`sap_agent_context\`, \`sap_get_agent\`, \`sap_get_agent_profile\`,
  \`sap_get_agent_stats\`, \`sap_get_global_state\`, \`sap_is_agent_active\`,
  \`sap_list_agents\` with \`limit <= 20\` and \`view: "compact"\`,
  \`sol_get_balance\`, \`spl-token_getBalance\`, \`spl-token_getTokenAccounts\`,
  or \`magicblock_balance\`.
- Use broad/enriched paid discovery only when the user asked for search, ranking,
  enrichment, analytics, or larger pages.

### 3. Paid hosted tools
Before a paid hosted read/builder/value tool:
1. Call \`sap_estimate_tool_cost\` for the target tool.
2. Verify the local payer has SOL for fees and USDC for x402 when balance tools are available.
3. Use \`sap_payments_call_paid_tool\` when the runtime cannot replay x402 natively.
4. Treat x402/pay.sh 402 responses as a payment challenge, not as a failure.
5. If the challenge price exceeds \`maxPriceUsd\`, stop and ask the user before increasing the cap.

### 4. Registry writes
For SAP agent registration or update:
- Do not use hosted \`sap_register_agent\` or hosted \`sap_update_agent\` when they return \`hosted_local_signer_required\`.
- Use local \`sap_payments_register_agent\` for registration and local \`sap_payments_update_agent\` for profile/metadata updates.
- Use \`confirm: true\` only after the user approves the preview.
- Report the agent PDA, owner, transaction signature, and protocol-fee verification status.
- Do not call the lifecycle complete if the agent account or protocol-fee audit is missing.
- If a profile update returns Anchor 3012, \`AccountNotInitialized\`, or
  \`pricing_menu\`, do not repair the runtime and do not retry the same write.
  Use \`sap_agent_next_action\` and \`sap_protocol_invariants\`; the failure is
  an SAP registry account lifecycle issue.

### 5. Unsigned builders and transaction finalization
If a hosted tool returns \`transactionBase64\`, \`transaction\`, or an unsigned transaction object:
1. Call \`sap_payments_finalize_transaction\`.
2. Preview first.
3. Sign locally through the SAP profile or external signer.
4. Submit only when the user approved \`submit: true\`.
5. Prefer the hosted submit relay for already-signed bytes unless the user chose local RPC.
Never create temporary signing scripts, never read keypair JSON, and never export secret bytes.

### 6. Escrow V2
- Use V2 only.
- Default \`settlementSecurity\` is \`DisputeWindow (2)\`; never default to \`SelfReport (0)\`.
- Amounts are smallest units: lamports for SOL, micro-USDC for USDC.
- Hosted mode should use \`sap_escrow_build_*_transaction\` then
  \`sap_payments_finalize_transaction\`.

### 7. Repair and missing bridge
If \`sap_payments\` is missing, startup closes before initialization, or the runtime
does not expose local tools after config repair:
- Say the hosted SAP MCP is connected but the local payment/signing bridge is not visible in this runtime.
- Ask the user to run \`npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config repair\`.
- Ask them to fully restart the agent runtime.
- Do not claim the hosted server can see local wallet paths.

### 8. Error routing
- \`hosted_local_signer_required\`: no x402 fee should be charged; switch to local \`sap_payments_*\` or unsigned builder finalization.
- \`payment_required\` or HTTP 402: normal x402 challenge; use local paid-call bridge.
- \`BlockhashNotFound\`, \`node is behind\`, \`minimum context slot\`, \`fetch failed\`, \`transaction_simulation_failed\`: retry with a fresh challenge or fresh transaction; do not reuse stale signed payment payloads.
- \`mcp_session_required\`: call \`initialize\` first and reuse the returned \`mcp-session-id\`; do not invent client UUIDs.
- \`session_not_found\`: reinitialize the MCP session and retry once.
- Schema mismatch: call \`tools/list\` or inspect the exact input schema; do not guess aliases.

## Final Answer Style
Be concise and action-oriented:
- what was checked
- which profile/wallet was used, redacted when needed
- what was paid, if anything
- what was signed/submitted, if anything
- one safe next action
`;
}
