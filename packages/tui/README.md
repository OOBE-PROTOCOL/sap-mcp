# SAP MCP tui

Terminal UI wizard save helper. The real source remains in `src/tui/wizard-save.ts`
because it is excluded from the packages build (`tsconfig.packages.json` excludes `src/tui`).

This package entry exists only to satisfy the workspace package contract. It has
`physicalSource: false` and no source files under `packages/tui/src/`.