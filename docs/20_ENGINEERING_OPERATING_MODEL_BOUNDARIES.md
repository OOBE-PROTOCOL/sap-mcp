# 20. Engineering Operating Model Boundaries

SAP MCP is one product with two production delivery shapes:

1. hosted Streamable HTTP MCP at `https://mcp.sap.oobeprotocol.ai/mcp`;
2. local stdio/payment/signing bridge on the user's machine.

Treat those as separate service boundaries inside one repository. They share
schemas, tools, policy, docs, and release gates, but each boundary has its own
branch prefix, review focus, and user contract.

## 20.1 Product Personas

| Persona | Primary path | Success condition |
| --- | --- | --- |
| Non-technical user | Desktop Wizard, hosted `sap`, local `sap_payments` bridge | Agent connects, can inspect readiness, and can complete paid/write flows without editing config by hand. |
| Developer | CLI wizard, local stdio MCP, docs, npm package | Can run, test, debug, and integrate SAP MCP from source or npm with predictable commands. |
| Agent operator | Hosted MCP plus local signer/profile | Agent can discover tools, read server metadata, call free planners, and route paid/write work through local signing. |
| Hosted operator | Remote server, PM2, env config, release workflows | Can deploy and monitor the hosted gateway without exposing wallets, provider keys, or facilitator secrets. |
| Integration maintainer | Runtime-specific config injection and optional MCP manifests | Can add or repair client integrations without corrupting existing user config. |

## 20.2 Service Boundaries

| Boundary | Source | Public contract | Must not do |
| --- | --- | --- | --- |
| Hosted MCP gateway | `src/remote/`, `src/transports/http.ts`, `src/server/` | `/mcp`, `/server.json`, `/pricing.json`, `/.well-known/sap-mcp-tool-catalog.json`, well-known descriptors, MCP tool/resource/prompt responses | Custody user wallets, leak provider secrets, require local file access. |
| Local bridge | `src/bin/`, `src/transports/stdio.ts`, `src/signer/`, `src/policy/`, `src/memory/` | `sap_payments_*`, local signer preview/sign/finalize, Hermes memory bridge | Return keypair bytes, bypass spending policy, sign opaque risky transactions silently. |
| Wizard | `src/config/`, `src/tui/`, `src/wizard-core/`, `apps/desktop/` | One profile model across CLI, TUI, and Desktop; safe runtime config injection | Maintain a second wallet/config model or overwrite unrelated client settings. |
| MCP Apps UI | `src/ui/`, `src/adapters/mcp/` | Valid `ui://` resource blocks plus actual `structuredContent` | Insert unescaped dynamic HTML or require UI support for correctness. |
| Payments | `src/payments/`, `src/tools/x402-paid-call-tool.ts` | x402/pay.sh challenge, receipt, paid-call replay, pricing catalog | Treat estimated price as final truth when a challenge says otherwise. |
| Protocol tools | `src/tools/`, `src/sap/`, `src/perps/`, `src/resources/`, `src/schemas/` | Read tools, unsigned builders, transaction preview metadata, SAP protocol invariants | Submit value-moving actions without local approval/signing boundary. |
| Release ops | `.github/`, `scripts/`, `docs/`, `USER_DOCS/` | CI, desktop artifacts, checksums, npm package, changelog, user docs | Publish unsigned binaries as silent final releases or ship docs that require private secrets. |

## 20.2.1 Modular Workspace

The repo uses a pnpm workspace with internal package boundaries under
`packages/*`. The root package remains the public npm surface; internal
packages are private until source extraction is complete. Consumable modular
APIs are exposed through root package subpath exports so devs and agents can
depend on stable boundaries before physical extraction.

Phase 1 package boundaries:

