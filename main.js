const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const { DiscordView } = require('./src/main/discordView');
const { DiscordRpc } = require('./src/main/discordRpc');
const { StreamView } = require('./src/main/streamView');
const { UbisoftActivity } = require('./src/main/ubisoftActivity');
const path = require('path');
const { pathToFileURL } = require('url');
const { Store } = require('./src/main/store');
const { scanAll } = require('./src/main/scanners');
const { CoverService } = require('./src/main/covers');
const { launchItem } = require('./src/main/launch');
const { Updater } = require('./src/main/updater');
const { MediaBridge, APPLE_MUSIC_AUMID, APPLE_MUSIC_STORE } = require('./src/main/media');
const { SteamInfo, readSteamCollections, BASIC_CATEGORIES } = require('./src/main/steaminfo');
const { PlaytimeTracker, minutesPlayed } = require('./src/main/playtime');
const { getAchievements } = require('./src/main/achievements');
const { Friends } = require('./src/main/friends');
const { detectSteamId } = require('./src/main/owned/steam');
const auth = require('./src/main/auth');
const { XboxLive } = require('./src/main/xboxlive');
const { EpicClient } = require('./src/main/epicClient');
const { getLaunchers, openLauncher } = require('./src/main/launchers');
const { getDrives, SizeTracker, uninstall } = require('./src/main/storage');
const { runPowerShell } = require('./src/main/util');

const { openRemotePlayWindow, openXboxAppAndConnect } = require('./src/main/remoteplay');
const XBOX_APP_AUMID = 'Microsoft.GamingApp_8wekyb3d8bbwe!Microsoft.Xbox.App';

// Keep data in the same folder even if the app's display name changes later.
app.setPath('userData', path.join(app.getPath('appData'), 'library-app'));

let win = null;
let store = null;
let covers = null;
let scanning = false;
let updater = null;
let lastOwnedStatus = null;
let media = null;
let steamInfo = null;
let playtime = null;
let friends = null;
let xbox = null;
let epic = null;
let sizes = null;
let collections = [];
let lastRegistry = {};
let steamIdCache = null;
let discordView = null;
let streamView = null;
let ubisoft = null;
const rpc = new DiscordRpc();
const runningSince = new Map();
const pendingSource = new Map();
const APP_ICON_URL = 'https://raw.githubusercontent.com/Cade4537/library-app/main/assets/icon.png';

// Shows the game you are playing on Discord (when Rich Presence is set up in Settings).
function updatePresence() {
  const s = store.data.settings;
  rpc.configure(s.discordClientId, s.discordPresence !== false);
  const now = playtime ? playtime.running : new Set();
  for (const id of [...runningSince.keys()]) if (!now.has(id)) runningSince.delete(id);
  for (const id of now) if (!runningSince.has(id)) runningSince.set(id, Date.now());
  const it = [...now].map((id) => store.data.items[id]).find((x) => x && x.kind === 'game');
  if (!it) { rpc.set(s.discordBrowsing ? { details: 'Browsing the library', image: APP_ICON_URL, imageText: 'Crimson Vault' } : null); return; }
  const appid = it.steamAppId || (steamInfo && steamInfo.appIdFor(it));
  const image = appid ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
    : /^https:\/\//.test(it.coverHint || '') ? it.coverHint : APP_ICON_URL;
  const LABELS = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', ubisoft: 'Ubisoft Connect', xbox: 'Xbox', rockstar: 'Rockstar', riot: 'Riot', curseforge: 'CurseForge' };
  rpc.set({ details: it.customName || it.name, state: LABELS[it.source] ? `via ${LABELS[it.source]}` : undefined, start: runningSince.get(it.id), image, imageText: it.customName || it.name });
}

// Your SteamID: typed in Settings, found during the last scan, or read from the Steam app.
async function getSteamId() {
  const typed = String(store.data.settings.steamId || '').trim().match(/\d{17}/);
  if (typed) return typed[0];
  if (steamIdCache) return steamIdCache;
  steamIdCache = await detectSteamId(lastRegistry).catch(() => null);
  return steamIdCache;
}

