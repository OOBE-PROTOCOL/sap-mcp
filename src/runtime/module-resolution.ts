/**
 * @name installPackageNodePath
 * @description Adds this package's installed node_modules directory to Node's resolver for npm exec/npx runs.
 */
import Module from 'module';
import { existsSync } from 'fs';
import { dirname, delimiter, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * @name installPackageNodePath
 * @description Ensures dependencies that resolve assets from `process.cwd()` can still find this package's dependencies.
 */
export function installPackageNodePath(metaUrl: string): void {
  const moduleDir = dirname(fileURLToPath(metaUrl));
  const packageRoot = resolve(moduleDir, '..', '..');
  const packageNodeModules = resolve(packageRoot, 'node_modules');

  if (!existsSync(packageNodeModules)) {
    return;
  }

  const paths = (process.env.NODE_PATH ?? '')
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!paths.includes(packageNodeModules)) {
    process.env.NODE_PATH = [packageNodeModules, ...paths].join(delimiter);
  }

  const moduleWithInitPaths = Module as typeof Module & { _initPaths?: () => void };
  moduleWithInitPaths._initPaths?.();
}