| Internal package | Current source | Architecture domain | Extraction status |
| --- | --- | --- | --- |
| `@oobe-protocol-labs/sap-mcp-core` | `src/core` | `core` | Exposed as `@oobe-protocol-labs/sap-mcp-server/core`. |
| `@oobe-protocol-labs/sap-mcp-schemas` | `src/schemas` | `schemas` | Exposed as `@oobe-protocol-labs/sap-mcp-server/schemas`. |
| `@oobe-protocol-labs/sap-mcp-mcp-adapter` | `src/adapters/mcp` | `mcp-adapter` | Exposed as `@oobe-protocol-labs/sap-mcp-server/mcp-adapter`. |
| `@oobe-protocol-labs/sap-mcp-ui-cards` | `src/ui` | `ui-cards` | Exposed as `@oobe-protocol-labs/sap-mcp-server/ui-cards`; includes rendering-only MCP Apps Card coverage diagnostics. |
| `@oobe-protocol-labs/sap-mcp-tools` | `src/tools` | `tools` | Exposed as `@oobe-protocol-labs/sap-mcp-server/tools`; owns the module registry, built-in catalog, runtime filtering, and trusted plugin helpers. |
| `@oobe-protocol-labs/sap-mcp-config-runtime` | `src/config` | `config` | Exposed as `@oobe-protocol-labs/sap-mcp-server/config-runtime`; owns secure config, profile selection, runtime doctor, and client injection. |
| `@oobe-protocol-labs/sap-mcp-server-runtime` | `src/server` | `server` | Exposed as `@oobe-protocol-labs/sap-mcp-server/server-runtime`; owns shared MCP server bootstrap, capability registration, and server metadata. |
| `@oobe-protocol-labs/sap-mcp-hosted-gateway` | `src/remote` | `remote-server` | Exposed as `@oobe-protocol-labs/sap-mcp-server/hosted-gateway`; owns hosted Streamable HTTP MCP, public metadata, premium remote routes, and deployment behavior. |
| `@oobe-protocol-labs/sap-mcp-local-bridge` | `src/local-bridge`, `src/transports/stdio.ts`, `src/bin`, `src/runtime` | `local-bridge` | Exposed as `@oobe-protocol-labs/sap-mcp-server/local-bridge`; owns local stdio entrypoints, bridge process orchestration, and `sap_payments` runtime. |
| `@oobe-protocol-labs/sap-mcp-wizard-core` | `src/wizard-core` | `wizard` | Exposed as `@oobe-protocol-labs/sap-mcp-server/wizard-core`; owns shared CLI/Desktop wizard setup flow and hosted discovery metadata. |

Architecture boundaries are enforced by:

```bash
pnpm run check:architecture
```

The checker reads `config/architecture-boundaries.json` and fails when a lower
level domain imports an unauthorized higher-level domain, when an allowed-domain
policy references an unknown domain, or when a source file is not assigned to an
architecture domain. The release gate runs this check before tests.

Subpath exports are enforced by:

```bash
pnpm run verify:exports
```

The verifier reads `config/package-export-contracts.json`, confirms each export
target exists after build, imports each built entrypoint, and checks the stable
symbol contract for `core`, `schemas`, `mcp-adapter`, `ui-cards`, `tools`,
`config-runtime`, `server-runtime`, `hosted-gateway`, `local-bridge`, and
`wizard-core`.

Workspace package contracts are enforced by:

```bash
pnpm run verify:workspace-packages
```

The verifier reads `config/workspace-package-contracts.json`, confirms every
`packages/*` module is declared, checks package names and versions against the
root release, verifies `sapMcp` ownership metadata, confirms each package
`sapMcp.apiContract` points at the matching subpath export symbol contract, and
confirms each source boundary, additional source boundary, architecture-domain
mapping, and README fast-resolution phrase still exists.

Trusted tool plugin template compatibility is enforced by:

```bash
pnpm run verify:tool-plugin-template
```

This runs the private workspace template package as an isolated typecheck so
new external tool-family examples continue to compile against the public
`./tools` and `./mcp-adapter` subpath contracts.

Shared tool execution pipeline adoption is enforced by:

```bash
pnpm run verify:tool-execution-pipeline
```

This checks the public pipeline exports, required migration evidence, docs, and
the current migrated tool set so new tool classes and trusted plugin tools have
a common input-validation and structured-response path.

Unified release readiness is enforced by:

```bash
pnpm run verify:readiness-report
```

The report cross-checks runtime tool catalogs, module policy metadata, MCP Apps
Card coverage, package subpath contracts, workspace package contracts,
architecture-domain package mappings, architecture domain model consistency,
package public symbol ownership, CI workflow commands, branch prefixes, service
contracts, tool plugin template status, tool execution pipeline adoption, Wizard readiness contracts, runtime client injection contracts, and release personas. It is part of both
local release gates and GitHub workflow gates.

Skill workflow contracts are enforced by:

```bash
pnpm run verify:skill-workflows
```

The checker reads `config/skill-workflow-contracts.json`, confirms every bundled
SAP skill exists, checks the skill index, validates the critical `sap-mcp`
bootstrap and local-bridge routing phrases, rejects placeholder language, and
ensures CI, desktop release, and release gates keep running the skill workflow
contract. This keeps agent routing, branch policy, and user-facing workflow docs
from drifting apart.

Company readiness requirements are enforced by:

```bash
pnpm run verify:company-readiness
```

The checker reads `config/company-readiness-contracts.json` and validates the
explicit requirement-to-evidence matrix for modularity, hosted/local trust
boundaries, wizard personas, tool/plugin validation, MCP Apps Cards, skill
governance, branch/CI/release workflow, normie/developer/agent releases,
technical documentation names, and secret-boundary safety.

