# @oobe-protocol-labs/sap-mcp-tools

Internal package boundary for `packages/tools/src`.

This package owns the `ToolModuleDefinition` registry, built-in tool catalog,
tool execution metadata, runtime profile filtering, and trusted plugin module
integration helpers.

New first-party tool families belong in `src/tools/builtin-tool-modules.ts`.
External tool families should start from `packages/tool-plugin-template` and
enter the host only through reviewed imports passed to `registerToolsWithSummary`.
