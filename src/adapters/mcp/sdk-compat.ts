/**
 * MCP SDK compatibility layer
 * 
 * Provides unified API for registering tools, resources, and prompts
 * across different MCP SDK versions.
 * 
 * CRITICAL: This layer MUST register JSON-RPC request handlers for:
 * - tools/list, tools/call
 * - resources/list, resources/read, resources/templates/list
 * - prompts/list, prompts/get
 * 
 * Following MCP SDK v1.x specification:
 * https://github.com/modelcontextprotocol/typescript-sdk
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { 
  Tool, 
  ToolAnnotations,
  Resource, 
  ResourceTemplate, 
  Prompt 
} from '@modelcontextprotocol/sdk/types.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { isHostedAccountlessBlockedTool } from '../../payments/hosted-tool-eligibility.js';
import { classifyTool, type PaymentTier } from '../../payments/pricing.js';
import { checkToolPermissions, privateKeyGuard } from '../../security/index.js';
import { canonicalizeToolName } from '../../tools/tool-aliases.js';

// Track which handlers have been registered to avoid duplicates
const handlerRegistry = new WeakMap<Server, {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
}>();
const executionContexts = new WeakMap<Server, SapMcpContext>();

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonSchemaMap = Record<string, JsonValue | JsonValue[] | undefined>;
type ZodLikeSchema = {
  _def?: Record<string, unknown>;
  description?: string;
  isOptional?: () => boolean;
  isNullable?: () => boolean;
  safeParse?: (value: unknown) => unknown;
};
type ToolHandler = (input: unknown) => Promise<unknown>;
type ResourceHandler = () => Promise<unknown>;
type ResourceTemplateHandler = (uri: string, args: Record<string, unknown>) => Promise<unknown>;
type PromptHandler = (args: Record<string, unknown>) => Promise<unknown>;
type ResourceContent = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
};
type ToolContent = {
  type: string;
  text?: string;
};
type ToolCallResult = {
  content: ToolContent[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

interface RegisteredMcpServer extends Server {
  tools?: Tool[];
  toolHandlers?: Record<string, ToolHandler>;
  toolHasExplicitOutputSchema?: Record<string, boolean>;
  resources?: Resource[];
  resourceHandlers?: Record<string, ResourceHandler>;
  resourceTemplates?: ResourceTemplate[];
  resourceTemplateHandlers?: Record<string, ResourceTemplateHandler>;
  prompts?: Prompt[];
  promptHandlers?: Record<string, PromptHandler>;
}

/**
 * @name withRegistrationStore
 * @description Narrows the MCP server to the local registration store used by this compatibility layer.
 * @param server - MCP server instance.
 * @returns Server with local registration arrays and handler maps.
 */
function withRegistrationStore(server: Server): RegisteredMcpServer {
  return server as RegisteredMcpServer;
}

/**
 * @name isResourceReadResult
 * @description Detects handlers that already return an MCP resources/read result.
 */
function isResourceReadResult(value: unknown): value is { contents: ResourceContent[] } {
  if (!isPlainObject(value) || !Array.isArray(value.contents)) {
    return false;
  }

  return value.contents.every((content) => (
    isPlainObject(content)
    && typeof content.uri === 'string'
    && (content.mimeType === undefined || typeof content.mimeType === 'string')
    && (content.text === undefined || typeof content.text === 'string')
    && (content.blob === undefined || typeof content.blob === 'string')
  ));
}

/**
 * @name toResourceReadResult
 * @description Normalizes legacy resource handler returns and native MCP resource results.
 */
