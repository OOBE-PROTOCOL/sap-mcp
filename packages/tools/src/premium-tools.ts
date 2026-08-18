import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/src/types.js';
import {
  createToolFamilyPipelineResult,
  registerToolFamilyPipelineTool,
  type ToolFamilyPipelineDefinition,
  type ToolFamilyPipelineHandlerResult,
  type ToolFamilyPipelineResult,
} from './tool-family-pipeline.js';
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
  registerWebhookRelay,
  getRelaySubscriptionsForSession,
  startWebhookDelivery,
  unregisterWebhook,
  getWebhookSubscription,
  getWebhookDeliveries,
  getPremiumMetrics,
  getEvents,
  startStream,
  streamEvents,
  findPremiumCapability,
  type PremiumCapabilityType,
  type PremiumManifestTemplateRequest,
  type PremiumSessionRequest,
} from '../../premium/src/index.js';

const CAPABILITY_TYPES = ['stream', 'webhook', 'tool'] as const;

type PremiumToolDefinition = ToolFamilyPipelineDefinition;
type PremiumToolHandlerResult = ToolFamilyPipelineHandlerResult;

function createPremiumPipelineResponse(
  data: Record<string, unknown>,
  options: { readonly isError?: boolean } = {},
): ToolFamilyPipelineResult {
  return createToolFamilyPipelineResult(data, undefined, options);
}

function registerPremiumPipelineTool(
  server: Server,
  context: SapMcpContext,
  name: string,
  definition: PremiumToolDefinition,
  execute: (input: unknown) => Promise<PremiumToolHandlerResult>,
): void {
  registerToolFamilyPipelineTool(server, context, name, definition, execute);
}

function parseCapabilityType(value: unknown): PremiumCapabilityType | undefined {
  if (typeof value !== 'string') return undefined;
  return CAPABILITY_TYPES.includes(value as PremiumCapabilityType) ? (value as PremiumCapabilityType) : undefined;
}

/**
 * Set of session IDs for which the auto-start delivery loop has been launched.
 * Prevents duplicate background loops on repeated poll calls.
 */
const autoStartedSessions = new Set<string>();

/**
 * @name autoStartDelivery
 * @description Automatically start the provider delivery loop for a session when
 * the agent polls for events but no delivery has been started yet.
 *
 * For stream capabilities: starts the stream broker + background event generator
 * that feeds the event store.
 * For webhook capabilities: registers a relay (buffer-only) subscription and
 * starts the webhook delivery loop that feeds the event store.
 *
 * This eliminates the need for the agent to explicitly call
 * sap_premium_webhook_relay or open an SSE connection before polling.
 *
 * @param sessionId - Active premium session id.
 * @internal
 */
