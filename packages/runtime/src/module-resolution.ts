/**
 * @name installPackageNodePath
 * @description Adds this package's installed node_modules directory to Node's resolver for npm exec/npx runs.
 */
import Module from 'module';
import { existsSync, readFileSync } from 'fs';
import { dirname, delimiter, resolve } from 'path';
import { fileURLToPath } from 'url';

const PACKAGE_NAME = '@oobe-protocol-labs/sap-mcp-server';

/**
 * @name findPackageRoot
 * @description Finds this package root from any compiled file path inside dist/.
 */
function findPackageRoot(startDir: string): string {
  let currentDir = startDir;

  for (let depth = 0; depth < 8; depth += 1) {
    const packageJsonPath = resolve(currentDir, 'package.json');

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { name?: string };
        if (packageJson.name === PACKAGE_NAME) {
          return currentDir;
        }
      } catch {
        // Keep walking upward; a malformed package.json should not break CLI startup.
      }
    }

    const parentDir = resolve(currentDir, '..');
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return resolve(startDir, '..', '..');
}

/**
 * @name installPackageNodePath
 * @description Ensures dependencies that resolve assets from `process.cwd()` can still find this package's dependencies.
 */
export function installPackageNodePath(metaUrl: string): void {
  const moduleDir = dirname(fileURLToPath(metaUrl));
  const packageRoot = findPackageRoot(moduleDir);
  const candidateNodeModules = [
    resolve(packageRoot, 'node_modules'),
    resolve(packageRoot, '..', '..'),
  ].filter((entry) => existsSync(entry));

  const paths = (process.env.NODE_PATH ?? '')
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const nextPaths = [
    ...candidateNodeModules.filter((entry) => !paths.includes(entry)),
    ...paths,
  ];

  if (nextPaths.length === paths.length) {
    return;
  }

  process.env.NODE_PATH = nextPaths.join(delimiter);
  const moduleWithInitPaths = Module as typeof Module & { _initPaths?: () => void };
  moduleWithInitPaths._initPaths?.();
}
