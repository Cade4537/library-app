// GOG, Ubisoft Connect and Rockstar all record installs in the Windows registry.
const path = require('path');
const { exists, listDir, splitArgs } = require('../util');

async function scanGog(ctx) {
  if (!ctx.registryOk) return null;
  const out = [];
  for (const [key, g] of Object.entries(ctx.registry.gog || {})) {
    if (!g || !g.exe) continue;
    if (g.dependsOn && String(g.dependsOn).trim()) continue; // DLC
    if (!(await exists(g.exe))) continue;
    out.push({
      id: `gog:${g.gameID || key}`,
      source: 'gog',
      kind: 'game',
      name: g.gameName || g.startMenu || path.basename(g.path || g.exe),
      launch: { type: 'exe', target: g.exe, args: splitArgs(g.launchParam), cwd: g.workingDir || g.path || path.dirname(g.exe) },
      installDir: g.path || path.dirname(g.exe),
      iconPath: g.exe,
      defaultCategory: 'Games',
    });
  }
  return out;
}

async function scanUbisoft(ctx) {
  if (!ctx.registryOk) return null;
  const out = [];
  const names = ctx.registry.uplayNames || {};
  for (const [id, v] of Object.entries(ctx.registry.ubisoft || {})) {
    const dir = v && v.InstallDir;
    if (!dir || !(await exists(dir))) continue;
    out.push({
      id: `ubisoft:${id}`,
      source: 'ubisoft',
      kind: 'game',
      name: names[id] || path.basename(path.normalize(dir).replace(/[\\/]+$/, '')),
      launch: { type: 'url', target: `uplay://launch/${id}/0` },
      installDir: path.normalize(dir),
      defaultCategory: 'Games',
    });
  }
  return out;
}

// Picks the most likely game executable in a Rockstar install folder.
async function pickExe(dir) {
  const exes = (await listDir(dir)).filter((e) => e.isFile() && /\.exe$/i.test(e.name)).map((e) => e.name);
  const bad = /unins|setup|crash|report|launcher|redist|vc_|dxsetup|installer|social/i;
  const play = exes.find((x) => /^play.*\.exe$/i.test(x));
  if (play) return path.join(dir, play);
  const good = exes.filter((x) => !bad.test(x));
  return good.length ? path.join(dir, good[0]) : null;
}

async function scanRockstar(ctx) {
  if (!ctx.registryOk) return null;
  const out = [];
  for (const [title, v] of Object.entries(ctx.registry.rockstar || {})) {
    if (/launcher|social club/i.test(title)) continue;
    const dir = v && (v.InstallFolder || v.InstallFolderSteam || v.InstallFolderEpic);
    if (!dir || !(await exists(dir))) continue;
    // Steam/Epic copies of Rockstar games are already picked up by those scanners.
    if (/steamapps|epic games/i.test(dir)) continue;
    const exe = await pickExe(dir);
    if (!exe) continue;
    out.push({
      id: `rockstar:${title}`,
      source: 'rockstar',
      kind: 'game',
      name: title,
      launch: { type: 'exe', target: exe, cwd: dir },
      installDir: dir,
      iconPath: exe,
      defaultCategory: 'Games',
    });
  }
  return out;
}

module.exports = { scanGog, scanUbisoft, scanRockstar };