// Settings sent to the window, without sign-in tokens.
function publicSettings() {
  const s = { ...store.data.settings };
  s.epicConnected = !!(s.epicAuth && s.epicAuth.refreshToken);
  s.epicName = (s.epicAuth && s.epicAuth.displayName) || '';
  delete s.epicAuth;
  s.xboxConnected = !!(s.xboxLive && s.xboxLive.refreshToken);
  s.xboxGamertag = (s.xboxLive && s.xboxLive.gamertag) || '';
  delete s.xboxLive;
  return s;
}

// Description, release date and screenshots from the Steam store, for the details page.
const storeInfoMem = new Map();
// A trailer that plays in a normal video tag (mp4 or webm), preferring the highlighted one.
function pickMovie(movies) {
  const list = Array.isArray(movies) ? movies : [];
  for (const m of [...list.filter((x) => x.highlight), ...list]) {
    const url = (m.mp4 && (m.mp4['480'] || m.mp4.max)) || (m.webm && (m.webm['480'] || m.webm.max));
    if (url) return String(url).replace(/^http:/, 'https:');
  }
  return null;
}
async function storeInfo(it) {
  if (!it || it.kind !== 'game') return null;
  const appid = it.steamAppId || (steamInfo && steamInfo.appIdFor(it));
  if (!appid) return null;
  if (!store.data.storeExtra) store.data.storeExtra = {};
  const cached = store.data.storeExtra[appid];
  if (cached && cached.v === 2 && Date.now() - cached.t < 30 * 86400000) return cached;
  if (storeInfoMem.has(appid)) return storeInfoMem.get(appid);
  const p = (async () => {
    try {
      const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=US`, { signal: AbortSignal.timeout(15000) });
      const d = ((await res.json())[appid] || {}).data;
      if (!d) return null;
      const out = {
        t: Date.now(),
        appid: String(appid),
        desc: String(d.short_description || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(),
        date: d.release_date && !d.release_date.coming_soon ? d.release_date.date : d.release_date && d.release_date.date ? `Coming ${d.release_date.date}` : '',
        devs: (d.developers || []).slice(0, 2),
        genres: (d.genres || []).map((g) => g.description).slice(0, 4),
        hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`,
        bg: d.background_raw || d.background || d.header_image || '',
        shots: (d.screenshots || []).slice(0, 8).map((s) => ({ thumb: s.path_thumbnail, full: s.path_full })),
        metacritic: d.metacritic && d.metacritic.score ? d.metacritic.score : null,
        v: 2,
        movie: pickMovie(d.movies),
      };
      store.data.storeExtra[appid] = out;
      store.changed();
      return out;
    } catch {
      return null;
    } finally {
      setTimeout(() => storeInfoMem.delete(appid), 60000);
    }
  })();
  storeInfoMem.set(appid, p);
  return p;
}

// Brings a running game's window to the front (for the "Back to game" bar).
async function focusGame(it) {
  if (!it || !it.installDir) return { ok: false };
  const dir = String(it.installDir).replace(/'/g, "''");
  const out = await runPowerShell(`
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class CvWin { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); }
'@
$dir = '${dir}'
$p = Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase) -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($p) { if ([CvWin]::IsIconic($p.MainWindowHandle)) { [CvWin]::ShowWindow($p.MainWindowHandle, 9) | Out-Null }; [CvWin]::SetForegroundWindow($p.MainWindowHandle) | Out-Null; 'ok' } else { 'none' }
`, 20000);
  return { ok: String(out || '').trim().endsWith('ok') };
}

function applyAutoCategories() {
  if (store.applyAutoCategories((it) => steamInfo.autoCategory(it, collections))) store.changed();
}

function sendTo(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const fileUrl = (p) => (p ? pathToFileURL(p).href : null);

function snapshot() {
  const running = playtime ? playtime.running : new Set();
  const items = Object.values(store.data.items).map((it) => ({
    ...it,
    coverUrl: fileUrl(it.cover),
    iconUrl: fileUrl(it.icon),
    minutes: minutesPlayed(it),
    running: running.has(it.id),
  }));
  return {
    items,
    categories: store.data.categories,
    settings: publicSettings(),
    scanning,
    ownedStatus: lastOwnedStatus,
    coverKeyError: covers ? covers.keyError : false,
  };
}

let pushTimer = null;
function pushUpdate() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (win && !win.isDestroyed()) win.webContents.send('library:changed', snapshot());
  }, 150);
}

