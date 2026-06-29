/**
 * Policy engine for enforcing permissions and limits
 */

import { logger } from '../core/logger.js';
import type { SapMcpConfig, SapPolicy, SapPermission } from '../core/types.js';
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
 * Policy engine class
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
}
