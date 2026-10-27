// Reads every game on the Steam account (installed or not) through the Steam Web API.
// Needs a free Web API key. The SteamID is read from the local Steam login if not given.
const path = require('path');
const { parseVdf } = require('../vdf');
const { fsp } = require('../util');
const { findSteamPath } = require('../scanners/steam');

async function detectSteamId(registry) {
  const steamPath = await findSteamPath(registry || {});
  if (!steamPath) return null;
  try {
    const users = parseVdf(await fsp.readFile(path.join(steamPath, 'config', 'loginusers.vdf'), 'utf8')).users || {};
    const ids = Object.keys(users).filter((k) => /^\d{17}$/.test(k));
    const recent = ids.find((k) => users[k].mostrecent === '1');
    return recent || ids[0] || null;
  } catch {
    return null;
  }
}

async function api(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (res.status === 401 || res.status === 403) throw new Error('Steam rejected the Web API key');
  if (!res.ok) throw new Error(`Steam API error ${res.status}`);
  return res.json();
}

// Accepts a 17 digit SteamID, a profile URL, or a custom URL name.
async function resolveSteamId(input, key) {
  const v = String(input || '').trim();
  if (!v) return null;
  const m = v.match(/(\d{17})/);
  if (m) return m[1];
  const vanity = (v.match(/steamcommunity\.com\/id\/([^/?#]+)/i) || [])[1] || v;
  const j = await api(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(vanity)}`);
  return j.response && j.response.success === 1 ? j.response.steamid : null;
}

async function scanSteamOwned(ctx) {
  const key = String(ctx.settings.steamApiKey || '').trim();
  if (!key) return { skipped: true };
  let steamId = await resolveSteamId(ctx.settings.steamId, key);
  if (!steamId) steamId = await detectSteamId(ctx.registry);
  if (!steamId) throw new Error('Could not find your SteamID. Add it in Settings.');
  const j = await api(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`
  );
  const games = (j.response && j.response.games) || [];
  if (!games.length && !(j.response && 'game_count' in j.response)) {
    throw new Error('Steam returned no games. Set Game details to Public in your Steam privacy settings.');
  }
  return {
    steamId,
    entries: games.map((g) => ({
      id: `steam:${g.appid}`,
      source: 'steam',
      name: g.name || `Steam app ${g.appid}`,
      steamAppId: String(g.appid),
      launch: { type: 'url', target: `steam://install/${g.appid}` },
      lastPlayed: g.rtime_last_played ? g.rtime_last_played * 1000 : 0,
      meta: { playtime: g.playtime_forever || 0 },
    })),
  };
}

module.exports = { scanSteamOwned, detectSteamId };
