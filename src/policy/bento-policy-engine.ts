/**
 * Bento Policy Engine
 * 
 * Cloud-based policy engine using Bento Guard SDK
 * Provides AI intent scoring, escalation, and strike system
 * 
 * Optional integration - only used if API key is provided
 * 
 * Note: @bentoguard/sdk is an optional dependency.
 * Install with: npm install @bentoguard/sdk
 */

import type { PolicyDecision, PolicyContext } from './local-policy-engine.js';

type BentoVerdictValue = 'ALLOW' | 'BLOCKED' | 'ESCALATED';

interface BentoAnalysisResult {
  verdict: BentoVerdictValue | string;
  reasoning?: string;
  strikeCount?: number;
  intentScore?: number;
}

interface BentoAgentStatus {
  active: boolean;
  strikeCount: number;
  reputation: number;
}

interface BentoClientInstance {
  getAgentStatus?: () => Promise<BentoAgentStatus>;
  status?: () => Promise<BentoAgentStatus>;
}

type BentoClientConstructor = new (config: { apiKey: string; agentId: string }) => BentoClientInstance;
type BentoProtectFunction = (
  client: BentoClientInstance,
  request: {
    action: string;
    context: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }
) => Promise<BentoAnalysisResult>;

interface BentoModule {
  BentoClient: BentoClientConstructor;
  protect: BentoProtectFunction;
}

type BentoModuleLoader = () => Promise<unknown>;

let bentoModuleLoader: BentoModuleLoader = () => import('@bentoguard/sdk');

/**
 * @name isBentoModule
 * @description Validates the optional Bento SDK module shape after dynamic import.
 * @param value - Imported module namespace.
 * @returns True when the module exposes BentoClient and protect.
 */
function isBentoModule(value: unknown): value is BentoModule {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as Partial<BentoModule>).BentoClient === 'function'
    && typeof (value as Partial<BentoModule>).protect === 'function';
}

/**
 * @name setBentoModuleLoaderForTests
 * @description Overrides the Bento SDK loader for deterministic integration tests.
 * @param loader - Test-controlled module loader.
 * @returns Cleanup function that restores the previous loader.
 */
export function setBentoModuleLoaderForTests(loader: BentoModuleLoader): () => void {
  const previousLoader = bentoModuleLoader;
  bentoModuleLoader = loader;
  return () => {
    bentoModuleLoader = previousLoader;
  };
}

export interface BentoConfig {
  /** Bento API key from dashboard */
  apiKey: string;
  /** Agent ID registered on Bento dashboard */
  agentId: string;
  /** Bento API endpoint (optional, defaults to production) */
  endpoint?: string;
}

export class BentoPolicyEngine {
  private client: BentoClientInstance | null = null;
  private config: BentoConfig;
  private protectFn: BentoProtectFunction | null = null;
  private initialized: boolean = false;

  constructor(config: BentoConfig) {
    this.config = config;
    // Don't await in constructor - use lazy initialization
  }

  /**
   * Initialize Bento SDK lazily (ESM compatible)
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Use dynamic import() for ESM compatibility while keeping the SDK optional.
      const bentoModule: unknown = await bentoModuleLoader();
      if (!isBentoModule(bentoModule)) {
        throw new Error('Bento SDK does not expose BentoClient and protect');
      }
      
      this.client = new bentoModule.BentoClient({
        apiKey: this.config.apiKey,
        agentId: this.config.agentId,
      });
      this.protectFn = bentoModule.protect;
      this.initialized = true;
    } catch (_error) {
      throw new Error(
        'Bento Guard SDK not installed. Install with: npm install @bentoguard/sdk'
      );
    }
  }

  /**
   * Validate action using Bento's AI-powered policy engine
   */
  async validateAction(context: PolicyContext): Promise<PolicyDecision> {
    try {
      // Lazy initialization
      await this.initialize();
    
      if (!this.client || !this.protectFn) {
        throw new Error('Bento SDK not initialized');
      }
    
      const result = await this.protectFn(this.client, {
        action: `sap:${context.toolName}`,
        context: {
          args: context.args,
          amount: context.amount,
          programId: context.programId,
          destination: context.destination,
          user: context.user,
        },
        metadata: {
          timestamp: context.timestamp ?? Date.now(),
          agentId: this.config.agentId,
        },
      });

      return this.mapVerdictToDecision(result);
    } catch (error) {
      // Bento service unavailable - return decision to fallback
      throw new BentoUnavailableError(
        `Bento Guard unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Map Bento verdict to our PolicyDecision format
   */
  private mapVerdictToDecision(result: BentoAnalysisResult): PolicyDecision {
    const verdict = result.verdict; // 'ALLOW' | 'BLOCKED' | 'ESCALATED'

    switch (verdict) {
      case 'ALLOW':
        return {
          allowed: true,
          reason: result.reasoning || 'Bento policy check passed',
          rule: 'bento-allow',
          metadata: {
            provider: 'bento',
            verdict,
            strikeCount: result.strikeCount,
            intentScore: result.intentScore,
          },
        };

      case 'BLOCKED':
        return {
          allowed: false,
          blocked: true,
          reason: result.reasoning || 'Blocked by Bento policy',
          rule: 'bento-block',
          metadata: {
            provider: 'bento',
            verdict,
            strikeCount: result.strikeCount,
            intentScore: result.intentScore,
          },
        };

      case 'ESCALATED':
        return {
          allowed: false,
          escalated: true,
          reason: result.reasoning || 'Requires human approval',
          rule: 'bento-escalate',
          metadata: {
            provider: 'bento',
            verdict,
            strikeCount: result.strikeCount,
            intentScore: result.intentScore,
            escalationType: 'human-review',
          },
        };

      default:
        return {
          allowed: false,
          blocked: true,
          reason: `Unknown Bento verdict: ${verdict}`,
          rule: 'bento-unknown-verdict',
          metadata: {
            provider: 'bento',
            verdict,
          },
        };
    }
  }

  /**
   * Get agent status from Bento
   */
  async getAgentStatus(): Promise<{
    active: boolean;
    strikeCount: number;
    reputation: number;
  }> {
    try {
      await this.initialize();
      if (!this.client) {
        throw new Error('Bento SDK not initialized');
      }

      if (typeof this.client.getAgentStatus === 'function') {
        return this.client.getAgentStatus();
      }

      if (typeof this.client.status === 'function') {
        return this.client.status();
      }

      throw new Error('Installed Bento SDK does not expose an agent status API');
    } catch (error) {
      throw new BentoUnavailableError(
        `Cannot fetch agent status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if Bento is available (ping test)
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.getAgentStatus();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Error thrown when Bento service is unavailable
 */
export class BentoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BentoUnavailableError';
  }
}

/**
 * Create Bento config from environment variables
 */
export function createBentoConfigFromEnv(): BentoConfig | null {
  const apiKey = process.env.SAP_MCP_BENTO_API_KEY;
  const agentId = process.env.SAP_MCP_BENTO_AGENT_ID || 'sap-mcp-server';
  const endpoint = process.env.SAP_MCP_BENTO_ENDPOINT;

  if (!apiKey) {
    return null; // Bento not configured
  }

  return {
    apiKey,
    agentId,
    endpoint,
  };
}
