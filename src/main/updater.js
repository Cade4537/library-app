// Checks GitHub Releases for new versions, downloads them in the background,
// and installs on restart. Only active in the installed (packaged) app.
const { app } = require('electron');

class Updater {
  constructor(send) {
    this.send = send;
    this.state = { status: app.isPackaged ? 'idle' : 'dev', version: app.getVersion(), next: null, progress: 0, error: null };
    this.au = null;
    if (!app.isPackaged) return;
    try {
      this.au = require('electron-updater').autoUpdater;
    } catch {
      this.state.status = 'dev';
      return;
    }
    const au = this.au;
    au.autoDownload = true;
    au.autoInstallOnAppQuit = true;
    au.on('checking-for-update', () => this.set({ status: 'checking', error: null }));
    au.on('update-available', (i) => this.set({ status: 'downloading', next: i.version, progress: 0 }));
    au.on('update-not-available', () => this.set({ status: 'current' }));
    au.on('download-progress', (p) => this.set({ status: 'downloading', progress: Math.round(p.percent || 0) }));
    au.on('update-downloaded', (i) => this.set({ status: 'ready', next: i.version, progress: 100 }));
    au.on('error', (e) => this.set({ status: 'error', error: friendly(e) }));
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.send(this.state);
  }

  start() {
    if (!this.au) return;
    setTimeout(() => this.check(), 8000);
    setInterval(() => this.check(), 4 * 60 * 60 * 1000);
  }

  async check() {
    if (!this.au) return this.state;
    if (this.state.status === 'downloading' || this.state.status === 'ready') return this.state;
    try { await this.au.checkForUpdates(); } catch (e) { this.set({ status: 'error', error: friendly(e) }); }
    return this.state;
  }

  install() {
    if (this.au && this.state.status === 'ready') this.au.quitAndInstall(false, true);
  }
}

function friendly(e) {
  const m = String((e && e.message) || e || '');
  if (/404|latest\.yml/i.test(m)) return 'No releases published yet.';
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|net::/i.test(m)) return 'Could not reach GitHub.';
  return m.split('\n')[0].slice(0, 160);
}

module.exports = { Updater };
