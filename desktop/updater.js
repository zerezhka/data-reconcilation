const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

function initUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log(`Update available: ${info.version}`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`Update downloaded: ${info.version}`);
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded. Restart to apply.`,
      buttons: ['Restart', 'Later'],
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.log('Auto-update error:', err.message);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.log('Update check failed:', err.message);
  });
}

module.exports = { initUpdater };
