// Every game on the signed-in Epic account (installed or not).

async function scanEpicOwned(ctx) {
  const epic = ctx.epic;
  if (!epic || !epic.connected) return { skipped: true };
  const get = (url) => epic.get(url);

  const records = [];
  let cursor = '';
  for (let page = 0; page < 30; page++) {
    const j = await get(`https://library-service.live.use1a.on.epicgames.com/library/api/public/items?includeMetadata=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
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
        const j = await get(`https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${encodeURIComponent(r.namespace)}/bulk/items?id=${encodeURIComponent(r.catalogItemId)}&includeDLCDetails=true&includeMainGameDetails=true&country=US&locale=en-US`);
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
        meta: { epicNamespace: r.namespace },
      });
    });
  }
  // Hours played, as tracked by the Epic launcher.
  try {
    const pt = await get(`https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account/${epic.accountId}/all`);
    const mins = new Map((Array.isArray(pt) ? pt : []).map((p) => [p.artifactId, Math.round((Number(p.totalTime) || 0) / 60)]));
    for (const e of out) {
      const m = mins.get(e.id.slice(5));
      if (m) e.meta = { ...(e.meta || {}), epicMinutes: m };
    }
  } catch {}
  return { entries: out };
}

module.exports = { scanEpicOwned };