function toResourceReadResult(
  result: unknown,
  uri: string,
  mimeType: string,
): { contents: ResourceContent[] } {
  if (isResourceReadResult(result)) {
    return result;
  }

  return {
    contents: [
      {
        uri,
        mimeType,
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * @name isToolCallResult
 * @description Detects handlers that already return an MCP tools/call result.
 */
function isToolCallResult(value: unknown): value is ToolCallResult {
  if (!isPlainObject(value) || !Array.isArray(value.content)) {
    return false;
  }

  return value.content.every((content) => (
    isPlainObject(content)
    && typeof content.type === 'string'
    && (content.text === undefined || typeof content.text === 'string')
  ));
}

/**
 * @name toToolCallResult
 * @description Normalizes legacy tool handler returns and native MCP tool results.
 */
function parseSingleJsonTextContent(content: ToolContent[]): Record<string, unknown> | undefined {
  if (content.length !== 1 || content[0].type !== 'text' || typeof content[0].text !== 'string') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(content[0].text) as unknown;
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function toToolCallResult(result: unknown, hasExplicitOutputSchema = false): ToolCallResult {
  if (isToolCallResult(result)) {
    const inferredStructuredContent = hasExplicitOutputSchema
      ? parseSingleJsonTextContent(result.content)
      : undefined;

    return {
      ...result,
      structuredContent: result.structuredContent ?? inferredStructuredContent ?? {
        content: result.content,
        isError: result.isError,
      },
    };
  }

  const content: ToolContent[] = [
    {
      type: 'text',
      text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
    },
  ];

  return {
    content,
    structuredContent: hasExplicitOutputSchema && isPlainObject(result) ? result : { content },
  };
}

/**
 * @name defaultToolOutputSchema
 * @description Describes the normalized MCP tool result shape returned by this compatibility layer.
 */
function defaultToolOutputSchema(): NonNullable<Tool['outputSchema']> {
  return {
    type: 'object',
    properties: {
      content: {
        type: 'array',
        description: 'MCP content blocks returned to the caller.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'MCP content block type, usually text.' },
            text: { type: 'string', description: 'Human-readable JSON or text returned by the tool.' },
          },
          required: ['type'],
        },
      },
      isError: { type: 'boolean', description: 'True when the tool result represents an application-level error.' },
    },
    required: ['content'],
  };
}

/**
 * @name inferToolAnnotations
 * @description Builds conservative MCP tool annotations from the tool name and title.
 */
function inferToolAnnotations(name: string, title?: string): ToolAnnotations {
  const lower = name.toLowerCase();
  const readOnlyPrefixes = [
    'get',
    'list',
    'fetch',
    'find',
    'search',
    'check',
    'resolve',
    'validate',
    'estimate',
    'calculate',
    'preview',
    'decode',
    'current',
    'show',
  ];
  const destructiveTerms = [
    'close',
    'deactivate',
    'revoke',
    'cancel',
    'withdraw',
    'delete',
    'remove',
    'submit',
    'swap',
    'execute',
    'buy',
    'sell',
    'bridge',
    'settle',
  ];

  const firstSegment = lower.split(/[_-]/)[0] ?? lower;
  const readOnlyHint = readOnlyPrefixes.includes(firstSegment)
    || lower.includes('_get')
    || lower.includes('_list')
    || lower.includes('_fetch')
    || lower.includes('_check')
    || lower.includes('_resolve')
    || lower.includes('_search');
  const destructiveHint = !readOnlyHint && destructiveTerms.some((term) => lower.includes(term));

  return {
    title,
    readOnlyHint,
    destructiveHint,
    idempotentHint: readOnlyHint,
    openWorldHint: lower.startsWith('sap_profile') || lower.startsWith('sap_skills') ? false : true,
  };
}

/**
 * @name formatToolTitle
 * @description Converts machine tool names into stable human-readable titles for MCP registries and clients.
 */
function formatToolTitle(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bSap\b/g, 'SAP')
    .replace(/\bSns\b/g, 'SNS')
    .replace(/\bRpc\b/g, 'RPC')
    .replace(/\bNft\b/g, 'NFT')
    .replace(/\bUsdc\b/g, 'USDC')
    .replace(/\bX402\b/g, 'x402');
}

/**
 * @name formatParameterLabel
 * @description Converts a machine parameter name into a readable label used only in generated descriptions.
 */
function formatParameterLabel(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bRpc\b/g, 'RPC')
    .replace(/\bUrl\b/g, 'URL')
    .replace(/\bUri\b/g, 'URI')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bPda\b/g, 'PDA')
    .replace(/\bSns\b/g, 'SNS')
    .replace(/\bUsdc\b/g, 'USDC');
}

/**
 * @name inferParameterDescription
 * @description Provides precise fallback descriptions for third-party schemas that omit parameter descriptions.
 */
