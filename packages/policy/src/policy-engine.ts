/**
 * @name policy/policy-engine
 * @description High-level policy engine for enforcing permissions and spend limits.
 *
 * Wraps the local and hybrid policy engines, loads default policies, and
 * provides a unified API for permission validation, spend-limit checks,
 * and runtime diagnostics.
 *
 * @module policy/policy-engine
 */

import { logger } from '@oobe-protocol-labs/sap-mcp-core/logger';
import type { SapMcpConfig, SapPolicy, SapPermission } from '@oobe-protocol-labs/sap-mcp-core/types';
import { defaultPolicies } from './default-policies.js';
import { HybridPolicyEngine, type HybridPolicyConfig } from './hybrid-policy-engine.js';
import type { PolicyContext, PolicyDecision } from './local-policy-engine.js';

const LAMPORTS_PER_SOL = 1_000_000_000;

interface PermissionContext {
  amountSol?: number;
  toolName?: string;
  args?: Record<string, unknown>;
  programId?: string;
  destination?: string;
  user?: string;
}

/**
 * @name PolicyEngine
 * @description High-level policy engine combining default policies, config-based limits, and hybrid enforcement.
 *
 * Loads default policies at construction time, creates a `HybridPolicyEngine`
 * when configured, and exposes permission validation, spend-limit checks,
 * policy CRUD, and runtime status diagnostics.
 *
 * @method validatePermissions  — Validate a list of permission strings against the allowed-tools config.
 * @method checkPermission       — Check whether a single permission and optional context is allowed.
 * @method getRuntimeStatus      — Return current hybrid/Bento policy status for diagnostics.
 * @method getPolicy             — Retrieve a registered policy by id.
 * @method addPolicy             — Register a custom policy.
 *
 * @usedBy `server.ts`, `core/context.ts`
 */
export class PolicyEngine {
  private config: SapMcpConfig;
  private policies: Map<string, SapPolicy>;
  private hybridPolicyEngine: HybridPolicyEngine | null;
  
  constructor(config: SapMcpConfig) {
    this.config = config;
    this.policies = new Map();
    this.hybridPolicyEngine = this.createHybridPolicyEngine(config);
    
    // Load default policies
    for (const policy of defaultPolicies) {
      this.policies.set(policy.id, policy);
    }
    
    logger.info('Policy engine initialized', {
      policyCount: this.policies.size,
      mode: config.policy?.mode ?? 'local-only',
      bentoEnabled: config.bento?.enabled ?? false,
    });
  }
  
  /**
   * Validate permissions
   */
  async validatePermissions(permissions: string[]): Promise<{
    valid: boolean;
    permissions: SapPermission[];
    errors?: string[];
  }> {
    const errors: string[] = [];
    const validPermissions: SapPermission[] = [];
    
    for (const permission of permissions) {
      if (this.config.allowedTools !== 'all' && !this.config.allowedTools.includes(permission)) {
        errors.push(`Permission ${permission} not allowed by config`);
      } else {
        validPermissions.push(permission as SapPermission);
      }
    }
    
    if (errors.length > 0) {
      return { valid: false, permissions: [], errors };
    }
    
    return { valid: true, permissions: validPermissions };
  }
  
  /**
   * Check if action is allowed
   */
  async checkPermission(
    permission: string,
    context?: PermissionContext
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check if permission is in allowed tools
    if (this.config.allowedTools !== 'all') {
      if (!this.config.allowedTools.includes(permission)) {
        return { allowed: false, reason: `Permission ${permission} not allowed` };
      }
    }
    
    // Check spending limits
    if (context?.amountSol !== undefined) {
      if (!Number.isFinite(context.amountSol) || context.amountSol < 0) {
        return {
          allowed: false,
          reason: `Amount ${context.amountSol} SOL is invalid; amount must be a finite non-negative number`,
        };
      }

      const maxTxValueSol = this.config.maxTxValueSol;
      if (context.amountSol > maxTxValueSol) {
        return {
          allowed: false,
          reason: `Amount ${context.amountSol} SOL exceeds max ${maxTxValueSol} SOL`,
        };
      }
      
      if (context.amountSol > this.config.requireApprovalAboveSol) {
        return {
          allowed: false,
          reason: `Amount ${context.amountSol} SOL requires approval (threshold: ${this.config.requireApprovalAboveSol} SOL)`,
        };
      }
    }
    
    const hybridDecision = await this.checkHybridPolicy(permission, context);
    if (hybridDecision && !hybridDecision.allowed) {
      return {
        allowed: false,
        reason: hybridDecision.reason,
      };
    }

    return { allowed: true };
  }