async function autoStartDelivery(sessionId: string): Promise<boolean> {
  if (autoStartedSessions.has(sessionId)) return false;

  const session = getPremiumSession(sessionId);
  if (!session || session.status !== 'active') return false;

  // Look up the capability to determine its type.
  const resolved = findPremiumCapability(session.pluginId, session.capabilityId);
  if (!resolved) return false;

  autoStartedSessions.add(sessionId);

  try {
    if (resolved.capability.type === 'stream') {
      // Start the stream broker subscription + background event generator.
      const subscriptionKey = `auto-${sessionId}`;
      const filters: Record<string, unknown> = {};
      await startStream(sessionId, subscriptionKey, filters);

      // Launch the async event generator in the background.
      // It feeds events into the event store until the quota is exhausted
      // or the provider iterable ends.
      void (async () => {
        try {
          for await (const event of streamEvents(sessionId)) {
            void event;
            // Events are already appended to the event store inside streamEvents.
            // This loop just consumes the generator to keep it running.
          }
        } catch {
          // Best-effort: log and stop silently on provider errors.
        }
      })();
    } else if (resolved.capability.type === 'webhook') {
      // Register a relay (buffer-only) subscription and start the delivery loop.
      const eventTypes = resolved.capability.delivery?.events ?? [];
      if (eventTypes.length === 0) return false;

      const sub = await registerWebhookRelay(sessionId, eventTypes);
      if (sub) {
        // Start the webhook delivery loop in the background.
        // It feeds matching events into the event store.
        void startWebhookDelivery(sub).catch(() => {
          // Best-effort: provider may not be available.
        });
      }
    }
  } catch {
    // Best-effort: if auto-start fails, the poll still returns existing events.
    // The agent can retry on the next poll.
  }

  return true;
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
  registerPremiumPipelineTool(
    server,
    context,
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

      return createPremiumPipelineResponse({
        version: '1.0.0',
        plugins,
        providerStatus: publicPremiumProviderStatus(),
        privatePluginSupport: premiumPrivatePluginSupport(),
      });
    },
  );

  registerPremiumPipelineTool(
    server,
    context,
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
      return createPremiumPipelineResponse({
        version: '1.0.0',
        type: 'stream',
        capabilities,
        providerStatus: publicPremiumProviderStatus(),
      });
    },
  );

  registerPremiumPipelineTool(
    server,
    context,
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
      return createPremiumPipelineResponse({
        version: '1.0.0',
        type: 'webhook',
        capabilities,
        providerStatus: publicPremiumProviderStatus(),
      });
    },
  );

  registerPremiumPipelineTool(
    server,
    context,
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
      return createPremiumPipelineResponse({ ...validatePremiumPluginManifest(manifest) });
    },
  );

  registerPremiumPipelineTool(
    server,
    context,
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
        return createPremiumPipelineResponse({
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
      return createPremiumPipelineResponse({
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

  registerPremiumPipelineTool(
    server,
    context,
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
          return createPremiumPipelineResponse({
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
        return createPremiumPipelineResponse({
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
        return createPremiumPipelineResponse({
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

  registerPremiumPipelineTool(
    server,
    context,
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
      return createPremiumPipelineResponse({ sessions });
    },
  );

  // --- Session activation (Layer 2: Payment Gate) ---

  registerPremiumPipelineTool(
    server,
    context,
    'sap_premium_activate_session',
    {
      title: 'Activate Premium Session',
      description:
        'Activates a pending premium session with a verified x402/pay.sh payment receipt. This tool is FREE — it does not charge x402. The paymentReceipt must be the actual Solana transaction signature (tx hash) from the x402 facilitator settlement, NOT "pending" or any placeholder. Flow: 1) sap_premium_session_start creates a pending session (free). 2) The x402 challenge is settled via the local bridge (sap_payments_call_paid_tool or direct facilitator payment) — the facilitator returns a tx signature. 3) Pass that tx signature as paymentReceipt to this tool. Do NOT pass "pending" — it will always be rejected and waste a tool call.',
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
            description: 'The Solana transaction signature (tx hash) from the x402 facilitator settlement. NOT "pending" — must be the real tx hash like "3ozKaRujGGymu3s9q67qfwfG21s2BpjJQ5zEEFCWen1u...". Get this by settling the payment challenge first, then pass the returned signature here.',
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
        return createPremiumPipelineResponse({
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
      return createPremiumPipelineResponse({ activation });
    },
  );

  registerPremiumPipelineTool(
    server,
    context,
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
        return createPremiumPipelineResponse({
          closed: { sessionId: null, success: false, reason: 'sessionId is required.' },
        }, { isError: true });
      }

      const success = closeSession(sessionId, reason);
      return createPremiumPipelineResponse({
        closed: { sessionId, success, reason: success ? 'Session closed.' : 'Session not found or not active.' },
      });
    },
  );

  // --- Webhook management (Layer 3: Delivery Rail) ---

  registerPremiumPipelineTool(
    server,
    context,
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
        return createPremiumPipelineResponse({
          subscription: null,
          reason: 'sessionId, targetUrl, and at least one event id are required.',
        }, { isError: true });
      }

      const subscription = await registerWebhook(sessionId, targetUrl, events, readString(raw.signingPublicKey));
      if (!subscription) {
        return createPremiumPipelineResponse({
          subscription: null,
          reason: 'Session is not active, URL is invalid, or no matching events.',
        }, { isError: true });
      }
      return createPremiumPipelineResponse({ subscription });
    },
  );

  registerPremiumPipelineTool(
    server,
    context,
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
        return createPremiumPipelineResponse({
          unregistered: { subscriptionId: null, success: false },
        }, { isError: true });
      }
      const success = unregisterWebhook(subscriptionId);
      return createPremiumPipelineResponse({
        unregistered: { subscriptionId, success },
      });
    },
  );

  registerPremiumPipelineTool(
    server,
    context,
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
        return createPremiumPipelineResponse({
          subscription: null,
          deliveries: [],
        }, { isError: true });
      }
      const subscription = getWebhookSubscription(subscriptionId);
      const includeDeliveries = raw.includeDeliveries !== false;
      const deliveries = includeDeliveries && subscription ? getWebhookDeliveries(subscriptionId) : [];
      return createPremiumPipelineResponse({ subscription, deliveries });
    },
  );

  // --- Webhook relay (buffer-only delivery for local agents) ---
  // Agents running locally without a public HTTPS endpoint cannot receive
  // traditional webhook deliveries. The relay mode buffers events server-side
  // in the event store; the agent then consumes them via
  // sap_premium_stream_poll / sap_premium_stream_flush — standard MCP tool
  // calls that work over any transport.

  registerPremiumPipelineTool(
    server,
    context,
    'sap_premium_webhook_relay',
    {
      title: 'Register Premium Webhook Relay (Buffer-Only)',
      description:
        'Registers a buffer-only webhook subscription for an active premium session. Unlike sap_premium_webhook_register, this does not require a public HTTPS endpoint — events matching the subscription are buffered server-side in the event store and the agent consumes them via sap_premium_stream_poll or sap_premium_stream_flush. Use this when the agent runs locally or behind NAT and cannot expose a publicly reachable HTTPS callback URL. The session must be active (activated via sap_premium_activate_session). Events are filtered to the exact event ids listed in the request.',
      inputSchema: {
        type: 'object',
        required: ['sessionId', 'events'],
        properties: {
          sessionId: {
            type: 'string',
            description: 'Active premium session id to buffer webhook events for.',
          },
          events: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', description: 'Event id to buffer, from the capability delivery contract.' },
            description: 'Exact event ids to buffer and deliver via poll/flush. At least one event id is required.',
          },
          filters: {
            type: 'object',
            additionalProperties: true,
            description: 'Optional narrow filters applied to the provider subscription, forwarded to the delivery loop.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['subscription', 'consumption'],
        properties: {
          subscription: {
            type: 'object',
            additionalProperties: true,
            description: 'Relay webhook subscription record with subscriptionId, targetUrl (relay://buffer), events, and delivery stats. Null if registration failed.',
          },
          consumption: {
            type: 'object',
            additionalProperties: true,
            description: 'Consumption guidance listing the poll and flush tool names the agent should use to drain the buffer.',
          },
        },
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const sessionId = readString(raw.sessionId);
      const events = Array.isArray(raw.events) ? raw.events.filter((e): e is string => typeof e === 'string' && e.trim().length > 0) : [];
      if (!sessionId || events.length === 0) {
        return createPremiumPipelineResponse({
          subscription: null,
          consumption: {
            reason: 'sessionId and at least one event id are required.',
            pollTool: 'sap_premium_stream_poll',
            flushTool: 'sap_premium_stream_flush',
          },
        }, { isError: true });
      }

      const subscription = await registerWebhookRelay(sessionId, events);
      if (!subscription) {
        return createPremiumPipelineResponse({
          subscription: null,
          consumption: {
            reason: 'Session is not active or no matching events. Activate the session with sap_premium_activate_session first.',
            pollTool: 'sap_premium_stream_poll',
            flushTool: 'sap_premium_stream_flush',
          },
        }, { isError: true });
      }

      // Start the buffer-only delivery loop in the background. For relay
      // subscriptions the loop appends events to the store without making any
      // outbound HTTP call.
      void startWebhookDelivery(subscription).catch(error => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[premium-tools] Webhook relay delivery error for ${subscription.subscriptionId}: ${msg}`);
      });

      return createPremiumPipelineResponse({
        subscription,
        subscribedEvents: events,
        appliedFilters: {
          events,
          note: 'The delivery loop subscribes to the provider with no additional filters. Event type filtering is applied by the webhook engine: only events whose eventType matches the subscription events list are buffered. Provider-level filters (mints, priceFeedIds, minLiquidityUsd, etc.) can be passed via sap_premium_session_start filters field when creating the session plan.',
        },
        consumption: {
          mode: 'buffer',
          pollTool: 'sap_premium_stream_poll',
          flushTool: 'sap_premium_stream_flush',
          instruction: 'Poll the buffer with sap_premium_stream_poll using this sessionId, or drain in bulk with sap_premium_stream_flush. No HTTPS endpoint is required.',
        },
      });
    },
  );

  registerPremiumPipelineTool(
    server,
    context,
    'sap_premium_webhook_relay_status',
    {
      title: 'Premium Webhook Relay Status',
      description:
        'Returns the status of buffer-only (relay) webhook subscriptions for a session, including the relay configuration, buffered event count, and per-subscription delivery stats. Use this to check how many events are waiting in the server-side buffer before calling sap_premium_stream_poll or sap_premium_stream_flush to consume them.',
      inputSchema: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: {
            type: 'string',
            description: 'Premium session id to inspect relay subscriptions and buffered event counts for.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['sessionId', 'relaySubscriptions', 'bufferedEventCount', 'sessionStatus'],
        properties: {
          sessionId: {
            type: 'string',
            description: 'The session id that was queried.',
          },
          relaySubscriptions: {
            type: 'array',
            description: 'Active relay (buffer-only) webhook subscriptions for the session.',
            items: { type: 'object', additionalProperties: true, description: 'Relay webhook subscription record.' },
          },
          bufferedEventCount: {
            type: 'number',
            description: 'Total number of events currently buffered in the event store for this session (across all relay subscriptions).',
          },
          sessionStatus: {
            type: 'string',
            description: 'Current session status (active, closed, pending_payment, not_found).',
          },
        },
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const sessionId = readString(raw.sessionId);
      if (!sessionId) {
        return createPremiumPipelineResponse({
          sessionId: null,
          relaySubscriptions: [],
          bufferedEventCount: 0,
          sessionStatus: 'invalid_request',
        }, { isError: true });
      }

      const session = getPremiumSession(sessionId);
      const relaySubscriptions = getRelaySubscriptionsForSession(sessionId);
      const bufferedEvents = getEvents({ sessionId, limit: 100_000 });

      return createPremiumPipelineResponse({
        sessionId,
        relaySubscriptions,
        bufferedEventCount: bufferedEvents.length,
        sessionStatus: session?.status ?? 'not_found',
      });
    },
  );

  // --- Metrics (Layer 5: Monitoring) ---

  registerPremiumPipelineTool(
    server,
    context,
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
      return createPremiumPipelineResponse({ metrics });
    },
  );

  // --- Stream consumer tools (Layer 6: MCP-compatible event consumption) ---
  // These tools solve the core gap: MCP is request/response, so agents cannot
  // hold open SSE connections. sap_premium_stream_poll and sap_premium_stream_flush
  // let agents consume buffered events via standard tool calls.

  registerPremiumPipelineTool(
    server,
    context,
    'sap_premium_stream_poll',
    {
      title: 'Poll Premium Stream Events',
      description:
        'Long-poll buffered premium stream events for an active session. Returns events that have been delivered to the server-side event buffer since the last poll. This is the MCP-compatible alternative to holding open an SSE connection — call this tool periodically to drain the event buffer. This tool is transport-agnostic: because it is a standard MCP tool call (request/response), it works over any MCP transport including stdio, streamable-http, and WebSocket-based MCP transports. There is no need for a separate WebSocket endpoint — this poll tool IS the WebSocket-compatible consumption path. Events are returned oldest-first. Use the sinceEventId cursor from the last poll to fetch only new events. If no events are available, the tool will wait up to waitMs (default 15s, max 30s) for events to arrive before returning an empty array — this gives near-real-time delivery without repeated polling. Set waitMs=0 for instant return.',
      inputSchema: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: {
            type: 'string',
            description: 'Active premium session id whose stream events should be polled.',
          },
          sinceEventId: {
            type: 'string',
            description: 'Optional event id cursor. Only events delivered after this event id are returned. Use the last event id from the previous poll to paginate.',
          },
          maxEvents: {
            type: 'number',
            description: 'Maximum number of events to return in a single poll. Default: 10, max: 100.',
          },
          waitMs: {
            type: 'number',
            description: 'Long-poll wait timeout in milliseconds. If no events are available, the tool waits up to this duration for events to arrive before returning. Default: 15000 (15s). Max: 30000 (30s). Set to 0 for instant return.',
            minimum: 0,
            maximum: 30000,
          },
          eventType: {
            type: 'string',
            description: 'Optional event type filter. Only events matching this type are returned.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['events', 'hasMore', 'sessionStatus'],
        properties: {
          events: {
            type: 'array',
            description: 'Buffered premium events matching the poll query, ordered oldest-first.',
            items: {
              type: 'object',
              additionalProperties: true,
              description: 'Premium event record with eventId, eventType, observedAt, payload, and deliveredAt.',
            },
          },
          hasMore: {
            type: 'boolean',
            description: 'True if more events are available in the buffer beyond this batch. Call again to drain remaining events.',
          },
          sessionStatus: {
            type: 'string',
            description: 'Current session status (active, closed, not_found).',
          },
          unitsRemaining: {
            type: 'number',
            description: 'Remaining billable units in the session quota, if the session is active.',
          },
          hint: {
            type: 'string',
            description: 'Optional hint message, e.g. when delivery loop was just auto-started and no events have arrived yet.',
          },
        },
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const sessionId = readString(raw.sessionId);
      if (!sessionId) {
        return createPremiumPipelineResponse({
          events: [],
          hasMore: false,
          sessionStatus: 'invalid_request',
        }, { isError: true });
      }

      const session = getPremiumSession(sessionId);
      if (!session) {
        return createPremiumPipelineResponse({
          events: [],
          hasMore: false,
          sessionStatus: 'not_found',
        });
      }

      // Auto-start the provider delivery loop if not already running.
      // This eliminates the need for the agent to call sap_premium_webhook_relay
      // or open an SSE connection before polling.
      const wasAutoStarted = await autoStartDelivery(sessionId);

      const maxEvents = Math.min(Math.max(readNumber(raw.maxEvents, 10), 1), 100);
      const sinceEventId = readString(raw.sinceEventId);
      const eventTypeFilter = readString(raw.eventType);

      // Long-poll: if no events are available on the first check, wait up to
      // waitMs for events to arrive before returning. This gives near-real-time
      // delivery without requiring the agent to repeatedly call the tool.
      // Default: 15 seconds. Max: 30 seconds. Set to 0 for instant return.
      const waitMs = Math.min(Math.max(readNumber(raw.waitMs, 15_000), 0), 30_000);
      const pollIntervalMs = 500;
      const deadline = Date.now() + waitMs;

      // If a cursor is provided, find its deliveredAt timestamp and use it as the since filter.
      let sinceIso: string | undefined;
      if (sinceEventId) {
        const cursorEvents = getEvents({ sessionId, limit: 1000 });
        const cursorRecord = cursorEvents.find((r) => r.eventId === sinceEventId);
        if (cursorRecord) {
          sinceIso = cursorRecord.deliveredAt;
        }
      }

      // Fetch one extra to determine hasMore.
      const queryLimit = maxEvents + 1;
      let allEvents = getEvents({
        sessionId,
        eventType: eventTypeFilter,
        since: sinceIso,
        limit: queryLimit,
      });

      // Long-poll loop: if no events yet, wait and retry until events arrive or timeout.
      if (allEvents.length === 0 && waitMs > 0) {
        while (Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          allEvents = getEvents({
            sessionId,
            eventType: eventTypeFilter,
            since: sinceIso,
            limit: queryLimit,
          });
          if (allEvents.length > 0) break;

          // Check if session is still active — stop if closed.
          const currentSession = getPremiumSession(sessionId);
          if (!currentSession || currentSession.status !== 'active') break;
        }
      }

      const hasMore = allEvents.length > maxEvents;
      const batch = hasMore ? allEvents.slice(0, maxEvents) : allEvents;

      return createPremiumPipelineResponse({
        events: batch.map((record) => ({
          eventId: record.eventId,
          eventType: record.eventType,
          observedAt: record.observedAt,
          payload: record.payload,
          deliveredAt: record.deliveredAt,
        })),
        hasMore,
        sessionStatus: session.status,
        unitsRemaining: session.requestedUnits,
        ...(wasAutoStarted && batch.length === 0
          ? { hint: 'Delivery loop auto-started. Provider events may take 10-60 seconds to arrive. Keep polling at 10-30 second intervals.' }
          : {}),
      });
    },
  );

  registerPremiumPipelineTool(
    server,
    context,
    'sap_premium_stream_flush',
    {
      title: 'Flush Premium Stream Events',
      description:
        'Flush all buffered premium stream events for a session with cursor-based pagination. Unlike sap_premium_stream_poll (which returns a small batch for periodic polling), flush returns all events up to the cursor limit in a single call. Use this when an agent reconnects after a disconnection and needs to catch up on missed events. The nextCursor can be used as sinceEventId in subsequent calls to fetch only newer events.',
      inputSchema: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: {
            type: 'string',
            description: 'Active or recently active premium session id whose buffered events should be flushed.',
          },
          sinceEventId: {
            type: 'string',
            description: 'Optional event id cursor. Only events delivered after this event id are returned. Use nextCursor from the previous flush call.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of events to return. Default: 50, max: 500.',
          },
          eventType: {
            type: 'string',
            description: 'Optional event type filter.',
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        required: ['events', 'nextCursor', 'sessionStatus'],
        properties: {
          events: {
            type: 'array',
            description: 'All buffered premium events matching the flush query, ordered oldest-first.',
            items: {
              type: 'object',
              additionalProperties: true,
              description: 'Premium event record with eventId, eventType, observedAt, payload, and deliveredAt.',
            },
          },
          nextCursor: {
            type: 'string',
            description: 'Event id of the last event in this batch. Pass as sinceEventId in the next flush call to paginate. Null if no events were returned.',
          },
          sessionStatus: {
            type: 'string',
            description: 'Current session status (active, closed, not_found).',
          },
          totalReturned: {
            type: 'number',
            description: 'Total number of events returned in this batch.',
          },
        },
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      const raw = input as Record<string, unknown>;
      const sessionId = readString(raw.sessionId);
      if (!sessionId) {
        return createPremiumPipelineResponse({
          events: [],
          nextCursor: null,
          sessionStatus: 'invalid_request',
          totalReturned: 0,
        }, { isError: true });
      }

      const session = getPremiumSession(sessionId);
      if (!session) {
        return createPremiumPipelineResponse({
          events: [],
          nextCursor: null,
          sessionStatus: 'not_found',
          totalReturned: 0,
        });
      }

      // Auto-start the provider delivery loop if not already running.
      await autoStartDelivery(sessionId);

      const limit = Math.min(Math.max(readNumber(raw.limit, 50), 1), 500);
      const sinceEventId = readString(raw.sinceEventId);
      const eventTypeFilter = readString(raw.eventType);

      let sinceIso: string | undefined;
      if (sinceEventId) {
        const cursorEvents = getEvents({ sessionId, limit: 1000 });
        const cursorRecord = cursorEvents.find((r) => r.eventId === sinceEventId);
        if (cursorRecord) {
          sinceIso = cursorRecord.deliveredAt;
        }
      }

      const records = getEvents({
        sessionId,
        eventType: eventTypeFilter,
        since: sinceIso,
        limit,
      });

      const nextCursor = records.length > 0 ? records[records.length - 1].eventId : null;

      return createPremiumPipelineResponse({
        events: records.map((record) => ({
          eventId: record.eventId,
          eventType: record.eventType,
          observedAt: record.observedAt,
          payload: record.payload,
          deliveredAt: record.deliveredAt,
        })),
        nextCursor,
        sessionStatus: session.status,
        totalReturned: records.length,
      });
    },
  );
}