function inferParameterDescription(toolTitle: string, parameterName: string): string {
  const lower = parameterName.toLowerCase();
  const label = formatParameterLabel(parameterName);

  if (lower === 'toolname' || lower === 'tool') {
    return `${label} to inspect or execute. Use the exact MCP name from tools/list; do not rewrite hyphenated names.`;
  }
  if (lower === 'arguments' || lower === 'args') {
    return `${label} object passed to the target tool. Match the target tool schema exactly; do not include wallet/keypair secret bytes.`;
  }
  if (lower === 'maxpriceusd') {
    return `${label} safety cap in USD for one x402 payment. Estimate with sap_estimate_tool_cost first and abort if the challenge exceeds this cap.`;
  }
  if (lower === 'maxtotalusd') {
    return `${label} total USD safety cap for a batch x402 workflow. Abort before any call that would exceed this budget.`;
  }
  if (lower === 'confirmaction' || lower === 'confirm') {
    return `${label} flag required before local signing, payment, or write execution. Set true only after the user approves the preview/cost.`;
  }
  if (lower === 'agenturi' || lower === 'metadatauri') {
    return `${label} public HTTPS/IPFS/Arweave metadata URI for the SAP agent profile. Desktop file paths are invalid for on-chain metadata.`;
  }
  if (lower === 'x402endpoint') {
    return `${label} public x402 discovery endpoint for this agent or provider, usually a .well-known/x402 URL.`;
  }
  if (lower === 'capabilities') {
    return `${label} array describing agent/tool capabilities. Use stable IDs, protocol labels, and human-readable descriptions; validate category values before writes.`;
  }
  if (lower === 'protocols') {
    return `${label} array of protocol identifiers such as sap, mcp, jupiter, pyth, metaplex, sns, or x402.`;
  }
  if (lower === 'pricing') {
    return `${label} array of x402/pay.sh pricing tiers for the registered agent or tool. Amounts should be denominated explicitly in USDC smallest units when applicable.`;
  }
  if (lower === 'transactionbase64' || lower === 'transaction') {
    return `${label} unsigned or signed transaction payload. Preview and finalize with sap_payments_finalize_transaction; never create ad-hoc signing scripts or read keypair JSON.`;
  }
  if (lower === 'submit') {
    return `${label} flag controlling whether a locally signed transaction is submitted after preview/signing. Use submit:true only after user approval.`;
  }
  if (lower === 'submitviarelay' || lower === 'submitrelayurl') {
    return `${label} for routing already-signed transaction bytes through the OOBE hosted relay/RPC path. The relay never receives private keys.`;
  }
  if (lower.includes('wallet') || lower.includes('owner')) {
    return `${label} address used by ${toolTitle}.`;
  }
  if (lower.includes('mint') || lower.includes('token')) {
    return `${label} mint, symbol, or token identifier used by ${toolTitle}.`;
  }
  if (lower.includes('agent') && (lower.includes('pubkey') || lower.includes('publickey'))) {
    return `${label} for the SAP agent account used by ${toolTitle}.`;
  }
  if (lower.includes('pubkey') || lower.includes('publickey') || lower.includes('address')) {
    return `${label} public key or address used by ${toolTitle}.`;
  }
  if (lower.includes('amount') || lower.includes('lamports') || lower.includes('quantity')) {
    return `${label} value to use for ${toolTitle}.`;
  }
  if (lower.includes('limit')) {
    return `${label} controlling the maximum number of results returned by ${toolTitle}.`;
  }
  if (lower.includes('offset') || lower.includes('cursor') || lower.includes('page')) {
    return `${label} pagination control for ${toolTitle}.`;
  }
  if (lower.includes('network') || lower.includes('cluster')) {
    return `${label} Solana network or cluster selector for ${toolTitle}.`;
  }
  if (lower.includes('rpc')) {
    return `${label} endpoint or RPC selector used by ${toolTitle}.`;
  }
  if (lower.includes('slippage')) {
    return `${label} tolerance for price movement while building the transaction.`;
  }
  if (lower.includes('transaction') || lower === 'tx' || lower.includes('txbase64')) {
    return `${label} transaction payload used by ${toolTitle}.`;
  }
  if (lower.includes('signature')) {
    return `${label} transaction or message signature used by ${toolTitle}.`;
  }
  if (lower.includes('domain') || lower.includes('name')) {
    return `${label} name or domain value used by ${toolTitle}.`;
  }
  if (lower.includes('confirm')) {
    return `${label} confirmation flag required before ${toolTitle} performs a local write.`;
  }

  return `${label} parameter for ${toolTitle}.`;
}

/**
 * @name enrichSchemaDescriptions
 * @description Adds missing JSON Schema descriptions without changing validation semantics.
 */
function enrichSchemaDescriptions(schema: Tool['inputSchema'], toolTitle: string): Tool['inputSchema'] {
  const enrichProperty = (propertyName: string, propertySchema: object): object => {
    const schemaRecord = propertySchema as Record<string, unknown>;
    const enriched: Record<string, unknown> = { ...schemaRecord };

    if (typeof enriched.description !== 'string' && typeof enriched.title !== 'string') {
      enriched.description = inferParameterDescription(toolTitle, propertyName);
    }

    if (isPlainObject(enriched.properties)) {
      enriched.properties = Object.fromEntries(
        Object.entries(enriched.properties).map(([childName, childSchema]) => [
          childName,
          isPlainObject(childSchema) ? enrichProperty(childName, childSchema) : childSchema,
        ])
      );
    }

    if (isPlainObject(enriched.items)) {
      enriched.items = enrichProperty(propertyName, enriched.items);
    }

    return enriched;
  };

  const properties = isPlainObject(schema.properties)
    ? Object.fromEntries(
      Object.entries(schema.properties).map(([propertyName, propertySchema]) => [
        propertyName,
        isPlainObject(propertySchema) ? enrichProperty(propertyName, propertySchema) : propertySchema,
      ])
    )
    : schema.properties;

  return {
    ...schema,
    properties,
  };
}

function priceHintForTier(tier: PaymentTier): string {
  switch (tier) {
    case 'free':
      return 'free; call directly without x402';
    case 'read-premium':
      return 'paid read-premium; estimate first, then use sap_payments_call_paid_tool when the runtime cannot replay x402 natively';
    case 'builder':
      return 'paid builder; estimate first, then pay/build and finalize unsigned transactions locally when returned';
    case 'value-action':
      return 'paid value-action; preview cost and transaction effects before user confirmation';
    case 'batch':
      return 'paid batch; enforce maxPriceUsd and maxTotalUsd caps';
    default:
      return 'priced by hosted x402 challenge';
  }
}

