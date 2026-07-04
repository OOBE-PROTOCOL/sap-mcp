const path = require('node:path');

module.exports = {
  appId: 'ai.oobeprotocol.sap-mcp-wizard',
  productName: 'SAP MCP Wizard',
  copyright: 'Copyright © 2026 OOBE Protocol Labs',
  directories: {
    output: path.join('release', 'desktop'),
    buildResources: path.join('apps', 'desktop', 'build'),
  },
  icon: path.join('apps', 'desktop', 'build', 'icon.png'),
  files: [
    'apps/desktop/main.mjs',
    'apps/desktop/preload.cjs',
    'apps/desktop/dist-renderer/**/*',
    'dist/**/*',
    'assets/**/*',
    'skills/**/*',
    'USER_DOCS/**/*',
    'README.md',
    'LICENSE',
    'package.json',
  ],
  extraMetadata: {
    main: 'apps/desktop/main.mjs',
  },
  mac: {
    category: 'public.app-category.developer-tools',
    target: ['dmg', 'zip'],
    artifactName: 'SAP-MCP-Wizard-${version}-${arch}.${ext}',
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },
  dmg: {
    artifactName: 'SAP-MCP-Wizard-${version}-${arch}.dmg',
  },
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    artifactName: 'SAP-MCP-Wizard-Setup-${version}-${arch}.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  linux: {
    target: ['AppImage', 'tar.gz'],
    category: 'Development',
    artifactName: 'sap-mcp-wizard-${version}-${arch}.${ext}',
  },
};
