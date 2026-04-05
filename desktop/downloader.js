const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { createGunzip } = require('zlib');
const tar = require('tar');

const REPO = 'zerezhka/data-reconcilation';
const COMPONENTS_FILE = 'components.json';

function getComponentsPath() {
  return path.join(app.getPath('userData'), COMPONENTS_FILE);
}

function loadComponents() {
  try {
    return JSON.parse(fs.readFileSync(getComponentsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveComponents(data) {
  fs.writeFileSync(getComponentsPath(), JSON.stringify(data, null, 2));
}

function getPlatformSuffix() {
  const os = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[process.platform] || process.platform;
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  return `${os}-${arch}`;
}

function getBackendBinaryName() {
  return process.platform === 'win32' ? 'reconciler.exe' : 'reconciler';
}

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, { headers: { 'User-Agent': 'DataReconciler', Accept: 'application/json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });

    function doGet(url) {
      const get = url.startsWith('https') ? https.get : http.get;
      get(url, { headers: { 'User-Agent': 'DataReconciler' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doGet(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const file = createWriteStream(dest);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (onProgress && total > 0) onProgress(downloaded / total);
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    }
    doGet(url);
  });
}

async function getLatestRelease() {
  return fetchJSON(`https://api.github.com/repos/${REPO}/releases/latest`);
}

function findAsset(release, pattern) {
  return release.assets.find((a) => a.name.includes(pattern));
}

async function downloadBackend(release, destDir, onProgress) {
  const suffix = getPlatformSuffix();
  const asset = findAsset(release, `reconciler-`) &&
    release.assets.find((a) => a.name.includes(suffix) && a.name.startsWith('reconciler-'));
  if (!asset) throw new Error(`No backend binary found for ${suffix}`);

  const binName = getBackendBinaryName();
  const dest = path.join(destDir, 'backend', binName);
  await downloadFile(asset.browser_download_url, dest, onProgress);

  if (process.platform !== 'win32') {
    fs.chmodSync(dest, 0o755);
  }

  // Extract version from asset name: reconciler-0.4.1-linux-amd64
  const match = asset.name.match(/reconciler-([0-9.]+)-/);
  return { version: match ? match[1] : release.tag_name, path: dest };
}

async function downloadFrontend(release, destDir, onProgress) {
  const asset = release.assets.find((a) => a.name.startsWith('frontend-') && a.name.endsWith('.tar.gz'));
  if (!asset) throw new Error('No frontend archive found in release');

  const tarDest = path.join(destDir, 'frontend.tar.gz');
  const extractDir = path.join(destDir, 'frontend');
  await downloadFile(asset.browser_download_url, tarDest, onProgress);

  // Extract
  fs.mkdirSync(extractDir, { recursive: true });
  await tar.x({ file: tarDest, cwd: extractDir });
  fs.unlinkSync(tarDest);

  const match = asset.name.match(/frontend-([0-9.]+)\.tar\.gz/);
  return { version: match ? match[1] : release.tag_name, path: extractDir };
}

async function ensureComponents(onStatus) {
  const dataDir = app.getPath('userData');
  const components = loadComponents();

  const backendPath = path.join(dataDir, 'backend', getBackendBinaryName());
  const frontendPath = path.join(dataDir, 'frontend', 'index.html');

  const needBackend = !components.backend || !fs.existsSync(backendPath);
  const needFrontend = !components.frontend || !fs.existsSync(frontendPath);

  if (!needBackend && !needFrontend) {
    return components;
  }

  onStatus('Checking latest release...');
  const release = await getLatestRelease();

  if (needBackend) {
    onStatus('Downloading backend...');
    const result = await downloadBackend(release, dataDir, (pct) => {
      onStatus(`Downloading backend... ${Math.round(pct * 100)}%`);
    });
    components.backend = result;
  }

  if (needFrontend) {
    onStatus('Downloading frontend...');
    const result = await downloadFrontend(release, dataDir, (pct) => {
      onStatus(`Downloading frontend... ${Math.round(pct * 100)}%`);
    });
    components.frontend = result;
  }

  components.release = release.tag_name;
  saveComponents(components);
  return components;
}

async function checkForUpdates() {
  try {
    const components = loadComponents();
    const release = await getLatestRelease();
    const currentTag = components.release || 'v0.0.0';
    if (release.tag_name !== currentTag) {
      return { available: true, current: currentTag, latest: release.tag_name, release };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

async function performUpdate(release, onStatus) {
  const dataDir = app.getPath('userData');
  const components = loadComponents();

  onStatus('Updating backend...');
  const backend = await downloadBackend(release, dataDir, (pct) => {
    onStatus(`Updating backend... ${Math.round(pct * 100)}%`);
  });
  components.backend = backend;

  onStatus('Updating frontend...');
  const frontend = await downloadFrontend(release, dataDir, (pct) => {
    onStatus(`Updating frontend... ${Math.round(pct * 100)}%`);
  });
  components.frontend = frontend;

  components.release = release.tag_name;
  saveComponents(components);
  return components;
}

module.exports = { ensureComponents, checkForUpdates, performUpdate, loadComponents };
