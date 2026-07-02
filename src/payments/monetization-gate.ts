/**
 * @name McpMonetizationGate
 * @description x402/pay.sh payment gate for hosted SAP MCP Streamable HTTP requests.
 */

import * as http from 'http';
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from '@x402/core/server';
import type {
  HTTPProcessResult,
  HTTPRequestContext,
  HTTPResponseInstructions,
  RoutesConfig,
} from '@x402/core/server';
import type { Network, PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { registerExactSvmScheme } from '@x402/svm/exact/server';
import type { SapMcpConfig, SapMcpMonetizationConfig } from '../config/env.js';
import { logger } from '../core/logger.js';
import { NativeHttpAdapter, parseJsonBody, readRequestBody } from './http-adapter.js';
import { parseJsonRpcBody } from './json-rpc.js';
import type { PaymentDecision } from './pricing.js';
import { formatUsdPrice, resolvePaymentDecision } from './pricing.js';
import { hashRequestBody, UsageLedger, type PaymentRequestMetadata } from './usage-ledger.js';

/**
 * @name McpRequestHandler
 * @description Handler invoked after the payment gate has authorized or bypassed a request.
 */
export type McpRequestHandler = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedBody?: unknown,
) => Promise<void>;

type WriteHeadArgs =
  | [statusCode: number, statusMessage?: string, headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[]]
  | [statusCode: number, headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[]];

type WriteArgs =
  | [chunk: string | Uint8Array, callback?: (error?: Error) => void]
  | [chunk: string | Uint8Array, encoding: BufferEncoding, callback?: (error?: Error) => void];

type EndArgs =
  | []
  | [callback: () => void]
  | [chunk: string | Uint8Array, callback?: () => void]
  | [chunk: string | Uint8Array, encoding: BufferEncoding, callback?: () => void];

type BufferedResponseCall =
  | { kind: 'writeHead'; args: WriteHeadArgs }
  | { kind: 'write'; args: WriteArgs }
  | { kind: 'end'; args: EndArgs }
  | { kind: 'flushHeaders' };

const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const SOLANA_TESTNET_CAIP2 = 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z';
const PAID_ROUTE_PATTERN = 'POST /mcp/paid/*';

/**
 * @name McpMonetizationGate
 * @description Applies x402 payment verification and settlement before forwarding requests to the MCP transport.
 */
export class McpMonetizationGate {
  private readonly appConfig: SapMcpConfig;
  private readonly monetization: SapMcpMonetizationConfig;
  private readonly httpResourceServer: x402HTTPResourceServer;
  private readonly usageLedger: UsageLedger;

  private constructor(
    appConfig: SapMcpConfig,
    httpResourceServer: x402HTTPResourceServer,
    usageLedger = new UsageLedger(),
  ) {
    this.appConfig = appConfig;
    this.monetization = appConfig.monetization;
    this.httpResourceServer = httpResourceServer;
    this.usageLedger = usageLedger;
  }

  /**
   * @name create
   * @description Builds and initializes an x402 HTTP resource server for SAP MCP requests.
   */
  public static async create(appConfig: SapMcpConfig): Promise<McpMonetizationGate | undefined> {
    if (!appConfig.monetization.enabled) {
      return undefined;
    }

    validateMonetizationConfig(appConfig.monetization);

    const facilitatorUrl = appConfig.monetization.facilitatorUrl;
    if (!facilitatorUrl) {
      throw new Error('SAP MCP monetization requires SAP_MCP_X402_FACILITATOR_URL');
    }

    const authToken = appConfig.monetization.facilitatorAuthToken;
    const facilitator = new HTTPFacilitatorClient({
      url: facilitatorUrl,
      createAuthHeaders: authToken
        ? async () => ({
            verify: { Authorization: `Bearer ${authToken}` },
            settle: { Authorization: `Bearer ${authToken}` },
            supported: { Authorization: `Bearer ${authToken}` },
          })
        : undefined,
    });

    const resourceServer = new x402ResourceServer(facilitator);
    registerExactSvmScheme(resourceServer, {
      networks: [resolvePaymentNetwork(appConfig) as Network],
    });

    const httpResourceServer = new x402HTTPResourceServer(
      resourceServer,
      buildRoutesConfig(appConfig),
    );
    await httpResourceServer.initialize();

    logger.info('SAP MCP monetization gate initialized', {
      provider: appConfig.monetization.provider,
      network: resolvePaymentNetwork(appConfig),
      facilitatorUrl: appConfig.monetization.facilitatorUrl,
      payShCheckoutUrl: appConfig.monetization.payShCheckoutUrl,
    });

    return new McpMonetizationGate(appConfig, httpResourceServer, await UsageLedger.createFromEnv());
  }

