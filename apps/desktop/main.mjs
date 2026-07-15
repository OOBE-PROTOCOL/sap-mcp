import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { appendFileSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const rendererDir = join(__dirname, 'dist-renderer');

/** @type {BrowserWindow | null} */
let mainWindow = null;

async function loadWizardCore() {
  const modulePath = join(repoRoot, 'dist', 'wizard-core', 'desktop-flow.js');
  return await import(pathToFileURL(modulePath).href);
}

function writeDesktopLog(message, data) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    message,
    ...(data ? { data } : {}),
  });

  try {
    const logDir = app.isReady() ? app.getPath('logs') : join(process.cwd(), 'logs');
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, 'sap-mcp-wizard.log'), `${line}\n`, 'utf-8');
  } catch {
    // Keep logging best-effort so diagnostics never block the wizard UI.
  }
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function registerWizardHandler(channel, handler) {
  ipcMain.handle(channel, async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      writeDesktopLog(`${channel} failed`, serializeError(error));
      throw error;
    }
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 760,
    minHeight: 640,
    center: true,
    useContentSize: true,
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
    writeDesktopLog('renderer failed to load', { errorCode, errorDescription, validatedURL });
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`SAP MCP Wizard renderer process exited: ${details.reason}`);
    writeDesktopLog('renderer process gone', details);
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
  writeDesktopLog('app ready', {
    platform: process.platform,
    version: app.getVersion(),
    repoRoot,
    rendererDir,
  });

  registerWizardHandler('wizard:get-initial-state', async () => {
    const core = await loadWizardCore();
    return {
      draft: core.createDefaultDesktopWizardDraft(),
      runtimes: core.getDesktopRuntimeStatuses(),
      profiles: core.getDesktopProfileStatuses(),
    };
  });

  registerWizardHandler('wizard:save', async (_event, draft) => {
    const core = await loadWizardCore();
    return await core.saveDesktopWizardDraft(draft);
  });

  registerWizardHandler('wizard:open-external', async (_event, url) => {
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
}).catch((error) => {
  writeDesktopLog('app startup failed', serializeError(error));
  throw error;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
