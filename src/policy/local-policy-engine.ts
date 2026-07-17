/**
 * Local Policy Engine
 * 
 * Deterministic security policies for SAP MCP Server
 * Runs entirely locally - no external dependencies
 * 
 * Features:
 * - Spend limits per tool/operation
 * - Program whitelist/blacklist
 * - Address whitelist/blacklist
 * - Rate limiting per user
 * - Time-based restrictions
 */

export interface PolicyConfig {
  /** Maximum amount (in lamports) per tool call */
  spendLimits: Record<string, number>;
  /** Allowed program IDs */
  programWhitelist: string[];
  /** Blocked program IDs */
  programBlacklist: string[];
  /** Allowed destination addresses */
  addressWhitelist: string[];
  /** Blocked destination addresses */
  addressBlacklist: string[];
  /** Max calls per minute per user */
  rateLimits: Record<string, number>;
  /** Tools that require escalation (human approval) */
  escalationTools: string[];
  /** Time windows when operations are allowed (UTC hours) */
  allowedHours?: { start: number; end: number };
}

/**
 * Contract describing policy decision data used by the SAP MCP runtime.
 */
export interface PolicyDecision {
  /** Whether the operation is allowed */
  allowed: boolean;
  /** Whether the operation is explicitly blocked */
  blocked?: boolean;
  /** Whether the operation requires human escalation */
  escalated?: boolean;
  /** Reason for the decision */
  reason: string;
  /** Policy rule that was triggered */
  rule?: string;
  /** Metadata for logging/auditing */
  metadata?: Record<string, unknown>;
}

/**
 * Contract describing policy context data used by the SAP MCP runtime.
 */
export interface PolicyContext {
  /** Tool/function being called */
  toolName: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** User/wallet identifier */
  user: string;
  /** Amount involved (if applicable, in lamports) */
  amount?: number;
  /** Program ID being interacted with */
  programId?: string;
  /** Destination address (if applicable) */
  destination?: string;
  /** Current timestamp */
  timestamp?: number;
}

/**
 * Runtime service that implements local policy engine behavior.
 */
export class LocalPolicyEngine {
  private config: PolicyConfig;
  private callHistory: Map<string, { timestamp: number; tool: string }[]> = new Map();

  constructor(config: PolicyConfig) {
    this.config = config;
  }

