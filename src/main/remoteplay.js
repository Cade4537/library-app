// Xbox Remote Play: play an Xbox console on this PC.
// 1. A Crimson Vault window on xbox.com/play/consoles (default). Uses the same Microsoft sign in
//    as the Xbox connection and starts your console by itself.
// 2. The Xbox app (backup). In the Xbox app the console button sits at the bottom of the left bar;
//    it opens a list of consoles and clicking a console starts streaming. Crimson Vault does those
//    two clicks for you through Windows UI Automation.
const { BrowserWindow, session, shell } = require('electron');
const path = require('path');
const { runPowerShell } = require('./util');

const PARTITION = 'persist:xbox';
const CONSOLES_URL = 'https://www.xbox.com/play/consoles';
const MS_HOSTS = /(^|\.)(xbox\.com|live\.com|microsoft\.com|microsoftonline\.com|xboxlive\.com|msauth\.net|msftauth\.net|live\.net)$/i;

// Runs inside the xbox.com page. Clicks your console's remote play button: the one next to the
// console's name when we know it, otherwise the only one on the page. Gives up after 30 seconds.
const autoStart = (consoleName) => `(() => {
  if (window.__cvAuto) return; window.__cvAuto = true;
  const name = ${JSON.stringify(consoleName || '')}.toLowerCase();
  const want = /(remote play|play remotely|stream|connect)/i;
  const skip = /(set ?up|learn|help|how to|settings|turn on|sign in|get the app)/i;
  const started = Date.now();
  const visible = (b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !b.disabled; };
  const label = (b) => ((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '')).trim();
  const tick = () => {
    if (Date.now() - started > 30000) return;
    let btns = [...document.querySelectorAll('button, a[role="button"], a')].filter((b) => visible(b) && want.test(label(b)) && !skip.test(label(b)));
    if (name && btns.length > 1) {
      const near = btns.filter((b) => { let p = b; for (let i = 0; i < 6 && p; i++, p = p.parentElement) if ((p.innerText || '').toLowerCase().includes(name)) return true; return false; });
      if (near.length) btns = near;
    }
    if (btns.length === 1) { btns[0].click(); return; }
    setTimeout(tick, 800);
  };
  setTimeout(tick, 1500);
})();`;

let win = null;

function chromeUA(ses) {
  // xbox.com only offers remote play to browsers it knows, so drop the Electron part of the user agent.
  return ses.getUserAgent().replace(/\s(Electron|crimson-vault|library-app|Crimson Vault)\/\S+/gi, '');
}

function openRemotePlayWindow(parent, consoleName) {
  if (win && !win.isDestroyed()) { win.focus(); return; }
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(chromeUA(ses));
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['fullscreen', 'pointerLock', 'media'].includes(perm)));
  win = new BrowserWindow({
    width: 1600, height: 900, backgroundColor: '#000000', autoHideMenuBar: true, show: false,
    title: 'Xbox Remote Play', icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.once('ready-to-show', () => { win.show(); win.setFullScreen(true); });
  // Sign in popups stay in the window. Normal web links open in the browser. Anything else
  // (like a link that would hand off to the Xbox app) is ignored so the stream stays here.
  win.webContents.setWindowOpenHandler(({ url }) => {
    let u;
    try { u = new URL(url); } catch { return { action: 'deny' }; }
    if (u.protocol === 'https:' && MS_HOSTS.test(u.hostname)) return { action: 'allow' };
    if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!/^https?:/i.test(url)) e.preventDefault(); });
  const inject = () => win && !win.isDestroyed() && win.webContents.executeJavaScript(autoStart(consoleName)).catch(() => {});
  win.webContents.on('did-finish-load', inject);
  win.webContents.on('did-navigate-in-page', inject);
  // F11 toggles full screen, Ctrl+W closes. Esc is left to the stream.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if (input.control && input.key.toLowerCase() === 'w') { e.preventDefault(); win.close(); }
  });
  win.on('closed', () => { win = null; if (parent && !parent.isDestroyed()) parent.focus(); });
  win.loadURL(CONSOLES_URL);
}

