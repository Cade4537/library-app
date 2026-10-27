// Drive space, game sizes on disk, and uninstalling.
const path = require('path');
const { spawn } = require('child_process');
const { shell } = require('electron');
const { fsp, runPowerShellJson, asArray } = require('./util');
const { launchItem } = require('./launch');

let drivesCache = null;

async function getDrives() {
  if (drivesCache && Date.now() - drivesCache.t < 30000) return drivesCache.v;
  const r = await runPowerShellJson(
    "ConvertTo-Json -InputObject @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,VolumeName,Size,FreeSpace) -Compress",
    20000
  );
  const v = asArray(r)
    .filter((d) => d && d.DeviceID && d.Size)
    .map((d) => ({ id: d.DeviceID, label: d.VolumeName || '', size: Number(d.Size) || 0, free: Number(d.FreeSpace) || 0 }));
  drivesCache = { t: Date.now(), v };
  return v;
}

// Adds up every file in a folder. Yields regularly so the app stays responsive.
async function folderSize(dir) {
  let total = 0;
  let n = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try { total += (await fsp.stat(p)).size; } catch {}
      }
      if (++n % 400 === 0) await new Promise((r) => setImmediate(r));
    }
  }
  return total;
}

class SizeTracker {
  constructor(store, onChange) {
    this.store = store;
    this.onChange = onChange;
    this.running = false;
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const week = 7 * 24 * 3600 * 1000;
      const todo = Object.values(this.store.data.items).filter((it) =>
        it.kind === 'game' && it.installed && it.installDir && !(it.meta && it.meta.sizeFromLauncher) &&
        !(it.meta && it.meta.sizeAt && Date.now() - it.meta.sizeAt < week));
      for (const it of todo) {
        const size = await folderSize(it.installDir);
        it.meta = { ...(it.meta || {}), sizeBytes: size, sizeAt: Date.now() };
        this.onChange();
      }
    } finally {
      this.running = false;
    }
  }
}

// Windows' list of installed programs, to find a game's own uninstaller.
async function uninstallEntries() {
  const script = `
$keys = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
ConvertTo-Json -InputObject @(Get-ItemProperty $keys | Where-Object { $_.UninstallString } | Select-Object DisplayName,InstallLocation,UninstallString) -Compress`;
  return asArray(await runPowerShellJson(script, 30000)).filter(Boolean);
}

const norm = (p) => path.normalize(String(p || '')).toLowerCase().replace(/[\\/"]+$/, '');

function runCommandLine(cmd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

// Starts the right uninstaller for a game. Returns a message for the user.
async function uninstall(it) {
  const m = it.meta || {};
  if (it.source === 'steam' && it.steamAppId) {
    await shell.openExternal(`steam://uninstall/${it.steamAppId}`);
    return 'Steam will ask you to confirm the uninstall.';
  }
  if (it.source === 'riot' && it.launch && it.launch.type === 'exe') {
    const product = (it.launch.args || []).find((a) => a.startsWith('--launch-product='));
    const patch = (it.launch.args || []).find((a) => a.startsWith('--launch-patchline='));
    if (product) {
      await launchItem({ launch: { type: 'exe', target: it.launch.target, args: [product.replace('launch', 'uninstall'), (patch || '--launch-patchline=live').replace('launch', 'uninstall')] } });
      return 'The Riot Client will remove the game.';
    }
  }
  if (it.source === 'xbox' || it.source === 'msstore') {
    await shell.openExternal('ms-settings:appsfeatures');
    return `Windows Installed apps is open. Search for ${it.name} and choose Uninstall.`;
  }
  // Everything else: find the game's entry in Windows' installed programs list.
  if (it.installDir) {
    const dir = norm(it.installDir);
    const entries = await uninstallEntries();
    const hit = entries.find((e) => e.InstallLocation && norm(e.InstallLocation) === dir) ||
      entries.find((e) => e.InstallLocation && dir.startsWith(norm(e.InstallLocation) + path.sep) && norm(e.InstallLocation).length > 12) ||
      entries.find((e) => norm(e.UninstallString).includes(dir));
    if (hit) {
      await runCommandLine(hit.UninstallString);
      return `Started the uninstaller for ${hit.DisplayName || it.name}.`;
    }
  }
  if (it.source === 'epic') {
    await shell.openExternal('com.epicgames.launcher://store/library');
    return `Epic only uninstalls from its launcher. In your Epic library, click the three dots on ${it.name} and choose Uninstall.`;
  }
  await shell.openExternal('ms-settings:appsfeatures');
  return `Windows Installed apps is open. Search for ${it.name} and choose Uninstall.`;
}

module.exports = { getDrives, SizeTracker, uninstall };
