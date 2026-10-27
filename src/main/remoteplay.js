// Xbox Remote Play: play an Xbox console on this PC.
// 1. A Crimson Vault window on xbox.com/play/consoles (default). Uses the same Microsoft sign in
//    as the Xbox connection and starts your console by itself when you only have one.
// 2. The Xbox app, with its clicks automated through Windows UI Automation (backup option).
const { BrowserWindow, session, shell } = require('electron');
const path = require('path');
const { runPowerShell } = require('./util');

const PARTITION = 'persist:xbox';
const CONSOLES_URL = 'https://www.xbox.com/play/consoles';
const MS_HOSTS = /(^|\.)(xbox\.com|live\.com|microsoft\.com|microsoftonline\.com|xboxlive\.com|msauth\.net|msftauth\.net|live\.net|gssv-play-prod\.xboxlive\.com)$/i;

// Runs inside the xbox.com page. Clicks the console's remote play button only when there is exactly
// one, so it never picks the wrong console. Gives up after 25 seconds.
const AUTO_START = `(() => {
  if (window.__cvAuto) return; window.__cvAuto = true;
  const want = /(remote play|play remotely|stream from console|connect)/i;
  const skip = /(set ?up|learn|help|how to|settings|turn on|sign in)/i;
  const started = Date.now();
  const tick = () => {
    if (Date.now() - started > 25000 || !/\\/play\\/consoles/.test(location.pathname)) return;
    const els = [...document.querySelectorAll('button, a[role="button"], a')].filter((b) => {
      const t = ((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '')).trim();
      const r = b.getBoundingClientRect();
      return t && want.test(t) && !skip.test(t) && r.width > 0 && r.height > 0 && !b.disabled;
    });
    if (els.length === 1) { els[0].click(); return; }
    setTimeout(tick, 800);
  };
  setTimeout(tick, 1500);
})();`;

let win = null;

function chromeUA(ses) {
  // xbox.com only offers remote play to browsers it knows, so drop the Electron part of the user agent.
  return ses.getUserAgent().replace(/\s(Electron|crimson-vault|library-app)\/\S+/gi, '');
}

function openRemotePlayWindow(parent) {
  if (win && !win.isDestroyed()) { win.focus(); return; }
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(chromeUA(ses));
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['fullscreen', 'pointerLock', 'keyboardLock', 'media'].includes(perm)));
  win = new BrowserWindow({
    width: 1600, height: 900, backgroundColor: '#000000', autoHideMenuBar: true, show: false,
    title: 'Xbox Remote Play', icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.once('ready-to-show', () => { win.show(); win.setFullScreen(true); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { if (MS_HOSTS.test(new URL(url).hostname)) return { action: 'allow' }; } catch {}
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-finish-load', () => { win.webContents.executeJavaScript(AUTO_START).catch(() => {}); });
  win.webContents.on('did-navigate-in-page', () => { win.webContents.executeJavaScript(AUTO_START).catch(() => {}); });
  // F11 toggles full screen, Ctrl+W closes. Esc is left to the stream.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if (input.control && input.key.toLowerCase() === 'w') { e.preventDefault(); win.close(); }
  });
  win.on('closed', () => { win = null; if (parent && !parent.isDestroyed()) parent.focus(); });
  win.loadURL(CONSOLES_URL);
}

// Backup: opens the Xbox app, then presses its consoles button and the remote play button for you.
// Windows UI Automation can read the Xbox app's buttons by name. Returns what happened.
const XBOX_APP_SCRIPT = String.raw`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$aumid = 'Microsoft.GamingApp_8wekyb3d8bbwe!Microsoft.Xbox.App'
Start-Process "shell:AppsFolder\$aumid"
$root = [System.Windows.Automation.AutomationElement]::RootElement
$deadline = (Get-Date).AddSeconds(40)
function Find-Win {
  $c = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Xbox')
  return $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $c)
}
function Find-Button($w, $pattern, $avoid) {
  $all = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $hits = @()
  foreach ($e in $all) {
    try {
      $n = $e.Current.Name
      if (-not $n -or $n -notmatch $pattern -or ($avoid -and $n -match $avoid)) { continue }
      if ($e.Current.IsOffscreen) { continue }
      $hits += $e
    } catch {}
  }
  return $hits
}
function Press($e) {
  $p = $null
  if ($e.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) { $p.Invoke(); return $true }
  if ($e.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) { $p.Select(); return $true }
  return $false
}
$w = $null
while (-not $w -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 700; $w = Find-Win }
if (-not $w) { 'nowindow'; exit }
try { $w.SetFocus() } catch {}
$step = 'consoles'
while ((Get-Date) -lt $deadline) {
  # Final button first, in case the consoles panel is already open.
  $play = Find-Button $w '(?i)remote play on this device|play remotely|^remote play$' '(?i)set ?up|learn|settings|turn on'
  if ($play.Count -eq 1) { if (Press $play[0]) { 'started'; exit } }
  if ($play.Count -gt 1) { 'many'; exit }
  if ($step -eq 'consoles') {
    $c = Find-Button $w '(?i)^(my )?consoles?$|your consoles|console streaming|remote play' '(?i)set ?up|learn|settings|on this device'
    if ($c.Count -ge 1 -and (Press $c[0])) { $step = 'wait' }
  }
  Start-Sleep -Milliseconds 800
}
'notfound'
`;

async function openXboxAppAndConnect() {
  try {
    const out = String(await runPowerShell(XBOX_APP_SCRIPT, 60000)).trim().split(/\r?\n/).pop();
    if (out === 'started') return { ok: true, message: 'Starting remote play in the Xbox app' };
    if (out === 'many') return { ok: true, message: 'You have more than one console. Pick one in the Xbox app.' };
    if (out === 'nowindow') return { error: 'The Xbox app did not open.' };
    return { ok: true, message: 'Xbox app opened, but its remote play button was not found. Pick your console there.' };
  } catch (e) {
    return { error: `Could not control the Xbox app: ${e.message}` };
  }
}

module.exports = { openRemotePlayWindow, openXboxAppAndConnect };
