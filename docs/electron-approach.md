# Packaging Strategy: Desktop App

## Три режима доставки

### 1. Dev / Debug — просто Go + браузер

```
Go backend (localhost:8080) → браузер
```

Никакого Electron. Запустил бинарник, открыл `http://localhost:8080`. Для разработки и для друга на этапе тестирования — этого достаточно.

### 2. Debug Electron — обёртка над localhost

```
Electron shell → BrowserWindow.loadURL('http://localhost:8080')
Go backend запускается как child process
```

Electron просто открывает localhost. Go-бэкенд стартует как дочерний процесс при запуске приложения. Это даёт иконку в трее, нативные окна, горячие клавиши — но по сути это браузер с рамкой.

**Плюсы:** быстро собрать, легко дебажить (DevTools открыты), hot reload фронта работает.

**Минус:** требует чтобы Go-бинарник был рядом.

### 3. Production — Electron + embedded Go

```
Electron app
├── main.js (Electron main process)
├── web/dist/ (React статика)
├── bin/reconciler (Go бинарник)
└── resources/
```

Electron запускает Go как child process на рандомном свободном порту, фронт грузится из локальных файлов или проксирует API на этот порт.

---

## Структура Electron-обёртки

```
electron/
├── package.json
├── main.js           # главный процесс
├── preload.js        # bridge для IPC
├── forge.config.js   # electron-forge конфиг для сборки
└── assets/
    └── icon.png
```

## main.js — ядро

```javascript
const { app, BrowserWindow, Tray, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

let mainWindow;
let tray;
let backendProcess;

const IS_DEV = process.env.NODE_ENV === 'development';
const BACKEND_PORT = IS_DEV ? 8080 : null; // в prod — рандомный

// =============================================
// Поиск свободного порта (production)
// =============================================
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// =============================================
// Запуск Go-бэкенда
// =============================================
async function startBackend() {
  if (IS_DEV) {
    // Dev: предполагаем что Go уже запущен на :8080
    console.log('[dev] Using existing backend at localhost:8080');
    return 8080;
  }

  const port = await getFreePort();
  const binaryName = process.platform === 'win32' ? 'reconciler.exe' : 'reconciler';
  const binaryPath = path.join(process.resourcesPath, 'bin', binaryName);

  backendProcess = spawn(binaryPath, ['-port', String(port)], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[backend] ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[backend] ${data}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`[backend] exited with code ${code}`);
  });

  // Ждём пока бэкенд поднимется
  await waitForBackend(port);
  return port;
}

function waitForBackend(port, retries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = net.createConnection({ port }, () => {
        req.end();
        resolve();
      });
      req.on('error', () => {
        attempts++;
        if (attempts >= retries) {
          reject(new Error('Backend failed to start'));
        } else {
          setTimeout(check, 200);
        }
      });
    };
    check();
  });
}

// =============================================
// Создание окна
// =============================================
async function createWindow() {
  const port = await startBackend();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Data Reconciler',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dev: открываем localhost напрямую
  // Prod: тоже localhost, но на рандомном порту с embedded бэкендом
  const url = `http://localhost:${port}`;
  mainWindow.loadURL(url);

  // DevTools в dev-режиме
  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Скрыть меню в production
  if (!IS_DEV) {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Minimize to tray вместо закрытия
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// =============================================
// System Tray
// =============================================
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Открыть',
      click: () => mainWindow?.show(),
    },
    {
      label: 'Запустить все проверки',
      click: () => {
        mainWindow?.webContents.send('run-all-checks');
        mainWindow?.show();
      },
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Data Reconciler');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

// =============================================
// App lifecycle
// =============================================
app.whenReady().then(() => {
  createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  // На macOS не закрываемся
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Убиваем Go-бэкенд при выходе
  if (backendProcess) {
    backendProcess.kill('SIGTERM');

    // Если не умер за 3 секунды — SIGKILL
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        backendProcess.kill('SIGKILL');
      }
    }, 3000);
  }
});
```

## package.json

```json
{
  "name": "data-reconciler",
  "version": "0.1.0",
  "description": "Data reconciliation tool",
  "main": "main.js",
  "scripts": {
    "dev": "NODE_ENV=development electron .",
    "build": "electron-forge make",
    "package": "electron-forge package"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.0.0",
    "@electron-forge/maker-deb": "^7.0.0",
    "@electron-forge/maker-rpm": "^7.0.0",
    "@electron-forge/maker-squirrel": "^7.0.0",
    "@electron-forge/maker-zip": "^7.0.0",
    "electron": "^30.0.0"
  }
}
```

## forge.config.js — сборка под платформы

```javascript
module.exports = {
  packagerConfig: {
    name: 'DataReconciler',
    icon: './assets/icon',
    extraResource: [
      // Go бинарник кладём в resources
      './bin/reconciler',        // linux/mac
      './bin/reconciler.exe',    // windows
    ],
    // Платформо-специфичные бинарники
    // Собираются через: GOOS=windows GOARCH=amd64 go build ...
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',   // Windows .exe installer
      config: { name: 'DataReconciler' },
    },
    {
      name: '@electron-forge/maker-zip',        // macOS .zip
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',        // Linux .deb
      config: { options: { maintainer: 'Sergey' } },
    },
  ],
};
```

---

## Tauri — альтернатива (если Electron слишком жирный)

```
Electron:  ~150MB (тащит Chromium)
Tauri:     ~5-10MB (системный WebView)
```

Tauri идеологически ближе: лёгкий, бэкенд на Rust (или sidecar на Go). Но экосистема моложе и есть нюансы с WebView на Windows (EdgeWebView2). Для MVP Electron проще — потом можно мигрировать.

---

## Сборка и релиз

### Cross-compile Go бэкенда

```bash
# Linux
GOOS=linux GOARCH=amd64 go build -o bin/reconciler ./cmd/server