function localSignerEquivalent(toolName: string): string | undefined {
  const equivalents: Record<string, string> = {
    sap_register_agent: 'sap_payments_register_agent',
    sap_update_agent: 'sap_payments_update_agent',
    sap_sign_transaction: 'sap_payments_finalize_transaction',
  };
  if (equivalents[toolName]) return equivalents[toolName];
  if (toolName.startsWith('sap_escrow_build_')) return 'sap_payments_finalize_transaction';
  if (toolName.startsWith('sap_sns_build_')) return 'sap_payments_finalize_transaction';
  if (toolName.startsWith('sap_x402_build_')) return 'sap_payments_finalize_transaction';
  return undefined;
}

function classifyToolIntent(toolName: string): string {
  if (toolName.startsWith('sap_payments_') || toolName === 'sap_x402_paid_call') {
    return 'local non-custodial payment/signing bridge';
  }
  if (toolName.startsWith('sap_agent_') || toolName.startsWith('sap_runtime_') || toolName.startsWith('sap_skills_')) {
    return 'agent bootstrap, routing, skills, or repair guidance';
  }
  if (toolName.includes('_build_') || toolName.startsWith('sap_escrow_build_') || toolName.startsWith('sap_sns_build_')) {
    return 'hosted unsigned transaction builder';
  }
  if (toolName.includes('swap') || toolName.includes('trade') || toolName.includes('buy') || toolName.includes('sell')) {
    return 'Solana value-action or trading workflow';
  }
  if (toolName.includes('register') || toolName.includes('update') || toolName.includes('mint') || toolName.includes('transfer')) {
    return 'local-signer write workflow';
  }
  if (toolName.includes('list') || toolName.includes('get') || toolName.includes('fetch') || toolName.includes('discover') || toolName.includes('search')) {
    return 'read/discovery workflow';
  }
  return 'SAP MCP tool workflow';
}

function buildToolIntentGuidance(toolName: string, title: string): {
  descriptionSuffix: string;
  schemaDescription: string;
} {
  const tier = classifyTool(toolName);
  const intent = classifyToolIntent(toolName);
  const localEquivalent = localSignerEquivalent(toolName);
  const hostedBlocked = isHostedAccountlessBlockedTool(toolName);

  const routing = hostedBlocked
    ? `Hosted accountless routing: do not call this as a paid hosted write; no x402 payment should be charged. Use ${localEquivalent ?? 'the local sap_payments bridge or a hosted unsigned builder'} when user signing is required.`
    : toolName.startsWith('sap_payments_')
      ? 'Routing: local sap_payments bridge. It may sign x402 payment payloads or user-approved transactions locally, and must never expose keypair bytes.'
      : localEquivalent && toolName.includes('_build_')
        ? `Routing: hosted-safe builder. If a transaction is returned, preview/sign/submit with ${localEquivalent}; never create temporary signing scripts.`
        : tier === 'free'
          ? 'Routing: free hosted call; call directly and keep it small/exact when possible.'
          : 'Routing: paid hosted call; call sap_estimate_tool_cost first, then use sap_payments_call_paid_tool if the runtime cannot handle x402 natively.';

  const safety = toolName.startsWith('sap_payments_') || hostedBlocked || localEquivalent
    ? 'Signer boundary: user-controlled local profile or external signer; OOBE hosted MCP remains non-custodial.'
    : 'Signer boundary: hosted reads/builders never receive keypair bytes; value-moving results must be finalized locally when signing is required.';

  const descriptionSuffix = [
    `Intent: ${intent}.`,
    `Pricing: ${priceHintForTier(tier)}.`,
    routing,
    safety,
  ].join(' ');

  return {
    descriptionSuffix,
    schemaDescription: `${title} input schema. ${descriptionSuffix} Use exact field names from this schema; do not guess aliases or include private key material.`,
  };
}

function enrichToolDefinition(
  name: string,
  title: string,
  description: string,
  inputSchema: Tool['inputSchema'],
): { description: string; inputSchema: Tool['inputSchema'] } {
  const guidance = buildToolIntentGuidance(name, title);
  const suffix = `\n\nSAP MCP execution guidance: ${guidance.descriptionSuffix}`;
  const enrichedDescription = description.includes('SAP MCP execution guidance:')
    ? description
    : `${description}${suffix}`;

  return {
    description: enrichedDescription,
    inputSchema: {
      ...inputSchema,
      description: typeof inputSchema.description === 'string'
        ? `${inputSchema.description} ${guidance.schemaDescription}`
        : guidance.schemaDescription,
    },
  };
}

/**
 * Associates runtime context with an MCP server so tool calls can enforce policy and key-safety guards.
 */
export function setToolExecutionContext(server: Server, context: SapMcpContext): void {
  executionContexts.set(server, context);
}

/**
 * Checks whether a value is a plain JSON-compatible object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Converts a JSON-schema-ish properties map into the MCP SDK property type.
 */
function toMcpProperties(value: unknown): Record<string, object> {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, child]) => isPlainObject(child))
  ) as Record<string, object>;
}

/**
 * Removes non-JSON-Schema metadata from third-party schemas before exposing them through MCP.
 */
