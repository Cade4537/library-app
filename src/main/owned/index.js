const { scanSteamOwned } = require('./steam');
const { scanGogOwned } = require('./gog');

// Returns games from account libraries. A source only counts as read if it succeeded,
// so a failed lookup never marks games as no longer owned.
async function scanOwned(ctx) {
  const owned = [];
  const ownedSources = new Set();
  const counts = {};
  const errors = [];
  const run = async (name, fn) => {
    try {
      const r = await fn(ctx);
      if (!r || r.skipped) return;
      ownedSources.add(name);
      owned.push(...r.entries);
      counts[name] = r.entries.length;
      if (r.steamId) ctx.detectedSteamId = r.steamId;
    } catch (e) {
      errors.push(`${name === 'steam' ? 'Steam' : 'GOG'}: ${e.message}`);
    }
  };
  await Promise.all([run('steam', scanSteamOwned), run('gog', scanGogOwned)]);
  return { owned, ownedSources, counts, errors };
}

module.exports = { scanOwned };
