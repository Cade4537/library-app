// 0.16.4: background mode. Keeps Crimson Vault light when you are not using it, so it can run for days:
//  - when the window is minimized or in the tray, every part of the app (window, GPU, helpers) drops to
//    below normal priority and the page stops its own timers and animations
//  - after a few minutes in the tray the window itself is closed (it opens again in a second when you
//    click the tray icon); the Discord tab is closed after an hour in the tray
//  - every 30 minutes it logs memory and Windows handle counts, and if they climb too high, or the app
//    has been running for a day, it restarts itself quietly in the tray when nothing is going on
const os = require('os');
const { app } = require('electron');
const { runPowerShell } = require('./util');

const MIN = Number(process.env.CV_POWER_MIN_MS) || 60 * 1000; // the env value is only for tests
const HANDLES_SCRIPT = (pids) => `
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class CvGui { [DllImport("user32.dll")] public static extern uint GetGuiResources(IntPtr h, uint f); }
'@
$h = 0; $gdi = 0; $usr = 0
foreach ($id in @(${pids.join(',')})) {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if (-not $p) { continue }
  $h += $p.HandleCount
  try { $gdi += [CvGui]::GetGuiResources($p.Handle, 0); $usr += [CvGui]::GetGuiResources($p.Handle, 1) } catch {}
}
"$h,$gdi,$usr"
`;

class Power {
  constructor(d) {
    // d: { store, getWin, destroyWin, isBusy, helperPids, onBackground, diag, discordLoaded, unloadDiscord }
    this.d = d;
    this.background = false;
    this.hiddenSince = 0;
    this.lastHealth = null;
    this.restartWanted = '';
  }

  s() { return this.d.store.data.settings; }

  start() {
    this.timer = setInterval(() => this.tick(), MIN);
    this.healthTimer = setInterval(() => this.health().catch(() => {}), 30 * MIN);
    setTimeout(() => this.health().catch(() => {}), 5 * MIN);
  }

  // Called when the window is shown, hidden, minimized, restored, focused or blurred.
  update() {
    const win = this.d.getWin();
    const visible = !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized());
    const bg = !visible;
    if (!visible && !this.hiddenSince) this.hiddenSince = Date.now();
    if (visible) this.hiddenSince = 0;
    if (bg === this.background) return;
    this.background = bg;
    this.setPriority(bg);
    this.d.onBackground(bg);
  }

  // Below normal priority for every Crimson Vault process while it is in the background.
  setPriority(low) {
    if (this.s().lowPriorityInBackground === false && low) return;
    const pr = low ? os.constants.priority.PRIORITY_BELOW_NORMAL : os.constants.priority.PRIORITY_NORMAL;
    const pids = new Set([process.pid, ...app.getAppMetrics().map((m) => m.pid), ...this.d.helperPids()]);
    for (const pid of pids) { try { if (pid) os.setPriority(pid, pr); } catch {} }
  }

  tick() {
    const win = this.d.getWin();
    const inTray = !!(win && !win.isDestroyed() && !win.isVisible()) || !win;
    const hiddenMin = this.hiddenSince ? (Date.now() - this.hiddenSince) / MIN : 0;
    // New child processes (a helper restart, the Discord tab) get the low priority too.
    if (this.background) this.setPriority(true);
    // Close the Discord tab after an hour in the tray (it is a full web app and grows over time).
    if (inTray && hiddenMin >= 60 && this.s().closeDiscordInTray !== false && this.d.discordLoaded()) {
      this.d.unloadDiscord();
      this.d.diag.log('discord-closed-in-tray');
    }
    // Close the window itself after 3 minutes in the tray. Nothing is lost: it opens again from the tray.
    if (win && !win.isDestroyed() && inTray && hiddenMin >= 3 && this.s().freeWindowInTray !== false && this.s().closeToTray !== false && !this.d.isBusy({ window: true })) {
      this.d.diag.log('window-freed', { hiddenMin: Math.round(hiddenMin) });
      this.d.destroyWin();
    }
    // A quiet restart, once a day or when handles or memory climb, only while nothing is going on.
    const up = process.uptime() / 3600;
    const why = this.restartWanted || (up >= 24 && this.s().dailyRefresh !== false ? 'daily' : '');
    if (why && this.background && hiddenMin >= 10 && !this.d.isBusy({ restart: true })) {
      this.d.diag.log('quiet-restart', { why, uptimeHours: Math.round(up * 10) / 10 });
      this.restart();
    }
  }

  restart() {
    const args = process.argv.slice(1).filter((a) => a !== '--hidden');
    app.relaunch({ args: [...args, '--hidden'] });
    app.quit();
  }

  async health() {
    const metrics = app.getAppMetrics();
    const mb = (t) => metrics.filter((m) => !t || m.type === t).reduce((a, m) => a + Math.round(((m.memory && m.memory.workingSetSize) || 0) / 1024), 0);
    const pids = [...new Set([process.pid, ...metrics.map((m) => m.pid), ...this.d.helperPids()])].filter(Boolean);
    let handles = null, gdi = null, user = null;
    if (process.platform === 'win32') {
      const out = String((await runPowerShell(HANDLES_SCRIPT(pids), 20000)) || '').trim().split(/\r?\n/).pop() || '';
      const m = out.match(/^(\d+),(\d+),(\d+)$/);
      if (m) [handles, gdi, user] = [+m[1], +m[2], +m[3]];
    }
    const sys = process.getSystemMemoryInfo ? process.getSystemMemoryInfo() : {};
    this.lastHealth = {
      at: Date.now(), uptimeHours: Math.round((process.uptime() / 3600) * 10) / 10, totalMB: mb(), gpuMB: mb('GPU'), processes: metrics.length,
      handles, gdi, user, freeSystemMB: sys.free ? Math.round(sys.free / 1024) : null, background: this.background,
    };
    this.d.diag.log('health2', this.lastHealth);
    // Signs that Windows resources are building up: restart at the next quiet moment.
    const h = this.lastHealth;
    if (!this.restartWanted && ((handles && handles > 40000) || (gdi && gdi > 6000) || (user && user > 6000) || h.gpuMB > 2500 || h.totalMB > 6000)) {
      this.restartWanted = 'resources';
      this.d.diag.log('resources-high', h);
    }
    return h;
  }

  state() {
    return {
      background: this.background,
      uptimeHours: Math.round((process.uptime() / 3600) * 10) / 10,
      health: this.lastHealth,
      restartWanted: this.restartWanted,
    };
  }
}

module.exports = { Power };
