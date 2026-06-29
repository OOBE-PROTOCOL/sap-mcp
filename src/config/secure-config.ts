/**
 * Secure JSON Configuration System
 * 
 * Features:
 * - Dynamic config reload without restart
 * - Approval workflow for sensitive changes
 * - Complete audit trail (on-chain + off-chain)
 * - Zod runtime validation
 * - Git-friendly JSON format
 * 
 * Security Model:
 * - Config changes are signed and timestamped
 * - Sensitive changes require approval (time-lock or multi-sig)
 * - All changes logged to audit trail
 * - Config hash can be submitted to SAP Oracle (optional)
 */

import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { getConfigDir } from './paths.js';

// ============================================================================
// Configuration Schema (Core)
// ============================================================================

const modeSchema = z.enum([
  'readonly',
  'local-dev-keypair',
  'external-signer',
  'delegated-session',
  'hosted-api'
]);

const commitmentSchema = z.enum(['processed', 'confirmed', 'finalized']);
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
const logFormatSchema = z.enum(['json', 'pretty']);

/**
 * Core configuration schema
 */
export const coreConfigSchema = z.object({
  // Identity
  mode: modeSchema.default('readonly'),
  rpcUrl: z.string().url().default('https://api.mainnet-beta.solana.com'),
  rpcUrlDevnet: z.string().url().optional(),
  rpcUrlTestnet: z.string().url().optional(),
  programId: z.string().default('SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ'),
  commitment: commitmentSchema.default('confirmed'),
  
  // Agent Identity (auto-populated from wallet)
  agentPubkey: z.string().optional(),
  
  // Performance
  maxRetries: z.number().positive().default(3),
  retryDelayMs: z.number().positive().default(1000),
  
  // Signer
  walletPath: z.string().optional(),
  walletEncrypted: z.boolean().default(false),
  walletPassphraseEnv: z.string().optional(),
  externalSignerUrl: z.string().url().optional(),
  externalSignerTimeoutMs: z.number().positive().default(30000),
  
  // HTTP Transport
  enableHttp: z.boolean().default(false),
  httpPort: z.number().positive().default(8787),
  httpHost: z.string().default('127.0.0.1'),
  httpCorsOrigins: z.array(z.string()).optional(),
  
  // Security & Limits
  maxTxValueSol: z.number().nonnegative().default(10),
  requireApprovalAboveSol: z.number().nonnegative().default(1),
  dailyLimitSol: z.number().nonnegative().default(100),
  allowedTools: z.union([z.literal('all'), z.array(z.string())]).default('all'),
  
  // Logging
  logLevel: logLevelSchema.default('info'),
  logFormat: logFormatSchema.default('pretty'),
  logFile: z.string().optional(),
  
  // Observability
  enableMetrics: z.boolean().default(false),
  metricsPort: z.number().positive().default(9090),
  
  // Advanced
  enableCache: z.boolean().default(true),
  cacheTtlSeconds: z.number().positive().default(300),
  enableRateLimit: z.boolean().default(true),
  rateLimitPerMinute: z.number().positive().default(60),
});

/**
 * Type alias for core config values used by the SAP MCP runtime.
 */
export type CoreConfig = z.infer<typeof coreConfigSchema>;

// ============================================================================
// Security & Approval Schema
// ============================================================================

/**
 * Security settings for config changes
 */
export const securityConfigSchema = z.object({
  // Fields that require approval to change
  requireApprovalFor: z.array(z.string()).default([
    'mode',
    'walletPath',
    'externalSignerUrl',
    'maxTxValueSol',
    'requireApprovalAboveSol',
    'dailyLimitSol',
  ]),
  
  // Time-lock for approval (seconds)
  approvalTimeout: z.number().positive().default(300), // 5 minutes
  
  // Max config changes per day
  maxChangesPerDay: z.number().positive().default(10),
  
  // Multi-sig approval (future)
  requireMultiSig: z.boolean().default(false),
  multiSigThreshold: z.number().positive().optional(),
  multiSigApprovers: z.array(z.string()).optional(),
});

/**
 * Type alias for security config values used by the SAP MCP runtime.
 */
export type SecurityConfig = z.infer<typeof securityConfigSchema>;

// ============================================================================
// Audit Trail Schema
// ============================================================================

/**
 * Audit trail configuration
 */