function sanitizeJsonSchema(value: unknown): JsonValue | undefined {
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonSchema).filter((item) => item !== undefined);
  }

  if (!isPlainObject(value)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      return value;
    }
    return undefined;
  }

  const sanitized: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('_') || key === '~standard') {
      continue;
    }

    const clean = sanitizeJsonSchema(child);
    if (clean !== undefined) {
      sanitized[key] = clean;
    }
  }

  return sanitized;
}

function toJsonValue(value: unknown, fallback: JsonValue): JsonValue {
  return sanitizeJsonSchema(value) ?? fallback;
}

/**
 * Checks whether a runtime value is a Zod schema without importing Zod internals.
 */
function isZodSchema(value: unknown): value is {
  _def?: Record<string, unknown>;
  description?: string;
  isOptional?: () => boolean;
  isNullable?: () => boolean;
} {
  return isPlainObject(value) && typeof value.safeParse === 'function' && isPlainObject(value._def);
}

/**
 * Returns the JSON Schema scalar type for a literal value.
 */
function jsonTypeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Unwraps Zod wrappers that affect optionality/nullability but not the wire JSON shape.
 */
function unwrapZodSchema(schema: unknown): { schema: unknown; optional: boolean; nullable: boolean } {
  let current = schema;
  let optional = isZodSchema(current) && Boolean(current.isOptional?.());
  let nullable = isZodSchema(current) && Boolean(current.isNullable?.());

  while (isZodSchema(current)) {
    const typeName = current._def?.typeName;
    if (typeName === 'ZodOptional' || typeName === 'ZodDefault' || typeName === 'ZodCatch') {
      optional = true;
      current = current._def?.innerType;
      continue;
    }

    if (typeName === 'ZodNullable') {
      nullable = true;
      current = current._def?.innerType;
      continue;
    }

    if (typeName === 'ZodEffects') {
      current = current._def?.schema;
      continue;
    }

    break;
  }

  return { schema: current, optional, nullable };
}

/**
 * Converts the Zod v3 schemas used by LangChain/Synapse tools into JSON Schema for MCP clients.
 */
function zodToJsonSchema(schema: unknown): Tool['inputSchema'] {
  const toSchema = (value: unknown): JsonSchemaMap => {
    if (!isZodSchema(value)) {
      return {};
    }

    const { schema: unwrapped, nullable } = unwrapZodSchema(value);
    const zodValue = value as ZodLikeSchema;
    const zodUnwrapped = isZodSchema(unwrapped) ? unwrapped : undefined;
    const definition = zodUnwrapped?._def ?? {};
    const typeName = definition.typeName;
    const description = zodUnwrapped?.description ?? zodValue.description;
    const withMetadata = (base: JsonSchemaMap): JsonSchemaMap => {
      const typed = nullable && typeof base.type === 'string'
        ? { ...base, type: [base.type, 'null'] }
        : base;
      return description ? { ...typed, description } : typed;
    };

    switch (typeName) {
      case 'ZodObject': {
        const shapeOrFactory = definition.shape;
        const shape = typeof shapeOrFactory === 'function' ? shapeOrFactory() : shapeOrFactory;
        const properties: Record<string, JsonSchemaMap> = {};
        const required: string[] = [];

        for (const [key, child] of Object.entries(isPlainObject(shape) ? shape : {})) {
          const { optional } = unwrapZodSchema(child);
          properties[key] = toSchema(child);
          if (!optional) {
            required.push(key);
          }
        }

        return withMetadata({
          type: 'object',
          properties: toJsonValue(properties, {}),
          required: required.length > 0 ? required : undefined,
          additionalProperties: definition.unknownKeys === 'passthrough',
        });
      }
      case 'ZodString':
        return withMetadata({ type: 'string' });
      case 'ZodNumber':
        return withMetadata({ type: 'number' });
      case 'ZodBigInt':
        return withMetadata({ type: 'string', pattern: '^-?\\d+$' });
      case 'ZodBoolean':
        return withMetadata({ type: 'boolean' });
      case 'ZodArray':
        return withMetadata({ type: 'array', items: toJsonValue(toSchema(definition.type), {}) });
      case 'ZodEnum':
        return withMetadata({ type: 'string', enum: Array.isArray(definition.values) ? definition.values.filter((item): item is JsonPrimitive => ['string', 'number', 'boolean'].includes(typeof item) || item === null) : [] });
      case 'ZodNativeEnum': {
        const values = Object.values(isPlainObject(definition.values) ? definition.values : {}).filter((item): item is string | number => ['string', 'number'].includes(typeof item));
        return withMetadata({ enum: values });
      }
      case 'ZodLiteral':
        return withMetadata({ type: jsonTypeOf(definition.value), const: sanitizeJsonSchema(definition.value) });
      case 'ZodUnion':
        return withMetadata({ anyOf: Array.isArray(definition.options) ? definition.options.map((option) => toJsonValue(toSchema(option), {})) : [] });
      case 'ZodRecord':
        return withMetadata({ type: 'object', additionalProperties: toJsonValue(toSchema(definition.valueType), {}) });
      case 'ZodAny':
      case 'ZodUnknown':
        return withMetadata({});
      default:
        return withMetadata({});
    }
  };

  const converted = toSchema(schema);
  return normalizeInputSchema(converted);
}

