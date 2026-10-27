// Ubisoft hours played and last played, from your own Ubisoft account page
// (ubisoft.com > Account > Games activity). Crimson Vault opens that page in a hidden window
// with your saved Ubisoft sign in and reads the list, the same thing you would see there.
// It never calls Ubisoft with your sign in directly.
const { BrowserWindow, session } = require('electron');
const { normName, similarity } = require('./util');

const PARTITION = 'persist:ubisoft';
const PAGE = 'https://www.ubisoft.com/en-us/account/games-activity';
const SIX_HOURS = 6 * 3600 * 1000;

// Reads the page's text, pressing "See more" until every game shows. Runs inside the page.
const READ_PAGE = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40; i++) {
    if (/\\/login/.test(location.pathname)) return { signedOut: true };
    const t = (document.querySelector('main') || document.body).innerText || '';
    if (/Played time/i.test(t) || /0 played games/i.test(t)) break;
    await wait(500);
  }
  for (let i = 0; i < 30; i++) {
    const b = [...document.querySelectorAll('button, a')].find((x) => /^\\s*see more\\s*$/i.test(x.innerText || ''));
    if (!b) break;
    b.click();
    await wait(1200);
  }
  if (/\\/login/.test(location.pathname)) return { signedOut: true };
  return { text: (document.querySelector('main') || document.body).innerText || '' };
})()`;

// "21 hours ago", "2 months ago", "Yesterday" -> an approximate time.
function agoToTime(s, now = Date.now()) {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return 0;
  if (/just now|minute/.test(t) && !/\d/.test(t)) return now;
  if (/yesterday/.test(t)) return now - 86400000;
  const m = t.match(/(\d+|an?|one)\s+(second|minute|hour|day|week|month|year)s?\s+ago/);
  if (!m) { const d = Date.parse(s); return Number.isNaN(d) ? 0 : d; }
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  const unit = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 }[m[2]];
  return now - n * unit;
}

function parseActivity(text) {
  const out = [];
  const re = /(?:^|\n)([^\n]+)\n+\s*Played time\s*\n+\s*([\d,.]+)\s*hours?,\s*(\d+)\s*minutes?\s*\n+\s*Last played\s*\n+\s*([^\n]+)(?:\n+\s*Platform\s*\n+\s*([^\n]+))?/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const name = m[1].trim();
    if (!name || /^(games activity|played games|see more)$/i.test(name)) continue;
    out.push({ name, minutes: Number(m[2].replace(/[,.]/g, '')) * 60 + Number(m[3]), last: agoToTime(m[4]), platforms: (m[5] || '').trim() });
  }
  return out;
}

// Ubisoft names carry extras ("Tom Clancy's", trademark signs) that launchers often drop.
const cleanName = (s) => normName(String(s).replace(/tom clancy'?s\s*/i, '').replace(/[®™©]/g, ''));

class UbisoftActivity {
  constructor(store) {
    this.store = store;
    this.busy = null;
  }

  get connected() { return !!this.store.data.settings.ubisoftActivity; }

  // Opens Ubisoft's sign in page. Done when the games activity list shows.
  signIn(parent) {
    return new Promise((resolve) => {
      const win = new BrowserWindow({
        width: 520, height: 760, parent, modal: false, title: 'Sign in to Ubisoft', autoHideMenuBar: true, backgroundColor: '#000000',
        webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true },
      });
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        if (!win.isDestroyed()) win.close();
        resolve(ok);
      };
      const timer = setInterval(async () => {
        if (win.isDestroyed()) return finish(false);
        try {
          const url = win.webContents.getURL();
          if (!/games-activity/.test(url)) return;
          const has = await win.webContents.executeJavaScript(`/Played time|played games/i.test((document.querySelector('main') || document.body).innerText || '')`);
          if (has) finish(true);
        } catch {}
      }, 1500);
      win.on('closed', () => finish(false));
      win.loadURL(PAGE);
    });
  }

  async signOut() {
    this.store.data.settings.ubisoftActivity = false;
    await session.fromPartition(PARTITION).clearStorageData();
  }

  // Reads the page in a hidden window. At most every 6 hours unless forced.
  async refresh(force = false) {
    if (!this.connected) return { skipped: true };
    const s = this.store.data.settings;
    if (!force && s.ubisoftActivityAt && Date.now() - s.ubisoftActivityAt < SIX_HOURS) return { skipped: true };
    if (this.busy) return this.busy;
    this.busy = (async () => {
      const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
      try {
        await Promise.race([win.loadURL(PAGE), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 45000))]);
        const r = await Promise.race([win.webContents.executeJavaScript(READ_PAGE), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 60000))]);
        if (!r || r.signedOut) { s.ubisoftActivityError = 'Ubisoft signed you out. Sign in again in Settings.'; return { error: s.ubisoftActivityError }; }
        const games = parseActivity(r.text);
        s.ubisoftActivityAt = Date.now();
        s.ubisoftActivityError = '';
        this.apply(games);
        return { count: games.length };
      } catch (e) {
        return { error: `Ubisoft hours: ${e.message}` };
      } finally {
        if (!win.isDestroyed()) win.destroy();
        this.busy = null;
      }
    })();
    return this.busy;
  }

  // Adds Ubisoft's hours and last played to matching games (Ubisoft games, and Steam or Epic
  // copies of Ubisoft games). Hours shown are the highest of every source, so nothing goes down.
  apply(games) {
    const items = Object.values(this.store.data.items).filter((it) => it.kind === 'game');
    const byName = new Map(items.map((it) => [cleanName(it.name), it]));
    for (const g of games) {
      const key = cleanName(g.name);
      let it = byName.get(key);
      if (!it) {
        let best = 0;
        for (const x of items) { const sc = similarity(key, cleanName(x.name)); if (sc > best) { best = sc; it = sc >= 0.86 ? x : it; } }
      }
      if (!it) continue;
      it.meta = it.meta || {};
      if (g.minutes) it.meta.ubiMinutes = g.minutes;
      if (g.last) {
        it.meta.ubiLastPlayed = g.last;
        if (!it.lastPlayed || g.last > it.lastPlayed + 3600 * 1000) it.lastPlayed = g.last;
      }
    }
  }
}

module.exports = { UbisoftActivity, parseActivity, agoToTime };
