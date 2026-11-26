// 0.24.0: the capture card window. A USB HDMI capture card shows up in Windows as a camera, so this
// window opens it like one. It is the only part of Crimson Vault allowed to use video and sound
// inputs, has its own separate storage, loads nothing from the internet, and only runs while open.
const { BrowserWindow, session } = require('electron');
const path = require('path');

const PARTITION = 'persist:capture';
let win = null;

function openCaptureWindow(parent, hooks = {}) {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return { ok: true }; }
  const ses = session.fromPartition(PARTITION);
  const allowed = new Set(['media', 'fullscreen']);
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => allowed.has(perm));
  // Nothing in this window goes online.
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|devtools|blob|data):/i.test(d.url) }));
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 640, minHeight: 360, backgroundColor: '#000000', autoHideMenuBar: true, show: false,
    title: 'Capture card', icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.control && input.key.toLowerCase() === 'w') { e.preventDefault(); win.close(); }
    else if (input.key === 'Escape' && win.isFullScreen()) { e.preventDefault(); win.setFullScreen(false); }
  });
  win.once('ready-to-show', () => { win.show(); if (hooks.onOpen) hooks.onOpen(); });
  win.on('closed', () => { win = null; if (hooks.onClose) hooks.onClose(); if (parent && !parent.isDestroyed()) parent.focus(); });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'capture.html'));
  return { ok: true };
}

function captureOpen() { return !!(win && !win.isDestroyed()); }
function closeCapture() { if (win && !win.isDestroyed()) win.close(); }

module.exports = { openCaptureWindow, captureOpen, closeCapture };
