const { runPowerShellJson, asArray } = require('../util');

// Xbox app / Game Pass games are Store packages that ship a MicrosoftGame.config.
const SCRIPT = `
$out = @()
Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.SignatureKind -eq 'Store' -and $_.InstallLocation } | ForEach-Object {
  $pkg = $_
  $cfgPath = Join-Path $pkg.InstallLocation 'MicrosoftGame.config'
  if (Test-Path -LiteralPath $cfgPath) {
    $man = Get-AppxPackageManifest $pkg
    $app = @($man.Package.Applications.Application)[0]
    $name = $null
    try { $cfg = [xml](Get-Content -LiteralPath $cfgPath -Raw); $name = $cfg.Game.ShellVisuals.DefaultDisplayName } catch {}
    if (-not $name -or $name -like 'ms-resource*') { $name = $man.Package.Properties.DisplayName }
    if (-not $name -or $name -like 'ms-resource*') { $name = $pkg.Name }
    $out += [pscustomobject]@{ pfn = $pkg.PackageFamilyName; appId = $app.Id; name = [string]$name; loc = $pkg.InstallLocation }
  }
}
ConvertTo-Json -InputObject @($out) -Compress
`;

async function scanXbox() {
  const res = await runPowerShellJson(SCRIPT, 90000);
  if (res === null) return null;
  return asArray(res)
    .filter((g) => g && g.pfn && g.appId)
    .map((g) => ({
      id: `xbox:${g.pfn}`,
      source: 'xbox',
      kind: 'game',
      name: g.name,
      launch: { type: 'aumid', target: `${g.pfn}!${g.appId}` },
      installDir: g.loc,
      meta: { pfn: g.pfn },
      defaultCategory: 'Games',
    }));
}

module.exports = { scanXbox };
