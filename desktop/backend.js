const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let backendProcess = null;

function getBackendBinaryName() {
  return process.platform === 'win32' ? 'reconciler.exe' : 'reconciler';
}

function findBinaryPath() {
  const name = getBackendBinaryName();

  // 1. Downloaded by downloader (userData/backend/)
  const downloaded = path.join(app.getPath('userData'), 'backend', name);
  if (fs.existsSync(downloaded)) return downloaded;

  // 2. Dev mode (../bin/)
  const dev = path.join(__dirname, '..', 'bin', name);
  if (fs.existsSync(dev)) return dev;

  throw new Error(`Backend binary not found. Checked:\n  ${downloaded}\n  ${dev}`);
}

function findFrontendPath() {
  // 1. Downloaded by downloader
  const downloaded = path.join(app.getPath('userData'), 'frontend');
  if (fs.existsSync(path.join(downloaded, 'index.html'))) return downloaded;

  // 2. Dev mode
  const dev = path.join(__dirname, '..', 'web', 'dist');
  if (fs.existsSync(path.join(dev, 'index.html'))) return dev;

  return null;
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

function waitForPort(port, timeout = 15000) {
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
  const binPath = findBinaryPath();
  const cwd = app.getPath('userData');
  const frontendPath = findFrontendPath();

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
