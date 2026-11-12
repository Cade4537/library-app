// Quality of life helpers in the background: session summaries, play time reminders,
// do not disturb while playing, low disk space warnings, new installs found by themselves,
// Steam downloads, your own screenshots, and the controller battery.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { Notification } = require('electron');
const { parseVdf } = require('./vdf');
const { findSteamPath } = require('./scanners/steam');
const { runPowerShell } = require('./util');

const HOUR = 3600 * 1000;
const fmtMins = (m) => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);
const normName = (s) => String(s || '').toLowerCase().replace(/[™®©]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

class Qol {
  // deps: { store, running(), registry(), rescan(), getDrives(), achievements(it, force), sendTo(ch, v), showWindow() }
  constructor(deps) {
    this.d = deps;
    this.sessions = new Map(); // id -> { start, ach, reminded }
    this.queue = []; // notifications held back while you play
    this.dlPrev = new Map(); // downloads seen last time, to tell when one finishes
    this.dlProg = new Map(); // bytes seen per download, to tell when one is really moving
    this.lowWarned = new Set();
    this.watchers = [];
    this.batt = { t: 0, v: null };
  }

  get s() { return this.d.store.data.settings; }
  gameRunning() { return [...this.d.running()].some((id) => { const it = this.d.store.data.items[id]; return it && it.kind === 'game'; }); }

  // ---------- notifications ----------
  // Shows a Windows notification. With "hold" set, it waits while a game is running (do not disturb).
  notify({ title, body, hold, click, kind, id }) {
    // Every alert also goes to the guide's Alerts tab, so a missed pop up can be read later.
    // While the window is closed in the tray, alerts wait here until it opens again.
    if (kind !== 'summary-batch') {
      const a = { title, body, at: Date.now(), kind: kind || 'info', id: id || null };
      if (this.d.hasWindow && !this.d.hasWindow()) { (this.pending || (this.pending = [])).push(a); if (this.pending.length > 60) this.pending.shift(); }
      else this.d.sendTo('qol:alert', a);
    }
    if (hold && this.s.dndWhilePlaying !== false && this.gameRunning()) { this.queue.push({ title, body }); return; }
    if (!Notification.isSupported()) return;
    try {
      const n = new Notification({ title, body, silent: false });
      if (click) n.on('click', click);
      n.show();
    } catch {}
  }
  flushQueue() {
    if (!this.queue.length || this.gameRunning()) return;
    const q = this.queue.splice(0);
    if (q.length === 1) this.notify(q[0]);
    else this.notify({ kind: 'summary-batch', title: `While you played: ${q.length} updates`, body: q.slice(0, 4).map((n) => n.title).join(' · '), click: () => this.d.showWindow() });
  }

  // ---------- sessions: summary and reminders (called on every play time check) ----------
  tick() {
    const now = this.d.running();
    const items = this.d.store.data.items;
    const t = Date.now();
    for (const id of now) {
      const it = items[id];
      if (!it || it.kind !== 'game') continue;
      if (!this.sessions.has(id)) this.sessions.set(id, { start: t, ach: it.meta && it.meta.achievements ? it.meta.achievements.have : null, reminded: 0 });
      const ses = this.sessions.get(id);
      const every = Number(this.s.playReminderHours) || 0;
      if (every > 0) {
        const hours = Math.floor((t - ses.start) / (every * HOUR));
        if (hours > ses.reminded) {
          ses.reminded = hours;
          this.notify({ kind: 'reminder', title: `${hours * every} ${hours * every === 1 ? 'hour' : 'hours'} of ${it.customName || it.name}`, body: 'A good moment for a break, some water and a stretch.' });
        }
      }
    }
    for (const [id, ses] of [...this.sessions]) {
      if (now.has(id)) continue;
      this.sessions.delete(id);
      const it = items[id];
      const mins = (t - ses.start) / 60000;
      if (it && mins >= 5 && this.s.sessionSummary !== false) this.summary(it, ses, mins).catch(() => {});
    }
    if (!this.gameRunning()) setTimeout(() => this.flushQueue(), 15000);
  }

  async summary(it, ses, mins) {
    const name = it.customName || it.name;
    let achText = '';
    // Give the launcher a moment to sync, then look for achievements unlocked during the session.
    await new Promise((r) => setTimeout(r, 45000));
    try {
      const v = await this.d.achievements(it, true);
      if (v && v.list) {
        const fresh = v.list.filter((a) => a.unlocked && (a.unlockTime < 1e12 ? a.unlockTime * 1000 : a.unlockTime) >= ses.start - 60000);
        if (fresh.length) achText = ` · ${fresh.length} new ${fresh.length === 1 ? 'achievement' : 'achievements'}: ${fresh.slice(0, 2).map((a) => a.name).join(', ')}${fresh.length > 2 ? '…' : ''}`;
      }
    } catch {}
    const total = it.minutes || 0;
    const body = `You played ${fmtMins(mins)}${achText}. ${total ? `${Math.round(total / 60)} h in total.` : ''}`.trim();
    this.notify({ kind: 'session', title: `Session over: ${name}`, body, click: () => this.d.showWindow() });
    this.d.sendTo('toast', { text: `${name}: played ${fmtMins(mins)}${achText}` });
  }

  // ---------- low disk space ----------
  async checkSpace() {
    const limit = Number(this.s.lowSpaceGB === undefined ? 30 : this.s.lowSpaceGB) || 0;
    if (!limit) return;
    let drives = [];
    try { drives = await this.d.getDrives(); } catch { return; }
    for (const dv of drives) {
      const freeGB = dv.free / 1e9;
      if (freeGB < limit && !this.lowWarned.has(dv.id)) {
        this.lowWarned.add(dv.id);
        this.notify({ kind: 'storage', title: `${dv.id} is almost full`, body: `${freeGB.toFixed(1)} GB free. Click to see the biggest games.`, hold: true, click: () => { this.d.showWindow(); this.d.sendTo('app:command', 'storage'); } });
      } else if (freeGB > limit * 1.15) this.lowWarned.delete(dv.id);
    }
  }

  // ---------- Steam libraries ----------
  async steamLibs() {
    const root = await findSteamPath(this.d.registry() || {});
    if (!root) return { root: null, libs: [] };
    const libs = [root];
    try {
      const data = parseVdf(await fsp.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8'));
      for (const [k, v] of Object.entries(data.libraryfolders || {})) {
        const p = typeof v === 'object' ? v.path : /^\d+$/.test(k) ? v : null;
        if (p && !libs.some((x) => x.toLowerCase() === path.normalize(p).toLowerCase())) libs.push(path.normalize(p));
      }
    } catch {}
    return { root, libs };
  }

  // ---------- new installs, found by themselves ----------
  async watch() {
    for (const w of this.watchers) { try { w.close(); } catch {} }
    this.watchers = [];
    const dirs = [];
    const { libs } = await this.steamLibs().catch(() => ({ libs: [] }));
    for (const l of libs) dirs.push(path.join(l, 'steamapps'));
    dirs.push(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'));
    const kick = (file) => {
      if (file && !/\.(acf|item)$/i.test(String(file))) return;
      clearTimeout(this.rescanTimer);
      this.rescanTimer = setTimeout(() => this.d.rescan(), 20000);
    };
    for (const d of dirs) {
      try { this.watchers.push(fs.watch(d, { persistent: false }, (_ev, file) => kick(file))); } catch {}
    }
  }

  // ---------- downloads ----------
  async downloads() {
    const out = [];
    const { libs } = await this.steamLibs().catch(() => ({ libs: [] }));
    for (const lib of libs) {
      const dir = path.join(lib, 'steamapps');
      let names = [];
      try { names = await fsp.readdir(dir); } catch { continue; }
      for (const n of names) {
        if (!/^appmanifest_\d+\.acf$/i.test(n)) continue;
        let st;
        try { st = parseVdf(await fsp.readFile(path.join(dir, n), 'utf8')).appstate; } catch { continue; }
        if (!st) continue;
        const flags = Number(st.stateflags) || 0;
        const total = Number(st.bytestodownload) || 0;
        const done = Number(st.bytesdownloaded) || 0;
        const stage = Number(st.bytestostage) || 0;
        const staged = Number(st.bytesstaged) || 0;
        const busy = flags & (2 | 256 | 512 | 1024 | 1048576 | 2097152 | 4194304);
        if (!busy || (total && done >= total && (!stage || staged >= stage))) continue;
        // Steam keeps "scheduled" updates in this state even when nothing is downloading (Steam
        // closed, download window, paused). Only bytes actually moving count as active.
        const id = `steam:${st.appid}`;
        const moved = done + staged;
        let prog = this.dlProg.get(id);
        if (!prog) { prog = { moved, movedAt: 0 }; this.dlProg.set(id, prog); }
        else { if (moved > prog.moved) prog.movedAt = Date.now(); prog.moved = moved; }
        const paused = !!(flags & 512);
        const queued = !(flags & (256 | 1024 | 1048576 | 2097152 | 4194304));
        out.push({
          source: 'steam', appid: st.appid, name: st.name || `App ${st.appid}`,
          paused, queued,
          active: !paused && !queued && Date.now() - prog.movedAt < 90000,
          done, total, pct: total ? Math.min(100, Math.round((done / total) * 100)) : 0,
          id,
        });
      }
    }
    // Epic: games still marked as an unfinished install.
    try {
      const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
      for (const n of await fsp.readdir(dir)) {
        if (!/\.item$/i.test(n)) continue;
        try {
          const j = JSON.parse(await fsp.readFile(path.join(dir, n), 'utf8'));
          // Epic's manifests do not say whether bytes are moving, and an abandoned install sits in
          // this state forever, so these never count as active for the guide.
          if (j.bIsIncompleteInstall) out.push({ source: 'epic', name: j.DisplayName || 'Epic game', paused: false, queued: false, active: false, pct: null, id: `epic:${j.AppName}` });
        } catch {}
      }
    } catch {}
    if (this.dlProg.size > 300) this.dlProg.clear();
    return out.sort((a, b) => Number(a.queued) - Number(b.queued) || Number(a.paused) - Number(b.paused));
  }

  // ---------- screenshots ----------
  async screenshots(it) {
    if (!it) return [];
    const files = [];
    const add = async (dir, test) => {
      let names = [];
      try { names = await fsp.readdir(dir); } catch { return; }
      for (const n of names) {
        if (!/\.(png|jpe?g)$/i.test(n) || (test && !test(n))) continue;
        try { const st = await fsp.stat(path.join(dir, n)); files.push({ path: path.join(dir, n), t: st.mtimeMs }); } catch {}
      }
    };
    if (it.steamAppId) {
      const { root } = await this.steamLibs().catch(() => ({ root: null }));
      if (root) {
        let users = [];
        try { users = await fsp.readdir(path.join(root, 'userdata')); } catch {}
        for (const u of users) await add(path.join(root, 'userdata', u, '760', 'remote', String(it.steamAppId), 'screenshots'));
      }
    }
    // Xbox Game Bar names captures after the game: "Game Name 2026-10-30 21-14-03.png".
    const key = normName(it.customName || it.name);
    if (key.length > 2) await add(path.join(os.homedir(), 'Videos', 'Captures'), (n) => normName(n.replace(/\.(png|jpe?g)$/i, '')).startsWith(key));
    return files.sort((a, b) => b.t - a.t).slice(0, 60);
  }

  // ---------- controller battery (Xbox controllers, wired or wireless) ----------
  async battery() {
    if (process.platform !== 'win32') return null;
    if (Date.now() - this.batt.t < 120000) return this.batt.v;
    this.batt.t = Date.now();
    const out = await runPowerShell(`
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class CvPad {
  [StructLayout(LayoutKind.Sequential)] public struct BI { public byte Type; public byte Level; }
  [DllImport("xinput1_4.dll")] public static extern int XInputGetBatteryInformation(int i, byte dev, ref BI b);
}
'@
$r = @()
for ($i = 0; $i -lt 4; $i++) { $b = New-Object CvPad+BI; if ([CvPad]::XInputGetBatteryInformation($i, 0, [ref]$b) -eq 0 -and $b.Type -ne 0) { $r += "$($b.Type),$($b.Level)" } }
$r -join ';'
`, 15000);
    const first = String(out || '').trim().split(';').filter(Boolean)[0];
    if (!first) { this.batt.v = null; return null; }
    const [type, level] = first.split(',').map(Number);
    this.batt.v = { wired: type === 1, unknown: type === 255, level }; // level: 0 empty, 1 low, 2 medium, 3 full
    return this.batt.v;
  }

  // A download that was running and is gone from the list has finished: say it is ready to play.
  async checkDownloads() {
    const list = await this.downloads().catch(() => null);
    if (!list) return;
    const now = new Map(list.map((d) => [d.id || d.name, d]));
    for (const [k, d] of this.dlPrev) {
      if (now.has(k) || d.paused || d.queued) continue;
      this.notify({ title: `Ready to play: ${d.name}`, body: d.total ? `Finished downloading ${(d.total / 1e9).toFixed(1)} GB.` : 'Finished installing.', hold: true, kind: 'download', click: () => this.d.showWindow() });
    }
    this.dlPrev = now;
  }

  start() {
    this.watch().catch(() => {});
    setTimeout(() => this.checkDownloads(), 30000);
    this.dlTimer = setInterval(() => this.checkDownloads(), 60000);
    setTimeout(() => this.checkSpace(), 90000);
    this.spaceTimer = setInterval(() => this.checkSpace(), 10 * 60 * 1000);
    // A quiet rescan now and then catches installs the folder watch cannot see (Xbox, GOG, Ubisoft).
    this.rescanEvery = setInterval(() => { if (!this.gameRunning()) this.d.rescan(); }, 2 * HOUR);
  }
}

module.exports = { Qol };
