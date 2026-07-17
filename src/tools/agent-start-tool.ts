/**
 * @module agent-start-tool
 * @description Free bootstrap tool that teaches agents how to activate SAP MCP correctly.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import type { SapMcpContext } from '../core/types.js';

const HOSTED_MCP_URL = 'https://mcp.sap.oobeprotocol.ai/mcp';
const WIZARD_COMMAND = 'npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard';

/**
 * @name registerAgentStartTool
 * @description Registers the SAP MCP startup playbook as a free read-only tool.
 */
export function registerAgentStartTool(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_agent_start',
    {
      title: 'Start SAP MCP Agent Mode',
      description: 'Return the concise startup playbook for agents using SAP MCP. Call this when the user says "Start SAP MCP", "Initialize SAP MCP", "Load SAP", or asks what SAP MCP can do.',
      inputSchema: {
        goal: {
          type: 'string',
          description: 'Optional user goal to tailor the startup plan, such as "register an agent", "check wallet balance", or "swap tokens".',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the bootstrap instructions were generated.' },
          activationPhrases: {
            type: 'array',
            description: 'Short user phrases that should trigger this bootstrap behavior.',
            items: { type: 'string' },
          },
          hostedEndpoint: { type: 'string', description: 'Canonical hosted SAP MCP endpoint.' },
          serverMode: { type: 'string', description: 'Current SAP MCP server mode.' },
          immediateToolCalls: {
            type: 'array',
            description: 'Tool calls the agent should run first when available.',
            items: { type: 'object' },
          },
          paymentFlow: { type: 'object', description: 'How to handle hosted x402/pay.sh paid calls safely.' },
          connectionCheck: { type: 'object', description: 'How agents should answer simple connection/status questions.' },
          userFacingSummary: { type: 'string', description: 'Short text the agent can show the user after startup.' },
          repairCommand: { type: 'string', description: 'Wizard command to repair local hosted/profile/payment bridge setup.' },
        },
        required: ['success', 'activationPhrases', 'hostedEndpoint', 'serverMode', 'immediateToolCalls', 'paymentFlow', 'connectionCheck', 'userFacingSummary', 'repairCommand'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      const goal = parseGoal(input);
      return createTextResponse(JSON.stringify(buildAgentStartPayload(context, goal), null, 2));
    },
  );
}

function parseGoal(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const goal = (input as Record<string, unknown>).goal;
  return typeof goal === 'string' && goal.trim().length > 0 ? goal.trim() : undefined;
}

function buildAgentStartPayload(context: SapMcpContext, goal: string | undefined): Record<string, unknown> {
  return {
    success: true,
    activationPhrases: [
      'Start SAP MCP',
      'Initialize SAP MCP',
      'Load SAP',
      'SAP mode',
      'Use SAP MCP',
    ],
    hostedEndpoint: HOSTED_MCP_URL,
    serverMode: context.config.mode,
    goal: goal ?? null,
    immediateToolCalls: [
      {
        namespace: 'hosted sap',
        tool: 'sap_agent_start',
        required: true,
        reason: 'Load the SAP MCP startup playbook and avoid guessing profile/payment behavior.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_skills_bundle',
        arguments: { includeContents: true },
        required: true,
        reason: 'Load the bundled SAP MCP skills into agent context before selecting protocol tools.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_profile_current',
        required: false,
        reason: 'Inspect hosted server state only. Do not treat hosted profile default as the user local wallet.',
      },
      {
        namespace: 'local sap_payments',
        tool: 'sap_payments_profile_current',
        required: false,
        reason: 'Inspect the user local profile, wallet public key, and signer status when the bridge is exposed.',
      },
      {
        namespace: 'local sap_payments',
        tool: 'sap_payments_readiness',
        required: false,
        reason: 'Before paid/write workflows, verify hosted connectivity, local signer, payment balance, and policy limits.',
      },
    ],
    routingRules: [
      'Use exact tool names returned by tools/list; do not rewrite hyphens to underscores.',
      'For a simple connection question, answer briefly. Do not dump the full tool catalog, categories, or every protocol unless the user asks what tools are available.',
      'Hosted SAP MCP is accountless and non-custodial. OOBE never has user keypair bytes.',
      'Do not report hosted profile default as the user local profile.',
      'For local wallet/profile questions, prefer sap_payments_profile_current when available.',
      'For free reads, call hosted tools directly.',
      'For paid/write calls, use sap_payments_call_paid_tool from the local sap_payments bridge when available.',
      'If sap_payments is missing, ask the user to run the wizard repair flow and restart the agent runtime.',
      'If a hosted tool returns transactionBase64, transaction, or an unsigned transaction object, use local sap_payments_finalize_transaction. Never call hosted sap_sign_transaction for user-owned signing, create local .js/.mjs signing scripts, or read keypair JSON.',
      'Preview value-moving actions and ask for confirmation when policy requires it.',
    ],
    paymentFlow: {
      challenge: 'Hosted paid tools return 402 Payment Required with x402/pay.sh requirements.',
      preferredHelper: 'sap_payments_call_paid_tool',
      readinessHelper: 'sap_payments_readiness',
      legacyAlias: 'sap_x402_paid_call',
      retryPolicy: 'On BlockhashNotFound, transaction_simulation_failed, node-behind, or expired payment payload, create a fresh challenge and retry through sap_payments_call_paid_tool. Do not reuse an old signed payload.',
      receiptRule: 'Capture PAYMENT-RESPONSE or X-PAYMENT-RESPONSE and bind it to the tool output/audit summary.',
    },
    transactionFlow: {
      unsignedTransactionTools: [
        'jupiter_swapInstructions',
        'jupiter_getOrder',
        'magicblock_swap',
        'magicblock_deposit',
        'magicblock_transfer',
        'magicblock_withdraw',
        'sap_sns_build_manage_record_transaction',
        'sap_sns_build_set_primary_domain_transaction',
      ],
      localBridgePath: ['sap_payments_finalize_transaction'],
      localServerPath: ['sap_preview_transaction', 'sap_sign_transaction', 'sap_submit_signed_transaction'],
      rule: 'For hosted builders, finalize with local sap_payments_finalize_transaction. For local SAP MCP stdio builders, use sap_preview_transaction -> sap_sign_transaction -> sap_submit_signed_transaction. Do not write temporary signing scripts, shell commands that read keypair files, or raw transaction signers.',
    },
    connectionCheck: {
      intent: 'Use this when the user asks "are you connected?", "is SAP MCP connected?", "check SAP", or similar status-only questions.',
      minimumChecks: ['sap_agent_start when available', 'sap_profile_current for hosted server state', 'sap_payments_readiness only when the user asks about paid/write readiness'],
      responseShape: [
        'Connected: yes/no',
        'Endpoint and mode',
        'Hosted server is accountless/non-custodial',
        'Local sap_payments bridge ready/missing only if checked',
        'One next action',
      ],
      avoid: [
        'Do not list all tools or categories.',
        'Do not infer that registered tools are callable in the current runtime unless an MCP tool call actually succeeds.',
        'Do not say the hosted server is read-only because signerConfigured is false.',
        'Do not inspect local keypair files or guess wallet paths.',
      ],
    },
    skills: {
      listTool: 'sap_skills_list',
      bundleTool: 'sap_skills_bundle',
      installTool: 'sap_skills_install',
      hostedInstallRule: 'Hosted SAP MCP cannot write local files; load sap_skills_bundle into context or run the wizard locally.',
    },
    userFacingSummary: 'SAP MCP is ready: hosted tools are available at /mcp, skills are loaded, and paid/write operations should use the local sap_payments bridge so signatures stay user-controlled.',
    repairCommand: WIZARD_COMMAND,
  };
}