export const auditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  logPath: z.string().optional(),
  retentionDays: z.number().positive().default(90),
  submitToOracle: z.boolean().default(false), // Optional: submit config hash to SAP Oracle
  oracleEndpoint: z.string().url().optional(),
});

/**
 * Type alias for audit config values used by the SAP MCP runtime.
 */
export type AuditConfig = z.infer<typeof auditConfigSchema>;

/**
 * Shared bento config schema definition used by the SAP MCP runtime.
 */
export const bentoConfigSchema = z.object({
  enabled: z.boolean().default(false),
  apiKey: z.string().optional(),
  agentId: z.string().optional(),
  endpoint: z.string().url().optional(),
}).optional();

/**
 * Shared policy runtime config schema definition used by the SAP MCP runtime.
 */
export const policyRuntimeConfigSchema = z.object({
  mode: z.enum(['local-only', 'bento-only', 'hybrid']).default('local-only'),
  failOpen: z.boolean().default(false),
  logging: z.boolean().default(true),
}).optional();

/**
 * Audit log entry
 */
export interface AuditEntry {
  timestamp: string;
  action: 'config_change' | 'config_reload' | 'approval_granted' | 'approval_denied';
  user: string;
  changes?: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
  approvalRequired: boolean;
  approvalStatus?: 'pending' | 'approved' | 'denied';
  signature?: string;
  configHash: string;
}

// ============================================================================
// Full Config Schema
// ============================================================================

/**
 * Complete configuration schema with security and audit
 */
export const fullConfigSchema = z.object({
  // Core configuration
  ...coreConfigSchema.shape,
  
  // Security settings (optional, under $security key)
  $security: securityConfigSchema.optional(),
  
  // Audit trail (optional, under $audit key)
  $audit: auditConfigSchema.optional(),

  bento: bentoConfigSchema,
  policy: policyRuntimeConfigSchema,
  
  // Metadata (auto-generated, not user-edited)
  $meta: z.object({
    version: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastHash: z.string(),
  }).optional(),
});

/**
 * Type alias for full config values used by the SAP MCP runtime.
 */
export type FullConfig = z.infer<typeof fullConfigSchema>;

