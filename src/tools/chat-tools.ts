/**
 * @module chat-tools
 * @description MCP tools for SAP on-chain chat rooms backed by SAP session ledgers.
 */

import { createHash } from 'crypto';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import type { RingBufferEntry, SessionContext, WriteResult } from '@oobe-protocol-labs/synapse-sap-sdk/registries/session';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import type { SapMcpContext } from '../core/types.js';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue>;
type ChatRoomKind = 'dm' | 'group' | 'room';
type ChatVisibility = 'public' | 'private';
type ChatPayloadEncoding = 'utf8' | 'base64' | 'ciphertext';
type ChatLinkKind = 'reference' | 'source' | 'attachment' | 'market' | 'execution';
type ChatEnvelopeType = 'message' | 'room_manifest';

interface ChatChunkInfo {
  index: number;
  total: number;
  payloadHash: string;
}

interface ChatEnvelope {
  v: 1;
  protocol: 'sap.chat';
  type: ChatEnvelopeType;
  roomId: string;
  roomKind: ChatRoomKind;
  sessionId: string;
  messageId: string;
  senderAgent: string;
  senderWallet: string;
  createdAt: string;
  visibility: ChatVisibility;
  contentType: string;
  payloadEncoding: ChatPayloadEncoding;
  chunk: ChatChunkInfo;
  body: string;
  replyTo?: string;
  participants?: string[];
  metadata?: JsonRecord;
}

interface ParsedChatMessage {
  type: ChatEnvelopeType;
  roomId: string;
  roomKind: ChatRoomKind;
  sessionId: string;
  messageId: string;
  senderAgent: string;
  senderWallet: string;
  createdAt: string;
  visibility: ChatVisibility;
  contentType: string;
  payloadEncoding: ChatPayloadEncoding;
  payloadHash: string;
  complete: boolean;
  chunksReceived: number;
  totalChunks: number;
  text?: string;
  payloadBase64?: string;
  replyTo?: string;
  participants?: string[];
  metadata?: JsonRecord;
}

interface ChatRoomDescriptor {
  roomId: string;
  roomKind: ChatRoomKind;
  sessionId: string;
  participants: string[];
  topic?: string;
}

interface ChatLinkReference {
  kind: ChatLinkKind;
  url: string;
  label?: string;
  sha256?: string;
}

const CHAT_PROTOCOL_PREFIX = 'sap-chat:v1';
const MAX_WIRE_BYTES = 700;
const DEFAULT_CHUNK_BYTES = 420;

/**
 * @name registerChatTools
 * @description Registers SAP chat tools backed by the SDK SessionManager and memory ledger.
 * @param server - MCP server receiving tool definitions.
 * @param context - Runtime context with SAP client and policy engine.
 */