  /**
   * @name handle
   * @description Authorizes a request via x402 when required, then forwards it to MCP and settles on success.
   */
  public async handle(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    next: McpRequestHandler,
  ): Promise<void> {
    if (!shouldInspectRequest(request)) {
      await next(request, response);
      return;
    }

    let rawBody: Buffer;
    let parsedBody: unknown;
    try {
      rawBody = await readRequestBody(request);
      parsedBody = parseJsonBody(rawBody);
    } catch (error) {
      logger.warn('Failed to parse monetized MCP request', { error });
      writeJson(response, 400, { error: 'Invalid JSON-RPC request body' });
      return;
    }

    const parsedMcp = parseJsonRpcBody(parsedBody);
    const decision = resolvePaymentDecision(parsedMcp, this.monetization);

    if (!decision.required) {
      await next(request, response, parsedBody);
      return;
    }

    const requestHash = hashRequestBody(rawBody);
    const virtualPath = buildPaidVirtualPath(decision, requestHash);
    const metadata = buildRequestMetadata(request, requestHash, virtualPath);
    await this.usageLedger.recordDecision(metadata, decision);
    logger.info('Payment required', {
      toolNames: decision.toolNames,
      price: decision.price,
      callerIp: metadata.remoteAddress,
      requestHash: requestHash.slice(0, 12),
    });

    const context = this.buildRequestContext(request, parsedBody, virtualPath);

    // Debug: check if Payment-Signature header is present
    const psHeader = (request.headers['payment-signature'] as string | undefined) ??
      (request.headers['x-payment'] as string | undefined);
    if (psHeader) {
      logger.info('Payment-Signature header present in request', {
        headerLength: psHeader.length,
        requestHash: requestHash.slice(0, 12),
        isBase64: /^[A-Za-z0-9+/]+=*$/.test(psHeader),
      });
    }

    const paymentResult = await this.httpResourceServer.processHTTPRequest(context, {
      appName: 'SAP MCP Server',
      currentUrl: context.adapter.getUrl(),
      testnet: resolvePaymentNetwork(this.appConfig) !== SOLANA_MAINNET_CAIP2,
    });

    // Debug: log the payment result type
    logger.info('x402 processHTTPRequest result', {
      type: paymentResult.type,
      hasPaymentHeader: Boolean(psHeader),
    });

    if (paymentResult.type === 'payment-error') {
      // V1 compatibility: @x402/svm V1 exact scheme checks maxAmountRequired but
      // V2 resource server only emits amount. Patch the 402 response body to add
      // maxAmountRequired so V1-only clients and facilitators can verify payments.
      patchV1Compatibility(paymentResult.response);

      // Extract the x402 PaymentRequired object from the PAYMENT-REQUIRED header.
      // The x402 resource server puts the accepts[] (with extra.feePayer) in this
      // header as base64-encoded JSON.
      let acceptsFromHeader: unknown = undefined;
      try {
        const paymentRequiredHeader = paymentResult.response.headers?.['payment-required'] ??
          paymentResult.response.headers?.['PAYMENT-REQUIRED'];
        if (typeof paymentRequiredHeader === 'string') {
          const decoded = Buffer.from(paymentRequiredHeader, 'base64').toString('utf-8');
          const paymentRequired = JSON.parse(decoded) as { accepts?: unknown[] };
          acceptsFromHeader = paymentRequired.accepts;
        }
      } catch {
        // Header not present or invalid — fall back to body
      }

      // Instead of returning HTTP 402 (which the MCP SDK can't handle and hangs),
      // return HTTP 200 with a JSON-RPC error response containing the payment
      // requirements. The agent will see this as a normal (errorful) tool result
      // and can use x402_paid_call to self-pay and retry.
      const responseBody = paymentResult.response.body as Record<string, unknown> | undefined;
      const jsonRpcId = extractJsonRpcId(parsedBody);

      // Use accepts from header (has extra.feePayer) or fall back to body
      const paymentRequirements = acceptsFromHeader ??
        responseBody?.accepts ??
        responseBody?.paymentRequirements ??
        responseBody;

      writeJson(response, 200, {
        jsonrpc: '2.0',
        id: jsonRpcId,
        error: {
          code: -32001,
          message: 'payment_required',
          data: {
            protocol: 'x402',
            paymentRequirements,
            instructions: {
              header: 'Payment-Signature',
              steps: [
                'Call x402_paid_call with endpoint, toolName, and arguments to auto-pay',
              ],
            },
          },
        },
      });
      return;
    }

    if (paymentResult.type === 'no-payment-required') {
      await next(request, response, parsedBody);
      return;
    }

    await this.usageLedger.recordVerified(metadata, decision);
    logger.info('Payment verified', {
      toolNames: decision.toolNames,
      price: decision.price,
      requestHash: metadata.requestHash.slice(0, 12),
    });
    await this.forwardAndSettle({
      request,
      response,
      next,
      context,
      metadata,
      decision,
      paymentResult,
      parsedBody,
    });
  }

  /**
   * @name handlePaidRequest
   * @description Fast path for requests that already include a Payment-Signature header.
   * Verifies the payment with the facilitator, executes the MCP handler, then settles.
   */
  private async handlePaidRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    next: McpRequestHandler,
    parsedBody: unknown,
    decision: PaymentDecision,
    rawBody: Buffer,
  ): Promise<void> {
    const paymentHeader =
      (request.headers['payment-signature'] as string | undefined) ??
      (request.headers['x-payment'] as string | undefined);

    if (!paymentHeader) {
      writeJson(response, 402, { error: 'payment_required', message: 'Payment-Signature header missing' });
      return;
    }

    // Parse the payment header → { x402Version, payload }
    // x402 protocol: header is base64-encoded JSON
    let paymentPayload: PaymentPayload;
    let x402Version: number;
    try {
      // Try base64 decode first (x402 spec compliant)
      let decoded: string;
      try {
        decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
      } catch {
        // Fallback: raw JSON (backward compat with non-spec clients)
        decoded = paymentHeader;
      }
      const parsed = JSON.parse(decoded) as { x402Version?: number; payload?: unknown };
      x402Version = parsed.x402Version ?? 2;
      paymentPayload = { x402Version, payload: parsed.payload } as PaymentPayload;
    } catch {
      writeJson(response, 400, { error: 'Invalid Payment-Signature header format' });
      return;
    }

    // Build payment requirements from the decision + monetization config
    const paidDecision = decision as Extract<PaymentDecision, { required: true }>;
    const requestHash = hashRequestBody(rawBody);
    const virtualPath = buildPaidVirtualPath(paidDecision, requestHash);
    const metadata = buildRequestMetadata(request, requestHash, virtualPath);

    // Build payment requirements that the facilitator expects
    const paymentRequirements: PaymentRequirements = {
      scheme: 'exact',
      network: resolvePaymentNetwork(this.appConfig),
      amount: paidDecision.priceUsd.toString(),
      maxAmountRequired: paidDecision.priceUsd.toString(),
      asset: '', // Will be filled by facilitator during verify
      payTo: this.monetization.payTo ?? '',
      maxTimeoutSeconds: this.monetization.maxTimeoutSeconds,
      extra: {},
    } as PaymentRequirements;

    // First: fetch /supported to get the facilitator's feePayer and asset
    try {
      const supportedResponse = await fetch(
        `${this.appConfig.monetization.facilitatorUrl}/supported`,
        { method: 'GET' },
      );
      const supported = await supportedResponse.json() as {
        kinds?: Array<{
          x402Version: number;
          scheme: string;
          network: string;
          extra?: { feePayer?: string };
        }>;
      };
      const kind = supported.kinds?.find(
        k => k.scheme === 'exact' && k.network === resolvePaymentNetwork(this.appConfig),
      );
      if (kind?.extra?.feePayer) {
        (paymentRequirements.extra as Record<string, unknown>).feePayer = kind.extra.feePayer;
      }
    } catch (error) {
      logger.warn('Failed to fetch /supported from facilitator', { error });
    }

    // Determine the USDC asset address for the network
    const network = resolvePaymentNetwork(this.appConfig);
    const USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const USDC_DEVNET = '8wUum6Vd2G2z4VFY3CMx5iJz2m6Lz3j4z3m5WZ2t3Kp';
    paymentRequirements.asset = network === SOLANA_MAINNET_CAIP2 ? USDC_MAINNET : USDC_DEVNET;

    // Verify the payment with the facilitator
    try {
      const verifyResponse = await fetch(
        `${this.appConfig.monetization.facilitatorUrl}/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x402Version,
            paymentPayload,
            paymentRequirements,
          }),
        },
      );
      const verifyResult = await verifyResponse.json() as { isValid: boolean; invalidReason?: string; payer?: string };

      if (!verifyResult.isValid) {
        logger.warn('Payment verification failed', {
          reason: verifyResult.invalidReason,
          requestHash: requestHash.slice(0, 12),
        });
        writeJson(response, 402, {
          error: 'payment_verification_failed',
          reason: verifyResult.invalidReason,
          message: 'The facilitator rejected the payment. Check your USDC balance and keypair.',
        });
        return;
      }

      logger.info('Payment verified', {
        toolNames: paidDecision.toolNames,
        price: paidDecision.price,
        payer: verifyResult.payer,
        requestHash: requestHash.slice(0, 12),
      });
    } catch (error) {
      logger.error('Facilitator verify request failed', { error });
      writeJson(response, 502, {
        error: 'facilitator_unreachable',
        message: 'Could not reach the x402 facilitator for payment verification.',
      });
      return;
    }

    await this.usageLedger.recordVerified(metadata, paidDecision);

    // Execute the MCP handler and buffer the response for settlement
    const buffered = bufferResponse(response);

    try {
      await next(request, response, parsedBody);
      await buffered.waitForEnd();
    } catch (error) {
      logger.error('MCP handler threw during paid request', { error });
      buffered.restore();
      writeJson(response, 500, { error: 'MCP handler error after payment' });
      return;
    }

    if (response.statusCode >= 400) {
      logger.warn('MCP handler returned error after payment', { status: response.statusCode });
      buffered.restore();
      return;
    }

    // Settle the payment with the facilitator
    try {
      const responseBody = buffered.getBody();
      const responseHeaders = getResponseHeaders(response);
      const settleResponse = await fetch(
        `${this.appConfig.monetization.facilitatorUrl}/settle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x402Version,
            paymentPayload,
            paymentRequirements,
          }),
        },
      );
      const settlement = await settleResponse.json() as {
        success: boolean;
        transaction?: string;
        network?: string;
        amount?: string;
        payer?: string;
        errorReason?: string;
      };

      await this.usageLedger.recordSettlement(metadata, paidDecision, settlement as never);

      if (settlement.success) {
        logger.info('Settlement success', {
          toolNames: paidDecision.toolNames,
          price: paidDecision.price,
          tx: settlement.transaction,
          amount: settlement.amount,
          payer: settlement.payer,
          requestHash: requestHash.slice(0, 12),
        });
      } else {
        logger.warn('Settlement failed', {
          toolNames: paidDecision.toolNames,
          errorReason: settlement.errorReason,
          requestHash: requestHash.slice(0, 12),
        });
      }
    } catch (error) {
      logger.error('Facilitator settle request failed', { error });
    }

    buffered.restoreAndReplay();
  }

  private buildRequestContext(
    request: http.IncomingMessage,
    parsedBody: unknown,
    virtualPath: string,
  ): HTTPRequestContext {
    const adapter = new NativeHttpAdapter({
      request,
      path: virtualPath,
      body: parsedBody,
    });

    return {
      adapter,
      path: virtualPath,
      method: request.method ?? 'POST',
      paymentHeader: adapter.getHeader('payment-signature') ?? adapter.getHeader('x-payment'),
    };
  }

  private async forwardAndSettle(options: {
    request: http.IncomingMessage;
    response: http.ServerResponse;
    next: McpRequestHandler;
    context: HTTPRequestContext;
    metadata: PaymentRequestMetadata;
    decision: PaymentDecision;
    paymentResult: Extract<HTTPProcessResult, { type: 'payment-verified' }>;
    parsedBody: unknown;
  }): Promise<void> {
    const buffered = bufferResponse(options.response);

    try {
      await options.next(options.request, options.response, options.parsedBody);
      await buffered.waitForEnd();
    } catch (error) {
      await options.paymentResult.cancellationDispatcher.cancel({
        reason: 'handler_threw',
        error,
      });
      await this.usageLedger.recordCanceled(
        options.metadata,
        options.decision,
        'handler_threw',
        error instanceof Error ? error.message : String(error),
      );
      buffered.restore();
      throw error;
    }

    if (options.response.statusCode >= 400) {
      await options.paymentResult.cancellationDispatcher.cancel({
        reason: 'handler_failed',
        responseStatus: options.response.statusCode,
      });
      await this.usageLedger.recordCanceled(
        options.metadata,
        options.decision,
        'handler_failed',
        `MCP handler returned HTTP ${options.response.statusCode}`,
      );
      buffered.restoreAndReplay();
      return;
    }

    await this.settleAndReplay({
      response: options.response,
      buffered,
      context: options.context,
      metadata: options.metadata,
      decision: options.decision,
      paymentPayload: options.paymentResult.paymentPayload,
      paymentRequirements: options.paymentResult.paymentRequirements,
      declaredExtensions: options.paymentResult.declaredExtensions,
    });
  }

  private async settleAndReplay(options: {
    response: http.ServerResponse;
    buffered: BufferedResponse;
    context: HTTPRequestContext;
    metadata: PaymentRequestMetadata;
    decision: PaymentDecision;
    paymentPayload: PaymentPayload;
    paymentRequirements: PaymentRequirements;
    declaredExtensions?: Record<string, unknown>;
  }): Promise<void> {
    const responseBody = options.buffered.getBody();
    const responseHeaders = getResponseHeaders(options.response);
    const settlement = await this.httpResourceServer.processSettlement(
      options.paymentPayload,
      options.paymentRequirements,
      options.declaredExtensions,
      {
        request: options.context,
        responseBody,
        responseHeaders,
      },
    );

    await this.usageLedger.recordSettlement(options.metadata, options.decision, settlement);

    const decision = options.decision as Extract<PaymentDecision, { required: true }>;

    if (!settlement.success) {
      logger.warn('Settlement failed', {
        toolNames: decision.toolNames,
        price: decision.price,
        requestHash: options.metadata.requestHash.slice(0, 12),
        errorReason: settlement.errorReason,
      });
      options.buffered.restore();
      writePaymentInstructions(options.response, settlement.response);
      return;
    }

    logger.info('Settlement success', {
      toolNames: decision.toolNames,
      price: decision.price,
      tx: settlement.transaction,
      amount: settlement.amount,
      payer: settlement.payer,
      requestHash: options.metadata.requestHash.slice(0, 12),
    });

    for (const [name, value] of Object.entries(settlement.headers)) {
      options.response.setHeader(name, value);
    }

    options.buffered.restoreAndReplay();
  }
}

