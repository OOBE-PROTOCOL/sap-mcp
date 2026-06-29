/**
 * SAP MCP Server - Multi-Agent Profile Management
 * 
 * Allows AI agents (Hermes, Claude, OpenClaw, Codex) to switch between
 * different agent contexts/configurations without regression.
 * 
 * Features:
 * - Multiple named profiles (config-hermes.json, config-claude.json, etc.)
 * - Active profile tracking
 * - Safe profile switching with validation
 * - Zero "any" types - full type safety
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { getPreferredConfigDir } from './paths.js';
import { fullConfigSchema, type FullConfig } from './secure-config.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Profile metadata
 */
export interface ProfileInfo {
  name: string;
  path: string;
  exists: boolean;
  agentPubkey?: string;
  mode?: FullConfig['mode'];
  walletPath?: string;
}

/**
 * Profile switch result
 */
export interface ProfileSwitchResult {
  success: boolean;
  previousProfile: string;
  newProfile: string;
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PROFILE = 'default';
const ACTIVE_PROFILE_FILE = '.active-profile';

// ============================================================================
// Profile Path Management
// ============================================================================

/**
 * Get path to active profile marker file
 */
export function getActiveProfilePath(): string {
  const configDir = getPreferredConfigDir();
  return join(configDir, ACTIVE_PROFILE_FILE);
}

/**
 * Get config path for a specific profile
 */
export function getProfileConfigPath(profileName: string): string {
  const configDir = getPreferredConfigDir();
  
  if (profileName === DEFAULT_PROFILE || profileName === 'default') {
    return join(configDir, 'config.json');
  }
  
  return join(configDir, `config-${profileName}.json`);
}

/**
 * Get current active profile name
 */
export function getActiveProfile(): string {
  const activeProfilePath = getActiveProfilePath();
  
  if (!existsSync(activeProfilePath)) {
    return DEFAULT_PROFILE;
  }
  
  try {
    const content = readFileSync(activeProfilePath, 'utf-8').trim();
    return content || DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

/**
 * Set active profile
 */
export function setActiveProfile(profileName: string): void {
  const configDir = getPreferredConfigDir();
  const activeProfilePath = getActiveProfilePath();
  
  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  // Write active profile marker
  writeFileSync(activeProfilePath, profileName, 'utf-8');
}

// ============================================================================
// Profile Operations
// ============================================================================

/**
 * List all available profiles
 */
export function listProfiles(): ProfileInfo[] {
  const configDir = getPreferredConfigDir();
  
  if (!existsSync(configDir)) {
    return [];
  }
  
  const files = readdirSync(configDir);
  const profiles: ProfileInfo[] = [];
  
  // Find all config files
  for (const file of files) {
    if (file === 'config.json') {
      const profile: ProfileInfo = {
        name: DEFAULT_PROFILE,
        path: join(configDir, file),
        exists: true,
      };
      
      // Try to read profile info
      try {
        const config = JSON.parse(readFileSync(profile.path, 'utf-8'));
        profile.agentPubkey = config.agentPubkey;
        profile.mode = config.mode;
        profile.walletPath = config.walletPath;
      } catch {
        // Ignore read errors
      }
      
      profiles.push(profile);
    } else if (file.startsWith('config-') && file.endsWith('.json')) {
      const profileName = file.replace('config-', '').replace('.json', '');
      const profile: ProfileInfo = {
        name: profileName,
        path: join(configDir, file),
        exists: true,
      };
      
      // Try to read profile info
      try {
        const config = JSON.parse(readFileSync(profile.path, 'utf-8'));
        profile.agentPubkey = config.agentPubkey;
        profile.mode = config.mode;
        profile.walletPath = config.walletPath;
      } catch {
        // Ignore read errors
      }
      
      profiles.push(profile);
    }
  }
  
  // Sort: active profile first, then alphabetical
  const activeProfile = getActiveProfile();
  profiles.sort((a, b) => {
    if (a.name === activeProfile) return -1;
    if (b.name === activeProfile) return 1;
    return a.name.localeCompare(b.name);
  });
  
  return profiles;
}

/**
 * Check if profile exists
 */
export function profileExists(profileName: string): boolean {
  const configPath = getProfileConfigPath(profileName);
  return existsSync(configPath);
}

/**
 * Load config from specific profile
 */
export function loadProfileConfig(profileName: string): FullConfig | null {
  const configPath = getProfileConfigPath(profileName);
  
  if (!existsSync(configPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    const validated = fullConfigSchema.parse(parsed);
    return validated;
  } catch {
    return null;
  }
}

/**
 * Save config to specific profile
 */
export async function saveProfileConfig(profileName: string, config: FullConfig): Promise<void> {
  const configPath = getProfileConfigPath(profileName);
  const configDir = dirname(configPath);
  
  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  // Write atomically
  const tempPath = configPath + '.tmp';
  writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
  
  // Atomic rename
  const { renameSync } = await import('fs');
  renameSync(tempPath, configPath);
}

/**
 * Switch to a different profile
 */
export function switchProfile(profileName: string): ProfileSwitchResult {
  const previousProfile = getActiveProfile();
  const targetConfigPath = getProfileConfigPath(profileName);
  
  // Validate profile exists
  if (!existsSync(targetConfigPath)) {
    return {
      success: false,
      previousProfile,
      newProfile: profileName,
      message: `Profile "${profileName}" does not exist. Create it first with: sap-mcp-config create-profile ${profileName}`,
    };
  }
  
  // Validate config is valid JSON
  try {
    const content = readFileSync(targetConfigPath, 'utf-8');
    const parsed = JSON.parse(content);
    fullConfigSchema.parse(parsed);
  } catch (error) {
    return {
      success: false,
      previousProfile,
      newProfile: profileName,
      message: `Profile "${profileName}" has invalid config: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
  
  // Switch profile
  setActiveProfile(profileName);
  
  return {
    success: true,
    previousProfile,
    newProfile: profileName,
    message: `Switched from "${previousProfile}" to "${profileName}"`,
  };
}

/**
 * Create a new profile (copy from current or default)
 */
export async function createProfile(profileName: string, copyFrom?: string): Promise<ProfileSwitchResult> {
  // Validate profile name
  if (!/^[a-zA-Z0-9_-]+$/.test(profileName)) {
    return {
      success: false,
      previousProfile: getActiveProfile(),
      newProfile: profileName,
      message: 'Invalid profile name. Use only letters, numbers, hyphens, and underscores.',
    };
  }
  
  const sourceProfile = copyFrom || getActiveProfile();
  const sourceConfigPath = getProfileConfigPath(sourceProfile);
  const targetConfigPath = getProfileConfigPath(profileName);
  
  // Check if target already exists
  if (existsSync(targetConfigPath)) {
    return {
      success: false,
      previousProfile: getActiveProfile(),
      newProfile: profileName,
      message: `Profile "${profileName}" already exists`,
    };
  }
  
  // Check if source exists
  if (!existsSync(sourceConfigPath)) {
    return {
      success: false,
      previousProfile: getActiveProfile(),
      newProfile: profileName,
      message: `Source profile "${sourceProfile}" does not exist`,
    };
  }
  
  // Copy config
  try {
    const sourceContent = readFileSync(sourceConfigPath, 'utf-8');
    const sourceConfig = JSON.parse(sourceContent);
    
    // Update metadata
    const now = new Date().toISOString();
    sourceConfig.$meta = {
      ...sourceConfig.$meta,
      createdAt: now,
      updatedAt: now,
      lastHash: '',
    };
    
    // Save to new profile
    await saveProfileConfig(profileName, sourceConfig as FullConfig);
    
    // Optionally switch to new profile
    setActiveProfile(profileName);
    
    return {
      success: true,
      previousProfile: sourceProfile,
      newProfile: profileName,
      message: `Created profile "${profileName}" from "${sourceProfile}" and switched to it`,
    };
  } catch (error) {
    return {
      success: false,
      previousProfile: getActiveProfile(),
      newProfile: profileName,
      message: `Failed to create profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Delete a profile (cannot delete active or default)
 */
export async function deleteProfile(profileName: string): Promise<{ success: boolean; message: string }> {
  // Cannot delete default
  if (profileName === DEFAULT_PROFILE) {
    return {
      success: false,
      message: 'Cannot delete default profile',
    };
  }
  
  // Cannot delete active profile
  const activeProfile = getActiveProfile();
  if (profileName === activeProfile) {
    return {
      success: false,
      message: `Cannot delete active profile "${profileName}". Switch to another profile first.`,
    };
  }
  
  const configPath = getProfileConfigPath(profileName);
  
  if (!existsSync(configPath)) {
    return {
      success: false,
      message: `Profile "${profileName}" does not exist`,
    };
  }
  
  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(configPath);
    
    return {
      success: true,
      message: `Deleted profile "${profileName}"`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to delete profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get current profile info
 */
export function getCurrentProfileInfo(): ProfileInfo {
  const profileName = getActiveProfile();
  const configPath = getProfileConfigPath(profileName);
  
  const info: ProfileInfo = {
    name: profileName,
    path: configPath,
    exists: existsSync(configPath),
  };
  
  if (info.exists) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      info.agentPubkey = config.agentPubkey;
      info.mode = config.mode;
      info.walletPath = config.walletPath;
    } catch {
      // Ignore read errors
    }
  }
  
  return info;
}
