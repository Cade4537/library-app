// Direct Xbox Live sign in with a Microsoft account (no third party service).
// Uses the Microsoft account desktop sign in flow with the Minecraft Launcher's public sign in ID
// (the same one many open source game launchers use), then exchanges it for Xbox Live tokens.
// Falls back to an OpenXBL key if one is set instead.
const { BrowserWindow, session } = require('electron');
const { xbl } = require('./xbl');

const CLIENT_ID = '00000000402b5328';
const REDIRECT = 'https://login.live.com/oauth20_desktop.srf';
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';
const PARTITION = 'persist:xbox';

async function liveToken(params) {
  const res = await fetch('https://login.live.com/oauth20_token.srf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE, redirect_uri: REDIRECT, ...params }).toString(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Microsoft sign in failed (${res.status})`);
  const j = await res.json();
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + Number(j.expires_in || 3600) * 1000 };
}

// The sign in page finishes on the desktop redirect with ?code=... (or #access_token=... on older flows).
async function tokensFromRedirect(url) {
  const u = new URL(url);
  const code = u.searchParams.get('code');
  if (code) return liveToken({ grant_type: 'authorization_code', code });
  const p = new URLSearchParams(u.hash.slice(1));
  if (p.get('access_token')) return { accessToken: p.get('access_token'), refreshToken: p.get('refresh_token'), expiresAt: Date.now() + Number(p.get('expires_in') || 3600) * 1000 };
  if (u.searchParams.get('error')) throw new Error(u.searchParams.get('error_description') || 'Sign in was cancelled');
  return null;
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-xbl-contract-version': '1', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw Object.assign(new Error(`Xbox sign in failed (${res.status})`), { status: res.status });
  return res.json();
}

class XboxLive {
  constructor(store) {
    this.store = store;
    this.xsts = null; // { token, uhs, xuid, gamertag, notAfter }
  }

  get live() { return this.store.data.settings.xboxLive || null; }
  get signedIn() { return !!(this.live && this.live.refreshToken); }
  get configured() { return this.signedIn || !!String(this.store.data.settings.openXblKey || '').trim(); }

  signIn(parent) {
    return new Promise((resolve) => {
      const url = `https://login.live.com/oauth20_authorize.srf?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&prompt=select_account&scope=${encodeURIComponent(SCOPE)}`;
      const win = new BrowserWindow({ width: 500, height: 720, parent, modal: !!parent, title: 'Sign in with Microsoft', autoHideMenuBar: true, backgroundColor: '#ffffff', webPreferences: { partition: PARTITION } });
      let done = false;
      const finish = async (redirectUrl) => {
        if (done) return;
        done = true;
        if (!win.isDestroyed()) win.close();
        if (!redirectUrl) return resolve({ ok: false });
        try {
          const tokens = await tokensFromRedirect(redirectUrl);
          if (!tokens) throw new Error('Microsoft did not return a sign in code');
          this.store.data.settings.xboxLive = tokens;
          this.xsts = null;
          const a = await this.auth();
          this.store.data.settings.xboxLive = { ...this.store.data.settings.xboxLive, gamertag: a.gamertag, xuid: a.xuid };
          this.store.changed();
          resolve({ ok: true, gamertag: a.gamertag });
        } catch (e) {
          delete this.store.data.settings.xboxLive;
          resolve({ ok: false, error: e.message });
        }
      };
      const check = (u) => { if (u && u.startsWith(REDIRECT)) finish(u); };
      win.webContents.on('will-redirect', (_e, u) => check(u));
      win.webContents.on('did-navigate', (_e, u) => check(u));
      win.webContents.on('did-redirect-navigation', (_e, u) => check(u));
      win.on('closed', () => finish(null));
      win.loadURL(url);
    });
  }

  async signOut() {
    delete this.store.data.settings.xboxLive;
    this.xsts = null;
    this.store.changed();
    await session.fromPartition(PARTITION).clearStorageData().catch(() => {});
  }

  async refreshLive() {
    const l = this.live;
    let t;
    try { t = await liveToken({ grant_type: 'refresh_token', refresh_token: l.refreshToken }); } catch { throw new Error('Xbox sign in expired. Sign in again in Settings.'); }
    this.store.data.settings.xboxLive = { ...l, ...t, refreshToken: t.refreshToken || l.refreshToken };
    this.store.changed();
  }