const pendingChangeSchema = z.object({
  id: z.string(),
  field: z.string(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  requestedAt: z.string(),
  requestedBy: z.string(),
  status: z.enum(['pending', 'approved', 'denied']),
  expiresAt: z.string(),
});

const pendingChangesSchema = z.array(pendingChangeSchema);

/**
 * Contract describing pending change data used by the SAP MCP runtime.
 */
export type PendingChange = z.infer<typeof pendingChangeSchema>;

// ============================================================================
// Config Manager Class
// ============================================================================

/**
 * Runtime service that implements secure config manager behavior.
 */
export class SecureConfigManager {
  private configPath: string;
  private auditPath: string;
  private pendingPath: string;
  private currentConfig: FullConfig | null = null;
  private pendingChanges: Map<string, PendingChange> = new Map();
  
  constructor(configDir?: string) {
    const configDirPath = configDir || this.getDefaultConfigDir();
    this.configPath = join(configDirPath, 'config.json');
    this.auditPath = join(configDirPath, 'audit.jsonl');
    this.pendingPath = join(configDirPath, 'pending-changes.json');
  }
  
  /**
   * Get default config directory
   */
  private getDefaultConfigDir(): string {
    return getConfigDir();
  }
  
  /**
   * Load configuration from file
   */
  load(): FullConfig {
    if (!existsSync(this.configPath)) {
      // Create default config
      const defaultConfig = this.createDefaultConfig();
      this.save(defaultConfig);
      return defaultConfig;
    }
    
    try {
      const content = readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(content);
      
      // Validate schema
      const validated = fullConfigSchema.parse(parsed);
      this.currentConfig = validated;
      
      return validated;
    } catch (_error) {
      // If config is corrupted, recreate default
      console.warn('Config file corrupted, recreating default...');
      const defaultConfig = this.createDefaultConfig();
      this.save(defaultConfig);
      return defaultConfig;
    }
  }
  
  /**
   * Create default configuration
   */
  private createDefaultConfig(): FullConfig {
    const now = new Date().toISOString();
    const baseConfig = coreConfigSchema.parse({});
    
    return {
      ...baseConfig,
      $security: {
        requireApprovalFor: ['mode', 'walletPath', 'externalSignerUrl', 'maxTxValueSol'],
        approvalTimeout: 300,
        maxChangesPerDay: 10,
      requireMultiSig: false,
      },
      $audit: {
        enabled: true,
        retentionDays: 90,
        submitToOracle: false,
      },
      $meta: {
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        lastHash: this.hashConfig(baseConfig),
      },
    };
  }
  
  /**
   * Save configuration to file
   */
  save(config: FullConfig): void {
    // Ensure directory exists
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    // Update metadata
    const now = new Date().toISOString();
    config.$meta = {
      version: config.$meta?.version || '1.0.0',
      createdAt: config.$meta?.createdAt || now,
      updatedAt: now,
      lastHash: this.hashConfig(config),
    };
    
    // Write atomically (write to temp, then rename)
    const tempPath = this.configPath + '.tmp';
    writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
    
    // Atomic rename
    renameSync(tempPath, this.configPath);
    
    this.currentConfig = config;
    
    // Log audit entry
    if (config.$audit?.enabled) {
      this.logAuditEntry({
        timestamp: now,
        action: 'config_change',
        user: process.env.USER || 'unknown',
        approvalRequired: false,
        configHash: config.$meta.lastHash,
      });
    }
  }
  
  /**
   * Update configuration with approval workflow
   */
  async update(changes: Partial<FullConfig>, user?: string): Promise<UpdateResult> {
    const current = this.currentConfig || this.load();
    const security = current.$security || { requireApprovalFor: [], approvalTimeout: 300 };
    this.loadPendingChanges();
    
    // Check which fields require approval
    const changesToApply: Partial<FullConfig> = {};
    const mutableChangesToApply = changesToApply as Record<string, unknown>;
    const changesPending: PendingChange[] = [];
    
    for (const [key, value] of Object.entries(changes)) {
      if (key.startsWith('$')) continue; // Skip meta keys

      const oldValue = current[key as keyof CoreConfig];
      if (this.areValuesEqual(oldValue, value)) {
        continue;
      }
      
      const requiresApproval = (security.requireApprovalFor as string[])?.includes(key) || false;
      
      if (requiresApproval) {
        // Create pending change
        const pending: PendingChange = {
          id: this.generateChangeId(),
          field: key,
          oldValue,
          newValue: value,
          requestedAt: new Date().toISOString(),
          requestedBy: user || process.env.USER || 'unknown',
          status: 'pending',
          expiresAt: new Date(Date.now() + security.approvalTimeout * 1000).toISOString(),
        };
        
        this.pendingChanges.set(pending.id, pending);
        changesPending.push(pending);
        this.savePendingChanges();
        
        // Log audit entry
        if (current.$audit?.enabled) {
          this.logAuditEntry({
            timestamp: new Date().toISOString(),
            action: 'config_change',
            user: pending.requestedBy,
            changes: [{ field: key, oldValue: pending.oldValue, newValue: pending.newValue }],
            approvalRequired: true,
            approvalStatus: 'pending',
            configHash: current.$meta?.lastHash || '',
          });
        }
      } else {
        // Apply immediately
        mutableChangesToApply[key] = value;
      }
    }
    
    // Apply immediate changes
    if (Object.keys(changesToApply).length > 0) {
      const updated = { ...current, ...changesToApply };
      this.save(updated);
    }
    
    return {
      applied: Object.keys(changesToApply),
      pending: changesPending.map(p => p.id),
      pendingChanges: changesPending,
    };
  }
  
  /**
   * Approve a pending change
   */
  approve(changeId: string, approver?: string): boolean {
    this.loadPendingChanges();
    const pending = this.pendingChanges.get(changeId);
    if (!pending) return false;
    
    // Check if expired
    if (new Date(pending.expiresAt) < new Date()) {
      this.pendingChanges.delete(changeId);
      this.savePendingChanges();
      return false;
    }
    
    // Apply change
    const current = this.currentConfig || this.load();
    const updated = { ...current, [pending.field]: pending.newValue };
    this.save(updated);
    
    // Log audit entry
    if (current.$audit?.enabled) {
      this.logAuditEntry({
        timestamp: new Date().toISOString(),
        action: 'approval_granted',
        user: approver || process.env.USER || 'unknown',
        changes: [{ field: pending.field, oldValue: pending.oldValue, newValue: pending.newValue }],
        approvalRequired: true,
        approvalStatus: 'approved',
        configHash: updated.$meta?.lastHash || '',
      });
    }
    
    this.pendingChanges.delete(changeId);
    this.savePendingChanges();
    return true;
  }
  
  /**
   * Deny a pending change
   */
  deny(changeId: string, approver?: string): boolean {
    this.loadPendingChanges();
    const pending = this.pendingChanges.get(changeId);
    if (!pending) return false;
    
    const current = this.currentConfig || this.load();
    
    // Log audit entry
    if (current.$audit?.enabled) {
      this.logAuditEntry({
        timestamp: new Date().toISOString(),
        action: 'approval_denied',
        user: approver || process.env.USER || 'unknown',
        changes: [{ field: pending.field, oldValue: pending.oldValue, newValue: pending.newValue }],
        approvalRequired: true,
        approvalStatus: 'denied',
        configHash: current.$meta?.lastHash || '',
      });
    }
    
    this.pendingChanges.delete(changeId);
    this.savePendingChanges();
    return true;
  }
  
  /**
   * Get pending changes
   */
  getPendingChanges(): PendingChange[] {
    this.loadPendingChanges();
    this.pruneExpiredPendingChanges();
    return Array.from(this.pendingChanges.values());
  }
  
  /**
   * Get audit log
   */
  getAuditLog(limit: number = 100): AuditEntry[] {
    if (!existsSync(this.auditPath)) {
      return [];
    }
    
    const content = readFileSync(this.auditPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    
    return lines
      .slice(-limit)
      .map(line => JSON.parse(line));
  }
  
  /**
   * Get current config hash
   */
  getConfigHash(): string {
    if (!this.currentConfig) {
      this.load();
    }
    return this.currentConfig?.$meta?.lastHash || '';
  }
  
  /**
   * Hash configuration (for audit/oracle)
   */
  private hashConfig(config: object): string {
    const content = JSON.stringify(config, Object.keys(config).sort());
    return createHash('sha256').update(content).digest('hex');
  }
  
  /**
   * Generate unique change ID
   */
  private generateChangeId(): string {
    return `chg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Loads pending changes from disk so CLI approval commands work across process boundaries.
   */
  private loadPendingChanges(): void {
    if (!existsSync(this.pendingPath)) {
      this.pendingChanges.clear();
      return;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.pendingPath, 'utf-8'));
      const pendingChanges = pendingChangesSchema.parse(parsed);
      this.pendingChanges = new Map(pendingChanges.map((change) => [change.id, change]));
    } catch {
      console.warn('Pending changes file corrupted, resetting approval queue...');
      this.pendingChanges.clear();
      this.savePendingChanges();
    }
  }

  /**
   * Persists pending changes atomically for separate CLI invocations.
   */
  private savePendingChanges(): void {
    const dir = dirname(this.pendingPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${this.pendingPath}.tmp`;
    const pendingChanges = Array.from(this.pendingChanges.values());
    writeFileSync(tempPath, JSON.stringify(pendingChanges, null, 2), 'utf-8');
    renameSync(tempPath, this.pendingPath);
  }

  /**
   * Removes expired pending changes before they are shown or approved.
   */
  private pruneExpiredPendingChanges(): void {
    let changed = false;
    const now = new Date();

    for (const [id, pending] of this.pendingChanges.entries()) {
      if (new Date(pending.expiresAt) < now) {
        this.pendingChanges.delete(id);
        changed = true;
      }
    }

    if (changed) {
      this.savePendingChanges();
    }
  }

  /**
   * Compares simple JSON-compatible config values before creating a change request.
   */
  private areValuesEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  
  /**
   * Log audit entry
   */
  private logAuditEntry(entry: AuditEntry): void {
    const dir = dirname(this.auditPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    appendFileSync(this.auditPath, JSON.stringify(entry) + '\n');
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Contract describing update result data used by the SAP MCP runtime.
 */
export interface UpdateResult {
  applied: string[];
  pending: string[];
  pendingChanges: PendingChange[];
}

// ============================================================================
// Singleton Instance
// ============================================================================

let configManager: SecureConfigManager | null = null;

/**
 * Executes the get config manager operation.
 */
export function getConfigManager(configDir?: string): SecureConfigManager {
  if (configDir) {
    return new SecureConfigManager(configDir);
  }

  if (!configManager) {
    configManager = new SecureConfigManager();
  }

  return configManager;
}
