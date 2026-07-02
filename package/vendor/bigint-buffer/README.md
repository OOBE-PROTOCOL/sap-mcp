# bigint-buffer Compatibility Package

SAP MCP vendors this compatibility package because the public `bigint-buffer`
registry package has an advisory against the native binding path and no patched
`1.1.6` release is currently published.

This package preserves the small CommonJS API used transitively by Solana
buffer-layout utilities while avoiding native bindings entirely.