  // Returns Xbox Live tokens, refreshing whatever has expired.
  async auth() {
    if (this.xsts && this.xsts.notAfter > Date.now() + 60000) return this.xsts;
    if (!this.signedIn) throw new Error('Not signed in to Xbox');
    if (!this.live.accessToken || this.live.expiresAt < Date.now() + 60000) await this.refreshLive();
    let user = null;
    let lastErr = null;
    // The ticket format differs between account types, so try the known variants.
    for (const prefix of ['', 't=', 'd=']) {
      try {
        user = await postJson('https://user.auth.xboxlive.com/user/authenticate', {
          RelyingParty: 'http://auth.xboxlive.com',
          TokenType: 'JWT',
          Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: prefix + this.live.accessToken },
        });
        break;
      } catch (e) { lastErr = e; }
    }
    if (!user) throw lastErr || new Error('Xbox sign in failed');
    let x;
    try {
      x = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
        RelyingParty: 'http://xboxlive.com',
        TokenType: 'JWT',
        Properties: { SandboxId: 'RETAIL', UserTokens: [user.Token] },
      });
    } catch (e) {
      if (e.status === 401) throw new Error('This Microsoft account has no Xbox profile yet. Sign in to xbox.com once to create one.');
      throw e;
    }
    const claim = (x.DisplayClaims && x.DisplayClaims.xui && x.DisplayClaims.xui[0]) || {};
    this.xsts = { token: x.Token, uhs: claim.uhs, xuid: claim.xid, gamertag: claim.gtg, notAfter: Date.parse(x.NotAfter) || Date.now() + 3600000 };
    return this.xsts;
  }

  async request(url, contract, opts = {}) {
    const a = await this.auth();
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { Authorization: `XBL3.0 x=${a.uhs};${a.token}`, 'x-xbl-contract-version': String(contract), 'Accept-Language': 'en-US', Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 401) { this.xsts = null; throw new Error('Xbox sign in expired. Sign in again in Settings.'); }
    if (!res.ok) throw new Error(`Xbox error ${res.status}`);
    return res.json();
  }

  // ---------- data, from Xbox Live when signed in, otherwise OpenXBL ----------
  key() { return String(this.store.data.settings.openXblKey || '').trim(); }

  async account() {
    if (this.signedIn) { const a = await this.auth(); return { xuid: a.xuid, gamertag: a.gamertag }; }
    const { xblAccount } = require('./xbl');
    return xblAccount(this.key());
  }

  async titleHistory() {
    if (this.signedIn) {
      const a = await this.auth();
      return this.request(`https://titlehub.xboxlive.com/users/xuid(${a.xuid})/titles/titlehistory/decoration/achievement,image,detail`, 2);
    }
    return xbl(this.key(), '/player/titleHistory');
  }

  async friends() {
    if (this.signedIn) return this.request('https://peoplehub.xboxlive.com/users/me/people/social/decoration/detail,preferredColor,presenceDetail', 5);
    return xbl(this.key(), '/friends');
  }

  // Minutes played per title, from Xbox Live stats (only when signed in directly).
  async minutesPlayed(titleIds) {
    if (!this.signedIn || !titleIds.length) return {};
    const a = await this.auth();
    const out = {};
    for (let i = 0; i < titleIds.length; i += 50) {
      const j = await this.request('https://userstats.xboxlive.com/batch', 2, {
        method: 'POST',
        body: { arrangebyfield: 'xuid', xuids: [a.xuid], stats: titleIds.slice(i, i + 50).map((t) => ({ name: 'MinutesPlayed', titleid: String(t) })) },
      });
      const stats = (((j.statlistscollection || [])[0] || {}).stats) || [];
      for (const s of stats) if (s.titleid && s.value) out[String(s.titleid)] = Number(s.value) || 0;
    }
    return out;
  }

  async achievements(titleId) {
    const acc = await this.account();
    if (this.signedIn) return this.request(`https://achievements.xboxlive.com/users/xuid(${acc.xuid})/achievements?titleId=${titleId}&maxItems=1000`, 2);
    return xbl(this.key(), `/achievements/player/${acc.xuid}/${titleId}`);
  }
}

module.exports = { XboxLive };
