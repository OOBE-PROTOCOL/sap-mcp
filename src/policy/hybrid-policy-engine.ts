/**
 * @name HybridPolicyEngine
 * @description Combines deterministic local guardrails with optional Bento Guard intent scoring.
 *
 * Flow:
 * 1. Local deterministic guardrails always run in hybrid mode.
 * 2. Bento runs only after local checks pass.
 * 3. Bento outages follow the configured fail-open or fail-closed policy.
 * 4. Local-only mode never depends on external services.
 */

import { LocalPolicyEngine, PolicyConfig, PolicyDecision, PolicyContext } from './local-policy-engine.js';
import { BentoPolicyEngine, BentoConfig, BentoUnavailableError } from './bento-policy-engine.js';
import { logger } from '../core/logger.js';

/**
 * @name HybridPolicyConfig
 * @description Runtime configuration for local, Bento-only, and hybrid policy enforcement.
 */
export interface HybridPolicyConfig {
  /** Local policy configuration. */
  local: PolicyConfig;
  /** Optional Bento Guard configuration. */
  bento?: BentoConfig | null;
  /** Policy engine mode. */
  mode: 'local-only' | 'bento-only' | 'hybrid';
  /** Whether policy decisions should be written to the structured logger. */
  logging?: boolean;
  /** Whether Bento outages should allow locally approved requests. */
  failOpen?: boolean;
}

/**
 * @name HybridPolicyEngine
 * @description Runtime service that validates tool calls through local and optional Bento policies.
 */
export class HybridPolicyEngine {
  private localEngine: LocalPolicyEngine;
  private bentoEngine: BentoPolicyEngine | null = null;
  private config: HybridPolicyConfig;
  private bentoAvailable: boolean = false;

  public constructor(config: HybridPolicyConfig) {
    this.config = {
      ...config,
      logging: config.logging ?? true,
      failOpen: config.failOpen ?? false,
    };

    this.localEngine = new LocalPolicyEngine(config.local);

    if (config.bento && config.mode !== 'local-only') {
      try {
        this.bentoEngine = new BentoPolicyEngine(config.bento);
        void this.checkBentoAvailability();
      } catch (error) {
        logger.warn('Hybrid policy failed to initialize Bento', { error });
        this.bentoEngine = null;
      }
    }
  }

  /**
   * @name checkBentoAvailability
   * @description Checks Bento Guard availability in the background without blocking server startup.
   */
  private async checkBentoAvailability(): Promise<void> {
    if (!this.bentoEngine) {
      this.bentoAvailable = false;
      return;
    }

    try {
      this.bentoAvailable = await this.bentoEngine.isAvailable();
      if (this.bentoAvailable && this.config.logging) {
        logger.info('Hybrid policy Bento Guard available');
      }
    } catch (error) {
      this.bentoAvailable = false;
      if (this.config.logging) {
        logger.warn('Hybrid policy Bento Guard unavailable', { error });
      }
    }
  }

  /**
   * @name validateToolCall
   * @description Validates a tool call using the configured policy mode.
   */
  public async validateToolCall(context: PolicyContext): Promise<PolicyDecision> {
    const startTime = Date.now();
    let decision: PolicyDecision;

    try {
      // Determine which engine to use
      switch (this.config.mode) {
        case 'bento-only':
          decision = await this.validateWithBento(context);
          break;

        case 'local-only':
          decision = await this.validateWithLocal(context);
          break;

        case 'hybrid':
        default:
          decision = await this.validateHybrid(context);
          break;
      }

      // Add timing metadata
      decision.metadata = {
        ...decision.metadata,
        validationTimeMs: Date.now() - startTime,
        engine: this.getEngineUsed(),
      };

      // Log decision
      if (this.config.logging) {
        this.logDecision(context, decision);
      }

      return decision;
    } catch (error) {
      // Unexpected error - handle based on failOpen setting
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (this.config.logging) {
        logger.error('Hybrid policy unexpected error', { error: errorMessage });
      }

      if (this.config.failOpen) {
        return {
          allowed: true,
          reason: `Policy engine error, failing open: ${errorMessage}`,
          rule: 'error-fail-open',
          metadata: {
            error: errorMessage,
            failOpen: true,
          },
        };
      } else {
        return {
          allowed: false,
          blocked: true,
          reason: `Policy engine error, failing closed: ${errorMessage}`,
          rule: 'error-fail-closed',
          metadata: {
            error: errorMessage,
            failOpen: false,
          },
        };
      }
    }
  }

  /**
   * @name validateWithBento
   * @description Validates a tool call exclusively through Bento Guard.
   */
  private async validateWithBento(context: PolicyContext): Promise<PolicyDecision> {
    if (!this.bentoEngine) {
      throw new Error('Bento engine not initialized');
    }

    return this.bentoEngine.validateAction(context);
  }

