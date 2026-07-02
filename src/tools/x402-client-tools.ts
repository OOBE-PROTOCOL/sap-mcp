/**
 * @name x402 Client Tools
 * @description Agent-side x402 payment tools for self-paying SAP MCP hosted tool calls.
 *
 * These tools allow an agent with a local SAP MCP profile (keypair + RPC) to:
 * 1. Parse a 402 Payment Required response body
 * 2. Create a signed x402 payment payload using the local keypair
 * 3. Retry the original MCP request with the Payment-Signature header
 *
 * All three tools are FREE tier — they must never be monetized (chicken-and-egg).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Keypair } from '@solana/web3.js';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { logger } from '../core/logger.js';
import { getDataDir } from '../config/env.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ── Types ───────────────────────────────────────────────────────────────────

interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  maxAmountRequired?: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: {
    feePayer?: string;
    memo?: string;
    [key: string]: unknown;
  };
}

interface X402Response {
  error?: string;
  accepts?: PaymentRequirements[];
  paymentRequirements?: PaymentRequirements | PaymentRequirements[];
  [key: string]: unknown;
}

interface ParsedPaymentInfo {
  requirements: PaymentRequirements;
  x402Version: number;
  priceUsd: string;
  asset: string;
  network: string;
  payTo: string;
  feePayer: string;
  amount: string;
  scheme: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parsePaymentRequirements(responseBody: unknown): ParsedPaymentInfo | null {
  if (!responseBody || typeof responseBody !== 'object') return null;
  const body = responseBody as X402Response;

  // x402 V2 response: { accepts: [{ scheme, network, amount, asset, payTo, extra: { feePayer } }] }
  let requirements: PaymentRequirements | undefined;
  if (Array.isArray(body.accepts) && body.accepts.length > 0) {
    requirements = body.accepts[0];
  }

  // Fallback: top-level paymentRequirements
  if (!requirements) {
    if (Array.isArray(body.paymentRequirements) && body.paymentRequirements.length > 0) {
      requirements = body.paymentRequirements[0];
    } else if (body.paymentRequirements && !Array.isArray(body.paymentRequirements)) {
      requirements = body.paymentRequirements as PaymentRequirements;
    }
  }

  // Fallback: direct requirements object (has scheme + amount + asset + payTo)
  if (!requirements && body.scheme && body.amount && body.asset && body.payTo) {
    requirements = body as unknown as PaymentRequirements;
  }

  if (!requirements || !requirements.amount || !requirements.asset || !requirements.payTo) {
    return null;
  }

  const feePayer = requirements.extra?.feePayer;
  if (!feePayer) {
    return null;
  }

  // V1 compatibility: use maxAmountRequired if present, otherwise amount
  const amount = requirements.maxAmountRequired ?? requirements.amount;

  return {
    requirements,
    x402Version: 2,
    priceUsd: amount,
    asset: requirements.asset,
    network: requirements.network,
    payTo: requirements.payTo,
    feePayer,
    amount,
    scheme: requirements.scheme,
  };
}

function loadAgentKeypair(context: SapMcpContext): Keypair | null {
  const walletPath = context.config.walletPath;
  if (!walletPath || !existsSync(walletPath)) {
    logger.error('x402 client: no wallet path configured or file not found', { walletPath });
    return null;
  }

  try {
    const raw = readFileSync(walletPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 64) {
      logger.error('x402 client: invalid keypair format', { walletPath });
      return null;
    }
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch (error) {
    logger.error('x402 client: failed to load keypair', { error, walletPath });
    return null;
  }
}

// ── Tool Registration ────────────────────────────────────────────────────────

export function registerX402ClientTools(server: Server, context: SapMcpContext): void {
  // ── Tool 1: x402_parse_payment ─────────────────────────────────────────────
  registerTool(
    server,
    'x402_parse_payment',
    {
      title: 'Parse x402 Payment Required',
      description:
        'Parse a 402 Payment Required response body from a SAP MCP hosted tool call. ' +
        'Extracts the payment requirements (amount, asset, payTo, network, feePayer, scheme). ' +
        'Use this when a paid MCP tool returns a 402 error with payment instructions. ' +
        'SAP MCP context: This is a FREE client-side tool for self-paying hosted MCP tool calls.',
      inputSchema: {
        responseBody: {
          type: 'string',
          description:
            'The JSON response body from the 402 Payment Required HTTP response. ' +
            'Can be a raw JSON string or a JSON object.',
        },
      },
    },
    async (input: { responseBody?: string }) => {
      try {
        const raw = input.responseBody;
        if (!raw) {
          return createTextResponse(JSON.stringify({ error: 'responseBody is required' }));
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Already a JSON object string?
          parsed = raw;
        }

        const paymentInfo = parsePaymentRequirements(parsed);
        if (!paymentInfo) {
          return createTextResponse(
            JSON.stringify({
              error: 'No valid payment requirements found in response body',
              hint: 'The response must contain accepts[] or paymentRequirements with amount, asset, payTo, and extra.feePayer',
            }, null, 2),
          );
        }

        return createTextResponse(JSON.stringify({
          success: true,
          payment: {
            scheme: paymentInfo.scheme,
            network: paymentInfo.network,
            amount: paymentInfo.amount,
            asset: paymentInfo.asset,
            payTo: paymentInfo.payTo,
            feePayer: paymentInfo.feePayer,
            x402Version: paymentInfo.x402Version,
          },
          requirements: paymentInfo.requirements,
        }, null, 2));
      } catch (error) {
        logger.error('x402_parse_payment failed', { error });
        return createTextResponse(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { isError: true },
        );
      }
    },
  );

  // ── Tool 2: x402_create_payment ────────────────────────────────────────────
  registerTool(
    server,
    'x402_create_payment',
    {
      title: 'Create x402 Payment Payload',
      description:
        'Create a signed x402 payment payload using the local SAP MCP profile keypair. ' +
        'Builds a Solana V0 transaction with a USDC TransferChecked instruction to the payTo address, ' +
        'partially signed by the agent wallet. Returns a base64-encoded payment payload suitable ' +
        'for the Payment-Signature header. ' +
        'SAP MCP context: This is a FREE client-side tool. Requires SAP_WALLET_PATH to be configured.',
      inputSchema: {
        paymentRequirements: {
          type: 'string',
          description:
            'The payment requirements JSON object from x402_parse_payment, or the raw 402 response body.',
        },
      },
    },
    async (input: { paymentRequirements?: string }) => {
      try {
        const raw = input.paymentRequirements;
        if (!raw) {
          return createTextResponse(JSON.stringify({ error: 'paymentRequirements is required' }));
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return createTextResponse(JSON.stringify({ error: 'Invalid JSON in paymentRequirements' }));
        }

        const paymentInfo = parsePaymentRequirements(parsed);
        if (!paymentInfo) {
          return createTextResponse(
            JSON.stringify({ error: 'No valid payment requirements found' }),
          );
        }

        // Load the agent's keypair
        const keypair = loadAgentKeypair(context);
        if (!keypair) {
          return createTextResponse(
            JSON.stringify({
              error: 'No agent wallet configured. Set SAP_WALLET_PATH in your SAP MCP profile config.',
              walletPath: context.config.walletPath ?? '(not set)',
            }, null, 2),
          );
        }

        const rpcUrl = context.config.rpcUrl;

        // Dynamically import @x402/svm client-side code
        const svmModule = await import('@x402/svm/exact/client');
        const { ExactSvmScheme } = svmModule as { ExactSvmScheme: new (...args: unknown[]) => unknown };
        const { toClientSvmSigner } = await import('@x402/svm');

        // Create a TransactionSigner from the keypair bytes
        const signerBytes = keypair.secretKey;
        const keyPairSigner = await createKeyPairSignerFromBytes(signerBytes);

        // Create the ExactSvmScheme client
        const clientScheme = new ExactSvmScheme(keyPairSigner, {
          rpcUrl,
        });

        // Create the payment payload
        const result = await (clientScheme as unknown as {
          createPaymentPayload: (version: number, req: PaymentRequirements) => Promise<{
            x402Version: number;
            payload: { transaction: string };
          }>;
        }).createPaymentPayload(paymentInfo.x402Version, paymentInfo.requirements);

        // Build the Payment-Signature header value
        // x402 header format: { x402Version: 2, payload: "base64_transaction" }
        const paymentHeader = JSON.stringify({
          x402Version: result.x402Version,
          payload: result.payload,
        });

        return createTextResponse(JSON.stringify({
          success: true,
          paymentPayload: result.payload,
          paymentHeader,
          x402Version: result.x402Version,
          network: paymentInfo.network,
          amount: paymentInfo.amount,
          asset: paymentInfo.asset,
          payTo: paymentInfo.payTo,
          feePayer: paymentInfo.feePayer,
          payerAddress: keypair.publicKey.toBase58(),
        }, null, 2));
      } catch (error) {
        logger.error('x402_create_payment failed', { error });
        return createTextResponse(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { isError: true },
        );
      }
    },
  );

  // ── Tool 3: x402_paid_call ─────────────────────────────────────────────────
  registerTool(
    server,
    'x402_paid_call',
    {
      title: 'Retry MCP Call with x402 Payment',
      description:
        'Retry a previously-failed MCP tool call that returned 402 Payment Required, ' +
        'attaching the Payment-Signature header with the signed payment payload. ' +
        'SAP MCP context: This is a FREE client-side tool that performs a direct HTTP request ' +
        'to the SAP MCP hosted endpoint with the payment header attached.',
      inputSchema: {
        endpoint: {
          type: 'string',
          description: 'The SAP MCP endpoint URL (e.g. https://mcp.sap.oobeprotocol.ai/mcp)',
        },
        toolName: {
          type: 'string',
          description: 'The MCP tool name to call (e.g. jupiter_searchTokens)',
        },
        arguments: {
          type: 'string',
          description: 'JSON string of the tool arguments',
        },
        paymentHeader: {
          type: 'string',
          description: 'The Payment-Signature header value from x402_create_payment',
        },
      },
    },
    async (input: {
      endpoint?: string;
      toolName?: string;
      arguments?: string;
      paymentHeader?: string;
    }) => {
      try {
        if (!input.endpoint || !input.toolName || !input.paymentHeader) {
          return createTextResponse(JSON.stringify({
            error: 'endpoint, toolName, and paymentHeader are required',
          }));
        }

        let toolArgs: unknown = {};
        if (input.arguments) {
          try {
            toolArgs = JSON.parse(input.arguments);
          } catch {
            return createTextResponse(JSON.stringify({ error: 'Invalid JSON in arguments' }));
          }
        }

        // Build the JSON-RPC request
        const jsonRpcRequest = {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: input.toolName,
            arguments: toolArgs,
          },
        };

        // Perform the HTTP request with Payment-Signature header
        const response = await fetch(input.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Payment-Signature': input.paymentHeader,
          },
          body: JSON.stringify(jsonRpcRequest),
        });

        const responseText = await response.text();

        if (response.status === 402) {
          return createTextResponse(JSON.stringify({
            error: 'Payment rejected by facilitator',
            status: 402,
            response: responseText,
            hint: 'The facilitator may have rejected the payment. Check the facilitator logs.',
          }, null, 2));
        }

        if (response.status >= 400) {
          return createTextResponse(JSON.stringify({
            error: `HTTP ${response.status}`,
            response: responseText,
          }, null, 2));
        }

        // Parse the response — could be JSON or SSE
        let result: unknown = responseText;
        try {
          result = JSON.parse(responseText);
        } catch {
          // SSE format — extract the data
          const lines = responseText.split('\n');
          const dataLines = lines.filter(l => l.startsWith('data: '));
          if (dataLines.length > 0) {
            try {
              result = JSON.parse(dataLines.map(l => l.slice(6)).join(''));
            } catch {
              // Keep as text
            }
          }
        }

        // Check for Payment-Response header (settlement result)
        const paymentResponseHeader = response.headers.get('Payment-Response') ??
          response.headers.get('X-Payment-Response');

        return createTextResponse(JSON.stringify({
          success: true,
          status: response.status,
          result,
          settlement: paymentResponseHeader ?? null,
        }, null, 2));
      } catch (error) {
        logger.error('x402_paid_call failed', { error });
        return createTextResponse(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { isError: true },
        );
      }
    },
  );

  logger.debug('x402 client tools registered', { count: 3 });
}