  /**
   * Returns current hybrid/Bento policy status for diagnostics.
   */
  getRuntimeStatus(): {
    mode: string;
    bentoConfigured: boolean;
    bentoAvailable: boolean;
    localEngineActive: boolean;
  } {
    if (!this.hybridPolicyEngine) {
      return {
        mode: this.config.policy?.mode ?? 'local-only',
        bentoConfigured: false,
        bentoAvailable: false,
        localEngineActive: true,
      };
    }

    return this.hybridPolicyEngine.getStatus();
  }

  private createHybridPolicyEngine(config: SapMcpConfig): HybridPolicyEngine | null {
    const policyMode = config.policy?.mode ?? 'local-only';
    const bentoConfig = config.bento?.enabled && config.bento.apiKey
      ? {
          apiKey: config.bento.apiKey,
          agentId: config.bento.agentId || 'sap-mcp-server',
          endpoint: config.bento.endpoint,
        }
      : null;

    if (policyMode === 'local-only' && !bentoConfig) {
      return null;
    }

    const hybridConfig: HybridPolicyConfig = {
      mode: policyMode,
      bento: bentoConfig,
      failOpen: config.policy?.failOpen ?? false,
      logging: config.policy?.logging ?? true,
      local: {
        spendLimits: {
          '*': Math.floor(config.maxTxValueSol * LAMPORTS_PER_SOL),
        },
        programWhitelist: [],
        programBlacklist: [],
        addressWhitelist: [],
        addressBlacklist: [],
        rateLimits: config.enableRateLimit
          ? { '*': config.rateLimitPerMinute }
          : {},
        escalationTools: [],
      },
    };

    return new HybridPolicyEngine(hybridConfig);
  }

  private async checkHybridPolicy(
    permission: string,
    context?: PermissionContext
  ): Promise<PolicyDecision | null> {
    if (!this.hybridPolicyEngine) {
      return null;
    }

    const toolName = context?.toolName ?? permission;
    const policyContext: PolicyContext = {
      toolName,
      args: context?.args ?? {},
      user: context?.user ?? 'local-mcp-client',
      amount: context?.amountSol === undefined
        ? undefined
        : Math.floor(context.amountSol * LAMPORTS_PER_SOL),
      programId: context?.programId,
      destination: context?.destination,
      timestamp: Date.now(),
    };

    return this.hybridPolicyEngine.validateToolCall(policyContext);
  }
  
  /**
   * Get policy by ID
   */
  getPolicy(policyId: string): SapPolicy | undefined {
    return this.policies.get(policyId);
  }
  
  /**
   * Add custom policy
   */
  addPolicy(policy: SapPolicy): void {
    this.policies.set(policy.id, policy);
    logger.info('Policy added', { policyId: policy.id });
  }

