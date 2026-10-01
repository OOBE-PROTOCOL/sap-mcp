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

# SearXNG's own default general engines (brave, duckduckgo, google cse) are the
# ones that rate-limit a datacenter IP within a handful of queries. Measured
# from a datacenter host right after the backend had answered a few searches:
#
#   brave       -> Suspended: too many requests
#   duckduckgo  -> CAPTCHA
#   google cse  -> Suspended: too many requests
#   bing / yep / yahoo -> answered (10, 20 and 7 results)
#
# With every default engine down, the JSON API still answers 200 — with an empty
# `results` array, which reads as "the web has nothing on this" to whoever
# asked. Emitting a few engines the host can actually reach is the difference
# between an empty web and a working backend.
#
# Additive on purpose: nothing is disabled, so a host whose IP the defaults
# accept keeps them too. Operator instances live on datacenter IPs, so this
# belongs here rather than in a per-developer override.
engines:
  - name: bing
    disabled: false
  - name: yep
    disabled: false
  - name: yahoo
    disabled: false
```

Start it and verify with a **canary that asserts results**, not with an eyeball:

```bash
docker compose up -d searxng

# The JSON API must answer, and it must answer *with results*: a 200 carrying an
# empty `results` array passes every weaker check, `head -c 200` included.
curl -fsS "http://127.0.0.1:8888/search?q=searxng+documentation&format=json" \
  | jq -e '.results | length > 0' > /dev/null \
  || echo "FAIL: no results — check /stats and the container log before blaming the query"

# Who is enabled, and how they are doing.
curl -fsS "http://127.0.0.1:8888/config" | jq -r '.engines[] | select(.enabled) | .name' | sort
curl -fsS "http://127.0.0.1:8888/stats"  | jq '.engines'   # per-engine counters: look for errors/suspensions
docker compose logs --tail=50 searxng | grep -Ei "suspended|captcha|too many requests"

# Once is not stability: repeat with distinct queries, so the result cache cannot
# answer on the backend's behalf, and fail if any run comes back empty.
for i in 1 2 3 4 5; do
  curl -fsS "http://127.0.0.1:8888/search?q=searxng+canary+$i&format=json" \
    | jq -e '.results | length > 0' > /dev/null || echo "FAIL: run $i came back empty"
done
```

A `403` means `json` is still missing from `search.formats`.

### Two failures that look alike, and are not

| Symptom | What it is | Where to look |
| --- | --- | --- |
| `200` with `"results": []` | the backend answered; its engines did not | `/config` (who is enabled), `/stats` (per-engine errors), the container log (`Suspended`, `CAPTCHA`), then the `engines:` list above |
| `Web search failed: fetch failed` | the request never reached a usable backend | `SAP_MCP_SEARXNG_URL`, DNS, egress/TLS, and whether the container is up — checked **from the gateway host**, not from a workstation |

The `engines:` block above addresses the first branch only. It does nothing for a
`fetch failed`, and neither branch is evidence for the other.

### Applying this to the instance that serves users

Merging this document reconfigures nothing: the instance behind `web_search` reads the
`settings.yml` mounted into **its own** SearXNG container. The rollout is

1. apply the settings to that deployment's file or config map — done by the operator who
   owns the MCP deployment, not by the author of this runbook;
2. recreate the service so the file is re-read:
   `docker compose up -d --force-recreate searxng`;
3. run the canary above **from the same network and identity the gateway uses**;
4. record what is now active: `/config` lists the enabled engines, and the image tag or
   digest identifies the build.

Until 1–3 have happened, the `engines:` block in this document is a **proposal, not a
state** — and the production instance is still on its defaults.

### One-command rollout: `scripts/setup-searxng-backend.sh`

Steps 1–3 (and the env wiring of section 3) are scripted and idempotent. On the gateway
host, as root:

```bash
sudo ./scripts/setup-searxng-backend.sh            # env file default: /home/sapgateway/sap-mcp-private/sap-mcp.env
sudo ./scripts/setup-searxng-backend.sh /path/to/gateway.env   # or pass it explicitly
```

What it does, in order: copies this repo's `deploy/searxng/settings.yml` (the
datacenter-IP engine set) into `/opt/searxng/searxng/`, writes the runbook compose file
**only when none exists** (operator edits win), brings the container up with
`--force-recreate`, runs the **five-query canary with the results assertion** (fails on
`results: []`, not just on a non-200), checks `SAP_MCP_SEARXNG_URL` in the gateway env
file (appends the runbook default if missing, keeps yours otherwise), and prints the one
step it cannot do: restarting the gateway process so the env is re-read
(`pm2 restart sap-mcp --update-env` or your supervisor's equivalent).

Overrides: `SEARXNG_DIR=/path` moves the SearXNG home; `GATEWAY_ENV_FILE=/path/env`
overrides the env file for both the default invocation and the argument form.

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

- **Monitor the backend, not only the tool**: a starved backend and a genuinely empty web
  look identical in the tool output — `results: []` — so a dashboard that watches
  `web_search` latency and errors will not see the failure that matters. The signals are on
  the SearXNG side: `/stats` for per-engine error counts, `/config` for the enabled set,
  and the container log for `Suspended`/`CAPTCHA` lines. Alert on engines suspended or
  failing, not on tool errors.

- **Blocked publishers**: sites behind aggressive bot protection (for example Cloudflare-fronted financial sites) may answer `403` to the server's fetch fingerprint even with browser-like headers. Those URLs return a clear refusal, and the agent falls back to the search snippet or another source.
- **JavaScript-only pages**: extraction reports that no readable text was found instead of returning empty content, so the agent knows to change source rather than retry.
- **Non-text content**: PDFs and other non-HTML responses are refused with the detected content type.
- **Backend credentials**: if the backend URL ever carries userinfo, it is stripped from tool output, so a credential cannot reach model context.
- **`web_search` is not a market-data tool**: prices, on-chain state, balances and holdings have dedicated tools. Search results are evidence for general research.
- **The gateway's HTTP rate limiter is a different control**: `SAP_MCP_REMOTE_RATE_LIMIT_*` limits requests per forwarded IP at the gateway. It is neither a `web_search`-specific limit nor a per-agent budget, and it cannot protect the search backend from a caller that stays under it. Rate limiting on the kernel research lane (issue #92, criterion 16) is a separate question on a separate lane — do not read one as evidence for the other.
- **`web_extract` does not use SearXNG**: it fetches the public URL directly through the egress guard, so the engines above have no effect on it, and its failures (publisher anti-bot, timeouts) have their own branch.