export function registerChatTools(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_chat_derive_room',
    {
      description: 'Derive a deterministic SAP chat room/session ID. Group and public room IDs are active; DM derivation is reserved for future native support.',
      inputSchema: chatRoomInputSchema(),
    },
    async (input) => ok({
      room: deriveRoomDescriptor(asRecord(input), context.sapClient),
    }),
  );

  registerTool(
    server,
    'sap_chat_start_room',
    {
      description: 'Start an on-chain SAP chat room by creating the backing vault, session, and ledger if needed.',
      inputSchema: chatRoomInputSchema(),
    },
    async (input) => {
      const room = deriveRoomDescriptor(asRecord(input), context.sapClient);
      assertGroupChatEnabled(room);
      const session = await context.sapClient.session.start(room.sessionId);
      return ok({ room, session: serializeSessionContext(session) });
    },
  );

  registerTool(
    server,
    'sap_chat_send_message',
    {
      description: 'Send a chunked SAP chat message to a room. Public messages store UTF-8 text; private messages store caller-provided ciphertext bytes.',
      inputSchema: {
        ...chatRoomInputSchema(),
        content: { type: 'string', description: 'Plain UTF-8 message content for public messages.' },
        payloadBase64: { type: 'string', description: 'Base64 payload. Required for private/ciphertext messages.' },
        visibility: { type: 'string', enum: ['public', 'private'], description: 'Message visibility. Defaults to public.' },
        contentType: { type: 'string', description: 'MIME content type. Defaults to text/plain for public messages.' },
        replyTo: { type: 'string', description: 'Optional parent message ID.' },
        topic: { type: 'string', description: 'Required thematic group topic when deriving or writing to topic-scoped groups.' },
        policy: { type: 'object', description: 'Optional compact group policy reference or policy hash. Full policy bodies should live off-chain and be linked by hash.' },
        links: { type: 'array', items: { type: 'object' }, description: 'Optional signed link references. Each link must include url and may include kind, label, sha256.' },
        metadata: { type: 'object', description: 'Optional JSON metadata. Keep small; large metadata should be stored off-chain and hashed.' },
      },
    },
    async (input) => {
      const record = asRecord(input);
      const room = deriveRoomDescriptor(record, context.sapClient);
      assertGroupChatEnabled(room);
      const session = await context.sapClient.session.start(room.sessionId);
      const envelopes = buildMessageEnvelopes(record, room, session);
      const signedWriteProofs: WriteResult[] = [];

      for (const envelope of envelopes) {
        signedWriteProofs.push(await context.sapClient.session.write(session, JSON.stringify(envelope)));
      }

      return ok({
        room,
        message: summarizeEnvelopeSet(envelopes),
        signedWriteProofs,
      });
    },
  );

  registerTool(
    server,
    'sap_chat_publish_manifest',
    {
      description: 'Publish a signed thematic room/group manifest for discovery indexers, policy-aware agents, and chat clients.',
      inputSchema: {
        ...chatRoomInputSchema(),
        description: { type: 'string', description: 'Short public room/group description.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Small topic tags used by discovery, for example openbook, markets, sol-usdc.' },
        policy: { type: 'object', description: 'Compact group policy or content-addressed policy reference.' },
        links: { type: 'array', items: { type: 'object' }, description: 'Optional signed room links for docs, market references, IPFS manifests, or execution receipts.' },
        metadata: { type: 'object', description: 'Optional compact manifest metadata.' },
      },
    },
    async (input) => {
      const record = asRecord(input);
      const room = deriveRoomDescriptor(record, context.sapClient);
      assertGroupChatEnabled(room);
      const session = await context.sapClient.session.start(room.sessionId);
      const manifest = buildRoomManifestEnvelopes(record, room, session);
      const signedWriteProofs: WriteResult[] = [];

      for (const envelope of manifest) {
        signedWriteProofs.push(await context.sapClient.session.write(session, JSON.stringify(envelope)));
      }

      return ok({
        room,
        manifest: summarizeEnvelopeSet(manifest),
        signedWriteProofs,
      });
    },
  );

  registerTool(
    server,
    'sap_chat_read_latest',
    {
      description: 'Read latest SAP chat messages from the room ring buffer.',
      inputSchema: chatRoomInputSchema(),
    },
    async (input) => {
      const room = deriveRoomDescriptor(asRecord(input), context.sapClient);
      assertGroupChatEnabled(room);
      const session = context.sapClient.session.deriveContext(room.sessionId);
      const entries = await context.sapClient.session.readLatest(session);
      return ok({ room, messages: decodeChatMessages(entries) });
    },
  );

  registerTool(
    server,
    'sap_chat_read_all',
    {
      description: 'Read all SAP chat messages from sealed ledger pages plus the latest ring buffer.',
      inputSchema: chatRoomInputSchema(),
    },
    async (input) => {
      const room = deriveRoomDescriptor(asRecord(input), context.sapClient);
      assertGroupChatEnabled(room);
      const session = context.sapClient.session.deriveContext(room.sessionId);
      const entries = await context.sapClient.session.readAll(session);
      return ok({ room, messages: decodeChatMessages(entries) });
    },
  );

  registerTool(
    server,
    'sap_chat_status',
    {
      description: 'Get backing SAP memory session status for a chat room.',
      inputSchema: chatRoomInputSchema(),
    },
    async (input) => {
      const room = deriveRoomDescriptor(asRecord(input), context.sapClient);
      assertGroupChatEnabled(room);
      const session = context.sapClient.session.deriveContext(room.sessionId);
      return ok({ room, status: await context.sapClient.session.getStatus(session) });
    },
  );

  registerTool(
    server,
    'sap_chat_seal_room',
    {
      description: 'Seal the current chat ring buffer into an immutable SAP ledger page for permanent history.',
      inputSchema: chatRoomInputSchema(),
    },
    async (input) => {
      const room = deriveRoomDescriptor(asRecord(input), context.sapClient);
      assertGroupChatEnabled(room);
      const session = context.sapClient.session.deriveContext(room.sessionId);
      return ok({ room, seal: await context.sapClient.session.seal(session) });
    },
  );
}

