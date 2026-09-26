/**
 * @name tools/web-search/web-search-client.test
 * @description Unit tests for the web search client: egress guard, address
 *   blocklist, provenance/authority mapping, SearXNG mapping, deterministic
 *   truncation, and the fail-safe paths for an unconfigured backend.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WEB_UNTRUSTED_NOTICE,
  authorityForUrl,
  blockedAddressReason,
  embeddedIpv4,
  extractUrls,
  hashContent,
  htmlToText,
  ipv6ToBigInt,
  isContentTypeAllowed,
  mapSearxngResult,
  provenanceForUrl,
  resolveAndValidate,
  safeBackendLabel,
  searchWeb,
  truncateDeterministic,
  validateEgressUrl,
} from './web-search-client.js';

const ENV_KEYS = [
  'SAP_MCP_SEARXNG_URL',
  'SAP_MCP_WEB_TRUSTED_DOMAINS',
  'SAP_MCP_WEB_PRIMARY_DOMAINS',
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

describe('validateEgressUrl (syntactic guard)', () => {
  it('refuses localhost, internal suffixes and credentials', () => {
    expect(validateEgressUrl('http://localhost/admin')).toBeTruthy();
    expect(validateEgressUrl('http://api.local/x')).toBeTruthy();
    expect(validateEgressUrl('https://user:pass@example.com/')).toContain('credentials');
    expect(validateEgressUrl('http://metadata/')).toContain('single-label');
  });

  it('refuses non-http protocols and non-web ports', () => {
    expect(validateEgressUrl('file:///etc/passwd')).toBeTruthy();
    expect(validateEgressUrl('ftp://example.com/x')).toBeTruthy();
    expect(validateEgressUrl('http://example.com:6379/')).toContain('port 6379');
  });

  it('refuses private and metadata literals', () => {
    expect(validateEgressUrl('http://127.0.0.1:80/')).toBeTruthy();
    expect(validateEgressUrl('http://169.254.169.254/latest/meta-data/')).toContain('cloud metadata');
    expect(validateEgressUrl('http://10.0.0.5/')).toBeTruthy();
    expect(validateEgressUrl('http://192.168.1.1/')).toBeTruthy();
    expect(validateEgressUrl('http://172.16.4.2/')).toBeTruthy();
    expect(validateEgressUrl('http://[::1]/')).toBeTruthy();
  });

  it('accepts public http and https targets', () => {
    expect(validateEgressUrl('https://docs.solana.com/')).toBeNull();
    expect(validateEgressUrl('http://example.com/page')).toBeNull();
  });

  it('refuses malformed URLs', () => {
    expect(validateEgressUrl('not a url')).toBeTruthy();
  });
});

describe('blockedAddressReason (resolved-address blocklist)', () => {
  it('blocks loopback, private, metadata, CGNAT, multicast and reserved ranges', () => {
    for (const address of [
      '127.0.0.1',
      '0.0.0.0',
      '10.1.2.3',
      '192.168.0.10',
      '172.20.5.5',
      '169.254.169.254',
      '100.64.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(blockedAddressReason(address), address).not.toBeNull();
    }
  });

  it('blocks IPv6 loopback, unique-local, link-local and IPv4-mapped private', () => {
    for (const address of ['::1', '::', 'fd00::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect(blockedAddressReason(address), address).not.toBeNull();
    }
  });

  // Regression: the notation of a blocked address must not matter. The decimal
  // `::ffff:a.b.c.d` form was covered while the equivalent hex, NAT64, 6to4 and
  // Teredo encodings passed the blocklist and reached loopback/private targets.
  it('blocks IPv4 addresses hidden in every IPv6 notation', () => {
    for (const address of [
      '::ffff:7f00:1', // 127.0.0.1 in hex
      '::ffff:0a00:0001', // 10.0.0.1 in hex
      '::ffff:a9fe:a9fe', // 169.254.169.254, the cloud metadata endpoint
      '::7f00:1', // IPv4-compatible loopback
      '64:ff9b::7f00:1', // NAT64-wrapped loopback
      '64:ff9b::a00:1', // NAT64-wrapped 10.0.0.1
      '64:ff9b::a9fe:a9fe', // NAT64-wrapped metadata endpoint
      '2002:7f00:1::', // 6to4 carrying 127.0.0.1
      '2002:a9fe:a9fe::', // 6to4 carrying the metadata endpoint
      '2001:0:0:0:0:0:ffff:fffe', // Teredo, de-obfuscates to 0.0.0.1
    ]) {
      expect(blockedAddressReason(address), address).not.toBeNull();
    }
  });

  it('still allows public addresses written in translated IPv6 notation', () => {
    // 93.184.216.34 is public: DNS64 on an IPv6-only host legitimately answers
    // with this NAT64 form, so the prefix alone cannot be refused.
    expect(blockedAddressReason('::ffff:5db8:d822')).toBeNull();
    expect(blockedAddressReason('64:ff9b::5db8:d822')).toBeNull();
    expect(blockedAddressReason('2002:5db8:d822::')).toBeNull();
  });

  it('normalizes equivalent IPv6 notations to the same numeric value', () => {
    expect(ipv6ToBigInt('::ffff:7f00:1')).toBe(ipv6ToBigInt('::ffff:127.0.0.1'));
    expect(ipv6ToBigInt('::1')).toBe(1n);
    expect(ipv6ToBigInt('2606:2800:220:1:248:1893:25c8:1946')).toBe(ipv6ToBigInt('2606:2800:0220:0001:0248:1893:25c8:1946'));
    expect(ipv6ToBigInt('not-an-address')).toBeNull();
    expect(ipv6ToBigInt('93.184.216.34')).toBeNull();
  });

  it('reports the embedded IPv4 of translated and tunnelled forms', () => {
    expect(embeddedIpv4('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(embeddedIpv4('64:ff9b::a00:1')).toBe('10.0.0.1');
    expect(embeddedIpv4('2001:0:0:0:0:0:ffff:fffe')).toBe('0.0.0.1');
    expect(embeddedIpv4('2606:2800:220:1:248:1893:25c8:1946')).toBeNull();
  });

  it('allows public addresses', () => {
    expect(blockedAddressReason('93.184.216.34')).toBeNull();
    expect(blockedAddressReason('2606:2800:220:1:248:1893:25c8:1946')).toBeNull();
  });
});

describe('resolveAndValidate (DNS validation before connecting)', () => {
  it('rejects a literal private address without any DNS lookup', async () => {
    const result = await resolveAndValidate('169.254.169.254');
    expect(typeof result).toBe('string');
    expect(String(result)).toContain('cloud metadata');
  });

  it('pins a literal public address', async () => {
    const result = await resolveAndValidate('93.184.216.34');
    expect(typeof result).toBe('object');
    expect((result as { address: string }).address).toBe('93.184.216.34');
  });
});

describe('provenance and authority', () => {
  it('marks allowlisted hosts and promotes primary domains only when configured', () => {
    const allowlist = new Set(['reuters.com', 'federalreserve.gov']);
    const primary = new Set(['federalreserve.gov']);

    expect(provenanceForUrl('https://www.reuters.com/markets', allowlist)).toBe('allowlisted');
    expect(authorityForUrl('https://www.reuters.com/markets', allowlist, primary)).toBe('secondary');
    expect(authorityForUrl('https://federalreserve.gov/newsevents', allowlist, primary)).toBe('primary');
    expect(provenanceForUrl('https://coindesk.com/x', allowlist)).toBe('open-web');
    expect(authorityForUrl('https://coindesk.com/x', allowlist, primary)).toBe('unknown');
  });

  it('does not treat a lookalike domain as allowlisted', () => {
    const allowlist = new Set(['reuters.com']);
    expect(provenanceForUrl('https://reuters.com.evil.example/x', allowlist)).toBe('open-web');
  });

  it('treats malformed URLs as open-web and unknown', () => {
    expect(provenanceForUrl('not-a-url')).toBe('open-web');
    expect(authorityForUrl('not-a-url')).toBe('unknown');
  });
});

describe('mapSearxngResult', () => {
  it('maps a raw result onto the evidence contract with server-assigned citation id', () => {
    const mapped = mapSearxngResult(
      { url: 'https://www.reuters.com/x', title: 'Title', content: 'Snippet', publishedDate: '2026-01-02' },
      { allowlist: new Set(['reuters.com']), primary: new Set(), citationId: '2', fetchedAt: '2026-09-26T10:00:00.000Z' },
    );
    expect(mapped).toEqual({
      citationId: '2',
      title: 'Title',
      url: 'https://www.reuters.com/x',
      snippet: 'Snippet',
      provenance: 'allowlisted',
      authority: 'secondary',
      fetchedAt: '2026-09-26T10:00:00.000Z',
      publishedAt: '2026-01-02',
      truncated: false,
    });
  });

  it('drops entries without a URL and defaults the title to the URL', () => {
    const options = { citationId: '1', fetchedAt: '2026-09-26T10:00:00.000Z', allowlist: new Set<string>(), primary: new Set<string>() };
    expect(mapSearxngResult({ title: 'no url' }, options)).toBeUndefined();
    expect(mapSearxngResult({ url: 'https://example.com' }, options)?.title).toBe('https://example.com');
  });
});

describe('htmlToText, truncation and hashing', () => {
  it('strips head, title, boilerplate, scripts and decodes entities', () => {
    const html = '<html><head><title>T</title><style>p{color:red}</style></head>'
      + '<body><nav>menu</nav><p>Hello&nbsp;&amp; welcome</p><footer>bye</footer><div>second</div></body></html>';
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

  it('hashes content deterministically', () => {
    expect(hashContent('same')).toBe(hashContent('same'));
    expect(hashContent('same')).not.toBe(hashContent('other'));
    expect(hashContent('same')).toHaveLength(32);
  });
});

describe('content types and backend labels', () => {
  it('allows only HTML and plain text', () => {
    expect(isContentTypeAllowed('text/html; charset=utf-8')).toBe(true);
    expect(isContentTypeAllowed('application/xhtml+xml')).toBe(true);
    expect(isContentTypeAllowed('text/plain')).toBe(true);
    expect(isContentTypeAllowed('application/pdf')).toBe(false);
    expect(isContentTypeAllowed(undefined)).toBe(true);
  });

  it('never reflects backend credentials', () => {
    expect(safeBackendLabel('http://operator:s3cr3t@searxng.local:8888/search?q=1')).toBe('http://searxng.local:8888');
  });
});

describe('searchWeb', () => {
  it('fails safe when the backend is not configured', async () => {
    const response = await searchWeb({ query: 'solana news' });
    expect(response.error).toContain('SAP_MCP_SEARXNG_URL');
    expect(response.results).toHaveLength(0);
    expect(response.notice).toBe(WEB_UNTRUSTED_NOTICE);
  });

  it('returns ranked evidence with citations and provenance', async () => {
    process.env.SAP_MCP_SEARXNG_URL = 'http://searxng.local:8888';
    process.env.SAP_MCP_WEB_TRUSTED_DOMAINS = 'reuters.com';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [
        { url: 'https://www.reuters.com/a', title: 'A', content: 'snippet a' },
        { url: 'https://random-blog.example/b', title: 'B', content: 'snippet b' },
      ],
    }), { status: 200 })));

    const response = await searchWeb({ query: 'markets' });
    expect(response.error).toBeUndefined();
    expect(response.results).toHaveLength(2);
    expect(response.results[0]?.citationId).toBe('1');
    expect(response.results[0]?.provenance).toBe('allowlisted');
    expect(response.results[1]?.provenance).toBe('open-web');
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
    // Ids are assigned after filtering: the surviving entry is citation 1.
    expect(response.results[0]?.citationId).toBe('1');
  });

  it('numbers citations contiguously after the trusted filter drops entries', async () => {
    process.env.SAP_MCP_SEARXNG_URL = 'http://searxng.local:8888';
    process.env.SAP_MCP_WEB_TRUSTED_DOMAINS = 'reuters.com';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [
        { url: 'https://blog-one.example/a', title: 'A' },
        { url: 'https://www.reuters.com/b', title: 'B' },
        { url: 'https://blog-two.example/c', title: 'C' },
        { url: 'https://www.reuters.com/d', title: 'D' },
      ],
    }), { status: 200 })));

    const response = await searchWeb({ query: 'markets', sources: 'trusted' });
    expect(response.results.map((entry) => entry.citationId)).toEqual(['1', '2']);
  });

  it('reports upstream HTTP failures without throwing', async () => {
    process.env.SAP_MCP_SEARXNG_URL = 'http://searxng.local:8888';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));

    const response = await searchWeb({ query: 'markets' });
    expect(response.error).toContain('403');
    // The most common misconfiguration must be self-diagnosable from the error.
    expect(response.error).toContain('search.formats');
  });

  it('never reflects backend credentials into the tool result', async () => {
    process.env.SAP_MCP_SEARXNG_URL = 'http://operator:s3cr3t@searxng.local:8888';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })));

    const response = await searchWeb({ query: 'markets' });
    expect(response.backend).toBe('http://searxng.local:8888');
    expect(JSON.stringify(response)).not.toContain('s3cr3t');
  });
});

describe('extractUrls egress refusals', () => {
  it('refuses private targets per URL without any network access', async () => {
    const pages = await extractUrls(['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:80/']);
    expect(pages[0]?.error).toContain('cloud metadata');
    expect(pages[1]?.error).toBeTruthy();
    expect(pages[0]?.content).toBe('');
    // Provenance is reported even for a refused URL, so the caller can log it.
    expect(pages[0]?.provenance).toBe('open-web');
  });

  it('caps the number of URLs per call', async () => {
    const pages = await extractUrls([
      'http://127.0.0.1:80/a',
      'http://127.0.0.1:80/b',
      'http://127.0.0.1:80/c',
      'http://127.0.0.1:80/d',
    ]);
    expect(pages).toHaveLength(3);
  });
});
