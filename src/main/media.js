// Reads "now playing" from Windows media controls (the same ones the volume flyout uses)
// and sends play/pause/next/previous back. Apple Music for Windows reports through these,
// so this works without any Apple account setup. Other players work too.
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const APPLE_MUSIC_AUMID = 'AppleInc.AppleMusicWin_nzyj5cx40ttqa!App';
const APPLE_MUSIC_STORE = 'ms-windows-store://pdp/?productid=9PFHDD62MXS1';

const SCRIPT = (cmdFile, anyApp) => `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
function ReadThumb($ref) {
  $st = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $size = [uint32]$st.Size
  if ($size -lt 100) { return $null }
  $reader = [Windows.Storage.Streams.DataReader]::new($st.GetInputStreamAt(0))
  Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  $reader.Dispose(); $st.Dispose()
  $type = 'image/jpeg'
  if ($bytes[0] -eq 0x89) { $type = 'image/png' }
  return 'data:' + $type + ';base64,' + [Convert]::ToBase64String($bytes)
}
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$cmdFile = '${cmdFile.replace(/'/g, "''")}'
$anyApp = ${anyApp ? '$true' : '$false'}
$lastKey = ''
$lastOut = ''
$artTries = 0
$lastArt = ''
while ($true) {
  $s = $null
  try {
    $all = @($mgr.GetSessions())
    $s = $all | Where-Object { $_.SourceAppUserModelId -like 'AppleInc.AppleMusic*' } | Select-Object -First 1
    if (-not $s -and $anyApp) { $s = $mgr.GetCurrentSession() }
  } catch {}

  if (Test-Path -LiteralPath $cmdFile) {
    $cmd = (Get-Content -LiteralPath $cmdFile -Raw).Trim()
    Remove-Item -LiteralPath $cmdFile -Force
    if ($s) {
      try {
        switch ($cmd) {
          'toggle' { Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
          'next' { Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null }
          'prev' { Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null }
        }
      } catch {}
    }
  }

  $o = @{ active = $false }
  if ($s) {
    try {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $pb = $s.GetPlaybackInfo()
      $tl = $s.GetTimelineProperties()
      $artist = $p.Artist
      if ($p.AlbumArtist -and -not $artist) { $artist = $p.AlbumArtist }
      $o = @{
        active = $true
        app = $s.SourceAppUserModelId
        title = $p.Title
        artist = $artist
        album = $p.AlbumTitle
        status = $pb.PlaybackStatus.ToString()
        pos = [math]::Round($tl.Position.TotalSeconds)
        dur = [math]::Round($tl.EndTime.TotalSeconds)
      }
      $key = "$($s.SourceAppUserModelId)|$($p.Title)|$($p.Artist)"
      if ($key -ne $lastKey) { $lastKey = $key; $artTries = 0; $lastArt = ''; $o.art = '' }
      # Players often attach the artwork a moment after the title, so keep trying for a few seconds.
      if (-not $lastArt -and $artTries -lt 8 -and $p.Thumbnail) {
        $artTries++
        try { $a = ReadThumb $p.Thumbnail; if ($a) { $lastArt = $a; $o.art = $a } } catch {}
      }
    } catch { $o = @{ active = $false } }
  } else { $lastKey = '' }

  $line = ConvertTo-Json -InputObject $o -Compress
  if ($line -ne $lastOut -or $o.status -eq 'Playing') {
    [Console]::Out.WriteLine($line)
    [Console]::Out.Flush()
    $lastOut = $line
  }
  Start-Sleep -Milliseconds 700
}
`;

class MediaBridge {
  constructor(send) {
    this.send = send;
    this.proc = null;
    this.enabled = false;
    this.anyApp = false;
    this.cmdFile = path.join(os.tmpdir(), `library-media-${process.pid}.cmd`);
    this.state = { active: false };
    this.restartTimer = null;
    this.failures = 0;
    this.artCache = new Map();
  }

  // Fallback when the player gives no thumbnail: look the song up on Apple's public iTunes search.
  async lookupArt(key, s) {
    this.artCache.set(key, null);
    const artist = String(s.artist || '').split(/\s+\u2014\s+/)[0];
    const term = `${artist} ${s.title}`.trim();
    if (!term) return;
    try {
      const res = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=5&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const j = await res.json();
      const r = (j.results || []).find((x) => x.artworkUrl100);
      if (!r) return;
      const url = r.artworkUrl100.replace(/100x100bb/, '600x600bb');
      this.artCache.set(key, url);
      if (this.state.active && `${this.state.title}|${this.state.artist}` === key && !this.state.art) this.emit({ ...this.state, art: url });
    } catch {}
  }

  configure({ enabled, anyApp }) {
    const changed = enabled !== this.enabled || anyApp !== this.anyApp;
    this.enabled = enabled;
    this.anyApp = anyApp;
    if (!changed) return;
    this.stop();
    if (enabled) this.start();
    else this.emit({ active: false });
  }

  start() {
    if (process.platform !== 'win32' || this.proc) return;
    const full = "[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$ProgressPreference='SilentlyContinue'\n" + SCRIPT(this.cmdFile, this.anyApp);
    const encoded = Buffer.from(full, 'utf16le').toString('base64');
    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true });
    } catch {
      this.proc = null;
      return;
    }
    let buf = '';
    this.proc.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        try {
          const s = JSON.parse(line);
          this.failures = 0;
          if (!s.art && this.state.art && s.title === this.state.title && s.artist === this.state.artist) s.art = this.state.art;
          this.emit(s);
        } catch {}
      }
    });
    this.proc.stderr.on('data', () => {});
    this.proc.on('close', () => {
      this.proc = null;
      if (!this.enabled) return;
      this.failures++;
      // Back off if PowerShell keeps failing (for example on an older Windows build).
      if (this.failures > 5) return this.emit({ active: false, unavailable: true });
      this.restartTimer = setTimeout(() => this.start(), 2000 * this.failures);
    });
  }

  stop() {
    clearTimeout(this.restartTimer);
    if (this.proc) {
      const p = this.proc;
      this.proc = null;
      try { p.kill(); } catch {}
    }
  }

  emit(s) {
    if (s.active && !s.art) {
      const key = `${s.title}|${s.artist}`;
      const hit = this.artCache.get(key);
      if (hit) s.art = hit;
      else if (hit === undefined) this.lookupArt(key, s);
    }
    this.state = s;
    this.send({ ...s, isApple: !!(s.app && /^AppleInc\.AppleMusic/i.test(s.app)) });
  }

  command(cmd) {
    if (!['toggle', 'next', 'prev'].includes(cmd)) return;
    try { fs.writeFileSync(this.cmdFile, cmd); } catch {}
  }
}

module.exports = { MediaBridge, APPLE_MUSIC_AUMID, APPLE_MUSIC_STORE };
