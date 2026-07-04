const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * Notarizes the macOS desktop wizard after Electron Builder signs it.
 *
 * The hook intentionally skips local unsigned builds so developers can still
 * produce internal artifacts. Tagged release builds are guarded in GitHub
 * Actions and must provide Apple Developer ID credentials.
 *
 * @param {import('electron-builder').AfterPackContext} context Electron Builder context.
 * @returns {Promise<void>} Resolves after notarization is complete or skipped.
 */
module.exports = async function notarizeMacBuild(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const entitlementsPath = path.join(context.packager.projectDir, 'apps', 'desktop', 'build', 'entitlements.mac.plist');

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn(`Applying ad hoc macOS signature to unsigned build: ${appPath}`);
    execFileSync('codesign', [
      '--force',
      '--deep',
      '--sign',
      '-',
      '--options',
      'runtime',
      '--timestamp=none',
      '--entitlements',
      entitlementsPath,
      appPath,
    ], { stdio: 'inherit' });
    console.warn('Skipping macOS notarization: Apple notarization credentials are not configured.');
    return;
  }

  const { notarize } = require('@electron/notarize');

  console.log(`Notarizing ${appPath}`);

  await notarize({
    appBundleId: 'ai.oobeprotocol.sap-mcp-wizard',
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
};
