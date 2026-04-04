const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let backendProcess = null;

function getBinaryName() {
  return process.platform === 'win32' ? 'reconciler.exe' : 'reconciler';
}

function getBinaryPath() {
  const name = getBinaryName();

  // Packaged: resources/backend/reconciler
  const packaged = path.join(process.resourcesPath, 'backend', name);
  if (fs.existsSync(packaged)) return packaged;

  // Dev: ../bin/reconciler
  const dev = path.join(__dirname, '..', 'bin', name);
  if (fs.existsSync(dev)) return dev;

  throw new Error(`Backend binary not found. Checked:\n  ${packaged}\n  ${dev}`);
}

function getFrontendPath() {
  // Packaged: resources/frontend/
  const packaged = path.join(process.resourcesPath, 'frontend');
  if (fs.existsSync(path.join(packaged, 'index.html'))) return packaged;

  // Dev: ../web/dist/
  const dev = path.join(__dirname, '..', 'web', 'dist');
  if (fs.existsSync(path.join(dev, 'index.html'))) return dev;

  return null; // Backend-only mode, no frontend served
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
      sock.on('error', () => setTimeout(tryConnect, 100));
    }
    tryConnect();
  });
}

async function startBackend() {
  const port = await getFreePort();
  const binPath = getBinaryPath();
  const cwd = app.getPath('userData');
  const frontendPath = getFrontendPath();

  const args = ['-port', String(port)];
  if (frontendPath) args.push('-static', frontendPath);

  console.log(`Starting backend: ${binPath} ${args.join(' ')}`);

  backendProcess = spawn(binPath, args, {
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
