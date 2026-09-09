# SAP MCP Security Hardening — 7 Findings Fix Plan (TDD)

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task, OR execute directly with the TDD skill (RED-GREEN-REFACTOR per task).

**Goal:** Fix 7/8 findings from Solking's responsible disclosure (hosted-gateway auth-order, fake receipt activation, cross-tenant sessions, webhook SSRF, x402 settle bypass, idempotency cache poisoning, cross-tenant memory) — each via strict TDD with regression tests. Finding 8 (RPC URL leak) not reproducible in current source; verify on VPS deploy before/after.

**Architecture:** All fixes in `~/Desktop/sap-mcp-server` (pnpm monorepo, vitest). Tests live in `src/**` and `packages/**/src` (vitest config auto-discovers `*.test.ts`). On-chain dispute fix (Finding 1) is a separate later phase — Anchor program upgrade, NOT in this plan.

**Tech Stack:** TypeScript strict, vitest ^4, pnpm. No new deps.

**Test commands (all existing gates):**
- `pnpm run test:run` — full vitest suite
- `pnpm run typecheck` — tsc --noEmit --skipLibCheck
- `pnpm run lint` — eslint src/ packages/*/src/
- `pnpm run verify:circular-deps`
- `pnpm run build` — must pass before commit
- New regression suites (one per finding) added under `src/payments/`, `src/premium/`, `src/tools/`, `src/security/`

**Ground-truth file map (already studied):**

| Finding | File(s) | Root cause |
|---|---|---|
| F2 auth-order | `packages/hosted-gateway/src/server.ts:2711` | `tryPremiumRoute` runs before auth block at :2880 |
| F2 fake receipt | `packages/premium/src/activation-manager.ts:46` | `verifyReceiptFormat` = length check only |
| F3 cross-tenant sessions | `packages/premium/src/session-manager.ts:37` | unscoped `Map`, `listPremiumSessions()` returns ALL tenants' sessions |
| F4 webhook SSRF | `packages/premium/src/webhook-engine.ts:118-126` | hostname-string filter + explicit localhost/HTTP allowance; 169.254/0.0.0.0/::1 missing from checks; no DNS resolve |
| F6 settle bypass | `packages/payments/src/monetization-gate.ts:354` | `text.includes('"error"')` string match |
| F7 idempotency cache | `packages/payments/src/monetization-gate.ts:888` | cache key = requestHash only (method+params), no payer |
| F5 cross-tenant memory | `packages/memory/src/memory-store.ts:139` | `SELECT * FROM agent_memory WHERE category=?` no tenant scope; tools registered unconditionally in `builtin-tool-modules.ts` memory module (no `when:`) |

---

## Task 0: Baseline (no code)

**Objective:** Prove current gates pass before touching anything.

- `cd ~/Desktop/sap-mcp-server && pnpm run typecheck && pnpm run lint && pnpm run test:run 2>&1 | tail -20`
- Expected: all green. Record the pass count.
- Commit nothing. If baseline is red, STOP and report.

---

## PHASE 1 — Finding 6: settle-bypass on `"error"` substring (monetization-gate)

### Task 1.1: RED — failing tests for isJsonRpcError semantics

**Files:**
- Create: `packages/payments/src/is-json-rpc-error.test.ts`

Write tests against `McpMonetizationGate.prototype.isJsonRpcError` (private — expose for test via a new pure exported helper, see Task 1.2; for RED phase, import the expected new export `isJsonRpcError` from `./monetization-gate.js` and watch it fail to exist).

Test cases (all against the NEW export):
1. `{"error":{"code":-32603,"message":"x"}}` → true (JSON-RPC error object)
2. `{"error":"something failed"}` → true (string error)
3. `{"result":{"content":[{"text":"Error: boom"}]}}` → true (MCP isError shape via Error: prefix)
4. `{"result":{"content":[{"text":"{\"error\":null,\"data\":42}"}]}}` → **false** ← the regression (currently true)
5. `{"result":{"content":[{"text":"{\"error\":null,\"price\":123}"}]}}` → false (JSON with error:null key)
6. `{"result":{"isError":true}}` → true
7. `{"result":{"isError":false}}` → false
8. `{"result":{"content":[{"text":"ok data"}]}}` → false
9. non-JSON body → false
10. empty body → false

**Step:** run `pnpm vitest run src/payments/is-json-rpc-error.test.ts 2>&1 | tail` → expect FAIL (export missing).

### Task 1.2: GREEN — extract pure `isJsonRpcError` + fix

**Files:**
- Create: `packages/payments/src/json-rpc-error.ts` (pure module, zero deps)
- Modify: `packages/payments/src/monetization-gate.ts` — replace private method body with call to the pure function; keep private method delegating (public surface unchanged).

Implementation:
```ts
// json-rpc-error.ts
export function isJsonRpcError(body: Buffer): boolean {
  try {
    const parsed = JSON.parse(body.toString('utf-8')) as unknown;
    if (parsed === null || typeof parsed !== 'object') return false;
    if ('error' in parsed) {
      const e = (parsed as Record<string, unknown>)['error'];
      if (typeof e === 'object' && e !== null && 'code' in e) return true;
      if (typeof e === 'string' && e.length > 0) return true;
    }
    if ('result' in parsed) {
      const r = (parsed as Record<string, unknown>)['result'];
      if (typeof r === 'object' && r !== null && 'isError' in r) return r['isError'] === true;
      // Structured flag only — NO substring matching.
      if (typeof r === 'object' && r !== null && 'content' in r && Array.isArray(r['content'])) {
        for (const item of r['content']) {
          if (typeof item === 'object' && item !== null && 'isError' in item) return item['isError'] === true;
        }
      }
    }
    return false;
  } catch { return false; }
}
```
Key change: drop `text.startsWith('Error:')` and `text.includes('"error"')` substring checks entirely. Note: case 3 above must change — use `isError: true` flag in content items instead of "Error:" prefix. Update test case 3 to `{"result":{"content":[{"isError":true,"text":"boom"}]}}` → true, and add `{"result":{"content":[{"text":"Error: legacy"}]}}` → **false** (legacy substring no longer triggers).

**Step:** run test → PASS. Then `pnpm run test:run` full suite → check for regressions in existing monetization-gate tests (there are existing tests in `src/payments/monetization-gate.test.ts` — if any assert the old substring behavior, update them to the new structured contract and note it in the commit message).

### Task 1.3: Commit
```
git add packages/payments/src/json-rpc-error.ts packages/payments/src/monetization-gate.ts packages/payments/src/is-json-rpc-error.test.ts
git commit -m "fix(payments): settle on verify success regardless of output text; structured JSON-RPC error detection only (Finding 6)"
```

---

## PHASE 2 — Finding 7: idempotency cache keyed without payer

### Task 2.1: RED — failing tests

**Files:**
- Create: `packages/payments/src/idempotency-key.test.ts`

Tests against new exported pure helper `buildSettlementCacheKey(requestHash: string, payer: string | undefined): string`:
1. different payers → different keys for same requestHash
2. same payer → same key
3. undefined payer → deterministic fallback key (not colliding with defined-payer keys)
4. empty-string payer treated as undefined

### Task 2.2: GREEN — wire payer into cache key

**Files:**
- Modify: `packages/payments/src/monetization-gate.ts`
  - Line ~888: `this.idempotencyCache.get(options.metadata.requestHash)` → `get(buildSettlementCacheKey(requestHash, verifyResult.payer))`
  - Line ~935: `set(buildSettlementCacheKey(requestHash, settlement.payer ?? verifyResult.payer), ...)`
  - Cleanup sweeper (line ~383) unchanged (iterates all keys).
- Modify: `packages/payments/src/usage-ledger.ts` — export `buildSettlementCacheKey` (pure, collocated with hashPaymentRequest) OR create small `packages/payments/src/settlement-cache-key.ts`. Prefer separate file for purity.

Implementation sketch:
```ts
export function buildSettlementCacheKey(requestHash: string, payer: string | undefined): string {
  return `${requestHash}::${payer ?? 'unknown-payer'}`;
}
```

**Step:** RED first (test fails — helper missing), then implement, then PASS, then full `pnpm run test:run` (existing monetization-gate tests may build cache expectations via `metadata.requestHash` — update if needed).

### Task 2.3: Commit
```
git commit -m "fix(payments): include payer address in settlement idempotency cache key (Finding 7)"
```

---

## PHASE 3 — Finding 2a: auth before premium routes (hosted-gateway server)

### Task 3.1: RED — failing test for route ordering

**Files:**
- Create: `src/remote/premium-route-auth.test.ts` (collocated with remote server tests)

Test strategy (unit-level, no live server): export a pure predicate `isPremiumRoute(pathname: string, method: string): boolean` from `packages/hosted-gateway/src/premium-routes.ts` and test that `tryPremiumRoute` **refuses to run without a validated auth result**. Cleanest testable contract: change `tryPremiumRoute(req, res)` → `tryPremiumRoute(req, res, auth?: AuthResult)`; when `auth` is undefined or `!auth.success`, respond 401 for any `/premium/*` path and return true.

Tests (using mock `http.IncomingMessage`/`ServerResponse` — see `src/remote/server.test.ts` for existing mock patterns to copy):
1. POST `/premium/activate` without auth → 401, handled=true
2. POST `/premium/activate` with `{success:true, userId:'u1'}` → passes through to activation handler (assert not 401)
3. GET `/premium/stream/sap-premium-x` without auth → 401
4. POST `/premium/webhook/register` without auth → 401
5. GET `/premium/webhook/wh-x/status` without auth → 401
6. non-premium path → returns false (untouched)
7. HEAD/OPTIONS on premium path without auth → 401 (method-agnostic guard)

### Task 3.2: GREEN — auth param + server.ts wiring

**Files:**
- Modify: `packages/hosted-gateway/src/premium-routes.ts` — `tryPremiumRoute(req, res, auth?: AuthResult)`; if `!auth?.success` → `writeJsonResponse(res, 401, {error:'unauthorized', message:'Bearer auth required for premium delivery routes.'}, {'WWW-Authenticate':'Bearer'})` and return true.
- Modify: `packages/hosted-gateway/src/server.ts:2711` — move the auth validation (`this.authManager.validateFromHeaders(req.headers)`) ABOVE the `tryPremiumRoute` call and pass its result in. The `/mcp` block at :2880 re-validates — keep it (defense in depth) or reuse the single result; prefer computing once and reusing.

### Task 3.2b: Regression test for server wiring (integration-lite)
If `src/remote/server.test.ts` already spins the server, add a case: unauthenticated `POST /premium/activate` against the live test server → 401. Follow the file's existing harness. If harness too heavy, unit tests above suffice for this task; note it.

### Task 3.3: Commit
```
git commit -m "fix(hosted-gateway): require Bearer auth on premium delivery routes; validate auth before route dispatch (Finding 2 - auth order)"
```

---

## PHASE 4 — Finding 2b: verify payment receipt against facilitator

### Task 4.1: RED — activation-manager receipt verification tests

**Files:**
- Create: `src/premium/activation-verify.test.ts`

New contract: `activatePremiumSession` requires a **receipt verifier**. New exported type:
```ts
export interface ReceiptVerifier {
  verify(receipt: string, expectedAmountUsd?: number): Promise<{ valid: boolean; payer?: string; reason?: string }>;
}
```
`activatePremiumSession(request)` becomes async; takes optional `receiptVerifier`. Behavior:
- No verifier configured → **fail closed**: return status `rejected` (new) with reason `receipt_verification_unavailable` — EXCEPT when `process.env.SAP_MCP_ALLOW_UNVERIFIED_ACTIVATION === 'true'` (explicit dev escape hatch, logged loudly).
- Verifier returns invalid → `rejected` status with reason.
- Verifier returns valid → activate as before, bind payer.

Tests:
1. fake receipt `aaaaaaaa` + verifier(valid:false) → rejected
2. fake receipt + no verifier → rejected (`receipt_verification_unavailable`)
3. valid receipt + verifier(valid:true, payer:'P1') → active, receiptBound true
4. dev escape hatch (`SAP_MCP_ALLOW_UNVERIFIED_ACTIVATION=true`) → activates (test with env stub + restore)
5. verifier throws → rejected with `receipt_verification_error`
6. session not in pending_payment → unchanged behavior (still 402-style status)
7. empty/short receipt → rejected before verifier is called (keep verifyReceiptFormat as pre-filter)

Mock facilitator verifier for tests (no network). Also add one integration-shaped test for `handlePremiumActivation` returning HTTP 402 on rejected verification (mock body via existing `readJsonBody` harness in `packages/hosted-gateway/src/premium-routes.ts` tests if a harness exists in `src/remote/server.test.ts` — copy pattern).

### Task 4.2: GREEN — implement verification

**Files:**
- Modify: `packages/premium/src/activation-manager.ts` — async activation + verifier injection; update `verifyReceiptFormat` doc (still structural pre-filter).
- Modify: `packages/premium/src/session-manager.ts` — `activateSession` stays sync; the new rejected path lives in activation-manager only.
- Modify: `packages/premium/src/types.ts` — add `PremiumActivationStatus` values `rejected` + reason field on `PremiumActivationResult`.
- Modify: `packages/hosted-gateway/src/premium-routes.ts` — `handlePremiumActivation` builds a facilitator-backed verifier (HTTP call to facilitator `/verify`-style endpoint using existing `HTTPFacilitatorClient` from `@x402/core/server` or the existing `callFacilitator` pattern in monetization-gate — reuse, do not reinvent) and awaits activation; HTTP 402 on rejection.
- Modify: `packages/tools/src/premium-tools.ts` — `sap_premium_activate_session` MCP tool handler awaits the now-async activation (check all call sites; `grep -rn "activatePremiumSession"`).

Facilitator verifier implementation note: the real facilitator verify endpoint shape is `POST {facilitatorUrl}/verify` with `{x402Version, paymentPayload, paymentRequirements}`. A bare receipt string is NOT a verify request. Two options (decide in Task 4.1 before implementing):
- **Option A (preferred):** activation payload changes to carry the full x402 `paymentPayload`+`paymentRequirements` instead of an opaque receipt; server verifies via facilitator `/verify`. Breaking API change → bump discovery docs (`buildPremiumDiscoveryDocument`) accordingly.
- **Option B (compat):** keep receipt string but require it to be a settle-transaction signature; verifier resolves it on-chain via existing Solana connection (`packages/adapters/src/solana/connection.ts`), checks: signature finalized, memo/ATA transfer to `payTo` ≥ estimatedPriceUsd, timestamp within TTL window.

**Decision: Option B** — non-breaking, receipt stays opaque, verifier is on-chain signature lookup against the recorded `payTo`/price from the session plan. Test 3's mock verifier mirrors this contract.

### Task 4.3: Commit
```
git commit -m "feat(premium): verify activation receipts on-chain; fail closed without verifier (Finding 2 - fake receipts)"
```

---

## PHASE 5 — Finding 3: tenant-scoped premium sessions

### Task 5.1: RED — tenant scoping tests

**Files:**
- Create: `src/premium/tenant-scoping.test.ts`

New contract on `packages/premium/src/session-manager.ts`:
- `createPremiumSessionPlan(request, owner?: {tenantId: string})` → record gains `tenantId?: string`
- `getPremiumSession(sessionId, viewer?: {tenantId})` → returns null when record.tenantId exists and ≠ viewer.tenantId
- `listPremiumSessions(viewer?)` → returns ONLY the viewer's sessions; unowned (tenantId undefined) sessions never listed to any viewer except undefined-viewer (local mode)
- `activateSession(sessionId, viewer?)` → same scoping; mismatch → status `rejected` reason `not_owned_by_tenant`
- `closeSession(sessionId, reason, viewer?)` → mismatch → false

Tests:
1. tenant A creates, tenant B lists → sees nothing
2. tenant B getPremiumSession(A's id) → null
3. tenant B activateSession(A's id) → rejected
4. tenant B closeSession(A's id) → false
5. undefined viewer (local mode) sees all — backward compat for local stdio usage
6. session created without tenant (local mode) invisible to tenant viewers? — NO: legacy sessions (no tenantId) readable by any authenticated viewer (grace), but never listed by listPremiumSessions to other tenants… **decision: sessions created WITHOUT owner are only visible to undefined-viewer** (strict; hosted always passes owner). Test asserts this.
7. stream/webhook ownership: `handlePremiumStream` + `registerWebhook` receive viewer → mismatch 403

Also: `packages/tools/src/premium-tools.ts` — tool handlers extract tenant identity from `context` (the MCP session id — check `SapMcpContext` for a session identifier; if absent, add `tenantId` to context wiring where hosted server creates per-session context; use `getRateLimitKey`-style identity or the MCP transport session id). Tests for the tool layer:
8. `sap_premium_session_status` without sessionId returns ONLY own sessions (mock two contexts)
9. `sap_premium_stream_poll` on another tenant's session → `sessionStatus: 'not_found'` + no auto-start delivery
10. `sap_premium_close_session` on another tenant's session → success:false

### Task 5.2: GREEN — implement scoping

**Files:**
- `packages/premium/src/session-manager.ts` — owner param + scoping as above; `PremiumSessionRecord.tenantId?: string`
- `packages/premium/src/types.ts` — type update
- `packages/premium/src/stream-broker.ts` + `webhook-engine.ts` — accept/viewer-check sessionId against session tenantId before start/register (mismatch → null/false)
- `packages/premium/src/event-store.ts` — no change (keyed by sessionId already)
- `packages/tools/src/premium-tools.ts` — pass tenant identity from context into every session touchpoint (grep all `getPremiumSession|listPremiumSessions|activateSession|closeSession` call sites)
- `packages/hosted-gateway/src/premium-routes.ts` — stream/webhook/status routes: derive tenant from the auth userId (Task 3 wired auth), pass as viewer
- `packages/hosted-gateway/src/server.ts` — construct per-request context carrying `authResult.userId` → tenantId (hosted mode: userId IS the tenant)

### Task 5.3: Commit
```
git commit -m "feat(premium): tenant-scoped premium sessions, streams, and webhooks (Finding 3)"
```

---

## PHASE 6 — Finding 4: webhook SSRF hardening

### Task 6.1: RED — SSRF filter tests

**Files:**
- Create: `src/premium/webhook-ssrf.test.ts`

New pure module `packages/premium/src/webhook-url-guard.ts` exporting `validateWebhookUrl(targetUrl: string): { ok: boolean; reason?: string }` (replaces the boolean inline check). Tests:
1. `http://127.0.0.1:9/` → reject (also kills the localhost HTTP allowance)
2. `http://localhost:3000/` → false (HTTPS-only, no localhost exception in hosted)
3. `https://127.0.0.1/x` → false
4. `https://10.0.0.5/x`, `https://192.168.1.1/x`, `https://172.16.0.1/x`, `https://172.31.255.1/x` → false each
5. `https://169.254.169.254/latest/meta-data/` → false (cloud metadata — currently MISSING)
6. `https://0.0.0.0/x` → false (currently MISSING)
7. `https://[::1]/x` → false; `https://[fe80::1]/x` → false
8. `https://metadata.google.internal/x` → false (metadata hostname)
9. `https://example.com/x` → true
10. DNS-resolution hook: `validateWebhookUrl` accepts optional `resolveHost?: (host: string) => Promise<string[]>` — test a hostname resolving to `10.0.0.1` → false (DNS-rebinding first-pass). Real impl uses `node:dns/promises` lookup; tests inject fake resolver.
11. Decimal/octal IP evasion: `https://2130706433/` (127.0.0.1 decimal), `https://0x7f.0.0.1/` → false (normalize IP forms)
12. relay:// sentinel → true (unchanged)

### Task 6.2: GREEN — implement guard + wire

**Files:**
- Create: `packages/premium/src/webhook-url-guard.ts` — pure validation + injectable resolver; **always** resolves DNS at registration time and pins the resolved IP for delivery (store `resolvedIps` on the subscription; delivery re-validates each send against the pinned IPs — anti-rebinding).
- Modify: `packages/premium/src/webhook-engine.ts` — use guard in `registerWebhook`/`registerWebhookRelay`; remove localhost/HTTP exception; deny private/link-local/loopback/metadata; **block redirects** (check `res.statusCode` 3xx → abort, record failure; do NOT follow); pin IPs; block 169.254 + 0.0.0.0 + IPv6 ULA/link-local.
- Modify: `packages/premium/src/types.ts` — `PremiumWebhookSubscription.resolvedIps?: string[]`

Delivery-level protections in `deliverWebhook` (add tests for redirect-block and IP-pin revalidation):
13. delivery to URL that redirects → delivery fails, no redirect followed
14. subscription with resolvedIps → each delivery re-checks host resolves to pinned set

### Task 6.3: Commit
```
git commit -m "fix(premium): webhook SSRF hardening — DNS resolve+pin, metadata/private block, no redirects, HTTPS-only (Finding 4)"
```

---

## PHASE 7 — Finding 5: hosted memory tools

### Task 7.1: RED — tool-module gating tests

**Files:**
- Create: `src/tools/memory-module-hosting.test.ts`

Contract: the `memory` tool module in `packages/tools/src/builtin-tool-modules.ts` gets `when: (context) => context.config.mode !== 'hosted-api' || Boolean(context.config.walletPath)` (same predicate as the local-signer module at line 175 — memory shares the same unscoped local SQLite). Tests:
1. hosted-api mode without wallet → module filtered out by `selectToolModulesForContext`
2. hosted-api WITH walletPath → included (local profile hosts are still single-tenant)
3. local stdio mode → included
4. `verify-skill-workflows`/module-registry invariants still hold (`validateToolModules` passes — run its test file)

Also add `sap_memory_*` to `HOSTED_ACCOUNTLESS_UNAVAILABLE_EXACT_TOOLS`? NO — the `when:` predicate removes the whole module from registration; the eligibility gate (`evaluateHostedToolEligibility`) is a second net only for requests that slip through. Add the 20 memory/strategy/stream/audit/hermes tool names to `HOSTED_ACCOUNTLESS_UNAVAILABLE_EXACT_TOOLS` as defense-in-depth and test:
5. hosted mode + `sap_memory_summarize` call → -32011 `hosted_local_signer_required` failure

Wait — adding to the blocked set would ALSO block when walletPath IS set on hosted... check `isHostedAccountlessBlockedTool`: it's only consulted when `!walletPath && !externalSignerUrl` (line 153 guard), so adding the names is safe. Confirm in test 5.

### Task 7.2: GREEN — implement

**Files:**
- Modify: `packages/tools/src/builtin-tool-modules.ts` — add `when` predicate to `memory` module (id: 'memory', line ~421)
- Modify: `packages/payments/src/hosted-tool-eligibility.ts` — add the exact-tool names (sap_memory_record/search/summarize/recall/prune, sap_strategy_save/load/list/activate/execute, sap_stream_buffer/consume/replay, sap_audit_query/record/stats, sap_hermes_search/recent, sap_trade_journal, sap_trade_journal_query) to `HOSTED_ACCOUNTLESS_UNAVAILABLE_EXACT_TOOLS`

### Task 7.3: Commit
```
git commit -m "fix(tools): disable unscoped local memory tools on the hosted accountless API (Finding 5)"
```

---

## PHASE 8 — Full verification + docs

### Task 8.1: Full gates
```
pnpm run typecheck && pnpm run lint && pnpm run test:run && pnpm run build && pnpm run verify:circular-deps && pnpm run check:architecture
```
All green = done. Fix regressions per file (max 3 attempts each, then stop and ask).

### Task 8.2: Response draft to Solking
Draft (no send — user sends): confirm receipt, list fixed findings + commit refs, request the full cited report + 6 medium findings, note test artifacts cleanup (session sap-premium-5c111092, webhook wh-sub-7f7659aa, memory id 17 VERIFY_MARKER), timeline for the on-chain dispute fix.

### Task 8.3: Deploy checklist (user-run, SSH port 22 — verify host key first)
```
cd ~/sap-mcp && git pull --ff-only origin main && pnpm install --frozen-lockfile && pnpm build && pm2 restart sap-mcp-remote
# then live-probe: unauth POST /premium/activate must now 401
```

---

## Execution order & risk notes

1. **Order matters:** Phase 3 (auth) BEFORE Phase 4/5 (they build on the auth result).
2. Phase 4 Option B needs the facilitator `payTo`/price from the session plan — verify `PremiumSessionRecord` carries `estimatedPriceUsd` (it does) and a payment address; if `payTo` is only known at payment time, bind it at activation from the x402 receipt's settlement record instead. Decide during Task 4.1 with a spike test.
3. **Backward compat risk:** Phase 5's strict tenant rule changes hosted behavior for legit MCP clients that didn't pass auth → they now get 401 (Phase 3) — this is INTENTIONAL. Steve gateway sends bearer tokens already (SAP_MCP_TRUSTED_SPONSOR_TOKENS path) — unaffected.
4. Finding 1 (on-chain dispute) is EXPLICITLY OUT OF SCOPE here — needs Anchor program upgrade + redeploy, separate plan after this one ships.
5. Finding 8: grep the VPS deployed source (`~/sap-mcp`) during deploy for `config.url` echo — if present, patch there first with the same TDD flow.

## Existing test infrastructure to reuse
- `src/remote/server.test.ts` — hosted gateway server harness (mock HTTP)
- `src/premium/session-manager.test.ts` — session-manager patterns (env stubbing, clearAllSessions)
- `src/payments/monetization-gate.test.ts` — gate harness (buffered response mocks)
- `packages/tools/src/__tests__/` — tool-layer test patterns