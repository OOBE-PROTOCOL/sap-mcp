# SAP MCP Tool Plugin Template

This package is a workspace template for trusted SAP MCP tool plugin modules.
It is intentionally private and is not part of the public runtime package.

Use this template when a new tool family should remain separate from the core
server while still following the SAP MCP module registry contract.

## Contract

Each plugin package should export one or more `ToolModuleDefinition` values
created with `createPluginToolModule`.

Real plugin packages should declare
`@oobe-protocol-labs/sap-mcp-server` as a peer dependency matching the host
major/minor release. The workspace template itself stays dependency-free so it
does not affect root installs or release packaging.

Required rules:

1. Use a stable namespace prefix in every module id, for example `acme-price-feed`.
2. Pass `packageName` and `version` to `createPluginToolModule` so every module has provenance in runtime plans and reports.
3. Keep manifest metadata data-only: no secrets, private paths, key material, or live provider claims.
4. Register tools only in the explicit `register(server, context)` callback, using `registerToolFamilyPipelineTool` or a typed family adapter.
5. Declare at least one `expectedTools` entry for smoke verification.
6. Prefix every expected tool with the namespace converted to snake case, for example namespace `acme-market` uses `acme_market_*`.
7. Use `when(context)` to keep hosted/local/wallet-only tools behind the right trust boundary.
8. Use orders `5000-8999` for third-party modules unless a host integration assigns a tighter range. `createPluginToolModule` enforces this range.
9. Use lifecycle hooks only for telemetry, diagnostics, and operator traces.
10. Import trusted plugin modules in server bootstrap and pass them through `registerToolsWithSummary`.

Do not import or call the lower-level MCP SDK compatibility bridge from plugin
packages. The host package keeps `registerTool` available for internal adapter
compatibility, but plugin authors should stay on the pipeline API so input
validation, structured responses, execution metadata, MCP Apps Cards, and
legacy registration guards remain consistent.

## Host Integration

```ts
import {
  PLUGIN_TOOL_MODULE_ORDER_MAX,
  PLUGIN_TOOL_MODULE_ORDER_MIN,
  createToolModuleRegistrationPlan,
  registerToolsWithSummary,
} from '@oobe-protocol-labs/sap-mcp-server/tools';
import { acmePriceFeedModule } from '@acme/sap-mcp-tools';

console.info('SAP MCP plugin order range', {
  min: PLUGIN_TOOL_MODULE_ORDER_MIN,
  max: PLUGIN_TOOL_MODULE_ORDER_MAX,
});

const modules = [acmePriceFeedModule];
const plan = createToolModuleRegistrationPlan(modules, context);

console.info('SAP MCP plugin registration plan', {
  selected: plan.selectedModuleIds,
  skipped: plan.skippedModuleIds,
  expectedTools: plan.expectedTools,
});

await registerToolsWithSummary(server, context, {
  additionalModules: modules,
});
```

Do not load executable plugin code from MCP tool input, public JSON manifests,
or unauthenticated remote URLs. Public/private plugin discovery should publish
validated manifest data; runtime execution should come from packages reviewed
and imported by the deployment owner.
