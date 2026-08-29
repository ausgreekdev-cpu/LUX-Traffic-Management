const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
const BACKEND_PORT = 3001;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'debug.log'), line); } catch {}
  console.log(msg);
}

async function isBackendRunning(port) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`http://localhost:${port}/api/health`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { const j = JSON.parse(data); resolve(j.status === 'ok'); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

async function startBackend() {
  const isDev = !app.isPackaged;
  const backendDir = isDev
    ? path.join(__dirname, '..', 'backend')
    : path.join(process.resourcesPath, 'backend');

  const userDataPath = app.getPath('userData');
  process.env.PORT = String(BACKEND_PORT);
  process.env.NODE_ENV = isDev ? 'development' : 'production';
  if (!process.env.DB_PATH) {
    if (isDev) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = path.join(userDataPath, 'tmpcms.db');
      process.env.UPLOADS_DIR = path.join(userDataPath, 'uploads');
    }
  }
  process.chdir(backendDir);

  const backendPath = path.join(backendDir, 'src', 'index.js');
  const backendUrl = require('url').pathToFileURL(backendPath).href;

  try {
    await import(backendUrl);
    log('Backend module loaded');
  } catch (err) {
    log(`Backend failed to load: ${err.message}`);
    dialog.showErrorBox('Backend Error', `Backend failed to load: ${err.message}`);
    throw err;
  }
}

function waitForHealth(port, retries) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    function check(n) {
      if (n <= 0) return reject(new Error('Health check failed after retries'));
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { const j = JSON.parse(data); if (j.status === 'ok') return resolve(); } catch {}
          setTimeout(() => check(n - 1), 500);
        });
      });
      req.on('error', () => setTimeout(() => check(n - 1), 500));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(() => check(n - 1), 500); });
    }
    check(retries);
  });
}

function createWindow() {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    title: 'Delux TPM CRM',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.on('ready-to-show', () => { mainWindow.show(); });

  mainWindow.webContents.on('console-message', (e, level, msg) => {
    log(`[Renderer] ${msg}`);
  });

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    log(`[Renderer] Failed to load ${url}: ${desc} (${code})`);
  });

  mainWindow.loadURL('http://localhost:' + BACKEND_PORT);
  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => { mainWindow = null; });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  if (process.windowsStore) {
    log('Windows Store package detected - auto-update disabled (Store manages updates)');
    return;
  }
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    log('Portable build detected - auto-update disabled');
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m) => log('[AutoUpdater] ' + m),
    warn: (m) => log('[AutoUpdater] ' + m),
    error: (m) => log('[AutoUpdater] ' + m),
    debug: (m) => log('[AutoUpdater] ' + m)
  };
  autoUpdater.on('error', (err) => log('Auto-update error: ' + err.message));
  autoUpdater.on('update-available', (info) => log('Update available: ' + info.version));
  autoUpdater.on('update-not-available', () => log('No updates available'));
  autoUpdater.on('update-downloaded', (info) => {
    log('Update downloaded: ' + info.version + ' - installing on quit');
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update ready',
        message: 'Delux TPM CRM ' + info.version + ' has been downloaded and will install when you quit the app.',
        buttons: ['Restart now', 'Later']
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      }).catch(() => {});
    }
  });
  autoUpdater.checkForUpdatesAndNotify().catch((err) => log('Auto-update check failed: ' + err.message));
}

app.whenReady().then(async () => {
  setupAutoUpdater();
  try {
    const external = await isBackendRunning(BACKEND_PORT);
    if (external) {
      log('External backend detected on port ' + BACKEND_PORT + ' - reusing it');
    } else {
      await startBackend();
      log('Backend process started, checking health...');
    }
    await waitForHealth(BACKEND_PORT, 20);
    log('Backend health check passed, creating window');
  } catch (e) {
    log('Backend start issue: ' + e.message + ' - creating window anyway');
  }
  createWindow();
});

app.on('window-all-closed', () => { app.quit(); });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
