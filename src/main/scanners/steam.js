const path = require('path');
const { parseVdf } = require('../vdf');
const { fsp, listDir, exists } = require('../util');

const SKIP_IDS = new Set(['228980']); // Steamworks Common Redistributables
const SKIP_NAME = /^(steamworks common|steam linux runtime|proton\b|steamvr performance test)/i;
// Steam "games" that are really tools; these go to Apps instead.
const TOOL_NAME = /wallpaper engine|soundpad|blender|aseprite|krita|obs studio|vtube studio|lossless scaling|spacedesk|virtual desktop|voicemod|fps monitor|rpg maker|game ?maker|steamvr$/i;

async function findSteamPath(registry) {
  const cands = [registry.steamPath, registry.steamPath2, 'C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];
  for (const c of cands) {
    if (c && (await exists(path.join(path.normalize(c), 'steamapps')))) return path.normalize(c);
  }
  return null;
}

async function scanSteam(ctx) {
  const steamPath = await findSteamPath(ctx.registry || {});
  if (!steamPath) return [];
  const libs = new Set([steamPath.toLowerCase()]);
  const libList = [steamPath];
  try {
    const data = parseVdf(await fsp.readFile(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8'));
    const root = data.libraryfolders || {};
    for (const [k, v] of Object.entries(root)) {
      const p = typeof v === 'object' ? v.path : /^\d+$/.test(k) ? v : null;
      if (p && !libs.has(path.normalize(p).toLowerCase())) {
        libs.add(path.normalize(p).toLowerCase());
        libList.push(path.normalize(p));
      }
    }
  } catch {}

  const out = [];
  const seen = new Set();
  for (const lib of libList) {
    const appsDir = path.join(lib, 'steamapps');
    for (const ent of await listDir(appsDir)) {
      if (!/^appmanifest_\d+\.acf$/i.test(ent.name)) continue;
      let st;
      try { st = parseVdf(await fsp.readFile(path.join(appsDir, ent.name), 'utf8')).appstate; } catch { continue; }
      if (!st || !st.appid || seen.has(st.appid)) continue;
      const name = st.name || `Steam app ${st.appid}`;
      if (SKIP_IDS.has(st.appid) || SKIP_NAME.test(name)) continue;
      seen.add(st.appid);
      const isTool = TOOL_NAME.test(name);
      out.push({
        id: `steam:${st.appid}`,
        source: 'steam',
        kind: isTool ? 'app' : 'game',
        name,
        steamAppId: st.appid,
        launch: { type: 'url', target: `steam://rungameid/${st.appid}` },
        installDir: st.installdir ? path.join(appsDir, 'common', st.installdir) : null,
        meta: { steamPath, ...(Number(st.sizeondisk) ? { sizeBytes: Number(st.sizeondisk), sizeFromLauncher: true } : {}) },
        defaultCategory: isTool ? null : 'Games',
      });
    }
  }
  return out;
}

module.exports = { scanSteam, findSteamPath };
