# @oobe-protocol-labs/sap-mcp-wizard-core

Internal package boundary for `packages/wizard-core/src`.

This package owns the shared setup flow used by the CLI wizard and desktop
wizard: hosted discovery metadata, profile defaults, runtime repair inputs, and
cross-platform setup behavior that must stay consistent across terminal and GUI
entrypoints.

Stable import:

```ts
import { getDesktopHostedDiscovery } from '@oobe-protocol-labs/sap-mcp-server/wizard-core';
```

The desktop wizard may render different controls, but it must keep using this
boundary instead of inventing a second config schema, wallet model, or local
bridge install path.

Release checks bind this boundary to `config/wizard-readiness-contracts.json`.
When hosted discovery URLs, default runtime setup, readiness statuses, or
required `sap_payments` bridge tools change, update the contract, the wizard
core, and the desktop wizard tests together.

Runtime client config variants are tracked separately in
`config/runtime-client-injection-contracts.json` so this package can stay
focused on wizard orchestration while config-runtime owns the concrete Codex,
Claude, Hermes, OpenClaw, and ClawPump injection shapes.
