const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { startBackend, stopBackend } = require('./backend');
const { ensureComponents, checkForUpdates, performUpdate } = require('./downloader');

let mainWindow = null;
let splashWindow = null;

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    transparent: false,
    resizable: false,
    backgroundColor: '#09090b',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0;background:#09090b;color:#a1a1aa;font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh">
      <h2 style="color:#e4e4e7;margin:0 0 16px">Data Reconciler</h2>
      <p id="status" style="font-size:13px;margin:0">Starting...</p>
      <script>
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('status', (_, msg) => document.getElementById('status').textContent = msg);
      </script>
    </body>
    </html>
  `)}`);
}

function updateSplashStatus(msg) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('status', msg);
  }
}

async function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Data Reconciler',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function handleUpdateCheck() {
  const update = await checkForUpdates();
  if (!update.available) return;

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `New version ${update.latest} available (current: ${update.current}).`,
    buttons: ['Update & Restart', 'Later'],
  });

  if (response !== 0) return;

  createSplash();
  if (mainWindow) mainWindow.hide();

  try {
    await performUpdate(update.release, updateSplashStatus);
    stopBackend();
    app.relaunch();
    app.exit(0);
  } catch (err) {
    dialog.showErrorBox('Update Failed', err.message);
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    if (mainWindow) mainWindow.show();
  }
}

app.whenReady().then(async () => {
  createSplash();

  try {
    // Download backend + frontend if needed
    await ensureComponents(updateSplashStatus);

    // Start backend
    updateSplashStatus('Starting backend...');
    const port = await startBackend();

    // Open main window
    await createMainWindow(port);

    // Check for updates in background
    setTimeout(handleUpdateCheck, 5000);
  } catch (err) {
    console.error('Startup failed:', err);
    dialog.showErrorBox('Startup Failed', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopBackend();
  app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});
