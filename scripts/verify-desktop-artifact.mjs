import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const releaseDir = join(repoRoot, 'release', 'desktop');

/**
 * @name loadAsarModule
 * @description Loads Electron's ASAR reader from a direct dependency when present,
 * falling back to pnpm's transitive electron-builder dependency layout.
 * @returns {{ listPackage: (archive: string) => string[], extractFile: (archive: string, file: string) => Buffer }} ASAR module.
 */
function loadAsarModule() {
  try {
    return require('@electron/asar');
  } catch {
    const pnpmDir = join(repoRoot, 'node_modules', '.pnpm');
    const candidate = readdirSync(pnpmDir)
      .find(entry => entry.startsWith('@electron+asar@'));

    if (!candidate) {
      throw new Error('Cannot find @electron/asar. Run pnpm install before verifying desktop artifacts.');
    }

    return require(join(pnpmDir, candidate, 'node_modules', '@electron', 'asar'));
  }
}

/**
 * @name collectAppAsars
 * @description Recursively finds packaged Electron app.asar files produced by
 * electron-builder across macOS, Windows, and Linux outputs.
 * @param {string} root Directory to scan.
 * @returns {string[]} Absolute app.asar paths.
 */
function collectAppAsars(root) {
  if (!existsSync(root)) {
    return [];
  }

  const found = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }

      if (entry.isFile() && entry.name === 'app.asar') {
        found.push(absolute);
      }
    }
  }

  return found.sort();
}

/**
 * @name assertPackagedRenderer
 * @description Verifies that a packaged Electron archive contains the desktop
 * renderer, preload bridge, main process entry, and relative file:// asset URLs.
 * @param {ReturnType<typeof loadAsarModule>} asar Electron ASAR module.
 * @param {string} archive App ASAR path.
 */
function assertPackagedRenderer(asar, archive) {
  const files = new Set(asar.listPackage(archive).map(file => file.replace(/\\/g, '/').replace(/^\//, '')));
  const requiredFiles = [
    'apps/desktop/main.mjs',
    'apps/desktop/preload.cjs',
    'apps/desktop/dist-renderer/index.html',
    'dist/wizard-core/desktop-flow.js',
  ];

  for (const requiredFile of requiredFiles) {
    if (!files.has(requiredFile)) {
      throw new Error(`${archive} is missing ${requiredFile}`);
    }
  }

  const html = asar.extractFile(archive, 'apps/desktop/dist-renderer/index.html').toString('utf-8');
  if (!html.includes('src="./assets/')) {
    throw new Error(`${archive} renderer index.html does not use relative script assets.`);
  }
  if (!html.includes('href="./assets/')) {
    throw new Error(`${archive} renderer index.html does not use relative stylesheet assets.`);
  }
  if (html.includes('src="/assets/') || html.includes('href="/assets/')) {
    throw new Error(`${archive} renderer index.html contains absolute /assets paths that break file:// Electron loading.`);
  }

  const mainProcess = asar.extractFile(archive, 'apps/desktop/main.mjs').toString('utf-8');
  if (!mainProcess.includes('let mainWindow')) {
    throw new Error(`${archive} main process does not keep a persistent BrowserWindow reference.`);
  }
}

const asar = loadAsarModule();
const archives = collectAppAsars(releaseDir);

if (archives.length === 0) {
  throw new Error(`No packaged app.asar files found under ${releaseDir}`);
}

for (const archive of archives) {
  assertPackagedRenderer(asar, archive);
  const stats = statSync(archive);
  console.log(`Verified desktop artifact: ${archive} (${stats.size} bytes)`);
}
