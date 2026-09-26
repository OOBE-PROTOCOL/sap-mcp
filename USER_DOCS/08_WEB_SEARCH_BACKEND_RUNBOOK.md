# Web Search Backend Runbook (`web_search` / `web_extract`)

## 1. What These Tools Need

SAP MCP ships two hosted-safe read tools for general web research:

| Tool | Returns |
| --- | --- |
| `web_search` | Ranked web evidence: title, URL, snippet, publication date, a server-assigned `citationId`, plus `provenance` and `authority` |
| `web_extract` | Public URLs fetched and flattened to text with a deterministic character budget, each with the same provenance fields |

Neither tool calls a third-party search provider. Both are backed by a **SearXNG** instance that the operator hosts, so no provider key is required and no query leaves your infrastructure.

Both are priced `read-premium`. On a sponsored hosted deployment the operator covers them for its own agents, so end users never see an x402 challenge for a search; external callers settle the challenge normally.

Without a configured backend the tools stay installed and return a clear "not configured" error. They never fail open.

## 2. Run SearXNG

The tools call the JSON API (`/search?...&format=json`), which SearXNG disables by default. Enabling it is the one mandatory configuration step.

`docker-compose.yml`:

```yaml
services:
  searxng:
    image: searxng/searxng:latest
    container_name: searxng
    restart: unless-stopped
    ports:
      - "8888:8080"
    environment:
      - SEARXNG_BASE_URL=http://localhost:8888/
    volumes:
      - ./searxng/settings.yml:/etc/searxng/settings.yml:ro
```

`searxng/settings.yml`:

```yaml
use_default_settings: true

server:
  secret_key: "replace-with-a-random-value"   # the container refuses to start without one
  limiter: false                              # the bot limiter rejects agent request patterns
  image_proxy: false

search:
  formats:
    - html
    - json        # mandatory: without it the JSON API answers 403
  max_page: 1     # agents read the first page only
```

Start it and verify:

```bash
docker compose up -d searxng
curl -s "http://127.0.0.1:8888/search?q=test&format=json" | head -c 200
```

A JSON body containing a `results` array means the backend is ready. A `403` means `json` is still missing from `search.formats`.

## 3. Point SAP MCP At The Backend

| Variable | Required | Purpose |
| --- | --- | --- |
| `SAP_MCP_SEARXNG_URL` | **yes** | Base URL of the SearXNG instance, for example `http://127.0.0.1:8888`. Unset means the tools report "not configured". |
| `SAP_MCP_WEB_TRUSTED_DOMAINS` | no | Comma-separated allowlist. Results from these hosts are returned with `provenance: "allowlisted"`; `sources: "trusted"` restricts a search to them. Subdomains match. |
| `SAP_MCP_WEB_PRIMARY_DOMAINS` | no | Subset of the allowlist returned with `authority: "primary"` (for example a central bank or a statistical agency). Allowlisted hosts default to `secondary`; everything else is `unknown`. |
| `SAP_MCP_WEB_USER_AGENT` | no | Request identity used when fetching pages. Defaults to a browser-like string; set your own to identify your deployment. |
| `SAP_MCP_WEB_SEARCH_TIMEOUT_MS` | no | Search request timeout (default `8000`, max `30000`). |
| `SAP_MCP_WEB_SEARCH_MAX_RESULTS` | no | Default result count (default `5`, max `20`). |
| `SAP_MCP_WEB_EXTRACT_MAX_CHARS` | no | Default per-page extraction budget (default `12000`, max `20000`). |
| `SAP_MCP_WEB_CONNECT_TIMEOUT_MS` | no | Connect-phase timeout for page fetches (default `5000`). |
| `SAP_MCP_WEB_BODY_TIMEOUT_MS` | no | Body-phase timeout for page fetches (default `10000`). |

## 4. Evidence Model: Provenance, Not Truth

Results are **not** returned with a boolean "trusted" flag. An allowlisted domain proves **origin**, not truth, so each item carries:

| Field | Meaning |
| --- | --- |
| `citationId` | Assigned server-side (`"1"`, `"2"`, …) so a model cites sources without inventing identifiers |
| `provenance` | `allowlisted` when the host is on the operator allowlist, otherwise `open-web` |
| `authority` | `primary` (explicitly promoted), `secondary` (allowlisted), or `unknown` |
| `fetchedAt` / `publishedAt` | When we fetched it, and when the source says it was published |
| `contentHash` | Stable hash of the served text, for provenance records |
| `truncated` | Whether a character budget cut the content |

Provenance may influence **ranking and corroboration**. It never authorizes an action: no web content, allowlisted or not, can approve a wallet, signing, payment, or value-moving operation. Every response repeats that notice so agents preserve it when quoting sources.

## 5. Extraction Budgets

| Limit | Value | Why |
| --- | --- | --- |
| Per page (default / max) | `12 000` / `20 000` characters | Keeps a single page readable inside model context |
| Whole call | `30 000` characters | Matches the truncation limit the agent runtime applies to every tool result, so truncation is declared policy rather than a silent cut |
| URLs per call | `3` | Bounded fan-out and latency |
| Response size | `2 MB` decompressed | A decompression bomb cannot exhaust memory |

Pages share the per-call budget: later pages get whatever remains.

## 6. Egress Policy

Every fetch goes through the same guard, in this order:

1. **Syntactic check** — http/https only, no credentials in the URL, no `localhost`/`.local`/`.internal` suffixes, no single-label hostnames, ports 80/443 only.
2. **DNS validation before connecting** — every resolved address (A and AAAA) is checked against the blocklist: loopback, private ranges, carrier-grade NAT (`100.64.0.0/10`), link-local, unique-local IPv6, multicast/reserved, and the cloud metadata endpoint (`169.254.169.254`). IPv6 addresses are normalized to their numeric value first, so an address is refused in **every** notation: `::ffff:127.0.0.1`, `::ffff:7f00:1`, `64:ff9b::7f00:1` (NAT64), `2002:7f00:1::` (6to4) and Teredo forms are all treated as `127.0.0.1`. The embedded IPv4 is what gets checked, so DNS64 on an IPv6-only host still reaches public IPv4 hosts.
3. **Address pinning (anti-rebinding)** — the validated address is used for the connection, with `Host` and TLS SNI still set to the hostname, so a name cannot be re-resolved to a private address between validation and connect.
4. **Redirects** — at most 3, and each hop is re-validated *and* re-resolved before it is requested. An `https` origin may not redirect to `http`: the downgrade is refused, so content is never silently read in cleartext.
5. **Body handling** — connect and body timeouts are separate, and the body phase has a **hard deadline** (`SAP_MCP_WEB_BODY_TIMEOUT_MS`) that destroys the response and the decompressor on expiry, so a response that trickles bytes can neither hold the socket open nor stall the tool call; `gzip`, `deflate` and `br` are decompressed inside the size budget; any other content encoding is refused rather than decompressed.

## 7. Pricing

`web_search` and `web_extract` are **micro-read** tools: `$0.001` per call (`1 USD per 1000 requests`) on the external x402 lane. Agents hosted on the OOBE platform run the same calls on the sponsored lane and are not charged.

## 8. Operational Notes

- **Blocked publishers**: sites behind aggressive bot protection (for example Cloudflare-fronted financial sites) may answer `403` to the server's fetch fingerprint even with browser-like headers. Those URLs return a clear refusal, and the agent falls back to the search snippet or another source.
- **JavaScript-only pages**: extraction reports that no readable text was found instead of returning empty content, so the agent knows to change source rather than retry.
- **Non-text content**: PDFs and other non-HTML responses are refused with the detected content type.
- **Backend credentials**: if the backend URL ever carries userinfo, it is stripped from tool output, so a credential cannot reach model context.
- **`web_search` is not a market-data tool**: prices, on-chain state, balances and holdings have dedicated tools. Search results are evidence for general research.