function toast(text, kind = 'info') {
  if (win && !win.isDestroyed()) win.webContents.send('toast', { text, kind });
}

const SOURCE_LABELS = {
  steam: 'Steam', epic: 'Epic', gog: 'GOG', ubisoft: 'Ubisoft', xbox: 'Xbox', rockstar: 'Rockstar',
  riot: 'Riot', curseforge: 'CurseForge', app: 'Apps', msstore: 'Store apps',
};

async function rescan(silent = false) {
  if (scanning) return null;
  scanning = true;
  pushUpdate();
  try {
    const ctx = {
      settings: store.data.settings,
      desktopDirs: [app.getPath('desktop'), path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop')],
      readShortcut: (p) => shell.readShortcutLink(p),
      saveSetting: (k, v) => { store.data.settings[k] = v; store.changed(); },
      xbox,
      epic,
    };
    const { entries, sources, counts, errors, owned, ownedSources, ownedCounts, ownedErrors, detectedSteamId } = await scanAll(ctx);
    store.mergeScan(entries, sources, owned, ownedSources);
    lastRegistry = ctx.registry || {};
    if (detectedSteamId) steamIdCache = detectedSteamId;
    // Steam collections are no longer turned into categories. Remove ones made by earlier versions.
    const cols = await readSteamCollections(lastRegistry, await getSteamId()).catch(() => []);
    for (const c of cols) {
      const p = `Games/${c.name}`;
      if (!store.data.ensuredPaths.includes(p)) continue;
      const id = store.resolveCategoryPath(p);
      const cat = id && store.cat(id);
      if (cat && cat.name.toLowerCase() === c.name.toLowerCase()) store.deleteCategory(id);
      store.data.ensuredPaths = store.data.ensuredPaths.filter((x) => x !== p);
    }
    collections = store.data.settings.steamCollections === true ? cols : [];
    applyAutoCategories();
    steamInfo.refresh();
    sizes.run();
    if (ubisoft && ubisoft.connected) ubisoft.refresh(false).then((r) => { if (r && !r.skipped) store.changed(); }).catch(() => {});
    lastOwnedStatus = { counts: ownedCounts, errors: ownedErrors, steamId: detectedSteamId || null, at: Date.now() };
    store.changed();
    covers.queueAll();
    if (errors.length) console.warn('Scan errors', errors);
    if (!silent) {
      const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${SOURCE_LABELS[k] || k} ${n}`);
      const ownedParts = Object.entries(ownedCounts).map(([k, n]) => (k === 'family' ? `${n} from Steam Family` : `${n} owned on ${SOURCE_LABELS[k] || k}`));
      toast(parts.length ? `Scan finished: ${parts.join(', ')}${ownedParts.length ? `. ${ownedParts.join(', ')}` : ''}` : 'Scan finished, nothing new found');
    }
    if (ownedErrors.length) {
      toast(ownedErrors.join(' '), 'error');
    }
    return counts;
  } catch (e) {
    toast(`Scan failed: ${e.message}`, 'error');
    return null;
  } finally {
    scanning = false;
    pushUpdate();
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0b',
    title: 'Crimson Vault',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0a0b', symbolColor: '#d6d6da', height: 44 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
}

function registerIpc() {
  const item = (id) => store.data.items[id];

  ipcMain.handle('library:get', () => snapshot());
  ipcMain.handle('library:rescan', () => rescan(false));

  ipcMain.handle('item:launch', async (_e, id) => {
    const it = item(id);
    if (!it) return { ok: false, error: 'Not found' };
    try {
      await launchItem(it);
      it.lastPlayed = Date.now();
      it.playCount = (it.playCount || 0) + 1;
      store.changed();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('item:update', (_e, id, patch) => {
    const it = store.updateItem(id, patch || {});
    if (it && 'customName' in (patch || {}) && !it.coverLocked) {
      // A new name may find better art.
      it.coverTried = 0;
      if (!it.coverHint && !it.steamAppId) {
        covers.removeFile(it.cover);
        it.cover = null;
      }
      covers.enqueue(id);
    }
    store.changed();
    return !!it;
  });

  ipcMain.handle('item:remove', (_e, id) => {
    store.removeItem(id);
    store.changed();
  });

  ipcMain.handle('item:addManual', (_e, data) => {
    if (!data || !data.target) return null;
    const it = store.addManual(data);
    store.changed();
    covers.enqueue(it.id);
    return it.id;
  });

  ipcMain.handle('item:openFolder', (_e, id) => {
    const it = item(id);
    if (it && it.installDir) shell.openPath(it.installDir);
  });

  ipcMain.handle('dialog:pickFile', async (_e, kind) => {
    const filters =
      kind === 'image'
        ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
        : [{ name: 'Programs and shortcuts', extensions: ['exe', 'lnk', 'url', 'bat', 'cmd'] }, { name: 'All files', extensions: ['*'] }];
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('dialog:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('category:create', (_e, name, parentId) => {
    const c = store.addCategory(name, parentId || null);
    store.changed();
    return c.id;
  });
  ipcMain.handle('category:rename', (_e, id, name) => { store.renameCategory(id, name); store.changed(); });
  ipcMain.handle('category:delete', (_e, id) => { store.deleteCategory(id); store.changed(); });
  ipcMain.handle('category:move', (_e, id, parentId, beforeId) => {
    const ok = store.moveCategory(id, parentId || null, beforeId || null);
    store.changed();
    return ok;
  });

  ipcMain.handle('discord:bounds', (_e, b) => { if (discordView) discordView.set(b); });
  ipcMain.handle('discord:unload', () => discordView && discordView.unload());
  ipcMain.handle('stream:bounds', (_e, b) => { if (streamView) streamView.set(b); });
  ipcMain.handle('stream:full', (_e, v) => streamView && streamView.setFull(v));
  ipcMain.handle('stream:stop', () => streamView && streamView.stop());
  ipcMain.handle('stream:state', () => ({ open: !!(streamView && streamView.open), full: !!(streamView && streamView.full) }));
  ipcMain.handle('discord:reload', () => discordView && discordView.reload());
  ipcMain.handle('discord:signOut', () => discordView && discordView.signOut());
  ipcMain.handle('discord:openApp', () => shell.openExternal('discord://'));
  ipcMain.handle('discord:source', (_e, id, sourceId) => { const r = pendingSource.get(id); if (r) { pendingSource.delete(id); r(sourceId || null); } });
  ipcMain.handle('discord:testPresence', () => {
    rpc.configure(store.data.settings.discordClientId, true);
    rpc.set({ details: 'Testing Crimson Vault', state: 'Rich Presence works', image: APP_ICON_URL, imageText: 'Crimson Vault', start: Date.now() });
    setTimeout(updatePresence, 15000);
    return { ok: !!rpc.clientId, connected: rpc.ready };
  });
  ipcMain.handle('item:storeInfo', (_e, id) => storeInfo(store.data.items[id]));
  ipcMain.handle('stats:sessions', () => (store.data.sessions || []).slice(-1000));
  ipcMain.handle('item:focus', (_e, id) => focusGame(store.data.items[id]));

  ipcMain.handle('settings:update', (_e, patch) => {
    const before = store.data.settings;
    store.data.settings = { ...before, ...patch };
    if (['discordClientId', 'discordPresence', 'discordBrowsing'].some((k) => k in patch)) updatePresence();
    const keyChanged = 'steamGridDbKey' in patch && patch.steamGridDbKey !== before.steamGridDbKey;
    store.changed();
    if (keyChanged) {
      covers.keyError = false;
      covers.refetchMissing();
    }
    media.configure({ enabled: store.data.settings.musicEnabled !== false, anyApp: !!store.data.settings.musicAnyApp });
    if (['steamApiKey', 'steamId', 'openXblKey'].some((k) => k in patch && patch[k] !== before[k])) {
      steamIdCache = null;
      if ('openXblKey' in patch) delete store.data.settings.xboxXuid;
      setTimeout(() => friends.refresh(), 500);
    }
    if (['genreSort', 'steamCollections'].some((k) => k in patch && patch[k] !== before[k])) {
      for (const it of Object.values(store.data.items)) if (it.catAuto !== false && it.kind === 'game') it.categoryId = store.resolveCategoryPath(it.defaultCategory || 'Games');
      applyAutoCategories();
      store.changed();
    }
    const ownedKeys = ['steamApiKey', 'steamId', 'gogOwned', 'openXblKey', 'ubisoftOwned'];
    if (ownedKeys.some((k) => k in patch && patch[k] !== before[k])) {
      rescan(false);
      return;
    }
    if (('includeApps' in patch && patch.includeApps !== before.includeApps) || ('curseforgeInstancesPath' in patch && patch.curseforgeInstancesPath !== before.curseforgeInstancesPath)) {
      rescan(true);
    }
  });

  ipcMain.handle('covers:options', (_e, id, term) => covers.options(id, term));
  ipcMain.handle('covers:apply', (_e, id, url) => covers.apply(id, url));
  ipcMain.handle('covers:file', async (_e, id) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
    if (r.canceled) return false;
    return covers.applyFile(id, r.filePaths[0]);
  });
  ipcMain.handle('covers:reset', (_e, id) => covers.reset(id));
  ipcMain.handle('covers:refetchMissing', () => { covers.keyError = false; covers.refetchMissing(); });

  ipcMain.handle('update:get', () => updater.state);
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:install', () => updater.install());

  ipcMain.handle('media:get', () => media.state);
  ipcMain.handle('media:command', (_e, cmd) => media.command(cmd));
  ipcMain.handle('media:openApp', async () => {
    const found = Object.values(store.data.items).find((i) => i.launch && i.launch.type === 'aumid' && /^AppleInc\.AppleMusic/i.test(i.launch.target));
    try {
      await launchItem(found || { launch: { type: 'aumid', target: APPLE_MUSIC_AUMID } });
      return true;
    } catch {
      shell.openExternal(APPLE_MUSIC_STORE);
      return false;
    }
  });

  ipcMain.handle('app:version', () => app.getVersion());

  // ---------- connections ----------
  ipcMain.handle('auth:epicSignIn', async () => {
    try {
      const a = await auth.epicSignIn(win);
      if (!a) return { ok: false };
      store.data.settings.epicAuth = a;
      epic.reset();
      store.changed();
      setTimeout(() => friends.refresh(), 1500);
      rescan(false);
      return { ok: true, name: a.displayName };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('auth:ubisoftSignIn', async () => {
    const ok = await ubisoft.signIn(win).catch(() => false);
    if (!ok) return { ok: false };
    store.data.settings.ubisoftActivity = true;
    const r = await ubisoft.refresh(true);
    store.changed();
    return { ok: true, count: r && r.count, error: r && r.error };
  });
  ipcMain.handle('auth:ubisoftSignOut', async () => {
    await ubisoft.signOut().catch(() => {});
    store.changed();
  });
  ipcMain.handle('auth:ubisoftRefresh', async () => { const r = await ubisoft.refresh(true); store.changed(); return r; });
  ipcMain.handle('auth:epicSignOut', async () => {
    delete store.data.settings.epicAuth;
    epic.reset();
    setTimeout(() => friends.refresh(), 200);
    await auth.epicSignOut().catch(() => {});
    store.changed();
  });
  ipcMain.handle('auth:steamSignIn', async () => {
    try {
      const ok = await auth.steamSignIn(win);
      if (!ok) return { ok: false };
      store.data.settings.steamFamily = true;
      store.changed();
      rescan(false);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('auth:steamSignOut', async () => {
    store.data.settings.steamFamily = false;
    await auth.steamSignOut().catch(() => {});
    store.changed();
  });
  ipcMain.handle('auth:xboxSignIn', async () => {
    const r = await xbox.signIn(win);
    if (r.ok) { rescan(false); setTimeout(() => friends.refresh(), 1000); }
    return r;
  });
  ipcMain.handle('auth:xboxSignOut', async () => {
    await xbox.signOut();
    friends.refresh();
  });
  ipcMain.handle('auth:testXbox', async (_e, key) => {
    try {
      const acc = await require('./src/main/xbl').xblAccount(String(key || '').trim());
      return { ok: true, gamertag: acc.gamertag };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ---------- details, friends, remote play ----------
  ipcMain.handle('item:achievements', async (_e, id) => {
    const it = item(id);
    if (!it) return { error: 'Not found' };
    return getAchievements(store, it, await getSteamId(), xbox, epic);
  });
  ipcMain.handle('friends:get', () => friends.state);
  ipcMain.handle('storage:drives', () => getDrives().catch(() => []));
  ipcMain.handle('item:uninstall', async (_e, id) => {
    const it = item(id);
    if (!it) return { ok: false, error: 'Not found' };
    try {
      const msg = await uninstall(it);
      setTimeout(() => rescan(true), 90 * 1000);
      return { ok: true, message: msg };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('launchers:get', () => getLaunchers(store, lastRegistry, (p) => app.getFileIcon(p, { size: 'large' })));
  ipcMain.handle('launchers:open', async (_e, id) => openLauncher(store, lastRegistry, id));
  ipcMain.handle('friends:refresh', () => friends.refresh());
  ipcMain.handle('friends:link', (_e, a, b) => friends.link(a, b));
  ipcMain.handle('friends:unlink', (_e, keys) => friends.unlink(keys));
  ipcMain.handle('friends:remove', async (_e, key) => {
    const r = await friends.remove(String(key || ''));
    if (r.openProfile) { shell.openExternal(r.openProfile); return { ok: true, message: 'Steam opened their profile. Use the ... menu there and pick Remove Friend.' }; }
    return r;
  });
  ipcMain.handle('xbox:remotePlay', async (_e, where) => {
    if (where === 'web') return shell.openExternal('https://www.xbox.com/play/consoles');
    let consoleName = '';
    if (where === 'window' || where === 'appAuto' || where === 'inapp') {
      try {
        const list = await xbox.consoles();
        const pick = list.find((c) => /^on$/i.test(c.power || '')) || list[0];
        consoleName = (pick && pick.name) || '';
      } catch {}
    }
    if (where === 'inapp') { streamView.start(consoleName); return { ok: true }; }
    if (where === 'window') { if (streamView.open) streamView.stop(); return openRemotePlayWindow(win, consoleName); }
    if (where === 'appAuto') return openXboxAppAndConnect(consoleName);
    try {
      await launchItem({ launch: { type: 'aumid', target: XBOX_APP_AUMID } });
    } catch {
      shell.openExternal('https://www.xbox.com/play/consoles');
    }
  });
  ipcMain.handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('app:toggleFullscreen', () => win.setFullScreen(!win.isFullScreen()));
  ipcMain.handle('app:setFullscreen', (_e, v) => win.setFullScreen(!!v));
  ipcMain.handle('app:copyText', (_e, text) => clipboard.writeText(String(text || '')));
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    store = new Store(path.join(app.getPath('userData'), 'library.json'));
    store.load();
    store.onChange = pushUpdate;
    covers = new CoverService({ store, cacheDir: app.getPath('userData'), getFileIcon: (p, o) => app.getFileIcon(p, o) });
    await covers.init();
    updater = new Updater((s) => sendTo('update:state', s));
    media = new MediaBridge((s) => sendTo('media:state', s));
    for (const c of BASIC_CATEGORIES) store.ensureCategoryPath(`Games/${c}`);
    steamInfo = new SteamInfo(store, () => { applyAutoCategories(); store.changed(); });
    playtime = new PlaytimeTracker(store, () => { store.changed(); updatePresence(); });
    sizes = new SizeTracker(store, () => store.changed());
    xbox = new XboxLive(store);
    epic = new EpicClient(store);
    ubisoft = new UbisoftActivity(store);
    friends = new Friends(store, (s) => sendTo('friends:state', s), getSteamId, xbox, epic);
    registerIpc();
    createWindow();
    playtime.start();
    streamView = new StreamView(() => win, (st) => sendTo('stream:state', st));
    win.on('resize', () => { if (streamView.full) streamView.layout(); });
    discordView = new DiscordView(() => win, (list) => new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      pendingSource.set(id, resolve);
      sendTo('discord:pickSource', { id, list });
      setTimeout(() => { if (pendingSource.has(id)) { pendingSource.delete(id); resolve(null); } }, 120000);
    }));
    updatePresence();
    setTimeout(() => friends.start(), 4000);
    updater.start();
    media.configure({ enabled: store.data.settings.musicEnabled !== false, anyApp: !!store.data.settings.musicAnyApp });
    covers.queueAll();
    rescan(true);
  });

  app.on('before-quit', () => {
    if (playtime) playtime.flushSessions();
    rpc.set(null); rpc.close();
    if (store) store.saveNow();
    if (media) { media.enabled = false; media.stop(); }
    if (playtime) playtime.stop();
  });
  app.on('window-all-closed', () => app.quit());
}
