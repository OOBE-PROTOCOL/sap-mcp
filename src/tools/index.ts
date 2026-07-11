/**
 * Tools module barrel export
 */

export { registerTools } from './register-tools.js';

// REAL SAP SDK TOOLS (75 tools)
export { registerSapSdkTools } from './sap-sdk-tools.js';

// REAL SAP SNS TOOLS — SNS integration exported by synapse-sap-sdk v0.21
export { registerSapSnsTools } from './sap-sns-tools.js';

// REAL CLIENT SDK TOOLS — SynapseAgentKit plugin tools plus compatibility tools
export { registerClientSdkTools } from './client-sdk-tools.js';

// REAL TRANSACTION TOOLS — decode, preview, sign, and submit Solana transactions
export { registerTransactionTools } from './transaction-tools.js';

// REAL CHAT TOOLS — signed group rooms, manifests, chunked messages, history, and ciphertext transport
export { registerChatTools } from './chat-tools.js';

// REAL X402 HOSTED PAYMENT TOOL — local signer helper for paid remote MCP calls
export { registerX402PaidCallTool } from './x402-paid-call-tool.js';

// REAL PROFILE TOOLS — inspect and switch loaded SAP MCP profiles without exposing keypairs
export { registerProfileTools } from './profile-tools.js';

// REAL SKILL TOOLS — list, bundle, and install SAP MCP agent skills
export { registerSkillsTools } from './skills-tools.js';

// REAL MAGICBLOCK TOOLS — 20 tools for ER Router, Private Payments, and VRF
export { registerMagicBlockTools } from './magicblock-tools.js';
