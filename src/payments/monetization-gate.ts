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
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  ResourceInfo,
  SettleResponse,
  VerifyResponse,
} from '@x402/core/types';
import { registerExactSvmScheme } from '@x402/svm/exact/server';
import type { SapMcpConfig, SapMcpMonetizationConfig } from '../config/env.js';
import { logger } from '../core/logger.js';
import { NativeHttpAdapter, parseJsonBody, readRequestBody } from './http-adapter.js';
import { isRecord, parseJsonRpcBody } from './json-rpc.js';
import type { PaymentDecision } from './pricing.js';
import { formatUsdPrice, resolvePaymentDecision } from './pricing.js';
import { hashPaymentRequest, UsageLedger, type PaymentRequestMetadata } from './usage-ledger.js';

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
const USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

type PaymentRequirementsWithV1Alias = PaymentRequirements & {
  maxAmountRequired?: string;
};

interface ParsedPaymentHeader {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirementsWithV1Alias;
}

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

    const requestHash = hashPaymentRequest(rawBody, parsedBody);
    const virtualPath = buildPaidVirtualPath(decision, requestHash);
    const metadata = buildRequestMetadata(request, requestHash, virtualPath);
    await this.usageLedger.recordDecision(metadata, decision);
    logger.info('Payment required', {
      toolNames: decision.toolNames,
      price: decision.price,
      callerIp: metadata.remoteAddress,
      requestHash: requestHash.slice(0, 12),
    });

    // ── Fast path: Payment-Signature header present ────────────────────────
    const paymentHeader =
      (request.headers['payment-signature'] as string | undefined) ??
      (request.headers['x-payment'] as string | undefined);

    if (paymentHeader) {
      await this.handleSignedPayment({
        request,
        response,
        next,
        parsedBody,
        decision: decision as Extract<PaymentDecision, { required: true }>,
        metadata,
        paymentHeader,
        virtualPath,
      });
      return;
    }

    // ── Normal path: no Payment-Signature header, generate 402 response ──────
    const context = this.buildRequestContext(request, parsedBody, virtualPath);
    const paymentResult = await this.httpResourceServer.processHTTPRequest(context, {
      appName: 'SAP MCP Server',
      currentUrl: context.adapter.getUrl(),
      testnet: resolvePaymentNetwork(this.appConfig) !== SOLANA_MAINNET_CAIP2,
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
      const paymentRequiredHeader = paymentResult.response.headers?.['payment-required'] ??
        paymentResult.response.headers?.['PAYMENT-REQUIRED'];
      if (typeof paymentRequiredHeader === 'string') {
        response.setHeader('PAYMENT-REQUIRED', paymentRequiredHeader);
      }

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
              settlementHeader: 'Payment-Response',
              requestHashBinding: 'json-rpc-method-and-params',
              requiredRetryHeaders: ['Payment-Signature', 'mcp-session-id', 'mcp-protocol-version'],
              paymentSignatureFormat: 'base64(JSON.stringify({ x402Version, accepted: paymentRequirements[0], payload, resource }))',
              steps: [
                'Initialize the MCP session first and reuse the returned mcp-session-id for the unpaid call and paid retry.',
                'Build the payment from paymentRequirements[0] / accepts[0] returned by this response.',
                'Retry the same MCP method and params with the Payment-Signature header.',
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
   * @name handleSignedPayment
   * @description Verifies a client-supplied x402 payment payload against the original accepted requirements.
   */
  private async handleSignedPayment(options: {
    request: http.IncomingMessage;
    response: http.ServerResponse;
    next: McpRequestHandler;
    parsedBody: unknown;
    decision: Extract<PaymentDecision, { required: true }>;
    metadata: PaymentRequestMetadata;
    paymentHeader: string;
    virtualPath: string;
  }): Promise<void> {
    let parsedPayment: ParsedPaymentHeader;
    try {
      parsedPayment = parsePaymentHeader(options.paymentHeader);
    } catch (error) {
      logger.warn('Invalid Payment-Signature header', {
        error,
        requestHash: options.metadata.requestHash.slice(0, 12),
      });
      writeJsonRpcError(options.response, options.parsedBody, -32002, 'payment_verification_failed', {
        reason: 'invalid_payment_signature_header',
        hint: 'Payment-Signature must be base64(JSON) containing x402Version, accepted, and payload.',
      });
      return;
    }
    const validationError = validatePaymentRequirementsForDecision(
      parsedPayment.paymentRequirements,
      parsedPayment.paymentPayload,
      options.decision,
      this.appConfig,
      options.virtualPath,
    );
    if (validationError) {
      logger.warn('Payment requirements rejected before facilitator verify', {
        reason: validationError,
        toolNames: options.decision.toolNames,
        requestHash: options.metadata.requestHash.slice(0, 12),
      });
      writeJsonRpcError(options.response, options.parsedBody, -32002, 'payment_verification_failed', {
        reason: validationError,
        hint: 'Retry with Payment-Signature generated from this request paymentRequirements[0] / accepts[0]. Preserve the initialized MCP session id.',
      });
      return;
    }

    logger.info('Payment-Signature detected — direct facilitator verification', {
      toolNames: options.decision.toolNames,
      price: options.decision.price,
      requestHash: options.metadata.requestHash.slice(0, 12),
    });

    const verifyResult = await this.callFacilitator<VerifyResponse>('verify', {
      x402Version: parsedPayment.x402Version,
      paymentPayload: parsedPayment.paymentPayload,
      paymentRequirements: parsedPayment.paymentRequirements,
    });

    if (!verifyResult.isValid) {
      logger.warn('Payment verification failed', {
        reason: verifyResult.invalidReason,
        message: verifyResult.invalidMessage,
        payer: verifyResult.payer,
        requestHash: options.metadata.requestHash.slice(0, 12),
      });
      writeJsonRpcError(options.response, options.parsedBody, -32002, 'payment_verification_failed', {
        reason: verifyResult.invalidReason,
        message: verifyResult.invalidMessage,
        hint: 'Check USDC balance, network, payTo, feePayer, and that the payment was built from this request challenge.',
      });
      return;
    }

    await this.usageLedger.recordVerified(options.metadata, options.decision);

    const buffered = bufferResponse(options.response);
    try {
      await options.next(options.request, options.response, options.parsedBody);
      await buffered.waitForEnd();
    } catch (error) {
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
      await this.usageLedger.recordCanceled(
        options.metadata,
        options.decision,
        'handler_failed',
        `MCP handler returned HTTP ${options.response.statusCode}`,
      );
      buffered.restoreAndReplay();
      return;
    }

    const settlement = await this.callFacilitator<SettleResponse>('settle', {
      x402Version: parsedPayment.x402Version,
      paymentPayload: parsedPayment.paymentPayload,
      paymentRequirements: parsedPayment.paymentRequirements,
    });
    await this.usageLedger.recordSettlement(options.metadata, options.decision, settlement);

    if (!settlement.success) {
      logger.warn('Settlement failed', {
        toolNames: options.decision.toolNames,
        price: options.decision.price,
        requestHash: options.metadata.requestHash.slice(0, 12),
        errorReason: settlement.errorReason,
      });
      buffered.restore();
      writeJsonRpcError(options.response, options.parsedBody, -32003, 'payment_settlement_failed', {
        reason: settlement.errorReason,
        message: settlement.errorMessage,
      });
      return;
    }

    logger.info('Settlement success', {
      toolNames: options.decision.toolNames,
      price: options.decision.price,
      tx: settlement.transaction,
      amount: settlement.amount,
      payer: settlement.payer,
      requestHash: options.metadata.requestHash.slice(0, 12),
    });

    setPaymentResponseHeaders(options.response, settlement);
    buffered.restoreAndReplay();
  }

  private async callFacilitator<TResponse>(path: 'verify' | 'settle', body: unknown): Promise<TResponse> {
    const response = await fetch(buildFacilitatorUrl(this.monetization, path), {
      method: 'POST',
      headers: buildFacilitatorHeaders(this.monetization),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Facilitator ${path} failed with HTTP ${response.status}`);
    }
    return await response.json() as TResponse;
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
 * @description Builds the paid x402 virtual resource path, bound to the canonical MCP method-and-params hash.
 */
export function buildPaidVirtualPath(decision: Extract<PaymentDecision, { required: true }>, requestHash: string): string {
  const toolSegment = decision.toolNames.map(name => encodeURIComponent(name)).join(',');
  return `/mcp/paid/${decision.tier}/${requestHash}/${toolSegment}`;
}

function parsePaymentHeader(header: string): ParsedPaymentHeader {
  const parsed = parsePaymentHeaderJson(header);
  if (!isRecord(parsed)) {
    throw new Error('Payment-Signature must decode to a JSON object.');
  }

  const accepted = parsePaymentRequirements(parsed.accepted);
  const paymentPayload: PaymentPayload = {
    x402Version: typeof parsed.x402Version === 'number' ? parsed.x402Version : 2,
    accepted,
    payload: isRecord(parsed.payload) ? parsed.payload : {},
    ...(isRecord(parsed.resource) ? { resource: parseResourceInfo(parsed.resource) } : {}),
    ...(isRecord(parsed.extensions) ? { extensions: parsed.extensions } : {}),
  };

  return {
    x402Version: paymentPayload.x402Version,
    paymentPayload,
    paymentRequirements: accepted,
  };
}

function parsePaymentHeaderJson(header: string): unknown {
  const candidates = [
    Buffer.from(header, 'base64').toString('utf-8'),
    header,
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next representation. Some legacy clients sent raw JSON.
    }
  }
  throw new Error('Invalid Payment-Signature header.');
}

function parsePaymentRequirements(value: unknown): PaymentRequirementsWithV1Alias {
  if (!isRecord(value)) {
    throw new Error('Payment-Signature payload is missing accepted payment requirements.');
  }
  const scheme = requireString(value, 'scheme');
  const network = requireString(value, 'network') as Network;
  const asset = requireString(value, 'asset');
  const amount = requireString(value, 'amount');
  const payTo = requireString(value, 'payTo');
  const maxTimeoutSeconds = requireNumber(value, 'maxTimeoutSeconds');
  const extra = isRecord(value.extra) ? value.extra : {};
  const maxAmountRequired = typeof value.maxAmountRequired === 'string'
    ? value.maxAmountRequired
    : amount;

  return {
    scheme,
    network,
    asset,
    amount,
    maxAmountRequired,
    payTo,
    maxTimeoutSeconds,
    extra,
  };
}

function parseResourceInfo(value: Record<string, unknown>): ResourceInfo {
  const resource: ResourceInfo = {
    url: requireString(value, 'url'),
  };
  if (typeof value.description === 'string') resource.description = value.description;
  if (typeof value.mimeType === 'string') resource.mimeType = value.mimeType;
  if (typeof value.serviceName === 'string') resource.serviceName = value.serviceName;
  if (Array.isArray(value.tags) && value.tags.every(tag => typeof tag === 'string')) {
    resource.tags = value.tags;
  }
  if (typeof value.iconUrl === 'string') resource.iconUrl = value.iconUrl;
  return resource;
}

function validatePaymentRequirementsForDecision(
  requirements: PaymentRequirementsWithV1Alias,
  payload: PaymentPayload,
  decision: Extract<PaymentDecision, { required: true }>,
  config: SapMcpConfig,
  virtualPath: string,
): string | undefined {
  const network = resolvePaymentNetwork(config);
  const expectedAmount = usdToUsdcBaseUnits(decision.priceUsd);
  const expectedAsset = getUsdcAsset(network);
  const expectedPayTo = config.monetization.payTo;

  if (requirements.scheme !== 'exact') return 'unsupported_scheme';
  if (requirements.network !== network) return 'network_mismatch';
  if (requirements.payTo !== expectedPayTo) return 'pay_to_mismatch';
  if (requirements.amount !== expectedAmount) return 'amount_mismatch';
  if (requirements.maxAmountRequired && requirements.maxAmountRequired !== expectedAmount) {
    return 'max_amount_required_mismatch';
  }
  if (requirements.asset !== expectedAsset) return 'asset_mismatch';
  if (!isRecord(requirements.extra) || typeof requirements.extra.feePayer !== 'string') {
    return 'missing_fee_payer';
  }
  if (payload.accepted.amount !== requirements.amount || payload.accepted.payTo !== requirements.payTo) {
    return 'payload_accepted_mismatch';
  }
  if (payload.resource?.url && !payload.resource.url.includes(virtualPath)) {
    return 'resource_mismatch';
  }

  return undefined;
}

function usdToUsdcBaseUnits(priceUsd: number): string {
  return Math.round(priceUsd * 1_000_000).toString();
}

function getUsdcAsset(network: string): string {
  return network === SOLANA_MAINNET_CAIP2 ? USDC_MAINNET : USDC_DEVNET;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required string field: ${key}`);
  }
  return value;
}

function requireNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing required number field: ${key}`);
  }
  return value;
}

function buildFacilitatorUrl(config: SapMcpMonetizationConfig, path: 'verify' | 'settle'): string {
  const baseUrl = config.facilitatorUrl;
  if (!baseUrl) {
    throw new Error('SAP MCP monetization requires SAP_MCP_X402_FACILITATOR_URL');
  }
  return `${baseUrl.replace(/\/+$/, '')}/${path}`;
}

function buildFacilitatorHeaders(config: SapMcpMonetizationConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(config.facilitatorAuthToken ? { Authorization: `Bearer ${config.facilitatorAuthToken}` } : {}),
  };
}

function setPaymentResponseHeaders(response: http.ServerResponse, settlement: SettleResponse): void {
  const encoded = Buffer.from(JSON.stringify(settlement), 'utf-8').toString('base64');
  response.setHeader('PAYMENT-RESPONSE', encoded);
  response.setHeader('X-PAYMENT-RESPONSE', encoded);
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

function writeJsonRpcError(
  response: http.ServerResponse,
  requestBody: unknown,
  code: number,
  message: string,
  data?: unknown,
): void {
  writeJson(response, 200, {
    jsonrpc: '2.0',
    id: extractJsonRpcId(requestBody),
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  });
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