/**
 * @name chatRoomInputSchema
 * @description Builds the shared JSON schema for chat room selection.
 * @returns JSON-schema-like MCP input properties.
 */
function chatRoomInputSchema(): Record<string, JsonValue> {
  return {
    roomKind: { type: 'string', enum: ['dm', 'group', 'room'], description: 'Chat room kind: dm, group, or room.' },
    roomId: { type: 'string', description: 'Optional explicit room ID. If omitted, one is derived deterministically.' },
    roomName: { type: 'string', description: 'Human-readable room name for public thematic rooms.' },
    topic: { type: 'string', description: 'Thematic topic, for example openbook:sol-usdc:market-makers or sap:registry:discovery.' },
    participants: { type: 'array', items: { type: 'string' }, description: 'Participant agent/wallet identifiers for DM or group rooms.' },
  };
}

/**
 * @name deriveRoomDescriptor
 * @description Derives a stable SAP chat room descriptor from tool input and signer identity.
 */
function deriveRoomDescriptor(input: JsonRecord, client: SapClient): ChatRoomDescriptor {
  const roomKind = readRoomKind(input);
  const sender = senderIdentity(client);
  const participants = normalizeParticipants(input.participants, sender.wallet);
  const explicitRoomId = readOptionalString(input, 'roomId');
  const roomName = readOptionalString(input, 'roomName');
  const topic = readOptionalString(input, 'topic') ?? readOptionalString(readOptionalRecord(input, 'metadata') ?? {}, 'topic');

  if (roomKind === 'dm' && participants.length !== 2) {
    throw new Error('dm rooms require exactly two unique participants including the signer wallet');
  }

  if (roomKind === 'group' && participants.length < 2) {
    throw new Error('group rooms require at least two unique participants');
  }

  if (roomKind === 'room' && !explicitRoomId && !roomName) {
    throw new Error('roomName or roomId is required for public rooms');
  }

  const seed = explicitRoomId ?? (
    roomKind === 'room'
      ? `room:${roomName}`
      : `${roomKind}:${topic ?? 'general'}:${participants.join(',')}`
  );
  const roomId = stableId(seed);

  return {
    roomId,
    roomKind,
    sessionId: `${CHAT_PROTOCOL_PREFIX}:${roomKind}:${roomId}`,
    participants,
    ...(topic ? { topic } : {}),
  };
}

/**
 * @name buildMessageEnvelopes
 * @description Builds one or more wire-safe chat envelopes from a message payload.
 */
function buildMessageEnvelopes(
  input: JsonRecord,
  room: ChatRoomDescriptor,
  session: SessionContext,
): ChatEnvelope[] {
  const visibility = readVisibility(input);
  const contentType = readOptionalString(input, 'contentType') ?? (visibility === 'private' ? 'application/octet-stream' : 'text/plain');
  const replyTo = readOptionalString(input, 'replyTo');
  const metadata = buildMessageMetadata(input, room);
  const payloadEncoding: ChatPayloadEncoding = visibility === 'private'
    ? 'ciphertext'
    : input.payloadBase64 ? 'base64' : 'utf8';
  const payload = readPayload(input, visibility);
  const payloadHash = sha256Hex(payload);
  const createdAt = new Date().toISOString();
  const messageId = stableId(`${room.sessionId}:${session.wallet.toBase58()}:${createdAt}:${payloadHash}`);
  const sender = senderIdentityFromContext(session);
  const chunks = chunkBytes(payload, DEFAULT_CHUNK_BYTES);

  return chunks.map((chunk, index) => {
    const envelope: ChatEnvelope = {
      v: 1,
      protocol: 'sap.chat',
      type: 'message',
      roomId: room.roomId,
      roomKind: room.roomKind,
      sessionId: room.sessionId,
      messageId,
      senderAgent: sender.agent,
      senderWallet: sender.wallet,
      createdAt,
      visibility,
      contentType,
      payloadEncoding,
      chunk: {
        index,
        total: chunks.length,
        payloadHash,
      },
      body: Buffer.from(chunk).toString('base64'),
      ...(replyTo ? { replyTo } : {}),
      ...(room.participants.length > 0 ? { participants: room.participants } : {}),
      ...(metadata ? { metadata } : {}),
    };

    const byteLength = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
    if (byteLength > MAX_WIRE_BYTES) {
      throw new Error(`Chat envelope is ${byteLength} bytes; reduce content or metadata to stay below ${MAX_WIRE_BYTES} bytes`);
    }

    return envelope;
  });
}

