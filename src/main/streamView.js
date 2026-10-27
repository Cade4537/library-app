// Xbox Remote Play inside the Crimson Vault window, next to the sidebar.
// The stream page is Xbox's own (xbox.com/play/consoles) with the same Microsoft sign in as
// the Xbox connection. It keeps streaming while you look at other pages; End stream closes it.
const { WebContentsView, session, shell } = require('electron');
const { autoStart, chromeUA, PARTITION, CONSOLES_URL, MS_HOSTS } = require('./remoteplay');

class StreamView {
  constructor(getWindow, onState) {
    this.getWindow = getWindow;
    this.onState = onState; // tells the page when the stream opens, closes or goes full screen
    this.view = null;
    this.shown = false;
    this.bounds = null;
    this.full = false;
  }

  get open() { return !!this.view; }

  start(consoleName) {
    if (this.view) return;
    const ses = session.fromPartition(PARTITION);
    ses.setUserAgent(chromeUA(ses));
    ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['fullscreen', 'pointerLock', 'keyboardLock', 'media'].includes(perm)));
    const view = new WebContentsView({ webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } });
    view.setBackgroundColor('#000000');
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      try {
        const u = new URL(url);
        if (u.protocol === 'https:' && MS_HOSTS.test(u.hostname)) return { action: 'allow' };
        if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(url);
      } catch {}
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => { if (!/^https?:/i.test(url)) e.preventDefault(); });
    const inject = () => wc.executeJavaScript(autoStart(consoleName)).catch(() => {});
    wc.on('did-finish-load', inject);
    wc.on('did-navigate-in-page', inject);
    // The page's own full screen button, F11 and Esc.
    wc.on('enter-html-full-screen', () => this.setFull(true));
    wc.on('leave-html-full-screen', () => this.setFull(false));
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F11') { e.preventDefault(); this.setFull(!this.full); }
    });
    wc.on('render-process-gone', () => this.stop());
    wc.loadURL(CONSOLES_URL);
    this.view = view;
    this.onState({ open: true, full: false });
  }

  // Full screen stream: the stream covers the whole window (and the window goes full screen).
  setFull(on) {
    const win = this.getWindow();
    if (!this.view || !win || win.isDestroyed()) return;
    this.full = !!on;
    win.setFullScreen(this.full);
    this.onState({ open: true, full: this.full });
    setTimeout(() => this.layout(), 150);
  }

  layout() {
    const win = this.getWindow();
    if (!this.view || !win || win.isDestroyed()) return;
    if (this.full) {
      const [w, h] = win.getContentSize();
      this.view.setBounds({ x: 0, y: 0, width: w, height: h });
      if (!this.shown) { this.view.setVisible(true); this.shown = true; }
      return;
    }
    const b = this.bounds;
    if (!b || b.width < 50 || b.height < 50) {
      if (this.shown) { this.view.setVisible(false); this.shown = false; }
      return;
    }
    this.view.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
    if (!this.shown) { this.view.setVisible(true); this.shown = true; }
  }

  set(bounds) {
    this.bounds = bounds;
    const win = this.getWindow();
    if (!this.view || !win || win.isDestroyed()) return;
    if (!win.contentView.children.includes(this.view)) win.contentView.addChildView(this.view);
    this.layout();
    if (this.shown && bounds && !this.full) this.view.webContents.focus();
  }

  // Ends the stream and frees its memory.
  stop() {
    const win = this.getWindow();
    if (this.view) {
      try { if (win && !win.isDestroyed()) win.contentView.removeChildView(this.view); } catch {}
      try { this.view.webContents.close(); } catch {}
    }
    if (this.full && win && !win.isDestroyed()) win.setFullScreen(false);
    this.view = null; this.shown = false; this.full = false;
    this.onState({ open: false, full: false });
  }
}

module.exports = { StreamView };
