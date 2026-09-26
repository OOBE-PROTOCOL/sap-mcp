/**
 * @name tools/web-search/web-search-tools
 * @description Registers the general-purpose `web_search` and `web_extract` tools.
 *
 * These are hosted-safe reads: they touch no wallet, key material, session
 * token, payment lane, or signer surface. Both are priced as premium reads, so
 * a hosted operator can sponsor them for its own agents while external callers
 * settle the x402 challenge. Content is always returned as untrusted evidence,
 * tagged against the operator domain allowlist.
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
    .describe("Use 'trusted' to restrict results to the operator's trusted-domain allowlist; defaults to 'all'."),
  recency: z.enum(['any', 'day', 'week', 'month', 'year']).optional()
    .describe('Optional freshness window; omit or use "any" for no time filter.'),
  maxResults: z.number().int().min(1).max(WEB_SEARCH_MAX_RESULTS_LIMIT).optional()
    .describe(`Maximum number of results to return (1-${WEB_SEARCH_MAX_RESULTS_LIMIT}).`),
}).passthrough().describe('Web Search input schema.');

const WebExtractInputSchema = z.object({
  urls: z.array(z.string().trim().min(1)).min(1).max(WEB_EXTRACT_MAX_URLS)
    .describe(`Public URLs to fetch and flatten into text (1-${WEB_EXTRACT_MAX_URLS}).`),
  charLimit: z.number().int().min(200).max(WEB_EXTRACT_MAX_CHARS_LIMIT).optional()
    .describe('Optional per-page character budget for the returned text.'),
}).passthrough().describe('Web Extract input schema.');

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
        'Search the public web through the self-hosted search backend and return ranked results with '
        + 'title, URL, snippet, publication date when the source exposes one, and a `trusted` flag computed '
        + 'server-side from the operator domain allowlist. Use it for current information, news, documentation, '
        + 'and facts that may be newer than model knowledge. Do not use it for Solana prices, on-chain state, '
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
          trustedDomainCount: { type: 'number', description: 'Number of domains in the operator trusted allowlist.' },
          results: {
            type: 'array',
            description: 'Ranked results. `trusted` is computed server-side from the allowlist.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Result title.' },
                url: { type: 'string', description: 'Result URL.' },
                snippet: { type: 'string', description: 'Search-engine snippet.' },
                date: { type: 'string', description: 'Publication date when the source exposes one.' },
                engine: { type: 'string', description: 'Search engine that produced the result.' },
                trusted: { type: 'boolean', description: 'True when the host is on the operator allowlist.' },
              },
              required: ['title', 'url', 'snippet', 'trusted'],
            },
          },
          notice: { type: 'string', description: 'Untrusted-content notice. Preserve it when quoting results.' },
          error: { type: 'string', description: 'Present only when the search could not be completed.' },
        },
        required: ['success', 'query', 'backend', 'trustedDomainCount', 'results', 'notice'],
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
          trustedDomainCount: response.trustedDomainCount,
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
        'Fetch one or more public URLs and return their readable text, truncated deterministically with a '
        + 'head-and-tail budget (no model summarization). Use it after web_search when a snippet is not enough, '
        + 'or when the user provides a specific URL. Private, loopback, and cloud-metadata targets are refused. '
        + WEB_UNTRUSTED_NOTICE,
      inputSchema: WebExtractInputSchema,
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'False when every requested URL failed.' },
          pages: {
            type: 'array',
            description: 'One entry per requested URL, in order. A failing URL sets `error` instead of aborting the call.',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'Final URL after safe redirects.' },
                title: { type: 'string', description: 'Page title when the document exposes one.' },
                content: { type: 'string', description: 'Flattened readable text, deterministically truncated.' },
                truncated: { type: 'boolean', description: 'True when the character budget cut the content.' },
                error: { type: 'string', description: 'Per-URL failure reason, when the page could not be read.' },
              },
              required: ['url', 'content', 'truncated'],
            },
          },
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