/**
 * @name buildRoomManifestEnvelopes
 * @description Builds a signed room manifest payload for discovery and group policy indexing.
 */
function buildRoomManifestEnvelopes(
  input: JsonRecord,
  room: ChatRoomDescriptor,
  session: SessionContext,
): ChatEnvelope[] {
  const description = readOptionalString(input, 'description') ?? '';
  const tags = readTags(input.tags);
  const topic = readOptionalString(input, 'topic') ?? room.topic ?? 'general';
  const policy = readOptionalRecord(input, 'policy') ?? readOptionalRecord(readOptionalRecord(input, 'metadata') ?? {}, 'policy');
  const links = readLinks(input.links ?? readOptionalRecord(input, 'metadata')?.links);
  const manifest: JsonRecord = {
    kind: 'sap.chat.room_manifest',
    topic,
    description,
    tags,
    participants: room.participants,
    discovery: {
      scope: 'public-index',
      key: `${topic}:${room.roomId}`,
    },
    ...(policy ? { policy } : {}),
    ...(links.length > 0 ? { links: linksToJson(links) } : {}),
  };
  const payload = Buffer.from(JSON.stringify(manifest), 'utf8');
  const payloadHash = sha256Hex(payload);
  const createdAt = new Date().toISOString();
  const sender = senderIdentityFromContext(session);
  const chunks = chunkBytes(payload, DEFAULT_CHUNK_BYTES);
  const messageId = stableId(`${room.sessionId}:manifest:${sender.wallet}:${createdAt}:${payloadHash}`);

  return chunks.map((chunk, index) => {
    const envelope: ChatEnvelope = {
      v: 1,
      protocol: 'sap.chat',
      type: 'room_manifest',
      roomId: room.roomId,
      roomKind: room.roomKind,
      sessionId: room.sessionId,
      messageId,
      senderAgent: sender.agent,
      senderWallet: sender.wallet,
      createdAt,
      visibility: 'public',
      contentType: 'application/sap-chat-manifest+json',
      payloadEncoding: 'utf8',
      chunk: {
        index,
        total: chunks.length,
        payloadHash,
      },
      body: Buffer.from(chunk).toString('base64'),
      ...(room.participants.length > 0 ? { participants: room.participants } : {}),
      metadata: {
        topic,
        tags,
        discoveryKey: `${topic}:${room.roomId}`,
        ...(policy ? { policy } : {}),
        ...(links.length > 0 ? { links: linksToJson(links) } : {}),
      },
    };

    const byteLength = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
    if (byteLength > MAX_WIRE_BYTES) {
      throw new Error(`Chat manifest envelope is ${byteLength} bytes; reduce description, tags, links, or policy metadata to stay below ${MAX_WIRE_BYTES} bytes`);
    }

    return envelope;
  });
}

/**
 * @name assertGroupChatEnabled
 * @description Prevents operational DM usage while preserving DM derivation for future native support.
 */
function assertGroupChatEnabled(room: ChatRoomDescriptor): void {
  if (room.roomKind === 'dm') {
    throw new Error('Direct messages are reserved for future native support. SAP MCP currently enables signed thematic group and public room chat only.');
  }
}

