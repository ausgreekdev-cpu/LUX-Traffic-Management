const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
const BACKEND_PORT = 3001;

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

function startBackend() {
  const isDev = !app.isPackaged;
  const backendDir = isDev
    ? path.join(__dirname, '..', '..', 'backend')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'backend');

  const scriptPath = path.join(backendDir, 'src', 'index.js');

  const userDataPath = app.getPath('userData');

  const runtime = isDev ? 'node' : process.execPath;
  const env = { ...process.env, PORT: String(BACKEND_PORT), NODE_ENV: 'production', DB_PATH: path.join(userDataPath, 'tmpcms.db') };
  if (!isDev) env.ELECTRON_RUN_AS_NODE = '1';

  backendProcess = spawn(runtime, [scriptPath], {
    cwd: backendDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data.toString().trim()}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data.toString().trim()}`);
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
    dialog.showErrorBox('Backend Error', `Failed to start backend: ${err.message}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    title: 'LUX Traffic Management',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('http://localhost:' + BACKEND_PORT);
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(async () => {
  startBackend();
  await new Promise(resolve => setTimeout(resolve, 2000));
  createWindow();
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
