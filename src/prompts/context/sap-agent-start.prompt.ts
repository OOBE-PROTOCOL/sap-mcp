/**
 * SAP MCP Agent Start Prompt
 *
 * Gives agents a compact startup routine for hosted SAP MCP, local profile
 * discovery, skills loading, and x402 paid-call handling.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerPrompt } from '../../adapters/mcp/sdk-compat.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';

const HOSTED_MCP_URL = 'https://mcp.sap.oobeprotocol.ai/mcp';
const WIZARD_COMMAND = 'npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard';

interface AgentStartArgs {
  goal?: string;
}

type PromptArgs = Record<string, unknown> | undefined;

/**
 * @name sapAgentStartPrompt
 * @description Registers the short "Start SAP MCP" bootstrap prompt.
 */
export function sapAgentStartPrompt(server: Server, context: SapMcpContext): void {
  registerPrompt(
    server,
    'sap-agent-start',
    {},
    {
      description: 'Start SAP MCP agent mode. Use when the user says "Start SAP MCP", "Initialize SAP MCP", "Load SAP", or asks the agent to use SAP MCP.',
      arguments: [
        {
          name: 'goal',
          description: 'Optional user goal to focus the startup, such as wallet balance, agent registration, SNS, swap, or analytics.',
          required: false,
        },
      ],
    },
    async (args: PromptArgs) => {
      const goal = typeof (args as AgentStartArgs | undefined)?.goal === 'string'
        ? ((args as AgentStartArgs).goal as string)
        : undefined;

      logger.debug('SAP agent start prompt generated', { mode: context.config.mode, goal });

      return {
        description: 'SAP MCP startup instructions',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: buildStartPrompt(context, goal),
            },
          },
        ],
      };
    },
  );

  logger.debug('SAP agent start prompt registered');
}

function buildStartPrompt(context: SapMcpContext, goal: string | undefined): string {
  return `# Start SAP MCP

You are connected to SAP MCP. Treat this as the canonical startup routine whenever the user says "Start SAP MCP", "Initialize SAP MCP", "Load SAP", or asks to use SAP MCP.

## User Goal
${goal ? `- ${goal}` : '- No specific goal supplied yet. Ask one concise follow-up only if tool selection needs it.'}

## Hosted Endpoint
- Use hosted SAP MCP at \`${HOSTED_MCP_URL}\`.
- Current server mode visible to this prompt: \`${context.config.mode}\`.
- Hosted SAP MCP is accountless and non-custodial. OOBE never receives user keypair bytes.

## First Calls
1. Call \`sap_agent_start\` if it is exposed as a tool. It returns a machine-readable startup playbook.
2. Call \`sap_skills_bundle\` with \`{"includeContents": true}\` and load the bundled SAP MCP skills into your working context.
3. Call \`tools/list\` and use exact tool names from the returned list. Do not rewrite hyphenated names such as \`spl-token_*\`.
4. Call hosted \`sap_profile_current\` only to describe the remote server. Do not report hosted \`default\` as the user's local profile.
5. If the local \`sap_payments\` namespace is available, call \`sap_payments_profile_current\` and \`sap_payments_readiness\` before paid/write work.

## Simple Connection Questions
If the user only asks whether SAP MCP is connected, answer with a compact status check. Do not dump every tool category, every protocol, or the full registry.

Use this shape:
- Connected: yes/no
- Endpoint and mode
- Hosted server is accountless/non-custodial
- Local \`sap_payments\` bridge ready/missing only if you actually checked it
- One next action

Do not infer that tools are callable from startup logs alone. A tool is callable in the current runtime only after it appears in the runtime tool surface or an actual MCP call succeeds. If tools/list works but the runtime does not expose callable functions, say the runtime may need restart/reload; do not claim SAP MCP itself is broken.

## Paid And Write Calls
- Free reads can call hosted tools directly.
- Paid hosted tools return HTTP 402 with x402/pay.sh payment requirements. Treat that as the normal payment handshake, not as a failure.
- Prefer local \`sap_payments_call_paid_tool\` for paid/write hosted calls. \`sap_x402_paid_call\` is a legacy alias.
- Never ask the user for private key bytes. The local SAP profile or external signer signs payment payloads.
- If a payment retry sees \`BlockhashNotFound\`, \`transaction_simulation_failed\`, \`node is behind\`, or an expired payload, create a fresh challenge through \`sap_payments_call_paid_tool\`. Do not reuse old signed payment payloads.
- Capture \`PAYMENT-RESPONSE\` or \`X-PAYMENT-RESPONSE\` as a receipt and include it in the final audit summary when relevant.

## If The Bridge Is Missing
- Say: "Hosted SAP MCP is connected, but the local sap_payments bridge is not visible in this runtime yet."
- Ask the user to run the SAP MCP wizard repair flow, then restart the agent runtime.
- Wizard command: \`${WIZARD_COMMAND}\`

## User-Facing Summary Template
When startup succeeds, keep it short:

"SAP MCP is ready. I loaded the SAP skills, hosted tools are available at /mcp, and paid/write operations will use your local sap_payments bridge so signatures stay user-controlled. What should we do first?"
`;
}
