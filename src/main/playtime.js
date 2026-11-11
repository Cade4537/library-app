// Tracks hours played by checking every 30 seconds which programs are running
// and matching them to each game's install folder.
// 0.17.2: a game only counts while one of its programs has a window open. Some games (Roblox above all)
// leave a process running in the background after you close them, which used to count as playing.
const { spawn } = require('child_process');
const path = require('path');

const INTERVAL = 30;
const SCRIPT = `
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$ErrorActionPreference='SilentlyContinue'
while ($true) {
  $p = @(Get-Process | Where-Object { $_.Path } | ForEach-Object { [pscustomobject]@{ p = $_.Path; w = [int]([int64]$_.MainWindowHandle -ne 0) } })
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $p -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Seconds ${INTERVAL}
}
`;

class PlaytimeTracker {
  constructor(store, onChange) {
    this.store = store;
    this.onChange = onChange;
    this.proc = null;
    this.running = new Set();
    this.failures = 0;
  }

  start() {
    if (process.platform !== 'win32' || this.proc) return;
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true });
    } catch {
      return;
    }
    // Restart the helper every 6 hours so it never grows without limit.
    clearTimeout(this.recycle);
    this.recycle = setTimeout(() => { if (!this.stopped && this.proc) { const p = this.proc; this.proc = null; this.failures = 0; try { p.removeAllListeners('close'); p.kill(); } catch {} this.start(); } }, 6 * 3600 * 1000);
    let buf = '';
    this.proc.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('[')) continue;
        try { this.tick(JSON.parse(line)); this.failures = 0; } catch {}
      }
    });
    this.proc.stderr.on('data', () => {});
    const proc = this.proc;
    proc.on('close', () => {
      if (this.proc !== proc) return;
      this.proc = null;
      if (this.stopped || ++this.failures > 5) return;
      setTimeout(() => this.start(), 5000 * this.failures);
    });
  }

  // Saves sessions for games still running when Crimson Vault closes.
  flushSessions() {
    const t = Date.now();
    for (const [id, s] of this.started || []) {
      if (t - s < 60 * 1000) continue;
      const list = this.store.data.sessions || (this.store.data.sessions = []);
      list.push({ id, s, e: t });
    }
    if (this.started) this.started.clear();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.recycle);
    if (this.proc) { try { this.proc.kill(); } catch {} this.proc = null; }
  }

  // Map of lowercased install folder to item, longest folders first so nested installs match correctly.
  dirs() {
    const out = [];
    for (const it of Object.values(this.store.data.items)) {
      if (it.kind !== 'game' || !it.installed || !it.installDir) continue;
      const d = path.normalize(it.installDir).toLowerCase().replace(/[\\/]*$/, path.sep);
      if (d.length > 6) out.push([d, it]);
    }
    return out.sort((a, b) => b[0].length - a[0].length);
  }

  // Whether a game needs a window to count as playing. Automatic: yes, except Microsoft Store and
  // Xbox app games, whose windows belong to a Windows helper and cannot be seen from here.
  static needsWindow(it) {
    const mode = it.meta && it.meta.countMode;
    if (mode === 'window') return true;
    if (mode === 'any') return false;
    const dir = String(it.installDir || '').toLowerCase();
    return !(it.source === 'xbox' || dir.includes('\\windowsapps\\') || dir.includes('/windowsapps/'));
  }

  tick(paths) {
    const dirs = this.dirs();
    const seen = new Map(); // game id -> has a window
    for (const entry of paths || []) {
      const p = typeof entry === 'string' ? entry : entry && entry.p;
      if (!p) continue;
      const low = String(p).toLowerCase();
      const hit = dirs.find(([d]) => low.startsWith(d));
      if (!hit) continue;
      const w = typeof entry === 'string' ? true : !!entry.w;
      seen.set(hit[1].id, seen.get(hit[1].id) || w);
    }
    const now = new Set();
    this.background = new Set();
    for (const [id, w] of seen) {
      const it = this.store.data.items[id];
      if (!it) continue;
      // Running with no window anywhere: a leftover background process, not play.
      if (!w && PlaytimeTracker.needsWindow(it)) { this.background.add(id); continue; }
      now.add(id);
    }
    const t = Date.now();
    for (const id of now) {
      const it = this.store.data.items[id];
      if (!it) continue;
      it.meta = it.meta || {};
      // Only count time after the first sighting, so a single check does not add 30 seconds by itself.
      if (this.running.has(id)) it.meta.trackedMinutes = (it.meta.trackedMinutes || 0) + INTERVAL / 60;
      it.lastPlayed = t;
    }
    // Play sessions (start and end of each time a game ran) for the Stats page.
    if (!this.started) this.started = new Map();
    for (const id of now) if (!this.started.has(id)) this.started.set(id, t);
    for (const [id, s] of [...this.started]) {
      if (now.has(id)) continue;
      this.started.delete(id);
      if (t - s < 60 * 1000) continue;
      const list = this.store.data.sessions || (this.store.data.sessions = []);
      list.push({ id, s, e: t });
      if (list.length > 1500) list.splice(0, list.length - 1500);
    }
    const changed = now.size !== this.running.size || [...now].some((id) => !this.running.has(id));
    this.running = now;
    if (now.size || changed) this.onChange(changed);
  }
}

// Minutes played: Steam's own count when there is one, plus anything tracked here for other games.
function minutesPlayed(it) {
  const m = it.meta || {};
  return Math.max(m.playtime || 0, m.xboxMinutes || 0, m.epicMinutes || 0, m.gogMinutes || 0, m.ubiMinutes || 0, Math.round(m.trackedMinutes || 0));
}

module.exports = { PlaytimeTracker, minutesPlayed };
