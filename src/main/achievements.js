// Achievements for the details view: Steam (Web API key) and Xbox (OpenXBL).
const { xbl, xblAccount } = require('./xbl');

const cache = new Map();
const TTL = 10 * 60 * 1000;

async function steamJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const j = await res.json().catch(() => null);
  return { ok: res.ok, j };
}

async function steamAchievements(settings, steamId, appid) {
  const key = String(settings.steamApiKey || '').trim();
  if (!key) return { error: 'Add a Steam Web API key in Settings to see achievements.' };
  if (!steamId) return { error: 'Could not find your SteamID.' };
  const [player, schema] = await Promise.all([
    steamJson(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${key}&steamid=${steamId}&appid=${appid}&l=english`),
    steamJson(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${key}&appid=${appid}&l=english`),
  ]);
  const ps = player.j && player.j.playerstats;
  if (!ps || ps.success === false) {
    const msg = (ps && ps.error) || '';
    if (/no stats/i.test(msg)) return { none: true };
    if (/private/i.test(msg)) return { error: 'Your Steam profile is private. Set Game details to Public.' };
    return { none: true };
  }
  const defs = new Map(((schema.j && schema.j.game && schema.j.game.availableGameStats && schema.j.game.availableGameStats.achievements) || []).map((a) => [a.name, a]));
  const list = (ps.achievements || []).map((a) => {
    const d = defs.get(a.apiname) || {};
    return {
      name: a.name || d.displayName || a.apiname,
      description: a.description || d.description || (d.hidden ? 'Hidden achievement' : ''),
      icon: a.achieved ? d.icon : d.icongray || d.icon,
      unlocked: !!a.achieved,
      unlockTime: a.unlocktime ? a.unlocktime * 1000 : 0,
    };
  });
  return { list };
}

async function xboxAchievements(settings, store, titleId) {
  const key = String(settings.openXblKey || '').trim();
  if (!key) return { error: 'Add an OpenXBL key in Settings to see Xbox achievements.' };
  if (!store.data.settings.xboxXuid) {
    const acc = await xblAccount(key);
    store.data.settings.xboxXuid = acc.xuid;
    store.changed();
  }
  const j = await xbl(key, `/achievements/player/${store.data.settings.xboxXuid}/${titleId}`);
  const list = (j.achievements || []).map((a) => {
    const gs = (a.rewards || []).find((r) => /gamerscore/i.test(r.type));
    return {
      name: a.name,
      description: a.progressState === 'Achieved' ? a.description : a.lockedDescription || a.description,
      icon: ((a.mediaAssets || [])[0] || {}).url || null,
      unlocked: a.progressState === 'Achieved',
      unlockTime: a.progression && a.progression.timeUnlocked ? Date.parse(a.progression.timeUnlocked) || 0 : 0,
      gamerscore: gs ? Number(gs.value) || 0 : 0,
    };
  });
  return list.length ? { list } : { none: true };
}

async function getAchievements(store, it, steamId) {
  const k = it.id;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let v;
  try {
    if (it.source === 'xbox' && it.meta && it.meta.xboxTitleId) v = await xboxAchievements(store.data.settings, store, it.meta.xboxTitleId);
    else if (it.steamAppId) v = await steamAchievements(store.data.settings, steamId, it.steamAppId);
    else v = { unsupported: true };
  } catch (e) {
    v = { error: e.message };
  }
  if (v && v.list) {
    v.list.sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.unlockTime - a.unlockTime);
    v.have = v.list.filter((a) => a.unlocked).length;
    v.total = v.list.length;
    // Remember the summary so cards can show progress later.
    it.meta = it.meta || {};
    it.meta.achievements = { have: v.have, total: v.total };
    store.changed();
  }
  cache.set(k, { t: Date.now(), v });
  return v;
}

module.exports = { getAchievements };