/**
 * Converts a property map or full JSON Schema object into the MCP `Tool.inputSchema` shape.
 */
function normalizeInputSchema(inputSchema: unknown): Tool['inputSchema'] {
  if (isZodSchema(inputSchema)) {
    const converted = zodToJsonSchema(inputSchema);
    return converted;
  }

  const sanitized = sanitizeJsonSchema(inputSchema);
  const raw = isPlainObject(sanitized) ? sanitized : {};

  if (raw.type === 'object' || raw.properties || raw.required || raw.additionalProperties !== undefined) {
    return {
      ...raw,
      type: 'object',
      properties: toMcpProperties(raw.properties),
      required: Array.isArray(raw.required) ? raw.required.filter((item: unknown) => typeof item === 'string') : undefined,
    };
  }

  return {
    type: 'object',
    properties: toMcpProperties(raw),
  };
}

/**
 * Converts a property map or full JSON Schema object into the MCP `Tool.outputSchema` shape.
 */
function normalizeOutputSchema(outputSchema: unknown): NonNullable<Tool['outputSchema']> {
  const sanitized = sanitizeJsonSchema(outputSchema);
  const raw = isPlainObject(sanitized) ? sanitized : undefined;

  if (raw && (raw.type === 'object' || raw.properties || raw.required)) {
    return {
      ...raw,
      type: 'object',
      properties: toMcpProperties(raw.properties),
      required: Array.isArray(raw.required) ? raw.required.filter((item: unknown) => typeof item === 'string') : undefined,
    };
  }

  return defaultToolOutputSchema();
}

/**
 * Initialize handler tracking for a server
 */
function ensureHandlerRegistry(server: Server) {
  if (!handlerRegistry.has(server)) {
    handlerRegistry.set(server, {
      tools: false,
      resources: false,
      prompts: false,
    });
  }
  return handlerRegistry.get(server)!;
}

/**
 * @name filterVisibleTools
 * @description Applies the configured allow-list to tools/list so bridge-only MCP clients do not see the full tool surface.
 */
function filterVisibleTools(server: Server, tools: Tool[]): Tool[] {
  const context = executionContexts.get(server);
  if (!context || context.config.allowedTools === 'all') {
    return tools;
  }

  const allowed = new Set(context.config.allowedTools);
  return tools.filter((tool) => allowed.has(tool.name));
}

/**
 * Tool registration helper
 * 
 * Registers a tool and ensures JSON-RPC handlers are set up for tools/list and tools/call
 */
export function registerTool<TInput = unknown>(
  server: Server,
  name: string,
  definition: {
    title?: string;
    description: string;
    inputSchema: unknown;
    outputSchema?: unknown;
    annotations?: ToolAnnotations;
  },
  handler: (input: TInput) => Promise<unknown>
) {
  logger.debug('Registering tool', { name });
  const store = withRegistrationStore(server);
  const title = definition.title ?? formatToolTitle(name);
  const inputSchema = enrichSchemaDescriptions(normalizeInputSchema(definition.inputSchema), title);
  const enriched = enrichToolDefinition(name, title, definition.description, inputSchema);
  
  // Store tool definition
  const tool: Tool = {
    name,
    title,
    description: enriched.description,
    inputSchema: enriched.inputSchema,
    outputSchema: normalizeOutputSchema(definition.outputSchema),
    annotations: {
      ...inferToolAnnotations(name, title),
      ...definition.annotations,
    },
  };
  
  // Initialize server storage if needed
  store.toolHandlers = store.toolHandlers || {};
  store.tools = store.tools || [];
  store.toolHasExplicitOutputSchema = store.toolHasExplicitOutputSchema || {};
  
  // Store handler and tool definition
  store.toolHandlers[name] = (input: unknown) => handler(input as TInput);
  store.toolHasExplicitOutputSchema[name] = definition.outputSchema !== undefined;
  store.tools.push(tool);
  
  // Register JSON-RPC handlers if not already done
  const registry = ensureHandlerRegistry(server);
  if (!registry.tools) {
    // Register tools/list handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = filterVisibleTools(server, withRegistrationStore(server).tools || []);
      logger.debug('Handling tools/list', { count: tools.length });
      return { tools };
    });
    
    // Register tools/call handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: args } = request.params;
      const canonicalToolName = canonicalizeToolName(toolName);
      logger.debug('Handling tools/call', { tool: toolName, canonicalTool: canonicalToolName, args });
      
      const handlers = withRegistrationStore(server).toolHandlers || {};
      const handler = handlers[canonicalToolName];
      
      if (!handler) {
        logger.error('Tool not found', { tool: toolName, canonicalTool: canonicalToolName });
        throw new Error(`Tool not found: ${toolName}`);
      }
      
      try {
        const context = executionContexts.get(server);
        if (context) {
          const keyGuard = privateKeyGuard(args || {});
          if (!keyGuard.safe) {
            logger.warn('Tool call blocked by private key guard', { tool: canonicalToolName, requestedTool: toolName, reason: keyGuard.reason });
            throw new Error(keyGuard.reason || 'Potential private key detected');
          }

          const permission = checkToolPermissions(context, canonicalToolName);
          if (!permission.allowed) {
            logger.warn('Tool call blocked by permissions', { tool: canonicalToolName, requestedTool: toolName, reason: permission.reason });
            throw new Error(permission.reason || `Tool '${canonicalToolName}' is not allowed`);
          }

          const policy = await context.policyEngine.checkPermission(canonicalToolName, {
            toolName: canonicalToolName,
            args: isPlainObject(args) ? args : {},
            user: context.signer?.publicKey.toBase58() || context.session?.agentId || 'local-mcp-client',
          });
          if (!policy.allowed) {
            logger.warn('Tool call blocked by policy', { tool: canonicalToolName, requestedTool: toolName, reason: policy.reason });
            throw new Error(policy.reason || `Tool '${canonicalToolName}' is blocked by policy`);
          }
        }

        const result = await handler(args || {});
        logger.debug('Tool call completed', { tool: canonicalToolName, requestedTool: toolName });
        const hasExplicitOutputSchema = Boolean(withRegistrationStore(server).toolHasExplicitOutputSchema?.[canonicalToolName]);
        return toToolCallResult(result, hasExplicitOutputSchema);
      } catch (error) {
        logger.error('Tool call failed', { tool: canonicalToolName, requestedTool: toolName, error });
        throw error;
      }
    });
    
    registry.tools = true;
    logger.debug('JSON-RPC handlers registered for tools');
  }
  
  return tool;
}

