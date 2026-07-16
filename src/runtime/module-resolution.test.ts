import { mkdirSync, rmSync, writeFileSync } from 'fs';
import Module from 'module';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { pathToFileURL } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installPackageNodePath } from './module-resolution.js';

describe('installPackageNodePath', () => {
  const originalNodePath = process.env.NODE_PATH;

  beforeEach(() => {
    delete process.env.NODE_PATH;
    (Module as typeof Module & { _initPaths?: () => void })._initPaths?.();
  });

  afterEach(() => {
    if (originalNodePath === undefined) {
      delete process.env.NODE_PATH;
    } else {
      process.env.NODE_PATH = originalNodePath;
    }
    (Module as typeof Module & { _initPaths?: () => void })._initPaths?.();
  });

  it('adds both package-local and npx parent node_modules paths', () => {
    const root = join(tmpdir(), `sap-mcp-node-path-${Date.now()}`);
    const packageRoot = join(root, 'node_modules', '@oobe-protocol-labs', 'sap-mcp-server');
    const binPath = join(packageRoot, 'dist', 'bin', 'sap-mcp-server.js');
    const localNodeModules = join(packageRoot, 'node_modules');
    const parentNodeModules = join(root, 'node_modules');

    try {
      mkdirSync(join(packageRoot, 'dist', 'bin'), { recursive: true });
      mkdirSync(localNodeModules, { recursive: true });
      writeFileSync(
        join(packageRoot, 'package.json'),
        JSON.stringify({ name: '@oobe-protocol-labs/sap-mcp-server' }),
      );

      installPackageNodePath(pathToFileURL(binPath).href);

      const paths = (process.env.NODE_PATH ?? '').split(delimiter);
      expect(paths).toContain(localNodeModules);
      expect(paths).toContain(parentNodeModules);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds the package root from non-bin dist entrypoints', () => {
    const root = join(tmpdir(), `sap-mcp-node-path-${Date.now()}`);
    const packageRoot = join(root, 'node_modules', '@oobe-protocol-labs', 'sap-mcp-server');
    const paymentsPath = join(packageRoot, 'dist', 'payments', 'x402-paid-call.js');
    const localNodeModules = join(packageRoot, 'node_modules');
    const parentNodeModules = join(root, 'node_modules');

    try {
      mkdirSync(join(packageRoot, 'dist', 'payments'), { recursive: true });
      mkdirSync(localNodeModules, { recursive: true });
      writeFileSync(
        join(packageRoot, 'package.json'),
        JSON.stringify({ name: '@oobe-protocol-labs/sap-mcp-server' }),
      );

      installPackageNodePath(pathToFileURL(paymentsPath).href);

      const paths = (process.env.NODE_PATH ?? '').split(delimiter);
      expect(paths).toContain(localNodeModules);
      expect(paths).toContain(parentNodeModules);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
