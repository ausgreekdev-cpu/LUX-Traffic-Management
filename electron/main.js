const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
const BACKEND_PORT = 3001;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'debug.log'), line); } catch {}
  console.log(msg);
}

function findAvailablePort(startPort) {
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      server.close(() => resolve(startPort));
    });
    server.on('error', () => resolve(findAvailablePort(startPort + 1)));
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
    title: 'LUX Traffic Management',
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

app.whenReady().then(async () => {
  try {
    await startBackend();
    log('Backend process started, checking health...');
    await waitForHealth(BACKEND_PORT, 20);
    log('Backend health check passed, creating window');
  } catch (e) {
    log('Backend start issue: ' + e.message + ' - creating window anyway');
  }
  createWindow();
});

app.on('window-all-closed', () => { app.quit(); });
app.on('before-quit', () => {});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