/**
 * @name resolvePaymentNetwork
 * @description Resolves the x402 CAIP-2 Solana network from explicit config or the SAP RPC URL.
 */
export function resolvePaymentNetwork(config: SapMcpConfig): string {
  if (config.monetization.network) {
    return normalizePaymentNetwork(config.monetization.network);
  }

  if (config.rpcUrl.includes('devnet')) {
    return SOLANA_DEVNET_CAIP2;
  }

  if (config.rpcUrl.includes('testnet')) {
    return SOLANA_TESTNET_CAIP2;
  }

  return SOLANA_MAINNET_CAIP2;
}

/**
 * @name normalizePaymentNetwork
 * @description Converts user-friendly Solana network aliases to the CAIP-2 identifiers expected by x402 SVM.
 */
export function normalizePaymentNetwork(network: string): string {
  const normalized = network.trim().toLowerCase();
  if (normalized === 'mainnet' || normalized === 'mainnet-beta' || normalized === 'solana') {
    return SOLANA_MAINNET_CAIP2;
  }
  if (normalized === 'devnet' || normalized === 'solana-devnet') {
    return SOLANA_DEVNET_CAIP2;
  }
  if (normalized === 'testnet' || normalized === 'solana-testnet') {
    return SOLANA_TESTNET_CAIP2;
  }
  return network;
}