  /**
   * @name validateWithLocal
   * @description Validates a tool call exclusively through local deterministic policies.
   */
  private async validateWithLocal(context: PolicyContext): Promise<PolicyDecision> {
    return this.localEngine.validateToolCall(context);
  }

  /**
   * @name validateHybrid
   * @description Runs local guardrails first and then Bento Guard when configured.
   */
  private async validateHybrid(context: PolicyContext): Promise<PolicyDecision> {
    const localDecision = await this.localEngine.validateToolCall(context);
    if (!localDecision.allowed || localDecision.blocked || localDecision.escalated) {
      return {
        ...localDecision,
        metadata: {
          ...localDecision.metadata,
          provider: 'local',
          hybridStage: 'local-guardrail',
        },
      };
    }

    // Try Bento after deterministic local guardrails pass.
    if (this.bentoEngine) {
      try {
        const bentoDecision = await this.bentoEngine.validateAction(context);
        this.bentoAvailable = true;
        return {
          ...bentoDecision,
          metadata: {
            ...bentoDecision.metadata,
            localDecision: localDecision.reason,
            hybridStage: 'bento-after-local',
          },
        };
      } catch (error) {
        if (error instanceof BentoUnavailableError) {
          this.bentoAvailable = false;
          if (!this.config.failOpen) {
            return {
              allowed: false,
              blocked: true,
              reason: error.message,
              rule: 'bento-unavailable-fail-closed',
              metadata: {
                provider: 'bento',
                failOpen: false,
                localDecision: localDecision.reason,
              },
            };
          }

          if (this.config.logging) {
            logger.warn('Hybrid policy Bento unavailable; using local allow because failOpen=true');
          }
          return {
            ...localDecision,
            metadata: {
              ...localDecision.metadata,
              provider: 'local',
              bentoUnavailable: true,
              failOpen: true,
            },
          };
        } else {
          // Other error - rethrow
          throw error;
        }
      }
    }

    return localDecision;
  }

  /**
   * @name getEngineUsed
   * @description Returns the policy engine that is expected to have produced the most recent decision.
   */
  private getEngineUsed(): 'bento' | 'local' | 'error' {
    if (this.config.mode === 'local-only') {
      return 'local';
    }
    if (this.config.mode === 'bento-only') {
      return 'bento';
    }
    // Hybrid mode
    if (this.bentoEngine && this.bentoAvailable) {
      return 'bento';
    }
    return 'local';
  }

  /**
   * @name logDecision
   * @description Writes a redacted policy decision to the structured logger.
   */
  private logDecision(context: PolicyContext, decision: PolicyDecision): void {
    const message = decision.blocked
      ? 'BLOCKED'
      : decision.escalated
        ? 'ESCALATED'
        : decision.allowed
          ? 'ALLOWED'
          : 'UNKNOWN';

    const payload = {
      user: context.user,
      reason: decision.reason,
      rule: decision.rule,
      engine: this.getEngineUsed(),
    };

    if (decision.blocked || decision.escalated) {
      logger.warn(`Policy ${message} - ${context.toolName}`, payload);
      return;
    }

    logger.info(`Policy ${message} - ${context.toolName}`, payload);
  }

  /**
   * @name getStatus
   * @description Returns current hybrid policy health without exposing secrets.
   */
  public getStatus(): {
    mode: string;
    bentoConfigured: boolean;
    bentoAvailable: boolean;
    localEngineActive: boolean;
  } {
    return {
      mode: this.config.mode,
      bentoConfigured: this.bentoEngine !== null,
      bentoAvailable: this.bentoAvailable,
      localEngineActive: true,
    };
  }

  /**
   * @name refreshBentoStatus
   * @description Forces a Bento Guard availability refresh.
   */
  public async refreshBentoStatus(): Promise<boolean> {
    await this.checkBentoAvailability();
    return this.bentoAvailable;
  }
}

/**
 * @name createHybridPolicyConfigFromEnv
 * @description Creates hybrid policy configuration from SAP MCP environment variables.
 */
export async function createHybridPolicyConfigFromEnv(): Promise<HybridPolicyConfig> {
  const { createPolicyConfigFromEnv } = await import('./local-policy-engine.js');
  const { createBentoConfigFromEnv } = await import('./bento-policy-engine.js');

  const localConfig = createPolicyConfigFromEnv();
  const bentoConfig = createBentoConfigFromEnv();

  // Determine mode from env
  const modeEnv = process.env.SAP_MCP_POLICY_MODE || 'hybrid';
  const mode = modeEnv as 'local-only' | 'bento-only' | 'hybrid';

  const failOpenEnv = process.env.SAP_MCP_POLICY_FAIL_OPEN || 'true';
  const failOpen = failOpenEnv.toLowerCase() === 'true';

  const loggingEnv = process.env.SAP_MCP_POLICY_LOGGING || 'true';
  const logging = loggingEnv.toLowerCase() === 'true';

  return {
    local: localConfig,
    bento: bentoConfig,
    mode,
    failOpen,
    logging,
  };
}
