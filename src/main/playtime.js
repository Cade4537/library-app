// Tracks hours played by checking every 30 seconds which programs are running
// and matching them to each game's install folder.
const { spawn } = require('child_process');
const path = require('path');

const INTERVAL = 30;
const SCRIPT = `
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$ErrorActionPreference='SilentlyContinue'
while ($true) {
  $p = @(Get-Process | Where-Object { $_.Path } | Select-Object -ExpandProperty Path -Unique)
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
    this.proc.on('close', () => {
      this.proc = null;
      if (this.stopped || ++this.failures > 5) return;
      setTimeout(() => this.start(), 5000 * this.failures);
    });
  }

  stop() {
    this.stopped = true;
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

  tick(paths) {
    const dirs = this.dirs();
    const now = new Set();
    for (const p of paths || []) {
      const low = String(p).toLowerCase();
      const hit = dirs.find(([d]) => low.startsWith(d));
      if (hit) now.add(hit[1].id);
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
    const changed = now.size !== this.running.size || [...now].some((id) => !this.running.has(id));
    this.running = now;
    if (now.size || changed) this.onChange(changed);
  }
}

// Minutes played: Steam's own count when there is one, plus anything tracked here for other games.
function minutesPlayed(it) {
  const m = it.meta || {};
  return Math.max(m.playtime || 0, m.xboxMinutes || 0, m.epicMinutes || 0, m.gogMinutes || 0, Math.round(m.trackedMinutes || 0));
}

module.exports = { PlaytimeTracker, minutesPlayed };