function validateMonetizationConfig(config: SapMcpMonetizationConfig): void {
  if (!config.payTo) {
    throw new Error('SAP MCP monetization requires SAP_MCP_MONETIZATION_PAY_TO');
  }
  if (!config.facilitatorUrl) {
    throw new Error('SAP MCP monetization requires SAP_MCP_X402_FACILITATOR_URL. Use the OOBE facilitator URL or run sap-mcp-facilitator locally.');
  }
}

function buildRoutesConfig(config: SapMcpConfig): RoutesConfig {
  return {
    [PAID_ROUTE_PATTERN]: {
      accepts: {
        scheme: 'exact',
        network: resolvePaymentNetwork(config) as Network,
        payTo: config.monetization.payTo ?? '',
        price: context => resolveDynamicPrice(context, config.monetization),
        maxTimeoutSeconds: config.monetization.maxTimeoutSeconds,
      },
      description: 'Paid SAP MCP remote tool execution',
      mimeType: 'application/json',
      serviceName: 'SAP MCP Server',
      tags: ['sap', 'mcp', 'solana', 'x402'],
      unpaidResponseBody: context => buildUnpaidResponseBody(context, config),
    },
  };
}

function resolveDynamicPrice(context: HTTPRequestContext, config: SapMcpMonetizationConfig): string {
  const parsed = parseJsonRpcBody(context.adapter.getBody?.());
  const decision = resolvePaymentDecision(parsed, config);
  return decision.required ? decision.price : formatUsdPrice(config.prices.minUsd);
}

