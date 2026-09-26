/**
 * @name tools/web-search/web-search-tools
 * @description Registers the general-purpose `web_search` and `web_extract` tools.
 *
 * These are hosted-safe reads: they touch no wallet, key material, session
 * token, payment lane, or signer surface. Both are priced as premium reads, so
 * a hosted operator can sponsor them for its own agents while external callers
 * settle the x402 challenge. Content is always returned as `ResearchEvidence`
 * with explicit provenance, never as a boolean "trusted" flag: an allowlisted
 * domain proves origin, not truth, and provenance never authorizes an action.
 *
 * @module tools/web-search
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import type { SapMcpContext } from '../../../core/src/types.js';
import { registerToolFamilyPipelineTool, createToolFamilyPipelineResult } from '../tool-family-pipeline.js';
import {
  WEB_EXTRACT_MAX_CHARS_LIMIT,
  WEB_EXTRACT_MAX_URLS,
  WEB_SEARCH_MAX_RESULTS_LIMIT,
  WEB_UNTRUSTED_NOTICE,
  extractUrls,
  searchWeb,
} from './web-search-client.js';

const WebSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(500).describe('Natural-language search query.'),
  sources: z.enum(['all', 'trusted']).optional()
    .describe("Use 'trusted' to restrict results to the operator allowlist (provenance=allowlisted); defaults to 'all'."),
  recency: z.enum(['any', 'day', 'week', 'month', 'year']).optional()
    .describe('Optional freshness window; omit or use "any" for no time filter.'),
  maxResults: z.number().int().min(1).max(WEB_SEARCH_MAX_RESULTS_LIMIT).optional()
    .describe(`Maximum number of results to return (1-${WEB_SEARCH_MAX_RESULTS_LIMIT}).`),
}).passthrough().describe('Web Search input schema.');

const WebExtractInputSchema = z.object({
  urls: z.array(z.string().trim().min(1)).min(1).max(WEB_EXTRACT_MAX_URLS)
    .describe(`Public URLs to fetch and flatten into text (1-${WEB_EXTRACT_MAX_URLS}).`),
  charLimit: z.number().int().min(200).max(WEB_EXTRACT_MAX_CHARS_LIMIT).optional()
    .describe(`Optional per-page character budget (max ${WEB_EXTRACT_MAX_CHARS_LIMIT}); the call also shares a total budget.`),
}).passthrough().describe('Web Extract input schema.');

const EvidenceSchema = {
  type: 'object',
  properties: {
    citationId: { type: 'string', description: 'Server-assigned citation id, e.g. "1". Quote sources by this id.' },
    title: { type: 'string', description: 'Result title.' },
    url: { type: 'string', description: 'Result URL.' },
    snippet: { type: 'string', description: 'Search-engine snippet.' },
    provenance: { type: 'string', enum: ['allowlisted', 'open-web'], description: 'Origin class. Allowlisted means the host is on the operator allowlist.' },
    authority: { type: 'string', enum: ['primary', 'secondary', 'unknown'], description: 'Source authority class; primary only for explicitly promoted domains.' },
    fetchedAt: { type: 'string', description: 'ISO timestamp of the fetch.' },
    publishedAt: { type: 'string', description: 'Publication date when the source exposes one.' },
    contentHash: { type: 'string', description: 'Stable hash of the served text, when available.' },
    truncated: { type: 'boolean', description: 'True when a character budget cut the content.' },
  },
  required: ['citationId', 'title', 'url', 'snippet', 'provenance', 'authority', 'fetchedAt', 'truncated'],
};

const ExtractPageSchema = {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'Final URL after safe redirects.' },
    title: { type: 'string', description: 'Page title when the document exposes one.' },
    content: { type: 'string', description: 'Flattened readable text, deterministically truncated.' },
    truncated: { type: 'boolean', description: 'True when the character budget cut the content.' },
    provenance: { type: 'string', enum: ['allowlisted', 'open-web'] },
    authority: { type: 'string', enum: ['primary', 'secondary', 'unknown'] },
    fetchedAt: { type: 'string' },
    contentHash: { type: 'string', description: 'Stable hash of the served document.' },
    bytesRead: { type: 'number', description: 'Decompressed bytes read, for provenance records.' },
    error: { type: 'string', description: 'Per-URL failure reason, when the page could not be read.' },
  },
  required: ['url', 'content', 'truncated', 'provenance', 'authority', 'fetchedAt'],
};

type WebSearchInput = z.infer<typeof WebSearchInputSchema>;
type WebExtractInput = z.infer<typeof WebExtractInputSchema>;

/**
 * @name registerWebSearchTools
 * @description Registers the `web_search` and `web_extract` pipeline tools.
 *
 * @param server  — The MCP `Server` instance to register capabilities on.
 * @param context — The SAP MCP runtime context shared by all tool handlers.
 */
