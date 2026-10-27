// Sign-in windows for services that have no simple API key: Epic Games and the Steam store (for Steam Family).
// Each service gets its own saved browser session, so signing in once keeps working.
const { BrowserWindow, session } = require('electron');

// Epic: same public launcher login that open source launchers (Legendary, Heroic) use.
const EPIC_CLIENT = '34a02cf8f4414e29b15921876da36f9a';
const EPIC_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const EPIC_TOKEN_URL = 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token';
const EPIC_LOGIN_URL =
  'https://www.epicgames.com/id/login?redirectUrl=' +
  encodeURIComponent(`https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT}&responseType=code`);

function loginWindow(parent, { url, partition, title, check }) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent,
      modal: !!parent,
      title,
      autoHideMenuBar: true,
      backgroundColor: '#0a0a0b',
      webPreferences: { partition, contextIsolation: true, nodeIntegration: false },
    });
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
      if (!win.isDestroyed()) win.close();
    };
    win.on('closed', () => finish(null));
    win.webContents.on('did-finish-load', async () => {
      try {
        const r = await check(win);
        if (r) finish(r);
      } catch {}
    });
    win.loadURL(url);
  });
}

// ---------- Epic ----------
async function epicToken(body) {
  const res = await fetch(EPIC_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${EPIC_CLIENT}:${EPIC_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ ...body, token_type: 'eg1' }).toString(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Epic sign in failed (${res.status})`);
  return res.json();
}

async function epicSignIn(parent) {
  const code = await loginWindow(parent, {
    url: EPIC_LOGIN_URL,
    partition: 'persist:epic',
    title: 'Sign in to Epic Games',
    check: async (win) => {
      if (!/\/id\/api\/redirect/.test(win.webContents.getURL())) return null;
      const text = await win.webContents.executeJavaScript('document.body.innerText');
      const j = JSON.parse(text);
      return j.authorizationCode || null;
    },
  });
  if (!code) return null;
  const t = await epicToken({ grant_type: 'authorization_code', code });
  return { refreshToken: t.refresh_token, accountId: t.account_id, displayName: t.displayName || '' };
}

// Returns a fresh access token and the (possibly rotated) refresh token.
async function epicAccess(auth) {
  const t = await epicToken({ grant_type: 'refresh_token', refresh_token: auth.refreshToken });
  return { accessToken: t.access_token, auth: { ...auth, refreshToken: t.refresh_token, displayName: t.displayName || auth.displayName } };
}

// ---------- Steam store (Steam Family) ----------
const STEAM_PARTITION = 'persist:steamstore';
const STEAM_TOKEN_URL = 'https://store.steampowered.com/pointssummary/ajaxgetasyncconfig';

async function steamStoreToken() {
  const ses = session.fromPartition(STEAM_PARTITION);
  const res = await ses.fetch(STEAM_TOKEN_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  return (j && j.data && j.data.webapi_token) || null;
}

async function steamSignIn(parent) {
  const token = await steamStoreToken().catch(() => null);
  if (token) return true;
  const ok = await loginWindow(parent, {
    url: 'https://store.steampowered.com/login/?redir=pointssummary',
    partition: STEAM_PARTITION,
    title: 'Sign in to Steam',
    check: async (win) => {
      if (/\/login/.test(win.webContents.getURL())) return null;
      return (await steamStoreToken()) ? true : null;
    },
  });
  return !!ok;
}

async function steamSignOut() {
  await session.fromPartition(STEAM_PARTITION).clearStorageData();
}

async function epicSignOut() {
  await session.fromPartition('persist:epic').clearStorageData();
}

module.exports = { epicSignIn, epicAccess, epicSignOut, steamSignIn, steamSignOut, steamStoreToken };
