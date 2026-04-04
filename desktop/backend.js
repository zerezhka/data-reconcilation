const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

let backendProcess = null;

function getBinaryName() {
  const base = process.platform === 'win32' ? 'reconciler.exe' : 'reconciler';
  return base;
}

function getBinaryPath() {
  // In packaged app: resources/backend/reconciler
  const packaged = path.join(process.resourcesPath, 'backend', getBinaryName());
  if (fs.existsSync(packaged)) return packaged;

  // In dev: ../bin/<os>/reconciler
  const osName = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[process.platform];
  const dev = path.join(__dirname, '..', 'bin', osName, getBinaryName());
  if (fs.existsSync(dev)) return dev;

  // Fallback: ../bin/reconciler
  const fallback = path.join(__dirname, '..', 'bin', getBinaryName());
  if (fs.existsSync(fallback)) return fallback;

  throw new Error(`Backend binary not found. Looked at:\n  ${packaged}\n  ${dev}\n  ${fallback}`);
}

function getWorkingDir() {
  // Use app's userData dir for config files (datasources.json, checks.json, etc.)
  const { app } = require('electron');
  return app.getPath('userData');
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function waitForPort(port, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      if (Date.now() - start > timeout) {
        return reject(new Error(`Backend did not start within ${timeout}ms`));
      }
      const sock = net.connect({ port, host: '127.0.0.1' }, () => {
        sock.destroy();
        resolve();
      });
      sock.on('error', () => {
        setTimeout(tryConnect, 100);
      });
    }
    tryConnect();
  });
}

async function startBackend() {
  const port = await getFreePort();
  const binPath = getBinaryPath();
  const cwd = getWorkingDir();

  console.log(`Starting backend: ${binPath} -port ${port} (cwd: ${cwd})`);

  backendProcess = spawn(binPath, ['-port', String(port)], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`));
  backendProcess.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`));

  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    backendProcess = null;
  });

  await waitForPort(port);
  console.log(`Backend ready on port ${port}`);
  return port;
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

module.exports = { startBackend, stopBackend };