function buildUnpaidResponseBody(
  context: HTTPRequestContext,
  config: SapMcpConfig,
): { contentType: string; body: unknown } {
  const parsed = parseJsonRpcBody(context.adapter.getBody?.());
  const decision = resolvePaymentDecision(parsed, config.monetization);

  return {
    contentType: 'application/json',
    body: {
      error: 'payment_required',
      protocol: 'x402',
      provider: config.monetization.provider,
      payShCheckoutUrl: buildPayShCheckoutUrl(config, decision),
      decision,
      instructions: {
        header: 'PAYMENT-SIGNATURE',
        settlementHeader: 'PAYMENT-RESPONSE',
        network: resolvePaymentNetwork(config),
        payTo: config.monetization.payTo,
      },
    },
  };
}

function buildPayShCheckoutUrl(config: SapMcpConfig, decision: PaymentDecision): string | undefined {
  if (!config.monetization.payShCheckoutUrl || !decision.required) {
    return undefined;
  }

  const url = new URL(config.monetization.payShCheckoutUrl);
  url.searchParams.set('amount', decision.price);
  url.searchParams.set('network', resolvePaymentNetwork(config));
  url.searchParams.set('recipient', config.monetization.payTo ?? '');
  url.searchParams.set('reference', decision.toolNames.join(','));
  return url.toString();
}