// Opens the Xbox app, presses the console button at the bottom of its left bar, then your console.
// Buttons are found by name first; if the app does not name them, the console button is clicked
// by its position (it sits just above the downloads button). Prints one word: what happened.
const xboxAppScript = (consoleName) => String.raw`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class CvMouse {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  public static void Click(int x, int y) { SetCursorPos(x, y); mouse_event(2, 0, 0, 0, 0); mouse_event(4, 0, 0, 0, 0); }
}
'@
[CvMouse]::SetProcessDPIAware() | Out-Null
$consoleName = '${String(consoleName || '').replace(/'/g, "''")}'
$A = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$any = [System.Windows.Automation.Condition]::TrueCondition
Start-Process 'shell:AppsFolder\Microsoft.GamingApp_8wekyb3d8bbwe!Microsoft.Xbox.App'
$deadline = (Get-Date).AddSeconds(45)

function XboxWindows {
  $out = @()
  foreach ($w in $A::RootElement.FindAll($TS::Children, $any)) {
    try {
      $p = Get-Process -Id $w.Current.ProcessId -ErrorAction SilentlyContinue
      if ($p -and $p.ProcessName -match '^(XboxPcApp|XboxApp|GamingApp)') { $out += $w }
      elseif ($w.Current.Name -match '^(?i)xbox$') { $out += $w }
    } catch {}
  }
  return $out
}
function Named($wins, $pattern) {
  $hits = @()
  foreach ($w in $wins) {
    foreach ($e in $w.FindAll($TS::Descendants, $any)) {
      try { if ($e.Current.Name -match $pattern -and -not $e.Current.IsOffscreen) { $hits += $e } } catch {}
    }
  }
  return $hits
}
function Press($e) {
  $p = $null
  if ($e.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) { $p.Invoke(); return }
  if ($e.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) { $p.Select(); return }
  $r = $e.Current.BoundingRectangle
  [CvMouse]::Click([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
}

$main = $null
while (-not $main -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 700
  $main = XboxWindows | Where-Object { $_.Current.BoundingRectangle.Width -gt 400 } | Select-Object -First 1
}
if (-not $main) { 'nowindow'; exit }
Start-Sleep -Seconds 2
[CvMouse]::SetForegroundWindow([IntPtr]$main.Current.NativeWindowHandle) | Out-Null

if ($consoleName) { $target = '(?i)^' + [regex]::Escape($consoleName) + '\b' } else { $target = '(?i)console (on|off|ready)|ready to stream' }
$opened = $false; $tries = 0
while ((Get-Date) -lt $deadline) {
  $wins = XboxWindows
  $hit = Named $wins $target | Select-Object -First 1
  if ($hit -and $opened) { Press $hit; 'started'; exit }
  if (-not $opened) {
    $btn = Named @($main) '(?i)^(my )?consoles?$|your consoles|remote play|console' | Where-Object {
      $r = $_.Current.BoundingRectangle; $m = $main.Current.BoundingRectangle
      ($r.X - $m.X) -lt 120 -and ($r.Y - $m.Y) -gt ($m.Height / 2)
    } | Select-Object -First 1
    if ($btn) { Press $btn; $opened = $true }
    elseif ($tries -ge 2) {
      # Not named: click it by position, just above the downloads button at the bottom of the left bar.
      $m = $main.Current.BoundingRectangle
      $dpi = [CvMouse]::GetDpiForWindow([IntPtr]$main.Current.NativeWindowHandle); if (-not $dpi) { $dpi = 96 }
      $s = $dpi / 96.0
      [CvMouse]::Click([int]($m.X + 33 * $s), [int]($m.Y + $m.Height - 110 * $s))
      $opened = $true
    }
    $tries++
  }
  Start-Sleep -Milliseconds 900
}
if ($opened) { 'listonly' } else { 'notfound' }
`;

async function openXboxAppAndConnect(consoleName) {
  const out = String((await runPowerShell(xboxAppScript(consoleName), 70000)) || '').trim().split(/\r?\n/).pop();
  if (out === 'started') return { ok: true, message: `Connecting to ${consoleName || 'your console'} in the Xbox app` };
  if (out === 'listonly') return { ok: true, message: 'Opened your consoles list in the Xbox app. Pick your console to start.' };
  if (out === 'nowindow') return { error: 'The Xbox app did not open.' };
  return { ok: true, message: 'Xbox app opened. Click the console button at the bottom of its left bar, then your console.' };
}

module.exports = { openRemotePlayWindow, openXboxAppAndConnect, autoStart, chromeUA, PARTITION, CONSOLES_URL, MS_HOSTS };