/**
 * Resource registration helper
 * 
 * Registers a resource and ensures JSON-RPC handlers are set up for resources/list and resources/read
 */
export function registerResource(
  server: Server,
  uri: string,
  _schema: unknown,
  definition: {
    name: string;
    description?: string;
    mimeType?: string;
  },
  handler: ResourceHandler
) {
  logger.debug('Registering resource', { uri });
  const store = withRegistrationStore(server);
  
  const resource: Resource = {
    uri,
    name: definition.name,
    description: definition.description,
    mimeType: definition.mimeType,
  };
  
  // Initialize server storage
  store.resourceHandlers = store.resourceHandlers || {};
  store.resources = store.resources || [];
  
  // Store handler and resource definition
  store.resourceHandlers[uri] = handler;
  store.resources.push(resource);
  
  // Register JSON-RPC handlers if not already done
  const registry = ensureHandlerRegistry(server);
  if (!registry.resources) {
    // Register resources/list handler
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = withRegistrationStore(server).resources || [];
      logger.debug('Handling resources/list', { count: resources.length });
      return { resources };
    });
    
    // Register resources/read handler
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri: resourceUri } = request.params;
      logger.debug('Handling resources/read', { uri: resourceUri });
      
      const handlers = withRegistrationStore(server).resourceHandlers || {};
      const handler = handlers[resourceUri];
      
      if (!handler) {
        logger.error('Resource not found', { uri: resourceUri });
        throw new Error(`Resource not found: ${resourceUri}`);
      }
      
      try {
        const result = await handler();
        logger.debug('Resource read completed', { uri: resourceUri });
        return toResourceReadResult(result, resourceUri, 'application/json');
      } catch (error) {
        logger.error('Resource read failed', { uri: resourceUri, error });
        throw error;
      }
    });
    
    registry.resources = true;
    logger.debug('JSON-RPC handlers registered for resources');
  }
  
  return resource;
}

/**
 * Resource template registration helper
 * 
 * Registers a resource template and ensures JSON-RPC handlers are set up
 */
