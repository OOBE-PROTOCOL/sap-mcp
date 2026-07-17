/**
 * Register all MCP prompts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../core/logger.js';
import type { SapMcpContext } from '../core/types.js';

// Registry prompts
import { registerSapAgentPrompt } from './registry/register-sap-agent.prompt.js';
import { analyzeSapAgentPrompt } from './registry/analyze-sap-agent.prompt.js';

// Developer prompts
import { generateSapIntegrationPrompt } from './developer/generate-sap-integration.prompt.js';
import { debugSapErrorPrompt } from './developer/debug-sap-error.prompt.js';

// Payments prompts
import { explainX402SettlementPrompt } from './payments/explain-x402-settlement.prompt.js';
import { createPaidApiPrompt } from './payments/create-paid-api.prompt.js';

// Execution-proof prompts
import { explainProofOfExecutionPrompt } from './execution-proof/explain-proof-of-execution.prompt.js';
import { verifyExecutionProofPrompt } from './execution-proof/verify-execution-proof.prompt.js';

// Context prompts
import { sapAgentStartPrompt } from './context/sap-agent-start.prompt.js';
import { sapAgentContextPrompt } from './context/sap-agent-context.prompt.js';

/**
 * Register all prompts with the MCP server
 */
export async function registerPrompts(server: Server, context: SapMcpContext): Promise<void> {
  logger.debug('Registering prompts');
  
  // Register all SAP prompts
  registerSapAgentPrompt(server, context);
  analyzeSapAgentPrompt(server, context);
  
  // Register developer prompts
  generateSapIntegrationPrompt(server, context);
  debugSapErrorPrompt(server, context);
  
  // Register payments prompts
  explainX402SettlementPrompt(server, context);
  createPaidApiPrompt(server, context);
  
  // Register execution-proof prompts
  explainProofOfExecutionPrompt(server, context);
  verifyExecutionProofPrompt(server, context);
  
  // Register context prompts
  sapAgentStartPrompt(server, context);
  sapAgentContextPrompt(server, context);
  
  logger.debug('Prompts registered', { count: 10 });
}
