// The Discord tab: Discord's own web app shown inside the Crimson Vault window.
// It stays loaded while you switch pages, so voice calls keep going. Sign in is saved.
const { WebContentsView, session, shell, desktopCapturer } = require('electron');

const PARTITION = 'persist:discord';
const URL_HOME = 'https://discord.com/app';
const DISCORD_HOSTS = /(^|\.)(discord\.com|discordapp\.com|discord\.gg|discordapp\.net|discord\.media|hcaptcha\.com)$/i;

class DiscordView {
  constructor(getWindow, askSource) {
    this.getWindow = getWindow;
    this.askSource = askSource; // (sources) => Promise<id | null>, the renderer shows the screen picker
    this.view = null;
    this.shown = false;
  }

  ensure() {
    if (this.view) return this.view;
    const ses = session.fromPartition(PARTITION);
    // Discord's site expects a normal Chrome browser.
    ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|crimson-vault|library-app|Crimson Vault)\/\S+/gi, ''));
    ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen', 'display-capture'].includes(perm)));
    ses.setPermissionCheckHandler((_wc, perm) => ['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen', 'display-capture'].includes(perm));
    // Screen share: Crimson Vault shows its own picker of screens and windows.
    ses.setDisplayMediaRequestHandler(async (_req, cb) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } });
        const list = sources.map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL(), screen: s.id.startsWith('screen') }));
        const id = await this.askSource(list);
        const pick = sources.find((s) => s.id === id);
        if (!pick) return cb({});
        cb({ video: pick, audio: pick.id.startsWith('screen') ? 'loopback' : undefined });
      } catch {
        cb({});
      }
    });
    const view = new WebContentsView({ webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } });
    view.setBackgroundColor('#313338');
    const wc = view.webContents;
    // Links to other sites open in the normal browser; Discord pages stay in the tab.
    wc.setWindowOpenHandler(({ url }) => {
      try {
        const u = new URL(url);
        if (u.protocol === 'https:' && DISCORD_HOSTS.test(u.hostname) && /\/(oauth2|login|captcha)/.test(u.pathname)) return { action: 'allow' };
        if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(url);
      } catch {}
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      try {
        const u = new URL(url);
        if (u.protocol === 'https:' && DISCORD_HOSTS.test(u.hostname)) return;
        e.preventDefault();
        if (u.protocol === 'http:' || u.protocol === 'https:') shell.openExternal(url);
      } catch { e.preventDefault(); }
    });
    wc.loadURL(URL_HOME);
    this.view = view;
    return view;
  }

  // bounds: { x, y, width, height } of the Discord area in the page, or null to hide it.
  set(bounds) {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    if (!bounds || bounds.width < 50 || bounds.height < 50) {
      if (this.view && this.shown) { this.view.setVisible(false); this.shown = false; }
      return;
    }
    const view = this.ensure();
    if (!win.contentView.children.includes(view)) win.contentView.addChildView(view);
    view.setBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) });
    if (!this.shown) { view.setVisible(true); this.shown = true; }
  }

  // Closes the Discord tab to free its memory. It loads again the next time you open the tab.
  unload() {
    const win = this.getWindow();
    if (!this.view) return;
    try { if (win && !win.isDestroyed()) win.contentView.removeChildView(this.view); } catch {}
    try { this.view.webContents.close(); } catch {}
    this.view = null; this.shown = false;
  }

  reload() { if (this.view) this.view.webContents.loadURL(URL_HOME); }

  openExternal() { shell.openExternal('discord://'); }

  async signOut() {
    if (this.view) { this.getWindow().contentView.removeChildView(this.view); this.view.webContents.close(); this.view = null; this.shown = false; }
    await session.fromPartition(PARTITION).clearStorageData();
  }
}

module.exports = { DiscordView };
