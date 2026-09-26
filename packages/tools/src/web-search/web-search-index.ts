/**
 * @name tools/web-search/web-search-index
 * @description Entry point for the web search tool family.
 *
 * @module tools/web-search
 */

export { registerWebSearchTools } from './web-search-tools.js';
export {
  extractUrls,
  htmlToText,
  isTrustedUrl,
  mapSearxngResult,
  searchWeb,
  trustedDomains,
  truncateDeterministic,
  validateExternalFetchUrl,
  WEB_UNTRUSTED_NOTICE,
  WEB_EXTRACT_MAX_CHARS_LIMIT,
  WEB_EXTRACT_MAX_URLS,
  WEB_SEARCH_MAX_RESULTS_LIMIT,
} from './web-search-client.js';
export type {
  WebExtractPage,
  WebSearchRequest,
  WebSearchResponse,
  WebSearchResult,
} from './web-search-client.js';
