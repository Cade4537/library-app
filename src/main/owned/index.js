const { scanSteamOwned } = require('./steam');
const { scanGogOwned } = require('./gog');
const { scanEpicOwned } = require('./epic');
const { scanXboxOwned } = require('./xbox');
const { scanSteamFamily } = require('./steamFamily');
const { scanUbisoftOwned } = require('./ubisoft');

const LABELS = { steam: 'Steam', gog: 'GOG', epic: 'Epic', xbox: 'Xbox', family: 'Steam Family', ubisoft: 'Ubisoft' };

// Returns games from account libraries. A source only counts as read if it succeeded,
// so a failed lookup never marks games as no longer owned.
async function scanOwned(ctx) {
  const owned = [];
  const ownedSources = new Set();
  const counts = {};
  const errors = [];
  const run = async (name, fn, source = name) => {
    try {
      const r = await fn(ctx);
      if (!r || r.skipped) return;
      if (source) ownedSources.add(source);
      owned.push(...r.entries);
      counts[name] = r.entries.length;
      if (r.steamId) ctx.detectedSteamId = r.steamId;
    } catch (e) {
      errors.push(`${LABELS[name] || name}: ${e.message}`);
    }
  };
  await Promise.all([
    // Steam Family runs after Steam so it knows your SteamID. It does not decide ownership on its own.
    run('steam', scanSteamOwned).then(() => run('family', scanSteamFamily, null)),
    run('gog', scanGogOwned),
    run('epic', scanEpicOwned),
    run('xbox', scanXboxOwned),
    run('ubisoft', scanUbisoftOwned),
  ]);
  return { owned, ownedSources, counts, errors };
}

module.exports = { scanOwned, LABELS };
