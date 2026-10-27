// Every game on the signed-in Epic account (installed or not).
const { epicAccess } = require('../auth');

async function get(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Epic error ${res.status}`);
  return res.json();
}

async function scanEpicOwned(ctx) {
  const auth = ctx.settings.epicAuth;
  if (!auth || !auth.refreshToken) return { skipped: true };
  const { accessToken, auth: next } = await epicAccess(auth);
  ctx.saveSetting('epicAuth', next);

  const records = [];
  let cursor = '';
  for (let page = 0; page < 30; page++) {
    const j = await get(`https://library-service.live.use1a.on.epicgames.com/library/api/public/items?includeMetadata=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, accessToken);
    records.push(...(j.records || []));
    cursor = j.responseMetadata && j.responseMetadata.nextCursor;
    if (!cursor) break;
  }

  const games = records.filter((r) => r.namespace && r.catalogItemId && r.appName && r.namespace !== 'ue' && r.sandboxType !== 'PRIVATE');
  const out = [];
  // Look up titles and cover art a few at a time.
  for (let i = 0; i < games.length; i += 8) {
    const batch = games.slice(i, i + 8);
    const infos = await Promise.all(batch.map(async (r) => {
      try {
        const j = await get(`https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${encodeURIComponent(r.namespace)}/bulk/items?id=${encodeURIComponent(r.catalogItemId)}&includeDLCDetails=true&includeMainGameDetails=true&country=US&locale=en-US`, accessToken);
        return j[r.catalogItemId] || null;
      } catch {
        return null;
      }
    }));
    batch.forEach((r, k) => {
      const info = infos[k];
      if (!info || info.mainGameItem) return; // DLC
      const cats = (info.categories || []).map((c) => c.path);
      if (cats.includes('addons') || cats.includes('digitalextras') || (cats.length && !cats.includes('games') && !cats.includes('applications'))) return;
      const tall = (info.keyImages || []).find((x) => x.type === 'DieselGameBoxTall') || (info.keyImages || []).find((x) => x.type === 'OfferImageTall');
      out.push({
        id: `epic:${r.appName}`,
        source: 'epic',
        name: info.title || r.appName,
        launch: { type: 'url', target: `com.epicgames.launcher://apps/${encodeURIComponent(r.namespace)}%3A${encodeURIComponent(r.catalogItemId)}%3A${encodeURIComponent(r.appName)}?action=install` },
        coverHint: tall ? tall.url : null,
      });
    });
  }
  return { entries: out };
}

module.exports = { scanEpicOwned };
