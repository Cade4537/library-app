const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { Store } = require('./src/main/store');
const { scanAll } = require('./src/main/scanners');
const { CoverService } = require('./src/main/covers');
const { launchItem } = require('./src/main/launch');
const { Updater } = require('./src/main/updater');
const { MediaBridge, APPLE_MUSIC_AUMID, APPLE_MUSIC_STORE } = require('./src/main/media');

// Keep data in the same folder even if the app's display name changes later.
app.setPath('userData', path.join(app.getPath('appData'), 'library-app'));

let win = null;
let store = null;
let covers = null;
let scanning = false;
let updater = null;
let media = null;

function sendTo(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const fileUrl = (p) => (p ? pathToFileURL(p).href : null);

function snapshot() {
  const items = Object.values(store.data.items).map((it) => ({
    ...it,
    coverUrl: fileUrl(it.cover),
    iconUrl: fileUrl(it.icon),
  }));
  return {
    items,
    categories: store.data.categories,
    settings: store.data.settings,
    scanning,
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
    };
    const { entries, sources, counts, errors } = await scanAll(ctx);
    store.mergeScan(entries, sources);
    store.changed();
    covers.queueAll();
    if (errors.length) console.warn('Scan errors', errors);
    if (!silent) {
      const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${SOURCE_LABELS[k] || k} ${n}`);
      toast(parts.length ? `Scan finished: ${parts.join(', ')}` : 'Scan finished, nothing new found');
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
    title: 'Library',
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

  ipcMain.handle('settings:update', (_e, patch) => {
    const before = store.data.settings;
    store.data.settings = { ...before, ...patch };
    const keyChanged = 'steamGridDbKey' in patch && patch.steamGridDbKey !== before.steamGridDbKey;
    store.changed();
    if (keyChanged) {
      covers.keyError = false;
      covers.refetchMissing();
    }
    media.configure({ enabled: store.data.settings.musicEnabled !== false, anyApp: !!store.data.settings.musicAnyApp });
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
  ipcMain.handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('app:toggleFullscreen', () => win.setFullScreen(!win.isFullScreen()));
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
    registerIpc();
    createWindow();
    updater.start();
    media.configure({ enabled: store.data.settings.musicEnabled !== false, anyApp: !!store.data.settings.musicAnyApp });
    covers.queueAll();
    rescan(true);
  });

  app.on('before-quit', () => {
    if (store) store.saveNow();
    if (media) { media.enabled = false; media.stop(); }
  });
  app.on('window-all-closed', () => app.quit());
}
