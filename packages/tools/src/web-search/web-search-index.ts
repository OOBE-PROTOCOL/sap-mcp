/**
 * @name tools/web-search/web-search-index
 * @description Entry point for the web search tool family.
 *
 * @module tools/web-search
 */

export { registerWebSearchTools } from './web-search-tools.js';
export {
  allowlistedDomains,
  authorityForUrl,
  blockedAddressReason,
  extractUrls,
  fetchPageSafely,
  hashContent,
  htmlToText,
  isContentTypeAllowed,
  mapSearxngResult,
  primaryDomains,
  provenanceForUrl,
  resolveAndValidate,
  safeBackendLabel,
  searchWeb,
  truncateDeterministic,
  validateEgressUrl,
  WEB_UNTRUSTED_NOTICE,
  WEB_EXTRACT_DEFAULT_MAX_CHARS,
  WEB_EXTRACT_MAX_CHARS_LIMIT,
  WEB_EXTRACT_TOTAL_MAX_CHARS,
  WEB_EXTRACT_MAX_RESPONSE_BYTES,
  WEB_EXTRACT_MAX_URLS,
} from './web-search-client.js';
export type {
  EvidenceAuthority,
  EvidenceProvenance,
  PageFetchResult,
  ResearchEvidence,
  ResolvedTarget,
  WebExtractPage,
  WebSearchRequest,
  WebSearchResponse,
} from './web-search-client.js';