MCP Apps Card coverage is computed by `buildToolCardCoverageReport` from a list
of tool names. `config/mcp-apps-card-contracts.json` defines high-value tools
that must stay on specialized cards plus the minimum specialized-card coverage
for runtime catalogs. Production UI code must keep this dependency direction
one-way: the tool catalog may pass expected tool names into `ui-cards`, but
`src/ui` must not import `src/tools`.

Tool registration is module-driven. Each tool family declares a
`ToolModuleDefinition` manifest with category, order, optional runtime
predicate, optional dependencies, expected tool names, and a registration
callback. Hosted non-custodial mode, local signer mode, and
`SAP_MCP_PAYMENTS_BRIDGE_ONLY=true` select different module sets without
duplicating the server bootstrap flow.

## 20.3 Branch Policy

Use `main` only for production-ready tagged releases and `develop` for
integration. Use `release/<version>` for release prep and `hotfix/<slug>` for
urgent production fixes.

Component branches must use these prefixes:

```txt
feature/hosted-mcp/<slug>
feature/local-bridge/<slug>
feature/wizard/<slug>
feature/mcp-apps-ui/<slug>
feature/payments-x402/<slug>
feature/protocol-tools/<slug>
feature/integrations/<slug>
feature/release-ops/<slug>
```

The same branch families are tracked as glob-style skill workflow contracts for
CI and release review:

```txt
feature/hosted-mcp/*
feature/local-bridge/*
feature/wizard/*
feature/mcp-apps-ui/*
feature/payments-x402/*
feature/protocol-tools/*
feature/integrations/*
feature/release-ops/*
```

Each branch should keep one primary service boundary. Cross-boundary PRs are
allowed only when they change a shared contract, and the PR must update tests,
docs, and migration notes together.

Every PR must use `.github/pull_request_template.md`. The required sections and
checklist phrases live in `config/branch-review-contracts.json`, and the
readiness report checks that branch prefixes, service-boundary review fields,
hosted `sap`, local `sap_payments`, contract updates, verification commands,
and secret/custody safety remain visible before review.

## 20.4 Review Checklist

Every PR must answer:

1. Which service boundary changed?
2. Which public MCP, x402, signer, wizard, or package contract changed?
3. Does this affect hosted `sap`, local `sap_payments`, or both?
4. Is the change safe for non-technical users?
5. Is the agent recovery path discoverable through free tools or docs?
6. Are keypair bytes, provider keys, facilitator secrets, and wallet paths still excluded from outputs and examples?
7. Did the PR add or update regression tests for the changed boundary?
8. Did docs and release notes change when behavior changed?

## 20.5 Wizard Standard

The wizard must support three mental models without forking product behavior:

| Mode | User language | Engineering behavior |
| --- | --- | --- |
| Normie | "Connect my agent to SAP MCP" | Default to hosted `sap`, create/repair local profile, install local `sap_payments`, explain only the next required action. |
| Developer | "Show me exactly what changed" | Print paths, runtime config snippets, env names, repair command, and dry-run/verbose options. |
| Agent | "Discover and repair my route" | Expose free runtime status, repair plan, pricing catalog, action planner, and signer readiness tools. |

All three modes must converge on the same profile directory, signing policy, and
payment bridge. The Desktop Wizard is not allowed to invent a parallel config
schema.

## 20.6 Release Channels

| Channel | Audience | Gate |
| --- | --- | --- |
| Source branch | Maintainers | PR CI on Ubuntu and Windows. |
| npm package | Developers and agents using `npx` | `pnpm run verify:release` plus npm pack dry-run. |
| GitHub desktop release | Non-technical users | Multi-OS desktop build, artifact verification, checksums, signing/notarization status in release notes. |
| Hosted gateway deploy | Hosted users and agents | Release tag, smoke test `/mcp`, `/server.json`, `/pricing.json`, well-known descriptors, and paid-call challenge flow. |

Final public tags use plain SemVer such as `0.9.74`. Release candidates may use
`release/<version>-rc.<n>` branches, but public final tags stay plain version
numbers.

## 20.7 Definition Of Done

A company-grade SAP MCP release is done only when:

1. `pnpm run verify:release` passes.
2. `pnpm run check:architecture` passes.
3. Hosted and local MCP contracts are documented.
4. Normie, developer, and agent onboarding paths are documented.
5. MCP Apps responses preserve text, `structuredContent`, and `ui://` card output.
6. Local signing and paid/write bridge flows keep user custody local.
7. Desktop artifacts include checksums and signing status.
8. Changelog explains migration, security, payment, wizard, and client-config changes.
9. No public docs or package examples require private infrastructure secrets.
