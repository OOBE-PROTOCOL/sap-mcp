import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const rendererDir = join(__dirname, 'dist-renderer');

/** @type {BrowserWindow | null} */
let mainWindow = null;

async function loadWizardCore() {
  return await import(join(repoRoot, 'dist', 'wizard-core', 'desktop-flow.js'));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 920,
    minHeight: 680,
    title: 'SAP MCP Wizard',
    backgroundColor: '#071114',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow = window;

  window.once('ready-to-show', () => {
    window.show();
    window.focus();
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`SAP MCP Wizard renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`SAP MCP Wizard renderer process exited: ${details.reason}`);
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (process.env.SAP_MCP_DESKTOP_DEV_URL) {
    void window.loadURL(process.env.SAP_MCP_DESKTOP_DEV_URL);
  } else {
    void window.loadFile(join(rendererDir, 'index.html'));
  }

  return window;
}

app.whenReady().then(() => {
  ipcMain.handle('wizard:get-initial-state', async () => {
    const core = await loadWizardCore();
    return {
      draft: core.createDefaultDesktopWizardDraft(),
      runtimes: core.getDesktopRuntimeStatuses(),
    };
  });

  ipcMain.handle('wizard:save', async (_event, draft) => {
    const core = await loadWizardCore();
    return await core.saveDesktopWizardDraft(draft);
  });

  ipcMain.handle('wizard:open-external', async (_event, url) => {
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      throw new Error('Only https:// links can be opened from the desktop wizard.');
    }
    await shell.openExternal(url);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
