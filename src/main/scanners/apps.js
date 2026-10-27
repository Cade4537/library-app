// Finds regular Windows apps from Start Menu and Desktop shortcuts, plus Microsoft Store apps.
const path = require('path');
const os = require('os');
const { listDir, exists, hash, runPowerShellJson, asArray } = require('../util');
const { categorize } = require('../categorize');

const SKIP_DIRS = /^(accessibility|accessories|administrative tools|windows powershell|windows system|system tools|maintenance|startup|windows accessories|windows ease of access|windows administrative tools|windows tools)$/i;
const JUNK_NAME = /(uninstall|readme|read me|\bhelp\b|documentation|\bmanual\b|website|web site|release notes|changelog|license|\bfaq\b|on the web|repair|\bsetup\b|installer|crash ?report|bug ?report|safe mode|\bdebug\b|\bsdk\b|benchmark|reset settings|what'?s new|user guide|getting started)/i;
const JUNK_TARGET = /(unins\d*\.exe|uninstall|setup\.exe|installer|crashreport|helper\.exe)$/i;

async function walk(dir, depth, files, rel = '') {
  for (const e of await listDir(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0 && !SKIP_DIRS.test(e.name)) await walk(full, depth - 1, files, rel ? path.join(rel, e.name) : e.name);
    } else if (/\.lnk$/i.test(e.name)) {
      files.push({ lnk: full, folder: rel });
    }
  }
}

async function scanShortcuts(ctx, gameDirs) {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const roots = [
    [path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), 3],
    [path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), 3],
    ...ctx.desktopDirs.map((d) => [d, 0]),
  ];
  const files = [];
  for (const [r, depth] of roots) await walk(r, depth, files);

  const out = [];
  const seen = new Set();
  for (const { lnk, folder } of files) {
    const name = path.basename(lnk, path.extname(lnk));
    if (JUNK_NAME.test(name)) continue;
    let info = {};
    try { info = ctx.readShortcut(lnk) || {}; } catch { info = {}; }
    const target = info.target || '';
    if (target) {
      if (!/\.exe$/i.test(target)) continue; // folders, documents, web links
      if (JUNK_TARGET.test(target)) continue;
      if (/\\electron\.exe$/i.test(target) || target.toLowerCase() === process.execPath.toLowerCase()) continue;
      const low = target.toLowerCase();
      if (gameDirs.some((d) => low.startsWith(d))) continue; // game already found by a launcher
      if (!(await exists(target))) continue;
    }
    const key = target ? `${target}|${info.args || ''}`.toLowerCase() : `lnk|${name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const exeName = target ? path.basename(target, '.exe') : '';
    const cat = categorize(name, exeName);
    out.push({
      id: `app:${hash(key)}`,
      source: 'app',
      kind: cat === 'Games' ? 'game' : 'app',
      name,
      launch: { type: 'path', target: lnk },
      installDir: target ? path.dirname(target) : null,
      iconPath: target || lnk,
      meta: { folder, target },
      defaultCategory: cat,
    });
  }
  return out;
}

const STORE_SKIP = /^(windows\.immersivecontrolpanel|Microsoft\.Windows\.|MicrosoftWindows\.|Microsoft\.GetHelp|Microsoft\.Getstarted|Microsoft\.WindowsFeedbackHub|Microsoft\.549981C3F5F10|Microsoft\.MixedReality|MicrosoftCorporationII\.QuickAssist|Microsoft\.BingNews|Microsoft\.BingWeather|Microsoft\.BingSearch|Microsoft\.WindowsMaps|Microsoft\.People|Microsoft\.YourPhone|Microsoft\.Windows\.DevHome|Microsoft\.OutlookForWindows|Microsoft\.MicrosoftOfficeHub|Microsoft\.WidgetsPlatformRuntime|Microsoft\.ScreenSketch|Microsoft\.WindowsAlarms|Microsoft\.WindowsSoundRecorder|Microsoft\.WindowsCamera|MicrosoftCorporationII\.MicrosoftFamily|Microsoft\.Copilot|Microsoft\.Edge\.GameAssist)/i;

async function scanStoreApps(xboxPfns) {
  const res = await runPowerShellJson('ConvertTo-Json -InputObject @(Get-StartApps | Select-Object Name,AppID) -Compress', 45000);
  if (res === null) return null;
  const out = [];
  for (const a of asArray(res)) {
    if (!a || !a.AppID || !a.AppID.includes('!')) continue; // desktop apps come from shortcuts instead
    if (STORE_SKIP.test(a.AppID)) continue;
    const pfn = a.AppID.split('!')[0];
    if (xboxPfns.has(pfn)) continue;
    if (JUNK_NAME.test(a.Name)) continue;
    const cat = categorize(a.Name);
    out.push({
      id: `msstore:${a.AppID}`,
      source: 'msstore',
      kind: cat === 'Games' ? 'game' : 'app',
      name: a.Name,
      launch: { type: 'aumid', target: a.AppID },
      defaultCategory: cat,
    });
  }
  return out;
}

module.exports = { scanShortcuts, scanStoreApps };
