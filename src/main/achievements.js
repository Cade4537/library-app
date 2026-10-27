// Achievements for the details view: Steam (Web API key), Xbox (sign in or OpenXBL) and Epic (sign in).

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

async function xboxAchievements(xbox, titleId) {
  if (!xbox || !xbox.configured) return { error: 'Sign in to Xbox in Settings to see Xbox achievements.' };
  const j = await xbox.achievements(titleId);
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

// Epic: the same GraphQL service the Epic store's achievement pages use. Definitions are public;
// your unlocks are read with your Epic sign in.
const EPIC_GQL = ['https://launcher.store.epicgames.com/graphql', 'https://graphql.epicgames.com/ue/graphql'];
const EPIC_UA = 'EpicGamesLauncher/14.0.8-22004686+++Portal+Release-Live';
const Q_DEFS = `query Achievement($sandboxId: String!, $locale: String!) { Achievement { productAchievementsRecordBySandbox(sandboxId: $sandboxId, locale: $locale) { totalAchievements achievements { achievement { name hidden unlockedDisplayName lockedDisplayName unlockedDescription lockedDescription unlockedIconLink lockedIconLink XP rarity { percent } } } } } }`;
const Q_PLAYER = `query PlayerAchievement($epicAccountId: String!, $sandboxId: String!) { PlayerAchievement { playerAchievementGameRecordsBySandbox(epicAccountId: $epicAccountId, sandboxId: $sandboxId) { records { playerAchievements { playerAchievement { achievementName unlocked unlockDate } } } } } }`;
const DEFS_HASH = '7d54399ad8b8b5538bc2d93ee66b07014432b5488945cda35fe0b1fc70eea83a';

async function gql(body, token) {
  // The store's launcher endpoint answers player data for the launcher's own token; fall back to the older one.
  let last;
  for (const url of EPIC_GQL) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': EPIC_UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.data || (Array.isArray(j.errors) && j.errors.length)) throw new Error(`Epic achievements error ${res.status}${j && j.errors && j.errors[0] ? `: ${j.errors[0].message}` : ''}`);
      return j.data;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

async function epicAchievements(epic, it) {
  if (!epic || !epic.connected) return { error: 'Sign in to Epic in Settings to see Epic achievements.' };
  const sandboxId = it.meta && it.meta.epicNamespace;
  if (!sandboxId) return { error: 'Rescan once so the app learns this game\'s Epic ID.' };
  const token = await epic.token().catch(() => null);
  let defsData;
  try {
    defsData = await gql({ operationName: 'Achievement', query: Q_DEFS, variables: { sandboxId, locale: 'en' } }, token);
  } catch {
    defsData = await gql({ operationName: 'Achievement', variables: { sandboxId, locale: 'en' }, extensions: { persistedQuery: { version: 1, sha256Hash: DEFS_HASH } } });
  }
  const rec = defsData && defsData.Achievement && defsData.Achievement.productAchievementsRecordBySandbox;
  const defs = ((rec && rec.achievements) || []).map((a) => a.achievement).filter(Boolean);
  if (!defs.length) return { none: true };
  const got = new Map();
  let playerError = null;
  try {
    const p = await gql({ operationName: 'PlayerAchievement', query: Q_PLAYER, variables: { epicAccountId: epic.accountId, sandboxId } }, token);
    const records = (p && p.PlayerAchievement && p.PlayerAchievement.playerAchievementGameRecordsBySandbox && p.PlayerAchievement.playerAchievementGameRecordsBySandbox.records) || [];
    for (const r of records) for (const pa of r.playerAchievements || []) {
      const a = pa.playerAchievement;
      if (!a || !a.achievementName) continue;
      const prev = got.get(a.achievementName);
      if (!prev || !prev.unlocked) got.set(a.achievementName, a); // the same achievement can repeat; keep the unlocked one
    }
  } catch (e) {
    console.warn('[epic achievements]', e.message);
    playerError = 'Could not read your Epic unlocks right now, showing the full list.';
  }
  const list = defs.map((d) => {
    const g = got.get(d.name);
    const unlocked = !!(g && g.unlocked);
    return {
      name: unlocked || !d.hidden ? d.unlockedDisplayName || d.lockedDisplayName || d.name : d.lockedDisplayName || 'Hidden achievement',
      description: unlocked ? d.unlockedDescription : d.lockedDescription || (d.hidden ? 'Hidden achievement' : d.unlockedDescription),
      icon: unlocked ? d.unlockedIconLink : d.lockedIconLink || d.unlockedIconLink,
      unlocked,
      unlockTime: unlocked && g.unlockDate ? Date.parse(g.unlockDate) || 0 : 0,
      xp: Number(d.XP) || 0,
      rarity: d.rarity && d.rarity.percent,
    };
  });
  return playerError ? { list, notice: playerError } : { list };
}

async function getAchievements(store, it, steamId, xbox, epic) {
  const k = it.id;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let v;
  try {
    if (it.source === 'xbox' && it.meta && it.meta.xboxTitleId) v = await xboxAchievements(xbox, it.meta.xboxTitleId);
    else if (it.source === 'epic') v = await epicAchievements(epic, it);
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
  // Drop old entries so the cache stays small however many games you open.
  for (const [key, e] of cache) if (Date.now() - e.t > 10 * 60 * 1000 || cache.size > 60) cache.delete(key); else break;
  return v;
}

module.exports = { getAchievements };
