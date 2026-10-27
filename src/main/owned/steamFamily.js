// Games shared with you through a Steam Family. Needs the Steam store sign-in in Settings.
const { steamStoreToken } = require('../auth');

async function api(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Steam Family error ${res.status}`);
  return res.json();
}

async function scanSteamFamily(ctx) {
  if (!ctx.settings.steamFamily) return { skipped: true };
  const token = await steamStoreToken().catch(() => null);
  if (!token) throw new Error('Steam Family sign in expired. Sign in again in Settings.');
  const fam = await api(`https://api.steampowered.com/IFamilyGroupsService/GetFamilyGroupForUser/v1/?access_token=${encodeURIComponent(token)}`);
  const groupId = fam.response && fam.response.family_groupid;
  if (!groupId) return { entries: [] };
  const steamId = ctx.detectedSteamId || '';
  const lib = await api(
    `https://api.steampowered.com/IFamilyGroupsService/GetSharedLibraryApps/v1/?access_token=${encodeURIComponent(token)}&family_groupid=${groupId}&include_own=false&include_excluded=false&include_free=false&include_non_games=false&language=english${steamId ? `&steamid=${steamId}` : ''}`
  );
  const apps = (lib.response && lib.response.apps) || [];
  return {
    entries: apps
      .filter((a) => a.appid && !(a.owner_steamids || []).includes(steamId) && !a.exclude_reason)
      .map((a) => ({
        id: `steam:${a.appid}`,
        source: 'steam',
        name: a.name || `Steam app ${a.appid}`,
        steamAppId: String(a.appid),
        launch: { type: 'url', target: `steam://install/${a.appid}` },
        meta: { family: true },
      })),
  };
}

module.exports = { scanSteamFamily };