/**
 * @name buildMessageMetadata
 * @description Merges compact policy, topic, and signed link metadata into a wire-safe JSON record.
 */
function buildMessageMetadata(input: JsonRecord, room: ChatRoomDescriptor): JsonRecord | undefined {
  const base = readOptionalRecord(input, 'metadata') ?? {};
  const topic = readOptionalString(input, 'topic') ?? room.topic ?? readOptionalString(base, 'topic');
  const policy = readOptionalRecord(input, 'policy') ?? readOptionalRecord(base, 'policy');
  const links = readLinks(input.links ?? base.links);
  const next: JsonRecord = { ...base };

  if (topic) {
    next.topic = topic;
  }
  if (policy) {
    next.policy = policy;
  }
  if (links.length > 0) {
    next.links = linksToJson(links);
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * @name decodeChatMessages
 * @description Decodes ledger entries into assembled chat messages.
 */
function decodeChatMessages(entries: RingBufferEntry[]): ParsedChatMessage[] {
  const envelopes = entries
    .map((entry) => parseEnvelope(entry.text))
    .filter((envelope): envelope is ChatEnvelope => envelope !== null);
  const byMessage = new Map<string, ChatEnvelope[]>();

  for (const envelope of envelopes) {
    const group = byMessage.get(envelope.messageId) ?? [];
    group.push(envelope);
    byMessage.set(envelope.messageId, group);
  }

  return Array.from(byMessage.values())
    .map(assembleMessage)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/**
 * @name assembleMessage
 * @description Reassembles chunked envelopes into a single chat message result.
 */
function assembleMessage(envelopes: ChatEnvelope[]): ParsedChatMessage {
  const ordered = [...envelopes].sort((left, right) => left.chunk.index - right.chunk.index);
  const first = ordered[0];
  if (!first) {
    throw new Error('Cannot assemble an empty envelope set');
  }

  const payload = Buffer.concat(ordered.map((envelope) => Buffer.from(envelope.body, 'base64')));
  const complete = ordered.length === first.chunk.total && sha256Hex(payload) === first.chunk.payloadHash;
  const base: ParsedChatMessage = {
    type: first.type,
    roomId: first.roomId,
    roomKind: first.roomKind,
    sessionId: first.sessionId,
    messageId: first.messageId,
    senderAgent: first.senderAgent,
    senderWallet: first.senderWallet,
    createdAt: first.createdAt,
    visibility: first.visibility,
    contentType: first.contentType,
    payloadEncoding: first.payloadEncoding,
    payloadHash: first.chunk.payloadHash,
    complete,
    chunksReceived: ordered.length,
    totalChunks: first.chunk.total,
    ...(first.replyTo ? { replyTo: first.replyTo } : {}),
    ...(first.participants ? { participants: first.participants } : {}),
    ...(first.metadata ? { metadata: first.metadata } : {}),
  };

  if (first.visibility === 'public' && first.payloadEncoding === 'utf8') {
    return { ...base, text: payload.toString('utf8') };
  }

  return { ...base, payloadBase64: payload.toString('base64') };
}

/**
 * @name parseEnvelope
 * @description Parses one ledger text entry as a SAP chat envelope.
 */
function parseEnvelope(text: string): ChatEnvelope | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isChatEnvelope(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @name isChatEnvelope
 * @description Validates the stable fields required to reassemble a SAP chat envelope.
 */
function isChatEnvelope(value: unknown): value is ChatEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  const chunk = value.chunk;
  return value.v === 1
    && value.protocol === 'sap.chat'
    && (value.type === 'message' || value.type === 'room_manifest')
    && isRoomKind(value.roomKind)
    && isVisibility(value.visibility)
    && isPayloadEncoding(value.payloadEncoding)
    && typeof value.roomId === 'string'
    && typeof value.sessionId === 'string'
    && typeof value.messageId === 'string'
    && typeof value.senderAgent === 'string'
    && typeof value.senderWallet === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.contentType === 'string'
    && typeof value.body === 'string'
    && isRecord(chunk)
    && typeof chunk.index === 'number'
    && Number.isInteger(chunk.index)
    && chunk.index >= 0
    && typeof chunk.total === 'number'
    && Number.isInteger(chunk.total)
    && chunk.total > 0
    && typeof chunk.payloadHash === 'string'
    && (value.replyTo === undefined || typeof value.replyTo === 'string')
    && (value.participants === undefined || isStringArray(value.participants))
    && (value.metadata === undefined || isRecord(value.metadata));
}

/**
 * @name readPayload
 * @description Reads public UTF-8 content or private base64 ciphertext from tool input.
 */
function readPayload(input: JsonRecord, visibility: ChatVisibility): Buffer {
  const payloadBase64 = readOptionalString(input, 'payloadBase64');
  if (payloadBase64) {
    return Buffer.from(payloadBase64, 'base64');
  }

  if (visibility === 'private') {
    throw new Error('private chat messages require payloadBase64 containing ciphertext');
  }

  const content = readRequiredString(input, 'content');
  return Buffer.from(content, 'utf8');
}

/**
 * @name summarizeEnvelopeSet
 * @description Builds a compact message summary after on-chain writes.
 */
function summarizeEnvelopeSet(envelopes: ChatEnvelope[]): Omit<ParsedChatMessage, 'complete' | 'chunksReceived'> {
  const first = envelopes[0];
  if (!first) {
    throw new Error('No chat envelopes were created');
  }

  return {
    roomId: first.roomId,
    type: first.type,
    roomKind: first.roomKind,
    sessionId: first.sessionId,
    messageId: first.messageId,
    senderAgent: first.senderAgent,
    senderWallet: first.senderWallet,
    createdAt: first.createdAt,
    visibility: first.visibility,
    contentType: first.contentType,
    payloadEncoding: first.payloadEncoding,
    payloadHash: first.chunk.payloadHash,
    totalChunks: first.chunk.total,
    ...(first.replyTo ? { replyTo: first.replyTo } : {}),
    ...(first.participants ? { participants: first.participants } : {}),
    ...(first.metadata ? { metadata: first.metadata } : {}),
  };
}

/**
 * @name serializeSessionContext
 * @description Converts SDK session context PublicKeys into JSON-safe strings.
 */
function serializeSessionContext(session: SessionContext): JsonRecord {
  return {
    sessionId: session.sessionId,
    sessionHash: Buffer.from(session.sessionHash).toString('hex'),
    agentPda: session.agentPda.toBase58(),
    vaultPda: session.vaultPda.toBase58(),
    sessionPda: session.sessionPda.toBase58(),
    ledgerPda: session.ledgerPda.toBase58(),
    wallet: session.wallet.toBase58(),
  };
}

/**
 * @name senderIdentity
 * @description Derives sender wallet and agent identity from a SAP client.
 */
function senderIdentity(client: SapClient): { wallet: string; agent: string } {
  const ctx = client.session.deriveContext(`${CHAT_PROTOCOL_PREFIX}:identity`);
  return senderIdentityFromContext(ctx);
}

/**
 * @name senderIdentityFromContext
 * @description Reads signer wallet and agent PDA from a session context.
 */
function senderIdentityFromContext(ctx: SessionContext): { wallet: string; agent: string } {
  return {
    wallet: ctx.wallet.toBase58(),
    agent: ctx.agentPda.toBase58(),
  };
}

/**
 * @name normalizeParticipants
 * @description Builds a sorted unique participant list and always includes the signer wallet.
 */
function normalizeParticipants(value: JsonValue | undefined, signerWallet: string): string[] {
  const input = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
  return Array.from(new Set([...input, signerWallet].filter(Boolean))).sort();
}

/**
 * @name chunkBytes
 * @description Splits payload bytes into deterministic chunks.
 */
function chunkBytes(bytes: Buffer, chunkSize: number): Buffer[] {
  if (bytes.length === 0) {
    return [Buffer.alloc(0)];
  }

  const chunks: Buffer[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, offset + chunkSize));
  }
  return chunks;
}

/**
 * @name stableId
 * @description Builds a stable short identifier from arbitrary text.
 */
function stableId(value: string): string {
  return sha256Hex(Buffer.from(value, 'utf8')).slice(0, 32);
}

/**
 * @name sha256Hex
 * @description Computes SHA-256 as lowercase hex.
 */
function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * @name ok
 * @description Wraps a JSON payload in the MCP text response shape.
 */
function ok(payload: JsonRecord | Record<string, unknown>) {
  return createTextResponse(JSON.stringify({ success: true, ...payload }, null, 2));
}

/**
 * @name asRecord
 * @description Normalizes unknown MCP input into a JSON record.
 */
function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value as JsonRecord : {};
}