  /**
   * @name TradingPolicy
   * @description Trading-specific policy limits enforced at the builder level.
   * Prevents catastrophic loss from agent parameter errors.
   */
  getTradingPolicy(): TradingPolicy {
    return {
      maxCollateralUsdPerTrade: this.config.maxCollateralUsdPerTrade ?? 50,
      maxLeverage: this.config.maxLeverage ?? 100,
      maxOpenPositions: this.config.maxOpenPositions ?? 3,
      allowedMarkets: this.config.allowedMarkets ?? ['BONK', 'JITOSOL', 'WBTC', 'USDC', 'XAU', 'XAG', 'WTI'],
      stopLossRequired: this.config.stopLossRequired ?? false,
      maxSlippageBps: this.config.maxSlippageBps ?? 500,
      requireHumanAckAboveUsd: this.config.requireHumanAckAboveUsd ?? 30,
      dailyLossLimitUsd: this.config.dailyLossLimitUsd ?? 10,
      maxDrawdownPct: this.config.maxDrawdownPct ?? 30,
      cooldownMinutes: this.config.cooldownMinutes ?? 15,
    };
  }

  /**
   * @name validateTradingPolicy
   * @description Validate trading parameters against policy limits.
   * Called by Adrena builders before constructing the transaction.
   */
  validateTradingPolicy(params: TradingPolicyParams): PolicyViolationResult {
    const policy = this.getTradingPolicy();

    if (params.leverage > policy.maxLeverage) {
      return { allowed: false, violation: 'leverage_exceeded', message: `Leverage ${params.leverage} exceeds max ${policy.maxLeverage}`, field: 'leverage', max: policy.maxLeverage, received: params.leverage };
    }

    if (params.collateralUsd > policy.maxCollateralUsdPerTrade) {
      return { allowed: false, violation: 'collateral_exceeded', message: `Collateral $${params.collateralUsd} exceeds max $${policy.maxCollateralUsdPerTrade}`, field: 'collateralUsd', max: policy.maxCollateralUsdPerTrade, received: params.collateralUsd };
    }

    if (policy.allowedMarkets.length > 0 && !policy.allowedMarkets.includes(params.market)) {
      return { allowed: false, violation: 'market_not_allowed', message: `Market ${params.market} not in allowed list: ${policy.allowedMarkets.join(', ')}`, field: 'market', allowed_list: policy.allowedMarkets };
    }

    if (policy.stopLossRequired && !params.hasStopLoss) {
      return { allowed: false, violation: 'stop_loss_required', message: 'Stop loss is required by policy but none was provided', field: 'stopLoss' };
    }

    if (params.slippageBps !== undefined && params.slippageBps > policy.maxSlippageBps) {
      return { allowed: false, violation: 'slippage_exceeded', message: `Slippage ${params.slippageBps} bps exceeds max ${policy.maxSlippageBps} bps`, field: 'slippageBps', max: policy.maxSlippageBps, received: params.slippageBps };
    }

    if (policy.requireHumanAckAboveUsd > 0 && params.collateralUsd > policy.requireHumanAckAboveUsd) {
      return { allowed: false, violation: 'human_ack_required', message: `Collateral $${params.collateralUsd} exceeds human acknowledgment threshold $${policy.requireHumanAckAboveUsd}. User must confirm.`, field: 'collateralUsd', threshold: policy.requireHumanAckAboveUsd, received: params.collateralUsd };
    }

    return { allowed: true };
  }
}

/** Trading-specific policy limits. */
export interface TradingPolicy {
  maxCollateralUsdPerTrade: number;
  maxLeverage: number;
  maxOpenPositions: number;
  allowedMarkets: string[];
  stopLossRequired: boolean;
  maxSlippageBps: number;
  requireHumanAckAboveUsd: number;
  /** Daily loss limit in USD. New trades are blocked when exceeded. */
  dailyLossLimitUsd?: number;
  /** Max drawdown percentage before blocking new trades. */
  maxDrawdownPct?: number;
  /** Cooldown in minutes after a losing trade. */
  cooldownMinutes?: number;
}

/** Parameters for trading policy validation. */
export interface TradingPolicyParams {
  market: string;
  side: string;
  collateralUsd: number;
  leverage: number;
  hasStopLoss: boolean;
  slippageBps?: number;
}

/** Result of trading policy validation. */
export interface PolicyViolationResult {
  allowed: boolean;
  violation?: string;
  message?: string;
  field?: string;
  max?: number;
  received?: number;
  threshold?: number;
  allowed_list?: string[];
}