# Windows
GOOS=windows GOARCH=amd64 go build -o bin/reconciler.exe ./cmd/server

# macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o bin/reconciler-darwin ./cmd/server

# macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o bin/reconciler-darwin-arm ./cmd/server
```

### CI/CD (GitHub Actions)

```yaml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  build-backend:
    strategy:
      matrix:
        include:
          - goos: linux
            goarch: amd64
            ext: ''
          - goos: windows
            goarch: amd64
            ext: '.exe'
          - goos: darwin
            goarch: amd64
            ext: ''
          - goos: darwin
            goarch: arm64
            ext: ''
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - run: |
          GOOS=${{ matrix.goos }} GOARCH=${{ matrix.goarch }} \
          go build -ldflags="-s -w" -o reconciler${{ matrix.ext }} ./cmd/server
      - uses: actions/upload-artifact@v4
        with:
          name: backend-${{ matrix.goos }}-${{ matrix.goarch }}
          path: reconciler*

  build-electron:
    needs: build-backend
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - run: npm ci
        working-directory: electron
      - run: npm run build
        working-directory: electron
      - uses: actions/upload-artifact@v4
        with:
          name: app-${{ matrix.os }}
          path: electron/out/make/**/*
```

---

## Auto-update (без Electron, standalone Go)

Если обойтись без Electron — автоапдейт через GitHub Releases:

```go
// При запуске проверяем версию
const currentVersion = "0.1.0"

func checkForUpdate() {
    resp, _ := http.Get(
      "https://api.github.com/repos/sergey/data-reconciler/releases/latest")
    
    var release struct {
        TagName string `json:"tag_name"`
        Assets  []struct {
            Name               string `json:"name"`
            BrowserDownloadURL string `json:"browser_download_url"`
        } `json:"assets"`
    }
    json.NewDecoder(resp.Body).Decode(&release)

    if release.TagName != "v"+currentVersion {
        // Найти ассет для текущей ОС
        // Скачать, заменить бинарник, перезапуститься
        log.Printf("🔄 New version available: %s", release.TagName)
    }
}
```

---

## Рекомендация

**Этап 1 (сейчас):** Go бинарник + localhost + браузер. Дать другу попробовать.

**Этап 2 (если зайдёт):** Electron debug mode — `loadURL('http://localhost:8080')`, иконка в трее, "настоящее" приложение.

**Этап 3 (если продукт):** Electron production с embedded Go, автоапдейт через GitHub Releases, installers под Win/Mac/Linux.

**Этап 4 (если масштаб):** Tauri вместо Electron (если размер критичен) или SaaS (если нужен multi-tenant).