  /**
   * Validate a tool call against all policy rules
   */
  async validateToolCall(context: PolicyContext): Promise<PolicyDecision> {
    const decisions: PolicyDecision[] = [];

    // 1. Check blacklist (highest priority)
    const blacklistCheck = this.checkBlacklist(context);
    if (blacklistCheck.blocked) {
      return blacklistCheck;
    }
    decisions.push(blacklistCheck);

    // 2. Check whitelist
    const whitelistCheck = this.checkWhitelist(context);
    if (whitelistCheck.blocked) {
      return whitelistCheck;
    }
    decisions.push(whitelistCheck);

    // 3. Check spend limits
    const spendLimitCheck = this.checkSpendLimits(context);
    if (spendLimitCheck.blocked) {
      return spendLimitCheck;
    }
    decisions.push(spendLimitCheck);

    // 4. Check rate limits
    const rateLimitCheck = this.checkRateLimits(context);
    if (rateLimitCheck.blocked) {
      return rateLimitCheck;
    }
    decisions.push(rateLimitCheck);

    // 5. Check escalation requirements
    const escalationCheck = this.checkEscalation(context);
    if (escalationCheck.escalated) {
      return escalationCheck;
    }
    decisions.push(escalationCheck);

    // 6. Check time windows
    const timeCheck = this.checkTimeWindow(context);
    if (timeCheck.blocked) {
      return timeCheck;
    }
    decisions.push(timeCheck);

    // All checks passed
    return {
      allowed: true,
      reason: 'All policy checks passed',
      rule: 'default-allow',
      metadata: {
        checksPerformed: decisions.length,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Check if program or address is blacklisted
   */
  private checkBlacklist(context: PolicyContext): PolicyDecision {
    // Check program blacklist
    if (context.programId && this.config.programBlacklist.includes(context.programId)) {
      return {
        allowed: false,
        blocked: true,
        reason: `Program ${context.programId} is blacklisted`,
        rule: 'program-blacklist',
      };
    }

    // Check address blacklist
    if (context.destination && this.config.addressBlacklist.includes(context.destination)) {
      return {
        allowed: false,
        blocked: true,
        reason: `Address ${context.destination} is blacklisted`,
        rule: 'address-blacklist',
      };
    }

    return { allowed: true, reason: 'Not blacklisted' };
  }

  /**
   * Check if program or address is whitelisted (if whitelist is configured)
   */
  private checkWhitelist(context: PolicyContext): PolicyDecision {
    // Only enforce whitelist if it's configured (non-empty)
    if (this.config.programWhitelist.length > 0 && context.programId) {
      if (!this.config.programWhitelist.includes(context.programId)) {
        return {
          allowed: false,
          blocked: true,
          reason: `Program ${context.programId} is not whitelisted`,
          rule: 'program-whitelist',
        };
      }
    }

    if (this.config.addressWhitelist.length > 0 && context.destination) {
      if (!this.config.addressWhitelist.includes(context.destination)) {
        return {
          allowed: false,
          blocked: true,
          reason: `Address ${context.destination} is not whitelisted`,
          rule: 'address-whitelist',
        };
      }
    }

    return { allowed: true, reason: 'Whitelist check passed' };
  }

  /**
   * Check if amount exceeds spend limits
   */
  private checkSpendLimits(context: PolicyContext): PolicyDecision {
    if (!context.amount) {
      return { allowed: true, reason: 'No amount to check' };
    }

    const limit = this.config.spendLimits[context.toolName];
    if (limit !== undefined && context.amount > limit) {
      return {
        allowed: false,
        blocked: true,
        reason: `Amount ${context.amount} exceeds limit ${limit} for ${context.toolName}`,
        rule: 'spend-limit',
        metadata: {
          amount: context.amount,
          limit,
          tool: context.toolName,
        },
      };
    }

    // Check global limit if tool-specific limit not set
    const globalLimit = this.config.spendLimits['*'];
    if (globalLimit !== undefined && context.amount > globalLimit) {
      return {
        allowed: false,
        blocked: true,
        reason: `Amount ${context.amount} exceeds global limit ${globalLimit}`,
        rule: 'global-spend-limit',
        metadata: {
          amount: context.amount,
          limit: globalLimit,
        },
      };
    }

    return { allowed: true, reason: 'Within spend limits' };
  }

  /**
   * Check rate limiting per user
   */
  private checkRateLimits(context: PolicyContext): PolicyDecision {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const userKey = `${context.user}:${context.toolName}`;

    // Get or initialize call history
    const history = this.callHistory.get(userKey) || [];
    
    // Filter to only recent calls
    const recentCalls = history.filter(call => now - call.timestamp < windowMs);
    
    // Check rate limit
    const limit = this.config.rateLimits[context.toolName] ?? this.config.rateLimits['*'] ?? Infinity;
    if (recentCalls.length >= limit) {
      return {
        allowed: false,
        blocked: true,
        reason: `Rate limit exceeded: ${recentCalls.length}/${limit} calls per minute`,
        rule: 'rate-limit',
        metadata: {
          calls: recentCalls.length,
          limit,
          windowMs,
        },
      };
    }

    // Record this call
    recentCalls.push({ timestamp: now, tool: context.toolName });
    this.callHistory.set(userKey, recentCalls);

    // Cleanup old entries periodically
    if (recentCalls.length < history.length) {
      this.callHistory.set(userKey, recentCalls);
    }

    return { allowed: true, reason: 'Within rate limits' };
  }

  /**
   * Check if tool requires human escalation
   */
  private checkEscalation(context: PolicyContext): PolicyDecision {
    if (this.config.escalationTools.includes(context.toolName)) {
      return {
        allowed: false,
        escalated: true,
        reason: `Tool ${context.toolName} requires human approval`,
        rule: 'escalation-required',
        metadata: {
          tool: context.toolName,
          escalationType: 'human-approval',
        },
      };
    }

    return { allowed: true, reason: 'No escalation required' };
  }

  /**
   * Check if operation is within allowed time window
   */
  private checkTimeWindow(context: PolicyContext): PolicyDecision {
    if (!this.config.allowedHours) {
      return { allowed: true, reason: 'No time restrictions' };
    }

    const now = context.timestamp ?? Date.now();
    const hour = new Date(now).getUTCHours();
    const { start, end } = this.config.allowedHours;

    // Handle both same-day and overnight windows
    let inWindow: boolean;
    if (start <= end) {
      inWindow = hour >= start && hour < end;
    } else {
      // Overnight window (e.g., start=22, end=6)
      inWindow = hour >= start || hour < end;
    }

    if (!inWindow) {
      return {
        allowed: false,
        blocked: true,
        reason: `Operations not allowed at ${hour}:00 UTC (allowed: ${start}:00-${end}:00)`,
        rule: 'time-window',
        metadata: {
          currentHour: hour,
          allowedStart: start,
          allowedEnd: end,
        },
      };
    }

    return { allowed: true, reason: 'Within allowed time window' };
  }

  /**
   * Get current policy configuration
   */
  getConfig(): PolicyConfig {
    return { ...this.config };
  }

  /**
   * Clear call history (useful for testing)
   */
  clearHistory(): void {
    this.callHistory.clear();
  }
}

/**
 * Create policy config from environment variables
 */
export function createPolicyConfigFromEnv(): PolicyConfig {
  const spendLimitsRaw = process.env.SAP_MCP_SPEND_LIMITS || '{}';
  const rateLimitsRaw = process.env.SAP_MCP_RATE_LIMITS || '{}';
  
  let spendLimits: Record<string, number>;
  let rateLimits: Record<string, number>;
  
  try {
    spendLimits = JSON.parse(spendLimitsRaw);
  } catch {
    spendLimits = {};
  }
  
  try {
    rateLimits = JSON.parse(rateLimitsRaw);
  } catch {
    rateLimits = {};
  }

  const programWhitelist = process.env.SAP_MCP_PROGRAM_WHITELIST
    ? process.env.SAP_MCP_PROGRAM_WHITELIST.split(',').map(s => s.trim())
    : [];
    
  const programBlacklist = process.env.SAP_MCP_PROGRAM_BLACKLIST
    ? process.env.SAP_MCP_PROGRAM_BLACKLIST.split(',').map(s => s.trim())
    : [];
    
  const addressWhitelist = process.env.SAP_MCP_ADDRESS_WHITELIST
    ? process.env.SAP_MCP_ADDRESS_WHITELIST.split(',').map(s => s.trim())
    : [];
    
  const addressBlacklist = process.env.SAP_MCP_ADDRESS_BLACKLIST
    ? process.env.SAP_MCP_ADDRESS_BLACKLIST.split(',').map(s => s.trim())
    : [];
    
  const escalationTools = process.env.SAP_MCP_ESCALATION_TOOLS
    ? process.env.SAP_MCP_ESCALATION_TOOLS.split(',').map(s => s.trim())
    : ['sap_close_agent', 'sap_withdraw_escrow_v2', 'sap_transfer_ownership'];

  // Parse time window if specified (format: "9-17" for 9am-5pm UTC)
  let allowedHours: { start: number; end: number } | undefined;
  const timeWindowEnv = process.env.SAP_MCP_ALLOWED_HOURS;
  if (timeWindowEnv) {
    const [start, end] = timeWindowEnv.split('-').map(s => parseInt(s.trim(), 10));
    if (!isNaN(start) && !isNaN(end)) {
      allowedHours = { start, end };
    }
  }

  return {
    spendLimits,
    programWhitelist,
    programBlacklist,
    addressWhitelist,
    addressBlacklist,
    rateLimits,
    escalationTools,
    allowedHours,
  };
}
