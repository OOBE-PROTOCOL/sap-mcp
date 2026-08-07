# Protocol Logo Standard

## Architecture

Logos are resolved at **runtime** — no static files in the repo.

```
src/ui/
  protocol-logos.ts          — Inline SVG registry (tokens + fallback for cards)
  runtime-logo-resolver.ts   — Runtime favicon fetcher with cache (for HTTP endpoint)
  LOGOS.md                   — This file
```

## How it works

### For HTML cards (inline, no network)
`protocol-logos.ts` → `resolveProtocolLogo('jupiter')` → inline SVG or fallback.
No network call, instant rendering in sandboxed iframe.

### For HTTP endpoint (/logos/{protocol-id})
`runtime-logo-resolver.ts` → `resolveFavicon('jupiter')`:
1. **In-memory cache** (fastest, 24h TTL)
2. **Filesystem cache** (`~/.local/share/mcp-sap/logos/{protocol-id}.png`)
3. **Fetch from web** (Google favicon service → direct /favicon.ico → /favicon.png)
4. **Fallback SVG** (initials + brand color, always available)

## Adding a new protocol

### Step 1: Register in `runtime-logo-resolver.ts`
```ts
{ id: 'myprotocol', name: 'MyProtocol', website: 'https://myprotocol.com', initials: 'MYP', color: '#ff6b6b' },
```

### Step 2: Register in `protocol-logos.ts` (for inline cards)
```ts
{ id: 'myprotocol', name: 'MyProtocol', initials: 'MYP', color: '#ff6b6b' },
```

### Step 3: Done
The logo is now:
- Fetched at runtime from `https://myprotocol.com/favicon.ico`
- Cached to `~/.local/share/mcp-sap/logos/myprotocol.png`
- Served at `https://mcp.sap.oobeprotocol.ai/logos/myprotocol`
- Available inline in cards via `resolveProtocolLogo('myprotocol')`

## Runtime extensibility

```ts
import { registerFaviconEntry } from './runtime-logo-resolver.js';
import { registerProtocol } from './protocol-logos.js';

// Register at runtime (e.g. from a plugin)
registerFaviconEntry({ id: 'newproto', name: 'NewProto', website: 'https://newproto.com', initials: 'NP', color: '#3b82f6' });
registerProtocol({ id: 'newproto', name: 'NewProto', initials: 'NP', color: '#3b82f6' });
```

## Cache location

- **Default**: `~/.local/share/mcp-sap/logos/`
- **Override**: `SAP_LOGO_CACHE_DIR=/custom/path`
- **TTL**: 24 hours (in-memory), filesystem cache is permanent until manually cleared

## Favicon fetch strategy

1. Google favicon service: `https://www.google.com/s2/favicons?domain={website}&sz=64`
2. Direct: `{website}/favicon.ico`
3. PNG: `{website}/favicon.png`
4. Fallback: generated SVG with initials + brand color

All fetches have a 5-second timeout. If all fail, the fallback SVG is used.