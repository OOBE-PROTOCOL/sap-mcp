# Service Boundary

Primary boundary:

- [ ] Hosted MCP gateway
- [ ] Local bridge
- [ ] Wizard
- [ ] MCP Apps UI
- [ ] Payments/x402
- [ ] Protocol tools
- [ ] Integrations/runtime injection
- [ ] Release ops/docs

# Runtime Impact

- Hosted sap impact:
- local sap_payments impact:
- Runtime clients touched: Codex / Claude / Hermes / OpenClaw / ClawPump / other / none

# Contract Changes

- [ ] No public contract changed
- [ ] Updated `config/wizard-readiness-contracts.json`
- [ ] Updated `config/runtime-client-injection-contracts.json`
- [ ] Updated `config/mcp-apps-card-contracts.json`
- [ ] Updated `config/tool-execution-pipeline-contracts.json`
- [ ] Updated package export/workspace/architecture contracts

# Verification

- [ ] `pnpm run check:architecture`
- [ ] `pnpm run verify:tool-execution-pipeline`
- [ ] `pnpm run verify:company-readiness`
- [ ] `pnpm run verify:readiness-report`
- [ ] `pnpm run test:run`
- [ ] Added or updated focused regression tests

# Docs And Release Notes

- [ ] User docs updated when behavior changed
- [ ] Engineering docs updated when a boundary or contract changed
- [ ] Changelog or release notes updated when user-visible behavior changed

# Secret And Custody Safety

- [ ] No keypair bytes, seed phrases, wallet paths, RPC API keys, facilitator secrets, or private VPS paths are logged, returned, or documented
- [ ] Hosted sap remains accountless/non-custodial
- [ ] Value-moving actions still route through local signer, external signer, or explicit user approval

# User Impact

- Normie path:
- Developer path:
- Agent/operator recovery path:
