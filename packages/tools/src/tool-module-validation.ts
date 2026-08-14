/**
 * @name tools/tool-module-validation
 * @description Regression validation for SAP MCP tool module catalogs.
 *
 * This module verifies registry invariants that should hold before tests,
 * packaging, or private plugin integration.
 *
 * @module tools/tool-module-validation
 */

import type { SapMcpContext } from '../../core/src/types.js';
import {
  selectToolModulesForContext,
  validateToolModules,
  type ToolModuleDefinition,
} from './module-registry.js';

export interface ToolModuleRuntimeProfile {
  readonly id: string;
  readonly description: string;
  readonly context: SapMcpContext;
  readonly paymentsBridgeOnly?: boolean;
}

export interface ToolModuleSelectionSummary {
  readonly profileId: string;
  readonly moduleIds: readonly string[];
  readonly expectedTools: readonly string[];
}

export interface ToolModuleValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly moduleId?: string;
  readonly profileId?: string;
}

export interface ToolModuleValidationReport {
  readonly moduleCount: number;
  readonly profileSelections: readonly ToolModuleSelectionSummary[];
  readonly issues: readonly ToolModuleValidationIssue[];
}

function withPaymentsBridgeMode<T>(enabled: boolean | undefined, fn: () => T): T {
  const previousValue = process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
  if (enabled === undefined) {
    delete process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
  } else {
    process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = enabled ? 'true' : 'false';
  }

  try {
    return fn();
  } finally {
    if (previousValue === undefined) {
      delete process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
    } else {
      process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = previousValue;
    }
  }
}

function issue(
  code: string,
  message: string,
  options: { moduleId?: string; profileId?: string } = {},
): ToolModuleValidationIssue {
  return {
    code,
    message,
    ...options,
  };
}

export function validateToolModuleCatalog(
  modules: readonly ToolModuleDefinition[],
  runtimeProfiles: readonly ToolModuleRuntimeProfile[],
): ToolModuleValidationReport {
  const issues: ToolModuleValidationIssue[] = [];
  const profileSelections: ToolModuleSelectionSummary[] = [];

  try {
    validateToolModules(modules);
  } catch (error) {
    issues.push(issue(
      'module-registry-invalid',
      error instanceof Error ? error.message : 'Tool module registry validation failed.',
    ));
  }

  const moduleIds = new Set(modules.map((module) => module.id));

  for (const module of modules) {
    if ((module.expectedTools?.length ?? 0) === 0) {
      issues.push(issue(
        'missing-expected-tool-sentinel',
        `Tool module ${module.id} must declare at least one expected tool sentinel.`,
        { moduleId: module.id },
      ));
    }

    for (const dependency of module.requires ?? []) {
      if (!moduleIds.has(dependency)) {
        continue;
      }

      const dependencyModule = modules.find((candidate) => candidate.id === dependency);
      if (dependencyModule && dependencyModule.order >= module.order) {
        issues.push(issue(
          'dependency-order-invalid',
          `Tool module ${module.id} requires ${dependency}, but the dependency does not register earlier.`,
          { moduleId: module.id },
        ));
      }
    }
  }

  for (const profile of runtimeProfiles) {
    const selectedModules = withPaymentsBridgeMode(profile.paymentsBridgeOnly, () => (
      selectToolModulesForContext(modules, profile.context)
    ));
    const selectedModuleIds = selectedModules.map((module) => module.id);
    const selectedExpectedTools = selectedModules.flatMap((module) => [...(module.expectedTools ?? [])]);

    profileSelections.push({
      profileId: profile.id,
      moduleIds: selectedModuleIds,
      expectedTools: selectedExpectedTools,
    });

    if (selectedModules.length === 0) {
      issues.push(issue(
        'empty-runtime-selection',
        `Runtime profile ${profile.id} selected no tool modules.`,
        { profileId: profile.id },
      ));
    }

    for (const module of selectedModules) {
      for (const dependency of module.requires ?? []) {
        if (!selectedModuleIds.includes(dependency)) {
          issues.push(issue(
            'disabled-runtime-dependency',
            `Runtime profile ${profile.id} selects ${module.id} without required module ${dependency}.`,
            { moduleId: module.id, profileId: profile.id },
          ));
        }
      }
    }

    if (profile.paymentsBridgeOnly && selectedModules.some((module) => module.mode !== 'payments-bridge-only')) {
      issues.push(issue(
        'bridge-only-selection-leak',
        `Runtime profile ${profile.id} selected non-bridge modules in payments bridge mode.`,
        { profileId: profile.id },
      ));
    }
  }

  return {
    moduleCount: modules.length,
    profileSelections,
    issues,
  };
}

export function assertToolModuleCatalogValid(
  modules: readonly ToolModuleDefinition[],
  runtimeProfiles: readonly ToolModuleRuntimeProfile[],
): ToolModuleValidationReport {
  const report = validateToolModuleCatalog(modules, runtimeProfiles);

  if (report.issues.length > 0) {
    const details = report.issues
      .map((validationIssue) => {
        const scope = [
          validationIssue.moduleId ? `module=${validationIssue.moduleId}` : undefined,
          validationIssue.profileId ? `profile=${validationIssue.profileId}` : undefined,
        ].filter(Boolean).join(' ');
        return `- ${validationIssue.code}${scope ? ` (${scope})` : ''}: ${validationIssue.message}`;
      })
      .join('\n');
    throw new Error(`Tool module catalog validation failed:\n${details}`);
  }

  return report;
}
