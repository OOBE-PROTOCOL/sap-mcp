/**
 * @name tools/web-search/web-search-client.test
 * @description Unit tests for the web search client: SSRF guard, trusted-domain
 *   tagging, SearXNG mapping, deterministic truncation, and the fail-safe paths
 *   for an unconfigured backend.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WEB_UNTRUSTED_NOTICE,
  extractUrls,
  htmlToText,
  isTrustedUrl,
  mapSearxngResult,
  searchWeb,
  trustedDomains,
  truncateDeterministic,
  validateExternalFetchUrl,
} from './web-search-client.js';

const ENV_KEYS = [
  'SAP_MCP_SEARXNG_URL',
  'SAP_MCP_WEB_TRUSTED_DOMAINS',
  'SAP_MCP_WEB_SEARCH_TIMEOUT_MS',
  'SAP_MCP_WEB_SEARCH_MAX_RESULTS',
  'SAP_MCP_WEB_EXTRACT_MAX_CHARS',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe('validateExternalFetchUrl (SSRF guard)', () => {
  it('refuses loopback, private, link-local and metadata targets', () => {
    for (const target of [
      'http://localhost/admin',
      'http://127.0.0.1:6379/',
      'http://0.0.0.0/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://172.16.4.2/',
      'http://172.31.255.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
      'http://[fe80::1]/',
      'http://metadata/',
    ]) {
      expect(validateExternalFetchUrl(target), target).not.toBeNull();
    }
  });

  it('refuses non-http protocols', () => {
    expect(validateExternalFetchUrl('file:///etc/passwd')).not.toBeNull();
    expect(validateExternalFetchUrl('ftp://example.com/x')).not.toBeNull();
  });

  it('accepts public http and https targets', () => {
    expect(validateExternalFetchUrl('https://docs.solana.com/')).toBeNull();
    expect(validateExternalFetchUrl('http://example.com/page')).toBeNull();
  });

  it('refuses malformed URLs', () => {
    expect(validateExternalFetchUrl('not a url')).not.toBeNull();
  });
});

describe('trusted domain allowlist', () => {
  it('is empty when unset', () => {
    expect(trustedDomains().size).toBe(0);
    expect(isTrustedUrl('https://reuters.com/x')).toBe(false);
  });

  it('parses a comma-separated allowlist and matches subdomains', () => {
    process.env.SAP_MCP_WEB_TRUSTED_DOMAINS = ' reuters.com, FEDERALRESERVE.gov ,';
    const allowlist = trustedDomains();
    expect(allowlist.size).toBe(2);
    expect(isTrustedUrl('https://www.reuters.com/markets/', allowlist)).toBe(true);
    expect(isTrustedUrl('https://federalreserve.gov/newsevents', allowlist)).toBe(true);
    expect(isTrustedUrl('https://reuters.com.evil.example/x', allowlist)).toBe(false);
    expect(isTrustedUrl('https://coindesk.com/x', allowlist)).toBe(false);
  });

  it('treats malformed URLs as untrusted', () => {
    const allowlist = new Set(['reuters.com']);
    expect(isTrustedUrl('not-a-url', allowlist)).toBe(false);
  });
});

describe('mapSearxngResult', () => {
  it('maps a raw result and tags trust from the allowlist', () => {
    const allowlist = new Set(['reuters.com']);
    const mapped = mapSearxngResult(
      { url: 'https://www.reuters.com/x', title: 'Title', content: 'Snippet', publishedDate: '2026-01-02', engine: 'brave' },
      allowlist,
    );
    expect(mapped).toEqual({
      title: 'Title',
      url: 'https://www.reuters.com/x',
      snippet: 'Snippet',
      date: '2026-01-02',
      engine: 'brave',
      trusted: true,
    });
  });

  it('drops entries without a URL and defaults the title to the URL', () => {
    expect(mapSearxngResult({ title: 'no url' }, new Set())).toBeUndefined();
    expect(mapSearxngResult({ url: 'https://example.com' }, new Set())?.title).toBe('https://example.com');
  });
});

describe('htmlToText and deterministic truncation', () => {
  it('strips scripts, styles, tags and decodes entities', () => {
    const html = '<html><head><style>p{color:red}</style><script>alert(1)</script></head>'
      + '<body><p>Hello&nbsp;&amp; welcome</p><div>second</div></body></html>';
    expect(htmlToText(html)).toBe('Hello & welcome second');
  });

  it('returns short text unchanged and truncates long text with a marker', () => {
    expect(truncateDeterministic('short', 100)).toEqual({ content: 'short', truncated: false });

    const long = 'a'.repeat(1_000);
    const { content, truncated } = truncateDeterministic(long, 100);
    expect(truncated).toBe(true);
    expect(content).toContain('[TRUNCATED 900 characters]');
    expect(content.startsWith('a'.repeat(75))).toBe(true);
    expect(content.endsWith('a'.repeat(25))).toBe(true);
  });
});

describe('searchWeb', () => {
  it('fails safe when the backend is not configured', async () => {
    const response = await searchWeb({ query: 'solana news' });
    expect(response.error).toContain('SAP_MCP_SEARXNG_URL');
    expect(response.results).toHaveLength(0);
    expect(response.notice).toBe(WEB_UNTRUSTED_NOTICE);
  });

  it('returns ranked, trust-tagged results', async () => {
    process.env.SAP_MCP_SEARXNG_URL = 'http://searxng.local:8888';
    process.env.SAP_MCP_WEB_TRUSTED_DOMAINS = 'reuters.com';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [
        { url: 'https://www.reuters.com/a', title: 'A', content: 'snippet a', engine: 'brave' },
        { url: 'https://random-blog.example/b', title: 'B', content: 'snippet b' },
      ],
    }), { status: 200 })));

    const response = await searchWeb({ query: 'markets' });
    expect(response.error).toBeUndefined();
    expect(response.results).toHaveLength(2);
    expect(response.results[0]?.trusted).toBe(true);
    expect(response.results[1]?.trusted).toBe(false);
  });

  it('filters to the allowlist when sources=trusted', async () => {
    process.env.SAP_MCP_SEARXNG_URL = 'http://searxng.local:8888';
    process.env.SAP_MCP_WEB_TRUSTED_DOMAINS = 'reuters.com';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [
        { url: 'https://www.reuters.com/a', title: 'A' },
        { url: 'https://random-blog.example/b', title: 'B' },
      ],
    }), { status: 200 })));

    const response = await searchWeb({ query: 'markets', sources: 'trusted' });
    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.url).toBe('https://www.reuters.com/a');
  });

  it('reports upstream HTTP failures without throwing', async () => {
    process.env.SAP_MCP_SEARXNG_URL = 'http://searxng.local:8888';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));

    const response = await searchWeb({ query: 'markets' });
    expect(response.error).toContain('403');
  });

  it('never reflects backend credentials into the tool result', async () => {
    // Custody safety: a backend URL may carry userinfo; echoing it verbatim
    // would push a secret into model context.
    process.env.SAP_MCP_SEARXNG_URL = 'http://operator:s3cr3t@searxng.local:8888';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })));

    const response = await searchWeb({ query: 'markets' });
    expect(response.backend).toBe('http://searxng.local:8888');
    expect(JSON.stringify(response)).not.toContain('s3cr3t');
  });
});

describe('extractUrls', () => {
  it('refuses private targets per URL and keeps processing the rest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><title>T</title><body>Hello world</body></html>', { status: 200 })));

    const pages = await extractUrls(['http://169.254.169.254/latest/meta-data/', 'https://example.com/page']);
    expect(pages[0]?.error).toBeTruthy();
    expect(pages[0]?.content).toBe('');
    expect(pages[1]?.error).toBeUndefined();
    expect(pages[1]?.title).toBe('T');
    expect(pages[1]?.content).toBe('Hello world');
  });

  it('isolates per-URL fetch errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const pages = await extractUrls(['https://example.com/page']);
    expect(pages[0]?.error).toContain('network down');
  });

  it('refuses a redirect that points at a private target, without fetching it', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pages = await extractUrls(['https://example.com/redirect']);
    expect(pages[0]?.error).toContain('unsafe redirect');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a safe redirect and reports the final URL', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(null, { status: 301, headers: { location: 'https://example.com/final' } });
      }
      return new Response('<html><title>F</title><body>Final body</body></html>', { status: 200 });
    }));

    const pages = await extractUrls(['https://example.com/start']);
    expect(pages[0]?.error).toBeUndefined();
    expect(pages[0]?.url).toBe('https://example.com/final');
    expect(pages[0]?.content).toBe('Final body');
  });

  it('explains an empty extraction instead of returning silent empty content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><head><title>App</title></head><body><div id="root"></div><script>boot()</script></body></html>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    )));

    const pages = await extractUrls(['https://spa.example/app']);
    expect(pages[0]?.content).toBe('');
    expect(pages[0]?.error).toContain('No readable text extracted');
  });

  it('rejects content types it cannot flatten to text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('%PDF-1.7', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })));

    const pages = await extractUrls(['https://example.com/report.pdf']);
    expect(pages[0]?.content).toBe('');
    expect(pages[0]?.error).toContain('Unsupported content type');
    expect(pages[0]?.error).toContain('application/pdf');
  });

  it('sends a browser-like identity so sites with bot protection do not refuse it', async () => {
    // Regression: fetching with the bare undici identity answers 403 on
    // publishers such as investing.com, while a browser-like User-Agent plus
    // Accept-Language is served normally.
    const fetchMock = vi.fn(async () => new Response('<html><body>ok</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await extractUrls(['https://example.com/page'], 200);

    const init = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    const headers = init?.headers ?? {};
    expect(String(headers['User-Agent'])).toContain('Mozilla/5.0');
    expect(headers['Accept-Language']).toContain('en-US');
  });

  it('lets a deployment override the request identity', async () => {
    process.env.SAP_MCP_WEB_USER_AGENT = 'SAP-MCP-Test/1.0 (+https://example.com/bot)';
    const fetchMock = vi.fn(async () => new Response('<html><body>ok</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await extractUrls(['https://example.com/page'], 200);

    const init = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(init?.headers?.['User-Agent']).toBe('SAP-MCP-Test/1.0 (+https://example.com/bot)');
  });

  it('explains a bot-protection refusal instead of reporting a bare status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })));

    const pages = await extractUrls(['https://www.investing.com/']);
    expect(pages[0]?.content).toBe('');
    expect(pages[0]?.error).toContain('HTTP 403');
    expect(pages[0]?.error).toContain('bot protection');
    expect(pages[0]?.error).toContain('do not retry in a loop');
  });
});