export function registerWebSearchTools(server: Server, context: SapMcpContext): void {
  registerToolFamilyPipelineTool<WebSearchInput, Record<string, unknown>>(
    server,
    context,
    'web_search',
    {
      title: 'Web Search',
      description:
        'Search the public web through the self-hosted search backend and return ranked evidence with '
        + 'title, URL, snippet, publication date, a server-assigned citationId, and explicit provenance '
        + '(allowlisted | open-web) plus authority. Use it for current information, news, documentation, and '
        + 'facts that may be newer than model knowledge. Do not use it for Solana prices, on-chain state, '
        + 'wallet balances, or market data: those have dedicated tools. '
        + WEB_UNTRUSTED_NOTICE,
      inputSchema: WebSearchInputSchema,
      // Pipeline tools that declare neither an outputSchema nor a UI card fall
      // back to the adapter's generic { content } schema, which the client then
      // validates structuredContent against — and rejects with -32602. Declaring
      // the real payload shape is what keeps the call valid for strict clients.
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'False when the search backend could not be queried.' },
          query: { type: 'string', description: 'The query that was executed.' },
          backend: { type: 'string', description: 'Base URL of the search backend, or "unconfigured" when it is not wired.' },
          allowlistedDomainCount: { type: 'number', description: 'Number of domains on the operator allowlist.' },
          results: { type: 'array', description: 'Ranked evidence, most relevant first.', items: EvidenceSchema },
          notice: { type: 'string', description: 'Untrusted-content notice. Preserve it when quoting results.' },
          error: { type: 'string', description: 'Present only when the search could not be completed.' },
        },
        required: ['success', 'query', 'backend', 'allowlistedDomainCount', 'results', 'notice'],
      },
    },
    async (input) => {
      const response = await searchWeb({
        query: input.query,
        sources: input.sources,
        recency: input.recency,
        maxResults: input.maxResults,
      });
      return createToolFamilyPipelineResult(
        {
          success: response.error === undefined,
          query: response.query,
          backend: response.backend,
          allowlistedDomainCount: response.allowlistedDomainCount,
          results: response.results,
          notice: response.notice,
          ...(response.error ? { error: response.error } : {}),
        },
        undefined,
        { isError: response.error !== undefined },
      );
    },
  );

  registerToolFamilyPipelineTool<WebExtractInput, Record<string, unknown>>(
    server,
    context,
    'web_extract',
    {
      title: 'Web Extract',
      description:
        'Fetch up to three public URLs and return their readable text with a deterministic head-and-tail budget '
        + '(no model summarization), each with provenance, authority, fetchedAt, a content hash, and a citation-ready '
        + 'URL. Use it after web_search when a snippet is not enough, or when the user provides a specific URL. '
        + 'Loopback, private, link-local, carrier-grade NAT, and cloud-metadata targets are refused, DNS answers are '
        + 'validated before connecting, and every redirect is re-validated. '
        + WEB_UNTRUSTED_NOTICE,
      inputSchema: WebExtractInputSchema,
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'False when every requested URL failed.' },
          pages: { type: 'array', description: 'One entry per requested URL, in order. A failing URL sets `error` instead of aborting the call.', items: ExtractPageSchema },
          notice: { type: 'string', description: 'Untrusted-content notice. Preserve it when quoting content.' },
        },
        required: ['success', 'pages', 'notice'],
      },
    },
    async (input) => {
      const pages = await extractUrls(input.urls, input.charLimit);
      const allFailed = pages.length > 0 && pages.every((page) => page.error !== undefined);
      return createToolFamilyPipelineResult(
        {
          success: !allFailed,
          pages,
          notice: WEB_UNTRUSTED_NOTICE,
        },
        undefined,
        { isError: allFailed },
      );
    },
  );
}
