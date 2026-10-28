// Web data for the Deals page and game news: your Steam wishlist with prices, Epic's free games,
// and Steam news for the games you play. All public Steam / Epic endpoints, cached so they are
// only asked every few hours.

const SIX_HOURS = 6 * 3600 * 1000;
const json = async (url, opts = {}) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// ---------- wishlist ----------
async function wishlistIds(steamId) {
  const j = await json(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${encodeURIComponent(steamId)}`);
  return ((j.response && j.response.items) || []).map((x) => ({ appid: x.appid, added: (x.date_added || 0) * 1000, priority: x.priority }));
}

// Names, art and prices for up to 50 apps at once.
async function storeItems(appids) {
  const out = new Map();
  for (let i = 0; i < appids.length; i += 50) {
    const ids = appids.slice(i, i + 50);
    const input = { ids: ids.map((appid) => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true, include_release: true } };
    try {
      const j = await json(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
      for (const it of (j.response && j.response.store_items) || []) {
        const p = it.best_purchase_option || {};
        out.set(it.appid, {
          name: it.name,
          final: p.final_price_in_cents != null ? Number(p.final_price_in_cents) / 100 : null,
          original: p.original_price_in_cents != null ? Number(p.original_price_in_cents) / 100 : p.final_price_in_cents != null ? Number(p.final_price_in_cents) / 100 : null,
          discount: p.discount_pct || 0,
          free: !!it.is_free,
          comingSoon: !!(it.release && it.release.is_coming_soon),
        });
      }
    } catch {}
  }
  return out;
}

async function wishlist(store, steamId) {
  if (!steamId) return { error: 'Add your SteamID in Settings > Steam to see your wishlist.' };
  const s = store.data;
  if (!s.wishPrices) s.wishPrices = {};
  let ids;
  try { ids = await wishlistIds(steamId); }
  catch { return { error: 'Could not read your Steam wishlist. Make sure your Steam profile and wishlist are public.' }; }
  const info = await storeItems(ids.map((x) => x.appid));
  const drops = [];
  const items = ids.map((x) => {
    const i = info.get(x.appid) || {};
    const rec = s.wishPrices[x.appid] || null; // { p: last price seen, low: lowest price seen }
    if (i.final != null && rec && rec.p != null && i.final < rec.p - 0.009) drops.push({ appid: x.appid, name: i.name, from: rec.p, to: i.final, discount: i.discount });
    const low = Math.min(rec && rec.low != null ? rec.low : Infinity, i.final != null ? i.final : Infinity);
    if (i.final != null) s.wishPrices[x.appid] = { p: i.final, low };
    return {
      appid: x.appid, name: i.name || `App ${x.appid}`, added: x.added, priority: x.priority,
      price: i.final, original: i.original, discount: i.discount || 0, free: i.free, comingSoon: i.comingSoon,
      img: `https://cdn.cloudflare.steamstatic.com/steam/apps/${x.appid}/header.jpg`,
      url: `https://store.steampowered.com/app/${x.appid}/`,
      low: Number.isFinite(low) ? low : null,
    };
  });
  return { items, drops, at: Date.now() };
}

// ---------- Epic free games ----------
async function epicFree() {
  const j = await json('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US');
  const els = (((j.data || {}).Catalog || {}).searchStore || {}).elements || [];
  const pick = (el, key) => {
    const groups = ((el.promotions || {})[key] || []).flatMap((g) => g.promotionalOffers || []);
    return groups.find((o) => o.discountSetting && o.discountSetting.discountPercentage === 0) || null;
  };
  const out = [];
  for (const el of els) {
    const now = pick(el, 'promotionalOffers');
    const soon = pick(el, 'upcomingPromotionalOffers');
    if (!now && !soon) continue;
    const img = (el.keyImages || []).find((k) => k.type === 'OfferImageWide') || (el.keyImages || []).find((k) => k.type === 'DieselStoreFrontWide') || (el.keyImages || [])[0];
    const slug = (el.catalogNs && el.catalogNs.mappings && el.catalogNs.mappings[0] && el.catalogNs.mappings[0].pageSlug) || el.productSlug || el.urlSlug;
    out.push({
      title: el.title, img: img ? img.url : null, now: !!now,
      start: Date.parse((now || soon).startDate) || 0, end: Date.parse((now || soon).endDate) || 0,
      url: slug ? `https://store.epicgames.com/p/${slug}` : 'https://store.epicgames.com/free-games',
    });
  }
  return out.sort((a, b) => (b.now - a.now) || a.start - b.start);
}

// ---------- Steam news ----------
async function steamNews(appid, count = 5) {
  const j = await json(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=${count}&maxlength=320&format=json`);
  return (((j.appnews || {}).newsitems) || []).map((n) => ({
    title: n.title, url: n.url, date: (n.date || 0) * 1000, feed: n.feedlabel || '', appid,
    text: String(n.contents || '').replace(/\[\/?[^\]]+\]/g, '').replace(/<[^>]+>/g, '').replace(/\{STEAM_CLAN_IMAGE\}\S*/g, '').replace(/\s+/g, ' ').trim(),
  }));
}

module.exports = { wishlist, epicFree, steamNews, SIX_HOURS };