function shouldInspectRequest(request: http.IncomingMessage): boolean {
  return request.method === 'POST' && Boolean(request.url?.startsWith('/mcp'));
}

/**
 * @name buildPaidVirtualPath
 * @description Builds the paid x402 virtual resource path, bound to the exact JSON-RPC request hash.
 */
export function buildPaidVirtualPath(decision: Extract<PaymentDecision, { required: true }>, requestHash: string): string {
  const toolSegment = decision.toolNames.map(name => encodeURIComponent(name)).join(',');
  return `/mcp/paid/${decision.tier}/${requestHash}/${toolSegment}`;
}

function buildRequestMetadata(
  request: http.IncomingMessage,
  requestHash: string,
  virtualPath: string,
): PaymentRequestMetadata {
  const paymentHeader = request.headers['payment-signature'] ?? request.headers['x-payment'];
  return {
    requestHash,
    method: request.method ?? 'POST',
    path: virtualPath,
    paymentHeaderPresent: typeof paymentHeader === 'string' || Array.isArray(paymentHeader),
    remoteAddress: request.socket.remoteAddress,
    userAgent: Array.isArray(request.headers['user-agent'])
      ? request.headers['user-agent'][0]
      : request.headers['user-agent'],
  };
}

function writePaymentInstructions(
  response: http.ServerResponse,
  instructions: HTTPResponseInstructions,
): void {
  response.writeHead(instructions.status, {
    'Content-Type': instructions.isHtml ? 'text/html' : 'application/json',
    ...instructions.headers,
  });
  response.end(
    instructions.isHtml
      ? String(instructions.body ?? '')
      : JSON.stringify(instructions.body ?? {}),
  );
}

function writeJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function getResponseHeaders(response: http.ServerResponse): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.getHeaders())) {
    if (Array.isArray(value)) {
      headers[name] = value.join(',');
    } else if (value !== undefined) {
      headers[name] = String(value);
    }
  }
  return headers;
}

function bufferResponse(response: http.ServerResponse): BufferedResponse {
  const originalWriteHead = response.writeHead.bind(response) as http.ServerResponse['writeHead'];
  const originalWrite = response.write.bind(response) as http.ServerResponse['write'];
  const originalEnd = response.end.bind(response) as http.ServerResponse['end'];
  const originalFlushHeaders = response.flushHeaders.bind(response) as http.ServerResponse['flushHeaders'];
  const calls: BufferedResponseCall[] = [];

  let resolveEnd: () => void = () => undefined;
  const endPromise = new Promise<void>(resolve => {
    resolveEnd = resolve;
  });

  response.writeHead = ((...args: WriteHeadArgs): http.ServerResponse => {
    calls.push({ kind: 'writeHead', args });
    return response;
  }) as http.ServerResponse['writeHead'];

  response.write = ((...args: WriteArgs): boolean => {
    calls.push({ kind: 'write', args });
    return true;
  }) as http.ServerResponse['write'];

  response.end = ((...args: EndArgs): http.ServerResponse => {
    calls.push({ kind: 'end', args });
    resolveEnd();
    return response;
  }) as http.ServerResponse['end'];

  response.flushHeaders = (() => {
    calls.push({ kind: 'flushHeaders' });
  }) as http.ServerResponse['flushHeaders'];

  return {
    getBody: () => Buffer.concat(calls.flatMap(callToBodyChunk)),
    waitForEnd: () => endPromise,
    restore: () => {
      response.writeHead = originalWriteHead;
      response.write = originalWrite;
      response.end = originalEnd;
      response.flushHeaders = originalFlushHeaders;
    },
    restoreAndReplay: () => {
      response.writeHead = originalWriteHead;
      response.write = originalWrite;
      response.end = originalEnd;
      response.flushHeaders = originalFlushHeaders;
      for (const call of calls) {
        replayBufferedCall(call, originalWriteHead, originalWrite, originalEnd, originalFlushHeaders);
      }
    },
  };
}

