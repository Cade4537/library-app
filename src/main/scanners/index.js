const path = require('path');
const { runPowerShellJson } = require('../util');
const { scanSteam } = require('./steam');
const { scanEpic } = require('./epic');
const { scanGog, scanUbisoft, scanRockstar } = require('./registryLaunchers');
const { scanXbox } = require('./xbox');
const { scanRiot } = require('./riot');
const { scanCurseForge } = require('./curseforge');
const { scanShortcuts, scanStoreApps } = require('./apps');
const { applySuites } = require('../suites');

// One PowerShell call that reads every registry key the scanners need.
const REGISTRY_SCRIPT = `
function Tree($p) {
  $r = @{}
  Get-ChildItem -Path ("Registry::" + $p) | ForEach-Object {
    $o = @{}
    $props = Get-ItemProperty -Path $_.PSPath
    if ($props) { $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $o[$_.Name] = [string]$_.Value } }
    $r[$_.PSChildName] = $o
  }
  return $r
}
function Val($p, $n) { try { return [string](Get-ItemPropertyValue -Path ("Registry::" + $p) -Name $n) } catch { return $null } }
$res = @{
  steamPath = (Val 'HKCU\\Software\\Valve\\Steam' 'SteamPath')
  steamPath2 = (Val 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam' 'InstallPath')
  gog = (Tree 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games')
  ubisoft = (Tree 'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs')
  rockstar = (Tree 'HKLM\\SOFTWARE\\WOW6432Node\\Rockstar Games')
  uplayNames = @{}
}
Get-ChildItem 'Registry::HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall' | Where-Object { $_.PSChildName -like 'Uplay Install *' } | ForEach-Object {
  $res.uplayNames[$_.PSChildName.Substring(14)] = [string](Get-ItemProperty -Path $_.PSPath).DisplayName
}
$res | ConvertTo-Json -Compress -Depth 5
`;

async function scanAll(ctx) {
  const registry = await runPowerShellJson(REGISTRY_SCRIPT, 45000);
  ctx.registry = registry || {};
  ctx.registryOk = !!registry;

  const gameScanners = {
    steam: scanSteam,
    epic: scanEpic,
    gog: scanGog,
    ubisoft: scanUbisoft,
    xbox: scanXbox,
    rockstar: scanRockstar,
    riot: scanRiot,
    curseforge: scanCurseForge,
  };

  const entries = [];
  const sources = new Set();
  const counts = {};
  const errors = [];

  const results = await Promise.all(
    Object.entries(gameScanners).map(async ([k, fn]) => {
      try { return [k, await fn(ctx)]; } catch (e) { errors.push(`${k}: ${e.message}`); return [k, null]; }
    })
  );
  for (const [k, list] of results) {
    if (list === null) continue; // scanner could not run, keep old entries as they are
    sources.add(k);
    counts[k] = list.length;
    entries.push(...list);
  }

  const gameDirs = entries
    .map((e) => e.installDir)
    .filter((d) => d && d.length > 4)
    .map((d) => path.normalize(d).toLowerCase().replace(/[\\/]*$/, path.sep));

  if (ctx.settings.includeApps !== false) {
    try {
      const shortcuts = applySuites(await scanShortcuts(ctx, gameDirs));
      sources.add('app');
      counts.app = shortcuts.length;
      entries.push(...shortcuts);
    } catch (e) { errors.push(`apps: ${e.message}`); }
    try {
      const xboxPfns = new Set(entries.filter((e) => e.source === 'xbox').map((e) => e.meta.pfn));
      const store = await scanStoreApps(xboxPfns);
      if (store !== null) {
        sources.add('msstore');
        counts.msstore = store.length;
        entries.push(...store);
      }
    } catch (e) { errors.push(`store apps: ${e.message}`); }
  } else {
    sources.add('app');
    sources.add('msstore');
  }

  return { entries, sources, counts, errors };
}

module.exports = { scanAll };
