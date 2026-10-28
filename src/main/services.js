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

// Newer Steam games keep their art in hashed folders, so the old /apps/<id>/header.jpg link is
// missing for them. GetItems says where each picture really is; older links stay as a fallback.
const ASSET_BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/';
function assetUrls(it) {
  const a = it.assets || {};
  const fmt = a.asset_url_format;
  const out = [];
  if (fmt) for (const f of [a.header, a.main_capsule, a.small_capsule]) if (f) out.push(ASSET_BASE + fmt.replace('${FILENAME}', f));
  return out;
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
          imgs: assetUrls(it),
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
      imgs: [...(i.imgs || []), `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${x.appid}/header.jpg`, `https://cdn.cloudflare.steamstatic.com/steam/apps/${x.appid}/header.jpg`],
      img: (i.imgs && i.imgs[0]) || `https://cdn.cloudflare.steamstatic.com/steam/apps/${x.appid}/header.jpg`,
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
      title: el.title, store: 'epic', img: img ? img.url : null, now: !!now,
      start: Date.parse((now || soon).startDate) || 0, end: Date.parse((now || soon).endDate) || 0,
      url: slug ? `https://store.epicgames.com/p/${slug}` : 'https://store.epicgames.com/free-games',
    });
  }
  return out.sort((a, b) => (b.now - a.now) || a.start - b.start);
}

// ---------- Free to keep on Steam, GOG and Ubisoft ----------
// GOG's own catalog lists games marked down to $0. GamerPower (a public giveaway tracker) covers
// Steam, GOG and Ubisoft giveaways. Key giveaways run by other sites are left out.
async function gogFree() {
  const j = await json('https://catalog.gog.com/v1/catalog?limit=24&price=between:0,0&discounted=eq:true&productType=in:game,pack&order=desc:trending&countryCode=US&locale=en-US&currencyCode=USD');
  return (j.products || []).filter((p) => p.price && /-?100%/.test(String(p.price.discount || ''))).map((p) => ({
    title: p.title, store: 'gog', now: true, start: 0, end: 0, worth: p.price.base || null,
    img: p.coverHorizontal || p.coverVertical || null,
    url: p.storeLink || `https://www.gog.com/en/game/${p.slug}`,
  }));
}
async function giveaways() {
  const j = await json('https://www.gamerpower.com/api/filter?platform=steam.gog.ubisoft&type=game&sort-by=date');
  if (!Array.isArray(j)) return [];
  const out = [];
  for (const g of j) {
    if (g.status && !/active/i.test(g.status)) continue;
    if (/\bkeys?\b|alienware|prime gaming|keydrop|indiegala|fanatical/i.test(`${g.title} ${g.description || ''}`.slice(0, 400)) && !/free to keep/i.test(g.title)) continue;
    const plat = String(g.platforms || '').toLowerCase();
    const store = /steam/.test(plat) ? 'steam' : /gog/.test(plat) ? 'gog' : /ubisoft/.test(plat) ? 'ubisoft' : null;
    if (!store) continue;
    const end = Date.parse(String(g.end_date || '').replace(' ', 'T'));
    if (Number.isFinite(end) && end < Date.now()) continue;
    out.push({
      title: String(g.title || '').replace(/\s*\((steam|gog|ubisoft)[^)]*\)\s*|\s*giveaway$/gi, ' ').replace(/\s+/g, ' ').trim(),
      store, now: true, start: Date.parse(String(g.published_date || '').replace(' ', 'T')) || 0, end: Number.isFinite(end) ? end : 0,
      worth: g.worth && g.worth !== 'N/A' ? g.worth : null, img: g.image || g.thumbnail || null,
      url: g.open_giveaway_url || g.gamerpower_url,
    });
  }
  return out;
}
async function otherFree() {
  const [gog, rest] = await Promise.all([gogFree().catch(() => []), giveaways().catch(() => [])]);
  const seen = new Set();
  const key = (f) => `${f.store}:${f.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  return [...gog, ...rest].filter((f) => { const k = key(f); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---------- Steam news ----------
// Steam posts are BBCode or HTML. They become simple blocks (heading, paragraph, list item,
// picture, video link) so the app can show them without running any of the post's markup.
function decode(t) {
  return t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)));
}
function newsBlocks(raw) {
  let s = String(raw || '').replace(/\{STEAM_CLAN_IMAGE\}/g, 'https://clan.akamai.steamstatic.com/images').replace(/\r/g, '');
  s = s.replace(/\[img(?:\s+src=["']?([^"'\]\s]+)["']?[^\]]*)?\]([^\[]*)\[\/img\]/gi, (m, a, b) => `\n\u0001IMG ${(a || b || '').trim()}\n`);
  s = s.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (m, a) => `\n\u0001IMG ${a}\n`);
  s = s.replace(/\[previewyoutube=([\w-]+)[^\]]*\]\s*(\[\/previewyoutube\])?/gi, (m, id) => `\n\u0001VID https://www.youtube.com/watch?v=${id}\n`);
  s = s.replace(/\[h[1-6]\]([\s\S]*?)\[\/h[1-6]\]/gi, (m, t) => `\n\u0001H ${t.replace(/\n/g, ' ')}\n`);
  s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (m, t) => `\n\u0001H ${t.replace(/\n/g, ' ')}\n`);
  s = s.replace(/\[\*\]|<li[^>]*>/gi, '\n\u0001LI ');
  s = s.replace(/\[url=[^\]]*\]|\[\/url\]/gi, '');
  s = s.replace(/\[\/?(p|list|olist|ul|ol|table|tr)\]|<\/?(p|ul|ol|div|table|tr)[^>]*>|<br\s*\/?>|\[\/\*\]|<\/li>|\[hr\]\[\/hr\]|<hr[^>]*>/gi, '\n');
  s = s.replace(/\[\/?[a-z0-9]+(=[^\]]{0,200})?\]/gi, '').replace(/<[^>]+>/g, '');
  const blocks = [];
  for (const line0 of decode(s).split('\n')) {
    const line = line0.trim();
    if (!line) continue;
    if (line.startsWith('\u0001IMG ')) { const src = line.slice(5).trim(); if (/^https:\/\//.test(src)) blocks.push({ t: 'img', src }); }
    else if (line.startsWith('\u0001VID ')) blocks.push({ t: 'vid', url: line.slice(5).trim() });
    else if (line.startsWith('\u0001H ')) { const text = line.slice(3).trim(); if (text) blocks.push({ t: 'h', text }); }
    else if (line.startsWith('\u0001LI ')) { const text = line.slice(4).trim(); if (text) blocks.push({ t: 'li', text }); }
    else blocks.push({ t: 'p', text: line.replace(/\u0001/g, '') });
    if (blocks.length >= 150) break;
  }
  return blocks;
}

async function steamNews(appid, count = 5) {
  const j = await json(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=${count}&maxlength=0&format=json`);
  return (((j.appnews || {}).newsitems) || []).map((n) => {
    const blocks = newsBlocks(n.contents);
    const text = blocks.filter((b) => b.t === 'p' || b.t === 'li').map((b) => b.text).join(' ').slice(0, 320);
    const img = (blocks.find((b) => b.t === 'img') || {}).src || null;
    return { title: decode(String(n.title || '')), url: n.url, date: (n.date || 0) * 1000, feed: n.feedlabel || '', author: n.author || '', appid, gid: n.gid, text, img, blocks };
  });
}

module.exports = { wishlist, epicFree, otherFree, steamNews, newsBlocks, SIX_HOURS };
