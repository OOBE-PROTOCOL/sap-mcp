import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Preferred application directory name for user-specific MCP SAP config.
 */
export const CONFIG_APP_DIR = 'mcp-sap';
/**
 * Previous application directory name. Runtime fallback is intentionally not supported.
 */
export const LEGACY_CONFIG_APP_DIR = 'sap-mcp';

/**
 * Resolves the platform-specific base directory for configuration files.
 */
function platformConfigBase(): string {
  const home = homedir();
  const xdgConfig = process.env.XDG_CONFIG_HOME;

  if (xdgConfig) {
    return xdgConfig;
  }

  if (process.platform === 'win32') {
    return process.env.APPDATA || home;
  }

  return join(home, '.config');
}

/**
 * Resolves the preferred config directory for an explicit platform/home pair.
 * This is used by the desktop wizard tests and GUI flows so Windows writes to
 * AppData/Roaming even when the process runs outside a normal user shell.
 */
export function getPreferredConfigDirForPlatform(
  home = homedir(),
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.XDG_CONFIG_HOME) {
    return join(env.XDG_CONFIG_HOME, CONFIG_APP_DIR);
  }

  if (platform === 'win32') {
    return join(env.APPDATA || join(home, 'AppData', 'Roaming'), CONFIG_APP_DIR);
  }

  return join(home, '.config', CONFIG_APP_DIR);
}

/**
 * Resolves the platform-specific base directory for runtime data.
 */
function platformDataBase(): string {
  const home = homedir();
  const xdgData = process.env.XDG_DATA_HOME;

  if (xdgData) {
    return xdgData;
  }

  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || home;
  }

  return join(home, '.local', 'share');
}

/**
 * Returns the preferred config directory used for all new writes.
 */
export function getPreferredConfigDir(): string {
  return join(platformConfigBase(), CONFIG_APP_DIR);
}

/**
 * Returns the legacy config directory used only for backwards-compatible reads.
 */
export function getLegacyConfigDir(): string {
  return join(platformConfigBase(), LEGACY_CONFIG_APP_DIR);
}

/**
 * Returns the canonical config directory.
 */
export function getConfigDir(): string {
  return getPreferredConfigDir();
}

/**
 * Returns the canonical data directory.
 */
export function getDataDir(): string {
  return join(platformDataBase(), CONFIG_APP_DIR);
}

/**
 * Returns the dedicated SAP MCP keypair directory.
 */
export function getKeypairsDir(): string {
  return join(getPreferredConfigDir(), 'keypairs');
}

/**
 * Creates the config, keypair, data, log, and cache directories with private permissions.
 */
export function ensureConfigDirectories(): void {
  const dirs = [
    getPreferredConfigDir(),
    getKeypairsDir(),
    getDataDir(),
    join(getDataDir(), 'logs'),
    join(getDataDir(), 'cache'),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
}

/**
 * Builds the default path for a generated agent wallet inside the dedicated keypair directory.
 */
export function defaultGeneratedWalletPath(label = 'agent-wallet'): string {
  return join(getKeypairsDir(), `${label}-keypair.json`);
}