interface BufferedResponse {
  getBody: () => Buffer;
  waitForEnd: () => Promise<void>;
  restore: () => void;
  restoreAndReplay: () => void;
}

function callToBodyChunk(call: BufferedResponseCall): Buffer[] {
  if (call.kind !== 'write' && call.kind !== 'end') {
    return [];
  }

  const chunk = call.args[0];
  if (typeof chunk === 'string') {
    return [Buffer.from(chunk)];
  }
  if (chunk instanceof Uint8Array) {
    return [Buffer.from(chunk)];
  }
  return [];
}

function replayBufferedCall(
  call: BufferedResponseCall,
  writeHead: http.ServerResponse['writeHead'],
  write: http.ServerResponse['write'],
  end: http.ServerResponse['end'],
  flushHeaders: http.ServerResponse['flushHeaders'],
): void {
  const invoke = (fn: (...args: unknown[]) => unknown, args: readonly unknown[]): void => {
    Reflect.apply(fn, undefined, args);
  };

  switch (call.kind) {
    case 'writeHead':
      invoke(writeHead as (...args: unknown[]) => unknown, call.args);
      return;
    case 'write':
      invoke(write as (...args: unknown[]) => unknown, call.args);
      return;
    case 'end':
      invoke(end as (...args: unknown[]) => unknown, call.args);
      return;
    case 'flushHeaders':
      flushHeaders();
      return;
  }
}

/**
 * @name extractJsonRpcId
 * @description Extracts the JSON-RPC id from a parsed request body for response correlation.
 */
function extractJsonRpcId(body: unknown): string | number | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (typeof record.id === 'string' || typeof record.id === 'number') return record.id;
  if (Array.isArray(body) && body.length > 0) {
    return extractJsonRpcId(body[0]);
  }
  return null;
}

/**
 * @name patchV1Compatibility
 * @description Patches the x402 402 response body to add maxAmountRequired (V1) alongside amount (V2).
 * The @x402/svm V1 exact scheme verifier checks maxAmountRequired, but the V2 resource server
 * only emits amount. This ensures V1-compatible clients and facilitators can verify payments.
 */
function patchV1Compatibility(instructions: HTTPResponseInstructions): void {
  if (instructions.isHtml || !instructions.body) {
    return;
  }

  const body = instructions.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') {
    return;
  }

  // x402 response body: { accepts: [{ amount, ... }, ...], ... }
  const accepts = body.accepts;
  if (Array.isArray(accepts)) {
    for (const req of accepts) {
      if (req && typeof req === 'object' && 'amount' in req && !('maxAmountRequired' in req)) {
        (req as Record<string, unknown>).maxAmountRequired = (req as Record<string, unknown>).amount;
      }
    }
  }

  // Also patch top-level paymentRequirements if present
  const requirements = body.paymentRequirements;
  if (Array.isArray(requirements)) {
    for (const req of requirements) {
      if (req && typeof req === 'object' && 'amount' in req && !('maxAmountRequired' in req)) {
        (req as Record<string, unknown>).maxAmountRequired = (req as Record<string, unknown>).amount;
      }
    }
  } else if (requirements && typeof requirements === 'object' && 'amount' in requirements && !('maxAmountRequired' in requirements)) {
    (requirements as Record<string, unknown>).maxAmountRequired = (requirements as Record<string, unknown>).amount;
  }
}