/**
 * @name isRecord
 * @description Checks whether a value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @name readRoomKind
 * @description Reads and validates the chat room kind.
 */
function readRoomKind(input: JsonRecord): ChatRoomKind {
  const value = input.roomKind;
  if (isRoomKind(value)) {
    return value;
  }
  return 'room';
}

/**
 * @name readVisibility
 * @description Reads and validates chat visibility.
 */
function readVisibility(input: JsonRecord): ChatVisibility {
  return input.visibility === 'private' ? 'private' : 'public';
}

/**
 * @name isRoomKind
 * @description Checks whether a value is a supported chat room kind.
 */
function isRoomKind(value: unknown): value is ChatRoomKind {
  return value === 'dm' || value === 'group' || value === 'room';
}

/**
 * @name isVisibility
 * @description Checks whether a value is a supported chat visibility.
 */
function isVisibility(value: unknown): value is ChatVisibility {
  return value === 'public' || value === 'private';
}

/**
 * @name isPayloadEncoding
 * @description Checks whether a value is a supported chat payload encoding.
 */
function isPayloadEncoding(value: unknown): value is ChatPayloadEncoding {
  return value === 'utf8' || value === 'base64' || value === 'ciphertext';
}

/**
 * @name isStringArray
 * @description Checks whether a value is an array of strings.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * @name readRequiredString
 * @description Reads a required string field from a JSON record.
 */
