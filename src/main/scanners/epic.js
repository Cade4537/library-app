const path = require('path');
const { listDir, readJson, exists } = require('../util');

async function scanEpic() {
  const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  const out = [];
  for (const e of await listDir(dir)) {
    if (!e.name.toLowerCase().endsWith('.item')) continue;
    const m = await readJson(path.join(dir, e.name));
    if (!m || !m.AppName || m.bIsIncompleteInstall) continue;
    if (m.MainGameAppName && m.MainGameAppName !== m.AppName) continue; // DLC
    if (/^UE_/i.test(m.AppName)) continue; // Unreal Engine installs
    const cats = (m.AppCategories || []).map((s) => String(s).toLowerCase());
    if (cats.includes('plugins') || cats.includes('engines')) continue;
    if (!m.InstallLocation || !(await exists(m.InstallLocation))) continue;
    const target =
      `com.epicgames.launcher://apps/${encodeURIComponent(m.CatalogNamespace || '')}%3A` +
      `${encodeURIComponent(m.CatalogItemId || '')}%3A${encodeURIComponent(m.AppName)}?action=launch&silent=true`;
    const isGame = !cats.length || cats.includes('games');
    out.push({
      id: `epic:${m.AppName}`,
      source: 'epic',
      kind: isGame ? 'game' : 'app',
      name: m.DisplayName || m.AppName,
      launch: { type: 'url', target },
      installDir: m.InstallLocation,
      iconPath: m.LaunchExecutable ? path.join(m.InstallLocation, m.LaunchExecutable) : null,
      meta: { epicNamespace: m.CatalogNamespace || null, ...(Number(m.InstallSize) ? { sizeBytes: Number(m.InstallSize), sizeFromLauncher: true } : {}) },
      defaultCategory: isGame ? 'Games' : null,
    });
  }
  return out;
}

module.exports = { scanEpic };
