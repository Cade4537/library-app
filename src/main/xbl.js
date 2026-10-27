// OpenXBL (xbl.io): a free service that gives Xbox profile, friends, presence, games and achievements.
const BASE = 'https://xbl.io/api/v2';

async function xbl(key, path) {
  const res = await fetch(BASE + path, {
    headers: { 'X-Authorization': key, Accept: 'application/json', 'Accept-Language': 'en-US' },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('OpenXBL rejected the API key');
  if (res.status === 429) throw new Error('OpenXBL rate limit reached, try again later');
  if (!res.ok) throw new Error(`OpenXBL error ${res.status}`);
  return res.json();
}

async function xblAccount(key) {
  const j = await xbl(key, '/account');
  const u = (j.profileUsers && j.profileUsers[0]) || {};
  const setting = (id) => ((u.settings || []).find((s) => s.id === id) || {}).value;
  return { xuid: u.id, gamertag: setting('Gamertag') || setting('ModernGamertag') || '', avatar: setting('GameDisplayPicRaw') || '' };
}

module.exports = { xbl, xblAccount };
