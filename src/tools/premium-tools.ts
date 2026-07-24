import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createStructuredJsonResponse } from '../adapters/mcp/tool-response.js';
import type { SapMcpContext } from '../core/types.js';
import {
  buildPremiumPluginManifestTemplate,
  createPremiumSessionPlan,
  getPremiumSession,
  listPremiumPlugins,
  listPremiumSessions,
  premiumPrivatePluginSupport,
  publicPremiumProviderStatus,
  validatePremiumPluginManifest,
  activatePremiumSession,
  closeSession,
  registerWebhook,
  unregisterWebhook,
  getWebhookSubscription,
  getWebhookDeliveries,
  getPremiumMetrics,
  type PremiumCapabilityType,
  type PremiumManifestTemplateRequest,
  type PremiumSessionRequest,
} from '../premium/index.js';

const CAPABILITY_TYPES = ['stream', 'webhook', 'tool'] as const;

function parseCapabilityType(value: unknown): PremiumCapabilityType | undefined {
  if (typeof value !== 'string') return undefined;
  return CAPABILITY_TYPES.includes(value as PremiumCapabilityType) ? (value as PremiumCapabilityType) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isPremiumProviderReady(providerEnv: readonly string[] | undefined): boolean {
  return Array.isArray(providerEnv) && providerEnv.every(envName => Boolean(process.env[envName]));
}

function capabilityForCatalog<T extends { providerEnv: readonly string[] }>(
  capability: T,
  pluginId?: string,
): T & { pluginId?: string; providerReady: boolean } {
  return {
    ...capability,
    ...(pluginId ? { pluginId } : {}),
    providerReady: isPremiumProviderReady(capability.providerEnv),
  };
}

const catalogOutputSchema = {
  type: 'object',
  required: ['version', 'plugins', 'providerStatus', 'privatePluginSupport'],
  properties: {
    version: { type: 'string', description: 'Premium plugin catalog contract version.' },
    plugins: {
      type: 'array',
      description: 'Installed premium plugin manifests and their stream/webhook/tool capabilities.',
      items: { type: 'object', additionalProperties: true, description: 'Premium plugin manifest.' },
    },
    providerStatus: {
      type: 'object',
      additionalProperties: { type: 'boolean' },
      description: 'Provider environment readiness map. False means SAP MCP will not claim the feed is live.',
    },
    privatePluginSupport: {
      type: 'object',
      additionalProperties: true,
      description: 'Enterprise plugin loader contract for private or submodule-backed premium capabilities.',
    },
  },
  additionalProperties: false,
};

const capabilityCatalogOutputSchema = {
  type: 'object',
  required: ['version', 'type', 'capabilities', 'providerStatus'],
  properties: {
    version: { type: 'string', description: 'Premium capability catalog contract version.' },
    type: { type: 'string', description: 'Capability type requested by the caller.' },
    capabilities: {
      type: 'array',
      description: 'Premium capabilities filtered by type with schemas, pricing, delivery contracts, and provider status.',
      items: { type: 'object', additionalProperties: true, description: 'Premium capability definition.' },
    },
    providerStatus: {
      type: 'object',
      additionalProperties: { type: 'boolean' },
      description: 'Provider environment readiness map for capabilities that need external providers.',
    },
  },
  additionalProperties: false,
};

const validationOutputSchema = {
  type: 'object',
  required: ['valid', 'errors', 'warnings'],
  properties: {
    valid: { type: 'boolean', description: 'True only when the manifest can be safely reviewed for premium plugin loading.' },
    errors: {
      type: 'array',
      description: 'Blocking manifest issues. Do not load or publish the plugin until empty.',
      items: { type: 'object', additionalProperties: true, description: 'Manifest validation issue.' },
    },
    warnings: {
      type: 'array',
      description: 'Non-blocking quality issues that should be fixed before marketplace publication.',
      items: { type: 'object', additionalProperties: true, description: 'Manifest validation warning.' },
    },
  },
  additionalProperties: false,
};

const templateOutputSchema = {
  type: 'object',
  required: ['manifest', 'validation', 'nextSteps'],
  properties: {
    manifest: {
      type: 'object',
      additionalProperties: true,
      description: 'Data-only premium plugin manifest template. Review, harden schemas, then store it in the private plugin subrepo.',
    },
    validation: {
      type: 'object',
      additionalProperties: true,
      description: 'Validation report for the generated template.',
    },
    nextSteps: {
      type: 'array',
      description: 'Operator steps for validating, plugging, unplugging, and safely exposing this plugin.',
      items: { type: 'string', description: 'One concrete next step.' },
    },
  },
  additionalProperties: false,
};

const sessionOutputSchema = {
  type: 'object',
  required: ['session', 'providerStatus', 'monetization'],
  properties: {
    session: {
      type: 'object',
      additionalProperties: true,
      description: 'Premium session plan. This is a planning object and must be paid/activated by the delivery rail before live data is delivered.',
    },
    providerStatus: {
      type: 'object',
      additionalProperties: { type: 'boolean' },
      description: 'Provider readiness at the moment the session was planned.',
    },
    monetization: {
      type: 'object',
      additionalProperties: true,
      description: 'x402/pay.sh payment guidance for the premium stream or webhook activation rail.',
    },
  },
  additionalProperties: false,
};

/**
 * @name registerPremiumTools
 * @description Registers premium plugin, stream, webhook, and session-planning tools.
 */
export function registerPremiumTools(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_premium_plugin_catalog',
    {
      title: 'Premium Plugin Catalog',
      description:
        'Free premium capability discovery. Lists SAP MCP stream, webhook, and premium tool plugin manifests with strict schemas, x402/pay.sh pricing contracts, provider readiness, and private enterprise plugin loader guidance. This tool never returns fake live data.',
      inputSchema: {
        type: 'object',
        properties: {
          includeSchemas: {
            type: 'boolean',
            description: 'When true, include full input/output JSON Schemas for every capability so agent runtimes can validate calls before payment.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: catalogOutputSchema,
    },
    async (input: unknown) => {
      const includeSchemas = Boolean((input as { includeSchemas?: unknown } | undefined)?.includeSchemas);
      const plugins = listPremiumPlugins().map(plugin => ({
        ...plugin,
        capabilities: plugin.capabilities.map(capability => {
          const catalogCapability = capabilityForCatalog(capability);
          return includeSchemas
            ? catalogCapability
            : {
                ...catalogCapability,
                inputSchema: { omitted: true, reason: 'Pass includeSchemas=true to inspect strict capability input schemas.' },
                outputSchema: { omitted: true, reason: 'Pass includeSchemas=true to inspect strict capability output schemas.' },
              };
        }),
      }));

      return createStructuredJsonResponse({
        version: '1.0.0',
        plugins,
        providerStatus: publicPremiumProviderStatus(),
        privatePluginSupport: premiumPrivatePluginSupport(),
      });
    },
  );

  registerTool(
    server,
    'sap_stream_catalog',
    {
      title: 'Premium Stream Catalog',
      description:
        'Free stream discovery for paid real-time SAP MCP capabilities. Returns only stream contracts, including event names, latency targets, x402 pricing, strict schemas, provider env requirements, and whether each stream is live or waiting for provider configuration.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: 'Optional premium plugin id used to narrow stream discovery, for example sap-premium-market-data.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: capabilityCatalogOutputSchema,
    },
    async (input: unknown) => {
      const pluginId = readString((input as { pluginId?: unknown } | undefined)?.pluginId);
      const capabilities = listPremiumPlugins()
        .filter(plugin => !pluginId || plugin.id === pluginId)
        .flatMap(plugin => plugin.capabilities
          .filter(capability => capability.type === 'stream')
          .map(capability => capabilityForCatalog(capability, plugin.id)));
      return createStructuredJsonResponse({
        version: '1.0.0',
        type: 'stream',
        capabilities,
        providerStatus: publicPremiumProviderStatus(),
      });
    },
  );

  registerTool(
    server,
    'sap_webhook_catalog',
    {
      title: 'Premium Webhook Catalog',
      description:
        'Free webhook discovery for paid SAP MCP event delivery. Returns webhook event contracts, signed-delivery expectations, replay windows, x402/pay.sh pricing, provider readiness, and strict subscription schemas.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: 'Optional premium plugin id used to narrow webhook discovery, for example sap-premium-market-data.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: capabilityCatalogOutputSchema,
    },
    async (input: unknown) => {
      const pluginId = readString((input as { pluginId?: unknown } | undefined)?.pluginId);
      const capabilities = listPremiumPlugins()
        .filter(plugin => !pluginId || plugin.id === pluginId)
        .flatMap(plugin => plugin.capabilities
          .filter(capability => capability.type === 'webhook')
          .map(capability => capabilityForCatalog(capability, plugin.id)));
      return createStructuredJsonResponse({
        version: '1.0.0',
        type: 'webhook',
        capabilities,
        providerStatus: publicPremiumProviderStatus(),
      });
    },
  );

  registerTool(
    server,
    'sap_premium_validate_plugin_manifest',
    {
      title: 'Validate Premium Plugin Manifest',
      description:
        'Free manifest validator for SAP MCP premium plugins. Validates ids, semver, descriptions, strict input/output schemas, x402/pay.sh pricing policies, and delivery contracts. It never executes plugin code or loads provider secrets.',
      inputSchema: {
        type: 'object',
        required: ['manifest'],
        properties: {
          manifest: {
            type: 'object',
            additionalProperties: true,
            description: 'Premium plugin manifest candidate to validate before publishing or loading from a private plugin directory.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: validationOutputSchema,
    },
    async (input: unknown) => {
      const manifest = (input as { manifest?: unknown } | undefined)?.manifest;
      return createStructuredJsonResponse({ ...validatePremiumPluginManifest(manifest) });
    },
  );

  registerTool(
    server,
    'sap_premium_plugin_template',
    {
      title: 'Build Premium Plugin Template',
      description:
        'Free premium plugin manifest builder. Generates a strict, data-only stream/webhook/tool manifest template that teams can place in a private plugin subrepo, validate, plug, and unplug without executing untrusted code or exposing provider secrets.',
      inputSchema: {
        type: 'object',
        required: ['pluginId', 'capabilityId', 'capabilityType'],
        properties: {
          pluginId: {
            type: 'string',
            description: 'Lowercase premium plugin id, for example sap-premium-custom-alpha. This becomes the manifest id.',
          },
          capabilityId: {
            type: 'string',
            description: 'Lowercase capability id, for example custom.signal.stream or custom:tool:score.',
          },
          capabilityType: {
            type: 'string',
            enum: [...CAPABILITY_TYPES],
            description: 'Capability type to template: stream, webhook, or tool.',
          },
          title: {
            type: 'string',
            description: 'Human-readable plugin and capability title shown to agent runtimes.',
          },
          description: {
            type: 'string',
            description: 'Full agent-facing description explaining the use case, provider boundary, pricing model, and what the capability delivers.',
          },
          publisher: {
            type: 'string',
            description: 'Publisher name used for enterprise review and marketplace metadata.',
          },
          visibility: {
            type: 'string',
            enum: ['public', 'private', 'enterprise'],
            description: 'Discovery visibility. Use private or enterprise for non-public provider contracts.',
          },
          unitPriceUsd: {
            type: 'number',
            description: 'Suggested x402/pay.sh unit price in USD. Agents should see pricing before activation.',
          },
          providerEnv: {
            type: 'array',
            description: 'Uppercase provider env var names required to make the capability live. Do not pass secret values.',
            items: { type: 'string', description: 'Environment variable name, for example SAP_MCP_PREMIUM_CUSTOM_STREAM_URL.' },
          },
        },
        additionalProperties: false,
      },
      outputSchema: templateOutputSchema,
    },
    async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const capabilityType = parseCapabilityType(raw.capabilityType);
      const pluginId = readString(raw.pluginId);
      const capabilityId = readString(raw.capabilityId);
      if (!pluginId || !capabilityId || !capabilityType) {
        return createStructuredJsonResponse({
          manifest: null,
          validation: {
            valid: false,
            errors: [{ path: '$', severity: 'error', message: 'pluginId, capabilityId, and capabilityType are required.' }],
            warnings: [],
          },
          nextSteps: ['Call this tool again with exact ids and capabilityType from stream, webhook, or tool.'],
        }, { isError: true });
      }

      const manifest = buildPremiumPluginManifestTemplate({
        pluginId,
        capabilityId,
        capabilityType,
        title: readString(raw.title),
        description: readString(raw.description),
        publisher: readString(raw.publisher),
        visibility: ['public', 'private', 'enterprise'].includes(String(raw.visibility))
          ? raw.visibility as PremiumManifestTemplateRequest['visibility']
          : undefined,
        unitPriceUsd: typeof raw.unitPriceUsd === 'number' ? raw.unitPriceUsd : undefined,
        providerEnv: Array.isArray(raw.providerEnv) ? raw.providerEnv.filter((entry): entry is string => typeof entry === 'string') : undefined,
      });
      const validation = validatePremiumPluginManifest(manifest);
      return createStructuredJsonResponse({
        manifest,
        validation,
        nextSteps: [
          'Tighten inputSchema and outputSchema around the exact provider payload before production.',
          'Store the manifest as JSON in the private plugin subrepo under manifests/.',
          'Run sap_premium_validate_plugin_manifest, then deploy with SAP_MCP_ENABLE_PREMIUM_PLUGINS=true and SAP_MCP_PLUGIN_DIR set on the VPS.',
          'Keep SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY=false unless the deployment is authenticated or the private contract should be visible.',
          'Remove or rename the manifest file and restart the hosted server to unplug the capability cleanly.',
        ],
      });
    },
  );

  registerTool(
    server,
    'sap_premium_session_start',
    {
      title: 'Plan Premium Session',
      description:
        'Free premium session planner. Creates a bounded session plan for a stream, webhook, or premium tool capability before any x402 charge. Use it to validate plugin id, capability id, requested units, TTL, provider readiness, and estimated price; paid activation happens only on the delivery rail.',
      inputSchema: {
        type: 'object',
        required: ['pluginId', 'capabilityId', 'capabilityType'],
        properties: {
          pluginId: {
            type: 'string',
            description: 'Premium plugin id from sap_premium_plugin_catalog, for example sap-premium-market-data.',
          },
          capabilityId: {
            type: 'string',
            description: 'Capability id from sap_stream_catalog or sap_webhook_catalog, for example jupiter.quote.delta.',
          },
          capabilityType: {
            type: 'string',
            enum: [...CAPABILITY_TYPES],
            description: 'Capability type being planned: stream, webhook, or tool.',
          },
          requestedUnits: {
            type: 'number',
            description: 'Requested paid units for the session. Streams use minutes, webhooks use events, tools use sessions.',
          },
          ttlSeconds: {
            type: 'number',
            description: 'How long the unpaid planning object should remain valid. Clamped between 60 and 3600 seconds.',
          },
          maxPriceUsd: {
            type: 'number',
            description: 'Optional buyer budget cap in USD. Agents should compare this to estimatedPriceUsd before paid activation.',
          },
          consumer: {
            type: 'string',
            description: 'Optional runtime, agent id, wallet, or application identifier requesting the premium session plan.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: sessionOutputSchema,
    },
    async (input: unknown) => {
      try {
        const raw = input as Record<string, unknown>;
        const pluginId = readString(raw.pluginId);
        const capabilityId = readString(raw.capabilityId);
        const capabilityType = parseCapabilityType(raw.capabilityType);
        if (!pluginId || !capabilityId || !capabilityType) {
          return createStructuredJsonResponse({
            session: {
              status: 'invalid_request',
              nextAction: 'Pass pluginId, capabilityId, and capabilityType exactly as returned by the premium catalog tools.',
            },
            providerStatus: publicPremiumProviderStatus(),
            monetization: { paymentRequired: false, reason: 'Invalid planning requests are not charged.' },
          }, { isError: true });
        }

        const request: PremiumSessionRequest = {
          pluginId,
          capabilityId,
          capabilityType,
          requestedUnits: readNumber(raw.requestedUnits, 1),
          ttlSeconds: readNumber(raw.ttlSeconds, 300),
          maxPriceUsd: typeof raw.maxPriceUsd === 'number' ? raw.maxPriceUsd : undefined,
          consumer: readString(raw.consumer),
        };
        const session = createPremiumSessionPlan(request);
        return createStructuredJsonResponse({
          session,
          providerStatus: publicPremiumProviderStatus(),
          monetization: {
            paymentRequired: false,
            reason: 'This tool plans the session without charging. x402/pay.sh payment is required only when a live premium delivery rail activates the session.',
            hostedPayTo: context.config.monetization?.payTo ?? null,
            provider: context.config.monetization?.provider ?? 'none',
          },
        });
      } catch (error) {
        return createStructuredJsonResponse({
          session: {
            status: 'unknown_premium_capability',
            nextAction: error instanceof Error ? error.message : 'Call sap_premium_plugin_catalog and retry with exact ids.',
          },
          providerStatus: publicPremiumProviderStatus(),
          monetization: { paymentRequired: false, reason: 'Unknown premium capabilities are not charged.' },
        }, { isError: true });
      }
    },
  );

  registerTool(
    server,
    'sap_premium_session_status',
    {
      title: 'Premium Session Status',
      description:
        'Free premium session status lookup. Returns the current planning status for a premium stream/webhook/tool session id, or lists recent in-memory session plans when no id is provided. It does not expose secrets or stream payload data.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'Optional premium session id returned by sap_premium_session_start.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['sessions'],
        properties: {
          sessions: {
            type: 'array',
            description: 'Matching premium session plans. Empty when the requested session id is unknown or expired from memory.',
            items: { type: 'object', additionalProperties: true, description: 'Premium session record.' },
          },
        },
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      const sessionId = readString((input as { sessionId?: unknown } | undefined)?.sessionId);
      const sessions = sessionId ? [getPremiumSession(sessionId)].filter(Boolean) : listPremiumSessions();
      return createStructuredJsonResponse({ sessions });
    },
  );

  // --- Session activation (Layer 2: Payment Gate) ---

  registerTool(
    server,
    'sap_premium_activate_session',
    {
      title: 'Activate Premium Session',
      description:
        'Activates a pending premium session with a verified x402/pay.sh payment receipt. The caller must have already settled the payment challenge on the delivery rail. This tool does not charge — it binds the receipt and transitions the session from pending_payment to active so the stream/webhook delivery rail can start.',
      inputSchema: {
        type: 'object',
        required: ['sessionId', 'paymentReceipt'],
        properties: {
          sessionId: {
            type: 'string',
            description: 'Premium session id returned by sap_premium_session_start.',
          },
          paymentReceipt: {
            type: 'string',
            description: 'Opaque x402/pay.sh payment receipt string proving settlement.',
          },
          payerAddress: {
            type: 'string',
            description: 'Optional Solana payer public key for audit binding.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['activation'],
        properties: {
          activation: {
            type: 'object',
            additionalProperties: true,
            description: 'Activation result with status, activatedAt, receiptBound, unitsQuota, and reason.',
          },
        },
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const sessionId = readString(raw.sessionId);
      const paymentReceipt = readString(raw.paymentReceipt);
      if (!sessionId || !paymentReceipt) {
        return createStructuredJsonResponse({
          activation: {
            status: 'pending_payment',
            activatedAt: null,
            receiptBound: false,
            unitsQuota: 0,
            reason: 'sessionId and paymentReceipt are required.',
          },
        }, { isError: true });
      }

      const activation = activatePremiumSession({
        sessionId,
        paymentReceipt,
        payerAddress: readString(raw.payerAddress),
      });
      return createStructuredJsonResponse({ activation });
    },
  );

  registerTool(
    server,
    'sap_premium_close_session',
    {
      title: 'Close Premium Session',
      description:
        'Closes an active premium session, stopping all stream and webhook delivery. Use this when the buyer wants to stop delivery before the unit quota is exhausted. No refund is issued — the session is simply closed.',
      inputSchema: {
        type: 'object',
        required: ['sessionId', 'reason'],
        properties: {
          sessionId: {
            type: 'string',
            description: 'The active premium session id to close.',
          },
          reason: {
            type: 'string',
            description: 'Human-readable reason for closing the session.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['closed'],
        properties: {
          closed: {
            type: 'object',
            additionalProperties: true,
            description: 'Close result with sessionId, success boolean, and reason.',
          },
        },
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const sessionId = readString(raw.sessionId);
      const reason = readString(raw.reason) ?? 'Closed by agent request.';
      if (!sessionId) {
        return createStructuredJsonResponse({
          closed: { sessionId: null, success: false, reason: 'sessionId is required.' },
        }, { isError: true });
      }

      const success = closeSession(sessionId, reason);
      return createStructuredJsonResponse({
        closed: { sessionId, success, reason: success ? 'Session closed.' : 'Session not found or not active.' },
      });
    },
  );

  // --- Webhook management (Layer 3: Delivery Rail) ---

  registerTool(
    server,
    'sap_premium_webhook_register',
    {
      title: 'Register Premium Webhook',
      description:
        'Registers an HTTPS webhook target for signed premium event delivery. The session must be active (activated via sap_premium_activate_session). The target URL must be HTTPS, reachable, and not a private/localhost endpoint in production. Events are filtered to the exact event ids listed in the request.',
      inputSchema: {
        type: 'object',
        required: ['sessionId', 'targetUrl', 'events'],
        properties: {
          sessionId: {
            type: 'string',
            description: 'Active premium session id.',
          },
          targetUrl: {
            type: 'string',
            description: 'HTTPS webhook endpoint owned by the buyer. Localhost and private network URLs are rejected in production.',
          },
          events: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' },
            description: 'Exact event ids to deliver, from the capability delivery contract.',
          },
          signingPublicKey: {
            type: 'string',
            description: 'Optional buyer public key for webhook signature verification.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['subscription'],
        properties: {
          subscription: {
            type: 'object',
            additionalProperties: true,
            description: 'Webhook subscription record with subscriptionId, targetUrl, events, and delivery stats.',
          },
        },
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const sessionId = readString(raw.sessionId);
      const targetUrl = readString(raw.targetUrl);
      const events = Array.isArray(raw.events) ? raw.events.filter((e): e is string => typeof e === 'string') : [];
      if (!sessionId || !targetUrl || events.length === 0) {
        return createStructuredJsonResponse({
          subscription: null,
          reason: 'sessionId, targetUrl, and at least one event id are required.',
        }, { isError: true });
      }

      const subscription = await registerWebhook(sessionId, targetUrl, events, readString(raw.signingPublicKey));
      if (!subscription) {
        return createStructuredJsonResponse({
          subscription: null,
          reason: 'Session is not active, URL is invalid, or no matching events.',
        }, { isError: true });
      }
      return createStructuredJsonResponse({ subscription });
    },
  );

  registerTool(
    server,
    'sap_premium_webhook_unregister',
    {
      title: 'Unregister Premium Webhook',
      description:
        'Deactivates and removes a webhook subscription. No further events will be delivered to the target URL.',
      inputSchema: {
        type: 'object',
        required: ['subscriptionId'],
        properties: {
          subscriptionId: {
            type: 'string',
            description: 'Webhook subscription id returned by sap_premium_webhook_register.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['unregistered'],
        properties: {
          unregistered: {
            type: 'object',
            additionalProperties: true,
            description: 'Unregister result with subscriptionId and success boolean.',
          },
        },
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      const subscriptionId = readString((input as Record<string, unknown>).subscriptionId);
      if (!subscriptionId) {
        return createStructuredJsonResponse({
          unregistered: { subscriptionId: null, success: false },
        }, { isError: true });
      }
      const success = unregisterWebhook(subscriptionId);
      return createStructuredJsonResponse({
        unregistered: { subscriptionId, success },
      });
    },
  );

  registerTool(
    server,
    'sap_premium_webhook_status',
    {
      title: 'Premium Webhook Status',
      description:
        'Returns the current status of a webhook subscription, including delivery stats and recent delivery attempt records with HTTP status codes and signatures.',
      inputSchema: {
        type: 'object',
        required: ['subscriptionId'],
        properties: {
          subscriptionId: {
            type: 'string',
            description: 'Webhook subscription id returned by sap_premium_webhook_register.',
          },
          includeDeliveries: {
            type: 'boolean',
            description: 'When true, include recent delivery attempt records. Default: true.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['subscription'],
        properties: {
          subscription: {
            type: 'object',
            additionalProperties: true,
            description: 'Webhook subscription record, or null if not found.',
          },
          deliveries: {
            type: 'array',
            description: 'Recent delivery attempt records.',
            items: { type: 'object', additionalProperties: true },
          },
        },
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const subscriptionId = readString(raw.subscriptionId);
      if (!subscriptionId) {
        return createStructuredJsonResponse({
          subscription: null,
          deliveries: [],
        }, { isError: true });
      }
      const subscription = getWebhookSubscription(subscriptionId);
      const includeDeliveries = raw.includeDeliveries !== false;
      const deliveries = includeDeliveries && subscription ? getWebhookDeliveries(subscriptionId) : [];
      return createStructuredJsonResponse({ subscription, deliveries });
    },
  );

  // --- Metrics (Layer 5: Monitoring) ---

  registerTool(
    server,
    'sap_premium_metrics',
    {
      title: 'Premium Subsystem Metrics',
      description:
        'Returns a point-in-time metrics snapshot of the premium subsystem: active/pending/blocked sessions, total events delivered, estimated revenue, active streams, active webhooks, and provider health status. Use this for monitoring and operational insights.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['metrics'],
        properties: {
          metrics: {
            type: 'object',
            additionalProperties: true,
            description: 'Premium metrics snapshot with session, event, revenue, stream, webhook, and provider health counts.',
          },
        },
        additionalProperties: false,
      },
    },
    async () => {
      const metrics = await getPremiumMetrics();
      return createStructuredJsonResponse({ metrics });
    },
  );
}