export function registerResourceTemplate(
  server: Server,
  uriTemplate: string,
  _schema: unknown,
  definition: {
    name: string;
    description?: string;
    mimeType?: string;
  },
  handler: ResourceTemplateHandler
) {
  logger.debug('Registering resource template', { uriTemplate });
  const store = withRegistrationStore(server);
  
  const template: ResourceTemplate = {
    uriTemplate,
    name: definition.name,
    description: definition.description,
    mimeType: definition.mimeType,
  };
  
  // Initialize server storage
  store.resourceTemplateHandlers = store.resourceTemplateHandlers || {};
  store.resourceTemplates = store.resourceTemplates || [];
  
  // Store handler and template definition
  store.resourceTemplateHandlers[uriTemplate] = handler;
  store.resourceTemplates.push(template);
  
  // Register JSON-RPC handlers if not already done
  const registry = ensureHandlerRegistry(server);
  if (!registry.resources) {
    // Register resources/templates/list handler
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      const templates = withRegistrationStore(server).resourceTemplates || [];
      logger.debug('Handling resources/templates/list', { count: templates.length });
      return { resourceTemplates: templates };
    });
    
    // Register resources/list handler (includes templated resources)
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = withRegistrationStore(server).resources || [];
      const templates = withRegistrationStore(server).resourceTemplates || [];
      logger.debug('Handling resources/list (with templates)', { resources: resources.length, templates: templates.length });
      return { resources, resourceTemplates: templates };
    });
    
    // Register resources/read handler (supports templated URIs)
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri: resourceUri } = request.params;
      logger.debug('Handling resources/read', { uri: resourceUri });
      
      // Try exact resource match first
      const resourceHandlers = withRegistrationStore(server).resourceHandlers || {};
      const exactHandler = resourceHandlers[resourceUri];
      
      if (exactHandler) {
        try {
          const result = await exactHandler();
          return toResourceReadResult(result, resourceUri, 'application/json');
        } catch (error) {
          logger.error('Resource read failed', { uri: resourceUri, error });
          throw error;
        }
      }
      
      // Try template match
      const templateHandlers = withRegistrationStore(server).resourceTemplateHandlers || {};
      const templates = withRegistrationStore(server).resourceTemplates || [];
      
      for (const tmpl of templates) {
        const handler = templateHandlers[tmpl.uriTemplate];
        if (!handler) continue;
        
        // Simple template matching: sap://memory/{agent} matches sap://memory/abc123
        const pattern = tmpl.uriTemplate.replace(/\{[^}]+\}/g, '([^/]+)');
        const regex = new RegExp(`^${pattern}$`);
        const match = resourceUri.match(regex);
        
        if (match) {
          // Extract template arguments from URI
          const argNames = tmpl.uriTemplate.match(/\{([^}]+)\}/g)?.map((s: string) => s.slice(1, -1)) || [];
          const args: Record<string, string> = {};
          match.slice(1).forEach((value, i) => {
            if (argNames[i]) {
              args[argNames[i]] = value;
            }
          });
          
          try {
            const result = await handler(resourceUri, args);
            return toResourceReadResult(result, resourceUri, tmpl.mimeType || 'application/json');
          } catch (error) {
            logger.error('Template resource read failed', { uri: resourceUri, template: tmpl.uriTemplate, error });
            throw error;
          }
        }
      }
      
      logger.error('Resource not found', { uri: resourceUri });
      throw new Error(`Resource not found: ${resourceUri}`);
    });
    
    registry.resources = true;
    logger.debug('JSON-RPC handlers registered for resource templates');
  }
  
  return template;
}

/**
 * Prompt registration helper
 * 
 * Registers a prompt and ensures JSON-RPC handlers are set up for prompts/list and prompts/get
 */
export function registerPrompt(
  server: Server,
  name: string,
  _schema: unknown,
  definition: {
    description: string;
    arguments?: Array<{
      name: string;
      description: string;
      required?: boolean;
    }>;
  },
  handler: PromptHandler
) {
  logger.debug('Registering prompt', { name });
  const store = withRegistrationStore(server);
  
  const prompt: Prompt = {
    name,
    description: definition.description,
    arguments: definition.arguments,
  };
  
  // Initialize server storage
  store.promptHandlers = store.promptHandlers || {};
  store.prompts = store.prompts || [];
  
  // Store handler and prompt definition
  store.promptHandlers[name] = handler;
  store.prompts.push(prompt);
  
  // Register JSON-RPC handlers if not already done
  const registry = ensureHandlerRegistry(server);
  if (!registry.prompts) {
    // Register prompts/list handler
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const prompts = withRegistrationStore(server).prompts || [];
      logger.debug('Handling prompts/list', { count: prompts.length });
      return { prompts };
    });
    
    // Register prompts/get handler
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name: promptName, arguments: args } = request.params;
      logger.debug('Handling prompts/get', { prompt: promptName, args });
      
      const handlers = withRegistrationStore(server).promptHandlers || {};
      const handler = handlers[promptName];
      
      if (!handler) {
        logger.error('Prompt not found', { prompt: promptName });
        throw new Error(`Prompt not found: ${promptName}`);
      }
      
      try {
        const result = await handler(args || {});
        logger.debug('Prompt get completed', { prompt: promptName });
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
              },
            },
          ],
        };
      } catch (error) {
        logger.error('Prompt get failed', { prompt: promptName, error });
        throw error;
      }
    });
    
    registry.prompts = true;
    logger.debug('JSON-RPC handlers registered for prompts');
  }
  
  return prompt;
}

/**
 * Get registered tools
 */
export function getRegisteredTools(server: Server): Tool[] {
  return withRegistrationStore(server).tools || [];
}

/**
 * Get registered resources
 */
export function getRegisteredResources(server: Server): Resource[] {
  return withRegistrationStore(server).resources || [];
}

/**
 * Get registered resource templates
 */
export function getRegisteredResourceTemplates(server: Server): ResourceTemplate[] {
  return withRegistrationStore(server).resourceTemplates || [];
}

/**
 * Get registered prompts
 */
export function getRegisteredPrompts(server: Server): Prompt[] {
  return withRegistrationStore(server).prompts || [];
}

/**
 * Get handler registration status
 */
export function getHandlerStatus(server: Server): {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
} {
  const registry = handlerRegistry.get(server);
  return registry || { tools: false, resources: false, prompts: false };
}
