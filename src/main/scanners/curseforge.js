const path = require('path');
const os = require('os');
const { readJson, listDir, exists, hash } = require('../util');

async function findCurseForgeExe() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const cands = [
    path.join(local, 'Programs', 'CurseForge Windows', 'CurseForge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'CurseForge Windows', 'CurseForge.exe'),
  ];
  for (const c of cands) if (await exists(c)) return c;
  return null;
}

async function scanCurseForge(ctx) {
  const home = os.homedir();
  const dirs = [
    ctx.settings.curseforgeInstancesPath,
    path.join(home, 'curseforge', 'minecraft', 'Instances'),
    path.join(home, 'Documents', 'Curse', 'Minecraft', 'Instances'),
  ].filter(Boolean);
  const exe = await findCurseForgeExe();
  const launch = exe ? { type: 'exe', target: exe } : { type: 'url', target: 'curseforge://' };
  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    for (const e of await listDir(dir)) {
      if (!e.isDirectory()) continue;
      const instDir = path.join(dir, e.name);
      const key = instDir.toLowerCase();
      if (seen.has(key)) continue;
      const info = await readJson(path.join(instDir, 'minecraftinstance.json'));
      if (!info) continue;
      seen.add(key);
      const loader = info.baseModLoader && info.baseModLoader.name;
      let coverHint = null;
      if (info.profileImagePath && (await exists(info.profileImagePath))) coverHint = info.profileImagePath;
      else if (info.installedModpack && info.installedModpack.thumbnailUrl) coverHint = info.installedModpack.thumbnailUrl;
      out.push({
        id: `curseforge:${hash(key)}`,
        source: 'curseforge',
        kind: 'game',
        name: info.name || e.name,
        launch,
        installDir: instDir,
        coverHint,
        coverHintFit: 'contain',
        meta: { gameVersion: info.gameVersion, loader },
        defaultCategory: 'Games/Minecraft Modpacks',
      });
    }
  }
  return out;
}

module.exports = { scanCurseForge };
