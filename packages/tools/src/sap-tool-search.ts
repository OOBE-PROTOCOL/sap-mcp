/**
 * @name tools/sap-tool-search
 * @description Tool search retriever for the 420+ SAP MCP tool catalog.
 *
 * Implements a lightweight BM25 search over tool names and descriptions,
 * returning top-K results with full input schemas so the agent can call
 * them via a dispatcher tool (sap_call_tool or similar).
 *
 * This dramatically reduces context usage: instead of binding 420+ tool
 * definitions (~170k tokens), the agent binds ~15 permanent tools + this
 * search tool, and discovers the rest on demand (~5k tokens per turn).
 *
 * @module tools/sap-tool-search
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { SapMcpContext } from '../../core/src/types.js';
import { logger } from '../../core/src/logger.js';
import { getRegisteredTools } from '../../mcp-adapter/src/sdk-compat.js';
import {
  registerToolFamilyPipelineTool,
  type ToolFamilyPipelineDefinition,
  type ToolFamilyPipelineHandlerResult,
} from './tool-family-pipeline.js';

/** Search result entry — tool name, description, and input schema. */
interface ToolSearchResult {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  score: number;
}

/** Cached search index for the session. */
interface ToolSearchIndex {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    tokens: string[];
  }>;
  avgDocLength: number;
  docCount: number;
  df: Map<string, number>;
}

let cachedIndex: ToolSearchIndex | null = null;

/**
 * Tokenize a string into lowercase terms for BM25 scoring.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Build a BM25 search index from all registered tools.
 */
function buildSearchIndex(tools: Tool[]): ToolSearchIndex {
  const docs = tools.map((tool) => {
    const text = `${tool.name} ${tool.description ?? ''}`;
    return {
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: (tool.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
      tokens: tokenize(text),
    };
  });

  const df = new Map<string, number>();
  for (const doc of docs) {
    const seen = new Set<string>();
    for (const token of doc.tokens) {
      if (!seen.has(token)) {
        df.set(token, (df.get(token) ?? 0) + 1);
        seen.add(token);
      }
    }
  }

  const avgDocLength = docs.length > 0
    ? docs.reduce((sum, d) => sum + d.tokens.length, 0) / docs.length
    : 0;

  return { tools: docs, avgDocLength, docCount: docs.length, df };
}

/**
 * Score a document against a query using BM25.
 */
function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  avgDocLength: number,
  docCount: number,
  df: Map<string, number>,
): number {
  const k1 = 1.5;
  const b = 0.75;
  const docFreq = new Map<string, number>();
  for (const token of docTokens) {
    docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
  }

  let score = 0;
  for (const qt of queryTokens) {
    const f = docFreq.get(qt) ?? 0;
    if (f === 0) continue;
    const n = df.get(qt) ?? 0;
    const idf = Math.log(1 + (docCount - n + 0.5) / (n + 0.5));
    score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (docTokens.length / avgDocLength))));
  }
  return score;
}

/**
 * Search the tool catalog and return top-K results.
 */
function searchTools(
  index: ToolSearchIndex,
  query: string,
  category: string | undefined,
  limit: number,
): ToolSearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const results: ToolSearchResult[] = [];
  for (const doc of index.tools) {
    if (category && !doc.name.toLowerCase().includes(category.toLowerCase())) continue;

    const score = bm25Score(queryTokens, doc.tokens, index.avgDocLength, index.docCount, index.df);
    if (score > 0) {
      results.push({
        name: doc.name,
        description: doc.description,
        inputSchema: doc.inputSchema,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Get or build the search index from the server's registered tools.
 */
function getSearchIndex(server: Server): ToolSearchIndex {
  if (cachedIndex) return cachedIndex;
  const tools = getRegisteredTools(server);
  cachedIndex = buildSearchIndex(tools);
  logger.debug('Tool search index built', { toolCount: cachedIndex.docCount });
  return cachedIndex;
}

interface ToolSearchPipelineDefinition extends ToolFamilyPipelineDefinition {
  readonly name: string;
  readonly execute: (input: { readonly input: unknown }) => Promise<ToolFamilyPipelineHandlerResult> | ToolFamilyPipelineHandlerResult;
}

/**
 * Register the sap_search_tools retriever tool.
 */
export function registerToolSearchTool(server: Server, context: SapMcpContext): void {
  const definition: ToolSearchPipelineDefinition = {
    name: 'sap_search_tools',
    description: 'Search the SAP MCP tool catalog (420+ tools) by keyword. Returns top-K matching tools with their name, description, and full input schema. Use this to discover tools before calling them via sap_call_tool. Categories: sap_phoenix_ (Phoenix perps), sap_adrena_ (Adrena perps), sap_perp_ (perps risk/signals), jupiter_ (swaps), spl_token_ (tokens), staking_ (staking), bridging_ (bridges), meteora_ (liquidity), magicblock_ (ephemeral rollups). Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query. Example: "get Phoenix market data" or "place limit order" or "bridge ETH to Solana".',
        },
        category: {
          type: 'string',
          description: 'Optional category filter (tool name prefix). Example: "sap_phoenix_", "sap_adrena_", "jupiter_", "spl_token_".',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default 10, max 25).',
          minimum: 1,
          maximum: 25,
        },
      },
      required: ['query'],
    },
    execute: async ({ input }) => {
      const raw = input as { query?: unknown; category?: unknown; limit?: unknown };
      const query = String(raw.query ?? '').trim();
      if (!query) {
        return { error: 'query is required. Provide a natural language search term.' } as Record<string, unknown>;
      }
      const category = raw.category ? String(raw.category).trim() : undefined;
      const limit = typeof raw.limit === 'number' ? Math.min(raw.limit, 25) : 10;

      const index = getSearchIndex(server);
      const results = searchTools(index, query, category, limit);

      return {
        query,
        totalMatches: results.length,
        tools: results.map((r) => ({
          name: r.name,
          description: r.description,
          inputSchema: r.inputSchema,
          score: Number(r.score.toFixed(4)),
        })),
        note: results.length === 0
          ? 'No tools matched. Try broader terms or different category prefix.'
          : `Call sap_call_tool with the tool name and args to execute. ${results.length} tools matched.`,
      } as Record<string, unknown>;
    },
  };

  const { name, execute, ...toolDefinition } = definition;
  registerToolFamilyPipelineTool(server, context, name, toolDefinition, async (input) => execute({ input }));
  logger.debug('sap_search_tools retriever registered');
}