function readRequiredString(input: JsonRecord, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

/**
 * @name readOptionalString
 * @description Reads an optional string field from a JSON record.
 */
function readOptionalString(input: JsonRecord, field: string): string | undefined {
  const value = input[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * @name readOptionalRecord
 * @description Reads an optional JSON object field.
 */
function readOptionalRecord(input: JsonRecord, field: string): JsonRecord | undefined {
  const value = input[field];
  return isRecord(value) ? value as JsonRecord : undefined;
}

/**
 * @name readLinks
 * @description Reads and validates signed link references included in a group message.
 */
function readLinks(value: JsonValue | undefined): ChatLinkReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    if (!isRecord(item) || typeof item.url !== 'string') {
      throw new Error('Each chat link must be an object with a url string');
    }
    const url = new URL(item.url);
    if (url.protocol !== 'https:' && url.protocol !== 'ipfs:' && url.protocol !== 'ar:') {
      throw new Error('Chat links must use https://, ipfs://, or ar:// URLs');
    }
    const kind = readLinkKind(item.kind);
    const label = typeof item.label === 'string' && item.label.length > 0 ? item.label : undefined;
    const sha256 = typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(item.sha256) ? item.sha256.toLowerCase() : undefined;

    return {
      kind,
      url: item.url,
      ...(label ? { label } : {}),
      ...(sha256 ? { sha256 } : {}),
    };
  });
}

/**
 * @name linksToJson
 * @description Converts validated link references into JSON-safe metadata entries.
 */
function linksToJson(links: ChatLinkReference[]): JsonRecord[] {
  return links.map((link) => ({
    kind: link.kind,
    url: link.url,
    ...(link.label ? { label: link.label } : {}),
    ...(link.sha256 ? { sha256: link.sha256 } : {}),
  }));
}

/**
 * @name readTags
 * @description Reads compact lowercase discovery tags for thematic chat rooms.
 */
function readTags(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[a-z0-9][a-z0-9:_-]{0,47}$/.test(item))
    .slice(0, 12);
}

/**
 * @name readLinkKind
 * @description Reads a supported group message link reference kind.
 */
function readLinkKind(value: unknown): ChatLinkKind {
  if (value === 'source' || value === 'attachment' || value === 'market' || value === 'execution') {
    return value;
  }
  return 'reference';
}
